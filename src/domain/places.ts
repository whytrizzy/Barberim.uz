/**
 * Regions of Uzbekistan and the districts (tumans) of Tashkent city. Stored as stable keys;
 * names are shown in the user's language (uz-Cyrl is transliterated from uz).
 * Outside Tashkent city the district is free text for now.
 */

export type Place = { key: string; uz: string; ru: string };

export const regions: Place[] = [
  { key: 'tashkent-city', uz: 'Toshkent shahri', ru: 'город Ташкент' },
  { key: 'tashkent-region', uz: 'Toshkent viloyati', ru: 'Ташкентская область' },
  { key: 'andijan', uz: 'Andijon', ru: 'Андижан' },
  { key: 'bukhara', uz: 'Buxoro', ru: 'Бухара' },
  { key: 'fergana', uz: 'Fargʻona', ru: 'Фергана' },
  { key: 'jizzakh', uz: 'Jizzax', ru: 'Джизак' },
  { key: 'khorezm', uz: 'Xorazm', ru: 'Хорезм' },
  { key: 'namangan', uz: 'Namangan', ru: 'Наманган' },
  { key: 'navoi', uz: 'Navoiy', ru: 'Навои' },
  { key: 'kashkadarya', uz: 'Qashqadaryo', ru: 'Кашкадарья' },
  { key: 'samarkand', uz: 'Samarqand', ru: 'Самарканд' },
  { key: 'syrdarya', uz: 'Sirdaryo', ru: 'Сырдарья' },
  { key: 'surkhandarya', uz: 'Surxondaryo', ru: 'Сурхандарья' },
  { key: 'karakalpakstan', uz: 'Qoraqalpogʻiston', ru: 'Каракалпакстан' },
];

export const tashkentDistricts: Place[] = [
  { key: 'bektemir', uz: 'Bektemir', ru: 'Бектемир' },
  { key: 'chilonzor', uz: 'Chilonzor', ru: 'Чиланзар' },
  { key: 'mirobod', uz: 'Mirobod', ru: 'Мирабад' },
  { key: 'mirzo-ulugbek', uz: 'Mirzo Ulugʻbek', ru: 'Мирзо-Улугбек' },
  { key: 'olmazor', uz: 'Olmazor', ru: 'Алмазар' },
  { key: 'sergeli', uz: 'Sergeli', ru: 'Сергели' },
  { key: 'shayxontohur', uz: 'Shayxontohur', ru: 'Шайхантахур' },
  { key: 'uchtepa', uz: 'Uchtepa', ru: 'Учтепа' },
  { key: 'yakkasaroy', uz: 'Yakkasaroy', ru: 'Яккасарай' },
  { key: 'yangihayot', uz: 'Yangihayot', ru: 'Янгихаёт' },
  { key: 'yashnobod', uz: 'Yashnobod', ru: 'Яшнабад' },
  { key: 'yunusobod', uz: 'Yunusobod', ru: 'Юнусабад' },
];

export const isRegion = (key: string) => regions.some((r) => r.key === key);
export const isTashkentDistrict = (key: string) => tashkentDistricts.some((d) => d.key === key);

export type Coordinates = { lat: number; lng: number };

/** Roughly Uzbekistan's bounding box — catches swapped or foreign coordinates. */
export function isInUzbekistan({ lat, lng }: Coordinates): boolean {
  return lat >= 37 && lat <= 46 && lng >= 55.9 && lng <= 73.2;
}

/**
 * Coordinates from what an owner pastes: "41.2925, 69.2051", a Yandex Maps link (ll / pt /
 * whatshere[point], which are lng,lat) or a Google Maps link ("@lat,lng" or "q=lat,lng").
 * Returns null when nothing usable (inside Uzbekistan) is found.
 */
export function parseCoordinates(text: string): Coordinates | null {
  let input = text.trim();
  try {
    input = decodeURIComponent(input);
  } catch {
    // A half-typed or broken escape ("%2"): read it as it is.
  }
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const candidates: Coordinates[] = [];

  // Yandex: lng,lat
  for (const key of ['pt', 'll', 'whatshere\\[point\\]']) {
    const m = new RegExp(`[?&]${key}=${num},${num}`).exec(input);
    if (m) candidates.push({ lng: Number(m[1]), lat: Number(m[2]) });
  }
  // Google: lat,lng
  const at = new RegExp(`@${num},${num}`).exec(input);
  if (at) candidates.push({ lat: Number(at[1]), lng: Number(at[2]) });
  const q = new RegExp(`[?&](?:q|query)=${num},\\s*${num}`).exec(input);
  if (q) candidates.push({ lat: Number(q[1]), lng: Number(q[2]) });
  // Plain "lat, lng"
  const plain = new RegExp(`^${num}\\s*[,;\\s]\\s*${num}$`).exec(input);
  if (plain) candidates.push({ lat: Number(plain[1]), lng: Number(plain[2]) });

  for (const c of candidates) {
    if (isInUzbekistan(c)) return round(c);
    const swapped = { lat: c.lng, lng: c.lat };
    if (isInUzbekistan(swapped)) return round(swapped);
  }
  return null;
}

const round = ({ lat, lng }: Coordinates): Coordinates => ({
  lat: Math.round(lat * 1e6) / 1e6,
  lng: Math.round(lng * 1e6) / 1e6,
});

/** A Yandex Maps link with a pin, for checking the location or getting directions. */
export function yandexMapsLink({ lat, lng }: Coordinates): string {
  return `https://yandex.uz/maps/?pt=${lng},${lat}&z=17&l=map`;
}
