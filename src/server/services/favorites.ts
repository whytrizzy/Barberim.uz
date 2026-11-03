import 'server-only';
import {
  MAX_FAVORITES,
  type FavoriteRefusal,
  type FavoritesDto,
  type LastVisit,
} from '@/features/favorites/schemas';
import type { User } from '@/generated/prisma/client';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { discoverShops } from './discover';

function refuse(reason: FavoriteRefusal): never {
  throw new AppError('conflict', reason, { reason });
}

/** Saves a shop. Saving one twice is fine; only a live shop can be saved. */
export async function addFavorite(user: User, shopId: string) {
  const shop = await db.shop.findFirst({ where: { id: shopId, status: 'ACTIVE' } });
  if (!shop) throw new AppError('not_found', 'no such shop');
  const exists = await db.favorite.findUnique({
    where: { userId_shopId: { userId: user.id, shopId } },
  });
  if (!exists) {
    if ((await db.favorite.count({ where: { userId: user.id } })) >= MAX_FAVORITES) {
      refuse('too_many_favorites');
    }
    await db.favorite.upsert({
      where: { userId_shopId: { userId: user.id, shopId } },
      create: { userId: user.id, shopId },
      update: {},
    });
  }
  return { shopId, isFavorite: true };
}

export async function removeFavorite(user: User, shopId: string) {
  await db.favorite.deleteMany({ where: { userId: user.id, shopId } });
  return { shopId, isFavorite: false };
}

export async function isFavorite(user: User, shopId: string): Promise<boolean> {
  return (await db.favorite.count({ where: { userId: user.id, shopId } })) > 0;
}

/** The latest finished visit at each of these shops, by this person. */
async function lastVisits(user: User, shopIds: string[]): Promise<Map<string, LastVisit>> {
  const rows = await db.booking.findMany({
    where: { shopId: { in: shopIds }, status: 'COMPLETED', client: { userId: user.id } },
    orderBy: { startAt: 'desc' },
    distinct: ['shopId'],
    select: {
      id: true,
      shopId: true,
      startAt: true,
      staffId: true,
      staff: { select: { displayName: true } },
      items: {
        orderBy: { sortOrder: 'asc' },
        select: { serviceId: true, nameSnapshot: true },
      },
    },
  });
  return new Map(
    rows.map((row) => [
      row.shopId,
      {
        bookingId: row.id,
        startAt: row.startAt.toISOString(),
        staffId: row.staffId,
        masterName: row.staff.displayName,
        serviceIds: row.items.flatMap((item) => (item.serviceId ? [item.serviceId] : [])),
        serviceNames: row.items.map((item) => item.nameSnapshot),
      },
    ]),
  );
}

/**
 * Saved shops as search shows them (rating, free today), most recently saved first. A shop that
 * can't be booked right now (closed down, no masters) stays saved but is left out until it can.
 */
export async function listFavorites(user: User, now = new Date()): Promise<FavoritesDto> {
  const saved = await db.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { shopId: true },
  });
  const ids = saved.map((favorite) => favorite.shopId);
  if (ids.length === 0) return { shops: [] };
  const [{ shops }, visits] = await Promise.all([
    discoverShops({}, now, ids),
    lastVisits(user, ids),
  ]);
  const byId = new Map(shops.map((shop) => [shop.id, shop]));
  return {
    shops: ids.flatMap((id) => {
      const shop = byId.get(id);
      return shop ? [{ ...shop, lastVisit: visits.get(id) ?? null }] : [];
    }),
  };
}
