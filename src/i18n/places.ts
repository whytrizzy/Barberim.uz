import { regions, tashkentDistricts, type Place } from '@/domain/places';
import type { Locale } from './locales';
import { latinToCyrillic } from './translit';

/** A region or district name in the user's language. */
export function placeName(place: Place, locale: Locale): string {
  if (locale === 'ru') return place.ru;
  return locale === 'uz-Cyrl' ? latinToCyrillic(place.uz) : place.uz;
}

export const regionOptions = (locale: Locale) =>
  regions.map((r) => ({ value: r.key, label: placeName(r, locale) }));

export const districtOptions = (locale: Locale) =>
  tashkentDistricts.map((d) => ({ value: d.key, label: placeName(d, locale) }));

/** A stored district (a Tashkent key or free text) for display. */
export function districtName(value: string | null, locale: Locale): string {
  if (!value) return '';
  const known = tashkentDistricts.find((d) => d.key === value);
  if (known) return placeName(known, locale);
  return locale === 'uz-Cyrl' ? latinToCyrillic(value) : value;
}
