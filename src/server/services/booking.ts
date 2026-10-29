import 'server-only';
import { checkSlot } from '@/domain/availability';
import {
  ACTIVE_STATUSES,
  checkTransition,
  priceBooking,
  type ActorKind,
  type BookingAction,
} from '@/domain/booking';
import { groupDuration, rankMasters, splitGroup } from '@/domain/combine';
import { normalizeUzPhone } from '@/domain/phone';
import { startOfTashkentDay, tashkentDate, type CalendarDate } from '@/domain/time';
import type { BookingDto, BookingRefusal } from '@/features/booking/schemas';
import type { Prisma, User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError, type AppErrorCode } from '../http/errors';
import { dayInput, loadSchedule } from './availability';
import { mastersOffering, offeredServices, priceParties } from './catalog';

function refuse(code: AppErrorCode, reason: BookingRefusal, extra: object = {}): never {
  throw new AppError(code, reason, { reason, ...extra });
}

/**
 * The database's last line of defence: bookings_no_overlap. Postgres reports exclusion
 * violations as SQLSTATE 23P01; Prisma wraps them, so look through message and cause.
 */
export function isOverlapViolation(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 5; depth++) {
    const text = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: unknown }).code;
    if (text.includes('bookings_no_overlap') || code === '23P01') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

const bookingInclude = {
  items: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.BookingInclude;

type BookingWithItems = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export function toBookingDto(b: BookingWithItems): BookingDto {
  return {
    id: b.id,
    shopId: b.shopId,
    staffId: b.staffId,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    status: b.status,
    source: b.source,
    groupId: b.groupId,
    totalPrice: b.totalPrice,
    note: b.note,
    items: b.items.map((i) => ({
      name: i.nameSnapshot,
      price: i.priceSnapshot,
      durationMin: i.durationSnapshot,
    })),
  };
}

/**
 * Inserts bookings in one transaction — a family books all together or not at all. An overlap
 * caught by the database becomes a friendly "slot_taken".
 */
async function insertBookings(
  rows: Prisma.BookingUncheckedCreateInput[],
): Promise<BookingWithItems[]> {
  try {
    return await db.$transaction(async (tx) => {
      const created: BookingWithItems[] = [];
      for (const data of rows) {
        created.push(await tx.booking.create({ data, include: bookingInclude }));
      }
      await tx.auditLog.createMany({
        data: created.map((b) => ({
          shopId: b.shopId,
          actorUserId: rows[0]?.createdById ?? null,
          action: 'booking.create',
          entity: 'booking',
          entityId: b.id,
          data: { startAt: b.startAt.toISOString(), source: b.source, groupId: b.groupId },
        })),
      });
      return created;
    });
  } catch (error) {
    if (isOverlapViolation(error)) refuse('conflict', 'slot_taken');
    throw error;
  }
}

/** One person in a booking: their services, and an optional label ("Ali, oʻgʻli"). */
export type Party = { serviceIds: string[]; label?: string };

export type ClientBookingsInput = {
  /** A specific master, or "any" free master of `shopId`. */
  staffId: string | 'any';
  shopId?: string;
  /** One party = a normal booking; 2–5 = a family booked back to back with one master. */
  parties: Party[];
  startAt: Date;
  note?: string;
};

export const MAX_GROUP_SIZE = 5;

/** The shop and the masters to try, best first. */
async function resolveMasters(input: ClientBookingsInput, date: CalendarDate) {
  if (input.staffId !== 'any') {
    const staff = await db.staff.findUnique({
      where: { id: input.staffId },
      select: { shopId: true },
    });
    if (!staff || (input.shopId && staff.shopId !== input.shopId)) {
      throw new AppError('not_found', 'staff not found');
    }
    return { shopId: staff.shopId, staffIds: [input.staffId] };
  }
  if (!input.shopId) throw new AppError('invalid_input', 'shopId is required for any master');
  const masters = await mastersOffering(
    input.shopId,
    input.parties.flatMap((p) => p.serviceIds),
  );
  if (masters.length === 0) refuse('invalid_input', 'service_unavailable');
  const dayStart = startOfTashkentDay(date);
  const loads = await db.booking.groupBy({
    by: ['staffId'],
    where: {
      staffId: { in: masters.map((m) => m.id) },
      status: { notIn: ['CANCELLED_CLIENT', 'CANCELLED_SHOP'] },
      startAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) },
    },
    _count: { _all: true },
  });
  const load = new Map(loads.map((l) => [l.staffId, l._count._all]));
  const ranked = rankMasters(
    masters.map((m) => ({ staffId: m.id, sortOrder: m.sortOrder, load: load.get(m.id) ?? 0 })),
  );
  return { shopId: input.shopId, staffIds: ranked.map((m) => m.staffId) };
}

const refusalReason = (error: unknown) =>
  error instanceof AppError
    ? (error.details as { reason?: string } | undefined)?.reason
    : undefined;

/**
 * A client books through the app: themselves, or a family back to back, with a chosen master or
 * any free one. With "any", masters are tried best first; if one loses the time to someone
 * faster, the next free master takes it instead of failing the client.
 */
export async function createClientBookings(
  user: User,
  input: ClientBookingsInput,
  now = new Date(),
): Promise<BookingDto[]> {
  if (!user.phone) refuse('invalid_input', 'phone_required');
  if (input.parties.length < 1 || input.parties.length > MAX_GROUP_SIZE) {
    throw new AppError('invalid_input', 'party count');
  }

  const date = tashkentDate(input.startAt);
  const { shopId, staffIds } = await resolveMasters(input, date);

  const client = await db.shopClient.upsert({
    where: { shopId_userId: { shopId, userId: user.id } },
    create: {
      shopId,
      userId: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' '),
      phone: user.phone,
    },
    update: { phone: user.phone },
  });
  if (client.isBlocked) refuse('forbidden', 'client_blocked');

  // A family counts once towards the limit: bookings without a group, plus distinct groups.
  const upcoming = await db.booking.findMany({
    where: { shopClientId: client.id, status: { in: ACTIVE_STATUSES }, endAt: { gt: now } },
    select: { id: true, groupId: true },
  });
  const units = new Set(upcoming.map((b) => b.groupId ?? b.id)).size;

  const groupId = input.parties.length > 1 ? crypto.randomUUID() : null;
  let refusal: unknown = null;
  for (const staffId of staffIds) {
    try {
      const schedule = await loadSchedule(staffId, date, 1);
      if (units >= schedule.settings.maxActiveBookingsPerClient) {
        refuse('conflict', 'too_many_bookings', {
          limit: schedule.settings.maxActiveBookingsPerClient,
        });
      }
      const priced = await priceParties(
        staffId,
        shopId,
        input.parties.map((p) => p.serviceIds),
      );
      const slot = checkSlot(dayInput(schedule, date, groupDuration(priced), now), input.startAt);
      if (!slot.ok) {
        if (slot.reason === 'taken') refuse('conflict', 'slot_taken');
        refuse('conflict', 'slot_unavailable', { slot: slot.reason });
      }
      const spans = splitGroup(input.startAt, priced);
      const created = await insertBookings(
        priced.map((p, i) => ({
          shopId,
          staffId,
          shopClientId: client.id,
          startAt: spans[i]!.startAt,
          endAt: spans[i]!.endAt,
          status: schedule.settings.requireApproval ? 'PENDING' : 'CONFIRMED',
          source: 'APP',
          groupId,
          totalPrice: p.totalPrice,
          note: [input.parties[i]?.label, input.note].filter(Boolean).join(' · ') || null,
          createdById: user.id,
          items: { create: p.items },
        })),
      );
      return created.map(toBookingDto);
    } catch (error) {
      const tryNext =
        input.staffId === 'any' &&
        error instanceof AppError &&
        error.code === 'conflict' &&
        refusalReason(error) !== 'too_many_bookings';
      if (!tryNext) throw error;
      // Prefer reporting "taken" over a less useful reason from another master.
      if (!refusal || refusalReason(error) === 'slot_taken') refusal = error;
    }
  }
  throw refusal ?? new AppError('conflict', 'slot_taken', { reason: 'slot_taken' });
}

export type ClientBookingInput = {
  staffId: string | 'any';
  shopId?: string;
  serviceIds: string[];
  startAt: Date;
  note?: string;
};

/** A client books one person (themselves). */
export async function createClientBooking(
  user: User,
  { serviceIds, ...input }: ClientBookingInput,
  now = new Date(),
): Promise<BookingDto> {
  const [booking] = await createClientBookings(user, { ...input, parties: [{ serviceIds }] }, now);
  return booking!;
}

export type StaffBookingInput = {
  staffId: string;
  serviceIds: string[];
  startAt: Date;
  source: 'WALK_IN' | 'PHONE';
  client: { shopClientId: string } | { name: string; phone?: string };
  note?: string;
  groupId?: string;
};

/**
 * Staff add a walk-in or phone booking. Hours and notice don't apply (barbers do take a client
 * after closing); overlaps are still impossible. Masters may only fill their own calendar.
 */
export async function createStaffBooking(
  user: User,
  input: StaffBookingInput,
): Promise<BookingDto> {
  const target = await db.staff.findUnique({ where: { id: input.staffId } });
  if (!target || !target.isActive) throw new AppError('not_found', 'staff not found');
  const actor = await requireStaff(user.id, target.shopId);
  if (actor.role === 'MASTER' && actor.id !== target.id) {
    throw new AppError('forbidden', 'masters can only book into their own calendar');
  }

  const { items, totalPrice, durationMin } = priceBooking(
    await offeredServices(target.id, target.shopId, input.serviceIds),
  );

  let shopClientId: string;
  if ('shopClientId' in input.client) {
    const existing = await db.shopClient.findFirst({
      where: { id: input.client.shopClientId, shopId: target.shopId },
    });
    if (!existing) throw new AppError('not_found', 'client not found in this shop');
    shopClientId = existing.id;
  } else {
    const phone = input.client.phone ? normalizeUzPhone(input.client.phone) : null;
    if (input.client.phone && !phone) {
      throw new AppError('invalid_input', 'phone_invalid', { reason: 'phone_invalid' });
    }
    shopClientId = (
      await db.shopClient.create({
        data: { shopId: target.shopId, name: input.client.name.trim(), phone },
      })
    ).id;
  }

  const [booking] = await insertBookings([
    {
      shopId: target.shopId,
      staffId: target.id,
      shopClientId,
      startAt: input.startAt,
      endAt: new Date(input.startAt.getTime() + durationMin * 60_000),
      status: 'CONFIRMED',
      source: input.source,
      groupId: input.groupId ?? null,
      totalPrice,
      note: input.note ?? null,
      createdById: user.id,
      items: { create: items },
    },
  ]);
  return toBookingDto(booking!);
}

export type ActionInput =
  | { action: 'cancel'; as: ActorKind; reason?: string }
  | { action: 'reschedule'; as: ActorKind; startAt: Date }
  | { action: 'confirm' | 'complete' | 'no_show'; as: 'staff' };

/**
 * Applies one action to a booking after checking the actor's right to it. Updates are
 * conditional on the status read ("compare and set"), so two people acting at once can't both win.
 */
export async function applyBookingAction(
  user: User,
  bookingId: string,
  input: ActionInput,
  now = new Date(),
): Promise<BookingDto> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { ...bookingInclude, client: { select: { userId: true } } },
  });
  if (!booking) throw new AppError('not_found', 'booking not found');

  if (input.as === 'client') {
    if (booking.client.userId !== user.id) throw new AppError('not_found', 'booking not found');
  } else {
    const staff = await requireStaff(user.id, booking.shopId);
    if (staff.role === 'MASTER' && staff.id !== booking.staffId) {
      throw new AppError('forbidden', 'not your booking');
    }
  }

  const transition = checkTransition(input.action as BookingAction, input.as, booking, now);
  if (!transition.ok) refuse('conflict', 'transition_refused', { transition: transition.reason });

  const data: Prisma.BookingUncheckedUpdateManyInput = {};
  const clientCounters: Prisma.ShopClientUpdateInput = {};
  switch (input.action) {
    case 'cancel':
      data.status = transition.to ?? undefined;
      data.cancelledAt = now;
      data.cancelReason = input.reason ?? null;
      break;
    case 'confirm':
      data.status = 'CONFIRMED';
      break;
    case 'complete':
      data.status = 'COMPLETED';
      clientCounters.visitCount = { increment: 1 };
      if (booking.status === 'NO_SHOW') clientCounters.noShowCount = { decrement: 1 };
      break;
    case 'no_show':
      data.status = 'NO_SHOW';
      clientCounters.noShowCount = { increment: 1 };
      if (booking.status === 'COMPLETED') clientCounters.visitCount = { decrement: 1 };
      break;
    case 'reschedule': {
      const durationMs = booking.endAt.getTime() - booking.startAt.getTime();
      if (input.as === 'client') {
        const date = tashkentDate(input.startAt);
        const schedule = await loadSchedule(booking.staffId, date, 1, {
          excludeBookingId: booking.id,
        });
        const slot = checkSlot(dayInput(schedule, date, durationMs / 60_000, now), input.startAt);
        if (!slot.ok) {
          if (slot.reason === 'taken') refuse('conflict', 'slot_taken');
          refuse('conflict', 'slot_unavailable', { slot: slot.reason });
        }
      }
      data.startAt = input.startAt;
      data.endAt = new Date(input.startAt.getTime() + durationMs);
      break;
    }
  }

  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.booking.updateMany({
        where: { id: booking.id, status: booking.status, updatedAt: booking.updatedAt },
        data,
      });
      if (count === 0)
        throw new AppError('conflict', 'booking changed meanwhile', { reason: 'stale' });
      if (Object.keys(clientCounters).length > 0) {
        await tx.shopClient.update({ where: { id: booking.shopClientId }, data: clientCounters });
      }
      await tx.auditLog.create({
        data: {
          shopId: booking.shopId,
          actorUserId: user.id,
          action: `booking.${input.action}`,
          entity: 'booking',
          entityId: booking.id,
          data: { as: input.as, from: booking.status, to: data.status ?? booking.status },
        },
      });
    });
  } catch (error) {
    if (isOverlapViolation(error)) refuse('conflict', 'slot_taken');
    throw error;
  }

  const updated = await db.booking.findUniqueOrThrow({
    where: { id: booking.id },
    include: bookingInclude,
  });
  return toBookingDto(updated);
}
