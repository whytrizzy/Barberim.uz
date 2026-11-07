import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, fromTashkent, tashkentDate } from '@/domain/time';
import { serverEnv } from '@/env/server';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { clickSign } from '@/server/payments/click';
import { applyBookingAction } from '@/server/services/booking';
import { expireDeposits } from '@/server/services/deposits';
import { PATCH as act } from '../bookings/[id]/route';
import { POST as book } from '../bookings/route';
import { POST as checkout } from '../me/bookings/[id]/deposit/route';
import { POST as markRefunded } from '../shops/[id]/bookings/[bookingId]/deposit/route';
import { GET as profile } from '../shops/by-slug/[slug]/route';
import { GET as getSettings, PUT as putSettings } from '../shops/[id]/deposits/route';
import { POST as clickComplete } from './click/[shopId]/complete/route';
import { POST as clickPrepare } from './click/[shopId]/prepare/route';
import { POST as payme } from './payme/[shopId]/route';
import { POST as uzum } from './uzum/[shopId]/[method]/route';

// Online deposits against the real database (npm run test:db), paid to the shop's own Payme and
// Click accounts, with Payme and Click played here as their sandboxes would.

Object.assign(serverEnv, { DEPOSIT_KEYS_SECRET: 'test-deposit-encryption-key-0123456789abcdef' });
const PAYME_KEY = 'shop-payme-key-0123456789';
const CLICK_SECRET = 'shop-click-secret';
const UZUM_PASSWORD = 'shop-uzum-password';

type User = Parameters<typeof applyBookingAction>[0];
const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 989_000_000 + Math.floor(Math.random() * 900_000);
const ids = { owner: BigInt(base + 1), client: BigInt(base + 2), stranger: BigInt(base + 3) };
type Who = keyof typeof ids;
const slug = `dp-${Date.now().toString(36)}`;
let shopId = '';
let starId = '';
let plainId = '';
let serviceId = '';
let owner: User;

function req(who: Who, method = 'GET', body?: object) {
  const initData = signInitData({ user: { id: Number(ids[who]), first_name: who } }, token);
  return new Request('http://t/api', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const shopCtx = () => ({ params: Promise.resolve({ id: shopId }) });
const today = tashkentDate(new Date());
const at = (days: number, hour: number) => {
  const d = addDays(today, days);
  return fromTashkent(d.year, d.month, d.day, hour);
};
type Booked = { id: string; status: string; deposit: { amount: number; status: string } | null };
async function reserve(staffId: string, startAt: Date): Promise<Booked> {
  const response = await book(
    req('client', 'POST', { staffId, serviceIds: [serviceId], startAt: startAt.toISOString() }),
  );
  expect(response.status).toBe(201);
  return response.json();
}
const depositOf = (bookingId: string) => db.deposit.findUniqueOrThrow({ where: { bookingId } });
const sent = (bookingId: string, template: string) =>
  db.notification.count({ where: { bookingId, template } });

let rpcId = 0;
async function rpc(method: string, params: object, key = PAYME_KEY) {
  const response = await payme(
    new Request('http://t/api', {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}` },
      body: JSON.stringify({ method, params, id: ++rpcId }),
    }),
    { params: Promise.resolve({ shopId }) },
  );
  return (await response.json()) as { result?: Record<string, unknown>; error?: { code: number } };
}
async function payWithPayme(bookingId: string, transId: string) {
  const deposit = await depositOf(bookingId);
  const account = { order_id: deposit.id };
  const amount = deposit.amount * 100;
  await rpc('CreateTransaction', { id: transId, time: Date.now(), amount, account });
  return rpc('PerformTransaction', { id: transId });
}

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  owner = await db.user.create({ data: { telegramId: ids.owner, firstName: 'Owner' } });
  await db.user.create({
    data: { telegramId: ids.client, firstName: 'Aziz', phone: '+998901112244' },
  });
  await db.user.create({ data: { telegramId: ids.stranger, firstName: 'Stranger' } });
  const place = { region: 'tashkent-city', district: 'yunusobod', address: `Manzil ${slug}` };
  shopId = (
    await db.shop.create({
      data: {
        slug,
        name: 'Deposit Barber',
        status: 'ACTIVE',
        ...place,
        // This test books more than the usual 3 upcoming visits per client.
        settings: { maxActiveBookingsPerClient: 20 },
      },
    })
  ).id;
  const staff = (displayName: string, userId?: string) =>
    db.staff.create({
      data: { shopId, displayName, role: userId ? 'OWNER' : 'MASTER', userId },
    });
  starId = (await staff('Star', owner.id)).id;
  plainId = (await staff('Plain')).id;
  serviceId = (
    await db.service.create({
      data: {
        shopId,
        name: 'Soch olish',
        durationMin: 30,
        price: 100_000,
        staff: { create: [{ staffId: starId }, { staffId: plainId }] },
      },
    })
  ).id;
  await db.weeklyHours.createMany({
    data: [starId, plainId].flatMap((staffId) =>
      [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ staffId, weekday, startMin: 540, endMin: 1260 })),
    ),
  });
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.notification.deleteMany({ where: { chatId: { in: Object.values(ids) } } });
  await db.booking.deleteMany({ where: { shopId } });
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(ids) } } });
  await db.$disconnect();
});

describe('settings', () => {
  it('saves the amount, the masters and the shop’s own provider keys, encrypted', async () => {
    const response = await putSettings(
      req('owner', 'PUT', {
        amount: 50_000,
        afterNoShow: true,
        masterIds: [starId],
        accounts: [
          {
            provider: 'PAYME',
            accountId: 'abcdef0123456789abcdef01',
            secret: PAYME_KEY,
            test: true,
          },
          { provider: 'CLICK', accountId: '555', login: '777', secret: CLICK_SECRET },
          { provider: 'UZUM', accountId: '888', login: 'uzum-shop', secret: UZUM_PASSWORD },
        ],
      }),
      shopCtx(),
    );
    expect(response.status).toBe(200);
    const settings = await response.json();
    expect(settings).toMatchObject({ amount: 50_000, afterNoShow: true, canConnect: true });
    expect(JSON.stringify(settings)).not.toContain(PAYME_KEY);
    expect(settings.accounts.map((a: { provider: string }) => a.provider)).toEqual([
      'PAYME',
      'CLICK',
      'UZUM',
    ]);
    expect(settings.accounts[0].callbackUrls[0]).toContain(`/api/deposits/payme/${shopId}`);
    expect(settings.accounts[2].callbackUrls[0]).toMatch(
      new RegExp(`/api/deposits/uzum/${shopId}$`),
    );
    expect(JSON.stringify(settings)).not.toContain(UZUM_PASSWORD);
    const stored = await db.shopPaymentAccount.findFirstOrThrow({
      where: { shopId, provider: 'PAYME' },
    });
    expect(stored.secretCipher).not.toContain(PAYME_KEY);

    expect((await getSettings(req('client'), shopCtx())).status).toBe(403);
  });
});

describe('booking with a deposit', () => {
  it('holds a booking with a deposit master, quietly; a plain master books as usual', async () => {
    const held = await reserve(starId, at(2, 10));
    expect(held).toMatchObject({
      status: 'PENDING',
      deposit: { amount: 50_000, status: 'AWAITING' },
    });
    expect(await sent(held.id, 'staff.new_booking')).toBe(0);
    expect(await sent(held.id, 'booking.reminder24h')).toBe(0);

    const plain = await reserve(plainId, at(2, 10));
    expect(plain).toMatchObject({ status: 'CONFIRMED', deposit: null });
  });

  it('opens the shop’s own checkout, and Payme payment confirms the booking', async () => {
    const held = await reserve(starId, at(2, 12));
    const pay = await checkout(req('client', 'POST', { provider: 'PAYME' }), {
      params: Promise.resolve({ id: held.id }),
    });
    const { url } = await pay.json();
    expect(url).toMatch(/^https:\/\/checkout\.test\.paycom\.uz\//);
    const deposit = await depositOf(held.id);
    expect(Buffer.from(url.split('/').pop(), 'base64').toString()).toContain(
      `m=abcdef0123456789abcdef01;ac.order_id=${deposit.id};a=5000000;`,
    );
    expect(
      (
        await checkout(req('stranger', 'POST', { provider: 'PAYME' }), {
          params: Promise.resolve({ id: held.id }),
        })
      ).status,
    ).toBe(404);

    expect(
      (
        await rpc(
          'CheckPerformTransaction',
          { amount: 5_000_000, account: { order_id: deposit.id } },
          'wrong-key-123456789',
        )
      ).error?.code,
    ).toBe(-32504);
    const performed = await payWithPayme(held.id, `pm-${held.id}`);
    expect(performed.result).toMatchObject({ state: 2 });
    expect((await depositOf(held.id)).status).toBe('PAID');
    const booking = await db.booking.findUniqueOrThrow({ where: { id: held.id } });
    expect(booking.status).toBe('CONFIRMED');
    expect(await sent(held.id, 'staff.new_booking')).toBe(1);
    expect(await sent(held.id, 'booking.created')).toBe(1);
  });

  it('pays through Click with the shop’s own secret', async () => {
    const held = await reserve(starId, at(2, 14));
    const { id: orderId } = await depositOf(held.id);
    const fields = {
      click_trans_id: `${base}`,
      service_id: '555',
      merchant_trans_id: orderId,
      amount: '50000',
      error: '0',
      sign_time: '2026-11-07 12:00:00',
    };
    const post = async (stage: 'prepare' | 'complete', extra: Record<string, string>) => {
      const signed = { ...fields, ...extra, action: stage === 'prepare' ? '0' : '1' } as Parameters<
        typeof clickSign
      >[0];
      const handler = stage === 'prepare' ? clickPrepare : clickComplete;
      const response = await handler(
        new Request('http://t/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            ...signed,
            sign_string: clickSign(signed, CLICK_SECRET),
          }).toString(),
        }),
        { params: Promise.resolve({ shopId }) },
      );
      return (await response.json()) as { error: number };
    };
    expect((await post('prepare', {})).error).toBe(0);
    expect((await post('complete', { merchant_prepare_id: orderId })).error).toBe(0);
    expect((await depositOf(held.id)).status).toBe('PAID');
  });

  it('frees the time when the hold runs out unpaid', async () => {
    const held = await reserve(starId, at(2, 16));
    await db.deposit.update({
      where: { bookingId: held.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    expect(await expireDeposits()).toBeGreaterThanOrEqual(1);
    expect((await depositOf(held.id)).status).toBe('CANCELLED');
    expect((await db.booking.findUniqueOrThrow({ where: { id: held.id } })).status).toBe(
      'CANCELLED_CLIENT',
    );
    expect(await sent(held.id, 'booking.deposit_expired')).toBe(1);
  });
});

describe('when the visit is off', () => {
  async function paid(days: number, hour: number) {
    const held = await reserve(starId, at(days, hour));
    await payWithPayme(held.id, `pm-${held.id}`);
    return held.id;
  }

  it('refunds when the shop cancels: Payme’s refund closes it', async () => {
    const id = await paid(3, 10);
    await applyBookingAction(owner, id, { action: 'cancel', as: 'staff' });
    expect((await depositOf(id)).status).toBe('REFUND_DUE');
    expect(await sent(id, 'booking.deposit_refund')).toBe(1);
    expect(await sent(id, 'staff.deposit_refund')).toBe(0); // the owner did it, so isn't told
    const refunded = await rpc('CancelTransaction', { id: `pm-${id}`, reason: 5 });
    expect(refunded.result).toMatchObject({ state: -2 });
    expect((await depositOf(id)).status).toBe('REFUNDED');
  });

  it('refunds a client who cancels a day ahead, keeps it when they cancel late', async () => {
    const early = await paid(3, 12);
    const cancel = (bookingId: string) =>
      act(req('client', 'PATCH', { action: 'cancel', as: 'client' }), {
        params: Promise.resolve({ id: bookingId }),
      });
    expect((await cancel(early)).status).toBe(200);
    expect((await depositOf(early)).status).toBe('REFUND_DUE');
    expect(await sent(early, 'staff.deposit_refund')).toBe(1);

    const late = await reserve(starId, at(3, 16));
    // Make it a few hours away, whatever the time of day the test runs.
    const soon = new Date(Date.now() + 5 * 3_600_000);
    await db.booking.update({
      where: { id: late.id },
      data: { startAt: soon, endAt: new Date(soon.getTime() + 1_800_000) },
    });
    await payWithPayme(late.id, `pm-${late.id}`);
    await cancel(late.id);
    expect((await depositOf(late.id)).status).toBe('KEPT');
  });

  it('lets the shop mark a refund it made itself', async () => {
    const id = await paid(3, 14);
    await applyBookingAction(owner, id, { action: 'cancel', as: 'staff' });
    const response = await markRefunded(req('owner', 'POST'), {
      params: Promise.resolve({ id: shopId, bookingId: id }),
    });
    expect(response.status).toBe(200);
    expect((await depositOf(id)).status).toBe('REFUNDED');
  });
});

describe('the no-show cycle', () => {
  it('asks a deposit after a missed visit, not after it’s paid, and again after another miss', async () => {
    const page = async () =>
      (await profile(req('client'), { params: Promise.resolve({ slug }) })).json();
    expect((await page()).deposit).toMatchObject({ amount: 50_000, youOwe: false });

    const missed = await db.booking.findFirstOrThrow({
      where: { shopId, staffId: plainId, status: 'CONFIRMED' },
    });
    await db.booking.update({
      where: { id: missed.id },
      data: {
        startAt: new Date(Date.now() - 2 * 86_400_000),
        endAt: new Date(Date.now() - 2 * 86_400_000 + 1_800_000),
      },
    });
    await applyBookingAction(owner, missed.id, { action: 'no_show', as: 'staff' });
    expect((await page()).deposit.youOwe).toBe(true);

    const owing = await reserve(plainId, at(4, 10));
    expect(owing.deposit).toMatchObject({ status: 'AWAITING' });
    await payWithPayme(owing.id, `pm-${owing.id}`);
    expect((await page()).deposit.youOwe).toBe(false);
    expect((await reserve(plainId, at(4, 12))).deposit).toBeNull();
  });
});

describe('Uzum Bank', () => {
  async function call(
    method: string,
    body: object | string,
    auth = `uzum-shop:${UZUM_PASSWORD}`,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await uzum(
      new Request('http://t/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(auth).toString('base64')}`,
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      { params: Promise.resolve({ shopId, method }) },
    );
    return { status: response.status, body: await response.json() };
  }
  const stamp = () => ({ serviceId: 888, timestamp: Date.now() });

  async function heldWithCode(startAt: Date) {
    const held = await reserve(starId, startAt);
    const pay = await checkout(req('client', 'POST', { provider: 'UZUM' }), {
      params: Promise.resolve({ id: held.id }),
    });
    const { url, code } = await pay.json();
    expect(url).toBeNull();
    expect(code).toBeGreaterThanOrEqual(100_000);
    return { held, account: String(code) };
  }

  it('checks, creates and confirms a payment by its code, confirming the booking', async () => {
    const { held, account } = await heldWithCode(at(5, 10));
    const params = { account };

    expect((await call('check', { ...stamp(), params }, 'uzum-shop:wrong')).body).toMatchObject({
      status: 'FAILED',
      errorCode: '10001',
    });
    expect(
      (await call('check', { ...stamp(), params: { account: '000001' } })).body.errorCode,
    ).toBe('10007');
    const checked = await call('check', { ...stamp(), params });
    expect(checked).toMatchObject({ status: 200, body: { status: 'OK', serviceId: 888 } });

    const transId = crypto.randomUUID();
    const wrong = await call('create', { ...stamp(), transId, params, amount: 100 });
    expect(wrong).toMatchObject({ status: 400, body: { errorCode: '10011' } });
    const created = await call('create', { ...stamp(), transId, params, amount: 5_000_000 });
    expect(created.body).toMatchObject({ status: 'CREATED', transId, amount: 5_000_000 });
    expect(
      (await call('create', { ...stamp(), transId, params, amount: 5_000_000 })).body.errorCode,
    ).toBe('10010');

    const confirmed = await call('confirm', {
      ...stamp(),
      transId,
      paymentSource: 'UZCARD',
      phone: '998901112244',
    });
    expect(confirmed.body).toMatchObject({ status: 'CONFIRMED', transId, amount: 5_000_000 });
    expect((await call('confirm', { ...stamp(), transId })).body.errorCode).toBe('10016');
    expect((await call('status', { ...stamp(), transId })).body).toMatchObject({
      status: 'CONFIRMED',
      reverseTime: null,
    });
    expect((await call('check', { ...stamp(), params })).body.errorCode).toBe('10008');

    expect(await depositOf(held.id)).toMatchObject({ status: 'PAID', provider: 'UZUM' });
    const booking = await db.booking.findUniqueOrThrow({ where: { id: held.id } });
    expect(booking.status).toBe('CONFIRMED');
    expect(await sent(held.id, 'booking.created')).toBe(1);

    // Uzum gives the money back: the deposit is refunded.
    const reversed = await call('reverse', { ...stamp(), transId });
    expect(reversed.body).toMatchObject({ status: 'REVERSED', transId });
    expect((await depositOf(held.id)).status).toBe('REFUNDED');
    expect((await call('reverse', { ...stamp(), transId })).body.errorCode).toBe('10018');
  });

  it('lets a payment Uzum called off be tried again, and fails one left unconfirmed', async () => {
    const { held, account } = await heldWithCode(at(5, 12));
    const params = { account };
    const first = crypto.randomUUID();
    await call('create', { ...stamp(), transId: first, params, amount: 5_000_000 });
    expect((await call('reverse', { ...stamp(), transId: first })).body.status).toBe('REVERSED');
    expect((await depositOf(held.id)).status).toBe('AWAITING');
    expect((await call('confirm', { ...stamp(), transId: first })).body.errorCode).toBe('10015');

    // A second try, never confirmed within Uzum's 30 minutes.
    const second = crypto.randomUUID();
    const created = await call('create', {
      ...stamp(),
      transId: second,
      params,
      amount: 5_000_000,
    });
    expect(created.body.status).toBe('CREATED');
    await db.deposit.update({
      where: { bookingId: held.id },
      data: { providerTime: BigInt(Date.now() - 31 * 60_000) },
    });
    expect((await call('status', { ...stamp(), transId: second })).body.status).toBe('FAILED');
    expect((await call('confirm', { ...stamp(), transId: second })).body.errorCode).toBe('10015');
    expect((await call('status', { ...stamp(), transId: 'nope' })).body.errorCode).toBe('10014');
    expect((await call('create', 'not json')).body.errorCode).toBe('10002');
    expect(
      (await call('status', { serviceId: 999, timestamp: 1, transId: second })).body.errorCode,
    ).toBe('10006');
  });
});
