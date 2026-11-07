import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sameSecret } from './secret';

// The Click SHOP API, shared by PRO billing and client deposits: Click calls Prepare (action 0),
// then Complete (action 1), as form posts signed with an MD5 of the request and our secret key.
// Our order's id is merchant_trans_id. Errors are answered in the body with Click's codes.

const CODE = {
  ok: 0,
  sign: -1,
  amount: -2,
  action: -3,
  alreadyPaid: -4,
  order: -5,
  transaction: -6,
  request: -8,
  cancelled: -9,
} as const;
const NOTE: Record<number, string> = {
  [CODE.ok]: 'Success',
  [CODE.sign]: 'SIGN CHECK FAILED!',
  [CODE.amount]: 'Incorrect parameter amount',
  [CODE.action]: 'Action not found',
  [CODE.alreadyPaid]: 'Already paid',
  [CODE.order]: 'Order does not exist',
  [CODE.transaction]: 'Transaction does not exist',
  [CODE.request]: 'Error in request from click',
  [CODE.cancelled]: 'Transaction cancelled',
};

const requestSchema = z.object({
  click_trans_id: z.string().regex(/^\d+$/),
  service_id: z.string(),
  click_paydoc_id: z.string().optional(),
  merchant_trans_id: z.string(),
  merchant_prepare_id: z.string().optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  action: z.enum(['0', '1']),
  error: z.string().regex(/^-?\d+$/),
  error_note: z.string().optional(),
  sign_time: z.string(),
  sign_string: z.string(),
});
type ClickRequest = z.infer<typeof requestSchema>;

/** Click's signature: MD5 over the fields in its fixed order, with our secret key inside. */
export function clickSign(r: Omit<ClickRequest, 'sign_string'>, secret: string): string {
  const prepared = r.action === '1' ? (r.merchant_prepare_id ?? '') : '';
  const text = `${r.click_trans_id}${r.service_id}${secret}${r.merchant_trans_id}${prepared}${r.amount}${r.action}${r.sign_time}`;
  return createHash('md5').update(text).digest('hex');
}

/** An order as the protocol sees it. */
export type ClickOrder = {
  id: string;
  /** UZS. */
  amount: number;
  state: 'open' | 'paid' | 'cancelled';
  providerTransId: string | null;
};

export type ClickStore = {
  order(orderId: string): Promise<ClickOrder | null>;
  /** Remembers Click's transaction for an open order. */
  prepare(orderId: string, clickTransId: string, now: Date): Promise<void>;
  /** Click took the money: the order is paid. */
  complete(orderId: string, now: Date): Promise<void>;
  /** Click reports the payment failed on its side. */
  fail(orderId: string, now: Date): Promise<void>;
};

export type ClickAccount = { serviceId: string; secret: string };

function answer(fields: Record<string, unknown>, error: number) {
  return { ...fields, error, error_note: NOTE[error] ?? 'Error' };
}

/** One Click request (Prepare or Complete) in, Click's JSON answer out. */
export async function handleClickRequest(
  store: ClickStore,
  account: ClickAccount | null,
  stage: 'prepare' | 'complete',
  form: Record<string, string>,
  now = new Date(),
): Promise<object> {
  const parsed = requestSchema.safeParse(form);
  const echo = { click_trans_id: form.click_trans_id, merchant_trans_id: form.merchant_trans_id };
  if (!parsed.success) return answer(echo, CODE.request);
  const r = parsed.data;
  if (!account || r.service_id !== account.serviceId) return answer(echo, CODE.request);
  if (!sameSecret(r.sign_string, clickSign(r, account.secret))) return answer(echo, CODE.sign);
  if ((stage === 'prepare') !== (r.action === '0')) return answer(echo, CODE.action);

  const order = z.uuid().safeParse(r.merchant_trans_id).success
    ? await store.order(r.merchant_trans_id)
    : null;
  if (!order) return answer(echo, CODE.order);
  if (Number(r.amount) !== order.amount) return answer(echo, CODE.amount);
  // Our prepare id is the order itself.
  const ids =
    stage === 'prepare' ? { merchant_prepare_id: order.id } : { merchant_confirm_id: order.id };

  if (stage === 'prepare') {
    if (order.state === 'paid') return answer({ ...echo, ...ids }, CODE.alreadyPaid);
    if (order.state === 'cancelled') return answer({ ...echo, ...ids }, CODE.cancelled);
    if (order.providerTransId && order.providerTransId !== r.click_trans_id) {
      return answer({ ...echo, ...ids }, CODE.request);
    }
    await store.prepare(order.id, r.click_trans_id, now);
    return answer({ ...echo, ...ids }, CODE.ok);
  }

  // Complete: only for the transaction this order was prepared with.
  if (r.merchant_prepare_id !== order.id || order.providerTransId !== r.click_trans_id) {
    return answer({ ...echo, ...ids }, CODE.transaction);
  }
  if (order.state === 'paid') return answer({ ...echo, ...ids }, CODE.alreadyPaid);
  if (order.state === 'cancelled') return answer({ ...echo, ...ids }, CODE.cancelled);
  // Click tells us the payment failed on its side: the order is off.
  if (Number(r.error) < 0) {
    await store.fail(order.id, now);
    return answer({ ...echo, ...ids }, CODE.cancelled);
  }
  await store.complete(order.id, now);
  return answer({ ...echo, ...ids }, CODE.ok);
}

/** Click's checkout page for an order. */
export function clickCheckoutUrl({
  serviceId,
  merchantId,
  orderId,
  amount,
  returnUrl,
}: {
  serviceId: string;
  merchantId: string;
  orderId: string;
  amount: number;
  returnUrl: string;
}): string {
  const query = new URLSearchParams({
    service_id: serviceId,
    merchant_id: merchantId,
    amount: String(amount),
    transaction_param: orderId,
    return_url: returnUrl,
  });
  return `https://my.click.uz/services/pay?${query.toString()}`;
}
