import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_NOTICES_PER_SIDE } from '@/domain/notices';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { applyBookingAction } from '@/server/services/booking';
import { dispatchDue } from '@/server/services/notifications';
import { POST as notice } from './[id]/notice/route';

// "Your turn is next" and running-late notices against the real database (npm run test:db).

type User = Parameters<typeof applyBookingAction>[0];

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 996_000_000 + Math.floor(Math.random() * 900_000);
const ids = {
  owner: BigInt(base + 1),
  master: BigInt(base + 2),
  other: BigInt(base + 3),
  client: BigInt(base + 4),
  stranger: BigInt(base + 5),
};
type Who = keyof typeof ids;
const slug = `nt-${Date.now().toString(36)}`;
let shopId = '';
let masterId = '';
let clientRowId = '';
let owner: User;
const MIN = 60_000;

function req(who: Who, body: object) {
  const initData = signInitData({ user: { id: Number(ids[who]), first_name: who } }, token);
  return new Request('http://t/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: JSON.stringify(body),
  });
}
const send = (who: Who, bookingId: string, body: object) =>
  notice(req(who, body), { params: Promise.resolve({ id: bookingId }) });

/** A 30-minute visit with the master, starting `offsetMin` from now. */
async function visit(offsetMin: number, status: 'CONFIRMED' | 'PENDING' = 'CONFIRMED') {
  const startAt = new Date(Date.now() + offsetMin * MIN);
  const row = await db.booking.create({
    data: {
      shopId,
      staffId: masterId,
      shopClientId: clientRowId,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * MIN),
      totalPrice: 60_000,
      status,
    },
  });
  return row.id;
}
const queued = (bookingId: string, template: string) =>
  db.notification.findMany({ where: { bookingId, template } });

let previous = '';
let next = '';
let later = '';

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const users = {} as Record<Who, User>;
  for (const who of Object.keys(ids) as Who[]) {
    users[who] = await db.user.create({ data: { telegramId: ids[who], firstName: who } });
  }
  owner = users.owner;
  const place = { region: 'tashkent-city', district: 'yunusobod', address: `Manzil ${slug}` };
  shopId = (
    await db.shop.create({ data: { slug, name: 'Notice Barber', status: 'ACTIVE', ...place } })
  ).id;
  const staff = (who: Who, role: 'OWNER' | 'MASTER') =>
    db.staff.create({ data: { shopId, userId: users[who].id, displayName: who, role } });
  await staff('owner', 'OWNER');
  masterId = (await staff('master', 'MASTER')).id;
  await staff('other', 'MASTER');
  clientRowId = (
    await db.shopClient.create({ data: { shopId, userId: users.client.id, name: 'Aziz' } })
  ).id;
  previous = await visit(-40);
  next = await visit(20);
  later = await visit(300);
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.booking.deleteMany({ where: { shopId } });
  await db.auditLog.deleteMany({ where: { shopId } });
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(ids) } } });
  await db.$disconnect();
});

describe('your turn is next', () => {
  it('goes to the next client once the master finishes, if they are due soon', async () => {
    await applyBookingAction(owner, previous, { action: 'complete', as: 'staff' });
    const [message] = await queued(next, 'booking.next_up');
    expect(message?.chatId).toBe(ids.client);
    expect(await queued(later, 'booking.next_up')).toEqual([]);

    // Changing your mind about the previous visit doesn't tell them twice.
    await applyBookingAction(owner, previous, { action: 'no_show', as: 'staff' });
    expect(await queued(next, 'booking.next_up')).toHaveLength(1);
  });

  it('can be sent by hand, only close to the start', async () => {
    expect((await send('master', next, { kind: 'next_up' })).status).toBe(200);
    const early = await send('master', later, { kind: 'next_up' });
    expect((await early.json()).error.details.reason).toBe('not_now');
  });
});

describe('the shop running late', () => {
  it('tells the client how late, and shows it on the booking', async () => {
    const response = await send('master', next, { kind: 'shop_delay', minutes: 15 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ shopDelayMin: 15 });
    const [message] = await queued(next, 'booking.running_late');
    expect(message).toMatchObject({ chatId: ids.client, payload: { minutes: 15 } });
  });

  it('is only for the master’s own bookings (or the owner), and set minutes', async () => {
    expect((await send('other', next, { kind: 'shop_delay', minutes: 15 })).status).toBe(403);
    expect((await send('client', next, { kind: 'shop_delay', minutes: 15 })).status).toBe(403);
    expect((await send('owner', next, { kind: 'shop_delay', minutes: 7 })).status).toBe(400);
  });

  it('still goes a little after the start, but not once the visit is well under way', async () => {
    const sent: string[] = [];
    const sender = async (_chat: bigint, message: { text: string }) => {
      sent.push(message.text);
    };
    const startAt = (await db.booking.findUniqueOrThrow({ where: { id: next } })).startAt;
    // Only the running-late message is under test here.
    await db.notification.updateMany({
      where: { bookingId: next, template: { not: 'booking.running_late' } },
      data: { status: 'CANCELLED' },
    });
    const soon = { now: new Date(startAt.getTime() + 10 * MIN), onlyBookings: [next] };
    expect(await dispatchDue(sender, soon)).toMatchObject({ sent: 1 });
    expect(sent[0]).toContain('15');

    await send('owner', next, { kind: 'shop_delay', minutes: 30 });
    const tooLate = { now: new Date(startAt.getTime() + 45 * MIN), onlyBookings: [next] };
    expect(await dispatchDue(sender, tooLate)).toMatchObject({ sent: 0, dropped: 1 });
  });
});

describe('the client running late', () => {
  it('tells the master and the owner, not the client', async () => {
    const response = await send('client', next, { kind: 'client_late', minutes: 10 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ clientLateMin: 10 });
    const chats = (await queued(next, 'staff.client_late')).map((n) => n.chatId);
    expect(chats.sort()).toEqual([ids.owner, ids.master].sort());
  });

  it('is only for their own booking, a few times at most', async () => {
    expect((await send('stranger', next, { kind: 'client_late', minutes: 10 })).status).toBe(404);
    for (let i = 1; i < MAX_NOTICES_PER_SIDE; i++) {
      expect((await send('client', next, { kind: 'client_late', minutes: 20 })).status).toBe(200);
    }
    const flood = await send('client', next, { kind: 'client_late', minutes: 30 });
    expect((await flood.json()).error.details.reason).toBe('too_many_notices');
  });

  it('is forgotten when the booking moves', async () => {
    const moved = new Date(Date.now() + 26 * 60 * MIN);
    await applyBookingAction(owner, next, { action: 'reschedule', as: 'staff', startAt: moved });
    expect(await db.booking.findUniqueOrThrow({ where: { id: next } })).toMatchObject({
      clientLateMin: null,
      shopDelayMin: null,
    });
  });
});
