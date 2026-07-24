import { NextRequest } from 'next/server';
import { prisma, withDbRetry } from '@/lib/prisma';
import { validateTelegramWebAppData } from '@/lib/telegramAuth';
import { Role } from '@/types';

const isDev = process.env.NODE_ENV !== 'production';

export interface AuthedUser {
  id: string;
  telegramId: bigint;
  role: Role;
  fullName: string;
  phone: string | null;
  barberProfileId: string | null;
}

/**
 * Resolves the verified caller from the signed Telegram initData sent in the
 * `x-telegram-init-data` header (attached by the client apiFetch helper).
 * In development, an `x-dev-telegram-id` header is accepted for local testing.
 * Returns null when the caller is unauthenticated or unknown.
 *
 * IMPORTANT: never trust user/barber/client IDs from the request body or query
 * for identity — always use the object returned here.
 */
export async function getAuthUser(req: NextRequest): Promise<AuthedUser | null> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const initData = req.headers.get('x-telegram-init-data') || '';

  let telegramId: bigint | null = null;

  if (initData) {
    const tgUser = validateTelegramWebAppData(initData, botToken);
    if (tgUser) telegramId = BigInt(tgUser.id);
  } else if (isDev) {
    const devId = req.headers.get('x-dev-telegram-id');
    if (devId) {
      try {
        telegramId = BigInt(devId);
      } catch {
        telegramId = null;
      }
    }
  }

  if (telegramId === null) return null;

  const user = await withDbRetry(() =>
    prisma.user.findUnique({
      where: { telegramId },
      include: { barberProfile: true },
    })
  );

  if (!user) return null;

  return {
    id: user.id,
    telegramId: user.telegramId,
    role: user.role as Role,
    fullName: user.fullName,
    phone: user.phone,
    barberProfileId: user.barberProfile?.id ?? null,
  };
}

/** Returns the owning barberProfile id of a service, or null if not found. */
export async function serviceBarberId(serviceId: string): Promise<string | null> {
  const s = await withDbRetry(() =>
    prisma.service.findUnique({ where: { id: serviceId }, select: { barberId: true } })
  );
  return s?.barberId ?? null;
}

/** Returns the parties of a booking, or null if not found. */
export async function bookingParties(
  bookingId: string
): Promise<{ clientId: string; barberId: string } | null> {
  const b = await withDbRetry(() =>
    prisma.booking.findUnique({
      where: { id: bookingId },
      select: { clientId: true, barberId: true },
    })
  );
  return b ?? null;
}
