import { z } from 'zod';
import { locales } from '@/i18n/locales';

/** Authorization header scheme: `Authorization: tma <Telegram initData>`. */
export const AUTH_SCHEME = 'tma';

export const sessionRequestSchema = z.object({
  /** The language picked in the app, stored on the account so the bot uses it too. */
  locale: z.enum(locales).optional(),
});
export type SessionRequest = z.infer<typeof sessionRequestSchema>;

export const membershipSchema = z.object({
  staffId: z.string(),
  role: z.enum(['OWNER', 'ADMIN', 'MASTER']),
  shop: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
});

export const sessionResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    username: z.string().nullable(),
    phone: z.string().nullable(),
    phoneVerified: z.boolean(),
    locale: z.enum(locales),
  }),
  /** Shops where this user works, with their role — drives the staff side of the app. */
  memberships: z.array(membershipSchema),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
