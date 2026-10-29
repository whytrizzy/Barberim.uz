/**
 * Shop link names: t.me/<bot>?start=shop_<slug>. Lowercase Latin letters, digits and dashes,
 * 2–40 characters (Telegram's start parameter allows 64; "shop_" takes 5).
 */

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** Words a shop can't take because they are, or may become, app routes or brand names. */
const reserved = new Set([
  'admin',
  'api',
  'app',
  'barberim',
  'book',
  'booking',
  'bookings',
  'design',
  'dev',
  'discover',
  'help',
  'invite',
  'master',
  'new',
  'settings',
  'shell',
  'shop',
  'shops',
  'staff',
  'support',
  'telegram',
  'test',
]);

const cyrillic: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  ғ: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  қ: 'q',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ў: 'o',
  ф: 'f',
  х: 'x',
  ҳ: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ъ: '',
  ы: 'i',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/** A slug suggestion from a shop name: "Ustoz Barbershop" → "ustoz-barbershop", "Оʻзбек" → "ozbek". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/№/g, '') // № (would become "No")
    .replace(/[ʻʼ‘’'`]/g, '') // oʻ / gʻ / tutuq belgisi
    .replace(/[Ѐ-ӿ]/g, (ch) => cyrillic[ch] ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

export type SlugProblem = 'too_short' | 'format' | 'reserved';

export function checkSlug(slug: string): SlugProblem | null {
  if (slug.length < 2) return 'too_short';
  if (!SLUG_PATTERN.test(slug)) return 'format';
  if (reserved.has(slug)) return 'reserved';
  return null;
}
