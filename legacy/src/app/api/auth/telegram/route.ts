import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramWebAppData } from '@/lib/telegramAuth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { initData } = body;

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const telegramUser = validateTelegramWebAppData(initData, botToken);

    if (telegramUser) {
      // Query PostgreSQL DB for user by telegramId
      const dbUser = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramUser.id) },
        include: { barberProfile: true },
      });

      if (dbUser) {
        return NextResponse.json({
          success: true,
          isNewUser: false,
          user: {
            id: dbUser.id,
            telegramId: dbUser.telegramId.toString(),
            username: dbUser.username,
            fullName: dbUser.fullName,
            phone: dbUser.phone,
            role: dbUser.role,
            barberProfileId: dbUser.barberProfile?.id || null,
          },
        });
      }

      // First-time user: Needs Onboarding role selection
      return NextResponse.json({
        success: true,
        isNewUser: true,
        telegramUser: {
          id: telegramUser.id,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          username: telegramUser.username,
        },
      });
    }

    // No valid initData — return error (no mock fallback)
    return NextResponse.json(
      { success: false, error: 'Invalid or missing Telegram initData' },
      { status: 401 }
    );
  } catch (err) {
    console.error('Telegram auth error:', err);
    return NextResponse.json(
      { success: false, error: 'Auth failed' },
      { status: 400 }
    );
  }
}
