import { describe, expect, it } from 'vitest';
import type { DayAvailability, Slot, SlotState } from './availability';
import { combineMasters, groupDuration, rankMasters, splitGroup, type MasterDay } from './combine';

const base = new Date('2030-01-08T05:00:00Z'); // 10:00 Tashkent
const slot = (startMin: number, state: SlotState): Slot => ({
  startMin,
  startAt: new Date(base.getTime() + (startMin - 600) * 60_000),
  endAt: new Date(base.getTime() + (startMin - 560) * 60_000),
  state,
});
const day = (slots: Slot[], status: DayAvailability['status'] = 'open'): DayAvailability => ({
  status,
  slots,
});
const master = (staffId: string, slots: Slot[], extra: Partial<MasterDay> = {}): MasterDay => ({
  staffId,
  sortOrder: 0,
  load: 0,
  availability: day(slots),
  ...extra,
});

describe('rankMasters', () => {
  it('prefers the least busy master, then the shop’s order', () => {
    const ranked = rankMasters([
      { staffId: 'a', sortOrder: 1, load: 3 },
      { staffId: 'b', sortOrder: 2, load: 1 },
      { staffId: 'c', sortOrder: 0, load: 1 },
    ]);
    expect(ranked.map((m) => m.staffId)).toEqual(['c', 'b', 'a']);
  });
});

describe('combineMasters', () => {
  it('offers a time when any master is free, listing who can take it', () => {
    const combined = combineMasters([
      master('jasur', [slot(600, 'taken'), slot(620, 'available')], { load: 4, sortOrder: 1 }),
      master('sardor', [slot(600, 'available'), slot(620, 'available')], { load: 2, sortOrder: 2 }),
    ]);
    expect(combined.status).toBe('open');
    expect(combined.slots).toEqual([
      expect.objectContaining({ startMin: 600, state: 'available', candidates: ['sardor'] }),
      expect.objectContaining({
        startMin: 620,
        state: 'available',
        candidates: ['sardor', 'jasur'],
      }),
    ]);
  });

  it('includes starts only one master has (different hours or durations)', () => {
    const combined = combineMasters([
      master('a', [slot(600, 'available')]),
      master('b', [slot(615, 'available')]),
    ]);
    expect(combined.slots.map((s) => s.startMin)).toEqual([600, 615]);
  });

  it('shows "too soon" rather than "taken" when masters differ', () => {
    const combined = combineMasters([
      master('a', [slot(600, 'taken')]),
      master('b', [slot(600, 'too_soon')]),
    ]);
    expect(combined.slots[0]).toMatchObject({ state: 'too_soon', candidates: [] });
    expect(combined.status).toBe('full');
  });

  it('reports the day like the masters when none of them works', () => {
    const off = (id: string): MasterDay => ({
      staffId: id,
      sortOrder: 0,
      load: 0,
      availability: day([], 'day_off'),
    });
    expect(combineMasters([off('a'), off('b')]).status).toBe('day_off');
    expect(
      combineMasters([off('a'), { ...off('b'), availability: day([], 'closed') }]).status,
    ).toBe('closed');
    expect(combineMasters([]).status).toBe('closed');
  });
});

describe('splitGroup', () => {
  it('places family members back to back', () => {
    const members = [{ durationMin: 40 }, { durationMin: 30 }, { durationMin: 30 }];
    expect(groupDuration(members)).toBe(100);
    expect(
      splitGroup(base, members).map((m) => [m.startAt.toISOString(), m.endAt.toISOString()]),
    ).toEqual([
      ['2030-01-08T05:00:00.000Z', '2030-01-08T05:40:00.000Z'],
      ['2030-01-08T05:40:00.000Z', '2030-01-08T06:10:00.000Z'],
      ['2030-01-08T06:10:00.000Z', '2030-01-08T06:40:00.000Z'],
    ]);
  });
});
