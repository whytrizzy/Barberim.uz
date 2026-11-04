import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fromTashkent } from '@/domain/time';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { GET as earnings } from './[id]/earnings/route';

// The earnings dashboard against the real database (npm run test:db), on a fixed week in June
// 2026 (Monday the 8th to Sunday the 14th) so the sums don't depend on today.

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 999_000_000 + Math.floor(Math.random() * 900_000);
const ids = {
  owner: BigInt(base + 1),
  master: BigInt(base + 2),
  stranger: BigInt(base + 3),
};
type Who = keyof typeof ids;
const slug = `er-${Date.now().toString(36)}`;
let shopId = '';
let ownerStaffId = '';
let masterId = '';

function req(who: Who, query: string) {
  const initData = signInitData({ user: { id: Number(ids[who]), first_name: who } }, token);
  return new Request(`http://t/api?${query}`, { headers: { Authorization: `tma ${initData}` } });
}
const ask = (who: Who, query: string) =>
  earnings(req(who, query), { params: Promise.resolve({ id: shopId }) });

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const users = {} as Record<Who, { id: string }>;
  for (const who of Object.keys(ids) as Who[]) {
    users[who] = await db.user.create({ data: { telegramId: ids[who], firstName: who } });
  }
  const place = { region: 'tashkent-city', district: 'yunusobod', address: `Manzil ${slug}` };
  shopId = (
    await db.shop.create({ data: { slug, name: 'Money Barber', status: 'ACTIVE', ...place } })
  ).id;
  ownerStaffId = (
    await db.staff.create({
      data: { shopId, userId: users.owner.id, displayName: 'Jasur', role: 'OWNER' },
    })
  ).id;
  masterId = (
    await db.staff.create({
      data: { shopId, userId: users.master.id, displayName: 'Sardor', role: 'MASTER' },
    })
  ).id;
  const client = await db.shopClient.create({ data: { shopId, name: 'Aziz' } });
  const visit = (staffId: string, day: number, hour: number, status: string, price: number) => {
    const startAt = fromTashkent(2026, 6, day, hour);
    return db.booking.create({
      data: {
        shopId,
        staffId,
        shopClientId: client.id,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        totalPrice: price,
        status: status as 'COMPLETED',
        items: {
          create: { nameSnapshot: 'Soch olish', priceSnapshot: price, durationSnapshot: 30 },
        },
      },
    });
  };
  await visit(ownerStaffId, 8, 10, 'COMPLETED', 60_000);
  await visit(ownerStaffId, 10, 15, 'COMPLETED', 90_000);
  await visit(masterId, 10, 15, 'COMPLETED', 60_000);
  await visit(masterId, 11, 12, 'NO_SHOW', 60_000);
  await visit(masterId, 12, 12, 'CANCELLED_CLIENT', 60_000);
  // The week before.
  await visit(ownerStaffId, 3, 11, 'COMPLETED', 100_000);
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.booking.deleteMany({ where: { shopId } });
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(ids) } } });
  await db.$disconnect();
});

describe('earnings', () => {
  it('sums the week for the owner, by master, against the week before', async () => {
    const response = await ask('owner', 'period=week&date=2026-06-10');
    expect(response.status).toBe(200);
    const week = await response.json();
    expect(week).toMatchObject({
      from: '2026-06-08',
      days: 7,
      onlyMine: false,
      revenue: 210_000,
      previousRevenue: 100_000,
      visits: 3,
      noShows: 1,
      cancelled: 1,
      noShowRate: 0.25,
      averageTicket: 70_000,
    });
    expect(week.series.map((d: { revenue: number }) => d.revenue)).toEqual([
      60_000, 0, 150_000, 0, 0, 0, 0,
    ]);
    expect(week.byMaster).toEqual([
      { staffId: ownerStaffId, name: 'Jasur', revenue: 150_000, visits: 2, noShows: 0 },
      { staffId: masterId, name: 'Sardor', revenue: 60_000, visits: 1, noShows: 1 },
    ]);
    expect(week.topServices).toEqual([{ name: 'Soch olish', count: 3, revenue: 210_000 }]);
  });

  it('shows a master only their own visits', async () => {
    const mine = await (await ask('master', 'period=week&date=2026-06-10')).json();
    expect(mine).toMatchObject({ onlyMine: true, revenue: 60_000, visits: 1, noShows: 1 });
    expect(mine.byMaster.map((m: { name: string }) => m.name)).toEqual(['Sardor']);
  });

  it('covers a day by the hour and a month by the day', async () => {
    const day = await (await ask('owner', 'period=day&date=2026-06-10')).json();
    expect(day.revenue).toBe(150_000);
    expect(day.series[15].revenue).toBe(150_000);
    const month = await (await ask('owner', 'period=month&date=2026-06-20')).json();
    expect(month).toMatchObject({ from: '2026-06-01', days: 30, revenue: 310_000 });
  });

  it('is only for the shop’s staff, and refuses a bad query', async () => {
    expect((await ask('stranger', 'period=week')).status).toBe(403);
    expect((await ask('owner', 'period=year')).status).toBe(400);
    expect((await ask('owner', 'period=week&date=2026-13-45')).status).toBe(400);
  });
});
