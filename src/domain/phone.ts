/**
 * Uzbekistan phone numbers: +998 followed by a 2-digit operator/area code and 7 digits.
 * Stored as E.164 (`+998901234567`), shown as `+998 90 123 45 67`.
 */

const E164 = /^\+998\d{9}$/;

/**
 * Accepts what people actually type — "90 123 45 67", "998901234567", "+998 (90) 123-45-67",
 * "8 90 123 45 67" (old domestic prefix) — and returns E.164, or null if it isn't a UZ number.
 */
export function normalizeUzPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('8')) digits = digits.slice(1);
  if (digits.length === 9) digits = `998${digits}`;
  const e164 = `+${digits}`;
  return E164.test(e164) ? e164 : null;
}

export function isUzPhone(value: string): boolean {
  return E164.test(value);
}

/**
 * The 9 national digits from whatever is typed or pasted into a field that already shows "+998":
 * "+998 90 123-45-67" and "901234567" both give "901234567". Never more than 9 digits.
 */
export function nationalDigits(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.length > 9 && digits.startsWith('998')) digits = digits.slice(3);
  return digits.slice(0, 9);
}

/** Progressive display while typing: "9" → "9", "90123" → "90 123", full → "90 123 45 67". */
export function formatNationalDigits(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(' ');
}

/** `+998901234567` → `+998 90 123 45 67`; anything else is returned unchanged. */
export function formatUzPhone(e164: string): string {
  if (!E164.test(e164)) return e164;
  const d = e164.slice(4);
  return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}
