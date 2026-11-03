'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';

type Photo = { id: string; url: string };

/**
 * Photos full screen, swiped sideways (CSS scroll snapping, no gesture library). Always dark,
 * whatever the theme, like any photo viewer. Mounted while open; Esc and the close button call
 * `onClose`.
 */
export function PhotoViewer({
  photos,
  startIndex,
  label,
  onClose,
}: {
  photos: Photo[];
  startIndex: number;
  /** Who the photos belong to, for screen readers. */
  label: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const [current, setCurrent] = useState(startIndex);

  useEffect(() => {
    const element = dialog.current;
    // No close() on cleanup: its close event would arrive late and shut the next opening (React
    // runs effects twice in development). Unmounting removes the dialog anyway.
    if (!element || element.open) return;
    element.showModal();
    const list = track.current;
    if (list) list.scrollLeft = startIndex * list.clientWidth;
  }, [startIndex]);

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      onClose={onClose}
      className="fixed inset-0 m-0 size-full max-h-none max-w-none bg-black p-0 text-white backdrop:bg-black"
    >
      <ul
        ref={track}
        className="flex h-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-contain"
        onScroll={(event) => {
          const list = event.currentTarget;
          setCurrent(Math.round(list.scrollLeft / list.clientWidth));
        }}
      >
        {photos.map((photo, index) => (
          <li key={photo.id} className="h-full w-full shrink-0 snap-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- already sized, served by the CDN */}
            <img
              src={photo.url}
              alt={interpolate(t.shop.photoAlt, { number: index + 1 })}
              className="size-full object-contain"
              // The ones beside the open photo are a swipe away; the rest wait.
              loading={Math.abs(index - startIndex) <= 1 ? 'eager' : 'lazy'}
              decoding="async"
            />
          </li>
        ))}
      </ul>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]">
        <span
          aria-live="polite"
          className="rounded-[5px] bg-black/60 px-2 py-1 text-sm font-semibold tabular-nums"
        >
          {interpolate(t.portfolio.position, {
            number: Math.min(current, photos.length - 1) + 1,
            count: photos.length,
          })}
        </span>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label={t.portfolio.close}
          className="pointer-events-auto grid size-11 place-items-center rounded-full bg-black/60 focus-visible:ring-2 focus-visible:ring-white active:scale-95"
        >
          <X className="size-6" aria-hidden />
        </button>
      </div>
    </dialog>
  );
}
