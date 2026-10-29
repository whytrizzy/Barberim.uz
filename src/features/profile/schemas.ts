import { z } from 'zod';

/** PUT /api/me/phone — from Telegram's verified contact sharing, or typed by hand. */
export const savePhoneRequestSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('telegram'),
    /** The signed `response` string from WebApp.requestContact(). */
    contact: z.string().min(1).max(4096),
  }),
  z.object({
    source: z.literal('manual'),
    phone: z.string().min(1).max(32),
  }),
]);
export type SavePhoneRequest = z.infer<typeof savePhoneRequestSchema>;

export const savePhoneResponseSchema = z.object({
  phone: z.string(),
  phoneVerified: z.boolean(),
});
export type SavePhoneResponse = z.infer<typeof savePhoneResponseSchema>;

/** `details.reason` of an invalid_input answer from this endpoint. */
export type PhoneRejection = 'phone_invalid' | 'phone_not_uz' | 'contact_invalid';
