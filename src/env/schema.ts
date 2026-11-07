import { z } from 'zod';

/** `KEY=` in a .env file yields an empty string; treat it as "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const botToken = z.string().regex(/^\d+:[\w-]{30,}$/, 'must look like a BotFather token');

export const serverEnvSchema = z
  .object({
    APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    // Neon pooled URL (…-pooler…), used by the app.
    DATABASE_URL: optional(z.url()),
    // Neon direct URL, used only by `prisma migrate` (see prisma.config.ts).
    DIRECT_URL: optional(z.url()),
    // In development this is the dev bot's token.
    TELEGRAM_BOT_TOKEN: optional(botToken),
    // Telegram sends it in X-Telegram-Bot-Api-Secret-Token so only Telegram can call /api/bot.
    TELEGRAM_WEBHOOK_SECRET: optional(
      z.string().regex(/^[A-Za-z0-9_-]{32,256}$/, 'must be 32-256 chars of A-Z a-z 0-9 _ -'),
    ),
    // Sent by the scheduler to /api/cron/dispatch, so only it can run the outbox.
    CRON_SECRET: optional(z.string().min(32, 'must be at least 32 characters')),
    // Cloudflare R2 bucket for uploaded photos. Unset in development: photos are kept in .media/.
    MEDIA_BUCKET: optional(z.string().regex(/^[a-z0-9-]{3,63}$/, 'must be an R2 bucket name')),
    // Public base URL of that bucket (its custom domain), e.g. https://media.barberim.uz
    MEDIA_BASE_URL: optional(z.url().refine((url) => !url.endsWith('/'), 'no trailing slash')),
    R2_ACCOUNT_ID: optional(z.string().regex(/^[0-9a-f]{32}$/, 'must be a Cloudflare account id')),
    R2_ACCESS_KEY_ID: optional(z.string().min(1)),
    R2_SECRET_ACCESS_KEY: optional(z.string().min(1)),
    // Subscription billing (P2.11). Off: every shop is PRO. On: PRO only while paid up.
    BILLING_ENFORCED: optional(z.stringbool()),
    // PRO per month, in UZS.
    PRO_PRICE_UZS: optional(z.coerce.number().int().min(1000).max(10_000_000)),
    // Payme Business: merchant (cashbox) id and its key; PAYME_TEST uses Payme's test checkout.
    PAYME_MERCHANT_ID: optional(z.string().regex(/^[0-9a-f]{24}$/, 'must be a Payme merchant id')),
    PAYME_KEY: optional(z.string().min(10)),
    PAYME_TEST: optional(z.stringbool()),
    // Click Merchant: service id, merchant id and the secret key that signs its requests.
    CLICK_SERVICE_ID: optional(z.string().regex(/^\d+$/, 'must be a number')),
    CLICK_MERCHANT_ID: optional(z.string().regex(/^\d+$/, 'must be a number')),
    CLICK_SECRET_KEY: optional(z.string().min(6)),
    // Encrypts each shop's own Payme/Click/Uzum secrets (client deposits). Random, 32+ chars;
    // changing it makes saved shop keys unreadable, so shops would enter them again.
    DEPOSIT_KEYS_SECRET: optional(z.string().min(32, 'must be at least 32 characters')),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === 'development') return;
    const required = [
      'DATABASE_URL',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_WEBHOOK_SECRET',
      'CRON_SECRET',
      'MEDIA_BUCKET',
      'MEDIA_BASE_URL',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
    ] as const;
    for (const key of required) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `required when APP_ENV=${env.APP_ENV}`,
        });
      }
    }
  });

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
  // Optional: Yandex Static Maps API key; without it the app shows a map link instead of a preview.
  NEXT_PUBLIC_YANDEX_MAPS_KEY: optional(z.string().min(10)),
  NEXT_PUBLIC_BOT_USERNAME: optional(
    z.string().regex(/^[A-Za-z0-9_]{5,32}$/, 'must be a Telegram username without @'),
  ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

/** Parses env vars, throwing one readable error that lists every problem. */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  raw: Record<string, string | undefined>,
  label: string,
): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid ${label} environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
