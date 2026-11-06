import { z } from 'zod';

export const PAYMENT_PROVIDERS = ['PAYME', 'CLICK'] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

/** GET /api/shops/:id/billing — the plan page: price, paid time, how to pay, past payments. */
export const billingSchema = z.object({
  plan: z.enum(['FREE', 'PRO']),
  /** PRO is paid up to here; null: never paid. */
  planUntil: z.string().nullable(),
  /** Billing switched on: PRO only while paid up. Off: every shop is PRO. */
  enforced: z.boolean(),
  /** UZS for one period. */
  price: z.number(),
  days: z.number(),
  /** Providers set up on the server; none: paying isn't open yet. */
  providers: z.array(z.enum(PAYMENT_PROVIDERS)),
  /** Only the owner pays. */
  canPay: z.boolean(),
  payments: z.array(
    z.object({
      id: z.string(),
      provider: z.enum(PAYMENT_PROVIDERS),
      amount: z.number(),
      status: z.enum(['PENDING', 'PAID', 'CANCELLED']),
      at: z.string(),
    }),
  ),
});
export type BillingDto = z.infer<typeof billingSchema>;

/** POST /api/shops/:id/billing/checkout */
export const checkoutRequestSchema = z.object({ provider: z.enum(PAYMENT_PROVIDERS) });

export const checkoutSchema = z.object({
  paymentId: z.string(),
  /** The provider's checkout page, opened outside the Mini App. */
  url: z.string(),
});
export type CheckoutDto = z.infer<typeof checkoutSchema>;
