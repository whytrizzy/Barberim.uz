'use client';

import { Check } from 'lucide-react';
import { useBilling, useCheckout } from '@/features/billing/use-billing';
import type { PaymentProviderName } from '@/features/billing/schemas';
import { errorText } from '@/features/api/error-text';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { formatDayMonth, formatMoney } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { haptic } from '@/telegram/haptics';
import { openExternal } from '@/telegram/links';
import { useMainButton } from '@/telegram/use-main-button';
import { Button } from '@/ui/button';
import { EnamelSign } from '@/ui/enamel-sign';
import { SectionLabel } from '@/ui/section-label';
import { TileList } from '@/ui/tile-list';

const PROVIDER_NAMES: Record<PaymentProviderName | 'UZUM', string> = {
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
};

function PlanCard({
  title,
  items,
  current,
}: {
  title: string;
  items: readonly string[];
  current: boolean;
}) {
  return (
    <section
      className={cn(
        'mt-4 rounded-tile border bg-porcelain px-3 py-3',
        current ? 'border-enamel-text' : 'border-chrome',
      )}
    >
      <h2 className="font-sign text-[22px] leading-none font-bold uppercase">{title}</h2>
      <ul className="mt-2.5 grid gap-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-[15px]">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** /staff/shop/:id/plan — FREE and PRO, the shop's paid time, and paying for a month of PRO. */
export function PlanScreen({ shopId }: { shopId: string }) {
  const { t, locale } = useI18n();
  const billing = useBilling(shopId);
  const checkout = useCheckout(shopId);
  // Each provider has its own button; neither is the one obvious next step.
  useMainButton(null);

  if (billing.isPending) return <ScreenLoading />;
  if (billing.isError) {
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        error={billing.error}
        onRetry={() => void billing.refetch()}
      />
    );
  }
  const data = billing.data;
  const name = data.plan === 'PRO' ? t.plans.proTitle : t.plans.freeTitle;
  const pay = (provider: PaymentProviderName) => {
    haptic.selection();
    checkout.mutate(provider, {
      // The provider's page opens outside Telegram; its receipt comes back as a bot message.
      onSuccess: ({ url }) => openExternal(url),
      onError: () => haptic.notify('error'),
    });
  };

  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <EnamelSign overline={t.plans.title}>{name}</EnamelSign>
      <p className="mt-3 text-[15px] font-semibold">
        {interpolate(t.plans.current, { plan: name })}
      </p>
      {data.planUntil && (
        <p className="text-sm text-ink-muted">
          {interpolate(t.plans.paidUntil, {
            date: formatDayMonth(new Date(data.planUntil), locale),
          })}
        </p>
      )}
      {!data.enforced && data.plan === 'PRO' && (
        <p className="mt-1 text-sm text-ink-muted">{t.plans.everyonePro}</p>
      )}

      {data.providers.length > 0 ? (
        <section className="mt-4 grid gap-2 rounded-tile border border-chrome bg-porcelain p-3">
          <p className="text-[15px] font-semibold tabular-nums">
            {interpolate(t.plans.price, {
              price: formatMoney(data.price, locale),
              days: data.days,
            })}
          </p>
          {data.canPay ? (
            <>
              {data.providers.map((provider) => (
                <Button
                  key={provider}
                  loading={checkout.isPending && checkout.variables === provider}
                  disabled={checkout.isPending}
                  onClick={() => pay(provider)}
                >
                  {interpolate(t.plans.payWith, { provider: PROVIDER_NAMES[provider] })}
                </Button>
              ))}
              <p className="text-sm text-ink-muted">{t.plans.afterPay}</p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">{t.plans.ownerOnly}</p>
          )}
          {checkout.error && (
            <p role="alert" className="text-sm text-enamel-text">
              {errorText(t, checkout.error)}
            </p>
          )}
        </section>
      ) : (
        data.plan === 'FREE' && (
          <Button className="mt-4 w-full" disabled>
            {t.plans.upgradeSoon}
          </Button>
        )
      )}

      <PlanCard
        title={t.plans.freeTitle}
        items={t.plans.freeItems}
        current={data.plan === 'FREE'}
      />
      <PlanCard title={t.plans.proTitle} items={t.plans.proItems} current={data.plan === 'PRO'} />

      {data.payments.length > 0 && (
        <section className="mt-5">
          <SectionLabel className="mt-0">{t.plans.history}</SectionLabel>
          <TileList>
            {data.payments.map((payment) => (
              <li key={payment.id} className="flex items-center gap-3 bg-porcelain px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold tabular-nums">
                    {formatMoney(payment.amount, locale)}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {formatDayMonth(new Date(payment.at), locale)} ·{' '}
                    {PROVIDER_NAMES[payment.provider]}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 text-[13px] font-semibold',
                    payment.status === 'PAID' ? 'text-success' : 'text-ink-muted',
                  )}
                >
                  {t.plans.statuses[payment.status]}
                </span>
              </li>
            ))}
          </TileList>
        </section>
      )}
    </main>
  );
}
