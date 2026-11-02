import 'server-only';
import type { BookingReplies, ReplyOutcome } from '@/bot/bot';
import { checkTransition } from '@/domain/booking';
import { fromDbLocale } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { applyBookingAction } from './booking';

/** What the bot does with taps on a reminder. Only the booking's own client can act on it. */

const userOf = (telegramId: number) =>
  db.user.findUnique({ where: { telegramId: BigInt(telegramId) } });

async function coming(telegramId: number, bookingId: string): Promise<ReplyOutcome> {
  const user = await userOf(telegramId);
  const booking =
    user &&
    (await db.booking.findFirst({
      where: { id: bookingId, client: { userId: user.id } },
      select: { id: true, shopId: true, status: true, startAt: true, updatedAt: true },
    }));
  if (!user || !booking) return 'not_found';
  // The same rule as cancelling: only while it's still ahead and still on.
  if (!checkTransition('cancel', 'client', booking, new Date()).ok) return 'too_late';
  await db.$transaction([
    db.booking.update({ where: { id: booking.id }, data: { clientConfirmedAt: new Date() } }),
    db.auditLog.create({
      data: {
        shopId: booking.shopId,
        actorUserId: user.id,
        action: 'booking.client_coming',
        entity: 'booking',
        entityId: booking.id,
      },
    }),
  ]);
  return 'ok';
}

async function cancel(telegramId: number, bookingId: string): Promise<ReplyOutcome> {
  const user = await userOf(telegramId);
  if (!user) return 'not_found';
  try {
    await applyBookingAction(user, bookingId, { action: 'cancel', as: 'client' });
    return 'ok';
  } catch (error) {
    if (error instanceof AppError && error.code === 'not_found') return 'not_found';
    if (error instanceof AppError && error.code === 'conflict') return 'too_late';
    throw error;
  }
}

/** A staff answer. Roles are checked by the action itself: a master, only for their own. */
async function staffAnswer(
  telegramId: number,
  bookingId: string,
  action: 'confirm' | 'cancel',
): Promise<ReplyOutcome> {
  const user = await userOf(telegramId);
  if (!user) return 'not_found';
  try {
    await applyBookingAction(user, bookingId, { action, as: 'staff' });
    return 'ok';
  } catch (error) {
    if (error instanceof AppError && (error.code === 'not_found' || error.code === 'forbidden')) {
      return 'not_found';
    }
    if (error instanceof AppError && error.code === 'conflict') return 'too_late';
    throw error;
  }
}

export const bookingReplies: BookingReplies = {
  localeOf: async (telegramId) => {
    const user = await userOf(telegramId);
    return user ? fromDbLocale(user.locale) : null;
  },
  coming,
  cancel,
  accept: (telegramId, bookingId) => staffAnswer(telegramId, bookingId, 'confirm'),
  reject: (telegramId, bookingId) => staffAnswer(telegramId, bookingId, 'cancel'),
};
