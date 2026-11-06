import 'server-only';
import { randomUUID } from 'node:crypto';
import { canManageStaff } from '@/domain/staff';
import { planLimits } from '@/domain/plans';
import type { PortfolioDto } from '@/features/portfolio/schemas';
import type { PhotoRefusal } from '@/features/shop/schemas';
import type { Staff, User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { cleanImage, imageContentType, imageExtension } from '../storage/image';
import { media, photoDtos, photoIdOf, shopPhotoKey } from '../storage/media';
import { refusePlan, shopPlan } from './plans';

// Staff.portfolio holds storage keys of a master's work in display order. The files sit beside the
// shop's own photos (same key format), so the photo worker serves them without a change.

function refuse(reason: PhotoRefusal, code: 'conflict' | 'invalid_input' = 'conflict'): never {
  throw new AppError(code, reason, { reason });
}

/** Masters show their own work; owners and admins also look after those they manage. */
const canEdit = (me: Staff, member: Staff) =>
  me.id === member.id || canManageStaff(me.role, member.role);

async function access(user: User, shopId: string, staffId: string) {
  const me = await requireStaff(user.id, shopId);
  const member = await db.staff.findFirst({ where: { id: staffId, shopId, isActive: true } });
  if (!member) throw new AppError('not_found', 'no such staff member');
  return { me, member, editable: canEdit(me, member) };
}

async function editAccess(user: User, shopId: string, staffId: string) {
  const { member, editable } = await access(user, shopId, staffId);
  if (!editable) throw new AppError('forbidden', 'cannot edit this portfolio');
  return member;
}

const toDto = async (member: Staff, editable: boolean): Promise<PortfolioDto> => ({
  staffId: member.id,
  name: member.displayName,
  canEdit: editable,
  photos: photoDtos(member.portfolio),
  max: planLimits(await shopPlan(member.shopId)).portfolioPhotos,
});

async function finish(user: User, member: Staff, action: string, key: string) {
  await db.auditLog.create({
    data: {
      shopId: member.shopId,
      actorUserId: user.id,
      action,
      entity: 'staff',
      entityId: member.id,
      data: { key },
    },
  });
  return toDto(await db.staff.findUniqueOrThrow({ where: { id: member.id } }), true);
}

export async function getPortfolio(user: User, shopId: string, staffId: string) {
  const { member, editable } = await access(user, shopId, staffId);
  return toDto(member, editable);
}

/** Stores an uploaded photo (already resized by the app) at the end of the master's portfolio. */
export async function addPortfolioPhoto(
  user: User,
  shopId: string,
  staffId: string,
  upload: Uint8Array,
): Promise<PortfolioDto> {
  const member = await editAccess(user, shopId, staffId);
  const image = cleanImage(upload);
  if (!image) refuse('not_an_image', 'invalid_input');
  // FREE keeps a few photos; the full portfolio is PRO.
  const plan = await shopPlan(shopId);
  const max = planLimits(plan).portfolioPhotos;
  const full = () => (plan === 'FREE' ? refusePlan('portfolio') : refuse('too_many_photos'));
  if (member.portfolio.length >= max) full();

  const key = shopPhotoKey(shopId, randomUUID(), imageExtension[image.type]);
  await media.put(key, image.bytes, imageContentType[image.type]);
  // Appends only while there is room, so two uploads at once can't go past the limit.
  const added = await db.$executeRaw`
    UPDATE staff SET portfolio = array_append(portfolio, ${key}), updated_at = now()
    WHERE id = ${member.id}::uuid AND cardinality(portfolio) < ${max}`;
  if (added === 0) {
    await media.remove(key).catch(() => {});
    full();
  }
  return finish(user, member, 'staff.portfolio.add', key);
}

export async function removePortfolioPhoto(
  user: User,
  shopId: string,
  staffId: string,
  photoId: string,
): Promise<PortfolioDto> {
  const member = await editAccess(user, shopId, staffId);
  const key = member.portfolio.find((k) => photoIdOf(k) === photoId);
  if (!key) throw new AppError('not_found', 'no such photo');
  await db.$executeRaw`
    UPDATE staff SET portfolio = array_remove(portfolio, ${key}), updated_at = now()
    WHERE id = ${member.id}::uuid`;
  // Nothing points at the file any more; if deleting it fails, only an unused file is left.
  await media
    .remove(key)
    .catch((error: unknown) => console.error('photo delete failed', key, error));
  return finish(user, member, 'staff.portfolio.remove', key);
}

/** `order` lists every photo id once; refused if the photos changed meanwhile (another device). */
export async function reorderPortfolio(
  user: User,
  shopId: string,
  staffId: string,
  order: string[],
): Promise<PortfolioDto> {
  const member = await editAccess(user, shopId, staffId);
  const byId = new Map(member.portfolio.map((key) => [photoIdOf(key), key]));
  const keys = order.flatMap((id) => byId.get(id) ?? []);
  if (new Set(order).size !== order.length || keys.length !== member.portfolio.length) {
    refuse('photos_changed');
  }
  const { count } = await db.staff.updateMany({
    where: { id: member.id, portfolio: { equals: member.portfolio } },
    data: { portfolio: keys },
  });
  if (count === 0) refuse('photos_changed');
  return finish(user, member, 'staff.portfolio.reorder', keys[0]!);
}
