import { z } from 'zod';
import { defaultBookingRules } from '@/domain/availability';

/**
 * Shop.settings (JSON column). Every field has a safe default, so an empty or partial object —
 * or one written by an older version — still yields complete booking rules.
 */
export const shopSettingsSchema = z.object({
  slotStepMin: z.number().int().min(5).max(120).catch(defaultBookingRules.slotStepMin),
  minNoticeMin: z
    .number()
    .int()
    .min(0)
    .max(7 * 24 * 60)
    .catch(defaultBookingRules.minNoticeMin),
  bufferMin: z.number().int().min(0).max(60).catch(defaultBookingRules.bufferMin),
  horizonDays: z.number().int().min(1).max(365).catch(defaultBookingRules.horizonDays),
  /** Client bookings wait for the shop to accept them (PENDING) instead of confirming at once. */
  requireApproval: z.boolean().catch(false),
  /** How many upcoming bookings one client may hold at this shop (abuse protection). */
  maxActiveBookingsPerClient: z.number().int().min(1).max(20).catch(3),
});
export type ShopSettings = z.infer<typeof shopSettingsSchema>;

export function parseShopSettings(value: unknown): ShopSettings {
  return shopSettingsSchema.parse(typeof value === 'object' && value !== null ? value : {});
}
