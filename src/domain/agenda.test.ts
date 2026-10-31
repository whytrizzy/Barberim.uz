import { describe, expect, it } from 'vitest';
import { buildAgenda, daySummary, staffActions, type AgendaBooking } from './agenda';

const window = (startMin: number, endMin: number) => ({ startMin, endMin });
const booked = (startMin: number, endMin: number): AgendaBooking => ({
  startMin,
  endMin,
  status: 'CONFIRMED',
});
const shape = (rows: ReturnType<typeof buildAgenda>) =>
  rows.map((row) => [row.kind, row.startMin, row.endMin]);

describe('buildAgenda', () => {
  it('lays out bookings, free gaps and the break in time order', () => {
    const rows = buildAgenda(
      [window(540, 780), window(840, 1140)],
      [booked(600, 660), booked(840, 900)],
      null,
    );
    expect(shape(rows)).toEqual([
      ['free', 540, 600],
      ['booking', 600, 660],
      ['free', 660, 780],
      ['break', 780, 840],
      ['booking', 840, 900],
      ['free', 900, 1140],
    ]);
  });

  it('shows bookings outside the hours, and across a break', () => {
    const rows = buildAgenda(
      [window(540, 600), window(660, 720)],
      [booked(570, 690), booked(800, 830)],
      null,
    );
    expect(shape(rows)).toEqual([
      ['free', 540, 570],
      ['booking', 570, 690],
      ['free', 690, 720],
      ['booking', 800, 830],
    ]);
  });

  it('lists bookings on a day off, and nothing else', () => {
    expect(shape(buildAgenda([], [booked(600, 630)], null))).toEqual([['booking', 600, 630]]);
    expect(buildAgenda([], [], null)).toEqual([]);
  });

  it('today: marks the client in the chair and drops free time already gone', () => {
    const rows = buildAgenda([window(540, 720)], [booked(600, 660), booked(690, 720)], 620);
    expect(shape(rows)).toEqual([
      ['booking', 600, 660],
      ['free', 660, 690],
      ['booking', 690, 720],
    ]);
    expect(rows[0]).toMatchObject({ current: true });
    expect(rows[2]).toMatchObject({ current: false });
  });

  it('does not mark a finished visit as current', () => {
    const done: AgendaBooking = { startMin: 600, endMin: 660, status: 'COMPLETED' };
    expect(buildAgenda([window(540, 720)], [done], 620)[0]).toMatchObject({ current: false });
  });

  it('skips gaps too short to use', () => {
    const rows = buildAgenda([window(600, 662)], [booked(600, 660)], null);
    expect(shape(rows)).toEqual([['booking', 600, 660]]);
  });
});

describe('daySummary', () => {
  it('leaves out cancelled visits and no-shows', () => {
    expect(
      daySummary([
        { status: 'CONFIRMED', totalPrice: 60_000 },
        { status: 'COMPLETED', totalPrice: 40_000 },
        { status: 'PENDING', totalPrice: 10_000 },
        { status: 'NO_SHOW', totalPrice: 90_000 },
        { status: 'CANCELLED_SHOP', totalPrice: 90_000 },
        { status: 'CANCELLED_CLIENT', totalPrice: 90_000 },
      ]),
    ).toEqual({ count: 3, total: 110_000 });
  });
});

describe('staffActions', () => {
  const now = new Date('2026-11-02T10:00:00Z');
  const later = new Date('2026-11-02T12:00:00Z');
  const earlier = new Date('2026-11-02T09:00:00Z');

  it('offers what fits the booking’s status and time', () => {
    expect(staffActions({ status: 'PENDING', startAt: later }, now)).toEqual([
      'confirm',
      'reschedule',
      'cancel',
    ]);
    expect(staffActions({ status: 'CONFIRMED', startAt: earlier }, now)).toEqual([
      'complete',
      'no_show',
      'reschedule',
      'cancel',
    ]);
    expect(staffActions({ status: 'COMPLETED', startAt: earlier }, now)).toEqual(['no_show']);
    expect(staffActions({ status: 'CANCELLED_SHOP', startAt: later }, now)).toEqual([]);
  });
});
