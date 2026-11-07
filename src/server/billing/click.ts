import 'server-only';
import { db } from '../db/client';
import { handleClickRequest, type ClickStore } from '../payments/click';
import { cancelPayment, settlePayment } from '../services/billing';
import { clickConfig } from './config';

// PRO billing on Click: the shared protocol (payments/click.ts) over Payment rows.

export { clickSign } from '../payments/click';

const store: ClickStore = {
  async order(orderId) {
    const p = await db.payment.findFirst({ where: { id: orderId, provider: 'CLICK' } });
    if (!p) return null;
    const state = p.status === 'PAID' ? 'paid' : p.status === 'CANCELLED' ? 'cancelled' : 'open';
    return { id: p.id, amount: p.amount, state, providerTransId: p.providerTransId };
  },
  async prepare(orderId, clickTransId, now) {
    await db.payment.update({
      where: { id: orderId },
      data: { providerTransId: clickTransId, providerTime: BigInt(now.getTime()) },
    });
  },
  complete: (orderId, now) => settlePayment(orderId, { performTime: BigInt(now.getTime()) }, now),
  fail: (orderId, now) => cancelPayment(orderId, { cancelTime: BigInt(now.getTime()) }),
};

/** One Click billing request (Prepare or Complete) in, Click's JSON answer out. */
export function handleClick(
  stage: 'prepare' | 'complete',
  form: Record<string, string>,
  now = new Date(),
) {
  const config = clickConfig();
  const account = config ? { serviceId: config.serviceId, secret: config.secret } : null;
  return handleClickRequest(store, account, stage, form, now);
}
