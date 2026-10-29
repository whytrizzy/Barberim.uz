import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fromTashkent } from '@/domain/time';
import { db } from '../db/client';
import { getAvailability } from './availability';

// Runs against the real database (npm run test:db). Fixture: Tue 8 – Thu 10 Jan 2030.

const tuesday = { year: 2030, month: 1, day: 8 };
const now = fromTashkent(2030, 1, 7, 9, 0); // Monday morning
const hm = (h: number, m = 0) => h * 60 + m;
const label = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

let shopId: string;
let staffId: string;

beforeAll(async () => {
  const shop = await db.shop.create({
    data: {
      slug: `test-avail-${Date.now().toString(36)}`,
      name: 'Availability test',
      address: 'Test',
      status: 'ACTIVE',
      // An invalid step falls back to the default (20); the rest is taken as given.
      settings: { slotStepMin: 'oops', minNoticeMin: 60, bufferMin: 0, horizonDays: 30 },
    },
  });
  shopId = shop.id;
  staffId = (await db.staff.create({ data: { shopId, displayName: 'Master' } })).id;
  const client = await db.shopClient.create({ data: { shopId, name: 'Client' } });

  await db.weeklyHours.createMany({
    data: [2, 3, 4].flatMap((weekday) => [
      { staffId, weekday, startMin: hm(10), endMin: hm(13, 20) },
      { staffId, weekday, startMin: hm(14), endMin: hm(20) },
    ]),
  });
  await db.scheduleOverride.createMany({
    data: [
      { staffId, date: new Date(Date.UTC(2030, 0, 9)), type: 'DAY_OFF' },
      {
        staffId,
        date: new Date(Date.UTC(2030, 0, 10)),
        type: 'CUSTOM_HOURS',
        startMin: hm(10),
        endMin: hm(16),
      },
    ],
  });
  const booking = (h: number, m: number, status: 'CONFIRMED' | 'CANCELLED_CLIENT') => ({
    shopId,
    staffId,
    shopClientId: client.id,
    startAt: fromTashkent(2030, 1, 8, h, m),
    endAt: fromTashkent(2030, 1, 8, h, m + 40),
    totalPrice: 60000,
    status,
  });
  await db.booking.createMany({
    data: [booking(10, 0, 'CONFIRMED'), booking(11, 0, 'CANCELLED_CLIENT')],
  });
});

afterAll(async () => {
  if (shopId) await db.shop.delete({ where: { id: shopId } });
  await db.$disconnect();
});

describe('getAvailability', () => {
  it('combines hours, overrides and bookings from the database', async () => {
    const [tue, wed, thu] = await getAvailability({
      staffId,
      from: tuesday,
      days: 3,
      durationMin: 40,
      now,
    });
    expect(tue?.date).toBe('2030-01-08');

    const state = (t: string) =>
      tue?.availability.slots.find((s) => label(s.startMin) === t)?.state;
    expect(tue?.availability.status).toBe('open');
    expect(state('10:00')).toBe('taken');
    expect(state('10:40')).toBe('available');
    expect(state('11:00')).toBe('available'); // the cancelled booking freed it

    expect(wed?.availability.status).toBe('day_off');

    const thuSlots = thu?.availability.slots ?? [];
    expect(label(thuSlots[thuSlots.length - 1]?.startMin ?? 0)).toBe('15:20'); // custom hours end 16:00
  });

  it('uses the default step when the shop setting is invalid', async () => {
    const [tue] = await getAvailability({ staffId, from: tuesday, durationMin: 40, now });
    const grid = tue?.availability.slots.slice(1, 3).map((s) => label(s.startMin));
    expect(grid).toEqual(['10:20', '10:40']);
  });

  it('refuses masters who are not bookable', async () => {
    await db.staff.update({ where: { id: staffId }, data: { isBookable: false } });
    await expect(
      getAvailability({ staffId, from: tuesday, durationMin: 40, now }),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
    await db.staff.update({ where: { id: staffId }, data: { isBookable: true } });
  });
});
