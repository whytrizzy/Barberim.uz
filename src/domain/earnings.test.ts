import { describe, expect, it } from 'vitest';
import { periodRange, previousRange, summarizeEarnings, type EarningsBooking } from './earnings';
import { dateKey, fromTashkent } from './time';

const wed = { year: 2030, month: 1, day: 9 }; // a Wednesday

describe('periodRange', () => {
  it('takes the day, its Monday-first week, or its calendar month', () => {
    expect(periodRange('day', wed)).toEqual({ from: wed, days: 1 });
    expect(periodRange('week', wed)).toEqual({ from: { year: 2030, month: 1, day: 7 }, days: 7 });
    expect(periodRange('month', wed)).toEqual({ from: { year: 2030, month: 1, day: 1 }, days: 31 });
    expect(periodRange('month', { year: 2028, month: 2, day: 10 }).days).toBe(29);
    expect(periodRange('month', { year: 2030, month: 12, day: 31 }).days).toBe(31);
  });

  it('finds the period before, across a year end', () => {
    const jan = periodRange('month', wed);
    expect(previousRange('month', jan)).toEqual({
      from: { year: 2029, month: 12, day: 1 },
      days: 31,
    });
    expect(previousRange('week', periodRange('week', wed)).from).toEqual({
      year: 2029,
      month: 12,
      day: 31,
    });
  });
});

const at = (day: number, hour: number) => fromTashkent(2030, 1, day, hour);
const visit = (
  startAt: Date,
  status: string,
  price: number,
  staffId = 'a',
  name = 'Soch olish',
): EarningsBooking => ({ startAt, status, totalPrice: price, staffId, items: [{ name, price }] });

describe('summarizeEarnings', () => {
  const week = periodRange('week', wed);
  const bookings = [
    visit(at(7, 10), 'COMPLETED', 60_000),
    visit(at(7, 23), 'COMPLETED', 60_000), // late at night: still Monday in Tashkent
    visit(at(9, 15), 'COMPLETED', 90_000, 'b', 'Soch + soqol'),
    visit(at(9, 16), 'NO_SHOW', 60_000, 'b'),
    visit(at(10, 15), 'CANCELLED_CLIENT', 60_000),
    visit(at(12, 11), 'CONFIRMED', 35_000, 'a', 'Soqol'),
  ];
  const sum = summarizeEarnings('week', week, bookings);

  it('counts only finished visits as income', () => {
    expect(sum).toMatchObject({
      revenue: 210_000,
      visits: 3,
      noShows: 1,
      cancelled: 1,
      expected: 35_000,
      averageTicket: 70_000,
      noShowRate: 0.25,
    });
  });

  it('spreads income over the days of the week, in Tashkent time', () => {
    expect(sum.series.map((d) => d.revenue)).toEqual([120_000, 0, 90_000, 0, 0, 0, 0]);
    expect(sum.series[0]?.key).toBe(dateKey(week.from));
  });

  it('splits by master, best first, and ranks services by how often they sold', () => {
    expect(sum.byMaster).toEqual([
      { staffId: 'a', revenue: 120_000, visits: 2, noShows: 0 },
      { staffId: 'b', revenue: 90_000, visits: 1, noShows: 1 },
    ]);
    expect(sum.topServices.map((s) => [s.name, s.count])).toEqual([
      ['Soch olish', 2],
      ['Soch + soqol', 1],
    ]);
  });

  it('counts busy hours from every booking that stands', () => {
    expect(sum.busyHours).toEqual([
      { hour: 10, bookings: 1 },
      { hour: 11, bookings: 1 },
      { hour: 15, bookings: 1 },
      { hour: 16, bookings: 1 },
      { hour: 23, bookings: 1 },
    ]);
  });

  it('spreads a day by hour, and has no rates with nothing due', () => {
    const day = summarizeEarnings('day', periodRange('day', wed), [
      visit(at(9, 15), 'COMPLETED', 90_000),
    ]);
    expect(day.series).toHaveLength(24);
    expect(day.series[15]?.revenue).toBe(90_000);
    const empty = summarizeEarnings('day', periodRange('day', wed), []);
    expect(empty).toMatchObject({ revenue: 0, noShowRate: null, averageTicket: null });
  });
});
