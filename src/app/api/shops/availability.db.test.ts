import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { POST as book } from '../bookings/route';
import { GET } from './[id]/availability/route';
import { POST as setStatus } from './[id]/status/route';
import { GET as profile } from './by-slug/[slug]/route';
import { POST as createShop } from './route';

// What a client can book, and booking it, against the real database (npm run test:db).

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 998_000_000 + Math.floor(Math.random() * 900_000);
const userIds = { owner: BigInt(base + 1), client: BigInt(base + 2) };
type Who = keyof typeof userIds;
const slug = `avail-${Date.now().toString(36)}`;
let shopId = '';
let ownerStaffId = '';
let secondStaffId = '';
let haircutId = '';
let beardId = '';

function auth(who: Who) {
  return `tma ${signInitData({ user: { id: Number(userIds[who]), first_name: who } }, token)}`;
}

function req(who: Who, method = 'GET', body?: object, query = '') {
  return new Request(`http://t/api${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: auth(who) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const options = (staff: string, services: string[], who: Who = 'client') =>
  GET(req(who, 'GET', undefined, `?staff=${staff}&services=${services.join(',')}`), {
    params: Promise.resolve({ id: shopId }),
  });

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const response = await createShop(
    req('owner', 'POST', {
      slug,
      name: 'Avail Barber',
      region: 'tashkent-city',
      district: 'yunusobod',
      address: '4-mavze, 12-uy',
    }),
  );
  shopId = (await response.json()).id;
  ownerStaffId = (await db.staff.findFirstOrThrow({ where: { shopId } })).id;
  secondStaffId = (await db.staff.create({ data: { shopId, displayName: 'Second' } })).id;

  const allWeek = [1, 2, 3, 4, 5, 6, 7];
  await db.weeklyHours.createMany({
    data: allWeek.flatMap((weekday) => [
      { staffId: ownerStaffId, weekday, startMin: 540, endMin: 660 },
      { staffId: secondStaffId, weekday, startMin: 780, endMin: 900 },
    ]),
  });
  const create = async (name: string, staffIds: string[]) =>
    (
      await db.service.create({
        data: {
          shopId,
          name,
          durationMin: 40,
          price: 60_000,
          staff: { create: staffIds.map((staffId) => ({ staffId })) },
        },
      })
    ).id;
  haircutId = await create('Soch', [ownerStaffId, secondStaffId]);
  beardId = await create('Soqol', [ownerStaffId]);
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.booking.deleteMany({ where: { shopId } });
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(userIds) } } });
  await db.$disconnect();
});

describe('booking options', () => {
  it('offers nothing while the shop is a draft', async () => {
    const response = await options('any', [haircutId]);
    expect(response.status).toBe(200);
    const { days } = await response.json();
    expect(days.every((day: { slots: unknown[] }) => day.slots.length === 0)).toBe(true);
  });

  it('merges all masters for "any", and one master’s hours when chosen', async () => {
    const live = await setStatus(req('owner', 'POST', { status: 'ACTIVE' }), {
      params: Promise.resolve({ id: shopId }),
    });
    expect(live.status).toBe(200);

    const any = await (await options('any', [haircutId])).json();
    expect(any.days).toHaveLength(14);
    expect(any.days[1].status).toBe('open');
    const starts = any.days[1].slots.map((slot: { startMin: number }) => slot.startMin);
    expect(starts).toContain(540);
    expect(starts).toContain(780);

    const one = await (await options(secondStaffId, [haircutId])).json();
    const own = one.days[1].slots.map((slot: { startMin: number }) => slot.startMin);
    expect(own).toContain(780);
    expect(own).not.toContain(540);
  });

  it('counts the length of everything chosen, and only masters who do it all', async () => {
    const both = await (await options('any', [haircutId, beardId])).json();
    const starts = both.days[1].slots.map((slot: { startMin: number }) => slot.startMin);
    // 80 minutes with the only master who does both, whose day is 9:00–11:00.
    expect(starts).toEqual([540, 560, 580]);

    const wrong = await options(secondStaffId, [haircutId, beardId]);
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error.details.reason).toBe('service_unavailable');
  });

  it('refuses a master from elsewhere and malformed requests', async () => {
    const stranger = '01a00000-0000-7000-8000-000000000000';
    expect((await options(stranger, [haircutId])).status).toBe(404);
    expect((await options('someone', [haircutId])).status).toBe(400);
    expect((await options('any', [])).status).toBe(400);
    expect((await options('any', [haircutId, haircutId])).status).toBe(400);
  });
});

describe('booking what was offered', () => {
  it('books an offered time, which then stops being offered', async () => {
    const before = await (await options('any', [haircutId])).json();
    const slot = before.days[1].slots.find((s: { startMin: number }) => s.startMin === 780);

    const noPhone = await book(
      req('client', 'POST', {
        shopId,
        staffId: 'any',
        serviceIds: [haircutId],
        startAt: slot.startAt,
      }),
    );
    expect((await noPhone.json()).error.details.reason).toBe('phone_required');
    await db.user.update({
      where: { telegramId: userIds.client },
      data: { phone: '+998901112244' },
    });

    const response = await book(
      req('client', 'POST', {
        shopId,
        staffId: 'any',
        serviceIds: [haircutId],
        startAt: slot.startAt,
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      staffId: secondStaffId,
      status: 'CONFIRMED',
      totalPrice: 60_000,
    });

    const after = await (await options(secondStaffId, [haircutId])).json();
    const starts = after.days[1].slots.map((s: { startMin: number }) => s.startMin);
    expect(starts).not.toContain(780);
  });

  it('tells the shop page which masters do each service', async () => {
    const response = await profile(req('client'), { params: Promise.resolve({ slug }) });
    const { services } = await response.json();
    const beard = services.find((service: { id: string }) => service.id === beardId);
    expect(beard.staffIds).toEqual([ownerStaffId]);
  });
});
