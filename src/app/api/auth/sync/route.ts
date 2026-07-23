import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * Executes a database query with a connection timeout and a 1-time retry mechanism
 * specifically targeting PrismaClientInitializationError / connection failures during cold starts.
 */
async function executeWithRetry<T>(
  queryFn: () => Promise<T>,
  timeoutMs: number = 10000,
  maxRetries: number = 1
): Promise<T> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    attempt++;
    try {
      const timeoutPromise = new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('DATABASE_TIMEOUT')), timeoutMs)
      );
      return await Promise.race([queryFn(), timeoutPromise]);
    } catch (err: any) {
      const isInitError =
        err instanceof Prisma.PrismaClientInitializationError ||
        err?.name === 'PrismaClientInitializationError' ||
        err?.code === 'P1001' || // Cannot reach database server
        err?.code === 'P1002' || // Database server timed out
        err?.message?.includes("Can't reach database server") ||
        err?.message?.includes('connection') ||
        err?.message === 'DATABASE_TIMEOUT';

      if (isInitError && attempt <= maxRetries) {
        console.warn(
          `⚠️ Prisma DB connection attempt ${attempt} failed (${err?.message}). Retrying once (attempt ${attempt + 1})...`
        );
        // Brief 400ms pause to allow DB pool / cold start connection to settle
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      throw err;
    }
  }
  throw new Error('DATABASE_CONNECTION_ERROR');
}

export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { telegramId, fullName, username } = body as {
      telegramId?: string | number;
      fullName?: string;
      username?: string;
    };

    if (!telegramId) {
      return NextResponse.json(
        { success: false, error: 'telegramId is required' },
        { status: 400 }
      );
    }

    let tId: bigint;
    try {
      tId = BigInt(telegramId);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid telegramId format' },
        { status: 400 }
      );
    }

    // Look up existing user in DB with retry safeguard
    let existingUser = null;
    try {
      existingUser = await executeWithRetry(() =>
        prisma.user.findUnique({
          where: { telegramId: tId },
          include: { barberProfile: true },
        })
      );
    } catch (dbErr: any) {
      console.error('Database connection error in auth sync after retry:', dbErr);
      const isTimeout = dbErr?.message === 'DATABASE_TIMEOUT';
      const isInitError =
        dbErr instanceof Prisma.PrismaClientInitializationError ||
        dbErr?.name === 'PrismaClientInitializationError' ||
        dbErr?.message === 'DATABASE_CONNECTION_ERROR';

      return NextResponse.json(
        {
          success: false,
          error: isTimeout
            ? 'DATABASE_TIMEOUT'
            : isInitError
            ? 'DATABASE_CONNECTION_ERROR'
            : 'Database connection error',
        },
        { status: 500 }
      );
    }

    if (existingUser) {
      // Returning user — update name/username if changed
      if (fullName || username) {
        try {
          await executeWithRetry(() =>
            prisma.user.update({
              where: { id: existingUser.id },
              data: {
                ...(fullName && { fullName }),
                ...(username !== undefined && { username }),
              },
            }),
            5000,
            0 // Don't retry non-critical update
          );
        } catch (updateErr) {
          console.warn('Non-fatal error updating user details in sync:', updateErr);
        }
      }

      return NextResponse.json({
        success: true,
        isNewUser: false,
        user: {
          id: existingUser.id,
          telegramId: existingUser.telegramId.toString(),
          username: existingUser.username,
          role: existingUser.role,
          fullName: fullName || existingUser.fullName,
          phone: existingUser.phone,
          barberProfileId: existingUser.barberProfile?.id || null,
        },
      });
    }

    // New user — needs onboarding
    return NextResponse.json({
      success: true,
      isNewUser: true,
      telegramUser: {
        telegramId: telegramId.toString(),
        fullName: fullName || 'New User',
        username: username || null,
      },
    });
  } catch (err: any) {
    console.error('Unexpected Auth sync API error:', err);
    const isTimeout = err?.message === 'DATABASE_TIMEOUT';
    const isInitError =
      err instanceof Prisma.PrismaClientInitializationError ||
      err?.name === 'PrismaClientInitializationError';

    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? 'DATABASE_TIMEOUT'
          : isInitError
          ? 'DATABASE_CONNECTION_ERROR'
          : err?.message || 'Server error occurred during auth sync',
      },
      { status: 500 }
    );
  }
}
