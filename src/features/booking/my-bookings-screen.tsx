'use client';

import Link from 'next/link';
import { useState } from 'react';
import { errorText } from '@/features/api/error-text';
import { formatDayMonth, formatMoney, formatTime } from '@/i18n/format';
import { typedText } from '@/i18n/places';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { Tile, TileGroup } from '@/ui/tile-group';
import { TileList } from '@/ui/tile-list';
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
        <p role="alert" className="mt-4 text-sm text-enamel-text">
          {errorText(t, query.error)}
        </p>
      )}
      {query.isSuccess &&
        (list.length > 0 ? (
          <TileList className="mt-4">
            {list.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </TileList>
        ) : (
          <p className="mt-4 rounded-tile border border-chrome bg-porcelain-sunk px-3 py-3 text-sm text-ink-muted">
            {tab === 'upcoming' ? t.myBookings.noUpcoming : t.myBookings.noPast}
          </p>
        ))}
    </main>
  );
}
