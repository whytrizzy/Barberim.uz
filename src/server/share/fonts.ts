import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// The app's two typefaces, as files the image renderer can read (it can't use next/font). Kept in
// assets/fonts with their OFL licences; Latin, Cyrillic and both extended sets, so Uzbek in either
// script (ʻ, қ, ғ, ҳ) and Russian all render. Each set is its own family name: the renderer only
// falls back between families, so a card asks for them in order (see SANS and SIGN).

type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' };

const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'] as const;
const family = (base: string) => SUBSETS.map((subset) => `${base} ${subset}`);

/** For `fontFamily`: body text and the sign's condensed face, each across every set. */
export const SANS = family('Onest').join(', ');
export const SIGN = family('Sign').join(', ');

const FILES = SUBSETS.flatMap((subset) => [
  { name: `Onest ${subset}`, file: `onest-${subset}-400-normal.woff`, weight: 400 as const },
  { name: `Onest ${subset}`, file: `onest-${subset}-700-normal.woff`, weight: 700 as const },
  {
    name: `Sign ${subset}`,
    file: `fira-sans-extra-condensed-${subset}-700-normal.woff`,
    weight: 700 as const,
  },
]);

let loaded: Promise<Font[]> | null = null;

/** Read once per server process. */
export function shareFonts(): Promise<Font[]> {
  loaded ??= Promise.all(
    FILES.map(async ({ name, file, weight }) => {
      const bytes = await readFile(path.join(process.cwd(), 'assets', 'fonts', file));
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return { name, data: data as ArrayBuffer, weight, style: 'normal' as const };
    }),
  );
  return loaded;
}
