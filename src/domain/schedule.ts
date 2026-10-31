/**
 * Working hours as people think of them (9:00–19:00 with a break) and as they are stored (blocks
 * of working time, where a break is the gap between two blocks). Pure, in Tashkent minutes.
 */
import { workingWindows, type DayOverride, type WeeklyBlock } from './availability';
import {
  addDays,
  dateKey,
  minuteOfDay,
  parseDateKey,
  tashkentDate,
  type CalendarDate,
} from './time';

export type Block = { startMin: number; endMin: number };

export type WorkDay = { startMin: number; endMin: number; breaks: Block[] };

/** Most blocks in a day: start to finish with up to three breaks. */
export const MAX_DAY_BLOCKS = 4;
/** The Friday prayer break offered as a preset; the barber can adjust it. */
export const FRIDAY_PRAYER_BREAK: Block = { startMin: 12 * 60 + 30, endMin: 13 * 60 + 30 };
/** Typical Ramadan hours, closed around iftar; the barber can adjust them. */
export const RAMADAN_HOURS: WorkDay = {
  startMin: 10 * 60,
  endMin: 23 * 60,
  breaks: [{ startMin: 17 * 60, endMin: 20 * 60 }],
};
export const DEFAULT_WORK_DAY: WorkDay = { startMin: 9 * 60, endMin: 19 * 60, breaks: [] };

/** Blocks must be in order, not touch or overlap, and stay inside the day. */
export function blocksAreValid(blocks: Block[]): boolean {
  if (blocks.length > MAX_DAY_BLOCKS) return false;
  return blocks.every(
    (block, i) =>
      block.startMin >= 0 &&
      block.endMin <= 1440 &&
      block.startMin < block.endMin &&
      (i === 0 || blocks[i - 1]!.endMin < block.startMin),
  );
}

export function dayFromBlocks(blocks: Block[]): WorkDay | null {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  return {
    startMin: first.startMin,
    endMin: last.endMin,
    breaks: sorted
      .slice(1)
      .map((block, i) => ({ startMin: sorted[i]!.endMin, endMin: block.startMin })),
  };
}

/** The day's working blocks, or null when a break doesn't fit inside the working hours. */
export function blocksFromDay(day: WorkDay): Block[] | null {
  const breaks = [...day.breaks].sort((a, b) => a.startMin - b.startMin);
  const blocks: Block[] = [];
  let cursor = day.startMin;
  for (const pause of breaks) {
    if (pause.startMin >= pause.endMin) return null;
    blocks.push({ startMin: cursor, endMin: pause.startMin });
    cursor = pause.endMin;
  }
  blocks.push({ startMin: cursor, endMin: day.endMin });
  return blocksAreValid(blocks) ? blocks : null;
}

/** "Today I leave at 16:00": what's left of the day's blocks. */
export function clipBlocks(blocks: Block[], leaveAt: number): Block[] {
  return blocks
    .filter((block) => block.startMin < leaveAt)
    .map((block) => ({ startMin: block.startMin, endMin: Math.min(block.endMin, leaveAt) }));
}

export type ChangeKind = 'DAY_OFF' | 'CUSTOM_HOURS';

export type DayChange = {
  date: string;
  type: ChangeKind;
  reason: string | null;
  blocks: Block[];
};

export type GroupedChange = {
  from: string;
  to: string;
  type: ChangeKind;
  reason: string | null;
  blocks: Block[];
};

const sameChange = (a: GroupedChange, b: DayChange) =>
  a.type === b.type &&
  a.reason === b.reason &&
  JSON.stringify(a.blocks) === JSON.stringify(b.blocks);

/** One row per run of identical days, so a two-week holiday is one line and not fourteen. */
export function groupChanges(days: DayChange[]): GroupedChange[] {
  const out: GroupedChange[] = [];
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const last = out[out.length - 1];
    const lastDate = last && parseDateKey(last.to);
    if (last && lastDate && dateKey(addDays(lastDate, 1)) === day.date && sameChange(last, day)) {
      last.to = day.date;
    } else {
      out.push({
        from: day.date,
        to: day.date,
        type: day.type,
        reason: day.reason,
        blocks: day.blocks,
      });
    }
  }
  return out;
}

/** Bookings that the current hours no longer cover: someone has to move or cancel them. */
export function countBookingsOutsideHours(
  bookings: { startAt: Date; endAt: Date }[],
  weekly: WeeklyBlock[],
  overridesFor: (date: CalendarDate) => DayOverride[],
): number {
  return bookings.filter((booking) => {
    const date = tashkentDate(booking.startAt);
    const windows = workingWindows(date, weekly, overridesFor(date));
    if (windows === 'day_off') return true;
    const start = minuteOfDay(booking.startAt);
    const end = start + (booking.endAt.getTime() - booking.startAt.getTime()) / 60_000;
    return !windows.some((window) => start >= window.start && end <= window.end);
  }).length;
}
