import { z } from 'zod';
import { defaultBookingRules } from '@/domain/availability';
import { isInUzbekistan, isRegion, isTashkentDistrict } from '@/domain/places';
import { checkSlug } from '@/domain/slug';

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

const coordinates = z
  .object({ lat: z.number(), lng: z.number() })
  .refine(isInUzbekistan, 'location must be in Uzbekistan');

/** The details an owner fills in when opening (or editing) a shop. */
export const shopDetailsSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    region: z.string().refine(isRegion, 'unknown region'),
    /** A Tashkent district key, or free text elsewhere. */
    district: z.string().trim().min(2).max(60),
    address: z.string().trim().min(3).max(200),
    landmark: z.string().trim().max(120).optional(),
    location: coordinates.nullable().optional(),
  })
  .refine((d) => d.region !== 'tashkent-city' || isTashkentDistrict(d.district), {
    path: ['district'],
    message: 'unknown Tashkent district',
  });

/** POST /api/shops */
export const createShopRequestSchema = shopDetailsSchema.and(
  z.object({ slug: z.string().refine((s) => checkSlug(s) === null, 'bad link name') }),
);
export type CreateShopRequest = z.infer<typeof createShopRequestSchema>;

/** PATCH /api/shops/:id — the link name is fixed once shared, so it isn't editable here. */
export const updateShopRequestSchema = shopDetailsSchema;
export type UpdateShopRequest = z.infer<typeof updateShopRequestSchema>;

export const shopSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED']),
  region: z.string(),
  district: z.string().nullable(),
  address: z.string(),
  landmark: z.string().nullable(),
  location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  /** In display order; the first one is the cover clients see first. */
  photos: z.array(z.object({ id: z.string(), url: z.string() })),
});
export type ShopDto = z.infer<typeof shopSchema>;
export type ShopPhoto = ShopDto['photos'][number];

export const MAX_SHOP_PHOTOS = 8;
/** The app resizes photos to this long edge before upload (a few hundred KB as WebP or JPEG). */
export const PHOTO_MAX_EDGE = 1600;
/** Upload limit, well above what a resized photo weighs. */
export const MAX_PHOTO_BYTES = 2_000_000;

/** PUT /api/shops/:id/photos — every current photo id, in the new order. */
export const reorderPhotosRequestSchema = z.object({
  order: z.array(z.uuid()).min(1).max(MAX_SHOP_PHOTOS),
});
export type ReorderPhotosRequest = z.infer<typeof reorderPhotosRequestSchema>;

/** `details.reason` when a photo change is refused. */
export type PhotoRefusal = 'too_many_photos' | 'photos_changed' | 'not_an_image' | 'too_large';

export const slugCheckResponseSchema = z.object({
  slug: z.string(),
  available: z.boolean(),
  problem: z.enum(['too_short', 'format', 'reserved', 'taken']).nullable(),
});

/** One person can own a few shops (branches), not a hundred. */
export const MAX_OWNED_SHOPS = 3;

/** `details.reason` when creating a shop is refused. */
export type ShopRefusal = 'slug_taken' | 'too_many_shops';
