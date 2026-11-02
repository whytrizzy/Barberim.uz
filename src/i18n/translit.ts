/**
 * Uzbek Latin → Uzbek Cyrillic, following the 1995 Latin alphabet rules. Used to generate the
 * uz-Cyrl dictionary from uz-Latn, so the two scripts can never drift apart. Words the rules get
 * wrong are fixed with explicit overrides in messages/index.ts, not here.
 *
 * Left untouched: {placeholders}, /commands, URLs, ENV_NAMES and brand names.
 */

const protectedPattern =
  /(\{[^}]+\}|\/[a-z_]+|https?:\/\/\S+|\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|\b(?:Barberim|Telegram|Mini App|Click|Payme|Uzum|Yandex|Google|Instagram)\b)/g;

// Modifier letters: oʻ gʻ use U+02BB (also typed as ‘ ' ’); the tutuq belgisi ʼ is U+02BC (or ’ ').
const turnedComma = "[ʻ‘'’`]";
const apostrophe = "[ʼ’']";

const digraphs: [RegExp, string][] = [
  [new RegExp(`o${turnedComma}`, 'g'), 'ў'],
  [new RegExp(`O${turnedComma}`, 'g'), 'Ў'],
  [new RegExp(`g${turnedComma}`, 'g'), 'ғ'],
  [new RegExp(`G${turnedComma}`, 'g'), 'Ғ'],
  [/sh/g, 'ш'],
  [/S[hH]/g, 'Ш'],
  [/ch/g, 'ч'],
  [/C[hH]/g, 'Ч'],
  [/yo/g, 'ё'],
  [/Y[oO]/g, 'Ё'],
  [/yu/g, 'ю'],
  [/Y[uU]/g, 'Ю'],
  [/ya/g, 'я'],
  [/Y[aA]/g, 'Я'],
  [/ye/g, 'е'],
  [/Y[eE]/g, 'Е'],
  // "e" starting a word is э (ertaga → эртага); elsewhere е.
  [/(^|[^\p{L}])e/gu, '$1э'],
  [/(^|[^\p{L}])E/gu, '$1Э'],
  [new RegExp(apostrophe, 'g'), 'ъ'],
];

const letters: Record<string, string> = {
  a: 'а',
  b: 'б',
  c: 'с',
  d: 'д',
  e: 'е',
  f: 'ф',
  g: 'г',
  h: 'ҳ',
  i: 'и',
  j: 'ж',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  q: 'қ',
  r: 'р',
  s: 'с',
  t: 'т',
  u: 'у',
  v: 'в',
  w: 'в',
  x: 'х',
  y: 'й',
  z: 'з',
};

function transliterateSegment(text: string): string {
  let out = text;
  for (const [pattern, replacement] of digraphs) out = out.replace(pattern, replacement);
  return out.replace(/[A-Za-z]/g, (ch) => {
    const lower = letters[ch.toLowerCase()] ?? ch;
    return ch === ch.toLowerCase() ? lower : lower.toUpperCase();
  });
}

const toLatin: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  ғ: 'gʻ',
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
  ў: 'oʻ',
  ф: 'f',
  х: 'x',
  ҳ: 'h',
  ц: 's',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ъ: 'ʼ',
  ы: 'i',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/**
 * Uzbek Cyrillic → Latin, for matching what people type against names stored in the other script.
 * Good enough to search with, not for showing to anyone.
 */
export function cyrillicToLatin(text: string): string {
  return [...text]
    .map((ch) => {
      const latin = toLatin[ch.toLowerCase()];
      if (latin === undefined) return ch;
      return ch === ch.toLowerCase() ? latin : latin.charAt(0).toUpperCase() + latin.slice(1);
    })
    .join('');
}

export function latinToCyrillic(text: string): string {
  return text
    .split(protectedPattern)
    .map((part, i) => (i % 2 === 1 ? part : transliterateSegment(part)))
    .join('');
}
