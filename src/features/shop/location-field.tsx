'use client';

import { LocateFixed, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { parseCoordinates, yandexMapsLink, type Coordinates } from '@/domain/places';
import { clientEnv } from '@/env/client';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { requestLocation } from '@/telegram/location';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/text-field';

/**
 * The shop's pin on the map: from the device's location (in the shop, one tap), or pasted from a
 * Yandex / Google Maps link. Shows a static map when a Yandex key is configured, else a map link.
 */
export function LocationField({
  value,
  onChange,
}: {
  value: Coordinates | null;
  onChange: (value: Coordinates | null) => void;
}) {
  const { t, locale } = useI18n();
  const [locating, setLocating] = useState(false);
  const [pasted, setPasted] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const mapKey = clientEnv.NEXT_PUBLIC_YANDEX_MAPS_KEY;

  async function locate() {
    setNote(null);
    setLocating(true);
    const result = await requestLocation();
    setLocating(false);
    if (result.status === 'ok') {
      haptic.notify('success');
      onChange({
        lat: Math.round(result.lat * 1e6) / 1e6,
        lng: Math.round(result.lng * 1e6) / 1e6,
      });
    } else {
      setNote(result.status === 'denied' ? t.shop.locationDenied : t.shop.locationUnavailable);
    }
  }

  /**
   * Reads the field when the text is complete — on paste, on leaving the field, on Enter — never
   * while typing, so a half-typed "69.2" can't become the pin.
   */
  function apply(text: string) {
    if (!text.trim()) return;
    const coordinates = parseCoordinates(text);
    if (coordinates) {
      haptic.notify('success');
      onChange(coordinates);
      setPasted('');
      setNote(null);
    } else if (text.trim().length > 8) {
      setNote(t.shop.locationBadLink);
    }
  }

  return (
    <div className="grid gap-3">
      {value ? (
        <div className="overflow-hidden rounded-tile border border-chrome bg-porcelain">
          {mapKey && (
            // eslint-disable-next-line @next/next/no-img-element -- remote static map, not optimizable
            <img
              src={`https://static-maps.yandex.ru/v1?ll=${value.lng},${value.lat}&z=16&size=600,260&pt=${value.lng},${value.lat},pm2rdm&lang=${locale === 'ru' ? 'ru_RU' : 'uz_UZ'}&apikey=${mapKey}`}
              alt=""
              className="h-40 w-full object-cover"
              loading="lazy"
            />
          )}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <MapPin className="size-5 shrink-0 text-enamel-text" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.shop.locationSet}</p>
              <a
                href={yandexMapsLink(value)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-enamel-text underline underline-offset-2"
              >
                {t.shop.checkOnMap}
              </a>
            </div>
            <Button
              variant="ghost"
              className="px-2"
              onClick={() => onChange(null)}
              aria-label={t.shop.locationRemove}
            >
              <X className="size-5" aria-hidden />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Button variant="secondary" block loading={locating} onClick={locate}>
            <LocateFixed className="size-4" aria-hidden />
            {locating ? t.shop.locating : t.shop.locate}
          </Button>
          <TextField
            label={t.shop.locationPaste}
            inputMode="url"
            placeholder="https://yandex.uz/maps/…"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              e.preventDefault();
              setPasted(text);
              apply(text);
            }}
            onBlur={() => apply(pasted)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                apply(pasted);
              }
            }}
            hint={note}
          />
        </>
      )}
    </div>
  );
}
