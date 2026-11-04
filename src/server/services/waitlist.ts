import 'server-only';
import type { WaitlistPayload } from '@/bot/notifications';
import {
  addDays,
  dateKey,
  parseDateKey,
  startOfTashkentDay,
  tashkentDate,
  type CalendarDate,
} from '@/domain/time';
import {
  MAX_WAITLIST_ENTRIES,
  type JoinWaitlistRequest,
  type WaitlistDto,
  type WaitlistEntryDto,
  type WaitlistRefusal,
} from '@/features/waitlist/schemas';
import type { Prisma, User } from '@/generated/prisma/client';
import { fromDbLocale } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { BOOKING_DAYS, dbDate, hasFreeTime } from './availability';

// The waitlist: "tell me if a time frees up that day". When a booking is cancelled or moved, the
// people waiting for that day get a message, but only after the dispatcher has checked there is
// still a time that fits them (someone else may have taken it, or it may be too short).

function refuse(
  reason: WaitlistRefusal,
  code: 'conflict' | 'invalid_input' | 'forbidden' = 'conflict',
): never {
  throw new AppError(code, reason, { reason });
}

const fromDbDate = (date: Date): CalendarDate => ({
  year: date.getUTCFullYear(),
  month: date.getUTCMonth() + 1,
  day: date.getUTCDate(),
});

const entryInclude = {
  shop: { select: { slug: true, name: true } },
  staff: { select: { displayName: true } },
} satisfies Prisma.WaitlistEntryInclude;

type EntryRow = Prisma.WaitlistEntryGetPayload<{ include: typeof entryInclude }>;

async function toDtos(rows: EntryRow[]): Promise<WaitlistEntryDto[]> {
  const services = await db.service.findMany({
    where: { id: { in: rows.flatMap((row) => row.serviceIds) } },
    select: { id: true, name: true },
  });
  const names = new Map(services.map((service) => [service.id, service.name]));
  return rows.map((row) => ({
    id: row.id,
    shopId: row.shopId,
    shopSlug: row.shop.slug,
    shopName: row.shop.name,
    date: dateKey(fromDbDate(row.date)),
    staffId: row.staffId,
    masterName: row.staff?.displayName ?? null,
    serviceIds: row.serviceIds,
    serviceNames: row.serviceIds.flatMap((serviceId) => names.get(serviceId) ?? []),
  }));
}

/** The days the person is still waiting for, from today on. */
export async function listWaitlist(user: User, now = new Date()): Promise<WaitlistDto> {
  const rows = await db.waitlistEntry.findMany({
    where: { userId: user.id, status: 'ACTIVE', date: { gte: dbDate(tashkentDate(now)) } },
    include: entryInclude,
    orderBy: { date: 'asc' },
  });
  return { entries: await toDtos(rows) };
}

/** Joins (or updates) the waitlist for one day at one shop. */
export async function joinWaitlist(
  user: User,
  input: JoinWaitlistRequest,
  now = new Date(),
): Promise<WaitlistEntryDto> {
  const date = parseDateKey(input.date);
  const today = tashkentDate(now);
  const last = addDays(today, BOOKING_DAYS - 1);
  if (!date || dbDate(date) < dbDate(today) || dbDate(date) > dbDate(last)) {
    refuse('outside_booking_window', 'invalid_input');
  }

  const shop = await db.shop.findFirst({ where: { id: input.shopId, status: 'ACTIVE' } });
  if (!shop) throw new AppError('not_found', 'no such shop');
  // Someone the shop has blacklisted can't book online, so can't wait online either.
  const blocked = await db.shopClient.count({
    where: { shopId: shop.id, userId: user.id, isBlocked: true },
  });
  if (blocked > 0) refuse('client_blocked', 'forbidden');
  const offered = await db.service.count({
    where: { id: { in: input.serviceIds }, shopId: shop.id, isActive: true },
  });
  if (offered !== input.serviceIds.length) {
    throw new AppError('invalid_input', 'service_unavailable', { reason: 'service_unavailable' });
  }
  if (input.staffId) {
    const master = await db.staff.findFirst({
      where: { id: input.staffId, shopId: shop.id, isActive: true, isBookable: true },
    });
    if (!master) throw new AppError('not_found', 'staff not found');
  }

  const key = { userId: user.id, shopId: shop.id, date: dbDate(date) };
  const existing = await db.waitlistEntry.findUnique({ where: { userId_shopId_date: key } });
  if (existing?.status !== 'ACTIVE') {
    const waiting = await db.waitlistEntry.count({
      where: { userId: user.id, status: 'ACTIVE', date: { gte: dbDate(today) } },
    });
    if (waiting >= MAX_WAITLIST_ENTRIES) refuse('too_many_entries');
  }
  const fields = {
    staffId: input.staffId,
    serviceIds: input.serviceIds,
    status: 'ACTIVE' as const,
    alertQueuedAt: null,
    notifiedAt: null,
  };
  const row = await db.waitlistEntry.upsert({
    where: { userId_shopId_date: key },
    create: { ...key, ...fields },
    update: fields,
    include: entryInclude,
  });
  const [dto] = await toDtos([row]);
  return dto!;
}

export async function leaveWaitlist(user: User, entryId: string) {
  const { count } = await db.waitlistEntry.updateMany({
    where: { id: entryId, userId: user.id, status: 'ACTIVE' },
    data: { status: 'CANCELLED' },
  });
  if (count === 0) throw new AppError('not_found', 'no such entry');
  return { removed: true as const };
}

/**
 * A booking stopped holding this time (cancelled, or moved elsewhere): queue a message for
 * everyone waiting for that day who could use that master. Whether a time actually fits them is
 * checked when the message is about to go.
 */
export async function queueWaitlistAlerts(
  tx: Prisma.TransactionClient,
  freed: { shopId: string; staffId: string; startAt: Date },
  now = new Date(),
): Promise<void> {
  const day = tashkentDate(freed.startAt);
  if (dbDate(day) < dbDate(tashkentDate(now))) return;
  const entries = await tx.waitlistEntry.findMany({
    where: {
      shopId: freed.shopId,
      date: dbDate(day),
      status: 'ACTIVE',
      alertQueuedAt: null,
      OR: [{ staffId: null }, { staffId: freed.staffId }],
    },
    select: {
      id: true,
      staffId: true,
      serviceIds: true,
      user: { select: { telegramId: true, locale: true } },
      shop: { select: { slug: true, name: true } },
    },
  });
  if (entries.length === 0) return;
  await tx.notification.createMany({
    data: entries.map((entry) => {
      const payload: WaitlistPayload = {
        entryId: entry.id,
        shopName: entry.shop.name,
        slug: entry.shop.slug,
        date: dateKey(day),
        staffId: entry.staffId,
        serviceIds: entry.serviceIds,
        locale: fromDbLocale(entry.user.locale),
      };
      return {
        chatId: entry.user.telegramId,
        template: 'waitlist.slot_free',
        payload,
        sendAt: now,
      };
    }),
  });
  await tx.waitlistEntry.updateMany({
    where: { id: { in: entries.map((entry) => entry.id) } },
    data: { alertQueuedAt: now },
  });
}

export type WaitlistVerdict = 'send' | 'gone' | 'taken';

/**
 * Just before a waitlist message goes: is there still a time for them? `gone`: nothing to wait for
 * any more (left, day passed, already booked that day). `taken`: still waiting, but no time fits.
 */
export async function checkWaitlistAlert(
  entryId: string,
  now = new Date(),
): Promise<WaitlistVerdict> {
  const entry = await db.waitlistEntry.findUnique({ where: { id: entryId } });
  if (entry?.status !== 'ACTIVE') return 'gone';
  const day = fromDbDate(entry.date);
  if (dbDate(day) < dbDate(tashkentDate(now))) return 'gone';

  const booked = await db.booking.count({
    where: {
      shopId: entry.shopId,
      client: { userId: entry.userId },
      status: { in: ['PENDING', 'CONFIRMED'] },
      startAt: { gte: startOfTashkentDay(day), lt: startOfTashkentDay(addDays(day, 1)) },
    },
  });
  if (booked > 0) {
    await db.waitlistEntry.update({ where: { id: entryId }, data: { status: 'CANCELLED' } });
    return 'gone';
  }
  if (await hasFreeTime(entry.shopId, entry.staffId, entry.serviceIds, day, now)) return 'send';
  // Taken meanwhile: let the next freed time try again.
  await db.waitlistEntry.update({ where: { id: entryId }, data: { alertQueuedAt: null } });
  return 'taken';
}

export async function markWaitlistNotified(entryId: string, now = new Date()) {
  await db.waitlistEntry.update({
    where: { id: entryId },
    data: { status: 'NOTIFIED', notifiedAt: now },
  });
}
