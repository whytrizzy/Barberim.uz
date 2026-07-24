import { NextRequest, NextResponse } from 'next/server';
import { prisma, withDbRetry } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { validateTelegramWebAppData } from '@/lib/telegramAuth';

export const dynamic = 'force-dynamic';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Resolves the caller's verified identity.
 * In production, identity MUST come from a valid, signed Telegram initData.
 * In development, an unsigned { telegramId, fullName, username } body is
 * accepted so the app can be tested locally outside Telegram.
 */
function resolveIdentity(body: any):
  | { telegramId: bigint; fullName: string; username: string | null }
  | { error: string } {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';

  if (body?.initData) {
    const tgUser = validateTelegramWebAppData(body.initData, botToken);
    if (!tgUser) return { error: 'INVALID_INITDATA' };
    const fullName = `${tgUser.first_name} ${tgUser.last_name || ''}`.trim();
    return {
      telegramId: BigInt(tgUser.id),
      fullName: fullName || 'Telegram User',
      username: tgUser.username || null,
    };
  }

  if (isDev && body?.telegramId) {
    return {
      telegramId: BigInt(body.telegramId),
      fullName: body.fullName || 'Dev User',
      username: body.username ?? null,
    };
  }

  return { error: 'UNAUTHENTICATED' };
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

    let identity;
    try {
      identity = resolveIdentity(body);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid identity data' },
        { status: 400 }
      );
    }

    if ('error' in identity) {
      return NextResponse.json(
        { success: false, error: 'Iltimos, ilovani Telegram orqali oching.' },
        { status: 401 }
      );
    }

    const { telegramId: tId, fullName, username } = identity;

    // Look up existing user (with cold-start retry).
    let existingUser = null;
    try {
      existingUser = await withDbRetry(() =>
        prisma.user.findUnique({
          where: { telegramId: tId },
          include: { barberProfile: true },
        })
      );
    } catch (dbErr: any) {
      console.error('Database connection error in auth sync after retry:', dbErr);
      const isTimeout = dbErr?.message === 'DATABASE_TIMEOUT';
      return NextResponse.json(
        { success: false, error: isTimeout ? 'DATABASE_TIMEOUT' : 'DATABASE_CONNECTION_ERROR' },
        { status: 500 }
      );
    }

    if (existingUser) {
      // Keep the display name / username fresh.
      if (fullName || username) {
        try {
          await withDbRetry(
            () =>
              prisma.user.update({
                where: { id: existingUser!.id },
                data: {
                  ...(fullName && { fullName }),
                  ...(username !== undefined && { username }),
                },
              }),
            5000,
            0
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

    // New, verified user — needs onboarding (role selection).
    return NextResponse.json({
      success: true,
      isNewUser: true,
      telegramUser: {
        telegramId: tId.toString(),
        fullName,
        username,
      },
    });
  } catch (err: any) {
    console.error('Unexpected Auth sync API error:', err);
    const isTimeout = err?.message === 'DATABASE_TIMEOUT';
    const isInitError =
      err instanceof Prisma.PrismaClientInitializationError ||
      err?.name === 'PrismaClientInitializationError' ||
      err?.message === 'DATABASE_CONNECTION_ERROR';

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
