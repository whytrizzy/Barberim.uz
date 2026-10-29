import type { Metadata, Viewport } from 'next';
import { Fira_Sans_Extra_Condensed, Onest } from 'next/font/google';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { BrowserBackBar, BrowserMainBar } from '@/features/shell/browser-chrome';
import { RouteBackButton } from '@/features/shell/route-back-button';
import { TelegramProvider } from '@/telegram/provider';
import { themeBootScript } from '@/telegram/webapp';
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
    // data-theme is set before hydration (boot script / Telegram), hence the warning suppression.
    <html lang="uz" className={`${onest.variable} ${signFace.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramProvider>
          <RouteBackButton />
          <div className="flex min-h-dvh flex-col">
            <BrowserBackBar />
            <div className="flex-1">{children}</div>
            <BrowserMainBar />
          </div>
        </TelegramProvider>
      </body>
    </html>
  );
}
