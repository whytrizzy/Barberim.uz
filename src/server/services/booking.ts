import 'server-only';
import { checkSlot } from '@/domain/availability';
import {
  ACTIVE_STATUSES,
  checkTransition,
  priceBooking,
  type ActorKind,
  type BookingAction,
  type OfferedService,
} from '@/domain/booking';
import { normalizeUzPhone } from '@/domain/phone';
import { tashkentDate } from '@/domain/time';
import type { BookingDto, BookingRefusal } from '@/features/booking/schemas';
import type { Prisma, User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError, type AppErrorCode } from '../http/errors';
import { dayInput, loadSchedule } from './availability';

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
    totalPrice: b.totalPrice,
    note: b.note,
    items: b.items.map((i) => ({
      name: i.nameSnapshot,
      price: i.priceSnapshot,
      durationMin: i.durationSnapshot,
    })),
  };
}

/** The master's own versions of the chosen services, in the chosen order. */
async function offeredServices(
  staffId: string,
  shopId: string,
  serviceIds: string[],
): Promise<OfferedService[]> {
  const rows = await db.staffService.findMany({
    where: { staffId, serviceId: { in: serviceIds }, service: { shopId, isActive: true } },
    include: { service: true },
  });
  const byId = new Map(rows.map((r) => [r.serviceId, r]));
  return serviceIds.map((serviceId) => {
    const row = byId.get(serviceId);
    if (!row) refuse('invalid_input', 'service_unavailable', { serviceId });
    return {
      id: row.service.id,
      name: row.service.name,
      price: row.service.price,
      durationMin: row.service.durationMin,
      priceOverride: row.priceOverride,
      durationOverride: row.durationOverride,
    };
  });
}

/** Inserts the booking; an overlap caught by the database becomes a friendly "slot_taken". */
async function insertBooking(data: Prisma.BookingUncheckedCreateInput): Promise<BookingWithItems> {
  try {
    return await db.$transaction(async (tx) => {
      const booking = await tx.booking.create({ data, include: bookingInclude });
      await tx.auditLog.create({
        data: {
          shopId: booking.shopId,
          actorUserId: data.createdById ?? null,
          action: 'booking.create',
          entity: 'booking',
          entityId: booking.id,
          data: { startAt: booking.startAt.toISOString(), source: booking.source },
        },
      });
      return booking;
    });
  } catch (error) {
    if (isOverlapViolation(error)) refuse('conflict', 'slot_taken');
    throw error;
  }
}

export type ClientBookingInput = {
  staffId: string;
  serviceIds: string[];
  startAt: Date;
  note?: string;
};

/** A client books for themselves through the app. */
export async function createClientBooking(
  user: User,
  input: ClientBookingInput,
  now = new Date(),
): Promise<BookingDto> {
  if (!user.phone) refuse('invalid_input', 'phone_required');

  const date = tashkentDate(input.startAt);
  const schedule = await loadSchedule(input.staffId, date, 1);
  const services = await offeredServices(input.staffId, schedule.shopId, input.serviceIds);
  const { items, totalPrice, durationMin } = priceBooking(services);

  const client = await db.shopClient.upsert({
    where: { shopId_userId: { shopId: schedule.shopId, userId: user.id } },
    create: {
      shopId: schedule.shopId,
      userId: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' '),
      phone: user.phone,
    },
    update: { phone: user.phone },
  });
  if (client.isBlocked) refuse('forbidden', 'client_blocked');

  const upcoming = await db.booking.count({
    where: { shopClientId: client.id, status: { in: ACTIVE_STATUSES }, endAt: { gt: now } },
  });
  if (upcoming >= schedule.settings.maxActiveBookingsPerClient) {
    refuse('conflict', 'too_many_bookings', {
      limit: schedule.settings.maxActiveBookingsPerClient,
    });
  }

  const slot = checkSlot(dayInput(schedule, date, durationMin, now), input.startAt);
  if (!slot.ok) {
    if (slot.reason === 'taken') refuse('conflict', 'slot_taken');
    refuse('conflict', 'slot_unavailable', { slot: slot.reason });
  }

  const booking = await insertBooking({
    shopId: schedule.shopId,
    staffId: input.staffId,
    shopClientId: client.id,
    startAt: input.startAt,
    endAt: new Date(input.startAt.getTime() + durationMin * 60_000),
    status: schedule.settings.requireApproval ? 'PENDING' : 'CONFIRMED',
    source: 'APP',
    totalPrice,
    note: input.note ?? null,
    createdById: user.id,
    items: { create: items },
  });
  return toBookingDto(booking);
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

  const services = await offeredServices(target.id, target.shopId, input.serviceIds);
  const { items, totalPrice, durationMin } = priceBooking(services);

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

  const booking = await insertBooking({
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
  });
  return toBookingDto(booking);
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
