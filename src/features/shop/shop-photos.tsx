'use client';

import { ChevronLeft, ChevronRight, ImagePlus, LoaderCircle, Star, Trash2 } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';
import type { Messages } from '@/i18n/messages';
import { cn } from '@/lib/cn';
import { confirmAction } from '@/telegram/confirm';
import { haptic } from '@/telegram/haptics';
import { Button } from '@/ui/button';
import { SectionLabel } from '@/ui/section-label';
import { PhotoUnreadable } from './prepare-photo';
import { MAX_SHOP_PHOTOS, type ShopPhoto } from './schemas';
import { useShopPhotos } from './use-shop';

function photoError(t: Messages, error: unknown): string {
  if (error instanceof PhotoUnreadable) return t.shop.photoUnreadable;
  if (error instanceof ApiError) {
    const reason = (error.details as { reason?: string } | undefined)?.reason;
    if (reason === 'not_an_image' || reason === 'too_large') return t.shop.photoUnreadable;
    if (reason === 'too_many_photos') {
      return interpolate(t.shop.photosLimit, { count: MAX_SHOP_PHOTOS });
    }
  }
  return errorText(t, error);
}

/**
 * The shop's photos on its edit screen. Tap a photo to move it, make it the cover or delete it.
 * Changes are saved at once, apart from the details form and its Save button.
 */
export function ShopPhotos({ shopId, photos }: { shopId: string; photos: ShopPhoto[] }) {
  const { t } = useI18n();
  const { add, remove, reorder } = useShopPhotos(shopId);
  const [uploading, setUploading] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedIndex = photos.findIndex((photo) => photo.id === selectedId);
  const room = MAX_SHOP_PHOTOS - photos.length - uploading;

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = ''; // so the same photo can be picked again
    if (!files.length) return;
    setError(null);
    const accepted = files.slice(0, Math.max(0, room));
    if (accepted.length < files.length) {
      setError(interpolate(t.shop.photosLimit, { count: MAX_SHOP_PHOTOS }));
    }
    // One at a time: phones run out of memory decoding several camera photos at once.
    setUploading((n) => n + accepted.length);
    for (const file of accepted) {
      try {
        await add.mutateAsync(file);
        haptic.notify('success');
      } catch (cause) {
        haptic.notify('error');
        setError(photoError(t, cause));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function move(from: number, to: number) {
    const order = photos.map((photo) => photo.id);
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved!);
    haptic.selection();
    setError(null);
    reorder.mutate(order, { onError: (cause) => setError(photoError(t, cause)) });
  }

  async function removeSelected() {
    const photo = photos[selectedIndex];
    if (!photo || !(await confirmAction(t.shop.photoDeleteConfirm))) return;
    setError(null);
    remove.mutate(photo.id, {
      onSuccess: () => setSelectedId(null),
      onError: (cause) => setError(photoError(t, cause)),
    });
  }

  return (
    <section aria-labelledby="shop-photos">
      <div className="flex items-baseline justify-between">
        <SectionLabel className="mt-0">
          <span id="shop-photos">{t.shop.photos}</span>
        </SectionLabel>
        <span className="font-sign text-[13px] font-bold text-ink-faint tabular-nums">
          {photos.length + uploading}/{MAX_SHOP_PHOTOS}
        </span>
      </div>
      <p className="mb-3 text-sm text-ink-muted">{t.shop.photosHint}</p>

      <ul className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => {
          const selected = photo.id === selectedId;
          return (
            <li key={photo.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  haptic.selection();
                  setSelectedId(selected ? null : photo.id);
                }}
                className={cn(
                  'relative block aspect-square w-full overflow-hidden rounded-tile border border-chrome bg-porcelain-sunk',
                  'transition-[box-shadow,transform] duration-150 ease-snappy active:scale-[0.97]',
                  selected && 'ring-2 ring-pick ring-offset-2 ring-offset-tile',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- already sized, served by the CDN */}
                <img
                  src={photo.url}
                  alt={interpolate(t.shop.photoAlt, { number: index + 1 })}
                  className="size-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
                {index === 0 && (
                  <span className="absolute top-1.5 left-1.5 rounded-[4px] bg-enamel px-1.5 py-0.5 font-sign text-[11px] leading-none font-bold tracking-[0.06em] text-on-enamel uppercase">
                    {t.shop.photoCover}
                  </span>
                )}
              </button>
            </li>
          );
        })}

        {Array.from({ length: uploading }, (_, i) => (
          <li
            key={`uploading-${i}`}
            className="grid aspect-square place-items-center rounded-tile border border-chrome bg-porcelain-sunk"
          >
            <LoaderCircle className="size-5 animate-spin text-ink-faint" aria-hidden />
            <span className="sr-only">{t.shop.photoUploading}</span>
          </li>
        ))}

        {room > 0 && (
          <li>
            <label
              className={cn(
                'grid aspect-square w-full cursor-pointer place-content-center justify-items-center gap-1.5 rounded-tile',
                'border border-dashed border-chrome bg-porcelain px-2 text-center text-[13px] font-semibold text-enamel-text',
                'transition-transform duration-150 ease-snappy active:scale-[0.97]',
                'has-focus-visible:ring-2 has-focus-visible:ring-pick',
              )}
            >
              <ImagePlus className="size-6" aria-hidden />
              {t.shop.photoAdd}
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => void pick(event)}
              />
            </label>
          </li>
        )}
      </ul>

      {selectedIndex >= 0 && (
        <div className="mt-3 flex gap-2" role="toolbar" aria-label={t.shop.photos}>
          <Button
            variant="secondary"
            className="px-3"
            aria-label={t.shop.photoMoveLeft}
            disabled={selectedIndex === 0 || reorder.isPending}
            onClick={() => move(selectedIndex, selectedIndex - 1)}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Button>
          <Button
            variant="secondary"
            className="px-3"
            aria-label={t.shop.photoMoveRight}
            disabled={selectedIndex === photos.length - 1 || reorder.isPending}
            onClick={() => move(selectedIndex, selectedIndex + 1)}
          >
            <ChevronRight className="size-5" aria-hidden />
          </Button>
          <Button
            variant="secondary"
            className="flex-1 px-3"
            disabled={selectedIndex === 0 || reorder.isPending}
            onClick={() => move(selectedIndex, 0)}
          >
            <Star className="size-4" aria-hidden />
            {t.shop.photoMakeCover}
          </Button>
          <Button
            variant="secondary"
            className="px-3 text-enamel-text"
            aria-label={t.shop.photoDelete}
            loading={remove.isPending}
            onClick={() => void removeSelected()}
          >
            {!remove.isPending && <Trash2 className="size-5" aria-hidden />}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-enamel-text">
          {error}
        </p>
      )}
    </section>
  );
}
