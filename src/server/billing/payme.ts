import 'server-only';
import { z } from 'zod';
import type { Payment } from '@/generated/prisma/client';
import { db } from '../db/client';
import { cancelPayment, settlePayment } from '../services/billing';
import { paymeConfig, sameSecret } from './config';

// The Payme (Paycom) Merchant API: Payme calls POST /api/billing/payme with JSON-RPC, signed with
// Basic auth "Paycom:<key>". Our order is a Payment; its id is the account field "order_id".
// Amounts are in tiyin (1 so'm = 100 tiyin). Errors are answered with HTTP 200 and an error body.

/** A created transaction not performed within 12 hours is cancelled (Payme's rule). */
const TIMEOUT_MS = 12 * 3_600_000;
/** Payme's transaction states. */
const STATE = { created: 1, performed: 2, cancelled: -1, cancelledAfterPerform: -2 } as const;
/** Payme's cancel reason for a transaction that timed out. */
const REASON_TIMEOUT = 4;

type Localized = { ru: string; uz: string; en: string };
class PaymeError extends Error {
  constructor(
    readonly code: number,
    readonly text: Localized,
    readonly data?: string,
  ) {
    super(text.en);
  }
}

const errors = {
  auth: () =>
    new PaymeError(-32504, { ru: 'Нет доступа', uz: 'Ruxsat yoʻq', en: 'Insufficient privileges' }),
  parse: () =>
    new PaymeError(-32700, {
      ru: 'Ошибка разбора',
      uz: 'Soʻrovni oʻqib boʻlmadi',
      en: 'Parse error',
    }),
  method: () =>
    new PaymeError(-32601, {
      ru: 'Метод не найден',
      uz: 'Usul topilmadi',
      en: 'Method not found',
    }),
  amount: () =>
    new PaymeError(-31001, { ru: 'Неверная сумма', uz: 'Notoʻgʻri summa', en: 'Incorrect amount' }),
  order: () =>
    new PaymeError(
      -31050,
      { ru: 'Заказ не найден', uz: 'Buyurtma topilmadi', en: 'Order not found' },
      'order_id',
    ),
  orderBusy: () =>
    new PaymeError(
      -31051,
      {
        ru: 'Заказ уже оплачивается',
        uz: 'Buyurtma allaqachon toʻlanmoqda',
        en: 'Order is already being paid',
      },
      'order_id',
    ),
  notFound: () =>
    new PaymeError(-31003, {
      ru: 'Транзакция не найдена',
      uz: 'Tranzaksiya topilmadi',
      en: 'Transaction not found',
    }),
  cannotPerform: () =>
    new PaymeError(-31008, {
      ru: 'Невозможно выполнить операцию',
      uz: 'Amalni bajarib boʻlmaydi',
      en: 'Unable to perform operation',
    }),
  cannotCancel: () =>
    new PaymeError(-31007, {
      ru: 'Заказ выполнен, отмена невозможна',
      uz: 'Buyurtma bajarilgan, bekor qilib boʻlmaydi',
      en: 'Order completed, cannot cancel',
    }),
};

const account = z.object({ order_id: z.string() });
const params = {
  CheckPerformTransaction: z.object({ amount: z.number(), account }),
  CreateTransaction: z.object({ id: z.string(), time: z.number(), amount: z.number(), account }),
  PerformTransaction: z.object({ id: z.string() }),
  CancelTransaction: z.object({ id: z.string(), reason: z.number().int() }),
  CheckTransaction: z.object({ id: z.string() }),
  GetStatement: z.object({ from: z.number(), to: z.number() }),
};
const requestSchema = z.object({
  method: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  id: z.union([z.number(), z.string()]).nullable().optional(),
});

/** The order behind `order_id`, open for payment, at exactly its price. */
async function payableOrder(orderId: string, amountTiyin: number): Promise<Payment> {
  const order = z.uuid().safeParse(orderId).success
    ? await db.payment.findFirst({ where: { id: orderId, provider: 'PAYME' } })
    : null;
  if (!order || order.status !== 'PENDING') throw errors.order();
  if (order.amount * 100 !== amountTiyin) throw errors.amount();
  return order;
}

async function byTransaction(id: string): Promise<Payment> {
  const payment = await db.payment.findUnique({
    where: { provider_providerTransId: { provider: 'PAYME', providerTransId: id } },
  });
  if (!payment) throw errors.notFound();
  return payment;
}

const ms = (value: bigint | null) => (value === null ? 0 : Number(value));

async function timeOut(payment: Payment, now: Date): Promise<never> {
  await cancelPayment(payment.id, {
    providerState: STATE.cancelled,
    cancelTime: BigInt(now.getTime()),
    cancelReason: REASON_TIMEOUT,
  });
  throw errors.cannotPerform();
}

const expired = (payment: Payment, now: Date) =>
  now.getTime() - ms(payment.providerTime) > TIMEOUT_MS;

const methods: Record<keyof typeof params, (input: never, now: Date) => Promise<object>> = {
  async CheckPerformTransaction({
    amount,
    account,
  }: z.infer<typeof params.CheckPerformTransaction>) {
    await payableOrder(account.order_id, amount);
    return { allow: true };
  },

  async CreateTransaction(
    { id, time, amount, account }: z.infer<typeof params.CreateTransaction>,
    now: Date,
  ) {
    const existing = await db.payment.findUnique({
      where: { provider_providerTransId: { provider: 'PAYME', providerTransId: id } },
    });
    if (existing) {
      if (existing.providerState !== STATE.created) throw errors.cannotPerform();
      if (expired(existing, now)) await timeOut(existing, now);
      return {
        create_time: ms(existing.providerTime),
        transaction: existing.id,
        state: STATE.created,
      };
    }
    const order = await payableOrder(account.order_id, amount);
    // One transaction per order: a second one while the first is open is refused.
    if (order.providerTransId !== null) throw errors.orderBusy();
    const { count } = await db.payment.updateMany({
      where: { id: order.id, providerTransId: null, status: 'PENDING' },
      data: { providerTransId: id, providerState: STATE.created, providerTime: BigInt(time) },
    });
    if (count === 0) throw errors.orderBusy();
    return { create_time: time, transaction: order.id, state: STATE.created };
  },

  async PerformTransaction({ id }: z.infer<typeof params.PerformTransaction>, now: Date) {
    const payment = await byTransaction(id);
    if (payment.providerState === STATE.performed) {
      return {
        transaction: payment.id,
        perform_time: ms(payment.performTime),
        state: STATE.performed,
      };
    }
    if (payment.providerState !== STATE.created) throw errors.cannotPerform();
    if (expired(payment, now)) await timeOut(payment, now);
    const performTime = BigInt(now.getTime());
    await settlePayment(payment.id, { providerState: STATE.performed, performTime }, now);
    return { transaction: payment.id, perform_time: Number(performTime), state: STATE.performed };
  },

  async CancelTransaction({ id, reason }: z.infer<typeof params.CancelTransaction>, now: Date) {
    const payment = await byTransaction(id);
    if (
      payment.providerState === STATE.cancelled ||
      payment.providerState === STATE.cancelledAfterPerform
    ) {
      return {
        transaction: payment.id,
        cancel_time: ms(payment.cancelTime),
        state: payment.providerState,
      };
    }
    // PRO time already granted for a performed payment isn't taken back here.
    if (payment.providerState === STATE.performed) throw errors.cannotCancel();
    const cancelTime = BigInt(now.getTime());
    await cancelPayment(payment.id, {
      providerState: STATE.cancelled,
      cancelTime,
      cancelReason: reason,
    });
    return { transaction: payment.id, cancel_time: Number(cancelTime), state: STATE.cancelled };
  },

  async CheckTransaction({ id }: z.infer<typeof params.CheckTransaction>) {
    const payment = await byTransaction(id);
    return {
      create_time: ms(payment.providerTime),
      perform_time: ms(payment.performTime),
      cancel_time: ms(payment.cancelTime),
      transaction: payment.id,
      state: payment.providerState,
      reason: payment.cancelReason,
    };
  },

  async GetStatement({ from, to }: z.infer<typeof params.GetStatement>) {
    const rows = await db.payment.findMany({
      where: { provider: 'PAYME', providerTime: { gte: BigInt(from), lte: BigInt(to) } },
      orderBy: { providerTime: 'asc' },
    });
    return {
      transactions: rows.map((p) => ({
        id: p.providerTransId,
        time: ms(p.providerTime),
        amount: p.amount * 100,
        account: { order_id: p.id },
        create_time: ms(p.providerTime),
        perform_time: ms(p.performTime),
        cancel_time: ms(p.cancelTime),
        transaction: p.id,
        state: p.providerState,
        reason: p.cancelReason,
      })),
    };
  },
};

/** One Payme request in, one JSON-RPC answer out (always sent with HTTP 200). */
export async function handlePayme(
  authorization: string | null,
  body: unknown,
  now = new Date(),
): Promise<object> {
  const id = (body as { id?: unknown } | null)?.id ?? null;
  try {
    const config = paymeConfig();
    const expected = config
      ? `Basic ${Buffer.from(`Paycom:${config.key}`).toString('base64')}`
      : '';
    if (!config || !authorization || !sameSecret(authorization, expected)) throw errors.auth();

    const request = requestSchema.safeParse(body);
    if (!request.success) throw errors.parse();
    const method = request.data.method as keyof typeof params;
    if (!(method in params)) throw errors.method();
    const input = params[method].safeParse(request.data.params);
    if (!input.success) throw errors.parse();
    const result = await methods[method](input.data as never, now);
    return { id, result };
  } catch (error) {
    if (!(error instanceof PaymeError)) throw error;
    return {
      id,
      error: {
        code: error.code,
        message: error.text,
        ...(error.data && { data: error.data }),
      },
    };
  }
}
