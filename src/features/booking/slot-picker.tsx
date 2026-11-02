'use client';

import { formatMinuteOfDay, parseDateKey, startOfTashkentDay } from '@/domain/time';
import { formatWeekday } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { SectionLabel } from '@/ui/section-label';
import { Tile, TileGroup } from '@/ui/tile-group';
import type { BookingOptions } from './schemas';

/** Tashkent midnight of a "2026-11-03" date. */
export const dateOf = (key: string) => {
  const date = parseDateKey(key);
  return date ? startOfTashkentDay(date) : new Date();
};

/** Days in a strip, then that day's free times: for booking, and for moving a booking. */
export function SlotPicker({
  days,
  dayKey,
  startMin,
  missingTime,
  onDay,
  onStart,
}: {
  days: BookingOptions['days'];
  dayKey: string | null;
  startMin: number | null;
  /** Asks for a time, after someone tried to go on without one. */
  missingTime?: boolean;
  onDay: (key: string) => void;
  onStart: (minute: number) => void;
}) {
  const { t, locale } = useI18n();
  const day = days.find((option) => option.date === dayKey);
  return (
    <>
      <div
        role="radiogroup"
        aria-label={t.book.day}
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"
      >
        {days.map((option, index) => {
          const open = option.status === 'open';
          const selected = option.date === dayKey;
          return (
            <button
              key={option.date}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!open}
              onClick={() => {
                haptic.selection();
                onDay(option.date);
              }}
              className={
                selected
                  ? 'flex min-h-14 w-14 shrink-0 flex-col items-center justify-center rounded-tile border border-pick bg-pick text-on-pick'
                  : `flex min-h-14 w-14 shrink-0 flex-col items-center justify-center rounded-tile border border-chrome active:bg-porcelain-sunk ${open ? 'bg-porcelain' : 'bg-porcelain-sunk text-ink-faint line-through'}`
              }
            >
              <span className="text-xs leading-tight">
                {index === 0 ? t.calendar.today : formatWeekday(dateOf(option.date), locale, true)}
              </span>
              <span className="text-sm leading-tight font-semibold tabular-nums">
                {parseDateKey(option.date)?.day}
              </span>
            </button>
          );
        })}
      </div>

      <SectionLabel className="mt-4">{t.book.time}</SectionLabel>
      {day && day.slots.length > 0 ? (
        <TileGroup label={t.book.time} columns={4}>
          {day.slots.map((slot) => (
            <Tile
              key={slot.startMin}
              tone="enamel"
              selected={startMin === slot.startMin}
              className="text-[15px] font-semibold tabular-nums"
              onClick={() => {
                haptic.selection();
                onStart(slot.startMin);
              }}
            >
              {formatMinuteOfDay(slot.startMin)}
            </Tile>
          ))}
        </TileGroup>
      ) : (
        <p className="rounded-tile border border-chrome bg-porcelain-sunk px-3 py-3 text-sm text-ink-muted">
          {t.book.noTimes}
        </p>
      )}
      {missingTime && day && day.slots.length > 0 && (
        <p role="alert" className="mt-1.5 text-sm text-enamel-text">
          {t.book.pickTime}
        </p>
      )}
    </>
  );
}
