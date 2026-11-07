import 'server-only';
import { z } from 'zod';
import { sameSecret } from './secret';

// The Payme (Paycom) Merchant API, shared by PRO billing and client deposits: Payme calls our
// endpoint with JSON-RPC, signed with Basic auth "Paycom:<key>". Our order's id is the account
// field "order_id". Amounts are in tiyin (1 so'm = 100). Every answer, errors too, is HTTP 200.
// Reference: developer.help.paycom.uz (Merchant API methods, data types).

/** A created transaction not performed within 12 hours is cancelled (Payme's rule). */
const TIMEOUT_MS = 12 * 3_600_000;
/** Payme's transaction states. */
export const PAYME_STATE = {
  created: 1,
  performed: 2,
  cancelled: -1,
  cancelledAfterPerform: -2,
} as const;
/** Payme's cancel reason for a transaction that timed out. */
const REASON_TIMEOUT = 4;

/** An order as the protocol sees it, whatever it is for. */
export type PaymeOrder = {
  id: string;
  /** UZS. */
  amount: number;
  /** Open for payment: not yet paid, cancelled or expired. */
  payable: boolean;
  providerTransId: string | null;
  providerState: number | null;
  providerTime: bigint | null;
  performTime: bigint | null;
  cancelTime: bigint | null;
  cancelReason: number | null;
};

export type PaymeCancel = { providerState: number; cancelTime: bigint; cancelReason: number };

/** Where orders live: PRO payments, or a shop's client deposits. */
export type PaymeStore = {
  order(orderId: string): Promise<PaymeOrder | null>;
  byTransaction(transId: string): Promise<PaymeOrder | null>;
  /** Ties Payme's transaction to a still-payable order with none yet; false if that changed. */
  attach(orderId: string, transId: string, time: bigint): Promise<boolean>;
  perform(orderId: string, performTime: bigint, now: Date): Promise<void>;
  /** A transaction cancelled before it was performed. */
  cancel(orderId: string, fields: PaymeCancel): Promise<void>;
  /** A refund of a performed transaction (state -2). Absent: performed orders can't be cancelled. */
  refund?(orderId: string, fields: PaymeCancel): Promise<void>;
  statement(from: bigint, to: bigint): Promise<PaymeOrder[]>;
};

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
    new PaymeError(-32601, { ru: 'Метод не найден', uz: 'Usul topilmadi', en: 'Method not found' }),
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
type Method = keyof typeof params;
const requestSchema = z.object({
  method: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  id: z.union([z.number(), z.string()]).nullable().optional(),
});

const ms = (value: bigint | null) => (value === null ? 0 : Number(value));
const expired = (order: PaymeOrder, now: Date) =>
  now.getTime() - ms(order.providerTime) > TIMEOUT_MS;

function run(store: PaymeStore) {
  async function payableOrder(orderId: string, amountTiyin: number): Promise<PaymeOrder> {
    const order = z.uuid().safeParse(orderId).success ? await store.order(orderId) : null;
    if (!order?.payable) throw errors.order();
    if (order.amount * 100 !== amountTiyin) throw errors.amount();
    return order;
  }

  async function byTransaction(id: string): Promise<PaymeOrder> {
    const order = await store.byTransaction(id);
    if (!order) throw errors.notFound();
    return order;
  }

  async function timeOut(order: PaymeOrder, now: Date): Promise<never> {
    await store.cancel(order.id, {
      providerState: PAYME_STATE.cancelled,
      cancelTime: BigInt(now.getTime()),
      cancelReason: REASON_TIMEOUT,
    });
    throw errors.cannotPerform();
  }

  return {
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
      const existing = await store.byTransaction(id);
      if (existing) {
        if (existing.providerState !== PAYME_STATE.created) throw errors.cannotPerform();
        if (expired(existing, now)) await timeOut(existing, now);
        return {
          create_time: ms(existing.providerTime),
          transaction: existing.id,
          state: PAYME_STATE.created,
        };
      }
      const order = await payableOrder(account.order_id, amount);
      // One transaction per order: a second one while the first is open is refused.
      if (order.providerTransId !== null) throw errors.orderBusy();
      if (!(await store.attach(order.id, id, BigInt(time)))) throw errors.orderBusy();
      return { create_time: time, transaction: order.id, state: PAYME_STATE.created };
    },

    async PerformTransaction({ id }: z.infer<typeof params.PerformTransaction>, now: Date) {
      const order = await byTransaction(id);
      if (order.providerState === PAYME_STATE.performed) {
        return {
          transaction: order.id,
          perform_time: ms(order.performTime),
          state: PAYME_STATE.performed,
        };
      }
      if (order.providerState !== PAYME_STATE.created) throw errors.cannotPerform();
      if (expired(order, now)) await timeOut(order, now);
      const performTime = BigInt(now.getTime());
      await store.perform(order.id, performTime, now);
      return {
        transaction: order.id,
        perform_time: Number(performTime),
        state: PAYME_STATE.performed,
      };
    },

    async CancelTransaction({ id, reason }: z.infer<typeof params.CancelTransaction>, now: Date) {
      const order = await byTransaction(id);
      if (
        order.providerState === PAYME_STATE.cancelled ||
        order.providerState === PAYME_STATE.cancelledAfterPerform
      ) {
        return {
          transaction: order.id,
          cancel_time: ms(order.cancelTime),
          state: order.providerState,
        };
      }
      const cancelTime = BigInt(now.getTime());
      if (order.providerState === PAYME_STATE.performed) {
        // A refund, started by the merchant in the Payme cabinet.
        if (!store.refund) throw errors.cannotCancel();
        const state = PAYME_STATE.cancelledAfterPerform;
        await store.refund(order.id, { providerState: state, cancelTime, cancelReason: reason });
        return { transaction: order.id, cancel_time: Number(cancelTime), state };
      }
      const state = PAYME_STATE.cancelled;
      await store.cancel(order.id, { providerState: state, cancelTime, cancelReason: reason });
      return { transaction: order.id, cancel_time: Number(cancelTime), state };
    },

    async CheckTransaction({ id }: z.infer<typeof params.CheckTransaction>) {
      const order = await byTransaction(id);
      return {
        create_time: ms(order.providerTime),
        perform_time: ms(order.performTime),
        cancel_time: ms(order.cancelTime),
        transaction: order.id,
        state: order.providerState,
        reason: order.cancelReason,
      };
    },

    async GetStatement({ from, to }: z.infer<typeof params.GetStatement>) {
      const rows = await store.statement(BigInt(from), BigInt(to));
      return {
        transactions: rows.map((o) => ({
          id: o.providerTransId,
          time: ms(o.providerTime),
          amount: o.amount * 100,
          account: { order_id: o.id },
          create_time: ms(o.providerTime),
          perform_time: ms(o.performTime),
          cancel_time: ms(o.cancelTime),
          transaction: o.id,
          state: o.providerState,
          reason: o.cancelReason,
        })),
      };
    },
  } satisfies Record<Method, (input: never, now: Date) => Promise<object>>;
}

/**
 * One Payme request in, one JSON-RPC answer out (always HTTP 200). `key` is the merchant key the
 * request must be signed with; null refuses everything (the account isn't set up).
 */
export async function handlePaymeRpc(
  store: PaymeStore,
  key: string | null,
  authorization: string | null,
  body: unknown,
  now = new Date(),
): Promise<object> {
  const id = (body as { id?: unknown } | null)?.id ?? null;
  try {
    const expected = key ? `Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}` : '';
    if (!key || !authorization || !sameSecret(authorization, expected)) throw errors.auth();

    const request = requestSchema.safeParse(body);
    if (!request.success) throw errors.parse();
    const method = request.data.method as Method;
    if (!(method in params)) throw errors.method();
    const input = params[method].safeParse(request.data.params);
    if (!input.success) throw errors.parse();
    const handlers = run(store) as Record<Method, (input: never, now: Date) => Promise<object>>;
    const result = await handlers[method](input.data as never, now);
    return { id, result };
  } catch (error) {
    if (!(error instanceof PaymeError)) throw error;
    return {
      id,
      error: { code: error.code, message: error.text, ...(error.data && { data: error.data }) },
    };
  }
}

/** Payme's checkout page for an order. */
export function paymeCheckoutUrl({
  merchantId,
  test,
  orderId,
  amount,
  returnUrl,
  lang,
}: {
  merchantId: string;
  test: boolean;
  orderId: string;
  amount: number;
  returnUrl: string;
  lang: 'uz' | 'ru';
}): string {
  const query = `m=${merchantId};ac.order_id=${orderId};a=${amount * 100};c=${returnUrl};l=${lang}`;
  const host = test ? 'https://checkout.test.paycom.uz' : 'https://checkout.paycom.uz';
  return `${host}/${Buffer.from(query).toString('base64')}`;
}
