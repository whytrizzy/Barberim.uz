import { describe, expect, it } from 'vitest';
import { fromTashkent } from '@/domain/time';
import {
  formatDayMonth,
  formatDuration,
  formatMoney,
  formatTime,
  formatWeekday,
  groupDigits,
  pluralize,
} from './format';
import { interpolate, placeholders } from './interpolate';
import { isLocale, localeFromLanguageCode, locales } from './locales';
import { getMessages } from './messages';

const NBSP = ' ';

/** Every string in a dictionary with its dotted path (array items get their index). */
function leaves(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leaves(child, path ? `${path}.${key}` : key),
  );
}

describe('dictionaries', () => {
  const base = leaves(getMessages('uz-Latn'));

  it.each(locales)('%s has every key and keeps every placeholder', (locale) => {
    const other = new Map(leaves(getMessages(locale)));
    for (const [path, text] of base) {
      expect(other.has(path), `${locale} is missing ${path}`).toBe(true);
      expect(placeholders(other.get(path) ?? ''), `${locale} ${path}`).toEqual(placeholders(text));
    }
  });

  it('generates Uzbek Cyrillic with no Latin letters left (brands and code aside)', () => {
    const allowed = /Barberim|Telegram|Mini App|NEXT_PUBLIC_APP_URL|https:|\/start|Dev|\{\w+\}/g;
    for (const [path, text] of leaves(getMessages('uz-Cyrl'))) {
      expect(text.replace(allowed, ''), path).not.toMatch(/[A-Za-z]/);
    }
  });

  it('uses the Cyrillic overrides', () => {
    const cyrl = getMessages('uz-Cyrl');
    expect(cyrl.meta.name).toBe('Ўзбекча');
    expect(cyrl.calendar.months[5]).toBe('июн');
    expect(cyrl.common.continue).toBe('Давом этиш');
  });
});

describe('locales', () => {
  it('guesses from Telegram language codes', () => {
    expect(localeFromLanguageCode('ru')).toBe('ru');
    expect(localeFromLanguageCode('uz')).toBe('uz-Latn');
    expect(localeFromLanguageCode('uz-Cyrl')).toBe('uz-Cyrl');
    expect(localeFromLanguageCode('en')).toBe('uz-Latn');
    expect(localeFromLanguageCode(undefined)).toBe('uz-Latn');
    expect(isLocale('ru')).toBe(true);
    expect(isLocale('en')).toBe(false);
  });
});

describe('formatting', () => {
  // Tuesday 3 November 2026, 14:00 in Tashkent.
  const tuesday = fromTashkent(2026, 11, 3, 14, 0);

  it('formats money with no-break spaces in each language', () => {
    expect(groupDigits(1234567)).toBe(`1${NBSP}234${NBSP}567`);
    expect(formatMoney(60000, 'uz-Latn')).toBe(`60${NBSP}000${NBSP}soʻm`);
    expect(formatMoney(60000, 'uz-Cyrl')).toBe(`60${NBSP}000${NBSP}сўм`);
    expect(formatMoney(60000, 'ru')).toBe(`60${NBSP}000${NBSP}сум`);
    expect(formatMoney(500, 'uz-Latn')).toBe(`500${NBSP}soʻm`);
  });

  it('formats durations', () => {
    expect(formatDuration(40, 'uz-Latn')).toBe('40 daq');
    expect(formatDuration(80, 'uz-Latn')).toBe('1 soat 20 daq');
    expect(formatDuration(120, 'ru')).toBe('2 ч');
    expect(formatDuration(90, 'uz-Cyrl')).toBe('1 соат 30 дақ');
  });

  it('formats dates in Tashkent time', () => {
    expect(formatTime(tuesday)).toBe('14:00');
    expect(formatDayMonth(tuesday, 'uz-Latn')).toBe('3-noyabr');
    expect(formatDayMonth(tuesday, 'uz-Cyrl')).toBe('3-ноябр');
    expect(formatDayMonth(tuesday, 'ru')).toBe('3 ноября');
    expect(formatWeekday(tuesday, 'uz-Latn')).toBe('Seshanba');
    expect(formatWeekday(tuesday, 'uz-Cyrl', true)).toBe('Се');
    expect(formatWeekday(tuesday, 'ru', true)).toBe('Вт');
  });

  it('pluralizes Russian and leaves Uzbek alone', () => {
    const forms = { one: 'клиент', few: 'клиента', many: 'клиентов' };
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => pluralize(n, forms, 'ru'))).toEqual([
      'клиент',
      'клиента',
      'клиентов',
      'клиентов',
      'клиент',
      'клиента',
      'клиентов',
    ]);
    expect(pluralize(5, { one: 'mijoz', few: 'mijoz', many: 'mijoz' }, 'uz-Latn')).toBe('mijoz');
  });

  it('interpolates placeholders', () => {
    expect(interpolate('{h} soat {m} daq', { h: 1, m: 5 })).toBe('1 soat 5 daq');
    expect(interpolate('{missing} ok', {})).toBe('{missing} ok');
  });
});
