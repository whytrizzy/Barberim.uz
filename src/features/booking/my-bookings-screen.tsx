'use client';

import { ChevronRight, Repeat } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { LoadError } from '@/features/api/load-states';
import { formatDayMonth, formatMoney, formatTime } from '@/i18n/format';
import { typedText } from '@/i18n/places';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { Tile, TileGroup } from '@/ui/tile-group';
import { TileList } from '@/ui/tile-list';
import { repeatBookingPath } from './repeat';
import type { MyBookingDto } from './schemas';
import { useMyBookings } from './use-my-bookings';

function BookingRow({ booking }: { booking: MyBookingDto }) {
  const { t, locale } = useI18n();
  const start = new Date(booking.startAt);
  const services = booking.items.map((item) => typedText(item.name, locale)).join(', ');
  return (
    <li className="bg-porcelain">
      <Link
        href={`/booking/${booking.id}`}
        className="flex min-h-16 items-center gap-3 px-3 py-2.5 active:bg-porcelain-sunk"
      >
        <span className="w-16 shrink-0 tabular-nums">
          <span className="block text-[15px] leading-tight font-semibold">{formatTime(start)}</span>
          <span className="block text-xs leading-tight text-ink-muted">
            {formatDayMonth(start, locale)}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-tight font-semibold">
            {typedText(booking.shop.name, locale)}
          </span>
          <span className="block truncate text-xs text-ink-muted">{services}</span>
          <span className="block truncate text-xs text-ink-muted">
            {t.myBookings.status[booking.status]}
          </span>
        </span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums">
          {formatMoney(booking.totalPrice, locale)}
        </span>
      </Link>
    </li>
  );
}

/** Nothing coming up: the last finished visit, booked the same again in one tap. */
function RepeatLast({ past }: { past: MyBookingDto[] }) {
  const { t, locale } = useI18n();
  const last = past.find((booking) => booking.status === 'COMPLETED');
  if (!last) return null;
  const services = last.items.map((item) => typedText(item.name, locale)).join(', ');
  return (
    <Link
      href={repeatBookingPath(last.shop.slug, last)}
      className="mt-3 flex min-h-14 items-center gap-3 rounded-tile border border-chrome bg-porcelain px-3 py-2.5 active:bg-porcelain-sunk"
    >
      <Repeat className="size-5 shrink-0 text-enamel-text" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{t.myBookings.repeatLast}</span>
        <span className="block truncate text-xs text-ink-muted">
          {typedText(last.shop.name, locale)} · {typedText(last.masterName, locale)}
          {services && ` · ${services}`}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
    </Link>
  );
}

/** /bookings — the person's own bookings, at any shop. */
export function MyBookingsScreen() {
  const { t } = useI18n();
  const query = useMyBookings();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const list = query.data?.[tab] ?? [];

  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <h1 className="mb-4 font-sign text-[30px] leading-none font-bold uppercase">
        {t.myBookings.title}
      </h1>
      <TileGroup label={t.myBookings.title} columns={3} className="grid-cols-2">
        {(
          [
            ['upcoming', t.myBookings.upcoming],
            ['past', t.myBookings.past],
          ] as const
        ).map(([value, label]) => (
          <Tile
            key={value}
            selected={tab === value}
            className="text-sm font-semibold"
            onClick={() => {
              haptic.selection();
              setTab(value);
            }}
          >
            {label}
          </Tile>
        ))}
      </TileGroup>

      {query.isPending && (
        <div aria-hidden className="mt-4 grid gap-px">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-16 bg-porcelain-sunk motion-safe:animate-pulse" />
          ))}
        </div>
      )}
      {query.isError && (
        <LoadError className="mt-4" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.isSuccess &&
        (list.length > 0 ? (
          <TileList className="mt-4">
            {list.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </TileList>
        ) : (
          <div className="mt-4 rounded-tile border border-chrome bg-porcelain-sunk px-3 py-3">
            <p className="text-sm text-ink-muted">
              {tab === 'upcoming' ? t.myBookings.noUpcoming : t.myBookings.noPast}
            </p>
            {tab === 'upcoming' && (
              <Link
                href="/discover"
                className="mt-1 flex min-h-11 items-center text-sm font-semibold text-enamel-text"
              >
                {t.discover.title}
              </Link>
            )}
          </div>
        ))}
      {query.isSuccess && tab === 'upcoming' && list.length === 0 && (
        <RepeatLast past={query.data.past} />
      )}
    </main>
  );
}
