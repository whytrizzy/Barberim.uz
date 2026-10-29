import 'server-only';
import {
  dayAvailability,
  type DayAvailability,
  type DayOverride,
  type WeeklyBlock,
} from '@/domain/availability';
import { addDays, dateKey, startOfTashkentDay, type CalendarDate } from '@/domain/time';
import { parseShopSettings } from '@/features/shop/schemas';
import { db } from '../db/client';
import { AppError } from '../http/errors';

const DAY_MS = 86_400_000;

/** ScheduleOverride.date is a DATE column: the calendar date at UTC midnight. */
const dbDate = (d: CalendarDate) => new Date(Date.UTC(d.year, d.month - 1, d.day));

export type DayResult = { date: string; availability: DayAvailability };

/**
 * Availability of one master for `days` consecutive Tashkent dates from `from`, for a booking of
 * `durationMin`. Loads hours, overrides and bookings for the whole range in one round trip.
 */
export async function getAvailability({
  staffId,
  from,
  days = 1,
  durationMin,
  now = new Date(),
}: {
  staffId: string;
  from: CalendarDate;
  days?: number;
  durationMin: number;
  now?: Date;
}): Promise<DayResult[]> {
  if (days < 1 || days > 62) throw new AppError('invalid_input', 'days must be 1–62');

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: {
      isActive: true,
      isBookable: true,
      shop: { select: { status: true, settings: true } },
    },
  });
  if (!staff || !staff.isActive || !staff.isBookable || staff.shop.status !== 'ACTIVE') {
    throw new AppError('not_found', `staff ${staffId} is not bookable`);
  }
  const rules = parseShopSettings(staff.shop.settings);

  const last = addDays(from, days - 1);
  const rangeStart = startOfTashkentDay(from);
  const rangeEnd = new Date(startOfTashkentDay(last).getTime() + DAY_MS);

  const [weekly, overrides, bookings] = await db.$transaction([
    db.weeklyHours.findMany({
      where: { staffId },
      select: { weekday: true, startMin: true, endMin: true },
    }),
    db.scheduleOverride.findMany({
      where: { staffId, date: { gte: dbDate(from), lte: dbDate(last) } },
      select: { date: true, type: true, startMin: true, endMin: true },
    }),
    db.booking.findMany({
      where: {
        staffId,
        status: { notIn: ['CANCELLED_CLIENT', 'CANCELLED_SHOP'] },
        // A day before and after, for bookings spilling over midnight and the buffer.
        startAt: { lt: new Date(rangeEnd.getTime() + DAY_MS) },
        endAt: { gt: new Date(rangeStart.getTime() - DAY_MS) },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  const weeklyBlocks: WeeklyBlock[] = weekly;
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const key = dateKey(date);
    const dayOverrides: DayOverride[] = overrides
      .filter((o) => o.date.toISOString().slice(0, 10) === key)
      .map((o) =>
        o.type === 'DAY_OFF'
          ? { type: 'DAY_OFF' }
          : { type: 'CUSTOM_HOURS', startMin: o.startMin ?? 0, endMin: o.endMin ?? 0 },
      );
    return {
      date: key,
      availability: dayAvailability({
        date,
        weekly: weeklyBlocks,
        overrides: dayOverrides,
        busy: bookings,
        durationMin,
        rules,
        now,
      }),
    };
  });
}
