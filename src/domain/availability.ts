/**
 * Availability engine: which start times a master can take on a given Tashkent date.
 * Pure — no database, no clock, no time zone of the device. Everything it needs is passed in,
 * which is what makes it exhaustively testable (availability.test.ts).
 *
 * Times inside a day are minutes since Tashkent midnight of that date (0–1440). Bookings are
 * real instants and may start the day before or end the day after.
 */
import {
  daysBetween,
  startOfTashkentDay,
  tashkentDate,
  weekdayOf,
  type CalendarDate,
} from './time';

export type WeeklyBlock = { weekday: number; startMin: number; endMin: number };

export type DayOverride =
  { type: 'DAY_OFF' } | { type: 'CUSTOM_HOURS'; startMin: number; endMin: number };

export type BusyInterval = { startAt: Date; endAt: Date };

export type BookingRules = {
  /** Grid of offered start times, e.g. every 20 minutes from the start of each window. */
  slotStepMin: number;
  /** How far ahead a client must book, e.g. 60 = not within the next hour. */
  minNoticeMin: number;
  /** Cleanup time kept free before and after every booking. */
  bufferMin: number;
  /** How many days ahead booking is open (today = day 0). */
  horizonDays: number;
};

export const defaultBookingRules: BookingRules = {
  slotStepMin: 20,
  minNoticeMin: 60,
  bufferMin: 0,
  horizonDays: 30,
};

export type DayInput = {
  date: CalendarDate;
  /** The master's weekly schedule (all weekdays; only this date's weekday is used). */
  weekly: WeeklyBlock[];
  /** One-off changes for this date. A DAY_OFF wins; CUSTOM_HOURS replace the weekly hours. */
  overrides: DayOverride[];
  /** The master's non-cancelled bookings around this date. */
  busy: BusyInterval[];
  /** Length of what's being booked, in minutes. */
  durationMin: number;
  rules: BookingRules;
  now: Date;
};

export type SlotState = 'available' | 'taken' | 'too_soon';

export type Slot = {
  /** Minutes since Tashkent midnight. */
  startMin: number;
  startAt: Date;
  endAt: Date;
  state: SlotState;
};

export type DayStatus =
  | 'open' // at least one available slot
  | 'full' // working, but every slot is taken or too soon
  | 'closed' // not a working day
  | 'day_off' // a day off was set for this date
  | 'past' // the date is before today
  | 'beyond_horizon'; // too far ahead to book yet

export type DayAvailability = { status: DayStatus; slots: Slot[] };

type Range = { start: number; end: number };

/** Sorted, non-overlapping working windows for the date, clipped to the day. */
export function workingWindows(
  date: CalendarDate,
  weekly: WeeklyBlock[],
  overrides: DayOverride[],
): Range[] | 'day_off' {
  if (overrides.some((o) => o.type === 'DAY_OFF')) return 'day_off';
  const custom = overrides.filter((o) => o.type === 'CUSTOM_HOURS');
  const weekday = weekdayOf(date);
  const source =
    custom.length > 0
      ? custom.map((o) => ({ start: o.startMin, end: o.endMin }))
      : weekly
          .filter((b) => b.weekday === weekday)
          .map((b) => ({ start: b.startMin, end: b.endMin }));
  return mergeRanges(
    source.map((r) => ({ start: Math.max(0, r.start), end: Math.min(1440, r.end) })),
  );
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Busy instants as minute ranges relative to this date's midnight, widened by the buffer. */
function busyRanges(dayStart: Date, busy: BusyInterval[], bufferMin: number): Range[] {
  const base = dayStart.getTime();
  return mergeRanges(
    busy.map((b) => ({
      start: (b.startAt.getTime() - base) / 60_000 - bufferMin,
      end: (b.endAt.getTime() - base) / 60_000 + bufferMin,
    })),
  );
}

const overlaps = (a: Range, b: Range) => a.start < b.end && b.start < a.end;

export function dayAvailability(input: DayInput): DayAvailability {
  const { date, rules, durationMin, now } = input;
  const offset = daysBetween(tashkentDate(now), date);
  if (offset < 0) return { status: 'past', slots: [] };
  if (offset > rules.horizonDays) return { status: 'beyond_horizon', slots: [] };

  const windows = workingWindows(date, input.weekly, input.overrides);
  if (windows === 'day_off') return { status: 'day_off', slots: [] };
  if (windows.length === 0 || durationMin <= 0) return { status: 'closed', slots: [] };

  const dayStart = startOfTashkentDay(date);
  const busy = busyRanges(dayStart, input.busy, rules.bufferMin);
  const earliest = (now.getTime() - dayStart.getTime()) / 60_000 + rules.minNoticeMin;
  const step = Math.max(5, rules.slotStepMin);

  const starts = new Set<number>();
  for (const w of windows) {
    // The regular grid, anchored at the window start…
    for (let s = w.start; s + durationMin <= w.end; s += step) starts.add(s);
    // …plus "right after a booking" starts, so the day packs without gaps.
    for (const b of busy) {
      const s = Math.ceil(b.end);
      if (s > w.start && s + durationMin <= w.end) starts.add(s);
    }
  }

  const slots: Slot[] = [...starts]
    .sort((a, b) => a - b)
    .map((startMin) => {
      const range = { start: startMin, end: startMin + durationMin };
      const state: SlotState = busy.some((b) => overlaps(range, b))
        ? 'taken'
        : startMin < earliest
          ? 'too_soon'
          : 'available';
      const startAt = new Date(dayStart.getTime() + startMin * 60_000);
      return {
        startMin,
        startAt,
        endAt: new Date(startAt.getTime() + durationMin * 60_000),
        state,
      };
    })
    // A "right after a booking" start is only useful when it's actually bookable.
    .filter((slot) => slot.state === 'available' || isGridStart(slot.startMin, windows, step));

  const status: DayStatus = slots.some((s) => s.state === 'available') ? 'open' : 'full';
  return { status, slots };
}

function isGridStart(startMin: number, windows: Range[], step: number): boolean {
  return windows.some(
    (w) => startMin >= w.start && startMin < w.end && (startMin - w.start) % step === 0,
  );
}

export type SlotCheck =
  | { ok: true }
  | { ok: false; reason: DayStatus | 'outside_hours' | 'taken' | 'too_soon' | 'not_offered' };

/**
 * Re-checks one requested start time on the server before booking it. The database still has
 * the final word on overlaps (bookings_no_overlap); this enforces hours, notice and horizon.
 * Clients may only take a start the engine offers (so nobody fragments the day with 10:07);
 * staff adding a walk-in or phone booking pass `anyStart` to pick any fitting minute.
 */
export function checkSlot(
  input: DayInput,
  startAt: Date,
  { anyStart = false }: { anyStart?: boolean } = {},
): SlotCheck {
  const basic = checkFits(input, startAt);
  if (!basic.ok || anyStart) return basic;
  const offered = dayAvailability(input).slots.some(
    (slot) => slot.state === 'available' && slot.startAt.getTime() === startAt.getTime(),
  );
  return offered ? basic : { ok: false, reason: 'not_offered' };
}

function checkFits(input: DayInput, startAt: Date): SlotCheck {
  const { date, rules, now } = input;
  const offset = daysBetween(tashkentDate(now), date);
  if (offset < 0) return { ok: false, reason: 'past' };
  if (offset > rules.horizonDays) return { ok: false, reason: 'beyond_horizon' };
  const windows = workingWindows(date, input.weekly, input.overrides);
  if (windows === 'day_off') return { ok: false, reason: 'day_off' };

  const dayStart = startOfTashkentDay(date);
  const start = (startAt.getTime() - dayStart.getTime()) / 60_000;
  const range = { start, end: start + input.durationMin };
  if (!windows.some((w) => range.start >= w.start && range.end <= w.end)) {
    return { ok: false, reason: 'outside_hours' };
  }
  if (busyRanges(dayStart, input.busy, rules.bufferMin).some((b) => overlaps(range, b))) {
    return { ok: false, reason: 'taken' };
  }
  const earliest = (now.getTime() - dayStart.getTime()) / 60_000 + rules.minNoticeMin;
  if (range.start < earliest) return { ok: false, reason: 'too_soon' };
  return { ok: true };
}
