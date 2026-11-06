import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { GET as clients } from './[id]/clients/route';
import { GET as earnings } from './[id]/earnings/route';
import { POST as addService } from './[id]/services/route';
import { POST as addStaff } from './[id]/staff/route';
import { POST as addPhoto } from './[id]/staff/[staffId]/portfolio/route';

// FREE vs PRO against the real database (npm run test:db): what a FREE shop is refused, and that
// PRO opens it again. Every shop is PRO by default until subscription billing exists.

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const ownerTg = BigInt(990_000_000 + Math.floor(Math.random() * 900_000));
const slug = `pl-${Date.now().toString(36)}`;
let shopId = '';
let ownerStaffId = '';

function req(method: string, url = 'http://t/api', body?: object | Uint8Array) {
  const initData = signInitData({ user: { id: Number(ownerTg), first_name: 'Owner' } }, token);
  const binary = body instanceof Uint8Array;
  return new Request(url, {
    method,
    headers: {
      Authorization: `tma ${initData}`,
      'Content-Type': binary ? 'image/jpeg' : 'application/json',
    },
    body: body === undefined ? undefined : binary ? new Uint8Array(body) : JSON.stringify(body),
  });
}
const shopCtx = () => ({ params: Promise.resolve({ id: shopId }) });
const reasonOf = async (response: Response) =>
  (await response.json()).error?.details as { reason?: string; feature?: string } | undefined;
const setPlan = (plan: 'FREE' | 'PRO') => db.shop.update({ where: { id: shopId }, data: { plan } });

const jpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9,
]); // prettier-ignore
const photo = () =>
  addPhoto(req('POST', 'http://t/api', jpeg), {
    params: Promise.resolve({ id: shopId, staffId: ownerStaffId }),
  });
const service = (extras: object) =>
  addService(
    req('POST', 'http://t/api', {
      name: 'Kuyov paketi',
      category: 'WEDDING',
      durationMin: 120,
      price: 250_000,
      priceIsFrom: false,
      staffIds: [ownerStaffId],
      ...extras,
    }),
    shopCtx(),
  );

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const owner = await db.user.create({ data: { telegramId: ownerTg, firstName: 'Owner' } });
  const place = { region: 'tashkent-city', district: 'yunusobod', address: `Manzil ${slug}` };
  const shop = await db.shop.create({ data: { slug, name: 'Plan Barber', ...place } });
  shopId = shop.id;
  expect(shop.plan).toBe('PRO');
  ownerStaffId = (
    await db.staff.create({
      data: { shopId, userId: owner.id, displayName: 'Jasur', role: 'OWNER' },
    })
  ).id;
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  const owner = await db.staff.findUnique({ where: { id: ownerStaffId } });
  // Leave no files behind in .media/.
  for (const key of owner?.portfolio ?? []) {
    const { media } = await import('@/server/storage/media');
    await media.remove(key).catch(() => {});
  }
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: ownerTg } });
  await db.$disconnect();
});

describe('a FREE shop', () => {
  beforeAll(() => setPlan('FREE'));

  it('is a solo barber: no team, no earnings, no client list', async () => {
    const staff = await addStaff(
      req('POST', 'http://t/api', { name: 'Sardor', role: 'MASTER' }),
      shopCtx(),
    );
    expect(staff.status).toBe(403);
    expect(await reasonOf(staff)).toEqual({ reason: 'plan_limit', feature: 'team' });

    const money = await earnings(req('GET', 'http://t/api?period=week'), shopCtx());
    expect(await reasonOf(money)).toMatchObject({ feature: 'earnings' });
    const list = await clients(req('GET', 'http://t/api?view=list'), shopCtx());
    expect(await reasonOf(list)).toMatchObject({ feature: 'clients' });
  });

  it('can have a wedding service, but not the package extras', async () => {
    expect((await service({})).status).toBe(201);
    const pkg = await service({ maxPeople: 6 });
    expect(await reasonOf(pkg)).toMatchObject({ feature: 'wedding_packages' });
  });

  it('keeps a few portfolio photos', async () => {
    for (let i = 0; i < 3; i++) expect((await photo()).status).toBe(201);
    const fourth = await photo();
    expect(await reasonOf(fourth)).toMatchObject({ feature: 'portfolio' });
  });
});

describe('a PRO shop', () => {
  beforeAll(() => setPlan('PRO'));

  it('gets everything back, with nothing lost while it was FREE', async () => {
    const staff = await addStaff(
      req('POST', 'http://t/api', { name: 'Sardor', role: 'MASTER' }),
      shopCtx(),
    );
    expect(staff.status).toBe(201);
    expect((await earnings(req('GET', 'http://t/api?period=week'), shopCtx())).status).toBe(200);
    expect((await service({ maxPeople: 6 })).status).toBe(201);
    expect((await photo()).status).toBe(201);
    const owner = await db.staff.findUniqueOrThrow({ where: { id: ownerStaffId } });
    expect(owner.portfolio).toHaveLength(4);
  });
});
