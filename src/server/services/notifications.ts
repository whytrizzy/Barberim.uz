import 'server-only';
import {
  bookingPayloadSchema,
  classifySendError,
  renderNotification,
  type BookingPayload,
  type BookingTemplate,
  type Sender,
} from '@/bot/notifications';
import { Prisma } from '@/generated/prisma/client';
import { fromDbLocale } from '../auth/auth';
import { db } from '../db/client';

/**
 * The outbox. A message is written in the same transaction as the change it announces, so it can't
 * be lost or sent for a change that rolled back; the dispatcher sends what's due, every few minutes.
 */

const MAX_ATTEMPTS = 5;
/** Minutes before the next try, after each failed attempt. */
const BACKOFF_MIN = [1, 5, 15, 60];
/** A run that dies mid-way leaves its messages to be tried again after this long. */
const LEASE_MS = 5 * 60_000;
const BATCH_SIZE = 100;

/**
 * Queues a message to the person a booking is for. People with no Telegram account behind their
 * client record (walk-ins, numbers taken by phone) get nothing until SMS arrives in Phase 3.
 */
export async function queueBookingMessage(
  tx: Prisma.TransactionClient,
  template: BookingTemplate,
  bookingId: string,
  sendAt = new Date(),
): Promise<void> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: {
      startAt: true,
      shop: { select: { name: true } },
      staff: { select: { displayName: true } },
      client: { select: { user: { select: { telegramId: true, locale: true } } } },
    },
  });
  const person = booking.client.user;
  if (!person) return;
  const payload: BookingPayload = {
    bookingId,
    shopName: booking.shop.name,
    masterName: booking.staff.displayName,
    startAt: booking.startAt.toISOString(),
    locale: fromDbLocale(person.locale),
  };
  await tx.notification.create({
    data: { chatId: person.telegramId, template, payload, sendAt, bookingId },
  });
}

/** Whatever hasn't gone out yet is out of date once the booking is cancelled. */
export async function cancelQueuedMessages(tx: Prisma.TransactionClient, bookingId: string) {
  await tx.notification.updateMany({
    where: { bookingId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
}

type Claimed = {
  id: string;
  chatId: bigint | null;
  template: string;
  payload: unknown;
  attempts: number;
};

/**
 * Takes what's due for this run. SKIP LOCKED and the pushed-back send time mean two runs at once
 * can't take the same message, and one that crashes gets retried rather than lost.
 */
function claimDue(now: Date, onlyBookings?: string[]): Promise<Claimed[]> {
  const scope = onlyBookings
    ? Prisma.sql`AND booking_id = ANY(${onlyBookings}::uuid[])`
    : Prisma.empty;
  return db.$queryRaw<Claimed[]>`
    WITH due AS (
      SELECT id FROM notifications
      WHERE status = 'PENDING' AND channel = 'TELEGRAM' AND send_at <= ${now}
      ${scope}
      ORDER BY send_at
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE notifications n
    SET attempts = n.attempts + 1, send_at = ${new Date(now.getTime() + LEASE_MS)}
    FROM due
    WHERE n.id = due.id
    RETURNING n.id, n.chat_id AS "chatId", n.template, n.payload, n.attempts`;
}

export type DispatchResult = { sent: number; retried: number; failed: number; dropped: number };

/** Sends everything due. `onlyBookings` keeps tests to their own rows. */
export async function dispatchDue(
  send: Sender,
  { now = new Date(), onlyBookings }: { now?: Date; onlyBookings?: string[] } = {},
): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, retried: 0, failed: 0, dropped: 0 };

  const finish = (id: string, status: 'FAILED' | 'CANCELLED', lastError: string) =>
    db.notification.update({ where: { id }, data: { status, lastError } });

  for (const row of await claimDue(now, onlyBookings)) {
    const message = renderNotification(row.template, row.payload);
    if (!message || row.chatId === null) {
      await finish(row.id, 'FAILED', 'unreadable message');
      result.failed++;
      continue;
    }
    // A message about a visit that has already begun only confuses.
    const { startAt } = bookingPayloadSchema.parse(row.payload);
    if (new Date(startAt) <= now) {
      await finish(row.id, 'CANCELLED', 'too late');
      result.dropped++;
      continue;
    }

    try {
      await send(row.chatId, message);
      await db.notification.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: new Date(), lastError: null },
      });
      result.sent++;
    } catch (error) {
      const failure = classifySendError(error);
      if (
        failure.kind === 'permanent' ||
        (failure.kind === 'temporary' && row.attempts >= MAX_ATTEMPTS)
      ) {
        await finish(row.id, 'FAILED', failure.reason);
        result.failed++;
      } else {
        const waitMs =
          failure.kind === 'rate_limited'
            ? failure.retryAfterSec * 1000
            : (BACKOFF_MIN[row.attempts - 1] ?? 60) * 60_000;
        await db.notification.update({
          where: { id: row.id },
          data: {
            sendAt: new Date(now.getTime() + waitMs),
            lastError: failure.reason,
            // Slowing down isn't this message's fault, so it doesn't use up a try.
            ...(failure.kind === 'rate_limited' && { attempts: { decrement: 1 } }),
          },
        });
        result.retried++;
      }
    }
  }
  return result;
}
