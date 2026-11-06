import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/client';
import { cancelPayment, settlePayment } from '../services/billing';
import { clickConfig, sameSecret } from './config';

// The Click SHOP API: Click calls Prepare (action 0), then Complete (action 1), as form posts
// signed with an MD5 of the request and our secret key. Our order is a Payment; its id is
// merchant_trans_id. Errors are answered in the body with Click's codes.

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

function answer(fields: Record<string, unknown>, error: number) {
  return { ...fields, error, error_note: NOTE[error] ?? 'Error' };
}

/** One Click request (Prepare or Complete) in, Click's JSON answer out. */
export async function handleClick(
  stage: 'prepare' | 'complete',
  form: Record<string, string>,
  now = new Date(),
): Promise<object> {
  const parsed = requestSchema.safeParse(form);
  const echo = { click_trans_id: form.click_trans_id, merchant_trans_id: form.merchant_trans_id };
  if (!parsed.success) return answer(echo, CODE.request);
  const r = parsed.data;
  const config = clickConfig();
  if (!config || r.service_id !== config.serviceId) return answer(echo, CODE.request);
  if (!sameSecret(r.sign_string, clickSign(r, config.secret))) return answer(echo, CODE.sign);
  if ((stage === 'prepare') !== (r.action === '0')) return answer(echo, CODE.action);

  const payment = z.uuid().safeParse(r.merchant_trans_id).success
    ? await db.payment.findFirst({ where: { id: r.merchant_trans_id, provider: 'CLICK' } })
    : null;
  if (!payment) return answer(echo, CODE.order);
  if (Number(r.amount) !== payment.amount) return answer(echo, CODE.amount);
  // Our prepare id is the payment itself.
  const ids =
    stage === 'prepare' ? { merchant_prepare_id: payment.id } : { merchant_confirm_id: payment.id };

  if (stage === 'prepare') {
    if (payment.status === 'PAID') return answer({ ...echo, ...ids }, CODE.alreadyPaid);
    if (payment.status === 'CANCELLED') return answer({ ...echo, ...ids }, CODE.cancelled);
    if (payment.providerTransId && payment.providerTransId !== r.click_trans_id) {
      return answer({ ...echo, ...ids }, CODE.request);
    }
    await db.payment.update({
      where: { id: payment.id },
      data: { providerTransId: r.click_trans_id, providerTime: BigInt(now.getTime()) },
    });
    return answer({ ...echo, ...ids }, CODE.ok);
  }

  // Complete: only for the transaction this order was prepared with.
  if (r.merchant_prepare_id !== payment.id || payment.providerTransId !== r.click_trans_id) {
    return answer({ ...echo, ...ids }, CODE.transaction);
  }
  if (payment.status === 'PAID') return answer({ ...echo, ...ids }, CODE.alreadyPaid);
  if (payment.status === 'CANCELLED') return answer({ ...echo, ...ids }, CODE.cancelled);
  // Click tells us the payment failed on its side: the order is off.
  if (Number(r.error) < 0) {
    await cancelPayment(payment.id, { cancelTime: BigInt(now.getTime()) });
    return answer({ ...echo, ...ids }, CODE.cancelled);
  }
  await settlePayment(payment.id, { performTime: BigInt(now.getTime()) }, now);
  return answer({ ...echo, ...ids }, CODE.ok);
}
