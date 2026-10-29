/**
 * Business time is Asia/Tashkent: UTC+5 all year (Uzbekistan has no daylight saving time).
 * Instants are stored as UTC `Date`s; these helpers convert to and from Tashkent wall-clock time
 * without relying on the device's time zone or on Intl time-zone data being present.
 */

export const TASHKENT_OFFSET_MINUTES = 5 * 60;
const OFFSET_MS = TASHKENT_OFFSET_MINUTES * 60_000;

export type TashkentParts = {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  /** 1 = Monday … 7 = Sunday */
  weekday: number;
  hour: number;
  minute: number;
};

export function toTashkent(instant: Date): TashkentParts {
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  const jsWeekday = shifted.getUTCDay(); // 0 = Sunday
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: jsWeekday === 0 ? 7 : jsWeekday,
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** The UTC instant of a Tashkent wall-clock time. */
export function fromTashkent(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - OFFSET_MS);
}

/** Minutes since Tashkent midnight, e.g. 14:30 → 870. Schedules are stored this way. */
export function minuteOfDay(instant: Date): number {
  const { hour, minute } = toTashkent(instant);
  return hour * 60 + minute;
}

/** "HH:MM" for a minute-of-day value. */
export function formatMinuteOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Same Tashkent calendar day? */
export function isSameTashkentDay(a: Date, b: Date): boolean {
  const x = toTashkent(a);
  const y = toTashkent(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}
