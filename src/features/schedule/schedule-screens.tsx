'use client';

import { CircleAlert, CircleCheck, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import {
  DEFAULT_WORK_DAY,
  FRIDAY_PRAYER_BREAK,
  RAMADAN_HOURS,
  blocksFromDay,
  dayFromBlocks,
  type Block,
  type WorkDay,
} from '@/domain/schedule';
import {
  addDays,
  dateKey,
  formatMinuteOfDay,
  parseDateKey,
  startOfTashkentDay,
} from '@/domain/time';
import { formatDayMonth } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import type { Messages } from '@/i18n/messages';
import { useI18n } from '@/i18n/provider';
import { confirmAction } from '@/telegram/confirm';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { Button } from '@/ui/button';
import { SectionLabel } from '@/ui/section-label';
import { TextField } from '@/ui/text-field';
import { Tick } from '@/ui/tick';
import { Tile, TileGroup } from '@/ui/tile-group';
import { TileList } from '@/ui/tile-list';
import { DayHours, TimeField } from './day-hours';
import { MAX_CHANGE_DAYS, type ScheduleChange, type ScheduleDto } from './schemas';
import { useSchedule, useScheduleActions } from './use-schedule';

const screen = 'mx-auto max-w-[390px] px-4 pt-4 pb-6';
const title = 'font-sign text-[30px] leading-none font-bold uppercase';
const FRIDAY = 5;
const weekdays = [1, 2, 3, 4, 5, 6, 7];

type Week = Record<number, WorkDay | null>;

function weekFromSchedule(schedule: ScheduleDto): Week {
  const week: Week = {};
  for (const weekday of weekdays) {
    week[weekday] = dayFromBlocks(schedule.weekly.filter((b) => b.weekday === weekday));
  }
  return week;
}

/** Nothing saved yet: Monday to Saturday from 9 to 7 is a good start for most barbers. */
const starterWeek = (): Week =>
  Object.fromEntries(weekdays.map((d) => [d, d === 7 ? null : DEFAULT_WORK_DAY])) as Week;

const hoursText = (blocks: Block[]) =>
  blocks.map((b) => `${formatMinuteOfDay(b.startMin)}–${formatMinuteOfDay(b.endMin)}`).join(', ');

function scheduleError(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const reason = (error.details as { reason?: string } | undefined)?.reason;
    if (reason === 'bad_dates') return t.schedule.badDates;
    if (reason === 'not_working_today') return t.schedule.leaveBeforeOpening;
  }
  return errorText(t, error);
}

function OutsideHoursNotice({ count }: { count: number }) {
  const { t } = useI18n();
  if (count === 0) return null;
  return (
    <p
      role="status"
      className="mt-3 flex items-start gap-2 rounded-tile border border-chrome bg-porcelain px-3 py-2.5 text-sm"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-enamel-text" aria-hidden />
      {interpolate(t.schedule.outsideHours, { count })}
    </p>
  );
}

/** "Today I leave at 16:00" — the most common change, one step away. */
function TodayCard({ shopId, schedule }: { shopId: string; schedule: ScheduleDto }) {
  const { t } = useI18n();
  const { addChange } = useScheduleActions(shopId, schedule.staffId);
  const closing = schedule.today.blocks[schedule.today.blocks.length - 1]?.endMin;
  const [leaveAt, setLeaveAt] = useState(() => Math.max(0, (closing ?? 1140) - 120));
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-5 grid gap-3 rounded-tile border border-chrome bg-porcelain p-3">
      <div>
        <h2 className="text-[15px] font-semibold">{t.calendar.today}</h2>
        <p className="text-sm text-ink-muted tabular-nums">
          {schedule.today.blocks.length > 0 ? hoursText(schedule.today.blocks) : t.schedule.dayOff}
        </p>
      </div>
      {schedule.canEdit &&
        closing !== undefined &&
        (open ? (
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <TimeField label={t.schedule.leaveAt} minutes={leaveAt} onChange={setLeaveAt} />
            <Button
              loading={addChange.isPending}
              className="h-12"
              onClick={() =>
                addChange.mutate(
                  { kind: 'leave_at', date: schedule.today.date, leaveAt },
                  {
                    onSuccess: () => {
                      haptic.notify('success');
                      setOpen(false);
                    },
                    onError: () => haptic.notify('error'),
                  },
                )
              }
            >
              {t.common.save}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {t.schedule.leaveEarly}
          </Button>
        ))}
      {addChange.error && (
        <p role="alert" className="text-sm text-enamel-text">
          {scheduleError(t, addChange.error)}
        </p>
      )}
    </section>
  );
}

function changeDates(change: ScheduleChange, locale: Parameters<typeof formatDayMonth>[1]) {
  const format = (key: string) => {
    const date = parseDateKey(key);
    return date ? formatDayMonth(startOfTashkentDay(date), locale) : key;
  };
  return change.from === change.to
    ? format(change.from)
    : `${format(change.from)} – ${format(change.to)}`;
}

function ChangeRows({ shopId, schedule }: { shopId: string; schedule: ScheduleDto }) {
  const { t, locale } = useI18n();
  const { removeChange } = useScheduleActions(shopId, schedule.staffId);

  async function undo(change: ScheduleChange) {
    if (!(await confirmAction(t.schedule.changeRemoveConfirm))) return;
    removeChange.mutate(
      { from: change.from, to: change.to },
      { onError: () => haptic.notify('error') },
    );
  }

  if (schedule.changes.length === 0) {
    return <p className="text-sm text-ink-muted">{t.schedule.noChanges}</p>;
  }
  return (
    <>
      <TileList>
        {schedule.changes.map((change) => (
          <li key={change.from} className="flex items-center gap-2 bg-porcelain px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-tight font-semibold">
                {changeDates(change, locale)}
              </span>
              <span className="block text-xs text-ink-muted tabular-nums">
                {t.schedule.reasons[change.reason ?? 'other']} ·{' '}
                {change.type === 'DAY_OFF' ? t.schedule.dayOff : hoursText(change.blocks)}
              </span>
            </span>
            {schedule.canEdit && (
              <button
                type="button"
                aria-label={t.schedule.changeRemove}
                disabled={removeChange.isPending}
                className="grid size-11 shrink-0 place-items-center rounded-tile text-enamel-text active:bg-porcelain-sunk disabled:opacity-50"
                onClick={() => void undo(change)}
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </TileList>
      {removeChange.error && (
        <p role="alert" className="mt-2 text-sm text-enamel-text">
          {scheduleError(t, removeChange.error)}
        </p>
      )}
    </>
  );
}

function WeekEditor({ shopId, schedule }: { shopId: string; schedule: ScheduleDto }) {
  const { t } = useI18n();
  const { saveWeek } = useScheduleActions(shopId, schedule.staffId);
  const isNew = schedule.weekly.length === 0;
  const [week, setWeek] = useState<Week>(() =>
    isNew ? starterWeek() : weekFromSchedule(schedule),
  );
  const [saved, setSaved] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const blocksByDay = weekdays.map((weekday) => {
    const day = week[weekday];
    return { weekday, day, blocks: day ? blocksFromDay(day) : [] };
  });
  const invalid = blocksByDay.some((d) => d.blocks === null);

  const change = (weekday: number, day: WorkDay | null) => {
    setSaved(false);
    setWeek((current) => ({ ...current, [weekday]: day }));
  };

  function submit() {
    setShowErrors(true);
    if (invalid) {
      haptic.notify('error');
      return;
    }
    saveWeek.mutate(
      {
        weekly: blocksByDay.flatMap(({ weekday, blocks }) =>
          (blocks ?? []).map((block) => ({ weekday, ...block })),
        ),
      },
      {
        onSuccess: () => {
          haptic.notify('success');
          setSaved(true);
        },
        onError: () => haptic.notify('error'),
      },
    );
  }

  useMainButton(
    schedule.canEdit
      ? { text: t.schedule.saveWeek, loading: saveWeek.isPending, onClick: submit }
      : null,
  );

  const monday = week[1];
  const friday = week[FRIDAY];
  const prayerSet = friday?.breaks.some(
    (pause) =>
      pause.startMin === FRIDAY_PRAYER_BREAK.startMin &&
      pause.endMin === FRIDAY_PRAYER_BREAK.endMin,
  );
  return (
    <section className="mt-6">
      <SectionLabel className="mt-0">{t.schedule.weekTitle}</SectionLabel>
      {isNew && schedule.canEdit && (
        <p className="mb-3 text-sm text-ink-muted">{t.schedule.starterHint}</p>
      )}
      <fieldset
        disabled={!schedule.canEdit}
        className="grid gap-px overflow-hidden rounded-tile border border-chrome bg-chrome"
      >
        {blocksByDay.map(({ weekday, day, blocks }) => (
          <div key={weekday} className="grid gap-3 bg-porcelain p-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-tile has-focus-visible:ring-2 has-focus-visible:ring-pick">
              <Tick
                checked={day !== null}
                onChange={() => {
                  haptic.selection();
                  change(weekday, day ? null : DEFAULT_WORK_DAY);
                }}
              />
              <span className="flex-1 text-[15px] font-semibold">
                {t.calendar.weekdays[weekday - 1]}
              </span>
              {!day && <span className="text-sm text-ink-muted">{t.schedule.dayOff}</span>}
            </label>
            {day && <DayHours day={day} onChange={(next) => change(weekday, next)} />}
            {day && weekday === FRIDAY && !prayerSet && (
              <Button
                variant="secondary"
                onClick={() =>
                  change(weekday, { ...day, breaks: [...day.breaks, FRIDAY_PRAYER_BREAK] })
                }
              >
                {interpolate(t.schedule.fridayPrayer, { hours: hoursText([FRIDAY_PRAYER_BREAK]) })}
              </Button>
            )}
            {day && weekday === 1 && (
              <Button
                variant="ghost"
                className="justify-self-start px-0"
                onClick={() => {
                  haptic.selection();
                  setSaved(false);
                  setWeek(
                    (current) =>
                      Object.fromEntries(
                        weekdays.map((d) => [d, current[d] && monday ? monday : current[d]]),
                      ) as Week,
                  );
                }}
              >
                {t.schedule.copyMonday}
              </Button>
            )}
            {showErrors && blocks === null && (
              <p role="alert" className="text-sm text-enamel-text">
                {t.schedule.badHours}
              </p>
            )}
          </div>
        ))}
      </fieldset>
      {saved && (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm">
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
          {t.shop.saved}
        </p>
      )}
      {saveWeek.error && (
        <p role="alert" className="mt-3 text-sm text-enamel-text">
          {scheduleError(t, saveWeek.error)}
        </p>
      )}
    </section>
  );
}

/** /staff/shop/:id/team/:staffId/schedule */
export function ScheduleScreen({ shopId, staffId }: { shopId: string; staffId: string }) {
  const { t } = useI18n();
  const query = useSchedule(shopId, staffId);

  if (query.isPending) {
    return <ScreenLoading />;
  }
  if (query.isError) {
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const schedule = query.data;
  return (
    <main className={screen}>
      <h1 className={title}>{t.schedule.title}</h1>
      <p className="mt-2 text-sm text-ink-muted">{schedule.name}</p>
      <OutsideHoursNotice count={schedule.bookingsOutsideHours} />
      <TodayCard shopId={shopId} schedule={schedule} />
      <section className="mt-6">
        <SectionLabel className="mt-0">{t.schedule.changesTitle}</SectionLabel>
        <ChangeRows shopId={shopId} schedule={schedule} />
        {schedule.canEdit && (
          <Link
            href={`/staff/shop/${shopId}/team/${staffId}/schedule/change`}
            className="mt-2 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-enamel-text"
          >
            <Plus className="size-4" aria-hidden />
            {t.schedule.changeAdd}
          </Link>
        )}
      </section>
      <WeekEditor shopId={shopId} schedule={schedule} />
    </main>
  );
}

type ChangeForm = 'day_off' | 'custom_hours' | 'ramadan';

/** /staff/shop/:id/team/:staffId/schedule/change — a day off, a vacation, special hours. */
export function ScheduleChangeScreen({ shopId, staffId }: { shopId: string; staffId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const query = useSchedule(shopId, staffId);
  const { addChange } = useScheduleActions(shopId, staffId);
  const [form, setForm] = useState<ChangeForm>('day_off');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [day, setDay] = useState<WorkDay>(DEFAULT_WORK_DAY);
  const [submitted, setSubmitted] = useState(false);

  const today = query.data?.today.date ?? '';
  const start = from || today;
  const end = to || start;
  const startDate = parseDateKey(start);
  const maxDate = startDate ? dateKey(addDays(startDate, MAX_CHANGE_DAYS - 1)) : undefined;
  const blocks = form === 'day_off' ? [] : blocksFromDay(day);
  const datesOk = Boolean(start && end >= start && start >= today && (!maxDate || end <= maxDate));

  function pick(next: ChangeForm) {
    haptic.selection();
    setForm(next);
    setDay(next === 'ramadan' ? RAMADAN_HOURS : DEFAULT_WORK_DAY);
  }

  function submit() {
    setSubmitted(true);
    if (!datesOk || !blocks) {
      haptic.notify('error');
      return;
    }
    const range = { from: start, to: end };
    addChange.mutate(
      form === 'day_off'
        ? { kind: 'day_off', ...range, reason: start === end ? 'other' : 'vacation' }
        : {
            kind: 'custom_hours',
            ...range,
            reason: form === 'ramadan' ? 'ramadan' : 'other',
            blocks,
          },
      {
        onSuccess: () => {
          haptic.notify('success');
          router.back();
        },
        onError: () => haptic.notify('error'),
      },
    );
  }

  useMainButton(
    query.data?.canEdit
      ? { text: t.common.save, loading: addChange.isPending, onClick: submit }
      : null,
  );

  if (query.isPending) {
    return <ScreenLoading />;
  }
  if (query.isError) {
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <main className={screen}>
      <h1 className={`${title} mb-5`}>{t.schedule.changeTitle}</h1>
      <div className="grid gap-4">
        <TileGroup label={t.schedule.changeTitle} columns={3}>
          {(
            [
              ['day_off', t.schedule.formDayOff],
              ['custom_hours', t.schedule.formHours],
              ['ramadan', t.schedule.formRamadan],
            ] as const
          ).map(([value, label]) => (
            <Tile
              key={value}
              selected={form === value}
              className="text-sm font-semibold"
              onClick={() => pick(value)}
            >
              {label}
            </Tile>
          ))}
        </TileGroup>
        {form === 'ramadan' && <p className="text-sm text-ink-muted">{t.schedule.ramadanHint}</p>}
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t.schedule.from}
            type="date"
            min={today}
            value={start}
            onChange={(e) => setFrom(e.target.value)}
          />
          <TextField
            label={t.schedule.to}
            type="date"
            min={start}
            max={maxDate}
            value={end}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        {form !== 'day_off' && <DayHours day={day} onChange={setDay} />}
        {submitted && !datesOk && (
          <p role="alert" className="text-sm text-enamel-text">
            {t.schedule.badDates}
          </p>
        )}
        {submitted && !blocks && (
          <p role="alert" className="text-sm text-enamel-text">
            {t.schedule.badHours}
          </p>
        )}
        {addChange.error && (
          <p role="alert" className="text-sm text-enamel-text">
            {scheduleError(t, addChange.error)}
          </p>
        )}
      </div>
    </main>
  );
}
