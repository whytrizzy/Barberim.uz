'use client';

import {
  BookUser,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ChevronRight,
  CircleCheck,
  Images,
  Scissors,
  Star,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { useSession } from '@/features/auth/use-session';
import { useI18n } from '@/i18n/provider';
import { EnamelSign } from '@/ui/enamel-sign';
import { TileList } from '@/ui/tile-list';
import { PublishCard } from './publish-card';
import { ShopForm } from './shop-form';
import { ShopPhotos } from './shop-photos';
import { useShop } from './use-shop';

/** /staff/new — open a shop. */
export function ShopCreateScreen() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <h1 className="font-sign text-[30px] leading-none font-bold uppercase">
        {t.shop.createTitle}
      </h1>
      <p className="mt-2 mb-5 text-sm text-ink-muted">{t.shop.createIntro}</p>
      <ShopForm
        mode="create"
        onDone={(shop) => router.replace(`/staff/shop/${shop.id}?created=1`)}
      />
    </main>
  );
}

/** /staff/shop/:id — the shop's details, editable by owners and admins. */
export function ShopEditScreen({ shopId, justCreated }: { shopId: string; justCreated: boolean }) {
  const { t } = useI18n();
  const shop = useShop(shopId);
  const [saved, setSaved] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const session = useSession();
  const membership = session.data?.memberships.find((m) => m.shop.id === shopId);
  const role = membership?.role;
  // Masters can see the shop but not change it (the server refuses that too).
  const canEdit = role !== undefined && role !== 'MASTER';

  if (shop.isPending) {
    return <ScreenLoading />;
  }
  if (shop.isError) {
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        error={shop.error}
        onRetry={() => void shop.refetch()}
      />
    );
  }

  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <EnamelSign overline={t.shop.editTitle}>{shop.data.name}</EnamelSign>
      {(justCreated || saved) && (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-tile border border-chrome bg-porcelain px-3 py-2.5 text-sm"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          {saved ? t.shop.saved : t.shop.created}
        </p>
      )}
      <TileList className="mt-5">
        {[
          {
            href: `/staff/shop/${shopId}/calendar` as const,
            label: t.agenda.title,
            Icon: CalendarDays,
          },
          {
            href: `/staff/shop/${shopId}/services` as const,
            label: t.services.title,
            Icon: Scissors,
          },
          { href: `/staff/shop/${shopId}/team` as const, label: t.team.title, Icon: Users },
          {
            href: `/staff/shop/${shopId}/earnings` as const,
            label: t.earnings.title,
            Icon: ChartColumn,
          },
          {
            href: `/staff/shop/${shopId}/clients` as const,
            label: t.clients.title,
            Icon: BookUser,
          },
          { href: `/staff/shop/${shopId}/reviews` as const, label: t.reviews.title, Icon: Star },
          ...(membership
            ? [
                {
                  href: `/staff/shop/${shopId}/team/${membership.staffId}/schedule` as const,
                  label: t.schedule.mine,
                  Icon: CalendarClock,
                },
                {
                  href: `/staff/shop/${shopId}/team/${membership.staffId}/portfolio` as const,
                  label: t.portfolio.mine,
                  Icon: Images,
                },
              ]
            : []),
        ].map(({ href, label, Icon }) => (
          <li key={href} className="bg-porcelain">
            <Link
              href={href}
              className="flex items-center gap-3 px-3 py-3 active:bg-porcelain-sunk"
            >
              <Icon className="size-5 shrink-0 text-enamel-text" aria-hidden />
              <span className="flex-1 text-[15px] font-semibold">{label}</span>
              <ChevronRight className="size-5 text-ink-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </TileList>
      {canEdit && (
        <>
          <PublishCard shop={shop.data} />
          <div className="mt-5">
            <ShopPhotos shopId={shopId} photos={shop.data.photos} />
          </div>
          <div className="mt-6">
            <ShopForm
              // Remount with the saved values after a save — but not when only the photos changed,
              // which would throw away details being typed.
              key={formVersion}
              mode="edit"
              shop={shop.data}
              onDone={() => {
                setSaved(true);
                setFormVersion((n) => n + 1);
              }}
            />
          </div>
        </>
      )}
    </main>
  );
}
