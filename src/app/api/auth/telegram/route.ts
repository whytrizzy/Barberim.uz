import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramWebAppData } from '@/lib/telegramAuth';
import { prisma } from '@/lib/prisma';
import { MOCK_BARBER_USER, MOCK_CLIENT_USER } from '@/lib/mockData';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { initData } = body;

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const telegramUser = validateTelegramWebAppData(initData, botToken);

    if (telegramUser) {
      // Query PostgreSQL DB for user by telegramId
      try {
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
              fullName: dbUser.fullName,
              phone: dbUser.phone,
              role: dbUser.role,
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
      } catch (dbErr) {
        console.warn('⚡ DB lookup error in telegram auth fallback');
      }
    }

    // Development / fallback user state
    return NextResponse.json({
      success: true,
      isNewUser: false,
      user: MOCK_BARBER_USER,
      isMock: true,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 400 });
  }
}
