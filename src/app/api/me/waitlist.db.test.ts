import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, dateKey, fromTashkent, tashkentDate } from '@/domain/time';
import { MAX_WAITLIST_ENTRIES } from '@/features/waitlist/schemas';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { applyBookingAction } from '@/server/services/booking';
import { dispatchDue } from '@/server/services/notifications';
import { DELETE as leave } from './waitlist/[id]/route';
import { GET as list, POST as join } from './waitlist/route';

// The waitlist against the real database (npm run test:db). The master works 10:00–10:30 every
// day, so one 30-minute booking fills a day.

type User = Parameters<typeof applyBookingAction>[0];

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 995_000_000 + Math.floor(Math.random() * 900_000);
const ids = { owner: BigInt(base + 1), waiter: BigInt(base + 2), other: BigInt(base + 3) };
type Who = keyof typeof ids;
const slug = `wl-${Date.now().toString(36)}`;
const tomorrow = addDays(tashkentDate(new Date()), 1);
const day = dateKey(tomorrow);
const tenOClock = fromTashkent(tomorrow.year, tomorrow.month, tomorrow.day, 10);
let shopId = '';
let staffId = '';
let serviceId = '';
const clientRows: Record<Who, string> = { owner: '', waiter: '', other: '' };
let owner: User;

function req(who: Who, method = 'GET', body?: object) {
  const initData = signInitData({ user: { id: Number(ids[who]), first_name: who } }, token);
  return new Request('http://t/api', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const wait = (who: Who, date = day, extra: object = {}) =>
  join(req(who, 'POST', { shopId, staffId: null, serviceIds: [serviceId], date, ...extra }));

/** Takes 10:00 tomorrow for someone, filling the day. */
async function fill(who: Who) {
  const row = await db.booking.create({
    data: {
      shopId,
      staffId,
      shopClientId: clientRows[who],
      startAt: tenOClock,
      endAt: new Date(tenOClock.getTime() + 30 * 60_000),
      totalPrice: 60_000,
    },
  });
  return row.id;
}
const entryOf = (who: Who) =>
  db.waitlistEntry.findFirstOrThrow({ where: { shopId, user: { telegramId: ids[who] } } });
const alertsTo = (who: Who) =>
  db.notification.findMany({ where: { chatId: ids[who], template: 'waitlist.slot_free' } });
const sent: { text: string; path?: string }[] = [];
const sender = async (_chat: bigint, message: { text: string; buttons: unknown[][] }) => {
  const button = message.buttons[0]?.[0] as { path?: string } | undefined;
  sent.push({ text: message.text, path: button?.path });
};
const dispatch = () => dispatchDue(sender, { onlyChats: [ids.waiter] });

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const users = {} as Record<Who, User>;
  for (const who of Object.keys(ids) as Who[]) {
    users[who] = await db.user.create({ data: { telegramId: ids[who], firstName: who } });
  }
  owner = users.owner;
  const place = { region: 'tashkent-city', district: 'yunusobod', address: `Manzil ${slug}` };
  shopId = (
    await db.shop.create({ data: { slug, name: 'Wait Barber', status: 'ACTIVE', ...place } })
  ).id;
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
  await db.weeklyHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      staffId,
      weekday,
      startMin: 600,
      endMin: 630,
    })),
  });
  for (const who of Object.keys(ids) as Who[]) {
    clientRows[who] = (
      await db.shopClient.create({ data: { shopId, userId: users[who].id, name: who } })
    ).id;
  }
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.notification.deleteMany({ where: { chatId: { in: Object.values(ids) } } });
  await db.booking.deleteMany({ where: { shopId } });
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(ids) } } });
  await db.$disconnect();
});

describe('joining', () => {
  it('waits once per day, and joining again updates the same entry', async () => {
    expect((await wait('waiter')).status).toBe(201);
    expect((await wait('waiter', day, { staffId })).status).toBe(201);
    const { entries } = await (await list(req('waiter'))).json();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      date: day,
      staffId,
      masterName: 'Jasur',
      serviceNames: ['Soch olish'],
    });
    expect((await (await list(req('other'))).json()).entries).toEqual([]);
  });

  it('refuses days outside the booking window and services the shop doesn’t have', async () => {
    const yesterday = dateKey(addDays(tashkentDate(new Date()), -1));
    const farAway = dateKey(addDays(tashkentDate(new Date()), 30));
    for (const date of [yesterday, farAway]) {
      const response = await wait('other', date);
      expect((await response.json()).error.details.reason).toBe('outside_booking_window');
    }
    const foreign = '01a00000-0000-7000-8000-000000000000';
    expect((await wait('other', day, { serviceIds: [foreign] })).status).toBe(400);
  });

  it(`waits for at most ${MAX_WAITLIST_ENTRIES} days at once`, async () => {
    const today = tashkentDate(new Date());
    for (let i = 2; i < 2 + MAX_WAITLIST_ENTRIES; i++) {
      expect((await wait('other', dateKey(addDays(today, i)))).status).toBe(201);
    }
    const one = await wait('other', dateKey(addDays(today, 2 + MAX_WAITLIST_ENTRIES)));
    expect((await one.json()).error.details.reason).toBe('too_many_entries');
    await db.waitlistEntry.deleteMany({ where: { shopId, user: { telegramId: ids.other } } });
  });

  it('leaves the waitlist, but not someone else’s', async () => {
    const { id } = await (await wait('other')).json();
    const on = { params: Promise.resolve({ id }) };
    expect((await leave(req('waiter', 'DELETE'), on)).status).toBe(404);
    expect((await leave(req('other', 'DELETE'), on)).status).toBe(200);
    expect((await entryOf('other')).status).toBe('CANCELLED');
  });
});

describe('when a time frees up', () => {
  it('tells the person waiting, with a link to that day', async () => {
    const booking = await fill('other');
    await applyBookingAction(owner, booking, { action: 'cancel', as: 'staff' });
    expect(await alertsTo('waiter')).toHaveLength(1);

    expect(await dispatch()).toMatchObject({ sent: 1, dropped: 0 });
    expect(sent.at(-1)?.text).toContain('Wait Barber');
    expect(sent.at(-1)?.path).toContain(`date=${day}`);
    expect((await entryOf('waiter')).status).toBe('NOTIFIED');
  });

  it('says nothing if the time was taken again before the message went', async () => {
    await wait('waiter');
    const first = await fill('other');
    await applyBookingAction(owner, first, { action: 'cancel', as: 'staff' });
    // Someone else books it straight away.
    await fill('other');
    expect(await dispatch()).toMatchObject({ sent: 0, dropped: 1 });
    // Still waiting, and the next freed time tries again.
    expect(await entryOf('waiter')).toMatchObject({ status: 'ACTIVE', alertQueuedAt: null });
  });

  it('stops waiting once they have booked that day', async () => {
    await db.booking.deleteMany({ where: { shopId } });
    const theirs = await fill('waiter');
    await db.notification.create({
      data: {
        chatId: ids.waiter,
        template: 'waitlist.slot_free',
        sendAt: new Date(),
        payload: {
          entryId: (await entryOf('waiter')).id,
          shopName: 'Wait Barber',
          slug,
          date: day,
          staffId: null,
          serviceIds: [serviceId],
          locale: 'uz-Latn',
        },
      },
    });
    expect(await dispatch()).toMatchObject({ sent: 0, dropped: 1 });
    expect((await entryOf('waiter')).status).toBe('CANCELLED');
    await db.booking.delete({ where: { id: theirs } });
  });
});
