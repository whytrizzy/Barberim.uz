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
    // S3 bucket for uploaded photos. Unset in development: photos are kept in .media/ instead.
    MEDIA_BUCKET: optional(z.string().regex(/^[a-z0-9.-]{3,63}$/, 'must be an S3 bucket name')),
    // Public base URL of that bucket (its CloudFront distribution), e.g. https://d123.cloudfront.net
    MEDIA_BASE_URL: optional(z.url().refine((url) => !url.endsWith('/'), 'no trailing slash')),
    // Lambda sets this itself; set it only to use a real bucket from a laptop.
    AWS_REGION: z.string().default('eu-central-1'),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === 'development') return;
    const required = [
      'DATABASE_URL',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_WEBHOOK_SECRET',
      'MEDIA_BUCKET',
      'MEDIA_BASE_URL',
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
