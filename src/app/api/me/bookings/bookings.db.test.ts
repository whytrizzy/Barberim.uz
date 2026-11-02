import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, startOfTashkentDay, tashkentDate } from '@/domain/time';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { PATCH as act } from '../../bookings/[id]/route';
import { GET as options } from './[id]/options/route';
import { GET as one } from './[id]/route';
import { GET as list } from './route';

// A client's own bookings against the real database (npm run test:db).

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 993_000_000 + Math.floor(Math.random() * 1_000_000);
const userIds = { me: BigInt(base + 1), other: BigInt(base + 2) };
type Who = keyof typeof userIds;
let shopId = '';
let staffId = '';
let clientId = '';
let upcomingId = '';
let pastId = '';
let cancelledId = '';

const tomorrow = addDays(tashkentDate(new Date()), 1);
const at = (hour: number) => new Date(startOfTashkentDay(tomorrow).getTime() + hour * 3_600_000);

function req(who: Who, method = 'GET', body?: object) {
  const initData = signInitData({ user: { id: Number(userIds[who]), first_name: who } }, token);
  return new Request('http://t/api', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const on = (id: string) => ({ params: Promise.resolve({ id }) });

async function book(startAt: Date, status?: 'COMPLETED' | 'CANCELLED_SHOP') {
  const row = await db.booking.create({
    data: {
      shopId,
      staffId,
      shopClientId: clientId,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      totalPrice: 60_000,
      status,
      items: { create: { nameSnapshot: 'Soch', priceSnapshot: 60_000, durationSnapshot: 30 } },
    },
  });
  return row.id;
}

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const me = await db.user.create({ data: { telegramId: userIds.me, firstName: 'Me' } });
  const shop = await db.shop.create({
    data: {
      slug: `mine-${Date.now().toString(36)}`,
      name: 'Mine Barber',
      region: 'tashkent-city',
      district: 'yunusobod',
      address: '4-mavze, 12-uy',
      status: 'ACTIVE',
      lat: 41.3,
      lng: 69.28,
    },
  });
  shopId = shop.id;
  staffId = (await db.staff.create({ data: { shopId, displayName: 'Sardor' } })).id;
  await db.weeklyHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      staffId,
      weekday,
      startMin: 540,
      endMin: 660,
    })),
  });
  clientId = (await db.shopClient.create({ data: { shopId, userId: me.id, name: 'Me' } })).id;
  upcomingId = await book(at(9));
  pastId = await book(new Date(Date.now() - 2 * 86_400_000), 'COMPLETED');
  cancelledId = await book(at(15), 'CANCELLED_SHOP');
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.booking.deleteMany({ where: { shopId } });
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(userIds) } } });
  await db.$disconnect();
});

describe('my bookings', () => {
  it('separates upcoming from finished and cancelled', async () => {
    const { upcoming, past } = await (await list(req('me'))).json();
    expect(upcoming.map((b: { id: string }) => b.id)).toEqual([upcomingId]);
    expect(past.map((b: { id: string }) => b.id).sort()).toEqual([pastId, cancelledId].sort());
    expect(upcoming[0]).toMatchObject({
      masterName: 'Sardor',
      shop: { name: 'Mine Barber', location: { lat: 41.3, lng: 69.28 } },
    });
  });

  it('keeps bookings private', async () => {
    expect((await one(req('me'), on(upcomingId))).status).toBe(200);
    expect((await one(req('other'), on(upcomingId))).status).toBe(404);
    expect((await options(req('other'), on(upcomingId))).status).toBe(404);
    const { upcoming, past } = await (await list(req('other'))).json();
    expect([...upcoming, ...past]).toEqual([]);
    const refused = await act(
      req('other', 'PATCH', { action: 'cancel', as: 'client' }),
      on(upcomingId),
    );
    expect(refused.status).toBe(404);
  });

  it('offers times to move to, without the booking’s own, and moves it', async () => {
    const { days } = await (await options(req('me'), on(upcomingId))).json();
    const slots: { startMin: number; startAt: string }[] = days[1].slots;
    expect(days).toHaveLength(14);
    expect(slots.map((s) => s.startMin)).not.toContain(540);
    // 9:20 overlaps its own old time, which is free once it moves.
    const target = slots.find((s) => s.startMin === 560)!;
    expect(target).toBeDefined();

    const moved = await act(
      req('me', 'PATCH', { action: 'reschedule', as: 'client', startAt: target.startAt }),
      on(upcomingId),
    );
    expect(moved.status).toBe(200);
    const body = await (await one(req('me'), on(upcomingId))).json();
    expect(body.startAt).toBe(target.startAt);
    expect(body.endAt).toBe(
      new Date(new Date(target.startAt).getTime() + 30 * 60_000).toISOString(),
    );
  });

  it('refuses to move what is over', async () => {
    const response = await options(req('me'), on(pastId));
    expect(response.status).toBe(409);
    expect((await response.json()).error.details.reason).toBe('transition_refused');
  });

  it('cancels, which moves it to the past and frees the time', async () => {
    const cancelled = await act(
      req('me', 'PATCH', { action: 'cancel', as: 'client' }),
      on(upcomingId),
    );
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).status).toBe('CANCELLED_CLIENT');
    const { upcoming, past } = await (await list(req('me'))).json();
    expect(upcoming).toEqual([]);
    expect(past.map((b: { id: string }) => b.id)).toContain(upcomingId);
  });
});
