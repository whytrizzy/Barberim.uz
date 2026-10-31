import { describe, expect, it } from 'vitest';
import {
  blocksAreValid,
  blocksFromDay,
  clipBlocks,
  countBookingsOutsideHours,
  dayFromBlocks,
  groupChanges,
  type DayChange,
} from './schedule';
import { fromTashkent } from './time';

const block = (startMin: number, endMin: number) => ({ startMin, endMin });

describe('work days and blocks', () => {
  it('turns hours with breaks into blocks and back', () => {
    const day = { startMin: 540, endMin: 1140, breaks: [block(780, 840)] };
    const blocks = [block(540, 780), block(840, 1140)];
    expect(blocksFromDay(day)).toEqual(blocks);
    expect(dayFromBlocks(blocks)).toEqual(day);
    expect(dayFromBlocks([])).toBeNull();
  });

  it('sorts breaks entered out of order', () => {
    const day = { startMin: 540, endMin: 1140, breaks: [block(900, 930), block(780, 840)] };
    expect(blocksFromDay(day)).toEqual([block(540, 780), block(840, 900), block(930, 1140)]);
  });

  it('refuses breaks outside the hours, overlapping or backwards', () => {
    const hours = { startMin: 540, endMin: 1140 };
    expect(blocksFromDay({ ...hours, breaks: [block(500, 600)] })).toBeNull();
    expect(blocksFromDay({ ...hours, breaks: [block(1100, 1200)] })).toBeNull();
    expect(blocksFromDay({ ...hours, breaks: [block(600, 700), block(650, 750)] })).toBeNull();
    expect(blocksFromDay({ ...hours, breaks: [block(700, 600)] })).toBeNull();
    expect(blocksFromDay({ startMin: 600, endMin: 500, breaks: [] })).toBeNull();
  });

  it('checks stored blocks', () => {
    expect(blocksAreValid([block(540, 780), block(840, 1140)])).toBe(true);
    expect(blocksAreValid([block(540, 780), block(780, 1140)])).toBe(false);
    expect(blocksAreValid([block(840, 1140), block(540, 780)])).toBe(false);
    expect(blocksAreValid([block(0, 1441)])).toBe(false);
  });

  it('clips a day for "today I leave at 16:00"', () => {
    const blocks = [block(540, 780), block(840, 1140)];
    expect(clipBlocks(blocks, 960)).toEqual([block(540, 780), block(840, 960)]);
    expect(clipBlocks(blocks, 800)).toEqual([block(540, 780)]);
    expect(clipBlocks(blocks, 500)).toEqual([]);
  });
});

describe('groupChanges', () => {
  const off = (date: string): DayChange => ({ date, type: 'DAY_OFF', reason: null, blocks: [] });

  it('joins consecutive identical days, across a month end', () => {
    expect(groupChanges([off('2026-12-01'), off('2026-11-30'), off('2026-11-29')])).toEqual([
      { from: '2026-11-29', to: '2026-12-01', type: 'DAY_OFF', reason: null, blocks: [] },
    ]);
  });

  it('keeps gaps and different changes apart', () => {
    const custom: DayChange = {
      date: '2026-11-03',
      type: 'CUSTOM_HOURS',
      reason: null,
      blocks: [block(540, 960)],
    };
    const rows = groupChanges([off('2026-11-01'), custom, off('2026-11-02'), off('2026-11-05')]);
    expect(rows.map((r) => [r.from, r.to, r.type])).toEqual([
      ['2026-11-01', '2026-11-02', 'DAY_OFF'],
      ['2026-11-03', '2026-11-03', 'CUSTOM_HOURS'],
      ['2026-11-05', '2026-11-05', 'DAY_OFF'],
    ]);
  });
});

describe('countBookingsOutsideHours', () => {
  // 2026-11-02 is a Monday.
  const at = (hour: number, minutes = 30) => ({
    startAt: fromTashkent(2026, 11, 2, hour),
    endAt: new Date(fromTashkent(2026, 11, 2, hour).getTime() + minutes * 60_000),
  });
  const weekly = [{ weekday: 1, startMin: 540, endMin: 780 }];

  it('counts bookings outside the hours or overrunning them', () => {
    expect(countBookingsOutsideHours([at(10)], weekly, () => [])).toBe(0);
    expect(countBookingsOutsideHours([at(14)], weekly, () => [])).toBe(1);
    expect(countBookingsOutsideHours([at(12, 90)], weekly, () => [])).toBe(1);
  });

  it('follows day-off and custom-hours changes', () => {
    expect(countBookingsOutsideHours([at(10)], weekly, () => [{ type: 'DAY_OFF' }])).toBe(1);
    const custom = () => [{ type: 'CUSTOM_HOURS' as const, startMin: 840, endMin: 900 }];
    expect(countBookingsOutsideHours([at(14)], weekly, custom)).toBe(0);
  });
});
