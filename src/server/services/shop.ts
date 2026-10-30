import 'server-only';
import { checkSlug } from '@/domain/slug';
import {
  MAX_OWNED_SHOPS,
  type CreateShopRequest,
  type ShopDto,
  type ShopRefusal,
  type UpdateShopRequest,
} from '@/features/shop/schemas';
import type { Shop, User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { media, photoIdOf } from '../storage/media';

function refuse(reason: ShopRefusal, code: 'conflict' = 'conflict'): never {
  throw new AppError(code, reason, { reason });
}

export function toShopDto(shop: Shop): ShopDto {
  return {
    id: shop.id,
    slug: shop.slug,
    name: shop.name,
    status: shop.status,
    region: shop.region,
    district: shop.district,
    address: shop.address,
    landmark: shop.landmark,
    location: shop.lat !== null && shop.lng !== null ? { lat: shop.lat, lng: shop.lng } : null,
    photos: shop.photos.flatMap((key) => {
      const id = photoIdOf(key);
      return id ? [{ id, url: media.url(key) }] : [];
    }),
  };
}

const details = (input: UpdateShopRequest) => ({
  name: input.name,
  region: input.region,
  district: input.district,
  address: input.address,
  landmark: input.landmark || null,
  lat: input.location?.lat ?? null,
  lng: input.location?.lng ?? null,
});

const isUniqueViolation = (error: unknown) =>
  (error as { code?: unknown }).code === 'P2002' ||
  String((error as Error)?.message).includes('shops_slug_key');

export async function checkSlugAvailable(slug: string) {
  const problem = checkSlug(slug);
  if (problem) return { slug, available: false, problem };
  const taken = await db.shop.findUnique({ where: { slug }, select: { id: true } });
  return { slug, available: !taken, problem: taken ? ('taken' as const) : null };
}

/**
 * Opens a shop: the shop (a draft until services and hours exist) and its owner, who is also
 * bookable as a master by default — most small shops are the owner's own chair.
 */
export async function createShop(user: User, input: CreateShopRequest): Promise<ShopDto> {
  const owned = await db.staff.count({ where: { userId: user.id, role: 'OWNER' } });
  if (owned >= MAX_OWNED_SHOPS) refuse('too_many_shops');

  try {
    const shop = await db.$transaction(async (tx) => {
      const created = await tx.shop.create({ data: { slug: input.slug, ...details(input) } });
      const owner = await tx.staff.create({
        data: {
          shopId: created.id,
          userId: user.id,
          displayName: user.firstName,
          role: 'OWNER',
          isBookable: true,
        },
      });
      await tx.auditLog.create({
        data: {
          shopId: created.id,
          actorUserId: user.id,
          action: 'shop.create',
          entity: 'shop',
          entityId: created.id,
          data: { slug: created.slug, ownerStaffId: owner.id },
        },
      });
      return created;
    });
    return toShopDto(shop);
  } catch (error) {
    if (isUniqueViolation(error)) refuse('slug_taken');
    throw error;
  }
}

/** Shop details for its staff (any role can read; the client-facing page comes in P1.13). */
export async function getShopForStaff(user: User, shopId: string): Promise<ShopDto> {
  await requireStaff(user.id, shopId);
  return toShopDto(await db.shop.findUniqueOrThrow({ where: { id: shopId } }));
}

/** Owners and admins edit the shop's details. */
export async function updateShop(
  user: User,
  shopId: string,
  input: UpdateShopRequest,
): Promise<ShopDto> {
  await requireStaff(user.id, shopId, ['OWNER', 'ADMIN']);
  const shop = await db.shop.update({ where: { id: shopId }, data: details(input) });
  await db.auditLog.create({
    data: { shopId, actorUserId: user.id, action: 'shop.update', entity: 'shop', entityId: shopId },
  });
  return toShopDto(shop);
}
