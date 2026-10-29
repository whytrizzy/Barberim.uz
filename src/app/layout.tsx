import type { Metadata, Viewport } from 'next';
import { Fira_Sans_Extra_Condensed, Onest } from 'next/font/google';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { BrowserBackBar, BrowserMainBar } from '@/features/shell/browser-chrome';
import { LanguageGate } from '@/features/shell/language-gate';
import { QueryProvider } from '@/features/shell/query-provider';
import { RouteBackButton } from '@/features/shell/route-back-button';
import { htmlLang } from '@/i18n/locales';
import { I18nProvider } from '@/i18n/provider';
import { getRequestLocale } from '@/i18n/server';
import { TelegramProvider } from '@/telegram/provider';
import { themeBootScript } from '@/telegram/webapp';
import './globals.css';

// Latin Extended covers the Uzbek oʻ/gʻ modifier letter; Cyrillic Extended covers ў қ ғ ҳ.
const onest = Onest({
  subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'],
  variable: '--font-onest',
  display: 'swap',
});

const signFace = Fira_Sans_Extra_Condensed({
  subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'],
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, chosen } = await getRequestLocale();
  return (
    // data-theme is set before hydration (boot script / Telegram), hence the warning suppression.
    <html
      lang={htmlLang(locale)}
      className={`${onest.variable} ${signFace.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramProvider>
          <QueryProvider>
            <I18nProvider initialLocale={locale} initialChosen={chosen}>
              <div className="flex min-h-dvh flex-col">
                <BrowserBackBar />
                <div className="flex-1">
                  <LanguageGate>
                    <RouteBackButton />
                    {children}
                  </LanguageGate>
                </div>
                <BrowserMainBar />
              </div>
            </I18nProvider>
          </QueryProvider>
        </TelegramProvider>
      </body>
    </html>
  );
}
