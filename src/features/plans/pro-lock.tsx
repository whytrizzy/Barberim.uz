'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import type { ProFeature } from '@/domain/plans';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';

/** In place of a screen or a section a FREE shop can't use: what it is, and where the plans are. */
export function ProLock({
  shopId,
  feature,
  className,
}: {
  shopId: string;
  feature: ProFeature;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <section
      className={cn(
        'grid gap-2 rounded-tile border border-chrome bg-porcelain px-3 py-3',
        className,
      )}
    >
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <Lock className="size-4 shrink-0 text-enamel-text" aria-hidden />
        {t.plans.lockedTitle}
      </p>
      <p className="text-sm text-ink-muted">
        {interpolate(t.plans.lockedHint, { feature: t.plans.features[feature] })}
      </p>
      <Link
        href={`/staff/shop/${shopId}/plan`}
        className="flex min-h-11 items-center text-sm font-semibold text-enamel-text"
      >
        {t.plans.seePlans}
      </Link>
    </section>
  );
}

/** A small "PRO" tag beside a feature a FREE shop doesn't have. */
export function ProBadge() {
  const { t } = useI18n();
  return (
    <span className="rounded-[4px] border border-enamel-text px-1.5 py-0.5 text-[11px] leading-none font-bold text-enamel-text">
      {t.plans.badge}
    </span>
  );
}
