import { toTashkent } from '@/domain/time';
import { interpolate } from './interpolate';
import type { Locale } from './locales';
import { getMessages } from './messages';

const NBSP = ' ';

/** 1234567 → "1 234 567", with no-break spaces so amounts never wrap mid-number. */
export function groupDigits(value: number): string {
  const sign = value < 0 ? '-' : '';
  return sign + String(Math.abs(Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Integer UZS → "60 000 soʻm" / "60 000 сўм" / "60 000 сум". */
export function formatMoney(amount: number, locale: Locale): string {
  return `${groupDigits(amount)}${NBSP}${getMessages(locale).units.currency}`;
}

/** 40 → "40 daq"; 80 → "1 soat 20 daq"; 120 → "2 soat". */
export function formatDuration(totalMinutes: number, locale: Locale): string {
  const { units } = getMessages(locale);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return interpolate(units.minutes, { m });
  if (m === 0) return interpolate(units.hours, { h });
  return interpolate(units.hoursMinutes, { h, m });
}

/** "14:00" in Tashkent time. */
export function formatTime(instant: Date): string {
  const { hour, minute } = toTashkent(instant);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** "3-noyabr" / "3-ноябр" / "3 ноября", in Tashkent time. */
export function formatDayMonth(instant: Date, locale: Locale): string {
  const { calendar } = getMessages(locale);
  const { day, month } = toTashkent(instant);
  return interpolate(calendar.dayMonth, { day, month: calendar.months[month - 1] ?? '' });
}

/** "Seshanba" or, with `short`, "Se" — Monday-first, in Tashkent time. */
export function formatWeekday(instant: Date, locale: Locale, short = false): string {
  const { calendar } = getMessages(locale);
  const list = short ? calendar.weekdaysShort : calendar.weekdays;
  return list[toTashkent(instant).weekday - 1] ?? '';
}

export type PluralForms = { one: string; few: string; many: string };

/**
 * Picks the plural form for a count. Uzbek doesn't inflect nouns after numbers, so it always uses
 * `one`; Russian follows its one/few/many rules (1 клиент, 2 клиента, 5 клиентов, 21 клиент).
 */
export function pluralize(count: number, forms: PluralForms, locale: Locale): string {
  if (locale !== 'ru') return forms.one;
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (n >= 11 && n <= 14) return forms.many;
  if (last === 1) return forms.one;
  if (last >= 2 && last <= 4) return forms.few;
  return forms.many;
}
