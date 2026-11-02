import { GrammyError } from 'grammy';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, fromTashkent, tashkentDate } from '@/domain/time';
import { db } from '@/server/db/client';
import {
  applyBookingAction,
  createClientBooking,
  createStaffBooking,
} from '@/server/services/booking';
import { bookingReplies } from '@/server/services/booking-replies';
import { dispatchDue } from '@/server/services/notifications';

// The outbox against the real database (npm run test:db). Nothing here talks to Telegram.

type User = Parameters<typeof createStaffBooking>[0];

vi.hoisted(() => {
  process.env.CRON_SECRET = 'test-cron-secret-that-is-long-enough';
});

const base = 997_000_000 + Math.floor(Math.random() * 900_000);
const tomorrow = addDays(tashkentDate(new Date()), 1);
const at = (hour: number, minute = 0) =>
  fromTashkent(tomorrow.year, tomorrow.month, tomorrow.day, hour, minute);

let shopId = '';
let staffId = '';
let serviceId = '';
let owner: User;
let client: User;

type Sent = { chatId: bigint; text: string };
const sent: Sent[] = [];
const okSender = async (chatId: bigint, message: { text: string }) => {
  sent.push({ chatId, text: message.text });
};

const failing =
  (code: number, parameters = {}) =>
  async () => {
    throw new GrammyError(
      'failed',
      { ok: false, error_code: code, description: 'no', parameters },
      'sendMessage',
      {},
    );
  };

const reminders = ['booking.reminder24h', 'booking.reminder2h'];

/** Everything but reminders, which have their own tests below. */
const messages = (bookingId: string) =>
  db.notification.findMany({
    where: { bookingId, template: { notIn: reminders } },
    orderBy: { createdAt: 'asc' },
  });

const remindersOf = (bookingId: string) =>
  db.notification.findMany({
    where: { bookingId, template: { in: reminders } },
    orderBy: { sendAt: 'asc' },
  });

/** A booking whose reminders are out of the way of tests about sending. */
const clientBooking = async (hour: number) => {
  const booking = await createClientBooking(client, {
    staffId,
    serviceIds: [serviceId],
    startAt: at(hour),
  });
  await db.notification.deleteMany({
    where: { bookingId: booking.id, template: { in: reminders } },
  });
  return booking;
};

const threeDaysOn = addDays(tashkentDate(new Date()), 3);
const later = (hour: number) =>
  fromTashkent(threeDaysOn.year, threeDaysOn.month, threeDaysOn.day, hour);
const HOUR = 3_600_000;

describe('reminders', () => {
  const book = (hour: number) =>
    createClientBooking(client, { staffId, serviceIds: [serviceId], startAt: later(hour) });

  it('schedules both, a day and two hours ahead', async () => {
    const booking = await book(9);
    const rows = await remindersOf(booking.id);
    expect(rows.map((r) => [r.template, r.status])).toEqual([
      ['booking.reminder24h', 'PENDING'],
      ['booking.reminder2h', 'PENDING'],
    ]);
    expect(rows[0]!.sendAt.getTime()).toBe(later(9).getTime() - 24 * HOUR);
    expect(rows[1]!.sendAt.getTime()).toBe(later(9).getTime() - 2 * HOUR);
  });

  it('redoes them when the booking moves, and forgets the "coming"', async () => {
    const booking = await book(10);
    expect(await bookingReplies.coming(Number(client.telegramId), booking.id)).toBe('ok');
    await applyBookingAction(owner, booking.id, {
      action: 'reschedule',
      as: 'staff',
      startAt: later(11),
    });
    const rows = await remindersOf(booking.id);
    expect(rows.filter((r) => r.status === 'CANCELLED')).toHaveLength(2);
    const live = rows.filter((r) => r.status === 'PENDING');
    expect(live.map((r) => r.sendAt.getTime())).toEqual([
      later(11).getTime() - 24 * HOUR,
      later(11).getTime() - 2 * HOUR,
    ]);
    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.clientConfirmedAt).toBeNull();
  });

  it('drops them when the booking is cancelled', async () => {
    const booking = await book(12);
    await applyBookingAction(client, booking.id, { action: 'cancel', as: 'client' });
    const rows = await remindersOf(booking.id);
    expect(rows.every((r) => r.status === 'CANCELLED')).toBe(true);
  });

  it('sends with Coming, Cancel and Reschedule buttons when due', async () => {
    const booking = await book(13);
    const dueAt = new Date(later(13).getTime() - 24 * HOUR + 1000);
    const got: { text: string; buttons: unknown[][] }[] = [];
    const result = await dispatchDue(
      async (_chat, message) => {
        got.push(message);
      },
      { now: dueAt, onlyBookings: [booking.id] },
    );
    // The "you're booked" message was due too.
    expect(result).toMatchObject({ sent: 2 });
    const reminder = got.find((m) => m.buttons.flat().length === 3);
    expect(reminder?.buttons.flat().map((b) => (b as { label: string }).label)).toEqual([
      'Приду',
      'Отменить',
      'Другое время',
    ]);
  });

  it('skips a day-before reminder that would arrive at the last moment', async () => {
    const booking = await book(14);
    await db.notification.deleteMany({
      where: { bookingId: booking.id, template: { notIn: ['booking.reminder24h'] } },
    });
    const result = await dispatchDue(okSender, {
      now: new Date(later(14).getTime() - 2 * HOUR),
      onlyBookings: [booking.id],
    });
    expect(result).toMatchObject({ sent: 0, dropped: 1 });
  });
});

describe('answers to a reminder', () => {
  const id = () => Number(client.telegramId);

  it('marks the client as coming, for that client only', async () => {
    const booking = await clientBooking(5);
    expect(await bookingReplies.coming(Number(owner.telegramId), booking.id)).toBe('not_found');
    expect(await bookingReplies.coming(base + 99, booking.id)).toBe('not_found');
    expect(await bookingReplies.coming(id(), booking.id)).toBe('ok');
    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.clientConfirmedAt).not.toBeNull();
  });

  it('cancels for that client only, once', async () => {
    const booking = await clientBooking(3);
    expect(await bookingReplies.cancel(Number(owner.telegramId), booking.id)).toBe('not_found');
    expect(await bookingReplies.cancel(id(), booking.id)).toBe('ok');
    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe('CANCELLED_CLIENT');
    expect(await bookingReplies.cancel(id(), booking.id)).toBe('too_late');
    expect(await bookingReplies.coming(id(), booking.id)).toBe('too_late');
  });

  it('knows the person’s language, and nothing about strangers', async () => {
    expect(await bookingReplies.localeOf(id())).toBe('ru');
    expect(await bookingReplies.localeOf(base + 99)).toBeNull();
  });
});

beforeAll(async () => {
  owner = await db.user.create({ data: { telegramId: BigInt(base + 1), firstName: 'Owner' } });
  client = await db.user.create({
    data: {
      telegramId: BigInt(base + 2),
      firstName: 'Client',
      phone: '+998901119988',
      locale: 'ru',
    },
  });
  const shop = await db.shop.create({
    data: {
      slug: `out-${Date.now().toString(36)}`,
      name: 'Outbox Barber',
      region: 'tashkent-city',
      district: 'yunusobod',
      address: '4-mavze',
      status: 'ACTIVE',
      settings: { minNoticeMin: 0, maxActiveBookingsPerClient: 20 },
    },
  });
  shopId = shop.id;
  staffId = (
    await db.staff.create({
      data: { shopId, userId: owner.id, displayName: 'Sardor', role: 'OWNER' },
    })
  ).id;
  serviceId = (
    await db.service.create({
      data: {
        shopId,
        name: 'Soch',
        durationMin: 20,
        price: 60_000,
        staff: { create: { staffId } },
      },
    })
  ).id;
  await db.weeklyHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      staffId,
      weekday,
      startMin: 0,
      endMin: 1440,
    })),
  });
});

beforeEach(() => {
  sent.length = 0;
});

afterAll(async () => {
  await db.booking.deleteMany({ where: { shopId } });
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { id: { in: [owner.id, client.id] } } });
  await db.$disconnect();
});

describe('what gets queued', () => {
  it('tells a client who booked, in their language and for their account', async () => {
    const booking = await clientBooking(9);
    const [message] = await messages(booking.id);
    expect(message).toMatchObject({
      template: 'booking.created',
      status: 'PENDING',
      chatId: client.telegramId,
    });
    expect(message?.payload).toMatchObject({ shopName: 'Outbox Barber', locale: 'ru' });
  });

  it('tells the client what the shop did, but not what they did themselves', async () => {
    const booking = await clientBooking(10);
    await applyBookingAction(owner, booking.id, {
      action: 'reschedule',
      as: 'staff',
      startAt: at(11),
    });
    let queued = await messages(booking.id);
    expect(queued.map((m) => m.template)).toEqual(['booking.created', 'booking.moved']);
    expect(queued[1]?.payload).toMatchObject({ startAt: at(11).toISOString() });

    await applyBookingAction(client, booking.id, {
      action: 'reschedule',
      as: 'client',
      startAt: at(12),
    });
    queued = await messages(booking.id);
    expect(queued).toHaveLength(2);
  });

  it('drops what hasn’t gone out when a booking is cancelled, then says so', async () => {
    const booking = await clientBooking(13);
    await applyBookingAction(owner, booking.id, { action: 'cancel', as: 'staff' });
    const queued = await messages(booking.id);
    expect(queued.map((m) => [m.template, m.status])).toEqual([
      ['booking.created', 'CANCELLED'],
      ['booking.cancelled_by_shop', 'PENDING'],
    ]);
  });

  it('sends nothing to walk-ins, or to people with no Telegram account', async () => {
    const walkIn = await createStaffBooking(owner, {
      staffId,
      serviceIds: [serviceId],
      startAt: at(14),
      source: 'WALK_IN',
      client: { shopClientId: (await knownClient()).id },
    });
    expect(await messages(walkIn.id)).toEqual([]);

    const byPhone = await createStaffBooking(owner, {
      staffId,
      serviceIds: [serviceId],
      startAt: at(15),
      source: 'PHONE',
      client: { name: 'No Telegram', phone: '+998907770011' },
    });
    expect(await messages(byPhone.id)).toEqual([]);

    const known = await createStaffBooking(owner, {
      staffId,
      serviceIds: [serviceId],
      startAt: at(16),
      source: 'PHONE',
      client: { shopClientId: (await knownClient()).id },
    });
    expect((await messages(known.id)).map((m) => m.template)).toEqual(['booking.created']);
  });

  it('rolls the message back with a change that fails', async () => {
    const first = await clientBooking(17);
    const second = await clientBooking(18);
    await expect(
      applyBookingAction(owner, second.id, {
        action: 'reschedule',
        as: 'staff',
        startAt: new Date(first.startAt),
      }),
    ).rejects.toMatchObject({ details: { reason: 'slot_taken' } });
    expect((await messages(second.id)).map((m) => m.template)).toEqual(['booking.created']);
  });
});

const knownClient = () => db.shopClient.findFirstOrThrow({ where: { shopId, userId: client.id } });

describe('sending', () => {
  it('sends what’s due once, in the person’s language', async () => {
    const booking = await clientBooking(19);
    const only = { onlyBookings: [booking.id] };

    expect(await dispatchDue(okSender, only)).toMatchObject({ sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.chatId).toBe(client.telegramId);
    expect(sent[0]?.text).toContain('Вы записаны');
    expect(sent[0]?.text).toContain('Outbox Barber');
    const [message] = await messages(booking.id);
    expect(message).toMatchObject({ status: 'SENT', attempts: 1, lastError: null });

    expect(await dispatchDue(okSender, only)).toMatchObject({ sent: 0 });
    expect(sent).toHaveLength(1);
  });

  it('waits for later messages', async () => {
    const booking = await clientBooking(20);
    await db.notification.updateMany({
      where: { bookingId: booking.id },
      data: { sendAt: new Date(Date.now() + 3_600_000) },
    });
    expect(await dispatchDue(okSender, { onlyBookings: [booking.id] })).toMatchObject({ sent: 0 });
    expect(sent).toEqual([]);
  });

  it('never sends twice when two runs happen at once', async () => {
    const booking = await clientBooking(21);
    const only = { onlyBookings: [booking.id] };
    await Promise.all([dispatchDue(okSender, only), dispatchDue(okSender, only)]);
    expect(sent).toHaveLength(1);
  });

  it('retries trouble with growing waits, then gives up', async () => {
    const booking = await clientBooking(22);
    const only = (now: Date) => ({ now, onlyBookings: [booking.id] });
    let now = new Date();
    const waits: number[] = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      expect(await dispatchDue(failing(502), only(now))).toMatchObject({ retried: 1 });
      const [message] = await messages(booking.id);
      expect(message).toMatchObject({ status: 'PENDING', attempts: attempt });
      expect(message?.lastError).toContain('502');
      waits.push(Math.round((message!.sendAt.getTime() - now.getTime()) / 60_000));
      now = new Date(message!.sendAt.getTime() + 1000);
    }
    expect(waits).toEqual([1, 5, 15, 60]);

    expect(await dispatchDue(failing(502), only(now))).toMatchObject({ failed: 1 });
    const [message] = await messages(booking.id);
    expect(message).toMatchObject({ status: 'FAILED', attempts: 5 });
  });

  it('gives up at once on someone who blocked the bot', async () => {
    const booking = await clientBooking(4);
    const result = await dispatchDue(failing(403), { onlyBookings: [booking.id] });
    expect(result).toMatchObject({ failed: 1 });
    expect((await messages(booking.id))[0]).toMatchObject({ status: 'FAILED', attempts: 1 });
  });

  it('waits as told when Telegram slows us down, without using up a try', async () => {
    const booking = await clientBooking(23);
    const now = new Date();
    await dispatchDue(failing(429, { retry_after: 40 }), { now, onlyBookings: [booking.id] });
    const [message] = await messages(booking.id);
    expect(message).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect(message!.sendAt.getTime()).toBe(now.getTime() + 40_000);
  });

  it('picks a message back up after a run that died', async () => {
    const booking = await clientBooking(8);
    await db.notification.updateMany({
      where: { bookingId: booking.id },
      data: { sendAt: new Date(Date.now() - 1000), attempts: 1 },
    });
    const later = new Date(Date.now() + 6 * 60_000);
    expect(await dispatchDue(okSender, { now: later, onlyBookings: [booking.id] })).toMatchObject({
      sent: 1,
    });
  });

  it('drops a message about a visit that has already started', async () => {
    const booking = await clientBooking(7);
    const late = new Date(at(7).getTime() + 60_000);
    const result = await dispatchDue(okSender, { now: late, onlyBookings: [booking.id] });
    expect(result).toMatchObject({ dropped: 1, sent: 0 });
    expect((await messages(booking.id))[0]).toMatchObject({ status: 'CANCELLED' });
  });

  it('marks a message it can’t read as failed', async () => {
    const booking = await clientBooking(6);
    await db.notification.updateMany({
      where: { bookingId: booking.id },
      data: { payload: { nothing: true } },
    });
    expect(await dispatchDue(okSender, { onlyBookings: [booking.id] })).toMatchObject({
      failed: 1,
    });
  });
});

describe('POST /api/cron/dispatch', () => {
  const call = async (authorization?: string) => {
    const { POST } = await import('./route');
    return POST(
      new Request('http://t/api/cron/dispatch', {
        method: 'POST',
        headers: authorization ? { Authorization: authorization } : {},
      }),
    );
  };

  it('refuses anyone without the secret', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
  });
});
