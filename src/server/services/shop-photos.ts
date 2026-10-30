import 'server-only';
import { randomUUID } from 'node:crypto';
import { MAX_SHOP_PHOTOS, type PhotoRefusal, type ShopDto } from '@/features/shop/schemas';
import type { User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { cleanImage, imageContentType, imageExtension } from '../storage/image';
import { media, photoIdOf, shopPhotoKey } from '../storage/media';
import { toShopDto } from './shop';

// Shop.photos holds storage keys in display order; the first photo is the cover.

function refuse(reason: PhotoRefusal, code: 'conflict' | 'invalid_input' = 'conflict'): never {
  throw new AppError(code, reason, { reason });
}

const editors = ['OWNER', 'ADMIN'] as const;

async function currentPhotos(shopId: string): Promise<string[]> {
  const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { photos: true } });
  return shop.photos;
}

async function finish(user: User, shopId: string, action: string, key: string): Promise<ShopDto> {
  await db.auditLog.create({
    data: { shopId, actorUserId: user.id, action, entity: 'shop', entityId: shopId, data: { key } },
  });
  return toShopDto(await db.shop.findUniqueOrThrow({ where: { id: shopId } }));
}

/** Stores an uploaded photo (already resized by the app) at the end of the shop's photos. */
export async function addShopPhoto(
  user: User,
  shopId: string,
  upload: Uint8Array,
): Promise<ShopDto> {
  await requireStaff(user.id, shopId, [...editors]);
  const image = cleanImage(upload);
  if (!image) refuse('not_an_image', 'invalid_input');
  if ((await currentPhotos(shopId)).length >= MAX_SHOP_PHOTOS) refuse('too_many_photos');

  const key = shopPhotoKey(shopId, randomUUID(), imageExtension[image.type]);
  await media.put(key, image.bytes, imageContentType[image.type]);
  // Appends only while there is room, so two uploads at once can't go past the limit.
  const added = await db.$executeRaw`
    UPDATE shops SET photos = array_append(photos, ${key}), updated_at = now()
    WHERE id = ${shopId}::uuid AND cardinality(photos) < ${MAX_SHOP_PHOTOS}`;
  if (added === 0) {
    await media.remove(key).catch(() => {});
    refuse('too_many_photos');
  }
  return finish(user, shopId, 'shop.photo.add', key);
}

export async function removeShopPhoto(
  user: User,
  shopId: string,
  photoId: string,
): Promise<ShopDto> {
  await requireStaff(user.id, shopId, [...editors]);
  const key = (await currentPhotos(shopId)).find((k) => photoIdOf(k) === photoId);
  if (!key) throw new AppError('not_found', 'no such photo');
  await db.$executeRaw`
    UPDATE shops SET photos = array_remove(photos, ${key}), updated_at = now()
    WHERE id = ${shopId}::uuid`;
  // Nothing points at the file any more; if deleting it fails, only an unused file is left.
  await media
    .remove(key)
    .catch((error: unknown) => console.error('photo delete failed', key, error));
  return finish(user, shopId, 'shop.photo.remove', key);
}

/** `order` lists every photo id once; refused if the photos changed meanwhile (another device). */
export async function reorderShopPhotos(
  user: User,
  shopId: string,
  order: string[],
): Promise<ShopDto> {
  await requireStaff(user.id, shopId, [...editors]);
  const photos = await currentPhotos(shopId);
  const byId = new Map(photos.map((key) => [photoIdOf(key), key]));
  const keys = order.flatMap((id) => byId.get(id) ?? []);
  if (new Set(order).size !== order.length || keys.length !== photos.length) {
    refuse('photos_changed');
  }
  const { count } = await db.shop.updateMany({
    where: { id: shopId, photos: { equals: photos } },
    data: { photos: keys },
  });
  if (count === 0) refuse('photos_changed');
  return finish(user, shopId, 'shop.photo.reorder', keys[0]!);
}
