import { z } from 'zod';

export const DEPOSIT_PROVIDERS = ['PAYME', 'CLICK', 'UZUM'] as const;
export type DepositProvider = (typeof DEPOSIT_PROVIDERS)[number];

export const DEPOSIT_STATUSES = [
  'AWAITING',
  'PAID',
  'CANCELLED',
  'REFUND_DUE',
  'REFUNDED',
  'KEPT',
] as const;

/** The deposit on a booking, when one was asked for. */
export const bookingDepositSchema = z.object({
  amount: z.number(),
  status: z.enum(DEPOSIT_STATUSES),
  provider: z.enum(DEPOSIT_PROVIDERS).nullable(),
  /** Unpaid by then, the booking is cancelled. */
  expiresAt: z.string(),
  /** For paying in the Uzum Bank app, once Uzum is chosen. */
  code: z.number().nullable(),
});
export type BookingDepositDto = z.infer<typeof bookingDepositSchema>;

/** What a client sees before booking: the shop's deposit, and whether it applies to them. */
export const shopDepositInfoSchema = z.object({
  amount: z.number(),
  providers: z.array(z.enum(DEPOSIT_PROVIDERS)),
  /** They missed a visit here and haven't paid a deposit since. */
  youOwe: z.boolean(),
});

/** POST /api/me/bookings/:id/deposit — pay the deposit with one of the shop's providers. */
export const depositCheckoutRequestSchema = z.object({ provider: z.enum(DEPOSIT_PROVIDERS) });
export const depositCheckoutSchema = z.object({
  /** Payme or Click: their checkout page. */
  url: z.string().nullable(),
  /** Uzum: the number to type in the Uzum Bank app. */
  code: z.number().nullable(),
});

const account = z.object({
  provider: z.enum(DEPOSIT_PROVIDERS),
  /** Payme merchant id / Click service_id / Uzum serviceId. */
  accountId: z.string(),
  /** Click merchant_id / Uzum login. */
  login: z.string().nullable(),
  test: z.boolean(),
  /** A secret is saved (never sent back). */
  hasSecret: z.boolean(),
  /** Where the provider must call us; set in its merchant cabinet. */
  callbackUrls: z.array(z.string()),
});

/** GET /api/shops/:id/deposits — the owner's deposit settings. */
export const depositSettingsSchema = z.object({
  amount: z.number(),
  afterNoShow: z.boolean(),
  masters: z.array(z.object({ id: z.string(), name: z.string(), requiresDeposit: z.boolean() })),
  accounts: z.array(account),
  /** The server can store provider secrets (its encryption key is set). */
  canConnect: z.boolean(),
});
export type DepositSettingsDto = z.infer<typeof depositSettingsSchema>;

const digits = z
  .string()
  .trim()
  .regex(/^\d{1,20}$/);

/** PUT /api/shops/:id/deposits */
export const depositSettingsRequestSchema = z.object({
  amount: z.number().int().min(0).max(10_000_000),
  afterNoShow: z.boolean(),
  /** Masters whose clients pay a deposit. */
  masterIds: z.array(z.uuid()).max(50),
  /** Accounts to add or change; a missing secret keeps the saved one. */
  accounts: z
    .array(
      z.discriminatedUnion('provider', [
        z.object({
          provider: z.literal('PAYME'),
          accountId: z
            .string()
            .trim()
            .regex(/^[0-9a-f]{24}$/),
          secret: z.string().trim().min(10).max(200).optional(),
          test: z.boolean(),
        }),
        z.object({
          provider: z.literal('CLICK'),
          accountId: digits,
          login: digits,
          secret: z.string().trim().min(6).max(200).optional(),
        }),
        z.object({
          provider: z.literal('UZUM'),
          accountId: digits,
          login: z.string().trim().min(1).max(100),
          secret: z.string().trim().min(6).max(200).optional(),
        }),
      ]),
    )
    .max(3),
  /** Providers to disconnect. */
  remove: z.array(z.enum(DEPOSIT_PROVIDERS)).max(3).default([]),
});
export type DepositSettingsRequest = z.infer<typeof depositSettingsRequestSchema>;

/** `details.reason` when deposits are refused. */
export type DepositRefusal =
  | 'deposit_closed' // paid, expired or cancelled: nothing to pay
  | 'provider_unavailable'
  | 'secret_required'
  | 'cannot_store_secrets';
