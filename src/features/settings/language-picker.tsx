'use client';

import { locales, type Locale } from '@/i18n/locales';
import { getMessages } from '@/i18n/messages';
import { haptic } from '@/telegram/haptics';
import { Tile, TileGroup } from '@/ui/tile-group';

/** The three languages as joined tiles, each written in its own language and script. */
export function LanguagePicker({
  value,
  onChange,
  label,
}: {
  value: Locale;
  onChange: (locale: Locale) => void;
  label: string;
}) {
  return (
    <TileGroup label={label} columns={3}>
      {locales.map((locale) => (
        <Tile
          key={locale}
          lang={locale}
          selected={value === locale}
          onClick={() => {
            if (locale !== value) haptic.selection();
            onChange(locale);
          }}
          className="min-h-14 text-[15px] font-semibold"
        >
          {getMessages(locale).meta.name}
        </Tile>
      ))}
    </TileGroup>
  );
}
