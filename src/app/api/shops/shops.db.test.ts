import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { PATCH } from './[id]/route';
import { POST } from './route';
import { GET as slugCheck } from './slug/route';

// Opening and editing shops against the real database (npm run test:db).

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 940_000_000 + Math.floor(Math.random() * 1_000_000);
const suffix = Date.now().toString(36);
const userIds: Record<'owner' | 'other', bigint> = {
  owner: BigInt(base + 1),
  other: BigInt(base + 2),
};
const createdShopIds: string[] = [];

function req(who: keyof typeof userIds, method: string, url: string, body?: object) {
  const initData = signInitData({ user: { id: Number(userIds[who]), first_name: who } }, token);
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const details = {
  name: 'Ustoz Barbershop',
  region: 'tashkent-city',
  district: 'chilonzor',
  address: '9-kvartal, 14-uy',
  landmark: 'Novza metrosi yonida',
  location: { lat: 41.2925, lng: 69.2051 },
};

async function create(who: keyof typeof userIds, slug: string, extra: object = {}) {
  const response = await POST(
    req(who, 'POST', 'http://t/api/shops', { ...details, slug, ...extra }),
  );
  const body = await response.json();
  if (response.status === 201) createdShopIds.push(body.id);
  return { status: response.status, body };
}

beforeAll(() => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
});

// Each test makes several creates; the per-user rate limit (5/min) is tested in http.test.ts.
beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.shop.deleteMany({ where: { id: { in: createdShopIds } } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(userIds) } } });
  await db.$disconnect();
});

describe('POST /api/shops', () => {
  it('opens a draft shop with the user as its bookable owner', async () => {
    const { status, body } = await create('owner', `ustoz-${suffix}`);
    expect(status).toBe(201);
    expect(body).toMatchObject({
      slug: `ustoz-${suffix}`,
      status: 'DRAFT',
      district: 'chilonzor',
      location: { lat: 41.2925, lng: 69.2051 },
    });
    const staff = await db.staff.findFirstOrThrow({ where: { shopId: body.id } });
    expect(staff).toMatchObject({ role: 'OWNER', isBookable: true, displayName: 'owner' });
  });

  it('refuses a link name that is taken, reserved or malformed', async () => {
    const taken = await create('other', `ustoz-${suffix}`);
    expect(taken.status).toBe(409);
    expect(taken.body.error.details.reason).toBe('slug_taken');
    expect((await create('other', 'staff')).status).toBe(400);
    expect((await create('other', 'Ustoz Shop')).status).toBe(400);
  });

  it('validates the address: Tashkent districts must be known, locations inside Uzbekistan', async () => {
    expect((await create('other', `a-${suffix}`, { district: 'atlantis' })).status).toBe(400);
    expect(
      (await create('other', `b-${suffix}`, { location: { lat: 55.75, lng: 37.61 } })).status,
    ).toBe(400);
    // Outside Tashkent city the district is free text.
    expect(
      (await create('other', `c-${suffix}`, { region: 'samarkand', district: 'Urgut' })).status,
    ).toBe(201);
  });

  it('limits one account to three owned shops', async () => {
    expect((await create('owner', `two-${suffix}`)).status).toBe(201);
    expect((await create('owner', `three-${suffix}`)).status).toBe(201);
    const fourth = await create('owner', `four-${suffix}`);
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.details.reason).toBe('too_many_shops');
  });
});

describe('GET /api/shops/slug', () => {
  const check = async (value: string) =>
    (await slugCheck(req('other', 'GET', `http://t/api/shops/slug?value=${value}`))).json();

  it('says whether a link name is free and why not', async () => {
    expect(await check(`free-${suffix}`)).toEqual({
      slug: `free-${suffix}`,
      available: true,
      problem: null,
    });
    expect((await check(`ustoz-${suffix}`)).problem).toBe('taken');
    expect((await check('api')).problem).toBe('reserved');
    expect((await check('x')).problem).toBe('too_short');
  });
});

describe('PATCH /api/shops/:id', () => {
  it('lets the owner edit, and nobody outside the shop', async () => {
    const shopId = createdShopIds[0]!;
    const patch = (who: keyof typeof userIds, body: object) =>
      PATCH(req(who, 'PATCH', `http://t/api/shops/${shopId}`, body), {
        params: Promise.resolve({ id: shopId }),
      });

    const edited = await patch('owner', {
      ...details,
      landmark: 'Chilonzor bozori roʻparasida',
      location: null,
    });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      landmark: 'Chilonzor bozori roʻparasida',
      location: null,
    });

    expect((await patch('other', details)).status).toBe(403);
  });
});
