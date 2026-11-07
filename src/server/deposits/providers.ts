import 'server-only';
import type { Deposit } from '@/generated/prisma/client';
import { db } from '../db/client';
import { handleClickRequest, type ClickStore } from '../payments/click';
import { handlePaymeRpc, PAYME_STATE, type PaymeOrder, type PaymeStore } from '../payments/payme';
import { dropUnpaidDeposit, refundDeposit, settleDeposit, shopAccount } from '../services/deposits';

// Client deposits through a shop's own Payme and Click accounts: the shared protocols
// (payments/*) over that shop's Deposit rows, checked with that shop's own keys.

/** Payable: still awaiting, inside its hold. */
const payable = (d: Deposit, now: Date) => d.status === 'AWAITING' && d.expiresAt > now;

function paymeStore(shopId: string, now: Date): PaymeStore {
  const toOrder = (d: Deposit): PaymeOrder => ({
    id: d.id,
    amount: d.amount,
    payable: payable(d, now),
    providerTransId: d.providerTransId,
    providerState: d.providerState,
    providerTime: d.providerTime,
    performTime: d.performTime,
    cancelTime: d.cancelTime,
    cancelReason: d.cancelReason,
  });
  return {
    async order(orderId) {
      const deposit = await db.deposit.findFirst({ where: { id: orderId, shopId } });
      return deposit && toOrder(deposit);
    },
    async byTransaction(transId) {
      const deposit = await db.deposit.findFirst({
        where: { shopId, provider: 'PAYME', providerTransId: transId },
      });
      return deposit && toOrder(deposit);
    },
    async attach(orderId, transId, time) {
      const { count } = await db.deposit.updateMany({
        where: { id: orderId, shopId, providerTransId: null, status: 'AWAITING' },
        data: {
          provider: 'PAYME',
          providerTransId: transId,
          providerState: PAYME_STATE.created,
          providerTime: time,
        },
      });
      return count > 0;
    },
    perform: (orderId, performTime, at) =>
      settleDeposit(orderId, { providerState: PAYME_STATE.performed, performTime }, at),
    // Payme gave up on the payment: the booking is released, as when the hold runs out.
    cancel: async (orderId, fields) => {
      await dropUnpaidDeposit(orderId, fields, now);
    },
    // The shop refunded it from its Payme cabinet.
    refund: (orderId, fields) => refundDeposit(orderId, fields, now),
    async statement(from, to) {
      const rows = await db.deposit.findMany({
        where: { shopId, provider: 'PAYME', providerTime: { gte: from, lte: to } },
        orderBy: { providerTime: 'asc' },
      });
      return rows.map(toOrder);
    },
  };
}

/** A Payme deposit request for this shop, checked with the shop's own Payme key. */
export async function handleShopPayme(
  shopId: string,
  authorization: string | null,
  body: unknown,
  now = new Date(),
) {
  const account = await shopAccount(shopId, 'PAYME');
  return handlePaymeRpc(paymeStore(shopId, now), account?.secret ?? null, authorization, body, now);
}

function clickStore(shopId: string): ClickStore {
  return {
    async order(orderId) {
      const d = await db.deposit.findFirst({ where: { id: orderId, shopId } });
      if (!d) return null;
      const now = new Date();
      const state =
        d.status === 'AWAITING'
          ? d.expiresAt > now
            ? 'open'
            : 'cancelled'
          : d.status === 'CANCELLED'
            ? 'cancelled'
            : 'paid';
      return { id: d.id, amount: d.amount, state, providerTransId: d.providerTransId };
    },
    async prepare(orderId, clickTransId, now) {
      await db.deposit.updateMany({
        where: { id: orderId, shopId, status: 'AWAITING' },
        data: {
          provider: 'CLICK',
          providerTransId: clickTransId,
          providerTime: BigInt(now.getTime()),
        },
      });
    },
    complete: (orderId, now) => settleDeposit(orderId, { performTime: BigInt(now.getTime()) }, now),
    fail: async (orderId, now) => {
      await dropUnpaidDeposit(orderId, { cancelTime: BigInt(now.getTime()) }, now);
    },
  };
}

/** A Click deposit request (Prepare or Complete) for this shop, signed with its own secret key. */
export async function handleShopClick(
  shopId: string,
  stage: 'prepare' | 'complete',
  form: Record<string, string>,
  now = new Date(),
) {
  const account = await shopAccount(shopId, 'CLICK');
  const credentials = account ? { serviceId: account.accountId, secret: account.secret } : null;
  return handleClickRequest(clickStore(shopId), credentials, stage, form, now);
}
