/**
 * The shop's earnings for a day, week or month: pure sums over its bookings, in Tashkent time.
 * Income is what finished visits were booked at (the shop takes cash, so this is what it should
 * have taken); the database query lives in server/services/earnings.
 */

import {
  addDays,
  dateKey,
  daysBetween,
  tashkentDate,
  toTashkent,
  weekdayOf,
  type CalendarDate,
} from './time';

export const EARNINGS_PERIODS = ['day', 'week', 'month'] as const;
export type EarningsPeriod = (typeof EARNINGS_PERIODS)[number];

export type PeriodRange = { from: CalendarDate; days: number };

/** The day itself, its week (Monday first) or its calendar month. */
export function periodRange(period: EarningsPeriod, date: CalendarDate): PeriodRange {
  if (period === 'day') return { from: date, days: 1 };
  if (period === 'week') return { from: addDays(date, 1 - weekdayOf(date)), days: 7 };
  const from = { ...date, day: 1 };
  const next =
    date.month === 12
      ? { year: date.year + 1, month: 1, day: 1 }
      : { ...from, month: from.month + 1 };
  return { from, days: daysBetween(from, next) };
}

/** The period just before, for "compared with last week". */
export function previousRange(period: EarningsPeriod, range: PeriodRange): PeriodRange {
  return periodRange(period, addDays(range.from, -1));
}

export type EarningsBooking = {
  startAt: Date;
  status: string;
  totalPrice: number;
  staffId: string;
  items: { name: string; price: number }[];
};

export type Earnings = {
  /** Finished visits, UZS. */
  revenue: number;
  visits: number;
  noShows: number;
  cancelled: number;
  /** Booked but not yet happened (or not yet marked), UZS. */
  expected: number;
  /** Of visits that were due, the share nobody came to; null with none due. */
  noShowRate: number | null;
  /** Revenue per finished visit; null with none. */
  averageTicket: number | null;
  /** Income per hour of the day (a day) or per day (a week or month). */
  series: { key: string; revenue: number }[];
  /** Bookings by the hour they start, cancelled ones left out. */
  busyHours: { hour: number; bookings: number }[];
  byMaster: { staffId: string; revenue: number; visits: number; noShows: number }[];
  /** The best sellers among finished visits, by how often. */
  topServices: { name: string; count: number; revenue: number }[];
};

const ACTIVE = new Set(['PENDING', 'CONFIRMED']);
const CANCELLED = new Set(['CANCELLED_CLIENT', 'CANCELLED_SHOP']);
export const TOP_SERVICES = 5;

export function summarizeEarnings(
  period: EarningsPeriod,
  range: PeriodRange,
  bookings: EarningsBooking[],
): Earnings {
  const done = bookings.filter((b) => b.status === 'COMPLETED');
  const noShows = bookings.filter((b) => b.status === 'NO_SHOW').length;
  const revenue = done.reduce((sum, b) => sum + b.totalPrice, 0);

  const series =
    period === 'day'
      ? Array.from({ length: 24 }, (_, hour) => ({ key: String(hour), revenue: 0 }))
      : Array.from({ length: range.days }, (_, i) => ({
          key: dateKey(addDays(range.from, i)),
          revenue: 0,
        }));
  for (const b of done) {
    const index =
      period === 'day'
        ? toTashkent(b.startAt).hour
        : daysBetween(range.from, tashkentDate(b.startAt));
    const bucket = series[index];
    if (bucket) bucket.revenue += b.totalPrice;
  }

  const hours = new Map<number, number>();
  for (const b of bookings) {
    if (CANCELLED.has(b.status)) continue;
    const hour = toTashkent(b.startAt).hour;
    hours.set(hour, (hours.get(hour) ?? 0) + 1);
  }

  const masters = new Map<string, Earnings['byMaster'][number]>();
  for (const b of bookings) {
    if (b.status !== 'COMPLETED' && b.status !== 'NO_SHOW') continue;
    const row = masters.get(b.staffId) ?? { staffId: b.staffId, revenue: 0, visits: 0, noShows: 0 };
    if (b.status === 'COMPLETED') {
      row.revenue += b.totalPrice;
      row.visits++;
    } else {
      row.noShows++;
    }
    masters.set(b.staffId, row);
  }

  const services = new Map<string, Earnings['topServices'][number]>();
  for (const item of done.flatMap((b) => b.items)) {
    const row = services.get(item.name) ?? { name: item.name, count: 0, revenue: 0 };
    row.count++;
    row.revenue += item.price;
    services.set(item.name, row);
  }

  const due = done.length + noShows;
  return {
    revenue,
    visits: done.length,
    noShows,
    cancelled: bookings.filter((b) => CANCELLED.has(b.status)).length,
    expected: bookings.filter((b) => ACTIVE.has(b.status)).reduce((s, b) => s + b.totalPrice, 0),
    noShowRate: due > 0 ? noShows / due : null,
    averageTicket: done.length > 0 ? Math.round(revenue / done.length) : null,
    series,
    busyHours: [...hours]
      .map(([hour, count]) => ({ hour, bookings: count }))
      .sort((a, b) => a.hour - b.hour),
    byMaster: [...masters.values()].sort((a, b) => b.revenue - a.revenue),
    topServices: [...services.values()]
      .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
      .slice(0, TOP_SERVICES),
  };
}
