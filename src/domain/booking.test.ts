import { describe, expect, it } from 'vitest';
import {
  checkTransition,
  priceBooking,
  rebookNudgeTime,
  reminderTimes,
  type BookingStatus,
} from './booking';

describe('reminderTimes', () => {
  const visit = new Date('2030-01-08T05:00:00Z');
  const hoursBefore = (hours: number) => new Date(visit.getTime() - hours * 3_600_000);
  const kinds = (now: Date) => reminderTimes(visit, now).map((r) => r.kind);

  it('gives both to a booking made well ahead', () => {
    expect(kinds(hoursBefore(48))).toEqual(['24h', '2h']);
    const [day, soon] = reminderTimes(visit, hoursBefore(48));
    expect(day?.sendAt).toEqual(hoursBefore(24));
    expect(soon?.sendAt).toEqual(hoursBefore(2));
  });

  it('leaves out what would come straight after booking, or has passed', () => {
    expect(kinds(hoursBefore(24.5))).toEqual(['2h']);
    expect(kinds(hoursBefore(5))).toEqual(['2h']);
    expect(kinds(hoursBefore(2.5))).toEqual([]);
    expect(kinds(hoursBefore(1))).toEqual([]);
  });
});

const start = new Date('2030-01-08T05:00:00Z');
const before = new Date('2030-01-08T04:00:00Z');
const after = new Date('2030-01-08T05:30:00Z');
const booking = (status: BookingStatus) => ({ status, startAt: start });

describe('checkTransition', () => {
  it('lets the client cancel or move an upcoming booking', () => {
    expect(checkTransition('cancel', 'client', booking('CONFIRMED'), before)).toEqual({
      ok: true,
      to: 'CANCELLED_CLIENT',
    });
    expect(checkTransition('reschedule', 'client', booking('PENDING'), before)).toEqual({
      ok: true,
      to: null,
    });
  });

  it('stops the client once the booking has started', () => {
    expect(checkTransition('cancel', 'client', booking('CONFIRMED'), after)).toEqual({
      ok: false,
      reason: 'already_started',
    });
    expect(checkTransition('reschedule', 'client', booking('CONFIRMED'), start)).toEqual({
      ok: false,
      reason: 'already_started',
    });
  });

  it('reserves confirm, complete and no-show for staff', () => {
    for (const action of ['confirm', 'complete', 'no_show'] as const) {
      expect(checkTransition(action, 'client', booking('PENDING'), after)).toEqual({
        ok: false,
        reason: 'not_allowed',
      });
    }
    expect(checkTransition('confirm', 'staff', booking('PENDING'), before)).toEqual({
      ok: true,
      to: 'CONFIRMED',
    });
  });

  it('records the shop as the canceller when staff cancel', () => {
    expect(checkTransition('cancel', 'staff', booking('CONFIRMED'), after)).toEqual({
      ok: true,
      to: 'CANCELLED_SHOP',
    });
  });

  it('allows complete / no-show only after the start, and lets staff correct between them', () => {
    expect(checkTransition('complete', 'staff', booking('CONFIRMED'), before)).toEqual({
      ok: false,
      reason: 'not_started',
    });
    expect(checkTransition('no_show', 'staff', booking('CONFIRMED'), after)).toEqual({
      ok: true,
      to: 'NO_SHOW',
    });
    expect(checkTransition('complete', 'staff', booking('NO_SHOW'), after)).toEqual({
      ok: true,
      to: 'COMPLETED',
    });
  });

  it('keeps cancelled bookings final', () => {
    for (const status of ['CANCELLED_CLIENT', 'CANCELLED_SHOP'] as const) {
      for (const action of ['confirm', 'cancel', 'complete', 'no_show', 'reschedule'] as const) {
        expect(checkTransition(action, 'staff', booking(status), after)).toMatchObject({
          ok: false,
        });
      }
    }
    expect(checkTransition('cancel', 'staff', booking('COMPLETED'), after)).toEqual({
      ok: false,
      reason: 'wrong_status',
    });
  });
});

describe('priceBooking', () => {
  it('freezes names, prices and durations, using the master’s own overrides', () => {
    const result = priceBooking([
      { id: 'a', name: 'Soch olish', price: 60000, durationMin: 40 },
      {
        id: 'b',
        name: 'Soqol',
        price: 35000,
        durationMin: 20,
        durationOverride: 15,
        priceOverride: 30000,
      },
    ]);
    expect(result).toEqual({
      items: [
        {
          serviceId: 'a',
          nameSnapshot: 'Soch olish',
          priceSnapshot: 60000,
          durationSnapshot: 40,
          sortOrder: 0,
        },
        {
          serviceId: 'b',
          nameSnapshot: 'Soqol',
          priceSnapshot: 30000,
          durationSnapshot: 15,
          sortOrder: 1,
        },
      ],
      totalPrice: 90000,
      durationMin: 55,
    });
  });

  it('treats a zero override as a real price (a free service), not as "none"', () => {
    expect(
      priceBooking([{ id: 'a', name: 'X', price: 10000, durationMin: 10, priceOverride: 0 }])
        .totalPrice,
    ).toBe(0);
  });
});

describe('rebookNudgeTime', () => {
  // 18:30 in Tashkent on 8 January.
  const visit = new Date('2030-01-08T13:30:00Z');

  it('asks at 11:00 Tashkent time, 24 days after the visit', () => {
    expect(rebookNudgeTime(visit, visit)).toEqual(new Date('2030-02-01T06:00:00Z'));
  });

  it('counts days in Tashkent, not UTC', () => {
    // 01:00 on 9 January in Tashkent is still 8 January in UTC.
    const lateNight = new Date('2030-01-08T20:00:00Z');
    expect(rebookNudgeTime(lateNight, lateNight)).toEqual(new Date('2030-02-02T06:00:00Z'));
  });

  it('skips a visit marked done too long after it happened', () => {
    expect(rebookNudgeTime(visit, new Date('2030-02-01T05:30:00Z'))).toBeNull();
  });
});
