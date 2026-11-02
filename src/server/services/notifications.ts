import 'server-only';
import {
  bookingPayloadSchema,
  classifySendError,
  REMINDER_TEMPLATES,
  renderNotification,
  type BookingPayload,
  type BookingTemplate,
  type Sender,
  type StaffPayload,
  type StaffTemplate,
} from '@/bot/notifications';
import { reminderTimes } from '@/domain/booking';
import { Prisma, type StaffRole } from '@/generated/prisma/client';
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
const DAY_REMINDER_MIN_LEFT_MS = 3 * 3_600_000;

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

export type StaffAlert = {
  template: StaffTemplate;
  /** Who did it: they know already, so they aren't told. */
  actorUserId: string;
  /**
   * `shop`: the booking's master and the owner and admins, when a client did something.
   * `master`: just the master, when a colleague changed their day.
   */
  audience: 'shop' | 'master';
  oldStartAt?: Date;
};

/** Tells the shop's people about a change, each in their own language. */
export async function queueStaffAlert(
  tx: Prisma.TransactionClient,
  bookingId: string,
  { template, actorUserId, audience, oldStartAt }: StaffAlert,
): Promise<void> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: {
      shopId: true,
      staffId: true,
      startAt: true,
      shop: { select: { name: true } },
      staff: { select: { displayName: true } },
      client: { select: { name: true } },
    },
  });
  const recipients = await tx.staff.findMany({
    where: {
      shopId: booking.shopId,
      isActive: true,
      userId: { not: null },
      OR: [
        { id: booking.staffId },
        ...(audience === 'shop' ? [{ role: { in: ['OWNER', 'ADMIN'] as StaffRole[] } }] : []),
      ],
      NOT: { userId: actorUserId },
    },
    select: { user: { select: { telegramId: true, locale: true } } },
  });
  const sendAt = new Date();
  await tx.notification.createMany({
    data: recipients.flatMap(({ user }) => {
      if (!user) return [];
      const payload: StaffPayload = {
        bookingId,
        shopId: booking.shopId,
        shopName: booking.shop.name,
        masterName: booking.staff.displayName,
        clientName: booking.client.name,
        startAt: booking.startAt.toISOString(),
        ...(oldStartAt && { oldStartAt: oldStartAt.toISOString() }),
        locale: fromDbLocale(user.locale),
      };
      return [{ chatId: user.telegramId, template, payload, sendAt, bookingId }];
    }),
  });
}

/** Schedules the reminders for this start time; they go to the first of a family only. */
export async function queueReminders(
  tx: Prisma.TransactionClient,
  bookingId: string,
  startAt: Date,
  now = new Date(),
): Promise<void> {
  for (const { kind, sendAt } of reminderTimes(startAt, now)) {
    await queueBookingMessage(
      tx,
      kind === '24h' ? 'booking.reminder24h' : 'booking.reminder2h',
      bookingId,
      sendAt,
    );
  }
}

/** Reminders that haven't gone out, when the visit moved or has happened. */
export async function cancelReminders(tx: Prisma.TransactionClient, bookingId: string) {
  await tx.notification.updateMany({
    where: { bookingId, status: 'PENDING', template: { in: [...REMINDER_TEMPLATES] } },
    data: { status: 'CANCELLED' },
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
    // So does a day-before reminder that arrives hours before: the 2-hour one is about to go.
    const { startAt } = bookingPayloadSchema.parse(row.payload);
    const left = new Date(startAt).getTime() - now.getTime();
    if (left <= 0 || (row.template === 'booking.reminder24h' && left < DAY_REMINDER_MIN_LEFT_MS)) {
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
