import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fromTashkent, tashkentDate } from '@/domain/time';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { discoverShops } from '@/server/services/discover';
import { POST } from './route';

// Finding shops against the real database (npm run test:db). A unique word keeps other test
// data out of the results.

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 996_000_000 + Math.floor(Math.random() * 1_000_000);
const word = `zqx${Date.now().toString(36)}`;
const shopIds: string[] = [];
const today = tashkentDate(new Date());
const at = (hour: number) => fromTashkent(today.year, today.month, today.day, hour);

function search(body: object) {
  const initData = signInitData({ user: { id: base + 1, first_name: 'c' } }, token);
  return POST(
    new Request('http://t/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
      body: JSON.stringify(body),
    }),
  );
}

type ShopOptions = {
  name: string;
  region?: string;
  district?: string;
  status?: 'ACTIVE' | 'DRAFT';
  location?: { lat: number; lng: number };
  price?: number;
  hours?: boolean;
  noService?: boolean;
};

async function makeShop(options: ShopOptions) {
  const shop = await db.shop.create({
    data: {
      slug: `d-${Math.random().toString(36).slice(2, 12)}`,
      name: `${options.name} ${word}`,
      region: options.region ?? 'tashkent-city',
      district: options.district ?? 'yunusobod',
      address: `Manzil ${word}`,
      status: options.status ?? 'ACTIVE',
      lat: options.location?.lat ?? null,
      lng: options.location?.lng ?? null,
    },
  });
  shopIds.push(shop.id);
  const staff = await db.staff.create({ data: { shopId: shop.id, displayName: 'M' } });
  if (!options.noService) {
    await db.service.create({
      data: {
        shopId: shop.id,
        name: 'Soch',
        durationMin: 30,
        price: options.price ?? 60_000,
        staff: { create: { staffId: staff.id } },
      },
    });
  }
  if (options.hours !== false) {
    await db.weeklyHours.createMany({
      data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        staffId: staff.id,
        weekday,
        startMin: 540,
        endMin: 1080,
      })),
    });
  }
  return shop;
}

const names = (result: { shops: { name: string }[] }) =>
  result.shops.map((shop) => shop.name.replace(` ${word}`, ''));

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  await makeShop({ name: 'Alpha', price: 40_000, location: { lat: 41.31, lng: 69.28 } });
  await makeShop({
    name: 'Bravo',
    price: 90_000,
    district: 'chilonzor',
    location: { lat: 41.0, lng: 69.0 },
  });
  await makeShop({ name: 'Charlie', region: 'samarkand', district: 'Urgut', hours: false });
  await makeShop({ name: 'Draft', status: 'DRAFT' });
  await makeShop({ name: 'Empty', noService: true });
  await makeShop({ name: 'Устоз' });
  await makeShop({ name: 'Gʻolib' });
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.shop.deleteMany({ where: { id: { in: shopIds } } });
  await db.user.deleteMany({ where: { telegramId: BigInt(base + 1) } });
  await db.$disconnect();
});

describe('finding shops', () => {
  it('lists only live shops that have something to book', async () => {
    const response = await search({ query: word });
    expect(response.status).toBe(200);
    const found = names(await response.json());
    expect(found).toEqual(expect.arrayContaining(['Alpha', 'Bravo', 'Charlie', 'Устоз', 'Gʻolib']));
    expect(found).not.toContain('Draft');
    expect(found).not.toContain('Empty');
  });

  it('searches in either script and with any apostrophe', async () => {
    const one = async (query: string) => names(await (await search({ query })).json());
    expect(await one(`Alpha ${word}`)).toEqual(['Alpha']);
    expect(await one(`alpha ${word}`.toUpperCase())).toEqual(['Alpha']);
    expect(await one(`Ustoz ${word.slice(0, 0)}`.trim())).toContain('Устоз');
    expect(await one("G'olib")).toContain('Gʻolib');
  });

  it('filters by place and price', async () => {
    const results = async (body: object) =>
      names(await (await search({ query: word, ...body })).json());
    expect(await results({ region: 'samarkand' })).toEqual(['Charlie']);
    expect(await results({ district: 'chilonzor' })).toEqual(['Bravo']);
    const cheap = await results({ maxPrice: 50_000 });
    expect(cheap).toContain('Alpha');
    expect(cheap).not.toContain('Bravo');
  });

  it('refuses what makes no sense', async () => {
    expect((await search({ region: 'mars' })).status).toBe(400);
    expect((await search({ near: { lat: 48.8, lng: 2.3 } })).status).toBe(400);
  });

  it('knows who has room today, and puts them first', async () => {
    const early = await discoverShops({ query: word }, at(7));
    const alpha = early.shops.find((shop) => shop.name.startsWith('Alpha'))!;
    expect(alpha.nextFreeToday).toBe(540);
    expect(alpha.fromPrice).toBe(40_000);
    const charlie = early.shops.find((shop) => shop.name.startsWith('Charlie'))!;
    expect(charlie.nextFreeToday).toBeNull();
    expect(early.shops.at(-1)?.name.startsWith('Charlie')).toBe(true);

    const onlyFree = await discoverShops({ query: word, freeToday: true }, at(7));
    expect(names(onlyFree)).not.toContain('Charlie');

    const closed = await discoverShops({ query: word, freeToday: true }, at(23));
    expect(closed.shops).toEqual([]);
  });

  it('counts a booking when finding the next free time', async () => {
    const shop = await db.shop.findFirstOrThrow({ where: { name: `Alpha ${word}` } });
    const staff = await db.staff.findFirstOrThrow({ where: { shopId: shop.id } });
    const client = await db.shopClient.create({ data: { shopId: shop.id, name: 'C' } });
    const booking = await db.booking.create({
      data: {
        shopId: shop.id,
        staffId: staff.id,
        shopClientId: client.id,
        startAt: at(9),
        endAt: at(10),
        totalPrice: 1,
      },
    });
    const { shops } = await discoverShops({ query: `Alpha ${word}` }, at(7));
    expect(shops[0]?.nextFreeToday).toBe(600);
    await db.booking.delete({ where: { id: booking.id } });
  });

  it('sorts by distance near a place, with no location last', async () => {
    const near = { lat: 41.31, lng: 69.28 };
    const { shops } = await (await search({ query: word, near })).json();
    expect(shops[0].name.startsWith('Alpha')).toBe(true);
    expect(shops[0].distanceKm).toBeCloseTo(0, 3);
    expect(shops[1].name.startsWith('Bravo')).toBe(true);
    expect(shops[1].distanceKm).toBeGreaterThan(30);
    expect(shops[2].distanceKm).toBeNull();
  });
});
