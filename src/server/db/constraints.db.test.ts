import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fromTashkent } from '@/domain/time';
import { db } from './client';

// Runs against the real database (npm run test:db). Creates a throwaway shop and removes it.

let shopId: string;
let staffA: string;
let staffB: string;
let clientId: string;

const at = (h: number, m: number) => fromTashkent(2030, 1, 7, h, m);
const minutes = (n: number) => n * 60_000;

function booking(staffId: string, start: Date, lengthMin: number, extra: object = {}) {
  return db.booking.create({
    data: {
      shopId,
      staffId,
      shopClientId: clientId,
      startAt: start,
      endAt: new Date(start.getTime() + minutes(lengthMin)),
      totalPrice: 60000,
      ...extra,
    },
  });
}

/** Postgres error text of a failed write (Prisma wraps it; the constraint name is in there). */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return String(error instanceof Error ? error.message : error);
  }
  throw new Error('expected the write to be rejected');
}

beforeAll(async () => {
  const shop = await db.shop.create({
    data: { slug: `test-${Date.now().toString(36)}`, name: 'Test shop', address: 'Test' },
  });
  shopId = shop.id;
  staffA = (await db.staff.create({ data: { shopId, displayName: 'A' } })).id;
  staffB = (await db.staff.create({ data: { shopId, displayName: 'B' } })).id;
  clientId = (await db.shopClient.create({ data: { shopId, name: 'Client' } })).id;
});

afterAll(async () => {
  if (shopId) await db.shop.delete({ where: { id: shopId } }); // cascades to everything above
  await db.$disconnect();
});

describe('bookings_no_overlap', () => {
  it('rejects a second booking that overlaps the same master', async () => {
    await booking(staffA, at(10, 0), 40); // 10:00–10:40
    expect(await failure(booking(staffA, at(10, 20), 40))).toMatch(/bookings_no_overlap/);
    expect(await failure(booking(staffA, at(9, 30), 120))).toMatch(/bookings_no_overlap/);
  });

  it('allows back-to-back bookings (ranges are half-open)', async () => {
    await expect(booking(staffA, at(10, 40), 40)).resolves.toBeTruthy(); // 10:40–11:20
  });

  it('allows the same time with a different master', async () => {
    await expect(booking(staffB, at(10, 0), 40)).resolves.toBeTruthy();
  });

  it('frees the time when a booking is cancelled', async () => {
    const first = await booking(staffA, at(12, 0), 40);
    await db.booking.update({ where: { id: first.id }, data: { status: 'CANCELLED_CLIENT' } });
    await expect(booking(staffA, at(12, 0), 40)).resolves.toBeTruthy();
  });

  it('keeps completed and no-show bookings blocking their time', async () => {
    await booking(staffA, at(15, 0), 40, { status: 'COMPLETED' });
    expect(await failure(booking(staffA, at(15, 0), 40))).toMatch(/bookings_no_overlap/);
    await booking(staffA, at(16, 0), 40, { status: 'NO_SHOW' });
    expect(await failure(booking(staffA, at(16, 10), 20))).toMatch(/bookings_no_overlap/);
  });

  it('rejects two overlapping bookings sent at the same moment (race)', async () => {
    const results = await Promise.allSettled([
      booking(staffB, at(17, 0), 40),
      booking(staffB, at(17, 0), 40),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});

describe('value checks', () => {
  it('rejects a booking that ends before it starts', async () => {
    expect(await failure(booking(staffB, at(19, 0), -10))).toMatch(/bookings_time_order/);
  });

  it('rejects invalid schedules and phone numbers', async () => {
    expect(
      await failure(
        db.weeklyHours.create({
          data: { staffId: staffA, weekday: 8, startMin: 600, endMin: 1200 },
        }),
      ),
    ).toMatch(/weekly_hours_values/);
    expect(
      await failure(db.shopClient.create({ data: { shopId, name: 'X', phone: '901234567' } })),
    ).toMatch(/shop_clients_phone_e164/);
  });
});
