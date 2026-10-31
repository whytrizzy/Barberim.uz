import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, dateKey, tashkentDate } from '@/domain/time';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { DELETE, POST } from './[id]/staff/[staffId]/schedule/changes/route';
import { GET, PUT } from './[id]/staff/[staffId]/schedule/route';
import { POST as createShop } from './route';

// Weekly hours and one-off changes against the real database (npm run test:db).

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 980_000_000 + Math.floor(Math.random() * 1_000_000);
const userIds = { owner: BigInt(base + 1), master: BigInt(base + 2), other: BigInt(base + 3) };
type Who = keyof typeof userIds;
let shopId = '';
let ownerStaffId = '';
let masterStaffId = '';
let otherStaffId = '';

const today = tashkentDate(new Date());
const inDays = (days: number) => dateKey(addDays(today, days));

function req(who: Who, method: string, body?: object, query = '') {
  const initData = signInitData({ user: { id: Number(userIds[who]), first_name: who } }, token);
  return new Request(`http://t/api${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const on = (staffId: string) => ({ params: Promise.resolve({ id: shopId, staffId }) });

const week = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
  { weekday, startMin: 540, endMin: 780 },
  { weekday, startMin: 840, endMin: 1140 },
]);

const setWeek = (who: Who, staffId: string, weekly: object[]) =>
  PUT(req(who, 'PUT', { weekly }), on(staffId));
const change = (who: Who, staffId: string, body: object) =>
  POST(req(who, 'POST', body), on(staffId));
const read = async (who: Who, staffId: string) => (await GET(req(who, 'GET'), on(staffId))).json();

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const response = await createShop(
    req('owner', 'POST', {
      slug: `hours-${Date.now().toString(36)}`,
      name: 'Hours Barber',
      region: 'tashkent-city',
      district: 'yunusobod',
      address: '4-mavze, 12-uy',
    }),
  );
  shopId = (await response.json()).id;
  ownerStaffId = (await db.staff.findFirstOrThrow({ where: { shopId } })).id;
  const addMember = async (who: Who, displayName: string) => {
    const user = await db.user.create({
      data: { telegramId: userIds[who], firstName: displayName },
    });
    return (await db.staff.create({ data: { shopId, userId: user.id, displayName } })).id;
  };
  masterStaffId = await addMember('master', 'Master');
  otherStaffId = await addMember('other', 'Other');
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.booking.deleteMany({ where: { shopId } });
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(userIds) } } });
  await db.$disconnect();
});

describe('weekly hours', () => {
  it('saves a week with breaks and replaces it on the next save', async () => {
    const response = await setWeek('master', masterStaffId, week);
    expect(response.status).toBe(200);
    const schedule = await response.json();
    expect(schedule.weekly).toHaveLength(14);
    expect(schedule.canEdit).toBe(true);
    expect(schedule.today.blocks).toEqual([
      { startMin: 540, endMin: 780 },
      { startMin: 840, endMin: 1140 },
    ]);

    const shorter = await setWeek('master', masterStaffId, week.slice(0, 2));
    expect((await shorter.json()).weekly).toHaveLength(2);
    await setWeek('master', masterStaffId, week);
  });

  it('refuses overlapping or malformed hours', async () => {
    const overlap = [
      { weekday: 1, startMin: 540, endMin: 800 },
      { weekday: 1, startMin: 780, endMin: 900 },
    ];
    expect((await setWeek('owner', masterStaffId, overlap)).status).toBe(400);
    const backwards = [{ weekday: 1, startMin: 900, endMin: 540 }];
    expect((await setWeek('owner', masterStaffId, backwards)).status).toBe(400);
    const wrongDay = [{ weekday: 8, startMin: 540, endMin: 900 }];
    expect((await setWeek('owner', masterStaffId, wrongDay)).status).toBe(400);
    const uneven = [{ weekday: 1, startMin: 541, endMin: 900 }];
    expect((await setWeek('owner', masterStaffId, uneven)).status).toBe(400);
  });

  it('lets masters run only their own hours; owners run everyone’s', async () => {
    expect((await setWeek('owner', masterStaffId, week)).status).toBe(200);
    expect((await setWeek('master', otherStaffId, week)).status).toBe(403);
    expect((await setWeek('master', ownerStaffId, week)).status).toBe(403);
    expect((await read('master', otherStaffId)).canEdit).toBe(false);
    expect(
      (await change('master', otherStaffId, { kind: 'leave_at', date: inDays(0), leaveAt: 960 }))
        .status,
    ).toBe(403);
    const outsider = new Request('http://t/api', {
      headers: {
        Authorization: `tma ${signInitData({ user: { id: base + 9, first_name: 'x' } }, token)}`,
      },
    });
    expect((await GET(outsider, on(masterStaffId))).status).toBe(403);
    await db.user.deleteMany({ where: { telegramId: BigInt(base + 9) } });
  });
});

describe('changes', () => {
  it('sets a vacation as one row, and undoes part of it', async () => {
    const response = await change('master', masterStaffId, {
      kind: 'day_off',
      from: inDays(10),
      to: inDays(14),
      reason: 'vacation',
    });
    expect(response.status).toBe(201);
    const { changes } = await response.json();
    expect(changes).toEqual([
      {
        from: inDays(10),
        to: inDays(14),
        type: 'DAY_OFF',
        reason: 'vacation',
        blocks: [],
      },
    ]);
    const removed = await DELETE(
      req('master', 'DELETE', undefined, `?from=${inDays(10)}&to=${inDays(14)}`),
      on(masterStaffId),
    );
    expect((await removed.json()).changes).toEqual([]);
  });

  it('applies special hours with a break to a range, replacing what was there', async () => {
    await change('owner', masterStaffId, {
      kind: 'day_off',
      from: inDays(21),
      to: inDays(21),
      reason: 'other',
    });
    const blocks = [
      { startMin: 600, endMin: 1020 },
      { startMin: 1200, endMin: 1380 },
    ];
    const response = await change('owner', masterStaffId, {
      kind: 'custom_hours',
      from: inDays(20),
      to: inDays(22),
      reason: 'ramadan',
      blocks,
    });
    const { changes } = await response.json();
    expect(changes).toEqual([
      { from: inDays(20), to: inDays(22), type: 'CUSTOM_HOURS', reason: 'ramadan', blocks },
    ]);
    await DELETE(
      req('owner', 'DELETE', undefined, `?from=${inDays(20)}&to=${inDays(22)}`),
      on(masterStaffId),
    );
  });

  it('refuses the past, reversed dates and ranges that are too long', async () => {
    const dayOff = (from: string, to: string) =>
      change('owner', masterStaffId, { kind: 'day_off', from, to, reason: 'other' });
    expect((await dayOff(inDays(-1), inDays(1))).status).toBe(400);
    expect((await dayOff(inDays(5), inDays(4))).status).toBe(400);
    const tooLong = await dayOff(inDays(1), inDays(91));
    expect((await tooLong.json()).error.details.reason).toBe('bad_dates');
    expect((await dayOff('2026-02-31', inDays(1))).status).toBe(400);
  });

  it('cuts today short with "I leave at", keeping the break', async () => {
    const response = await change('master', masterStaffId, {
      kind: 'leave_at',
      date: inDays(0),
      leaveAt: 960,
    });
    expect(response.status).toBe(201);
    const schedule = await response.json();
    const expected = [
      { startMin: 540, endMin: 780 },
      { startMin: 840, endMin: 960 },
    ];
    expect(schedule.today.blocks).toEqual(expected);
    expect(schedule.changes[0]).toMatchObject({ reason: 'leave_early', blocks: expected });

    // Earlier still: it works from what's already set, and before opening there's nothing left.
    const earlier = await change('master', masterStaffId, {
      kind: 'leave_at',
      date: inDays(0),
      leaveAt: 720,
    });
    expect((await earlier.json()).today.blocks).toEqual([{ startMin: 540, endMin: 720 }]);
    const nothing = await change('master', masterStaffId, {
      kind: 'leave_at',
      date: inDays(0),
      leaveAt: 300,
    });
    expect((await nothing.json()).error.details.reason).toBe('not_working_today');
    await DELETE(
      req('master', 'DELETE', undefined, `?from=${inDays(0)}&to=${inDays(0)}`),
      on(masterStaffId),
    );
  });

  it('keeps bookings when hours change, and reports the ones left outside', async () => {
    const client = await db.shopClient.create({ data: { shopId, name: 'Client' } });
    const date = addDays(today, 3);
    const start = new Date(Date.UTC(date.year, date.month - 1, date.day, 5)); // 10:00 Tashkent
    await db.booking.create({
      data: {
        shopId,
        staffId: masterStaffId,
        shopClientId: client.id,
        startAt: start,
        endAt: new Date(start.getTime() + 30 * 60 * 1000),
        totalPrice: 60_000,
      },
    });
    expect((await read('master', masterStaffId)).bookingsOutsideHours).toBe(0);

    const response = await change('master', masterStaffId, {
      kind: 'day_off',
      from: inDays(3),
      to: inDays(3),
      reason: 'other',
    });
    expect((await response.json()).bookingsOutsideHours).toBe(1);
    expect(await db.booking.count({ where: { staffId: masterStaffId } })).toBe(1);
  });
});
