import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, dateKey, fromTashkent, tashkentDate } from '@/domain/time';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { applyBookingAction } from '@/server/services/booking';
import { GET as availability } from '../shops/[id]/availability/route';
import { POST as addService } from '../shops/[id]/services/route';
import { POST as book } from './route';

// Wedding (to'y) packages against the real database (npm run test:db): a fixed block for a group,
// booked months ahead, waiting for the shop to confirm the prepayment.

type User = Parameters<typeof applyBookingAction>[0];

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 997_000_000 + Math.floor(Math.random() * 900_000);
const ids = { owner: BigInt(base + 1), client: BigInt(base + 2) };
type Who = keyof typeof ids;
const slug = `wd-${Date.now().toString(36)}`;
const today = tashkentDate(new Date());
/** About three months ahead: past the shop's usual 30 days, inside the package's 180. */
const farDay = addDays(today, 100);
const farAt = (h: number) => fromTashkent(farDay.year, farDay.month, farDay.day, h);
let shopId = '';
let staffId = '';
let packageId = '';
let haircutId = '';
let owner: User;

function req(who: Who, method = 'GET', body?: object, url = 'http://t/api') {
  const initData = signInitData({ user: { id: Number(ids[who]), first_name: who } }, token);
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const shopCtx = () => ({ params: Promise.resolve({ id: shopId }) });
const reserve = (startAt: Date, serviceIds: string[], peopleCount?: number) =>
  book(req('client', 'POST', { staffId, serviceIds, startAt: startAt.toISOString(), peopleCount }));
const service = (body: object) =>
  addService(
    req('owner', 'POST', {
      name: 'Kuyov paketi',
      category: 'WEDDING',
      durationMin: 180,
      price: 300_000,
      priceIsFrom: false,
      staffIds: [staffId],
      ...body,
    }),
    shopCtx(),
  );

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  owner = await db.user.create({ data: { telegramId: ids.owner, firstName: 'Owner' } });
  await db.user.create({
    data: { telegramId: ids.client, firstName: 'Kuyov', phone: '+998901112233' },
  });
  const place = { region: 'tashkent-city', district: 'yunusobod', address: `Manzil ${slug}` };
  shopId = (
    await db.shop.create({ data: { slug, name: 'Toy Barber', status: 'ACTIVE', ...place } })
  ).id;
  staffId = (
    await db.staff.create({
      data: { shopId, userId: owner.id, displayName: 'Jasur', role: 'OWNER' },
    })
  ).id;
  await db.weeklyHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      staffId,
      weekday,
      startMin: 600,
      endMin: 1200,
    })),
  });
  haircutId = (
    await db.service.create({
      data: {
        shopId,
        name: 'Soch olish',
        durationMin: 30,
        price: 60_000,
        staff: { create: { staffId } },
      },
    })
  ).id;
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.booking.deleteMany({ where: { shopId } });
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(ids) } } });
  await db.$disconnect();
});

describe('setting up a package', () => {
  it('keeps how many people, how far ahead and the prepayment', async () => {
    const response = await service({ maxPeople: 6, bookAheadDays: 180, depositAmount: 100_000 });
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({ maxPeople: 6, bookAheadDays: 180, depositAmount: 100_000 });
    packageId = created.id;
  });

  it('refuses a prepayment above the price, and drops the extras off a non-wedding service', async () => {
    expect((await service({ depositAmount: 400_000 })).status).toBe(400);
    const plain = await (await service({ category: 'ADULT', maxPeople: 6 })).json();
    expect(plain).toMatchObject({ maxPeople: null, bookAheadDays: null, depositAmount: null });
    await db.service.delete({ where: { id: plain.id } });
  });
});

describe('booking a package', () => {
  it('offers days months ahead for the package, but not for an ordinary service', async () => {
    const ask = (services: string) =>
      availability(
        req(
          'client',
          'GET',
          undefined,
          `http://t/api?staff=${staffId}&services=${services}&from=${dateKey(farDay)}`,
        ),
        shopCtx(),
      ).then((r) => r.json());
    const wedding = await ask(packageId);
    expect(wedding.days[0]).toMatchObject({ date: dateKey(farDay), status: 'open' });
    const haircut = await ask(haircutId);
    expect(haircut.days.some((d: { date: string }) => d.date === dateKey(farDay))).toBe(false);
  });

  it('books the group in one block, waiting for the prepayment', async () => {
    const response = await reserve(farAt(12), [packageId], 4);
    expect(response.status).toBe(201);
    const booking = await response.json();
    expect(booking).toMatchObject({ status: 'PENDING', peopleCount: 4, depositAmount: 100_000 });
    // The block doesn't grow with the group.
    expect(new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime()).toBe(
      180 * 60_000,
    );
    const asked = await db.notification.findMany({
      where: { bookingId: booking.id, template: 'staff.request' },
    });
    expect(asked.map((n) => n.chatId)).toEqual([ids.owner]);

    // The shop got the prepayment.
    const confirmed = await applyBookingAction(owner, booking.id, {
      action: 'confirm',
      as: 'staff',
    });
    expect(confirmed.status).toBe('CONFIRMED');
  });

  it('refuses more people than the package covers', async () => {
    const response = await reserve(farAt(16), [packageId], 7);
    expect(response.status).toBe(400);
    expect((await response.json()).error.details).toMatchObject({
      reason: 'too_many_people',
      limit: 6,
    });
  });

  it('keeps ordinary services to the shop’s usual limit', async () => {
    const response = await reserve(farAt(16), [haircutId]);
    expect((await response.json()).error.details.reason).toBe('slot_unavailable');
  });
});
