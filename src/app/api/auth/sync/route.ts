import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { telegramId, fullName, username } = body as {
      telegramId: string | number;
      fullName?: string;
      username?: string;
    };

    if (!telegramId) {
      return NextResponse.json(
        { success: false, error: 'telegramId is required' },
        { status: 400 }
      );
    }

    const tId = BigInt(telegramId);

    // Look up existing user in DB
    const existingUser = await prisma.user.findUnique({
      where: { telegramId: tId },
      include: { barberProfile: true },
    });

    if (existingUser) {
      // Returning user — update name/username if changed
      if (fullName || username) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            ...(fullName && { fullName }),
            ...(username !== undefined && { username }),
          },
        });
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
  } catch (err) {
    console.error('Auth sync API error:', err);
    return NextResponse.json(
      { success: false, error: 'Auth sync failed' },
      { status: 500 }
    );
  }
}
