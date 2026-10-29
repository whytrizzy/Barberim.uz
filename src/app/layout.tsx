import type { Metadata, Viewport } from 'next';
import { Fira_Sans_Extra_Condensed, Onest } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Both faces cover Latin, Latin Extended (incl. the Uzbek oʻ/gʻ modifier letter) and Cyrillic.
const onest = Onest({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-onest',
  display: 'swap',
});

const signFace = Fira_Sans_Extra_Condensed({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['600', '700'],
  variable: '--font-sign-face',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Barberim',
  description: 'Sartaroshga onlayn yozilish',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#d9e8e1' },
    { media: '(prefers-color-scheme: dark)', color: '#0f2621' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz" className={`${onest.variable} ${signFace.variable}`}>
      <body>{children}</body>
    </html>
  );
}
