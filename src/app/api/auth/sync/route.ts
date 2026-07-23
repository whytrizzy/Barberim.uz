import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

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

    // Look up existing user in DB with try/catch safeguard for DB connection errors
    let existingUser = null;
    try {
      existingUser = await prisma.user.findUnique({
        where: { telegramId: tId },
        include: { barberProfile: true },
      });
    } catch (dbErr: any) {
      console.error('Database connection failed in auth sync:', dbErr);
      return NextResponse.json(
        {
          success: false,
          error: 'Database connection failed. Please check your Supabase connection.',
        },
        { status: 500 }
      );
    }

    if (existingUser) {
      // Returning user — update name/username if changed
      if (fullName || username) {
        try {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              ...(fullName && { fullName }),
              ...(username !== undefined && { username }),
            },
          });
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
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Server error occurred during auth sync',
      },
      { status: 500 }
    );
  }
}
