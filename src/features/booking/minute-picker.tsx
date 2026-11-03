'use client';

import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { Tile, TileGroup } from '@/ui/tile-group';

/** "About how late?" as a row of minute tiles; a tap sends it. */
export function MinutePicker({
  label,
  options,
  disabled,
  onPick,
}: {
  label: string;
  options: readonly number[];
  disabled?: boolean;
  onPick: (minutes: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-2">
      <p className="text-sm text-ink-muted">{label}</p>
      {/* Five choices fit one row on a phone; the group itself offers 3/4/6/7. */}
      <TileGroup
        label={label}
        columns={4}
        className={options.length === 5 ? 'grid-cols-5' : undefined}
      >
        {options.map((minutes) => (
          <Tile
            key={minutes}
            selected={false}
            disabled={disabled}
            className="text-sm font-semibold tabular-nums"
            onClick={() => {
              haptic.selection();
              onPick(minutes);
            }}
          >
            {interpolate(t.notices.minutes, { minutes })}
          </Tile>
        ))}
      </TileGroup>
    </div>
  );
}
