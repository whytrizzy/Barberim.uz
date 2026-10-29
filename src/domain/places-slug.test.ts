import { describe, expect, it } from 'vitest';
import {
  isInUzbekistan,
  parseCoordinates,
  regions,
  tashkentDistricts,
  yandexMapsLink,
} from './places';
import { checkSlug, slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Ustoz Barbershop', 'ustoz-barbershop'],
    ['  Barber №1 — Chilonzor!  ', 'barber-1-chilonzor'],
    ['Oʻzbek Sartarosh', 'ozbek-sartarosh'],
    ['Ғолиб Барбер', 'golib-barber'],
    ['Шахзод', 'shaxzod'],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('keeps suggestions within 40 characters without a trailing dash', () => {
    const slug = slugify('a'.repeat(39) + ' bcd');
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('checkSlug', () => {
  it('accepts normal link names and names the problem otherwise', () => {
    expect(checkSlug('ustoz-barbershop')).toBeNull();
    expect(checkSlug('a')).toBe('too_short');
    expect(checkSlug('Ustoz')).toBe('format');
    expect(checkSlug('-ustoz')).toBe('format');
    expect(checkSlug('ustoz--')).toBe('format');
    expect(checkSlug('staff')).toBe('reserved');
  });
});

describe('places', () => {
  it('has unique keys', () => {
    for (const list of [regions, tashkentDistricts]) {
      expect(new Set(list.map((p) => p.key)).size).toBe(list.length);
    }
    expect(tashkentDistricts).toHaveLength(12);
  });
});

describe('parseCoordinates', () => {
  const novza = { lat: 41.2925, lng: 69.2051 };

  it.each([
    ['41.2925, 69.2051'],
    ['41.2925 69.2051'],
    ['https://yandex.uz/maps/?ll=69.2051%2C41.2925&z=16'],
    ['https://yandex.uz/maps/10335/tashkent/?pt=69.2051,41.2925&z=17'],
    ['https://yandex.ru/maps/?whatshere%5Bpoint%5D=69.2051%2C41.2925&whatshere%5Bzoom%5D=17'],
    ['https://www.google.com/maps/place/Novza/@41.2925,69.2051,17z'],
    ['https://maps.google.com/?q=41.2925,69.2051'],
  ])('reads %s', (text) => {
    expect(parseCoordinates(text)).toEqual(novza);
  });

  it('fixes coordinates pasted the wrong way round', () => {
    expect(parseCoordinates('69.2051, 41.2925')).toEqual(novza);
  });

  it('rejects places outside Uzbekistan and junk', () => {
    expect(parseCoordinates('55.7558, 37.6173')).toBeNull(); // Moscow
    expect(parseCoordinates('Chilonzor 9-kvartal')).toBeNull();
    expect(isInUzbekistan(novza)).toBe(true);
  });

  it('builds a Yandex Maps link with the pin', () => {
    expect(yandexMapsLink(novza)).toBe('https://yandex.uz/maps/?pt=69.2051,41.2925&z=17&l=map');
  });
});

describe('parseCoordinates with incomplete input', () => {
  it('never throws on a half-typed link', () => {
    expect(() => parseCoordinates('https://yandex.uz/maps/?ll=69.2%2')).not.toThrow();
    expect(parseCoordinates('https://yandex.uz/maps/?ll=69.2%2')).toBeNull();
  });
});
