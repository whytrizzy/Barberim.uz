import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REBOOK_NUDGE_DAYS } from '@/domain/booking';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { applyBookingAction } from '@/server/services/booking';
import { dispatchDue } from '@/server/services/notifications';
import { GET as profile } from '../shops/by-slug/[slug]/route';
import { DELETE as forget, PUT as save } from './favorites/[shopId]/route';
import { GET as list } from './favorites/route';

// Saved shops, booking the same again, and the "time for a haircut?" nudge (npm run test:db).

type User = Parameters<typeof applyBookingAction>[0];

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 994_000_000 + Math.floor(Math.random() * 900_000);
const ids = { owner: BigInt(base + 1), client: BigInt(base + 2) };
type Who = keyof typeof ids;
const slug = `fav-${Date.now().toString(36)}`;
let shopId = '';
let draftId = '';
let staffId = '';
let serviceId = '';
let clientRowId = '';
let owner: User;

function req(who: Who, method = 'GET') {
  const initData = signInitData({ user: { id: Number(ids[who]), first_name: who } }, token);
  return new Request('http://t/api', { method, headers: { Authorization: `tma ${initData}` } });
}
const on = (id: string) => ({ params: Promise.resolve({ shopId: id }) });
const shopPage = async () =>
  (await profile(req('client'), { params: Promise.resolve({ slug }) })).json();

let day = 0;
/** A visit some days ago, still to be marked done. */
async function visit(status: 'CONFIRMED' | 'COMPLETED' = 'CONFIRMED', startAt?: Date) {
  const start = startAt ?? new Date(Date.now() - (++day + 1) * 86_400_000);
  const row = await db.booking.create({
    data: {
      shopId,
      staffId,
      shopClientId: clientRowId,
      startAt: start,
      endAt: new Date(start.getTime() + 30 * 60_000),
      totalPrice: 60_000,
      status,
      items: {
        create: {
          serviceId,
          nameSnapshot: 'Soch olish',
          priceSnapshot: 60_000,
          durationSnapshot: 30,
        },
      },
    },
  });
  return row.id;
}
const nudges = (bookingId: string) =>
  db.notification.findMany({ where: { bookingId, template: 'booking.rebook_nudge' } });

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  owner = await db.user.create({ data: { telegramId: ids.owner, firstName: 'Owner' } });
  const client = await db.user.create({ data: { telegramId: ids.client, firstName: 'Client' } });
  const place = { region: 'tashkent-city', district: 'yunusobod', address: `Manzil ${slug}` };
  shopId = (
    await db.shop.create({ data: { slug, name: 'Fav Barber', status: 'ACTIVE', ...place } })
  ).id;
  draftId = (await db.shop.create({ data: { slug: `${slug}-d`, name: 'Draft', ...place } })).id;
  staffId = (
    await db.staff.create({
      data: { shopId, userId: owner.id, displayName: 'Jasur', role: 'OWNER' },
    })
  ).id;
  serviceId = (
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
  clientRowId = (await db.shopClient.create({ data: { shopId, userId: client.id, name: 'Aziz' } }))
    .id;
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.booking.deleteMany({ where: { shopId } });
  await db.shop.deleteMany({ where: { id: { in: [shopId, draftId] } } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(ids) } } });
  await db.$disconnect();
});

describe('saved shops', () => {
  it('saves a shop once, shows it on the shop page, and forgets it', async () => {
    expect((await shopPage()).isFavorite).toBe(false);
    expect((await save(req('client', 'PUT'), on(shopId))).status).toBe(200);
    expect((await save(req('client', 'PUT'), on(shopId))).status).toBe(200);
    expect(await db.favorite.count({ where: { shopId } })).toBe(1);
    expect((await shopPage()).isFavorite).toBe(true);

    const removed = await forget(req('client', 'DELETE'), on(shopId));
    expect(await removed.json()).toEqual({ shopId, isFavorite: false });
    expect((await shopPage()).isFavorite).toBe(false);
  });

  it('won’t save a shop that isn’t live', async () => {
    expect((await save(req('client', 'PUT'), on(draftId))).status).toBe(404);
    expect((await save(req('client', 'PUT'), on('not-a-uuid'))).status).toBe(404);
  });

  it('lists saved shops with the last finished visit, ready to book again', async () => {
    await save(req('client', 'PUT'), on(shopId));
    const done = await visit('COMPLETED');
    const { shops } = await (await list(req('client'))).json();
    expect(shops).toHaveLength(1);
    expect(shops[0]).toMatchObject({
      id: shopId,
      lastVisit: { bookingId: done, staffId, masterName: 'Jasur', serviceIds: [serviceId] },
    });
    // Nobody else's list changes.
    expect((await (await list(req('owner'))).json()).shops).toEqual([]);
  });
});

describe('“time for a haircut?”', () => {
  it('is queued at 11:00 Tashkent time, some weeks after the visit', async () => {
    const start = new Date(Date.now() - 5 * 3_600_000);
    const booking = await visit('CONFIRMED', start);
    await applyBookingAction(owner, booking, { action: 'complete', as: 'staff' });
    const [nudge] = await nudges(booking);
    expect(nudge?.chatId).toBe(ids.client);
    const days = (nudge!.sendAt.getTime() - start.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(REBOOK_NUDGE_DAYS - 1);
    expect(days).toBeLessThan(REBOOK_NUDGE_DAYS + 1);
    // 11:00 in Tashkent is 06:00 UTC.
    expect(nudge!.sendAt.getUTCHours()).toBe(6);
  });

  it('only counts the latest visit', async () => {
    const first = await visit();
    await applyBookingAction(owner, first, { action: 'complete', as: 'staff' });
    const second = await visit('CONFIRMED', new Date(Date.now() - 4 * 3_600_000));
    await applyBookingAction(owner, second, { action: 'complete', as: 'staff' });
    expect((await nudges(first)).map((n) => n.status)).toEqual(['CANCELLED']);
    expect((await nudges(second)).map((n) => n.status)).toEqual(['PENDING']);
  });

  it('is sent when due, but not once they have booked again', async () => {
    const latest = await visit('CONFIRMED', new Date(Date.now() - 3 * 3_600_000));
    await applyBookingAction(owner, latest, { action: 'complete', as: 'staff' });
    const [nudge] = await nudges(latest);
    // Only the nudge is under test here, not the review request for the same visit.
    await db.notification.updateMany({
      where: { bookingId: latest, template: { not: 'booking.rebook_nudge' } },
      data: { status: 'CANCELLED' },
    });
    const due = { now: new Date(nudge!.sendAt.getTime() + 60_000), onlyBookings: [latest] };

    const sent: string[] = [];
    const sender = async (_chat: bigint, message: { text: string }) => {
      sent.push(message.text);
    };
    // Booked again for next week: the nudge has nothing to add.
    const next = await visit('CONFIRMED', new Date(Date.now() + 7 * 86_400_000));
    expect(await dispatchDue(sender, due)).toMatchObject({ sent: 0, dropped: 1 });
    expect((await nudges(latest))[0]).toMatchObject({
      status: 'CANCELLED',
      lastError: 'booked again',
    });

    // Without that booking it goes out.
    await db.booking.delete({ where: { id: next } });
    // Put it back as it was before that run claimed it.
    await db.notification.update({
      where: { id: nudge!.id },
      data: { status: 'PENDING', sendAt: nudge!.sendAt, lastError: null },
    });
    expect(await dispatchDue(sender, due)).toMatchObject({ sent: 1, dropped: 0 });
    expect(sent[0]).toContain('Fav Barber');
  });

  it('is taken back when the visit turns out to be a no-show', async () => {
    const booking = await visit('CONFIRMED', new Date(Date.now() - 2 * 3_600_000));
    await applyBookingAction(owner, booking, { action: 'complete', as: 'staff' });
    await applyBookingAction(owner, booking, { action: 'no_show', as: 'staff' });
    expect((await nudges(booking)).map((n) => n.status)).toEqual(['CANCELLED']);
  });
});
