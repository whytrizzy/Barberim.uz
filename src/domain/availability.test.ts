import { describe, expect, it } from 'vitest';
import {
  checkSlot,
  dayAvailability,
  defaultBookingRules,
  workingWindows,
  type BookingRules,
  type DayInput,
  type WeeklyBlock,
} from './availability';
import { addDays, fromTashkent, parseDateKey, weekdayOf, type CalendarDate } from './time';

const hm = (h: number, m = 0) => h * 60 + m;
const label = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Tuesday 3 Nov 2026; "now" is Monday 2 Nov 2026 09:00 Tashkent unless a test says otherwise.
const tuesday: CalendarDate = { year: 2026, month: 11, day: 3 };
const mondayMorning = fromTashkent(2026, 11, 2, 9, 0);
const at = (date: CalendarDate, h: number, m = 0) =>
  fromTashkent(date.year, date.month, date.day, h, m);

/** Mon–Sat 10:00–13:20 and 14:00–20:00 (lunch), Friday 10:00–12:30 and 14:00–20:00 (prayer). */
const shopWeek: WeeklyBlock[] = [1, 2, 3, 4, 5, 6].flatMap((weekday) =>
  weekday === 5
    ? [
        { weekday, startMin: hm(10), endMin: hm(12, 30) },
        { weekday, startMin: hm(14), endMin: hm(20) },
      ]
    : [
        { weekday, startMin: hm(10), endMin: hm(13, 20) },
        { weekday, startMin: hm(14), endMin: hm(20) },
      ],
);

const rules: BookingRules = { ...defaultBookingRules, slotStepMin: 20, minNoticeMin: 60 };

function day(overrides: Partial<DayInput> = {}): DayInput {
  return {
    date: tuesday,
    weekly: shopWeek,
    overrides: [],
    busy: [],
    durationMin: 40,
    rules,
    now: mondayMorning,
    ...overrides,
  };
}

const times = (input: DayInput, state?: string) =>
  dayAvailability(input)
    .slots.filter((s) => !state || s.state === state)
    .map((s) => label(s.startMin));

describe('calendar helpers', () => {
  it('knows weekdays and parses date keys', () => {
    expect(weekdayOf(tuesday)).toBe(2);
    expect(weekdayOf({ year: 2026, month: 11, day: 8 })).toBe(7); // Sunday
    expect(parseDateKey('2026-11-03')).toEqual(tuesday);
    expect(parseDateKey('2026-02-30')).toBeNull();
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
  });
});

describe('working windows', () => {
  it('uses the weekly blocks of that weekday, with the break between them', () => {
    expect(workingWindows(tuesday, shopWeek, [])).toEqual([
      { start: hm(10), end: hm(13, 20) },
      { start: hm(14), end: hm(20) },
    ]);
  });

  it('gives Friday its prayer break', () => {
    const friday = { year: 2026, month: 11, day: 6 };
    expect(workingWindows(friday, shopWeek, [])[0]).toEqual({ start: hm(10), end: hm(12, 30) });
  });

  it('lets a day off win, and custom hours replace the week', () => {
    expect(workingWindows(tuesday, shopWeek, [{ type: 'DAY_OFF' }])).toBe('day_off');
    expect(
      workingWindows(tuesday, shopWeek, [
        { type: 'CUSTOM_HOURS', startMin: hm(10), endMin: hm(16) },
      ]),
    ).toEqual([{ start: hm(10), end: hm(16) }]);
  });

  it('merges overlapping blocks and drops empty ones', () => {
    const messy: WeeklyBlock[] = [
      { weekday: 2, startMin: hm(14), endMin: hm(18) },
      { weekday: 2, startMin: hm(10), endMin: hm(15) },
      { weekday: 2, startMin: hm(19), endMin: hm(19) },
    ];
    expect(workingWindows(tuesday, messy, [])).toEqual([{ start: hm(10), end: hm(18) }]);
  });
});

describe('dayAvailability', () => {
  it('offers a 20-minute grid that fits the service inside each window', () => {
    const all = times(day());
    expect(all.slice(0, 4)).toEqual(['10:00', '10:20', '10:40', '11:00']);
    // Last morning start: 12:40 ends 13:20 exactly at the lunch break.
    expect(all).toContain('12:40');
    expect(all).not.toContain('13:00');
    // Afternoon restarts at 14:00; last start 19:20 ends at 20:00.
    expect(all).toContain('14:00');
    expect(all[all.length - 1]).toBe('19:20');
    expect(dayAvailability(day()).status).toBe('open');
  });

  it('never offers a time that would run into the break', () => {
    const long = times(day({ durationMin: 60 }));
    expect(long).toContain('12:20'); // 12:20–13:20
    expect(long).not.toContain('12:40'); // would end 13:40, inside lunch
  });

  it('marks times overlapping a booking as taken', () => {
    const busy = [{ startAt: at(tuesday, 10, 0), endAt: at(tuesday, 10, 40) }];
    const slots = dayAvailability(day({ busy })).slots;
    const state = (t: string) => slots.find((s) => label(s.startMin) === t)?.state;
    expect(state('10:00')).toBe('taken');
    expect(state('10:20')).toBe('taken');
    expect(state('10:40')).toBe('available'); // back to back
  });

  it('adds a start right after an off-grid booking so the day packs without gaps', () => {
    // A walk-in 10:00–10:50 leaves 10:50 free; the grid alone would waste 10:50–11:00.
    const busy = [{ startAt: at(tuesday, 10, 0), endAt: at(tuesday, 10, 50) }];
    const available = times(day({ busy }), 'available');
    expect(available[0]).toBe('10:50');
    expect(available).toContain('11:00');
  });

  it('keeps the buffer free around bookings', () => {
    const busy = [{ startAt: at(tuesday, 11, 0), endAt: at(tuesday, 11, 40) }];
    const withBuffer = day({ busy, rules: { ...rules, bufferMin: 10 } });
    const available = times(withBuffer, 'available');
    expect(available).not.toContain('10:20'); // 10:20–11:00 leaves no 10-minute gap
    expect(available).toContain('11:50'); // smart start: 11:40 + 10 buffer
    expect(available).not.toContain('11:40');
  });

  it('handles bookings that started the day before or run past midnight', () => {
    const lateNight = [{ startAt: fromTashkent(2026, 11, 2, 23, 0), endAt: at(tuesday, 10, 30) }];
    expect(times(day({ busy: lateNight }), 'available')[0]).toBe('10:30');
  });

  it('marks today’s times inside the notice period as too soon', () => {
    const now = at(tuesday, 11, 5); // + 60 min notice = 12:05
    const slots = dayAvailability(day({ now })).slots;
    expect(slots.filter((s) => s.state === 'too_soon').map((s) => label(s.startMin))).toEqual([
      '10:00',
      '10:20',
      '10:40',
      '11:00',
      '11:20',
      '11:40',
      '12:00',
    ]);
    expect(slots.find((s) => s.state === 'available')?.startMin).toBe(hm(12, 20));
  });

  it('reports full when everything is taken or too soon', () => {
    const now = at(tuesday, 19, 0);
    expect(dayAvailability(day({ now })).status).toBe('full');
  });

  it('reports closed days, days off, past dates and dates beyond the horizon', () => {
    const sunday = { year: 2026, month: 11, day: 8 };
    expect(dayAvailability(day({ date: sunday })).status).toBe('closed');
    expect(dayAvailability(day({ overrides: [{ type: 'DAY_OFF' }] })).status).toBe('day_off');
    expect(dayAvailability(day({ now: at(addDays(tuesday, 1), 9) })).status).toBe('past');
    expect(dayAvailability(day({ date: addDays(tuesday, 40) })).status).toBe('beyond_horizon');
    expect(
      dayAvailability(day({ date: addDays({ year: 2026, month: 11, day: 2 }, 30) })).status,
    ).not.toBe('beyond_horizon');
  });

  it('computes in Tashkent time no matter where "now" is formatted', () => {
    // 23:30 UTC Monday is already 04:30 Tuesday in Tashkent: Tuesday is "today", not tomorrow.
    const now = new Date('2026-11-02T23:30:00Z');
    expect(dayAvailability(day({ now })).status).toBe('open');
    expect(dayAvailability(day({ now, date: { year: 2026, month: 11, day: 2 } })).status).toBe(
      'past',
    );
  });

  it('returns instants that match the Tashkent wall-clock time', () => {
    const first = dayAvailability(day()).slots[0];
    expect(first?.startAt.toISOString()).toBe('2026-11-03T05:00:00.000Z'); // 10:00 Tashkent
    expect(first?.endAt.toISOString()).toBe('2026-11-03T05:40:00.000Z');
  });
});

describe('checkSlot', () => {
  const busy = [{ startAt: at(tuesday, 10, 0), endAt: at(tuesday, 10, 50) }];

  it('accepts an offered start, including a smart one', () => {
    expect(checkSlot(day({ busy }), at(tuesday, 10, 50))).toEqual({ ok: true });
    expect(checkSlot(day({ busy }), at(tuesday, 11, 0))).toEqual({ ok: true });
  });

  it('gives the reason a start can’t be booked', () => {
    expect(checkSlot(day({ busy }), at(tuesday, 10, 20))).toEqual({ ok: false, reason: 'taken' });
    expect(checkSlot(day(), at(tuesday, 13, 0))).toEqual({ ok: false, reason: 'outside_hours' });
    expect(checkSlot(day(), at(tuesday, 9, 0))).toEqual({ ok: false, reason: 'outside_hours' });
    expect(checkSlot(day({ now: at(tuesday, 11, 0) }), at(tuesday, 11, 20))).toEqual({
      ok: false,
      reason: 'too_soon',
    });
    expect(checkSlot(day({ overrides: [{ type: 'DAY_OFF' }] }), at(tuesday, 11))).toEqual({
      ok: false,
      reason: 'day_off',
    });
  });

  it('refuses arbitrary minutes from clients but lets staff place a walk-in anywhere it fits', () => {
    expect(checkSlot(day(), at(tuesday, 11, 7))).toEqual({ ok: false, reason: 'not_offered' });
    expect(checkSlot(day(), at(tuesday, 11, 7), { anyStart: true })).toEqual({ ok: true });
  });
});

describe('invariants (randomized)', () => {
  // Small deterministic PRNG so failures are reproducible.
  function rng(seed: number) {
    return () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  it('never offers a time that overlaps a booking, leaves hours, or breaks the notice', () => {
    const random = rng(20261103);
    const pick = (n: number) => Math.floor(random() * n);
    for (let run = 0; run < 500; run++) {
      const durationMin = [15, 20, 30, 40, 60, 90, 120][pick(7)] ?? 40;
      const bufferMin = [0, 5, 10][pick(3)] ?? 0;
      const busy = Array.from({ length: pick(6) }, () => {
        const start = hm(9) + pick(12 * 12) * 5;
        return { startAt: at(tuesday, 0, start), endAt: at(tuesday, 0, start + 10 + pick(12) * 5) };
      });
      const now = at(tuesday, 7 + pick(14), pick(60));
      const input = day({ durationMin, busy, now, rules: { ...rules, bufferMin } });
      const windows = workingWindows(tuesday, shopWeek, []);
      if (windows === 'day_off') throw new Error('unexpected');

      for (const slot of dayAvailability(input).slots.filter((s) => s.state === 'available')) {
        const start = slot.startAt.getTime();
        const end = slot.endAt.getTime();
        for (const b of busy) {
          const bStart = b.startAt.getTime() - bufferMin * 60_000;
          const bEnd = b.endAt.getTime() + bufferMin * 60_000;
          expect(start < bEnd && bStart < end, `run ${run}: overlaps a booking`).toBe(false);
        }
        expect(
          windows.some((w) => slot.startMin >= w.start && slot.startMin + durationMin <= w.end),
          `run ${run}: outside hours`,
        ).toBe(true);
        expect(start >= now.getTime() + rules.minNoticeMin * 60_000, `run ${run}: too soon`).toBe(
          true,
        );
        expect(checkSlot(input, slot.startAt), `run ${run}: checkSlot disagrees`).toEqual({
          ok: true,
        });
      }
    }
  });
});
