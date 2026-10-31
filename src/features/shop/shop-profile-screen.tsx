'use client';

import { MapPin, Navigation } from 'lucide-react';
import { yandexMapsLink, yandexRouteLink } from '@/domain/places';
import { regions } from '@/domain/places';
import { formatMinuteOfDay } from '@/domain/time';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { SERVICE_CATEGORIES } from '@/features/services/schemas';
import { formatDuration, formatMoney } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import { districtName, placeName } from '@/i18n/places';
import { useI18n } from '@/i18n/provider';
import { latinToCyrillic } from '@/i18n/translit';
import { openExternal } from '@/telegram/links';
import { Button } from '@/ui/button';
import { EnamelSign } from '@/ui/enamel-sign';
import { SectionLabel } from '@/ui/section-label';
import { TileList } from '@/ui/tile-list';
import type { ShopProfileDto } from './schemas';
import { useShopProfile } from './use-shop-profile';

/** How many free times fit the strip before it would stop being a glance. */
const STRIP_TIMES = 12;

function TodayStrip({ today }: { today: ShopProfileDto['today'] }) {
  const { t } = useI18n();
  const shown = today.freeStarts.slice(0, STRIP_TIMES);
  return (
    <section className="mt-5">
      <SectionLabel className="mt-0">{t.shopProfile.todayTitle}</SectionLabel>
      {shown.length > 0 ? (
        <ul className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {shown.map((minute) => (
            <li
              key={minute}
              className="shrink-0 rounded-tile border border-chrome bg-porcelain px-3 py-2 text-[15px] font-semibold tabular-nums"
            >
              {formatMinuteOfDay(minute)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-tile border border-chrome bg-porcelain-sunk px-3 py-3 text-sm text-ink-muted">
          {today.status === 'full' ? t.shopProfile.todayFull : t.shopProfile.todayClosed}
        </p>
      )}
    </section>
  );
}

/** /shop/:slug — where a shop's link lands. */
export function ShopProfileScreen({ slug }: { slug: string }) {
  const { t, locale } = useI18n();
  const query = useShopProfile(slug);

  if (query.isPending) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">{t.common.loading}</p>;
  }
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <p role="alert" className="px-4 pt-6 text-sm text-enamel-text">
        {missing ? t.shopProfile.notFound : errorText(t, query.error)}
      </p>
    );
  }

  const shop = query.data;
  // Names are as the barber typed them; Cyrillic readers get them transliterated.
  const typed = (text: string) => (locale === 'uz-Cyrl' ? latinToCyrillic(text) : text);
  const region = regions.find((candidate) => candidate.key === shop.region);
  const area = [districtName(shop.district, locale), region && placeName(region, locale)]
    .filter(Boolean)
    .join(', ');

  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <EnamelSign overline={area}>{typed(shop.name)}</EnamelSign>
      {shop.isPreview && (
        <p
          role="status"
          className="mt-3 rounded-tile border border-chrome bg-porcelain px-3 py-2.5 text-sm"
        >
          {t.shopProfile.preview}
        </p>
      )}

      {shop.photos.length > 0 && (
        <ul className="-mx-4 mt-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
          {shop.photos.map((photo, index) => (
            <li key={photo.id} className="w-[82%] shrink-0 snap-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- already sized, served by the CDN */}
              <img
                src={photo.url}
                alt={interpolate(t.shop.photoAlt, { number: index + 1 })}
                className="aspect-[4/3] w-full rounded-tile border border-chrome bg-porcelain-sunk object-cover"
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
            </li>
          ))}
        </ul>
      )}

      {!shop.isPreview && <TodayStrip today={shop.today} />}

      {SERVICE_CATEGORIES.map((category) => {
        const inCategory = shop.services.filter((service) => service.category === category);
        if (inCategory.length === 0) return null;
        return (
          <section key={category} className="mt-5">
            <SectionLabel className="mt-0">{t.services.categories[category]}</SectionLabel>
            <TileList>
              {inCategory.map((service) => {
                const price = formatMoney(service.price, locale);
                return (
                  <li
                    key={service.id}
                    className="flex min-h-14 items-center gap-2.5 bg-porcelain px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] leading-tight font-semibold">
                        {typed(service.name)}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {formatDuration(service.durationMin, locale)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                      {service.priceIsFrom ? interpolate(t.services.fromPrice, { price }) : price}
                    </span>
                  </li>
                );
              })}
            </TileList>
          </section>
        );
      })}

      {shop.masters.length > 0 && (
        <section className="mt-5">
          <SectionLabel className="mt-0">{t.shopProfile.masters}</SectionLabel>
          <TileList>
            {shop.masters.map((master) => (
              <li key={master.id} className="bg-porcelain px-3 py-2.5">
                <span className="block text-[15px] font-semibold">{typed(master.name)}</span>
                {master.bio && (
                  <span className="block text-xs text-ink-muted">{typed(master.bio)}</span>
                )}
              </li>
            ))}
          </TileList>
        </section>
      )}

      <section className="mt-5">
        <SectionLabel className="mt-0">{t.shop.address}</SectionLabel>
        <p className="text-[15px] font-semibold">{typed(shop.address)}</p>
        {shop.landmark && (
          <p className="text-sm text-ink-muted">
            {t.shop.landmark}: {typed(shop.landmark)}
          </p>
        )}
        {shop.location && (
          <div className="mt-3 flex gap-2">
            <Button
              className="flex-1"
              variant="secondary"
              onClick={() => openExternal(yandexRouteLink(shop.location!))}
            >
              <Navigation className="size-4" aria-hidden />
              {t.shopProfile.route}
            </Button>
            <Button
              className="flex-1"
              variant="secondary"
              onClick={() => openExternal(yandexMapsLink(shop.location!))}
            >
              <MapPin className="size-4" aria-hidden />
              {t.shopProfile.onMap}
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
