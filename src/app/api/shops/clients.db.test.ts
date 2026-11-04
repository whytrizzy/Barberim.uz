import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, dateKey, fromTashkent, tashkentDate } from '@/domain/time';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { POST as book } from '../bookings/route';
import { POST as wait } from '../me/waitlist/route';
import { GET as detail, PATCH as update } from './[id]/clients/[clientId]/route';
import { GET as list } from './[id]/clients/route';

// The shop's client list (CRM) against the real database (npm run test:db).

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 998_000_000 + Math.floor(Math.random() * 900_000);
const ids = {
  owner: BigInt(base + 1),
  master: BigInt(base + 2),
  other: BigInt(base + 3),
  client: BigInt(base + 4),
};
type Who = keyof typeof ids;
const slug = `cl-${Date.now().toString(36)}`;
let shopId = '';
let masterId = '';
let haircutId = '';
let regularId = '';
let walkInId = '';

function req(who: Who, method = 'GET', body?: object, url = 'http://t/api') {
  const initData = signInitData({ user: { id: Number(ids[who]), first_name: who } }, token);
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const shopCtx = () => ({ params: Promise.resolve({ id: shopId }) });
const clientCtx = (clientId: string) => ({ params: Promise.resolve({ id: shopId, clientId }) });
const listAs = (who: Who, query = '') =>
  list(req(who, 'GET', undefined, `http://t/api?view=list${query}`), shopCtx()).then((r) =>
    r.json(),
  );
const names = (body: { clients: { name: string }[] }) => body.clients.map((c) => c.name).sort();

let hour = 0;
async function visit(shopClientId: string, staffId: string, status: string, price: number) {
  const start = new Date(Date.now() - (++hour + 24) * 3_600_000);
  await db.booking.create({
    data: {
      shopId,
      staffId,
      shopClientId,
      startAt: start,
      endAt: new Date(start.getTime() + 30 * 60_000),
      totalPrice: price,
      status: status as 'COMPLETED',
      items: { create: { nameSnapshot: 'Soch olish', priceSnapshot: price, durationSnapshot: 30 } },
    },
  });
}

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const users = {} as Record<Who, { id: string }>;
  for (const who of Object.keys(ids) as Who[]) {
    users[who] = await db.user.create({
      data: {
        telegramId: ids[who],
        firstName: who,
        ...(who === 'client' && { phone: '+998901234500' }),
      },
    });
  }
  const place = { region: 'tashkent-city', district: 'yunusobod', address: `Manzil ${slug}` };
  shopId = (
    await db.shop.create({ data: { slug, name: 'Client Barber', status: 'ACTIVE', ...place } })
  ).id;
  const staff = (who: Who, role: 'OWNER' | 'MASTER') =>
    db.staff.create({ data: { shopId, userId: users[who].id, displayName: who, role } });
  await staff('owner', 'OWNER');
  masterId = (await staff('master', 'MASTER')).id;
  const otherId = (await staff('other', 'MASTER')).id;
  haircutId = (
    await db.service.create({
      data: {
        shopId,
        name: 'Soch olish',
        durationMin: 30,
        price: 60_000,
        staff: { create: { staffId: masterId } },
      },
    })
  ).id;
  await db.weeklyHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      staffId: masterId,
      weekday,
      startMin: 600,
      endMin: 1200,
    })),
  });
  regularId = (
    await db.shopClient.create({
      data: {
        shopId,
        userId: users.client.id,
        name: 'Aziz Karimov',
        phone: '+998901234500',
        visitCount: 2,
        noShowCount: 1,
      },
    })
  ).id;
  walkInId = (
    await db.shopClient.create({
      data: { shopId, name: 'Bobur', phone: '+998935550011', visitCount: 1 },
    })
  ).id;
  await visit(regularId, masterId, 'COMPLETED', 60_000);
  await visit(regularId, masterId, 'COMPLETED', 90_000);
  await visit(regularId, masterId, 'NO_SHOW', 60_000);
  await visit(walkInId, otherId, 'COMPLETED', 60_000);
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.booking.deleteMany({ where: { shopId } });
  await db.auditLog.deleteMany({ where: { shopId } });
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(ids) } } });
  await db.$disconnect();
});

describe('the client list', () => {
  it('shows owners everyone, with search and filters', async () => {
    expect(names(await listAs('owner'))).toEqual(['Aziz Karimov', 'Bobur']);
    expect(names(await listAs('owner', '&filter=no_shows'))).toEqual(['Aziz Karimov']);
    expect(names(await listAs('owner', '&filter=regulars'))).toEqual([]);
    expect(names(await listAs('owner', '&q=karim'))).toEqual(['Aziz Karimov']);
    expect(names(await listAs('owner', '&q=93 555'))).toEqual(['Bobur']);
    const page = await listAs('owner');
    expect(page.more).toBe(false);
    expect(page.clients.find((c: { name: string }) => c.name === 'Bobur').lastVisitAt).toBeTruthy();
  });

  it('shows a master only the people they have served', async () => {
    expect(names(await listAs('master'))).toEqual(['Aziz Karimov']);
    expect(names(await listAs('other'))).toEqual(['Bobur']);
    expect((await detail(req('master'), clientCtx(walkInId))).status).toBe(404);
  });
});

describe('a client’s page', () => {
  it('has the counts, what they spent and their visits, latest first', async () => {
    const client = await (await detail(req('owner'), clientCtx(regularId))).json();
    expect(client).toMatchObject({
      visitCount: 2,
      noShowCount: 1,
      totalSpent: 150_000,
      hasTelegram: true,
      canBlock: true,
    });
    expect(client.visits.map((v: { status: string }) => v.status)).toEqual([
      'COMPLETED',
      'COMPLETED',
      'NO_SHOW',
    ]);
    const walkIn = await (await detail(req('owner'), clientCtx(walkInId))).json();
    expect(walkIn.hasTelegram).toBe(false);
  });

  it('lets any of their staff write notes, and clears them when emptied', async () => {
    const saved = await update(
      req('master', 'PATCH', { notes: 'Kalta soch yoqadi' }),
      clientCtx(regularId),
    );
    expect(await saved.json()).toMatchObject({ notes: 'Kalta soch yoqadi', canBlock: false });
    const cleared = await update(req('owner', 'PATCH', { notes: '' }), clientCtx(regularId));
    expect((await cleared.json()).notes).toBeNull();
  });
});

describe('the blacklist', () => {
  it('is for owners and admins, and stops online booking and waiting', async () => {
    const tryBlock = (who: Who, isBlocked: boolean) =>
      update(req(who, 'PATCH', { isBlocked }), clientCtx(regularId));
    expect((await tryBlock('master', true)).status).toBe(403);
    expect((await (await tryBlock('owner', true)).json()).isBlocked).toBe(true);
    expect(names(await listAs('owner', '&filter=blocked'))).toEqual(['Aziz Karimov']);

    const tomorrow = addDays(tashkentDate(new Date()), 1);
    const startAt = fromTashkent(tomorrow.year, tomorrow.month, tomorrow.day, 11).toISOString();
    const booked = await book(
      req('client', 'POST', { staffId: masterId, serviceIds: [haircutId], startAt }),
    );
    expect(booked.status).toBe(403);
    expect((await booked.json()).error.details.reason).toBe('client_blocked');
    const waiting = await wait(
      req('client', 'POST', {
        shopId,
        staffId: null,
        serviceIds: [haircutId],
        date: dateKey(tomorrow),
      }),
    );
    expect((await waiting.json()).error.details.reason).toBe('client_blocked');

    expect((await (await tryBlock('owner', false)).json()).isBlocked).toBe(false);
  });
});
