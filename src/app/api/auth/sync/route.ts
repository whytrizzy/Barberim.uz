import { NextRequest, NextResponse } from 'next/server';
import { prisma, withDbRetry } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { validateTelegramWebAppData } from '@/lib/telegramAuth';
import { DEFAULT_WORKING_HOURS } from '@/types';

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
    if (!botToken) return { error: 'SERVER_NO_TOKEN' };
    const tgUser = validateTelegramWebAppData(body.initData, botToken);
    if (!tgUser) return { error: 'BAD_SIGNATURE' };
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

  return { error: 'NO_INITDATA' };
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
      const map: Record<string, { msg: string; status: number }> = {
        SERVER_NO_TOKEN: { msg: "Server sozlamasi xato: TELEGRAM_BOT_TOKEN yo'q. [server:no-token]", status: 500 },
        BAD_SIGNATURE: { msg: "Imzo tekshiruvdan o'tmadi — bot token noto'g'ri bo'lishi mumkin. [server:bad-signature]", status: 401 },
        NO_INITDATA: { msg: "Telegram ma'lumoti kelmadi. [server:no-initData]", status: 401 },
      };
      const e = map[identity.error] || { msg: identity.error, status: 401 };
      return NextResponse.json({ success: false, error: e.msg }, { status: e.status });
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
      // Surface the real Prisma error so we can pinpoint the cause:
      // P1001 = can't reach DB, P1000 = auth failed, "Tenant or user not found" = wrong pooler user.
      // Collapse Prisma's multi-line message; keep the informative tail (the real cause).
      let msg = String(dbErr?.message || 'unknown').replace(/\s+/g, ' ').trim();
      if (msg.length > 300) msg = msg.slice(-300);
      const detail = dbErr?.code ? `${dbErr.code}: ${msg}` : msg;
      return NextResponse.json(
        { success: false, error: `DB xato: ${detail}` },
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

      let barberProfileId = existingUser.barberProfile?.id || null;
      if (existingUser.role === 'BARBER' && !barberProfileId) {
        try {
          const newProfile = await withDbRetry(() =>
            prisma.barberProfile.create({
              data: {
                userId: existingUser.id,
                shopName: existingUser.fullName,
                bio: null,
                address: null,
                workingHours: DEFAULT_WORKING_HOURS as any,
              },
            })
          );
          barberProfileId = newProfile.id;
        } catch (err) {
          console.error('Failed to auto-create barber profile in sync:', err);
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
          barberProfileId,
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
