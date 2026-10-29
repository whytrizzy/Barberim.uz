import 'server-only';
import {
  dayAvailability,
  type BookingRules,
  type BusyInterval,
  type DayAvailability,
  type DayInput,
  type DayOverride,
  type WeeklyBlock,
} from '@/domain/availability';
import { combineMasters, groupDuration, type CombinedDay, type MasterDay } from '@/domain/combine';
import { addDays, dateKey, startOfTashkentDay, type CalendarDate } from '@/domain/time';
import { parseShopSettings, type ShopSettings } from '@/features/shop/schemas';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { mastersOffering, priceParties } from './catalog';

const DAY_MS = 86_400_000;

/** ScheduleOverride.date is a DATE column: the calendar date at UTC midnight. */
const dbDate = (d: CalendarDate) => new Date(Date.UTC(d.year, d.month - 1, d.day));

export type Schedule = {
  shopId: string;
  settings: ShopSettings;
  rules: BookingRules;
  weekly: WeeklyBlock[];
  overridesFor: (date: CalendarDate) => DayOverride[];
  busy: BusyInterval[];
};

/**
 * Everything the availability engine needs about one bookable master for a range of dates,
 * in one round trip. `excludeBookingId` leaves a booking out of "busy" (rescheduling it).
 */
export async function loadSchedule(
  staffId: string,
  from: CalendarDate,
  days: number,
  { excludeBookingId }: { excludeBookingId?: string } = {},
): Promise<Schedule> {
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: {
      shopId: true,
      isActive: true,
      isBookable: true,
      shop: { select: { status: true, settings: true } },
    },
  });
  if (!staff || !staff.isActive || !staff.isBookable || staff.shop.status !== 'ACTIVE') {
    throw new AppError('not_found', `staff ${staffId} is not bookable`);
  }
  const settings = parseShopSettings(staff.shop.settings);

  const last = addDays(from, days - 1);
  const rangeStart = startOfTashkentDay(from);
  const rangeEnd = new Date(startOfTashkentDay(last).getTime() + DAY_MS);

  const [weekly, overrides, busy] = await db.$transaction([
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
        ...(excludeBookingId && { id: { not: excludeBookingId } }),
        // A day before and after, for bookings spilling over midnight and the buffer.
        startAt: { lt: new Date(rangeEnd.getTime() + DAY_MS) },
        endAt: { gt: new Date(rangeStart.getTime() - DAY_MS) },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  return {
    shopId: staff.shopId,
    settings,
    rules: settings,
    weekly,
    busy,
    overridesFor: (date) => {
      const key = dateKey(date);
      return overrides
        .filter((o) => o.date.toISOString().slice(0, 10) === key)
        .map((o) =>
          o.type === 'DAY_OFF'
            ? { type: 'DAY_OFF' }
            : { type: 'CUSTOM_HOURS', startMin: o.startMin ?? 0, endMin: o.endMin ?? 0 },
        );
    },
  };
}

export function dayInput(
  schedule: Schedule,
  date: CalendarDate,
  durationMin: number,
  now: Date,
): DayInput {
  return {
    date,
    weekly: schedule.weekly,
    overrides: schedule.overridesFor(date),
    busy: schedule.busy,
    durationMin,
    rules: schedule.rules,
    now,
  };
}

export type DayResult = { date: string; availability: DayAvailability };

/** Availability of one master for `days` consecutive Tashkent dates from `from`. */
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
  const schedule = await loadSchedule(staffId, from, days);
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    return {
      date: dateKey(date),
      availability: dayAvailability(dayInput(schedule, date, durationMin, now)),
    };
  });
}

/**
 * One master's availability for the chosen services: for one person, or a family back to back
 * (`parties` = each person's services). The duration uses the master's own service times.
 */
export async function getMasterAvailability({
  staffId,
  parties,
  from,
  days = 1,
  now = new Date(),
}: {
  staffId: string;
  parties: string[][];
  from: CalendarDate;
  days?: number;
  now?: Date;
}): Promise<DayResult[]> {
  const staff = await db.staff.findUnique({ where: { id: staffId }, select: { shopId: true } });
  if (!staff) throw new AppError('not_found', 'staff not found');
  const durationMin = groupDuration(await priceParties(staffId, staff.shopId, parties));
  return getAvailability({ staffId, from, days, durationMin, now });
}

export type CombinedDayResult = { date: string; availability: CombinedDay };

/**
 * "Any free master": every bookable master who offers all the chosen services, merged per day.
 * Each slot lists who can take it, least busy first.
 */
export async function getShopAvailability({
  shopId,
  parties,
  from,
  days = 1,
  now = new Date(),
}: {
  shopId: string;
  parties: string[][];
  from: CalendarDate;
  days?: number;
  now?: Date;
}): Promise<CombinedDayResult[]> {
  if (days < 1 || days > 62) throw new AppError('invalid_input', 'days must be 1–62');
  const masters = await mastersOffering(shopId, parties.flat());
  const perMaster = await Promise.all(
    masters.map(async (m) => {
      const durationMin = groupDuration(await priceParties(m.id, shopId, parties));
      const schedule = await loadSchedule(m.id, from, days);
      return { master: m, durationMin, schedule };
    }),
  );
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const dayStart = startOfTashkentDay(date).getTime();
    const dayEnd = dayStart + DAY_MS;
    const masterDays: MasterDay[] = perMaster.map(({ master, durationMin, schedule }) => ({
      staffId: master.id,
      sortOrder: master.sortOrder,
      load: schedule.busy.filter(
        (b) => b.startAt.getTime() >= dayStart && b.startAt.getTime() < dayEnd,
      ).length,
      availability: dayAvailability(dayInput(schedule, date, durationMin, now)),
    }));
    return { date: dateKey(date), availability: combineMasters(masterDays) };
  });
}
