import 'server-only';
import { cookies } from 'next/headers';
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from './locales';

/**
 * The request's locale from the cookie the client sets when the user picks a language.
 * `chosen` is false on a first visit, when the first-launch language picker should show.
 */
export async function getRequestLocale(): Promise<{ locale: Locale; chosen: boolean }> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value)
    ? { locale: value, chosen: true }
    : { locale: defaultLocale, chosen: false };
}
