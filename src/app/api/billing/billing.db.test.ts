import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serverEnv } from '@/env/server';
import { signInitData } from '@/server/auth/init-data';
import { clickSign } from '@/server/billing/click';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { GET as billing } from '../shops/[id]/billing/route';
import { POST as checkout } from '../shops/[id]/billing/checkout/route';
import { POST as clickComplete } from './click/complete/route';
import { POST as clickPrepare } from './click/prepare/route';
import { POST as payme } from './payme/route';

// Subscription billing against the real database (npm run test:db), playing Payme's and Click's
// side of their protocols with test credentials set here, as the sandboxes would.

const PAYME_KEY = 'test-payme-key-0123456789';
const CLICK_SECRET = 'test-click-secret';
Object.assign(serverEnv, {
  PAYME_MERCHANT_ID: '0123456789abcdef01234567',
  PAYME_KEY,
  PAYME_TEST: true,
  CLICK_SERVICE_ID: '12345',
  CLICK_MERCHANT_ID: '67890',
  CLICK_SECRET_KEY: CLICK_SECRET,
  PRO_PRICE_UZS: 99_000,
});

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 991_000_000 + Math.floor(Math.random() * 900_000);
const ids = { owner: BigInt(base + 1), master: BigInt(base + 2) };
type Who = keyof typeof ids;
const slug = `bl-${Date.now().toString(36)}`;
let shopId = '';
const DAY = 86_400_000;

function req(who: Who, method = 'GET', body?: object) {
  const initData = signInitData({ user: { id: Number(ids[who]), first_name: who } }, token);
  return new Request('http://t/api', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const shopCtx = () => ({ params: Promise.resolve({ id: shopId }) });
const order = async (provider: 'PAYME' | 'CLICK') =>
  (await (await checkout(req('owner', 'POST', { provider }), shopCtx())).json()) as {
    paymentId: string;
    url: string;
  };
const planUntil = async () =>
  (await db.shop.findUniqueOrThrow({ where: { id: shopId } })).planUntil?.getTime() ?? 0;

let rpcId = 0;
async function rpc(method: string, params: object, key = PAYME_KEY) {
  const response = await payme(
    new Request('http://t/api/billing/payme', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}`,
      },
      body: JSON.stringify({ method, params, id: ++rpcId }),
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { result?: Record<string, unknown>; error?: { code: number } };
}

async function click(stage: 'prepare' | 'complete', fields: Record<string, string>) {
  const signed = {
    service_id: '12345',
    click_paydoc_id: '1',
    sign_time: '2026-11-06 12:00:00',
    error: '0',
    ...fields,
    action: stage === 'prepare' ? '0' : '1',
  } as Parameters<typeof clickSign>[0] & Record<string, string>;
  const form = new URLSearchParams({
    ...signed,
    sign_string: fields.sign_string ?? clickSign(signed, CLICK_SECRET),
  });
  const handler = stage === 'prepare' ? clickPrepare : clickComplete;
  const response = await handler(
    new Request('http://t/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }),
  );
  return (await response.json()) as Record<string, unknown> & { error: number };
}

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const owner = await db.user.create({ data: { telegramId: ids.owner, firstName: 'Owner' } });
  const master = await db.user.create({ data: { telegramId: ids.master, firstName: 'Master' } });
  const place = { region: 'tashkent-city', district: 'yunusobod', address: `Manzil ${slug}` };
  shopId = (await db.shop.create({ data: { slug, name: 'Pay Barber', ...place } })).id;
  await db.staff.create({
    data: { shopId, userId: owner.id, displayName: 'Jasur', role: 'OWNER' },
  });
  await db.staff.create({
    data: { shopId, userId: master.id, displayName: 'Sardor', role: 'MASTER' },
  });
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.notification.deleteMany({ where: { chatId: { in: Object.values(ids) } } });
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(ids) } } });
  await db.$disconnect();
});

describe('checkout', () => {
  it('lets the owner open Payme or Click for a month of PRO, and only the owner', async () => {
    const { paymentId, url } = await order('PAYME');
    expect(url).toMatch(/^https:\/\/checkout\.test\.paycom\.uz\//);
    const query = Buffer.from(url.split('/').pop()!, 'base64').toString();
    expect(query).toContain(`ac.order_id=${paymentId};a=9900000;`);

    const viaClick = await order('CLICK');
    expect(viaClick.url).toContain(`transaction_param=${viaClick.paymentId}`);
    expect(viaClick.url).toContain('amount=99000');

    const master = await checkout(req('master', 'POST', { provider: 'PAYME' }), shopCtx());
    expect(master.status).toBe(403);
  });
});

describe('Payme', () => {
  it('refuses a caller without our key', async () => {
    expect((await rpc('CheckPerformTransaction', {}, 'wrong-key-0123456789')).error?.code).toBe(
      -32504,
    );
  });

  it('checks the order and its amount', async () => {
    const { paymentId } = await order('PAYME');
    const account = { order_id: paymentId };
    expect((await rpc('CheckPerformTransaction', { amount: 100, account })).error?.code).toBe(
      -31001,
    );
    const missing = { order_id: '01a00000-0000-7000-8000-000000000000' };
    expect(
      (await rpc('CheckPerformTransaction', { amount: 9_900_000, account: missing })).error?.code,
    ).toBe(-31050);
    expect((await rpc('CheckPerformTransaction', { amount: 9_900_000, account })).result).toEqual({
      allow: true,
    });
  });

  it('creates, performs (PRO extended, owner told) and stays settled', async () => {
    const { paymentId } = await order('PAYME');
    const params = { amount: 9_900_000, account: { order_id: paymentId }, time: Date.now() };
    const created = await rpc('CreateTransaction', { ...params, id: 'pm-1' });
    expect(created.result).toMatchObject({ transaction: paymentId, state: 1 });
    expect((await rpc('CreateTransaction', { ...params, id: 'pm-1' })).result).toMatchObject({
      state: 1,
    });
    expect((await rpc('CreateTransaction', { ...params, id: 'pm-2' })).error?.code).toBe(-31051);

    const before = Date.now();
    const performed = await rpc('PerformTransaction', { id: 'pm-1' });
    expect(performed.result).toMatchObject({ transaction: paymentId, state: 2 });
    const until = await planUntil();
    expect(until).toBeGreaterThanOrEqual(before + 30 * DAY - 1000);
    const again = await rpc('PerformTransaction', { id: 'pm-1' });
    expect(again.result?.perform_time).toBe(performed.result?.perform_time);
    expect(await planUntil()).toBe(until);

    const receipt = await db.notification.findFirst({
      where: { chatId: ids.owner, template: 'billing.paid' },
    });
    expect(receipt).not.toBeNull();
    expect((await rpc('CancelTransaction', { id: 'pm-1', reason: 5 })).error?.code).toBe(-31007);
    expect((await rpc('CheckTransaction', { id: 'pm-1' })).result).toMatchObject({ state: 2 });
  });

  it('cancels an open transaction, and times out one left too long', async () => {
    const first = await order('PAYME');
    const account = { order_id: first.paymentId };
    await rpc('CreateTransaction', { id: 'pm-3', time: Date.now(), amount: 9_900_000, account });
    expect((await rpc('CancelTransaction', { id: 'pm-3', reason: 3 })).result).toMatchObject({
      state: -1,
    });
    expect((await rpc('PerformTransaction', { id: 'pm-3' })).error?.code).toBe(-31008);

    const second = await order('PAYME');
    const old = Date.now() - 13 * 3_600_000;
    await rpc('CreateTransaction', {
      id: 'pm-4',
      time: old,
      amount: 9_900_000,
      account: { order_id: second.paymentId },
    });
    expect((await rpc('PerformTransaction', { id: 'pm-4' })).error?.code).toBe(-31008);
    expect((await rpc('CheckTransaction', { id: 'pm-4' })).result).toMatchObject({
      state: -1,
      reason: 4,
    });
    const statement = await rpc('GetStatement', { from: old - 1000, to: Date.now() + 1000 });
    const listed = (statement.result?.transactions as { id: string }[]).map((t) => t.id);
    expect(listed).toEqual(expect.arrayContaining(['pm-3', 'pm-4']));
  });
});

describe('Click', () => {
  it('prepares and completes a signed payment, once', async () => {
    const { paymentId } = await order('CLICK');
    const base = { click_trans_id: '9001', merchant_trans_id: paymentId, amount: '99000.00' };
    expect((await click('prepare', { ...base, sign_string: 'bad' })).error).toBe(-1);
    expect((await click('prepare', { ...base, amount: '1000' })).error).toBe(-2);
    const prepared = await click('prepare', base);
    expect(prepared).toMatchObject({ error: 0, merchant_prepare_id: paymentId });

    const before = await planUntil();
    const done = await click('complete', { ...base, merchant_prepare_id: paymentId });
    expect(done).toMatchObject({ error: 0, merchant_confirm_id: paymentId });
    // Paid time runs on from where the earlier payment left it.
    expect(await planUntil()).toBe(before + 30 * DAY);
    expect((await click('complete', { ...base, merchant_prepare_id: paymentId })).error).toBe(-4);
  });

  it('calls the order off when Click reports the payment failed', async () => {
    const { paymentId } = await order('CLICK');
    const base = { click_trans_id: '9002', merchant_trans_id: paymentId, amount: '99000' };
    await click('prepare', base);
    const failed = await click('complete', {
      ...base,
      merchant_prepare_id: paymentId,
      error: '-5017',
    });
    expect(failed.error).toBe(-9);
    expect((await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe(
      'CANCELLED',
    );
  });
});

describe('the plan page', () => {
  it('shows the paid time, the price, both providers and past payments', async () => {
    const page = await (await billing(req('owner'), shopCtx())).json();
    expect(page).toMatchObject({ plan: 'PRO', price: 99_000, canPay: true });
    expect(page.providers).toEqual(['PAYME', 'CLICK']);
    expect(page.payments.filter((p: { status: string }) => p.status === 'PAID')).toHaveLength(2);
    expect((await (await billing(req('master'), shopCtx())).json()).canPay).toBe(false);
  });
});
