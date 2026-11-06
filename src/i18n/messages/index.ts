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
  // "QR" and "Instagram" stay in Latin letters, as Uzbek Cyrillic writes them.
  'share.storyTitle': 'Instagram сторис',
  'share.storyHint': 'Сторис учун расм. Юклаб олинг ва Instagramга жойланг.',
  'share.qrTitle': 'QR код',
  'share.qrHint': 'Фақат QR код — визитка, нархлар рўйхати ёки ойна учун.',
  'share.intro': 'Мижозлар сизни топиши учун: Instagram сторис, эшикдаги плакат ёки QR код.',
  'share.scan': 'Камерани QR кодга қаратинг',
  'share.step1': 'Телефон камерасини QR кодга қаратинг',
  'share.openKit': 'QR код, сторис ва плакат',
  // The plan's name stays "PRO", like a brand.
  'plans.badge': 'PRO',
  'plans.proTitle': 'PRO',
  'plans.freeItems': [
    'Битта уста — сиз',
    'Онлайн ёзилиш ва календар',
    'Эслатмалар ва кутиш рўйхати',
    'Шарҳлар ва улашиш (QR, плакат)',
    'Ишлар намунаси: 3 та расм',
  ],
  'plans.everyonePro':
    'Ҳозирча барча сартарошхоналар PRO тарифида — бепул. Тўлов ёқилишидан олдин хабар берамиз.',
  'plans.upgradeSoon': 'PRO га ўтиш — тез орада',
  'plans.locked': 'Бу имконият PRO тарифида.',
  'plans.lockedTitle': 'PRO имконияти',
  'plans.lockedHint':
    '{feature} PRO тарифида очилади. Бепул тарифда сақланган маълумотларингиз ўчмайди.',
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
