import { z } from 'zod';
import { discoveredShopSchema } from '@/features/shop/schemas';

/** More than anyone keeps; stops a runaway client filling the table. */
export const MAX_FAVORITES = 50;

/** The last finished visit there, to book the same again in one tap. */
export const lastVisitSchema = z.object({
  bookingId: z.string(),
  startAt: z.string(),
  staffId: z.string(),
  masterName: z.string(),
  /** Services the shop still offers. */
  serviceIds: z.array(z.string()),
  serviceNames: z.array(z.string()),
});
export type LastVisit = z.infer<typeof lastVisitSchema>;

/** GET /api/me/favorites — saved shops that can be booked, most recently saved first. */
export const favoritesSchema = z.object({
  shops: z.array(discoveredShopSchema.extend({ lastVisit: lastVisitSchema.nullable() })),
});
export type FavoritesDto = z.infer<typeof favoritesSchema>;
export type FavoriteShop = FavoritesDto['shops'][number];

/** PUT / DELETE /api/me/favorites/:shopId */
export const favoriteStateSchema = z.object({ shopId: z.string(), isFavorite: z.boolean() });

/** `details.reason` when saving a shop is refused. */
export type FavoriteRefusal = 'too_many_favorites';
