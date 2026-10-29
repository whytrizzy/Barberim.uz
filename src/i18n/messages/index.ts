import type { Locale } from '../locales';
import { latinToCyrillic } from '../translit';
import { ru } from './ru';
import { uzLatn, type Messages } from './uz-latn';

export type { Messages };

/**
 * uz-Cyrl overrides, keyed by dotted path, for the few strings the transliteration rules get
 * wrong (or where Cyrillic usage differs, like 2-letter weekday abbreviations).
 */
const cyrillicOverrides: Record<string, string | string[]> = {
  'meta.name': 'Ўзбекча',
  'calendar.weekdaysShort': ['Ду', 'Се', 'Чо', 'Па', 'Жу', 'Ша', 'Як'],
  'calendar.months': [
    'январ',
    'феврал',
    'март',
    'апрел',
    'май',
    'июн',
    'июл',
    'август',
    'сентябр',
    'октябр',
    'ноябр',
    'декабр',
  ],
};

function toCyrillic<T>(value: T, path: string): T {
  const override = cyrillicOverrides[path];
  if (override !== undefined) return override as T;
  if (typeof value === 'string') return latinToCyrillic(value) as T;
  if (Array.isArray(value)) return value.map((item) => latinToCyrillic(item as string)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = toCyrillic(child, path ? `${path}.${key}` : key);
  }
  return out as T;
}

const uzCyrl: Messages = toCyrillic(uzLatn, '');

const dictionaries: Record<Locale, Messages> = {
  'uz-Latn': uzLatn,
  'uz-Cyrl': uzCyrl,
  ru,
};

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}
