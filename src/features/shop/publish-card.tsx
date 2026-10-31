'use client';

import Link from 'next/link';
import { clientEnv } from '@/env/client';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import type { Messages } from '@/i18n/messages';
import { useI18n } from '@/i18n/provider';
import { confirmAction } from '@/telegram/confirm';
import { haptic } from '@/telegram/haptics';
import { shareViaTelegram } from '@/telegram/links';
import { Button } from '@/ui/button';
import type { ShopDto } from './schemas';
import { useShopStatus } from './use-shop-profile';

function statusError(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const reason = (error.details as { reason?: string } | undefined)?.reason;
    if (reason === 'no_services') return t.shopProfile.needServices;
    if (reason === 'no_hours') return t.shopProfile.needHours;
    if (reason === 'suspended') return t.shopProfile.suspended;
  }
  return errorText(t, error);
}

/** Whether clients can see the shop: put it live, share its link, or take it down. */
export function PublishCard({ shop }: { shop: ShopDto }) {
  const { t } = useI18n();
  const status = useShopStatus(shop.id);
  const live = shop.status === 'ACTIVE';
  const bot = clientEnv.NEXT_PUBLIC_BOT_USERNAME ?? 'barberim_bot';
  const link = `https://t.me/${bot}?start=shop_${shop.slug}`;

  function change(next: 'ACTIVE' | 'DRAFT') {
    status.mutate(
      { status: next },
      {
        onSuccess: () => haptic.notify('success'),
        onError: () => haptic.notify('error'),
      },
    );
  }

  return (
    <section className="mt-5 grid gap-3 rounded-tile border border-chrome bg-porcelain p-3">
      <div>
        <h2 className="text-[15px] font-semibold">
          {live ? t.shopProfile.liveTitle : t.shopProfile.draftTitle}
        </h2>
        <p className="text-sm text-ink-muted">
          {live ? t.shopProfile.liveHint : t.shopProfile.draftHint}
        </p>
      </div>
      {live ? (
        <Button onClick={() => shareViaTelegram(link, t.shopProfile.shareMessage)}>
          {t.shopProfile.share}
        </Button>
      ) : (
        <Button
          loading={status.isPending}
          disabled={shop.status === 'SUSPENDED'}
          onClick={() => change('ACTIVE')}
        >
          {t.shopProfile.publish}
        </Button>
      )}
      <Link
        href={`/shop/${shop.slug}`}
        className="flex min-h-11 items-center justify-center text-sm font-semibold text-enamel-text"
      >
        {t.shopProfile.viewAsClient}
      </Link>
      {live && (
        <Button
          variant="ghost"
          loading={status.isPending}
          onClick={() => {
            void confirmAction(t.shopProfile.unpublishConfirm).then((ok) => {
              if (ok) change('DRAFT');
            });
          }}
        >
          {t.shopProfile.unpublish}
        </Button>
      )}
      {status.error && (
        <p role="alert" className="text-sm text-enamel-text">
          {statusError(t, status.error)}
        </p>
      )}
    </section>
  );
}
