'use client';

import { CalendarCheck, ChevronRight, Search, Store } from 'lucide-react';
import Link from 'next/link';
import { LoadError } from '@/features/api/load-states';
import { useSession } from '@/features/auth/use-session';
import { useI18n } from '@/i18n/provider';
import { TileList } from '@/ui/tile-list';

/** Home: the barber's way in — their shops, or opening one. Client features join in P1.13+. */
export function HomeActions() {
  const { t } = useI18n();
  const session = useSession();
  if (session.isError) {
    return (
      <LoadError className="mt-6" error={session.error} onRetry={() => void session.refetch()} />
    );
  }
  if (!session.data) return null;
  const shops = session.data.memberships;

  const myBookings = (
    <>
      <li className="bg-porcelain">
        <Link href="/discover" className="flex items-center gap-3 px-3 py-3">
          <Search className="size-5 shrink-0 text-enamel-text" aria-hidden />
          <span className="flex-1 text-[15px] font-semibold">{t.discover.title}</span>
          <ChevronRight className="size-5 text-ink-muted" aria-hidden />
        </Link>
      </li>
      <li className="bg-porcelain">
        <Link href="/bookings" className="flex items-center gap-3 px-3 py-3">
          <CalendarCheck className="size-5 shrink-0 text-enamel-text" aria-hidden />
          <span className="flex-1 text-[15px] font-semibold">{t.myBookings.title}</span>
          <ChevronRight className="size-5 text-ink-muted" aria-hidden />
        </Link>
      </li>
    </>
  );

  if (shops.length === 0) {
    return (
      <>
        <TileList className="mt-6">{myBookings}</TileList>
        <Link
          href="/staff/new"
          className="mt-3 flex items-center gap-3 rounded-tile border border-chrome bg-porcelain px-3 py-3"
        >
          <Store className="size-5 shrink-0 text-enamel-text" aria-hidden />
          <span className="flex-1 text-[15px] font-semibold">{t.shop.openShopCta}</span>
          <ChevronRight className="size-5 text-ink-muted" aria-hidden />
        </Link>
      </>
    );
  }

  return (
    <TileList className="mt-6">
      {myBookings}
      {shops.map((m) => (
        <li key={m.staffId} className="bg-porcelain">
          <Link href={`/staff/shop/${m.shop.id}`} className="flex items-center gap-3 px-3 py-3">
            <Store className="size-5 shrink-0 text-enamel-text" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-ink-muted">{t.shop.myShop}</span>
              <span className="block truncate text-[15px] font-semibold">{m.shop.name}</span>
            </span>
            <ChevronRight className="size-5 text-ink-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </TileList>
  );
}
