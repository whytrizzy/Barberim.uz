import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, dateKey, startOfTashkentDay, tashkentDate, weekdayOf } from '@/domain/time';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { PATCH as act } from '../bookings/[id]/route';
import { GET as detail } from './[id]/bookings/[bookingId]/route';
import { GET } from './[id]/calendar/route';
import { POST as createShop } from './route';

// The staff calendar against the real database (npm run test:db).

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 990_000_000 + Math.floor(Math.random() * 1_000_000);
const userIds = { owner: BigInt(base + 1), master: BigInt(base + 2), outsider: BigInt(base + 3) };
type Who = keyof typeof userIds;
const shopIds: string[] = [];
let shopId = '';
let ownerStaffId = '';
let masterStaffId = '';
let ownerBooking = '';
let masterBooking = '';
let cancelledBooking = '';

const date = addDays(tashkentDate(new Date()), 3);
const key = dateKey(date);
const at = (hour: number) => new Date(startOfTashkentDay(date).getTime() + hour * 3_600_000);

function req(who: Who, method = 'GET', body?: object) {
  const initData = signInitData({ user: { id: Number(userIds[who]), first_name: who } }, token);
  return new Request(`http://t/api?date=${key}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const day = (who: Who, id = shopId) => GET(req(who), { params: Promise.resolve({ id }) });
const open = (who: Who, bookingId: string, id = shopId) =>
  detail(req(who), { params: Promise.resolve({ id, bookingId }) });

async function openShop(slug: string) {
  const response = await createShop(
    req('owner', 'POST', {
      slug,
      name: 'Calendar Barber',
      region: 'tashkent-city',
      district: 'yunusobod',
      address: '4-mavze, 12-uy',
    }),
  );
  const { id } = await response.json();
  shopIds.push(id);
  return id as string;
}

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  shopId = await openShop(`cal-${Date.now().toString(36)}`);
  ownerStaffId = (await db.staff.findFirstOrThrow({ where: { shopId } })).id;
  const user = await db.user.create({ data: { telegramId: userIds.master, firstName: 'Master' } });
  masterStaffId = (
    await db.staff.create({ data: { shopId, userId: user.id, displayName: 'Master' } })
  ).id;
  const client = await db.shopClient.create({
    data: { shopId, name: 'Ali', phone: '+998901234567' },
  });
  const book = async (staffId: string, hour: number, status?: 'CANCELLED_SHOP') =>
    (
      await db.booking.create({
        data: {
          shopId,
          staffId,
          shopClientId: client.id,
          startAt: at(hour),
          endAt: at(hour + 0.5),
          totalPrice: 60_000,
          status,
          note: 'Soqol ham',
          items: {
            create: { nameSnapshot: 'Soch', priceSnapshot: 60_000, durationSnapshot: 30 },
          },
        },
      })
    ).id;
  ownerBooking = await book(ownerStaffId, 10);
  masterBooking = await book(masterStaffId, 11);
  cancelledBooking = await book(masterStaffId, 11, 'CANCELLED_SHOP');
  await db.weeklyHours.create({
    data: { staffId: masterStaffId, weekday: weekdayOf(date), startMin: 540, endMin: 1080 },
  });
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.booking.deleteMany({ where: { shopId: { in: shopIds } } });
  await db.shop.deleteMany({ where: { id: { in: shopIds } } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(userIds) } } });
  await db.$disconnect();
});

describe('calendar day', () => {
  it('shows owners everyone, with hours, clients and cancelled bookings', async () => {
    const response = await day('owner');
    expect(response.status).toBe(200);
    const { masters } = await response.json();
    expect(masters.map((m: { id: string }) => m.id).sort()).toEqual(
      [ownerStaffId, masterStaffId].sort(),
    );
    const master = masters.find((m: { id: string }) => m.id === masterStaffId);
    expect(master.windows).toEqual([{ startMin: 540, endMin: 1080 }]);
    expect(master.bookings).toHaveLength(2);
    expect(master.bookings[0].client).toEqual({ name: 'Ali', phone: '+998901234567' });
    const owner = masters.find((m: { id: string }) => m.id === ownerStaffId);
    expect(owner.windows).toEqual([]);
    expect(owner.bookings).toHaveLength(1);
  });

  it('shows a master only their own day', async () => {
    const { masters } = await (await day('master')).json();
    expect(masters.map((m: { id: string }) => m.id)).toEqual([masterStaffId]);
  });

  it('follows a day off, and refuses people outside the shop and bad dates', async () => {
    await db.scheduleOverride.create({
      data: {
        staffId: masterStaffId,
        date: new Date(Date.UTC(date.year, date.month - 1, date.day)),
        type: 'DAY_OFF',
      },
    });
    const { masters } = await (await day('master')).json();
    expect(masters[0].windows).toEqual([]);
    expect(masters[0].bookings).toHaveLength(2);
    expect((await day('outsider')).status).toBe(403);

    const initData = signInitData({ user: { id: Number(userIds.owner), first_name: 'o' } }, token);
    const bad = new Request('http://t/api?date=2026-02-31', {
      headers: { Authorization: `tma ${initData}` },
    });
    expect((await GET(bad, { params: Promise.resolve({ id: shopId }) })).status).toBe(400);
  });
});

describe('booking details', () => {
  it('gives the shop the booking in full', async () => {
    const response = await open('owner', masterBooking);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      masterName: 'Master',
      note: 'Soqol ham',
      client: { name: 'Ali', visitCount: 0, noShowCount: 0 },
      items: [{ name: 'Soch', price: 60_000 }],
    });
  });

  it('keeps other people’s bookings private', async () => {
    expect((await open('master', masterBooking)).status).toBe(200);
    expect((await open('master', ownerBooking)).status).toBe(403);
    expect((await open('outsider', masterBooking)).status).toBe(403);
    const other = await openShop(`cal-b-${Date.now().toString(36)}`);
    expect((await open('owner', masterBooking, other)).status).toBe(404);
  });

  it('moves a booking as staff, and refuses a time already taken', async () => {
    const move = (hour: number) =>
      act(
        req('owner', 'PATCH', {
          action: 'reschedule',
          as: 'staff',
          startAt: at(hour).toISOString(),
        }),
        {
          params: Promise.resolve({ id: masterBooking }),
        },
      );
    expect((await move(14)).status).toBe(200);
    expect((await (await open('owner', masterBooking)).json()).startAt).toBe(at(14).toISOString());
    expect(cancelledBooking).toBeTruthy();

    const blocker = await db.booking.create({
      data: {
        shopId,
        staffId: masterStaffId,
        shopClientId: (await db.shopClient.findFirstOrThrow({ where: { shopId } })).id,
        startAt: at(16),
        endAt: at(17),
        totalPrice: 1,
      },
    });
    const taken = await move(16);
    expect(taken.status).toBe(409);
    expect((await taken.json()).error.details.reason).toBe('slot_taken');
    await db.booking.delete({ where: { id: blocker.id } });
  });
});
