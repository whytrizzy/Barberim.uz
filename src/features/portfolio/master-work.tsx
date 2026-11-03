'use client';

import { useState } from 'react';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { PhotoViewer } from './photo-viewer';

type Photo = { id: string; url: string };

/** A master's photos as a row of thumbnails on the shop's page; a tap opens them full screen. */
export function MasterWork({ name, photos }: { name: string; photos: Photo[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;

  return (
    <>
      <ul
        aria-label={`${t.portfolio.title}: ${name}`}
        className="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 pb-0.5"
      >
        {photos.map((photo, index) => (
          <li key={photo.id} className="shrink-0">
            <button
              type="button"
              onClick={() => {
                haptic.selection();
                setOpen(index);
              }}
              className="block size-16 overflow-hidden rounded-[5px] border border-chrome bg-porcelain-sunk transition-transform duration-150 ease-snappy focus-visible:ring-2 focus-visible:ring-pick active:scale-[0.96]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- already sized, served by the CDN */}
              <img
                src={photo.url}
                alt={interpolate(t.shop.photoAlt, { number: index + 1 })}
                className="size-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <PhotoViewer
          photos={photos}
          startIndex={open}
          label={`${t.portfolio.title}: ${name}`}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
