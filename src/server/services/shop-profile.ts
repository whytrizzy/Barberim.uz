import 'server-only';
import { dayAvailability } from '@/domain/availability';
import { combineMasters, type MasterDay } from '@/domain/combine';
import { checkSlug } from '@/domain/slug';
import { tashkentDate } from '@/domain/time';
import type {
  PublishRefusal,
  ShopDto,
  ShopProfileDto,
  ShopStatusRequest,
} from '@/features/shop/schemas';
import type { User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { photoDtos } from '../storage/media';
import { dayInput, loadSchedule } from './availability';
import { shopDepositInfo } from './deposits';
import { isFavorite } from './favorites';
import { latestReviews, ratingSummary } from './reviews';
import { toShopDto } from './shop';

const canTakeClients = { isActive: true, isBookable: true } as const;

/**
 * Free times today across all masters, each using their shortest service: "could someone get a
 * haircut at 15:00?" The real check happens when a client chooses their services.
 */
async function todayAtShop(
  masters: { id: string; sortOrder: number; shortestMin: number }[],
  now: Date,
): Promise<ShopProfileDto['today']> {
  const today = tashkentDate(now);
  const days: MasterDay[] = await Promise.all(
    masters.map(async (master) => {
      const schedule = await loadSchedule(master.id, today, 1);
      return {
        staffId: master.id,
        sortOrder: master.sortOrder,
        load: 0,
        availability: dayAvailability(dayInput(schedule, today, master.shortestMin, now)),
      };
    }),
  );
  const combined = combineMasters(days);
  return {
    status: combined.status,
    freeStarts: combined.slots
      .filter((slot) => slot.state === 'available')
      .map((slot) => slot.startMin),
  };
}

/** The page behind a shop's link. Anyone sees a live shop; only its staff see it before that. */
export async function getShopProfile(
  user: User,
  slug: string,
  now = new Date(),
): Promise<ShopProfileDto> {
  const shop = checkSlug(slug) === null ? await db.shop.findUnique({ where: { slug } }) : null;
  if (!shop) throw new AppError('not_found', 'no such shop');
  const isPreview = shop.status !== 'ACTIVE';
  if (isPreview)
    await requireStaff(user.id, shop.id).catch(() => {
      throw new AppError('not_found', 'no such shop');
    });

  const [services, staff] = await Promise.all([
    db.service.findMany({
      where: { shopId: shop.id, isActive: true, staff: { some: { staff: canTakeClients } } },
      select: {
        id: true,
        name: true,
        category: true,
        durationMin: true,
        price: true,
        priceIsFrom: true,
        maxPeople: true,
        bookAheadDays: true,
        depositAmount: true,
        staff: { where: { staff: canTakeClients }, select: { staffId: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    db.staff.findMany({
      where: {
        shopId: shop.id,
        ...canTakeClients,
        services: { some: { service: { isActive: true } } },
      },
      select: {
        id: true,
        displayName: true,
        bio: true,
        portfolio: true,
        requiresDeposit: true,
        sortOrder: true,
        services: {
          where: { service: { isActive: true } },
          select: { durationOverride: true, service: { select: { durationMin: true } } },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const { photos } = toShopDto(shop);
  const [rating, reviews, saved, deposit] = await Promise.all([
    ratingSummary(shop.id),
    latestReviews(shop.id),
    isFavorite(user, shop.id),
    isPreview ? null : shopDepositInfo(shop.id, shop.settings, user.id),
  ]);
  return {
    deposit,
    isFavorite: saved,
    rating,
    reviews,
    id: shop.id,
    slug: shop.slug,
    name: shop.name,
    isPreview,
    region: shop.region,
    district: shop.district,
    address: shop.address,
    landmark: shop.landmark,
    location: shop.lat !== null && shop.lng !== null ? { lat: shop.lat, lng: shop.lng } : null,
    photos,
    services: services.map(({ staff: links, ...service }) => ({
      ...service,
      staffIds: links.map((link) => link.staffId),
    })),
    masters: staff.map((master) => ({
      id: master.id,
      name: master.displayName,
      bio: master.bio,
      portfolio: photoDtos(master.portfolio),
      requiresDeposit: master.requiresDeposit,
    })),
    // A shop that isn't live can't be booked, so it has no free times to show.
    today: isPreview
      ? { status: 'closed', freeStarts: [] }
      : await todayAtShop(
          staff.map((master) => ({
            id: master.id,
            sortOrder: master.sortOrder,
            shortestMin: Math.min(
              ...master.services.map((s) => s.durationOverride ?? s.service.durationMin),
            ),
          })),
          now,
        ),
  };
}

function refuse(reason: PublishRefusal): never {
  throw new AppError('conflict', reason, { reason });
}

/**
 * Owners and admins put the shop live or take it down. Going live needs someone who can actually
 * be booked: a master with a service and working hours. Existing bookings aren't touched by either.
 */
export async function setShopStatus(
  user: User,
  shopId: string,
  { status }: ShopStatusRequest,
): Promise<ShopDto> {
  await requireStaff(user.id, shopId, ['OWNER', 'ADMIN']);
  const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } });
  if (shop.status === 'SUSPENDED') refuse('suspended');

  if (status === 'ACTIVE') {
    const withService = {
      shopId,
      ...canTakeClients,
      services: { some: { service: { isActive: true } } },
    };
    if ((await db.staff.count({ where: withService })) === 0) refuse('no_services');
    const ready = await db.staff.count({ where: { ...withService, hours: { some: {} } } });
    if (ready === 0) refuse('no_hours');
  }

  const updated = await db.shop.update({ where: { id: shopId }, data: { status } });
  await db.auditLog.create({
    data: {
      shopId,
      actorUserId: user.id,
      action: status === 'ACTIVE' ? 'shop.publish' : 'shop.unpublish',
      entity: 'shop',
      entityId: shopId,
    },
  });
  return toShopDto(updated);
}
