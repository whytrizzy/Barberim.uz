'use client';

import { Repeat } from 'lucide-react';
import Link from 'next/link';
import { LoadError } from '@/features/api/load-states';
import { repeatBookingPath } from '@/features/booking/repeat';
import { ShopCard } from '@/features/shop/discover-screen';
import { formatDayMonth } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import { typedText } from '@/i18n/places';
import { useI18n } from '@/i18n/provider';
import { useMainButton } from '@/telegram/use-main-button';
import type { FavoriteShop } from './schemas';
import { useFavorites } from './use-favorites';

/** Under a saved shop: the last visit, and the same again in one tap. */
function LastVisit({ shop }: { shop: FavoriteShop }) {
  const { t, locale } = useI18n();
  const visit = shop.lastVisit;
  if (!visit) return null;
  const services = visit.serviceNames.map((name) => typedText(name, locale)).join(', ');
  return (
    <Link
      href={repeatBookingPath(shop.slug, visit)}
      className="mt-1 flex min-h-12 items-center gap-2.5 rounded-tile border border-chrome bg-porcelain px-3 py-2 active:bg-porcelain-sunk"
    >
      <Repeat className="size-4 shrink-0 text-enamel-text" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-enamel-text">{t.favorites.repeat}</span>
        <span className="block truncate text-xs text-ink-muted">
          {interpolate(t.favorites.lastVisit, {
            date: formatDayMonth(new Date(visit.startAt), locale),
            master: typedText(visit.masterName, locale),
          })}
          {services && ` · ${services}`}
        </span>
      </span>
    </Link>
  );
}

/** /favorites — shops the person saved. */
export function FavoritesScreen() {
  const { t } = useI18n();
  const query = useFavorites();
  // A list to pick from; no single next step.
  useMainButton(null);

  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <h1 className="mb-4 font-sign text-[30px] leading-none font-bold uppercase">
        {t.favorites.title}
      </h1>
      {query.isPending && (
        <div aria-hidden className="grid gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="h-[102px] rounded-tile bg-porcelain-sunk motion-safe:animate-pulse"
            />
          ))}
        </div>
      )}
      {query.isError && <LoadError error={query.error} onRetry={() => void query.refetch()} />}
      {query.isSuccess &&
        (query.data.shops.length > 0 ? (
          <ul className="grid gap-2">
            {query.data.shops.map((shop) => (
              <ShopCard key={shop.id} shop={shop} footer={<LastVisit shop={shop} />} />
            ))}
          </ul>
        ) : (
          <div className="rounded-tile border border-chrome bg-porcelain-sunk px-3 py-3">
            <p className="text-sm text-ink-muted">{t.favorites.empty}</p>
            <Link
              href="/discover"
              className="mt-1 flex min-h-11 items-center text-sm font-semibold text-enamel-text"
            >
              {t.discover.title}
            </Link>
          </div>
        ))}
    </main>
  );
}
