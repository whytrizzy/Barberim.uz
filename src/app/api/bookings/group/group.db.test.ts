import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, fromTashkent, tashkentDate } from '@/domain/time';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { getMasterAvailability, getShopAvailability } from '@/server/services/availability';
import { createStaffBooking } from '@/server/services/booking';
import { POST as single } from '../route';
import { POST as group } from './route';

// "Any free master" and family bookings against the real database (npm run test:db).

type User = Parameters<typeof createStaffBooking>[0];

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 930_000_000 + Math.floor(Math.random() * 1_000_000);
const tomorrow = addDays(tashkentDate(new Date()), 1);
const at = (h: number, m = 0) => fromTashkent(tomorrow.year, tomorrow.month, tomorrow.day, h, m);
const label = (iso: string) => iso.slice(11, 16); // UTC HH:MM, compared against at() below

let shopId: string;
let masterA: string;
let masterB: string;
let haircut: string;
let kids: string;
let beard: string;
const users = {} as Record<'owner' | 'parent' | 'c2' | 'c3' | 'c4', User>;

function request(who: keyof typeof users, url: string, body: object) {
  const u = users[who];
  const initData = signInitData(
    { user: { id: Number(u.telegramId), first_name: u.firstName } },
    token,
  );
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: JSON.stringify(body),
  });
}

const bookAny = (who: keyof typeof users, startAt: Date, serviceIds = [haircut]) =>
  single(
    request(who, 'http://t/api/bookings', {
      staffId: 'any',
      shopId,
      serviceIds,
      startAt: startAt.toISOString(),
    }),
  );

const bookFamily = (who: keyof typeof users, staffId: string, startAt: Date, parties: object[]) =>
  group(
    request(who, 'http://t/api/bookings/group', {
      staffId,
      shopId,
      startAt: startAt.toISOString(),
      parties,
    }),
  );

const json = async (r: Response) => r.json();

beforeAll(async () => {
  const mk = (i: number, firstName: string) =>
    db.user.create({
      data: { telegramId: BigInt(base + i), firstName, phone: `+9989000000${10 + i}` },
    });
  users.owner = await mk(1, 'Owner');
  users.parent = await mk(2, 'Ota');
  users.c2 = await mk(3, 'C2');
  users.c3 = await mk(4, 'C3');
  users.c4 = await mk(5, 'C4');

  shopId = (
    await db.shop.create({
      data: {
        slug: `test-group-${Date.now().toString(36)}`,
        name: 'Group test',
        address: 'Test',
        status: 'ACTIVE',
        settings: { slotStepMin: 20, minNoticeMin: 60, maxActiveBookingsPerClient: 2 },
      },
    })
  ).id;
  masterA = (
    await db.staff.create({
      data: { shopId, userId: users.owner.id, displayName: 'A', role: 'OWNER', sortOrder: 1 },
    })
  ).id;
  masterB = (await db.staff.create({ data: { shopId, displayName: 'B', sortOrder: 2 } })).id;
  haircut = (
    await db.service.create({ data: { shopId, name: 'Soch', durationMin: 40, price: 60000 } })
  ).id;
  kids = (
    await db.service.create({
      data: { shopId, name: 'Bolalar', category: 'KIDS', durationMin: 30, price: 40000 },
    })
  ).id;
  beard = (
    await db.service.create({ data: { shopId, name: 'Soqol', durationMin: 20, price: 35000 } })
  ).id;
  await db.staffService.createMany({
    data: [
      { staffId: masterA, serviceId: haircut },
      { staffId: masterA, serviceId: kids },
      { staffId: masterA, serviceId: beard }, // only A shaves
      { staffId: masterB, serviceId: haircut },
      { staffId: masterB, serviceId: kids, durationOverride: 20 },
    ],
  });
  await db.weeklyHours.createMany({
    data: [masterA, masterB].flatMap((staffId) =>
      [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ staffId, weekday, startMin: 600, endMin: 1200 })),
    ),
  });
});

afterAll(async () => {
  if (shopId) await db.shop.delete({ where: { id: shopId } });
  await db.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } });
  await db.$disconnect();
});

describe('any free master', () => {
  it('lists every master who can take each start, best first', async () => {
    const [day] = await getShopAvailability({ shopId, parties: [[haircut]], from: tomorrow });
    expect(day?.availability.status).toBe('open');
    const ten = day?.availability.slots.find((s) => s.startAt.getTime() === at(10).getTime());
    expect(ten).toMatchObject({ state: 'available', candidates: [masterA, masterB] });
  });

  it('gives each client the next free master, then says taken when nobody is left', async () => {
    const first = await json(await bookAny('c2', at(10)));
    const second = await json(await bookAny('c3', at(10)));
    expect([first.staffId, second.staffId]).toEqual([masterA, masterB]);

    const third = await bookAny('c4', at(10));
    expect(third.status).toBe(409);
    expect((await json(third)).error.details.reason).toBe('slot_taken');

    const [day] = await getShopAvailability({ shopId, parties: [[haircut]], from: tomorrow });
    const ten = day?.availability.slots.find((s) => s.startAt.getTime() === at(10).getTime());
    expect(ten).toMatchObject({ state: 'taken', candidates: [] });
  });

  it('only considers masters who offer every chosen service', async () => {
    // Beard is A-only; A is busy at 10:00, so B (who doesn't shave) can't step in.
    expect((await json(await bookAny('c4', at(10), [haircut, beard]))).error.details.reason).toBe(
      'slot_taken',
    );
    expect((await json(await bookAny('c4', at(11), [haircut, beard]))).staffId).toBe(masterA);
  });

  it('shares the work: the less busy master is chosen first', async () => {
    // A now has 2 bookings tomorrow, B has 1.
    expect((await json(await bookAny('c3', at(12)))).staffId).toBe(masterB);
  });
});

describe('any free master under a race', () => {
  it('seats two simultaneous clients with two different masters instead of failing one', async () => {
    const [a, b] = await Promise.all([bookAny('c2', at(13)), bookAny('c4', at(13))]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const staff = [(await json(a)).staffId, (await json(b)).staffId].sort();
    expect(staff).toEqual([masterA, masterB].sort());
  });
});

describe('family booking', () => {
  it('books a father and two sons back to back, using the master’s own times', async () => {
    const response = await bookFamily('parent', masterB, at(14), [
      { serviceIds: [haircut], label: 'Ota' },
      { serviceIds: [kids], label: 'Ali' },
      { serviceIds: [kids], label: 'Vali' },
    ]);
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body.bookings).toHaveLength(3);
    expect(new Set(body.bookings.map((b: { groupId: string }) => b.groupId))).toEqual(
      new Set([body.groupId]),
    );
    expect(
      body.bookings.map((b: { startAt: string; endAt: string }) => [
        label(b.startAt),
        label(b.endAt),
      ]),
    ).toEqual([
      [label(at(14).toISOString()), label(at(14, 40).toISOString())],
      [label(at(14, 40).toISOString()), label(at(15).toISOString())], // B's kids: 20 min
      [label(at(15).toISOString()), label(at(15, 20).toISOString())],
    ]);
    expect(body.bookings.map((b: { note: string }) => b.note)).toEqual(['Ota', 'Ali', 'Vali']);
    expect(body.bookings.map((b: { totalPrice: number }) => b.totalPrice)).toEqual([
      60000, 40000, 40000,
    ]);
  });

  it('is all or nothing: one conflict anywhere means no booking at all', async () => {
    await createStaffBooking(users.owner, {
      staffId: masterA,
      serviceIds: [haircut],
      startAt: at(16, 50),
      source: 'WALK_IN',
      client: { name: 'Walk-in' },
    });
    const before = await db.booking.count({ where: { shopId } });
    // 16:00 + 40 + 30 + 30 = 17:40 would run into the 16:50 walk-in.
    const response = await bookFamily('c4', masterA, at(16), [
      { serviceIds: [haircut] },
      { serviceIds: [kids] },
      { serviceIds: [kids] },
    ]);
    expect(response.status).toBe(409);
    expect(await db.booking.count({ where: { shopId } })).toBe(before);
  });

  it('counts a family once towards the client’s booking limit', async () => {
    // The limit is 2: the family is one, so one more booking fits, then no more.
    expect(
      (
        await single(
          request('parent', 'http://t/api/bookings', {
            staffId: masterA,
            serviceIds: [haircut],
            startAt: at(18).toISOString(),
          }),
        )
      ).status,
    ).toBe(201);
    const third = await bookAny('parent', at(19));
    expect((await json(third)).error.details.reason).toBe('too_many_bookings');
  });

  it('shows a master’s free times for the whole family', async () => {
    const [day] = await getMasterAvailability({
      staffId: masterB,
      parties: [[haircut], [kids], [kids]],
      from: tomorrow,
    });
    const free = day?.availability.slots.filter((s) => s.state === 'available') ?? [];
    // 80 minutes (40 + 20 + 20) must fit before 20:00.
    expect(free[free.length - 1]?.endAt.getTime()).toBeLessThanOrEqual(at(20).getTime());
    expect(free.at(-1)?.startAt.getTime()).toBe(at(18, 40).getTime());
  });
});
