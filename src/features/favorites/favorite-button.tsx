'use client';

import { Heart } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { haptic } from '@/telegram/haptics';
import { useToggleFavorite } from './use-favorites';

/** Save a shop to find it again; tapping again forgets it. */
export function FavoriteButton({
  slug,
  shopId,
  saved,
}: {
  slug: string;
  shopId: string;
  saved: boolean;
}) {
  const { t } = useI18n();
  const toggle = useToggleFavorite(slug, shopId);
  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => {
        haptic.selection();
        toggle.mutate(!saved, { onError: () => haptic.notify('error') });
      }}
      className={cn(
        'flex min-h-11 shrink-0 items-center gap-1.5 rounded-tile border px-3 text-sm font-semibold',
        'transition-[transform,background-color,border-color] duration-150 ease-snappy active:scale-[0.97]',
        'focus-visible:ring-2 focus-visible:ring-pick',
        saved
          ? 'border-enamel bg-enamel text-on-enamel'
          : 'border-chrome bg-porcelain text-enamel-text active:bg-porcelain-sunk',
      )}
    >
      <Heart className={cn('size-4', saved && 'fill-current')} aria-hidden />
      {saved ? t.favorites.saved : t.favorites.save}
    </button>
  );
}
