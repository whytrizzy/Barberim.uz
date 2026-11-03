'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { dateOf } from '@/features/booking/slot-picker';
import { formatDayMonth, formatWeekday } from '@/i18n/format';
import { typedText } from '@/i18n/places';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { SectionLabel } from '@/ui/section-label';
import { TileList } from '@/ui/tile-list';
import type { WaitlistEntryDto } from './schemas';
import { useLeaveWaitlist, useWaitlist } from './use-waitlist';

function bookPath(entry: WaitlistEntryDto): Route {
  const query = new URLSearchParams({ date: entry.date, services: entry.serviceIds.join(',') });
  if (entry.staffId) query.set('master', entry.staffId);
  return `/shop/${entry.shopSlug}/book?${query.toString()}` as Route;
}

/** On My bookings: the days the person is waiting for; nothing when there are none. */
export function MyWaitlist() {
  const { t, locale } = useI18n();
  const query = useWaitlist();
  const leave = useLeaveWaitlist();
  const entries = query.data?.entries ?? [];
  if (entries.length === 0) return null;

  return (
    <section className="mt-5">
      <SectionLabel className="mt-0">{t.waitlist.title}</SectionLabel>
      <TileList>
        {entries.map((entry) => {
          const day = dateOf(entry.date);
          const who = entry.masterName ? typedText(entry.masterName, locale) : t.waitlist.anyMaster;
          const services = entry.serviceNames.map((name) => typedText(name, locale)).join(', ');
          return (
            <li key={entry.id} className="flex items-center bg-porcelain">
              <Link
                href={bookPath(entry)}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2.5 active:bg-porcelain-sunk"
              >
                <span className="min-w-16 shrink-0 whitespace-nowrap tabular-nums">
                  <span className="block text-[15px] leading-tight font-semibold">
                    {formatDayMonth(day, locale)}
                  </span>
                  <span className="block text-xs leading-tight text-ink-muted">
                    {formatWeekday(day, locale, true)}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] leading-tight font-semibold">
                    {typedText(entry.shopName, locale)}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {who}
                    {services && ` · ${services}`}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                aria-label={t.waitlist.leave}
                disabled={leave.isPending}
                onClick={() => {
                  haptic.selection();
                  leave.mutate(entry.id);
                }}
                className="grid size-12 shrink-0 place-items-center text-ink-muted focus-visible:ring-2 focus-visible:ring-pick focus-visible:ring-inset active:bg-porcelain-sunk disabled:opacity-50"
              >
                <X className="size-5" aria-hidden />
              </button>
            </li>
          );
        })}
      </TileList>
    </section>
  );
}
