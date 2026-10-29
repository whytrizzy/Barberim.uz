import 'server-only';
import { serverEnv } from '@/env/server';
import { AUTH_SCHEME } from '@/features/auth/schemas';
import type { Locale as DbLocale, StaffRole, User } from '@/generated/prisma/client';
import type { Locale } from '@/i18n/locales';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { InitDataInvalid, verifyInitData, type VerifiedInitData } from './init-data';

export const toDbLocale = (locale: Locale): DbLocale => locale.replace('-', '_') as DbLocale;
export const fromDbLocale = (locale: DbLocale): Locale => locale.replace('_', '-') as Locale;

/** Verifies the request's Telegram launch data. Throws 401 AppErrors; never touches the DB. */
export function authenticate(request: Request): VerifiedInitData {
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  if (!token) throw new AppError('internal', 'TELEGRAM_BOT_TOKEN is not set');
  const header = request.headers.get('authorization') ?? '';
  const [scheme, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== AUTH_SCHEME || rest.length === 0) {
    throw new AppError('unauthorized', 'missing tma authorization');
  }
  try {
    return verifyInitData(rest.join(' '), token);
  } catch (error) {
    if (error instanceof InitDataInvalid) {
      throw new AppError(
        error.reason === 'expired' ? 'session_expired' : 'unauthorized',
        error.message,
      );
    }
    throw error;
  }
}

/**
 * Creates or refreshes the account for verified launch data: names and photo follow Telegram,
 * the locale follows the app. Called once per app start (POST /api/auth/session).
 */
export async function syncUser(verified: VerifiedInitData, locale?: Locale): Promise<User> {
  const { user } = verified;
  const profile = {
    firstName: user.first_name,
    lastName: user.last_name ?? null,
    username: user.username ?? null,
    photoUrl: user.photo_url ?? null,
  };
  return db.user.upsert({
    where: { telegramId: BigInt(user.id) },
    create: {
      telegramId: BigInt(user.id),
      ...profile,
      locale: toDbLocale(locale ?? 'uz-Latn'),
      lastSeenAt: new Date(),
    },
    update: { ...profile, lastSeenAt: new Date(), ...(locale && { locale: toDbLocale(locale) }) },
  });
}

/** The signed-in user for any authenticated route. One indexed lookup; creates on first sight. */
export async function requireUser(request: Request): Promise<User> {
  const verified = authenticate(request);
  const existing = await db.user.findUnique({ where: { telegramId: BigInt(verified.user.id) } });
  return existing ?? syncUser(verified);
}

/**
 * The user's active staff record in a shop, if their role is allowed; otherwise 403.
 *   const staff = await requireStaff(user.id, shopId, ['OWNER', 'ADMIN']);
 */
export async function requireStaff(
  userId: string,
  shopId: string,
  roles: StaffRole[] = ['OWNER', 'ADMIN', 'MASTER'],
) {
  const staff = await db.staff.findFirst({
    where: { userId, shopId, isActive: true, role: { in: roles } },
  });
  if (!staff)
    throw new AppError('forbidden', `user ${userId} lacks ${roles.join('/')} in ${shopId}`);
  return staff;
}
