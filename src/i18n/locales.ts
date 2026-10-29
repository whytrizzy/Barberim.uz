export const locales = ['uz-Latn', 'uz-Cyrl', 'ru'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'uz-Latn';

/** Cookie the server reads to render in the right language; set when the user picks one. */
export const LOCALE_COOKIE = 'barberim_locale';
/** localStorage mirror, for Telegram Web where the Mini App is an iframe and cookies may be blocked. */
export const LOCALE_STORAGE_KEY = 'barberim.locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/**
 * Best guess from Telegram's (or the browser's) language code. Telegram can't tell Latin from
 * Cyrillic Uzbek, so "uz" means Latin — the user confirms or switches on first launch.
 */
export function localeFromLanguageCode(code: string | undefined | null): Locale {
  const lang = (code ?? '').toLowerCase();
  if (lang.startsWith('ru')) return 'ru';
  if (lang.startsWith('uz')) return lang.includes('cyrl') ? 'uz-Cyrl' : 'uz-Latn';
  return defaultLocale;
}

/** Value for <html lang>. */
export function htmlLang(locale: Locale): string {
  return locale;
}
