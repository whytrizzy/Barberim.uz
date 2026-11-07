import 'server-only';
import { z } from 'zod';
import { sameSecret } from './secret';

// The Uzum Bank Merchant API (developer.uzumbank.uz/merchant): Uzum calls {base}/check, /create,
// /confirm, /reverse and /status as JSON POSTs with Basic auth (our login and password). Amounts
// are in tiyin. The client pays inside the Uzum Bank app by typing our payment code, which comes
// as params.account. A transaction not confirmed within 30 minutes of its creation has failed.
// Errors are HTTP 400 with status "FAILED" and Uzum's error code.

export const UZUM_METHODS = ['check', 'create', 'confirm', 'reverse', 'status'] as const;
export type UzumMethod = (typeof UZUM_METHODS)[number];

const ERROR = {
  access: '10001',
  json: '10002',
  params: '10005',
  service: '10006',
  notFound: '10007',
  alreadyPaid: '10008',
  paymentCancelled: '10009',
  transExists: '10010',
  amount: '10011',
  transNotFound: '10014',
  transCancelled: '10015',
  alreadyConfirmed: '10016',
  cannotReverse: '10017',
  alreadyReversed: '10018',
  internal: '99999',
} as const;

/** Kept in our own rows; FAILED is worked out from the 30-minute rule, never stored. */
export const UZUM_STATE = { created: 1, confirmed: 2, reversed: -1, refunded: -2 } as const;
export const UZUM_CONFIRM_WINDOW_MS = 30 * 60_000;

export type UzumOrder = {
  id: string;
  /** UZS. */
  amount: number;
  /** The payment code the client typed. */
  account: string;
  state: 'open' | 'paid' | 'cancelled';
};

export type UzumTransaction = {
  orderId: string;
  transId: string;
  /** UZS. */
  amount: number;
  account: string;
  state: number;
  /** Milliseconds since the epoch. */
  transTime: number;
  confirmTime: number | null;
  reverseTime: number | null;
};

export type UzumStore = {
  /** The order a payment code points at. */
  order(account: string): Promise<UzumOrder | null>;
  transaction(transId: string): Promise<UzumTransaction | null>;
  /** Starts Uzum's transaction on an open order; false if the order took another one meanwhile. */
  create(orderId: string, transId: string, now: Date): Promise<boolean>;
  /** Uzum took the money: the order is paid. */
  confirm(orderId: string, now: Date): Promise<void>;
  /** Uzum calls off a transaction it hasn't confirmed; the order stays open for another try. */
  release(orderId: string, now: Date): Promise<void>;
  /** Uzum gives a confirmed payment back. Without it, confirmed payments can't be reversed. */
  refund?(orderId: string, now: Date): Promise<void>;
};

export type UzumAccount = { serviceId: string; login: string; password: string };
export type UzumResponse = { status: 200 | 400; body: Record<string, unknown> };

const base = z.object({ serviceId: z.coerce.number().int(), timestamp: z.coerce.number() });
const schemas = {
  check: base.extend({ params: z.record(z.string(), z.unknown()) }),
  create: base.extend({
    transId: z.string().min(1).max(64),
    params: z.record(z.string(), z.unknown()),
    amount: z.coerce.number().int(),
  }),
  confirm: base.extend({ transId: z.string().min(1).max(64) }),
  reverse: base.extend({ transId: z.string().min(1).max(64) }),
  status: base.extend({ transId: z.string().min(1).max(64) }),
};

const STATUS: Record<number, string> = {
  [UZUM_STATE.created]: 'CREATED',
  [UZUM_STATE.confirmed]: 'CONFIRMED',
  [UZUM_STATE.reversed]: 'REVERSED',
  [UZUM_STATE.refunded]: 'REVERSED',
};

const expired = (t: UzumTransaction, now: Date) =>
  t.state === UZUM_STATE.created && now.getTime() - t.transTime > UZUM_CONFIRM_WINDOW_MS;

function statusOf(t: UzumTransaction, now: Date): string {
  return expired(t, now) ? 'FAILED' : (STATUS[t.state] ?? 'FAILED');
}

/** The payment code from Uzum's params (the service's one field, named "account"). */
function accountOf(params: Record<string, unknown>): string | null {
  const value = params.account;
  const text = typeof value === 'number' ? String(value) : value;
  return typeof text === 'string' && /^\d{6}$/.test(text.trim()) ? text.trim() : null;
}

/** What the payer sees about the order in the Uzum Bank app. */
const data = (account: string) => ({ account: { value: account } });

function basicAuth(header: string | null): { login: string; password: string } | null {
  const match = header?.match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  const decoded = Buffer.from(match[1]!, 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  return colon < 0 ? null : { login: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

/** One Uzum request in, Uzum's answer (HTTP status and JSON body) out. */
export async function handleUzumRequest(
  store: UzumStore,
  account: UzumAccount | null,
  method: UzumMethod,
  authorization: string | null,
  body: unknown,
  now = new Date(),
): Promise<UzumResponse> {
  const raw = (body ?? {}) as { serviceId?: unknown };
  const fail = (errorCode: string): UzumResponse => ({
    status: 400,
    body: {
      serviceId: typeof raw.serviceId === 'number' ? raw.serviceId : Number(raw.serviceId) || 0,
      timestamp: now.getTime(),
      status: 'FAILED',
      errorCode,
    },
  });

  const auth = basicAuth(authorization);
  if (
    !account ||
    !auth ||
    !sameSecret(auth.login, account.login) ||
    !sameSecret(auth.password, account.password)
  ) {
    return fail(ERROR.access);
  }
  if (body === undefined) return fail(ERROR.json);
  const parsed = schemas[method].safeParse(body);
  if (!parsed.success) return fail(ERROR.params);
  const r = parsed.data;
  if (String(r.serviceId) !== account.serviceId) return fail(ERROR.service);
  const serviceId = r.serviceId;

  if (method === 'check' || method === 'create') {
    const { params } = r as z.infer<typeof schemas.create>;
    const code = accountOf(params);
    if (!code) return fail(ERROR.params);

    if (method === 'create') {
      const { transId, amount } = r as z.infer<typeof schemas.create>;
      const existing = await store.transaction(transId);
      if (existing) return fail(ERROR.transExists);
      const order = await store.order(code);
      if (!order) return fail(ERROR.notFound);
      if (order.state === 'paid') return fail(ERROR.alreadyPaid);
      if (order.state === 'cancelled') return fail(ERROR.paymentCancelled);
      if (amount !== order.amount * 100) return fail(ERROR.amount);
      if (!(await store.create(order.id, transId, now))) return fail(ERROR.paymentCancelled);
      return {
        status: 200,
        body: {
          serviceId,
          transId,
          status: 'CREATED',
          transTime: now.getTime(),
          data: data(code),
          amount,
        },
      };
    }

    const order = await store.order(code);
    if (!order) return fail(ERROR.notFound);
    if (order.state === 'paid') return fail(ERROR.alreadyPaid);
    if (order.state === 'cancelled') return fail(ERROR.paymentCancelled);
    return {
      status: 200,
      body: { serviceId, timestamp: now.getTime(), status: 'OK', data: data(code) },
    };
  }

  const { transId } = r as z.infer<typeof schemas.status>;
  const t = await store.transaction(transId);
  if (!t) return fail(ERROR.transNotFound);
  const echo = { serviceId, transId, data: data(t.account), amount: t.amount * 100 };

  if (method === 'status') {
    return {
      status: 200,
      body: {
        ...echo,
        status: statusOf(t, now),
        transTime: t.transTime,
        confirmTime: t.confirmTime,
        reverseTime: t.reverseTime,
      },
    };
  }

  if (method === 'confirm') {
    if (t.state === UZUM_STATE.confirmed) return fail(ERROR.alreadyConfirmed);
    if (t.state !== UZUM_STATE.created || expired(t, now)) return fail(ERROR.transCancelled);
    await store.confirm(t.orderId, now);
    // Read back: the order may have closed (its hold ran out) while the client was paying.
    const after = await store.transaction(transId);
    if (after?.state !== UZUM_STATE.confirmed) return fail(ERROR.paymentCancelled);
    return {
      status: 200,
      body: { ...echo, status: 'CONFIRMED', confirmTime: after.confirmTime ?? now.getTime() },
    };
  }

  // reverse
  if (t.state === UZUM_STATE.reversed || t.state === UZUM_STATE.refunded) {
    return fail(ERROR.alreadyReversed);
  }
  if (t.state === UZUM_STATE.confirmed) {
    if (!store.refund) return fail(ERROR.cannotReverse);
    await store.refund(t.orderId, now);
  } else {
    await store.release(t.orderId, now);
  }
  return { status: 200, body: { ...echo, status: 'REVERSED', reverseTime: now.getTime() } };
}
