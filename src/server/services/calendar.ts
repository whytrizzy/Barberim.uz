import 'server-only';
import { workingWindows, type DayOverride } from '@/domain/availability';
import { dateKey, startOfTashkentDay, type CalendarDate } from '@/domain/time';
import type { BookingDetailDto, CalendarDayDto } from '@/features/calendar/schemas';
import type { User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { dbDate } from './availability';
import { toBookingDto } from './booking';

const DAY_MS = 86_400_000;

/**
 * One day of a shop. Owners and admins see everyone; a master sees only their own calendar, since
 * it carries clients' names and phone numbers. Bookings count on the day they start.
 */
export async function getCalendarDay(
  user: User,
  shopId: string,
  date: CalendarDate,
): Promise<CalendarDayDto> {
  const me = await requireStaff(user.id, shopId);
  const onlyMine = me.role === 'MASTER';
  const dayStart = startOfTashkentDay(date);

  const bookings = await db.booking.findMany({
    where: {
      shopId,
      ...(onlyMine && { staffId: me.id }),
      startAt: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY_MS) },
    },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      client: { select: { name: true, phone: true } },
    },
    orderBy: { startAt: 'asc' },
  });
  // Someone no longer taking clients still shows while they have bookings that day.
  const staff = await db.staff.findMany({
    where: {
      shopId,
      ...(onlyMine
        ? { id: me.id }
        : {
            OR: [
              { isActive: true, isBookable: true },
              { id: { in: bookings.map((booking) => booking.staffId) } },
            ],
          }),
    },
    select: {
      id: true,
      displayName: true,
      hours: { select: { weekday: true, startMin: true, endMin: true } },
      overrides: {
        where: { date: dbDate(date) },
        select: { type: true, startMin: true, endMin: true },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return {
    date: dateKey(date),
    masters: staff.map((member) => {
      const overrides = member.overrides.map((o): DayOverride =>
        o.type === 'DAY_OFF'
          ? { type: 'DAY_OFF' }
          : { type: 'CUSTOM_HOURS', startMin: o.startMin ?? 0, endMin: o.endMin ?? 0 },
      );
      const windows = workingWindows(date, member.hours, overrides);
      return {
        id: member.id,
        name: member.displayName,
        windows:
          windows === 'day_off'
            ? []
            : windows.map((window) => ({ startMin: window.start, endMin: window.end })),
        bookings: bookings
          .filter((booking) => booking.staffId === member.id)
          .map((booking) => ({
            ...toBookingDto(booking),
            client: { name: booking.client.name, phone: booking.client.phone },
          })),
      };
    }),
  };
}

/** One booking in full, under the same rule as the calendar: masters see only their own. */
export async function getBookingForStaff(
  user: User,
  shopId: string,
  bookingId: string,
): Promise<BookingDetailDto> {
  const me = await requireStaff(user.id, shopId);
  const booking = await db.booking.findFirst({
    where: { id: bookingId, shopId },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      deposit: true,
      client: {
        select: {
          id: true,
          name: true,
          phone: true,
          visitCount: true,
          noShowCount: true,
          isBlocked: true,
          userId: true,
        },
      },
      staff: { select: { displayName: true } },
    },
  });
  if (!booking) throw new AppError('not_found', 'booking not found');
  if (me.role === 'MASTER' && booking.staffId !== me.id) {
    throw new AppError('forbidden', 'not your booking');
  }
  return {
    ...toBookingDto(booking),
    masterName: booking.staff.displayName,
    client: {
      id: booking.client.id,
      name: booking.client.name,
      phone: booking.client.phone,
      visitCount: booking.client.visitCount,
      noShowCount: booking.client.noShowCount,
      isBlocked: booking.client.isBlocked,
      canMessage: booking.client.userId !== null,
    },
    cancelReason: booking.cancelReason,
  };
}
