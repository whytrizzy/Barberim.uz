import 'server-only';
import {
  bookingPayloadSchema,
  classifySendError,
  LIVE_TEMPLATES,
  REMINDER_TEMPLATES,
  renderNotification,
  type BookingPayload,
  type BookingTemplate,
  type Sender,
  type StaffPayload,
  type StaffTemplate,
  BILLING_TEMPLATE,
  WAITLIST_TEMPLATE,
  waitlistPayloadSchema,
} from '@/bot/notifications';
import { rebookNudgeTime, reminderTimes } from '@/domain/booking';
import { AUTO_NEXT_UP_WITHIN_MIN, noticeStillUseful } from '@/domain/notices';
import { Prisma, type StaffRole } from '@/generated/prisma/client';
import { fromDbLocale } from '../auth/auth';
import { db } from '../db/client';
import { checkWaitlistAlert, markWaitlistNotified } from './waitlist';

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
const REVIEW_ASK_DELAY_MS = 3_600_000;
/** Sent after the visit, so a start time in the past doesn't make them stale. */
const AFTER_VISIT_TEMPLATES = ['booking.review_ask', 'booking.rebook_nudge'] as const;

/**
 * Queues a message to the person a booking is for. People with no Telegram account behind their
 * client record (walk-ins, numbers taken by phone) get nothing until SMS arrives in Phase 3.
 */
export async function queueBookingMessage(
  tx: Prisma.TransactionClient,
  template: BookingTemplate,
  bookingId: string,
  sendAt = new Date(),
  extra: Pick<BookingPayload, 'minutes' | 'amount'> = {},
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
    ...extra,
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
  /** How late the client said they are running. */
  minutes?: number;
  /** UZS, for a deposit to refund. */
  amount?: number;
};

/** Tells the shop's people about a change, each in their own language. */
export async function queueStaffAlert(
  tx: Prisma.TransactionClient,
  bookingId: string,
  { template, actorUserId, audience, oldStartAt, minutes, amount }: StaffAlert,
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
        ...(minutes !== undefined && { minutes }),
        ...(amount !== undefined && { amount }),
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

/** A while after a finished visit, once per visit, unless they have already reviewed it. */
export async function queueReviewAsk(
  tx: Prisma.TransactionClient,
  bookingId: string,
  now = new Date(),
): Promise<void> {
  const asked = await tx.notification.count({
    where: { bookingId, template: 'booking.review_ask', status: { not: 'CANCELLED' } },
  });
  const reviewed = await tx.review.count({ where: { bookingId } });
  if (asked > 0 || reviewed > 0) return;
  await queueBookingMessage(
    tx,
    'booking.review_ask',
    bookingId,
    new Date(now.getTime() + REVIEW_ASK_DELAY_MS),
  );
}

export async function cancelReviewAsk(tx: Prisma.TransactionClient, bookingId: string) {
  await tx.notification.updateMany({
    where: { bookingId, status: 'PENDING', template: 'booking.review_ask' },
    data: { status: 'CANCELLED' },
  });
}

/**
 * "Time for a haircut?" some weeks after a finished visit. Only the latest visit counts: an
 * earlier one's nudge at the same shop is dropped. If they book again first, it isn't sent.
 */
export async function queueRebookNudge(
  tx: Prisma.TransactionClient,
  bookingId: string,
  now = new Date(),
): Promise<void> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { shopClientId: true, startAt: true },
  });
  await tx.notification.updateMany({
    where: {
      status: 'PENDING',
      template: 'booking.rebook_nudge',
      booking: { shopClientId: booking.shopClientId },
    },
    data: { status: 'CANCELLED' },
  });
  const sendAt = rebookNudgeTime(booking.startAt, now);
  if (sendAt) await queueBookingMessage(tx, 'booking.rebook_nudge', bookingId, sendAt);
}

export async function cancelRebookNudge(tx: Prisma.TransactionClient, bookingId: string) {
  await tx.notification.updateMany({
    where: { bookingId, status: 'PENDING', template: 'booking.rebook_nudge' },
    data: { status: 'CANCELLED' },
  });
}

/**
 * The master just finished a visit (or the client didn't come): if their next client is due soon,
 * tell them their turn is next. Once per booking, however it was sent.
 */
export async function queueNextUp(
  tx: Prisma.TransactionClient,
  finished: { id: string; staffId: string; startAt: Date },
  now = new Date(),
): Promise<void> {
  const next = await tx.booking.findFirst({
    where: {
      staffId: finished.staffId,
      id: { not: finished.id },
      status: 'CONFIRMED',
      startAt: {
        gt: finished.startAt,
        gte: new Date(now.getTime() - 30 * 60_000),
        lte: new Date(now.getTime() + AUTO_NEXT_UP_WITHIN_MIN * 60_000),
      },
    },
    orderBy: { startAt: 'asc' },
    select: { id: true },
  });
  if (!next) return;
  const told = await tx.notification.count({
    where: { bookingId: next.id, template: 'booking.next_up' },
  });
  if (told === 0) await queueBookingMessage(tx, 'booking.next_up', next.id, now);
}

/** A nudge is pointless once they've booked again there (even one they later missed). */
async function hasBookedSince(bookingId: string): Promise<boolean> {
  const visit = await db.booking.findUnique({
    where: { id: bookingId },
    select: { shopClientId: true, startAt: true, status: true },
  });
  if (visit?.status !== 'COMPLETED') return true;
  const later = await db.booking.count({
    where: {
      shopClientId: visit.shopClientId,
      id: { not: bookingId },
      startAt: { gt: visit.startAt },
      status: { notIn: ['CANCELLED_CLIENT', 'CANCELLED_SHOP'] },
    },
  });
  return later > 0;
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
function claimDue(now: Date, only: DispatchScope): Promise<Claimed[]> {
  const scope = only.onlyBookings
    ? Prisma.sql`AND booking_id = ANY(${only.onlyBookings}::uuid[])`
    : only.onlyChats
      ? Prisma.sql`AND chat_id = ANY(${only.onlyChats}::bigint[])`
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

/** Keeps tests to their own rows. */
type DispatchScope = { onlyBookings?: string[]; onlyChats?: bigint[] };

/** Why a message that is due shouldn't go after all, or null to send it. */
async function staleReason(row: Claimed, now: Date): Promise<string | null> {
  // A receipt is never out of date.
  if (row.template === BILLING_TEMPLATE) return null;
  if (row.template === WAITLIST_TEMPLATE) {
    const { entryId } = waitlistPayloadSchema.parse(row.payload);
    const verdict = await checkWaitlistAlert(entryId, now);
    return verdict === 'send' ? null : verdict === 'taken' ? 'taken meanwhile' : 'not waiting';
  }
  // A message about a visit that has already begun only confuses (the ones about a finished
  // visit are the exception: that's the point of them).
  // So does a day-before reminder that arrives hours before: the 2-hour one is about to go.
  const { bookingId, startAt } = bookingPayloadSchema.parse(row.payload);
  const left = new Date(startAt).getTime() - now.getTime();
  if ((LIVE_TEMPLATES as readonly string[]).includes(row.template)) {
    return noticeStillUseful(new Date(startAt), now) ? null : 'too late';
  }
  if (
    (left <= 0 && !(AFTER_VISIT_TEMPLATES as readonly string[]).includes(row.template)) ||
    (row.template === 'booking.reminder24h' && left < DAY_REMINDER_MIN_LEFT_MS)
  ) {
    return 'too late';
  }
  if (row.template === 'booking.rebook_nudge' && (await hasBookedSince(bookingId))) {
    return 'booked again';
  }
  return null;
}

/** Sends everything due. */
export async function dispatchDue(
  send: Sender,
  { now = new Date(), ...only }: { now?: Date } & DispatchScope = {},
): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, retried: 0, failed: 0, dropped: 0 };

  const finish = (id: string, status: 'FAILED' | 'CANCELLED', lastError: string) =>
    db.notification.update({ where: { id }, data: { status, lastError } });

  for (const row of await claimDue(now, only)) {
    const message = renderNotification(row.template, row.payload);
    if (!message || row.chatId === null) {
      await finish(row.id, 'FAILED', 'unreadable message');
      result.failed++;
      continue;
    }
    const stale = await staleReason(row, now);
    if (stale) {
      await finish(row.id, 'CANCELLED', stale);
      result.dropped++;
      continue;
    }

    try {
      await send(row.chatId, message);
      await db.notification.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: new Date(), lastError: null },
      });
      if (row.template === WAITLIST_TEMPLATE) {
        await markWaitlistNotified(waitlistPayloadSchema.parse(row.payload).entryId, now);
      }
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
