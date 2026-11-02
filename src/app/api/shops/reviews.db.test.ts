import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { applyBookingAction } from '@/server/services/booking';
import { discoverShops } from '@/server/services/discover';
import { dispatchDue } from '@/server/services/notifications';
import { GET as mine, POST as leave } from '../me/bookings/[id]/review/route';
import { PATCH as act } from './[id]/reviews/[reviewId]/route';
import { GET as list } from './[id]/reviews/route';
import { GET as profile } from './by-slug/[slug]/route';

// Reviews against the real database (npm run test:db).

type User = Parameters<typeof applyBookingAction>[0];

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 992_000_000 + Math.floor(Math.random() * 900_000);
const ids = {
  owner: BigInt(base + 1),
  master: BigInt(base + 2),
  other: BigInt(base + 3),
  client: BigInt(base + 4),
  stranger: BigInt(base + 5),
};
type Who = keyof typeof ids;
const slug = `rev-${Date.now().toString(36)}`;
let shopId = '';
let masterStaffId = '';
let otherStaffId = '';
let clientRowId = '';
let owner: User;

function req(who: Who, method = 'GET', body?: object) {
  const initData = signInitData({ user: { id: Number(ids[who]), first_name: who } }, token);
  return new Request('http://t/api', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const on = (id: string) => ({ params: Promise.resolve({ id }) });
const review = (who: Who, bookingId: string, body: object) =>
  leave(req(who, 'POST', body), on(bookingId));

let hour = 0;
async function visit(staffId: string, status: 'COMPLETED' | 'CONFIRMED' = 'COMPLETED') {
  const start = new Date(Date.now() - (++hour + 1) * 3_600_000);
  const row = await db.booking.create({
    data: {
      shopId,
      staffId,
      shopClientId: clientRowId,
      startAt: start,
      endAt: new Date(start.getTime() + 30 * 60_000),
      totalPrice: 60_000,
      status,
    },
  });
  return row.id;
}

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const user = (who: Who, firstName: string) =>
    db.user.create({ data: { telegramId: ids[who], firstName } });
  owner = await user('owner', 'Owner');
  const master = await user('master', 'Master');
  const other = await user('other', 'Other');
  const client = await user('client', 'Client');
  const shop = await db.shop.create({
    data: {
      slug,
      name: 'Review Barber',
      region: 'tashkent-city',
      district: 'yunusobod',
      address: `Manzil ${slug}`,
      status: 'ACTIVE',
    },
  });
  shopId = shop.id;
  const staff = (userId: string, displayName: string, role: 'OWNER' | 'MASTER') =>
    db.staff.create({ data: { shopId, userId, displayName, role } });
  const ownerStaff = await staff(owner.id, 'Owner', 'OWNER');
  masterStaffId = (await staff(master.id, 'Sardor', 'MASTER')).id;
  otherStaffId = (await staff(other.id, 'Bekzod', 'MASTER')).id;
  const service = await db.service.create({
    data: {
      shopId,
      name: 'Soch',
      durationMin: 30,
      price: 60_000,
      staff: { create: { staffId: ownerStaff.id } },
    },
  });
  expect(service.id).toBeTruthy();
  clientRowId = (
    await db.shopClient.create({ data: { shopId, userId: client.id, name: 'Aziz Karimov' } })
  ).id;
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.booking.deleteMany({ where: { shopId } });
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(ids) } } });
  await db.$disconnect();
});

describe('leaving a review', () => {
  it('takes one review for a finished visit', async () => {
    const booking = await visit(masterStaffId);
    const response = await review('client', booking, { rating: 5, comment: 'Zo‘r!' });
    expect(response.status).toBe(201);
    expect(await (await mine(req('client'), on(booking))).json()).toMatchObject({
      review: { rating: 5, comment: 'Zo‘r!', reply: null },
    });

    const twice = await review('client', booking, { rating: 1 });
    expect(twice.status).toBe(409);
    expect((await twice.json()).error.details.reason).toBe('already_reviewed');
  });

  it('refuses a visit that hasn’t happened, and other people’s visits', async () => {
    const upcoming = await visit(masterStaffId, 'CONFIRMED');
    const early = await review('client', upcoming, { rating: 5 });
    expect((await early.json()).error.details.reason).toBe('not_completed');

    const done = await visit(masterStaffId);
    expect((await review('stranger', done, { rating: 1 })).status).toBe(404);
    expect((await review('owner', done, { rating: 5 })).status).toBe(404);
    expect((await mine(req('stranger'), on(done))).status).toBe(404);
  });

  it('refuses ratings outside 1 to 5', async () => {
    const done = await visit(masterStaffId);
    for (const rating of [0, 6, 2.5]) {
      expect((await review('client', done, { rating })).status).toBe(400);
    }
  });
});

describe('what clients see', () => {
  it('shows the average and latest reviews, with first names only', async () => {
    const low = await visit(otherStaffId);
    await review('client', low, { rating: 2 });
    const response = await profile(req('stranger'), { params: Promise.resolve({ slug }) });
    const shop = await response.json();
    expect(shop.rating).toEqual({ average: 3.5, count: 2 });
    expect(shop.reviews[0]).toMatchObject({ clientName: 'Aziz', masterName: 'Bekzod' });
    expect(JSON.stringify(shop.reviews)).not.toContain('Karimov');
  });

  it('leaves hidden reviews out of the page and the average', async () => {
    const hiddenBooking = await visit(otherStaffId);
    await review('client', hiddenBooking, { rating: 1 });
    await db.review.update({ where: { bookingId: hiddenBooking }, data: { isHidden: true } });
    const shop = await (
      await profile(req('stranger'), { params: Promise.resolve({ slug }) })
    ).json();
    expect(shop.rating.count).toBe(2);
    const staff = await (await list(req('owner'), on(shopId))).json();
    expect(staff.reviews.some((r: { isHidden: boolean }) => r.isHidden)).toBe(true);
  });

  it('shows the rating in search once a master can be booked', async () => {
    await db.staffService.create({
      data: {
        staffId: masterStaffId,
        serviceId: (await db.service.findFirstOrThrow({ where: { shopId } })).id,
      },
    });
    const { shops } = await discoverShops({ query: `Manzil ${slug}` });
    expect(shops[0]?.rating).toEqual({ average: 3.5, count: 2 });
  });
});

describe('answering', () => {
  const reviewOf = (bookingId: string) => db.review.findUniqueOrThrow({ where: { bookingId } });
  const patch = (who: Who, reviewId: string, body: object) =>
    act(req(who, 'PATCH', body), { params: Promise.resolve({ id: shopId, reviewId }) });

  it('lets owners answer any review, and masters only their own', async () => {
    const booking = await visit(masterStaffId);
    await review('client', booking, { rating: 4 });
    const { id } = await reviewOf(booking);

    expect((await patch('other', id, { action: 'reply', reply: 'x' })).status).toBe(403);
    expect((await patch('client', id, { action: 'reply', reply: 'x' })).status).toBe(403);
    expect((await patch('master', id, { action: 'reply', reply: 'Rahmat!' })).status).toBe(200);
    expect((await patch('owner', id, { action: 'reply', reply: 'Katta rahmat!' })).status).toBe(
      200,
    );
    expect(await (await mine(req('client'), on(booking))).json()).toMatchObject({
      review: { reply: 'Katta rahmat!' },
    });
  });

  it('flagging keeps the review visible: a shop can’t remove one it dislikes', async () => {
    const booking = await visit(masterStaffId);
    await review('client', booking, { rating: 1, comment: 'Yomon' });
    const { id } = await reviewOf(booking);
    expect((await patch('owner', id, { action: 'flag' })).status).toBe(200);
    expect(await reviewOf(booking)).toMatchObject({ isFlagged: true, isHidden: false });
    const shop = await (
      await profile(req('stranger'), { params: Promise.resolve({ slug }) })
    ).json();
    expect(shop.reviews.map((r: { id: string }) => r.id)).toContain(id);
  });

  it('won’t act on a review through another shop', async () => {
    const booking = await visit(masterStaffId);
    await review('client', booking, { rating: 3 });
    const { id } = await reviewOf(booking);
    const response = await act(req('owner', 'PATCH', { action: 'flag' }), {
      params: Promise.resolve({ id: '01a00000-0000-7000-8000-000000000000', reviewId: id }),
    });
    expect(response.status).toBe(403);
  });
});

describe('asking for a review', () => {
  const asks = (bookingId: string) =>
    db.notification.findMany({ where: { bookingId, template: 'booking.review_ask' } });

  it('asks once, an hour after the visit is marked done, even though it has started', async () => {
    const booking = await visit(masterStaffId, 'CONFIRMED');
    await applyBookingAction(owner, booking, { action: 'complete', as: 'staff' });
    const [ask] = await asks(booking);
    expect(ask?.chatId).toBe(ids.client);
    expect(ask!.sendAt.getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);

    const sent: string[] = [];
    const result = await dispatchDue(
      async (_chat, message) => {
        sent.push(message.text);
      },
      { now: new Date(Date.now() + 2 * 3_600_000), onlyBookings: [booking] },
    );
    expect(result).toMatchObject({ sent: 1, dropped: 0 });
    expect(sent[0]).toContain('Review Barber');
  });

  it('takes it back on a no-show, and doesn’t ask after a correction', async () => {
    const booking = await visit(masterStaffId, 'CONFIRMED');
    await applyBookingAction(owner, booking, { action: 'complete', as: 'staff' });
    await applyBookingAction(owner, booking, { action: 'no_show', as: 'staff' });
    expect((await asks(booking)).map((a) => a.status)).toEqual(['CANCELLED']);

    const reviewed = await visit(masterStaffId, 'CONFIRMED');
    await db.booking.update({ where: { id: reviewed }, data: { status: 'COMPLETED' } });
    await review('client', reviewed, { rating: 5 });
    await db.booking.update({ where: { id: reviewed }, data: { status: 'NO_SHOW' } });
    await applyBookingAction(owner, reviewed, { action: 'complete', as: 'staff' });
    expect(await asks(reviewed)).toEqual([]);
  });
});
