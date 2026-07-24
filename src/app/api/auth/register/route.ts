import { NextRequest, NextResponse } from 'next/server';
import { prisma, withDbRetry } from '@/lib/prisma';
import { Role, DEFAULT_WORKING_HOURS } from '@/types';
import { Prisma } from '@prisma/client';
import { validateTelegramWebAppData } from '@/lib/telegramAuth';

export const dynamic = 'force-dynamic';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Verified identity for registration.
 * Production: derived only from signed Telegram initData.
 * Development: accepts unsigned body fields for local testing.
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
    const body = await req.json();
    const { role, phone } = body as { role: Role; phone?: string };

    if (role !== 'CLIENT' && role !== 'BARBER') {
      return NextResponse.json(
        { success: false, error: 'A valid role (CLIENT or BARBER) is required' },
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

    // Upsert user from the VERIFIED identity (name/username from Telegram, role from client).
    const user = await withDbRetry(() =>
      prisma.user.upsert({
        where: { telegramId: tId },
        update: { role, fullName, ...(phone !== undefined && { phone }), username },
        create: {
          telegramId: tId,
          fullName,
          username,
          phone: phone || null,
          role,
        },
      })
    );

    let barberProfileId: string | null = null;

    if (role === 'BARBER') {
      const existingProfile = await withDbRetry(() =>
        prisma.barberProfile.findUnique({ where: { userId: user.id } })
      );

      if (!existingProfile) {
        const newProfile = await withDbRetry(() =>
          prisma.barberProfile.create({
            data: {
              userId: user.id,
              shopName: fullName,
              bio: null,
              address: null,
              workingHours: DEFAULT_WORKING_HOURS as any,
            },
          })
        );
        barberProfileId = newProfile.id;
      } else {
        barberProfileId = existingProfile.id;
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        telegramId: user.telegramId.toString(),
        username: user.username,
        role: user.role,
        fullName: user.fullName,
        phone: user.phone,
        barberProfileId,
      },
    });
  } catch (err: any) {
    console.error('Registration API error:', err);
    const isInitError =
      err instanceof Prisma.PrismaClientInitializationError ||
      err?.name === 'PrismaClientInitializationError' ||
      err?.message === 'DATABASE_CONNECTION_ERROR';

    return NextResponse.json(
      {
        success: false,
        error: isInitError
          ? 'DATABASE_CONNECTION_ERROR'
          : err?.message || 'Failed to register user',
      },
      { status: 500 }
    );
  }
}
