import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fromTashkent, tashkentDate, weekdayOf } from '@/domain/time';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { getShopProfile } from '@/server/services/shop-profile';
import { POST as setRules } from './[id]/rules/route';
import { POST as setStatus } from './[id]/status/route';
import { GET } from './by-slug/[slug]/route';
import { POST as createShop } from './route';

// The client-facing shop page and going live, against the real database (npm run test:db).

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 995_000_000 + Math.floor(Math.random() * 1_000_000);
const userIds = { owner: BigInt(base + 1), master: BigInt(base + 2), client: BigInt(base + 3) };
type Who = keyof typeof userIds;
const slug = `prof-${Date.now().toString(36)}`;
let shopId = '';
let ownerStaffId = '';

function req(who: Who, method = 'GET', body?: object) {
  const initData = signInitData({ user: { id: Number(userIds[who]), first_name: who } }, token);
  return new Request('http://t/api', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const view = (who: Who, value = slug) =>
  GET(req(who), { params: Promise.resolve({ slug: value }) });
const status = (who: Who, value: string) =>
  setStatus(req(who, 'POST', { status: value }), { params: Promise.resolve({ id: shopId }) });
const reasonOf = async (response: Response) => (await response.json()).error.details.reason;

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const response = await createShop(
    req('owner', 'POST', {
      slug,
      name: 'Profile Barber',
      region: 'tashkent-city',
      district: 'yunusobod',
      address: '4-mavze, 12-uy',
      location: { lat: 41.3, lng: 69.28 },
    }),
  );
  shopId = (await response.json()).id;
  ownerStaffId = (await db.staff.findFirstOrThrow({ where: { shopId } })).id;
  const master = await db.user.create({ data: { telegramId: userIds.master, firstName: 'M' } });
  await db.staff.create({ data: { shopId, userId: master.id, displayName: 'M' } });
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(userIds) } } });
  await db.$disconnect();
});

describe('going live', () => {
  it('hides a draft from clients, and shows it to staff as a preview', async () => {
    expect((await view('client')).status).toBe(404);
    expect((await view('client', 'no-such-shop')).status).toBe(404);
    expect((await view('client', 'BAD SLUG')).status).toBe(404);
    const preview = await view('master');
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      isPreview: true,
      name: 'Profile Barber',
      today: { status: 'closed', freeStarts: [] },
    });
  });

  it('needs a service, then hours, and an owner or admin', async () => {
    expect((await status('master', 'ACTIVE')).status).toBe(403);
    expect((await status('client', 'ACTIVE')).status).toBe(403);

    const noServices = await status('owner', 'ACTIVE');
    expect(noServices.status).toBe(409);
    expect(await reasonOf(noServices)).toBe('no_services');

    const service = await db.service.create({
      data: { shopId, name: 'Soch', durationMin: 30, price: 60_000, priceIsFrom: true },
    });
    await db.staffService.create({ data: { staffId: ownerStaffId, serviceId: service.id } });
    expect(await reasonOf(await status('owner', 'ACTIVE'))).toBe('no_hours');

    const weekday = weekdayOf(tashkentDate(new Date()));
    await db.weeklyHours.create({
      data: { staffId: ownerStaffId, weekday, startMin: 540, endMin: 600 },
    });
    const live = await status('owner', 'ACTIVE');
    expect(live.status).toBe(200);
    expect((await live.json()).status).toBe('ACTIVE');
  });

  it('shows clients a live shop: only services and masters they can book', async () => {
    const hidden = await db.service.create({
      data: { shopId, name: 'Eski', durationMin: 30, price: 1, isActive: false },
    });
    await db.staffService.create({ data: { staffId: ownerStaffId, serviceId: hidden.id } });
    await db.service.create({ data: { shopId, name: 'Hech kim', durationMin: 30, price: 1 } });

    const response = await view('client');
    expect(response.status).toBe(200);
    const profile = await response.json();
    expect(profile).toMatchObject({
      isPreview: false,
      location: { lat: 41.3, lng: 69.28 },
    });
    expect(profile.services.map((s: { name: string }) => s.name)).toEqual(['Soch']);
    expect(profile.masters.map((m: { id: string }) => m.id)).toEqual([ownerStaffId]);
  });

  it('lists today’s free times, leaving out what’s taken or too soon', async () => {
    const user = await db.user.findFirstOrThrow({ where: { telegramId: userIds.client } });
    const date = tashkentDate(new Date());
    const at = (hour: number, minute = 0) =>
      fromTashkent(date.year, date.month, date.day, hour, minute);

    const early = await getShopProfile(user, slug, at(7));
    // Hours 9:00–10:00, a 30-minute service and the 20-minute grid: 9:00 and 9:20.
    expect(early.today).toEqual({ status: 'open', freeStarts: [540, 560] });

    const client = await db.shopClient.create({ data: { shopId, name: 'C' } });
    await db.booking.create({
      data: {
        shopId,
        staffId: ownerStaffId,
        shopClientId: client.id,
        startAt: at(9),
        endAt: at(9, 30),
        totalPrice: 60_000,
      },
    });
    const later = await getShopProfile(user, slug, at(7));
    expect(later.today.freeStarts).not.toContain(540);
    expect(later.today.freeStarts).toContain(570);

    const closing = await getShopProfile(user, slug, at(9, 30));
    expect(closing.today).toEqual({ status: 'full', freeStarts: [] });
  });

  it('takes the shop down again', async () => {
    expect((await status('owner', 'DRAFT')).status).toBe(200);
    expect((await view('client')).status).toBe(404);
  });
});

describe('taking bookings by hand', () => {
  const rules = (who: Who, body: object) =>
    setRules(req(who, 'POST', body), { params: Promise.resolve({ id: shopId }) });

  it('lets owners switch it, keeping the other settings', async () => {
    await db.shop.update({ where: { id: shopId }, data: { settings: { slotStepMin: 15 } } });
    const on = await rules('owner', { requireApproval: true });
    expect(on.status).toBe(200);
    expect((await on.json()).requireApproval).toBe(true);
    const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } });
    expect(shop.settings).toMatchObject({ slotStepMin: 15, requireApproval: true });

    const off = await rules('owner', { requireApproval: false });
    expect((await off.json()).requireApproval).toBe(false);
  });

  it('refuses masters, outsiders and nonsense', async () => {
    expect((await rules('master', { requireApproval: true })).status).toBe(403);
    expect((await rules('client', { requireApproval: true })).status).toBe(403);
    expect((await rules('owner', { requireApproval: 'yes' })).status).toBe(400);
  });
});
