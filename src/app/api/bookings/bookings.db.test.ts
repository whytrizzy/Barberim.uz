import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, fromTashkent, tashkentDate } from '@/domain/time';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { applyBookingAction, createStaffBooking } from '@/server/services/booking';
import { PATCH } from './[id]/route';
import { POST } from './route';

type User = Parameters<typeof createStaffBooking>[0];

// End-to-end against the real database (npm run test:db): real routes, real constraint.

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 920_000_000 + Math.floor(Math.random() * 1_000_000);
const tomorrow = addDays(tashkentDate(new Date()), 1);
const at = (h: number, m = 0) => fromTashkent(tomorrow.year, tomorrow.month, tomorrow.day, h, m);

let shopId: string;
let masterStaffId: string;
let ownerStaffId: string;
let haircutId: string;
let beardId: string;
let groomId: string;
const users: Record<'owner' | 'master' | 'c1' | 'c2' | 'c3' | 'nophone', User> = {} as never;

function asUser(name: keyof typeof users, method: string, url: string, body: object) {
  const u = users[name];
  const initData = signInitData(
    { user: { id: Number(u.telegramId), first_name: u.firstName } },
    token,
  );
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: JSON.stringify(body),
  });
}

const book = (who: keyof typeof users, startAt: Date, serviceIds = [haircutId]) =>
  POST(
    asUser(who, 'POST', 'http://t/api/bookings', {
      staffId: masterStaffId,
      serviceIds,
      startAt: startAt.toISOString(),
    }),
  );

const act = (who: keyof typeof users, id: string, body: object) =>
  PATCH(asUser(who, 'PATCH', `http://t/api/bookings/${id}`, body), {
    params: Promise.resolve({ id }),
  });

const reason = async (response: Response) => (await response.json()).error?.details?.reason;

beforeAll(async () => {
  const mk = (i: number, firstName: string, phone: string | null) =>
    db.user.create({ data: { telegramId: BigInt(base + i), firstName, phone } });
  users.owner = await mk(1, 'Owner', '+998900000001');
  users.master = await mk(2, 'Master', '+998900000002');
  users.c1 = await mk(3, 'Client1', '+998900000003');
  users.c2 = await mk(4, 'Client2', '+998900000004');
  users.c3 = await mk(5, 'Client3', '+998900000005');
  users.nophone = await mk(6, 'NoPhone', null);

  const shop = await db.shop.create({
    data: {
      slug: `test-book-${Date.now().toString(36)}`,
      name: 'Booking test',
      address: 'Test',
      status: 'ACTIVE',
      settings: {
        slotStepMin: 20,
        minNoticeMin: 60,
        bufferMin: 0,
        horizonDays: 30,
        maxActiveBookingsPerClient: 2,
      },
    },
  });
  shopId = shop.id;
  ownerStaffId = (
    await db.staff.create({
      data: { shopId, userId: users.owner.id, displayName: 'Owner', role: 'OWNER' },
    })
  ).id;
  masterStaffId = (
    await db.staff.create({
      data: { shopId, userId: users.master.id, displayName: 'Master', role: 'MASTER' },
    })
  ).id;
  haircutId = (
    await db.service.create({ data: { shopId, name: 'Soch olish', durationMin: 40, price: 60000 } })
  ).id;
  beardId = (
    await db.service.create({ data: { shopId, name: 'Soqol', durationMin: 20, price: 35000 } })
  ).id;
  groomId = (
    await db.service.create({ data: { shopId, name: 'Kuyov', durationMin: 120, price: 250000 } })
  ).id;
  await db.staffService.createMany({
    data: [
      { staffId: masterStaffId, serviceId: haircutId },
      { staffId: masterStaffId, serviceId: beardId, durationOverride: 15 },
      { staffId: ownerStaffId, serviceId: haircutId },
      { staffId: ownerStaffId, serviceId: groomId },
    ],
  });
  // Every day 10:00–20:00 so the test doesn't depend on which weekday "tomorrow" is.
  await db.weeklyHours.createMany({
    data: [masterStaffId, ownerStaffId].flatMap((staffId) =>
      [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ staffId, weekday, startMin: 600, endMin: 1200 })),
    ),
  });
});

afterAll(async () => {
  if (shopId) await db.shop.delete({ where: { id: shopId } });
  await db.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } });
  await db.$disconnect();
});

let c1Booking: string;

describe('client booking', () => {
  it('books several services with frozen prices and the master’s own durations', async () => {
    const response = await book('c1', at(10), [haircutId, beardId]);
    expect(response.status).toBe(201);
    const booking = await response.json();
    c1Booking = booking.id;
    expect(booking).toMatchObject({
      status: 'CONFIRMED',
      source: 'APP',
      totalPrice: 95000,
      startAt: at(10).toISOString(),
      endAt: at(10, 55).toISOString(), // 40 + 15 (override)
      items: [
        { name: 'Soch olish', price: 60000, durationMin: 40 },
        { name: 'Soqol', price: 35000, durationMin: 15 },
      ],
    });
  });

  it('tells the next client the time is taken', async () => {
    const same = await book('c2', at(10));
    expect(same.status).toBe(409);
    expect(await reason(same)).toBe('slot_taken');
    expect(await reason(await book('c2', at(10, 20)))).toBe('slot_taken');
  });

  it('offers the gap right after a booking but refuses arbitrary minutes', async () => {
    const odd = await book('c2', at(11, 7));
    expect(await odd.json()).toMatchObject({
      error: { code: 'conflict', details: { reason: 'slot_unavailable', slot: 'not_offered' } },
    });
    expect((await book('c2', at(10, 55))).status).toBe(201);
  });

  it('lets exactly one of two simultaneous requests win', async () => {
    const [a, b] = await Promise.all([book('c1', at(12)), book('c3', at(12))]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(await reason(loser)).toBe('slot_taken');
  });

  it('limits how many upcoming bookings one client can hold', async () => {
    // c2 already holds 10:55; the limit is 2.
    expect((await book('c2', at(15))).status).toBe(201);
    const third = await book('c2', at(16));
    expect(await reason(third)).toBe('too_many_bookings');
  });

  it('requires a phone and only services this master offers', async () => {
    expect(await reason(await book('nophone', at(17)))).toBe('phone_required');
    expect(await reason(await book('c3', at(17), [groomId]))).toBe('service_unavailable');
  });

  it('keeps the frozen price when the shop changes it later', async () => {
    await db.service.update({ where: { id: haircutId }, data: { price: 80000 } });
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: c1Booking },
      include: { items: true },
    });
    expect(booking.totalPrice).toBe(95000);
    await db.service.update({ where: { id: haircutId }, data: { price: 60000 } });
  });
});

describe('booking actions', () => {
  it('lets the client move their booking, freeing the old time', async () => {
    const moved = await act('c1', c1Booking, {
      action: 'reschedule',
      as: 'client',
      startAt: at(18).toISOString(),
    });
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({
      startAt: at(18).toISOString(),
      endAt: at(18, 55).toISOString(),
    });
    expect((await book('c3', at(10))).status).toBe(201); // the old 10:00 is free again
  });

  it('lets the client cancel, and frees their booking allowance', async () => {
    const c2 = await db.booking.findFirstOrThrow({
      where: { shopId, startAt: at(15), client: { userId: users.c2.id } },
    });
    const cancelled = await act('c2', c2.id, {
      action: 'cancel',
      as: 'client',
      reason: 'Ishim chiqib qoldi',
    });
    expect(await cancelled.json()).toMatchObject({ status: 'CANCELLED_CLIENT' });
    expect((await book('c2', at(16))).status).toBe(201);
  });

  it('hides other people’s bookings from clients', async () => {
    const response = await act('c3', c1Booking, { action: 'cancel', as: 'client' });
    expect(response.status).toBe(404);
  });

  it('enforces status rules: no completing a booking that hasn’t started', async () => {
    const response = await act('master', c1Booking, { action: 'complete', as: 'staff' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { details: { reason: 'transition_refused', transition: 'not_started' } },
    });
  });

  it('lets the owner cancel any booking in the shop, as the shop', async () => {
    const response = await act('owner', c1Booking, { action: 'cancel', as: 'staff' });
    expect(await response.json()).toMatchObject({ status: 'CANCELLED_SHOP' });
    // Cancelled is final.
    const again = await act('owner', c1Booking, { action: 'confirm', as: 'staff' });
    expect(await reason(again)).toBe('transition_refused');
  });
});

describe('staff bookings', () => {
  it('lets a master add a walk-in, even after closing, but never on top of another booking', async () => {
    const late = await createStaffBooking(users.master, {
      staffId: masterStaffId,
      serviceIds: [haircutId],
      startAt: at(20, 30),
      source: 'WALK_IN',
      client: { name: 'Timur' },
    });
    expect(late).toMatchObject({ source: 'WALK_IN', status: 'CONFIRMED' });

    await expect(
      createStaffBooking(users.master, {
        staffId: masterStaffId,
        serviceIds: [haircutId],
        startAt: at(20, 50),
        source: 'WALK_IN',
        client: { name: 'Overlap' },
      }),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'slot_taken' } });
  });

  it('keeps masters out of other masters’ calendars', async () => {
    await expect(
      createStaffBooking(users.master, {
        staffId: ownerStaffId,
        serviceIds: [haircutId],
        startAt: at(11),
        source: 'PHONE',
        client: { name: 'X' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('counts visits and no-shows, and lets staff correct a mistaken mark', async () => {
    const past = new Date(Date.now() - 30 * 60_000);
    const walkIn = await createStaffBooking(users.master, {
      staffId: masterStaffId,
      serviceIds: [beardId],
      startAt: past,
      source: 'WALK_IN',
      client: { name: 'Counted', phone: '93 111 22 33' },
    });
    const clientOf = async () =>
      db.shopClient.findFirstOrThrow({ where: { bookings: { some: { id: walkIn.id } } } });
    expect((await clientOf()).phone).toBe('+998931112233');

    await applyBookingAction(users.master, walkIn.id, { action: 'complete', as: 'staff' });
    expect(await clientOf()).toMatchObject({ visitCount: 1, noShowCount: 0 });
    await applyBookingAction(users.master, walkIn.id, { action: 'no_show', as: 'staff' });
    expect(await clientOf()).toMatchObject({ visitCount: 0, noShowCount: 1 });
  });
});
