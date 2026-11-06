'use client';

import { Check } from 'lucide-react';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { useShop } from '@/features/shop/use-shop';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { useMainButton } from '@/telegram/use-main-button';
import { Button } from '@/ui/button';
import { EnamelSign } from '@/ui/enamel-sign';

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

/** /staff/shop/:id/plan — what FREE and PRO include, and which one the shop is on. */
export function PlanScreen({ shopId }: { shopId: string }) {
  const { t } = useI18n();
  const shop = useShop(shopId);
  // Paying comes with subscription billing (P2.11); until then there is nothing to press.
  useMainButton(null);

  if (shop.isPending) return <ScreenLoading />;
  if (shop.isError) {
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        error={shop.error}
        onRetry={() => void shop.refetch()}
      />
    );
  }
  const { plan } = shop.data;
  const name = plan === 'PRO' ? t.plans.proTitle : t.plans.freeTitle;
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <EnamelSign overline={t.plans.title}>{name}</EnamelSign>
      <p className="mt-3 text-[15px] font-semibold">
        {interpolate(t.plans.current, { plan: name })}
      </p>
      {plan === 'PRO' && <p className="mt-1 text-sm text-ink-muted">{t.plans.everyonePro}</p>}
      <PlanCard title={t.plans.freeTitle} items={t.plans.freeItems} current={plan === 'FREE'} />
      <PlanCard title={t.plans.proTitle} items={t.plans.proItems} current={plan === 'PRO'} />
      {plan === 'FREE' && (
        <Button className="mt-4 w-full" disabled>
          {t.plans.upgradeSoon}
        </Button>
      )}
    </main>
  );
}
