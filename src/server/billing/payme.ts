import 'server-only';
import type { Payment } from '@/generated/prisma/client';
import { db } from '../db/client';
import { handlePaymeRpc, type PaymeOrder, type PaymeStore } from '../payments/payme';
import { cancelPayment, settlePayment } from '../services/billing';
import { paymeConfig } from './config';

// PRO billing on Payme: the shared protocol (payments/payme.ts) over Payment rows. A paid month is
// never taken back by a Payme cancellation (no refund handler: Payme gets -31007).

const toOrder = (p: Payment): PaymeOrder => ({
  id: p.id,
  amount: p.amount,
  payable: p.status === 'PENDING',
  providerTransId: p.providerTransId,
  providerState: p.providerState,
  providerTime: p.providerTime,
  performTime: p.performTime,
  cancelTime: p.cancelTime,
  cancelReason: p.cancelReason,
});

const store: PaymeStore = {
  async order(orderId) {
    const payment = await db.payment.findFirst({ where: { id: orderId, provider: 'PAYME' } });
    return payment && toOrder(payment);
  },
  async byTransaction(transId) {
    const payment = await db.payment.findUnique({
      where: { provider_providerTransId: { provider: 'PAYME', providerTransId: transId } },
    });
    return payment && toOrder(payment);
  },
  async attach(orderId, transId, time) {
    const { count } = await db.payment.updateMany({
      where: { id: orderId, providerTransId: null, status: 'PENDING' },
      data: { providerTransId: transId, providerState: 1, providerTime: time },
    });
    return count > 0;
  },
  perform: (orderId, performTime, now) =>
    settlePayment(orderId, { providerState: 2, performTime }, now),
  cancel: (orderId, fields) => cancelPayment(orderId, fields),
  async statement(from, to) {
    const rows = await db.payment.findMany({
      where: { provider: 'PAYME', providerTime: { gte: from, lte: to } },
      orderBy: { providerTime: 'asc' },
    });
    return rows.map(toOrder);
  },
};

/** One Payme billing request in, one JSON-RPC answer out (always HTTP 200). */
export function handlePayme(authorization: string | null, body: unknown, now = new Date()) {
  return handlePaymeRpc(store, paymeConfig()?.key ?? null, authorization, body, now);
}
