import 'server-only';
import { dayAvailability, type DayOverride } from '@/domain/availability';
import { combineMasters } from '@/domain/combine';
import { distanceKm } from '@/domain/places';
import { startOfTashkentDay, tashkentDate } from '@/domain/time';
import {
  parseShopSettings,
  type DiscoveredShop,
  type DiscoverRequest,
  type DiscoverResult,
} from '@/features/shop/schemas';
import type { Prisma } from '@/generated/prisma/client';
import { cyrillicToLatin, latinToCyrillic } from '@/i18n/translit';
import { db } from '../db/client';
import { dbDate } from './availability';
import { ratingSummaries } from './reviews';
import { media, photoIdOf } from '../storage/media';

/** Shops looked at for free times and distance; more than a city's worth after filtering. */
const MAX_CANDIDATES = 200;
const MAX_RESULTS = 40;
const DAY_MS = 86_400_000;

const canTakeClients = { isActive: true, isBookable: true } as const;
const liveService = { isActive: true, staff: { some: { staff: canTakeClients } } };

/**
 * What was typed in every spelling a shop could be stored under: names may be in either script,
 * and oʻ / gʻ are typed with whichever apostrophe the keyboard has.
 */
function spellings(query: string): string[] {
  const fixedApostrophe = query.replace(/([oOgG])['‘’`]/g, '$1ʻ');
  return [...new Set([query, fixedApostrophe, latinToCyrillic(query), cyrillicToLatin(query)])];
}

function textFilter(query: string): Prisma.ShopWhereInput {
  return {
    OR: spellings(query).flatMap((text) => [
      { name: { contains: text, mode: 'insensitive' as const } },
      { address: { contains: text, mode: 'insensitive' as const } },
      { landmark: { contains: text, mode: 'insensitive' as const } },
    ]),
  };
}

/** Live shops that can actually be booked, matching the search. */
export async function discoverShops(
  input: DiscoverRequest,
  now = new Date(),
): Promise<DiscoverResult> {
  const today = tashkentDate(now);
  const dayStart = startOfTashkentDay(today);

  const candidates = await db.shop.findMany({
    where: {
      status: 'ACTIVE',
      staff: { some: { ...canTakeClients, services: { some: { service: { isActive: true } } } } },
      ...(input.region && { region: input.region }),
      ...(input.district && { district: { equals: input.district, mode: 'insensitive' } }),
      ...(input.query && textFilter(input.query)),
      services: {
        some: {
          ...liveService,
          ...(input.maxPrice !== undefined && { price: { lte: input.maxPrice } }),
        },
      },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      region: true,
      district: true,
      address: true,
      landmark: true,
      lat: true,
      lng: true,
      photos: true,
      settings: true,
      services: { where: liveService, select: { price: true } },
      staff: {
        where: { ...canTakeClients, services: { some: { service: { isActive: true } } } },
        select: {
          id: true,
          sortOrder: true,
          hours: { select: { weekday: true, startMin: true, endMin: true } },
          overrides: {
            where: { date: dbDate(today) },
            select: { type: true, startMin: true, endMin: true },
          },
          services: {
            where: { service: { isActive: true } },
            select: { durationOverride: true, service: { select: { durationMin: true } } },
          },
          bookings: {
            where: {
              status: { notIn: ['CANCELLED_CLIENT', 'CANCELLED_SHOP'] },
              startAt: { lt: new Date(dayStart.getTime() + 2 * DAY_MS) },
              endAt: { gt: new Date(dayStart.getTime() - DAY_MS) },
            },
            select: { startAt: true, endAt: true },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
    take: MAX_CANDIDATES,
  });

  const ratings = await ratingSummaries(candidates.map((shop) => shop.id));

  const shops = candidates.map((shop): DiscoveredShop => {
    const rules = parseShopSettings(shop.settings);
    const day = combineMasters(
      shop.staff.map((master) => ({
        staffId: master.id,
        sortOrder: master.sortOrder,
        load: 0,
        availability: dayAvailability({
          date: today,
          weekly: master.hours,
          overrides: master.overrides.map((o): DayOverride =>
            o.type === 'DAY_OFF'
              ? { type: 'DAY_OFF' }
              : { type: 'CUSTOM_HOURS', startMin: o.startMin ?? 0, endMin: o.endMin ?? 0 },
          ),
          busy: master.bookings,
          // The quickest thing they do: "could someone still get in today?"
          durationMin: Math.min(
            ...master.services.map((s) => s.durationOverride ?? s.service.durationMin),
          ),
          rules,
          now,
        }),
      })),
    );
    const cover = shop.photos.find((key) => photoIdOf(key));
    const location =
      shop.lat !== null && shop.lng !== null ? { lat: shop.lat, lng: shop.lng } : null;
    return {
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      region: shop.region,
      district: shop.district,
      address: shop.address,
      landmark: shop.landmark,
      coverUrl: cover ? media.url(cover) : null,
      fromPrice: Math.min(...shop.services.map((service) => service.price)),
      rating: ratings.get(shop.id) ?? { average: null, count: 0 },
      nextFreeToday: day.slots.find((slot) => slot.state === 'available')?.startMin ?? null,
      distanceKm: input.near && location ? distanceKm(input.near, location) : null,
    };
  });

  const matching = input.freeToday ? shops.filter((s) => s.nextFreeToday !== null) : shops;
  const sorted = [...matching].sort((a, b) =>
    input.near
      ? // Closest first; shops that haven't set a location go last.
        (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
      : // Somewhere you can get into today first.
        Number(b.nextFreeToday !== null) - Number(a.nextFreeToday !== null),
  );
  return { shops: sorted.slice(0, MAX_RESULTS) };
}
