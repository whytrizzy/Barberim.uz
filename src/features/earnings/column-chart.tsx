'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { haptic } from '@/telegram/haptics';

export type Column = {
  key: string;
  /** Under the column; empty to leave a gap in a long axis. */
  tick: string;
  value: number;
  /** What a tap shows, e.g. "Chorshanba, 5-noyabr · 250 000 soʻm". */
  readout: string;
  /** The current day or hour: drawn in the accent until something is tapped. */
  current?: boolean;
};

const HEIGHT = 112;

/**
 * One series of columns from a single baseline: thin bars (at most 24px) with a rounded top, a
 * hairline at the top value, and a readout line that a tap fills in (phones have no hover). The
 * same values are in a table for screen readers.
 */
export function ColumnChart({
  label,
  columns,
  formatValue,
}: {
  label: string;
  columns: Column[];
  /** For the top line's label and the table, e.g. "250 ming". */
  formatValue: (value: number) => string;
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<string | null>(null);
  const max = Math.max(...columns.map((c) => c.value), 0);
  const chosen = columns.find((c) => c.key === picked);

  return (
    <figure className="rounded-tile border border-chrome bg-porcelain px-3 pt-2.5 pb-2">
      <figcaption aria-live="polite" className="min-h-10 text-sm">
        {chosen ? (
          <span className="font-semibold tabular-nums">{chosen.readout}</span>
        ) : (
          <span className="text-ink-muted">{t.earnings.tapHint}</span>
        )}
      </figcaption>
      <div aria-hidden className="relative" style={{ height: HEIGHT }}>
        {max > 0 && (
          <>
            <span className="absolute inset-x-0 top-0 border-t border-chrome" />
            <span className="absolute top-0.5 right-0 bg-porcelain pl-1 text-[11px] leading-none text-ink-muted tabular-nums">
              {formatValue(max)}
            </span>
          </>
        )}
        <span className="absolute inset-x-0 bottom-0 border-t border-chrome" />
        <div className="absolute inset-0 flex items-end gap-0.5">
          {columns.map((column) => {
            const height =
              max > 0 ? Math.max((column.value / max) * HEIGHT, column.value > 0 ? 3 : 0) : 0;
            const accent = picked ? column.key === picked : column.current;
            return (
              <button
                key={column.key}
                type="button"
                tabIndex={-1}
                onClick={() => {
                  haptic.selection();
                  setPicked(column.key === picked ? null : column.key);
                }}
                // The whole slot is the tap target, not just the (maybe tiny) bar.
                className="flex h-full min-w-0 flex-1 items-end justify-center"
              >
                <span
                  className={cn(
                    'w-full max-w-6 rounded-t-[4px] transition-colors duration-150',
                    accent ? 'bg-enamel-text' : 'bg-ink',
                  )}
                  style={{ height }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div aria-hidden className="mt-1 flex gap-0.5">
        {columns.map((column) => (
          <span
            key={column.key}
            className="min-w-0 flex-1 overflow-visible text-center text-[11px] leading-tight whitespace-nowrap text-ink-muted tabular-nums"
          >
            {column.tick}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {columns.map((column) => (
            <tr key={column.key}>
              <td>{column.readout}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
