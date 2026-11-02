'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Clock, LoaderCircle, LocateFixed, Search, Store } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { regions, type Coordinates } from '@/domain/places';
import { formatMinuteOfDay } from '@/domain/time';
import { api } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { formatMoney } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import { districtName, districtOptions, placeName, regionOptions, typedText } from '@/i18n/places';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { haptic } from '@/telegram/haptics';
import { requestLocation } from '@/telegram/location';
import { Select } from '@/ui/select';
import { TextField } from '@/ui/text-field';
import { discoverResultSchema, type DiscoveredShop, type DiscoverRequest } from './schemas';
import { useDebounced } from './use-shop';

const PRICE_LIMITS = [50_000, 100_000, 200_000];

function formatKm(km: number): string {
  return km < 10 ? km.toFixed(1) : String(Math.round(km));
}

function ShopCard({ shop }: { shop: DiscoveredShop }) {
  const { t, locale } = useI18n();
  const region = regions.find((candidate) => candidate.key === shop.region);
  const area = [districtName(shop.district, locale), region && placeName(region, locale)]
    .filter(Boolean)
    .join(', ');
  return (
    <li>
      <Link
        href={`/shop/${shop.slug}`}
        className="flex gap-3 rounded-tile border border-chrome bg-porcelain p-2.5 active:bg-porcelain-sunk"
      >
        {shop.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- already sized, served by the CDN
          <img
            src={shop.coverUrl}
            alt=""
            className="size-20 shrink-0 rounded-[5px] bg-porcelain-sunk object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="grid size-20 shrink-0 place-items-center rounded-[5px] bg-porcelain-sunk text-ink-faint">
            <Store className="size-7" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-tight font-semibold">
            {typedText(shop.name, locale)}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-muted">
            {shop.distanceKm !== null &&
              `${interpolate(t.discover.km, { km: formatKm(shop.distanceKm) })} · `}
            {area}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-muted">
            {typedText(shop.landmark ?? shop.address, locale)}
          </span>
          <span className="mt-1 flex items-center justify-between gap-2 text-[13px] font-semibold tabular-nums">
            <span className="truncate">
              {interpolate(t.services.fromPrice, { price: formatMoney(shop.fromPrice, locale) })}
            </span>
            {shop.nextFreeToday !== null ? (
              <span className="flex shrink-0 items-center gap-1 text-success">
                <Clock className="size-3.5" aria-hidden />
                {formatMinuteOfDay(shop.nextFreeToday)}
              </span>
            ) : (
              <span className="shrink-0 font-normal text-ink-muted">{t.discover.noneToday}</span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Toggle({
  on,
  busy,
  onClick,
  children,
}: {
  on: boolean;
  busy?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-tile border px-2 text-sm font-semibold',
        'transition-colors duration-150 ease-snappy',
        on
          ? 'border-pick bg-pick text-on-pick'
          : 'border-chrome bg-porcelain active:bg-porcelain-sunk',
      )}
    >
      {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** /discover — find a barbershop. */
export function DiscoverScreen() {
  const { t, locale } = useI18n();
  const [text, setText] = useState('');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [freeToday, setFreeToday] = useState(false);
  const [near, setNear] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const query = useDebounced(text.trim(), 300);

  const request: DiscoverRequest = {
    query: query || undefined,
    region: region || undefined,
    district: district || undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    freeToday: freeToday || undefined,
    near: near ?? undefined,
  };
  const results = useQuery({
    queryKey: ['discover', request],
    queryFn: ({ signal }) =>
      api('/api/shops/discover', {
        method: 'POST',
        body: request,
        schema: discoverResultSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  async function toggleNear() {
    setLocationNote(null);
    if (near) {
      haptic.selection();
      setNear(null);
      return;
    }
    setLocating(true);
    const result = await requestLocation();
    setLocating(false);
    if (result.status === 'ok') {
      haptic.notify('success');
      setNear({ lat: result.lat, lng: result.lng });
    } else {
      haptic.notify('error');
      setLocationNote(
        result.status === 'denied' ? t.discover.locationDenied : t.discover.locationFailed,
      );
    }
  }

  const shops = results.data?.shops ?? [];
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <h1 className="mb-4 font-sign text-[30px] leading-none font-bold uppercase">
        {t.discover.title}
      </h1>
      <div className="grid gap-3">
        <TextField
          label={t.discover.searchLabel}
          prefix={<Search className="size-4" />}
          placeholder={t.discover.searchPlaceholder}
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={60}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex gap-2">
          <Toggle
            on={freeToday}
            onClick={() => {
              haptic.selection();
              setFreeToday(!freeToday);
            }}
          >
            <Clock className="size-4" aria-hidden />
            {t.discover.freeToday}
          </Toggle>
          <Toggle on={near !== null} busy={locating} onClick={() => void toggleNear()}>
            {!locating && <LocateFixed className="size-4" aria-hidden />}
            {t.discover.nearMe}
          </Toggle>
        </div>
        {locationNote && (
          <p role="alert" className="text-sm text-enamel-text">
            {locationNote}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t.shop.region}
            options={[{ value: '', label: t.discover.all }, ...regionOptions(locale)]}
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setDistrict('');
            }}
          />
          <Select
            label={t.discover.price}
            options={[
              { value: '', label: t.discover.anyPrice },
              ...PRICE_LIMITS.map((limit) => ({
                value: String(limit),
                label: interpolate(t.discover.upTo, { price: formatMoney(limit, locale) }),
              })),
            ]}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </div>
        {region === 'tashkent-city' && (
          <Select
            label={t.shop.district}
            options={[{ value: '', label: t.discover.all }, ...districtOptions(locale)]}
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          />
        )}
      </div>

      {results.isPending && (
        <div aria-hidden className="mt-4 grid gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="h-[102px] rounded-tile bg-porcelain-sunk motion-safe:animate-pulse"
            />
          ))}
        </div>
      )}
      {results.isError && (
        <p role="alert" className="mt-4 text-sm text-enamel-text">
          {errorText(t, results.error)}
        </p>
      )}
      {results.isSuccess &&
        (shops.length > 0 ? (
          <ul className={cn('mt-4 grid gap-2', results.isPlaceholderData && 'opacity-60')}>
            {shops.map((shop) => (
              <ShopCard key={shop.id} shop={shop} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-tile border border-chrome bg-porcelain-sunk px-3 py-3 text-sm text-ink-muted">
            {t.discover.empty}
          </p>
        ))}
    </main>
  );
}
