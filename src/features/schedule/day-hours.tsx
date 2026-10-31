'use client';

import { Plus, X } from 'lucide-react';
import { MAX_DAY_BLOCKS, type WorkDay } from '@/domain/schedule';
import { formatMinuteOfDay, parseMinuteOfDay } from '@/domain/time';
import { useI18n } from '@/i18n/provider';
import { TextField } from '@/ui/text-field';

/** A time picker working in 5-minute steps; the phone's own picker, so it's light on old phones. */
export function TimeField({
  label,
  minutes,
  onChange,
}: {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <TextField
      label={label}
      type="time"
      step={300}
      value={formatMinuteOfDay(minutes)}
      onChange={(event) => {
        const value = parseMinuteOfDay(event.target.value);
        if (value !== null) onChange(Math.round(value / 5) * 5);
      }}
    />
  );
}

/** Opening and closing time, with any breaks in between. */
export function DayHours({ day, onChange }: { day: WorkDay; onChange: (day: WorkDay) => void }) {
  const { t } = useI18n();
  const setBreak = (index: number, part: Partial<WorkDay['breaks'][number]>) =>
    onChange({
      ...day,
      breaks: day.breaks.map((pause, i) => (i === index ? { ...pause, ...part } : pause)),
    });

  // A new break goes after the last one (or mid-day), an hour long, as a starting point.
  function addBreak() {
    const last = day.breaks[day.breaks.length - 1];
    const startMin = last ? last.endMin + 60 : 13 * 60;
    onChange({ ...day, breaks: [...day.breaks, { startMin, endMin: startMin + 60 }] });
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <TimeField
          label={t.schedule.opens}
          minutes={day.startMin}
          onChange={(startMin) => onChange({ ...day, startMin })}
        />
        <TimeField
          label={t.schedule.closes}
          minutes={day.endMin}
          onChange={(endMin) => onChange({ ...day, endMin })}
        />
      </div>
      {day.breaks.map((pause, index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
          <TimeField
            label={t.schedule.breakFrom}
            minutes={pause.startMin}
            onChange={(startMin) => setBreak(index, { startMin })}
          />
          <TimeField
            label={t.schedule.breakTo}
            minutes={pause.endMin}
            onChange={(endMin) => setBreak(index, { endMin })}
          />
          <button
            type="button"
            aria-label={t.schedule.breakRemove}
            className="grid size-12 place-items-center rounded-tile text-ink-muted active:bg-porcelain-sunk"
            onClick={() => onChange({ ...day, breaks: day.breaks.filter((_, i) => i !== index) })}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      ))}
      {day.breaks.length < MAX_DAY_BLOCKS - 1 && (
        <button
          type="button"
          className="flex min-h-11 items-center gap-1.5 justify-self-start text-sm font-semibold text-enamel-text"
          onClick={addBreak}
        >
          <Plus className="size-4" aria-hidden />
          {t.schedule.breakAdd}
        </button>
      )}
    </div>
  );
}
