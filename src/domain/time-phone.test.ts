import { describe, expect, it } from 'vitest';
import { formatUzPhone, isUzPhone, normalizeUzPhone } from './phone';
import {
  formatMinuteOfDay,
  fromTashkent,
  isSameTashkentDay,
  minuteOfDay,
  toTashkent,
} from './time';

describe('Tashkent time', () => {
  it('converts UTC to Tashkent wall-clock (UTC+5)', () => {
    // 2026-11-03 09:00 UTC = 14:00 in Tashkent, a Tuesday.
    expect(toTashkent(new Date('2026-11-03T09:00:00Z'))).toEqual({
      year: 2026,
      month: 11,
      day: 3,
      weekday: 2,
      hour: 14,
      minute: 0,
    });
  });

  it('rolls the date over at Tashkent midnight, not UTC midnight', () => {
    // 20:30 UTC on Sunday is already 01:30 Monday in Tashkent.
    const parts = toTashkent(new Date('2026-11-08T20:30:00Z'));
    expect(parts).toMatchObject({ day: 9, weekday: 1, hour: 1, minute: 30 });
  });

  it('round-trips wall-clock times', () => {
    const instant = fromTashkent(2026, 11, 3, 10, 40);
    expect(instant.toISOString()).toBe('2026-11-03T05:40:00.000Z');
    expect(minuteOfDay(instant)).toBe(640);
  });

  it('formats minutes of day and compares days', () => {
    expect(formatMinuteOfDay(0)).toBe('00:00');
    expect(formatMinuteOfDay(870)).toBe('14:30');
    expect(
      isSameTashkentDay(fromTashkent(2026, 11, 3, 0, 5), fromTashkent(2026, 11, 3, 23, 55)),
    ).toBe(true);
    expect(
      isSameTashkentDay(fromTashkent(2026, 11, 3, 23, 55), fromTashkent(2026, 11, 4, 0, 5)),
    ).toBe(false);
  });
});

describe('UZ phone numbers', () => {
  it('normalizes the ways people type numbers', () => {
    for (const input of [
      '+998 90 123 45 67',
      '998901234567',
      '90 123 45 67',
      '+998 (90) 123-45-67',
      '8 90 123 45 67',
    ]) {
      expect(normalizeUzPhone(input)).toBe('+998901234567');
    }
  });

  it('rejects numbers that are not Uzbek', () => {
    expect(normalizeUzPhone('+7 901 234 56 78')).toBeNull();
    expect(normalizeUzPhone('12345')).toBeNull();
    expect(normalizeUzPhone('')).toBeNull();
  });

  it('formats for display', () => {
    expect(formatUzPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(formatUzPhone('not a phone')).toBe('not a phone');
    expect(isUzPhone('+998901234567')).toBe(true);
  });
});
