import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramWebAppData } from '@/lib/telegramAuth';
import { MOCK_BARBER_USER, MOCK_CLIENT_USER } from '@/lib/mockData';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { initData, mockRole } = body;

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const telegramUser = validateTelegramWebAppData(initData, botToken);

    if (telegramUser) {
      return NextResponse.json({
        success: true,
        user: {
          id: `tg-${telegramUser.id}`,
          telegramId: telegramUser.id.toString(),
          fullName: `${telegramUser.first_name} ${telegramUser.last_name || ''}`.trim(),
          role: mockRole || 'CLIENT',
        },
      });
    }

    const role = mockRole || 'BARBER';
    const fallbackUser = role === 'BARBER' ? MOCK_BARBER_USER : MOCK_CLIENT_USER;

    return NextResponse.json({
      success: true,
      user: fallbackUser,
      isMock: true,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 400 });
  }
}
