'use client';

import { Star } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { interpolate } from '@/i18n/interpolate';
import { cn } from '@/lib/cn';
import { haptic } from '@/telegram/haptics';

/** Filled in ink, not gold: the shop's world has one accent, and it isn't for decoration. */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  const { t } = useI18n();
  return (
    <span
      role="img"
      aria-label={interpolate(t.reviews.outOfFive, { rating })}
      className={cn('inline-flex gap-0.5', className)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn('size-3.5', n <= rating ? 'fill-ink text-ink' : 'text-ink-muted')}
        />
      ))}
    </span>
  );
}

/** Five large tiles to tap, the shape of every single choice in the app. */
export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t.reviews.yourRating}
      className="grid grid-cols-5 gap-px overflow-hidden rounded-tile border border-chrome bg-chrome"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={interpolate(t.reviews.outOfFive, { rating: n })}
          className="grid min-h-12 place-items-center bg-porcelain active:bg-porcelain-sunk"
          onClick={() => {
            haptic.selection();
            onChange(n);
          }}
        >
          <Star
            aria-hidden
            className={cn('size-6', n <= value ? 'fill-enamel text-enamel' : 'text-ink-muted')}
          />
        </button>
      ))}
    </div>
  );
}

export const formatAverage = (average: number) => average.toFixed(1);
