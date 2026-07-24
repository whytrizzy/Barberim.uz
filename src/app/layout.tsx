import type { Metadata, Viewport } from 'next';
import './globals.css';
import Script from 'next/script';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { AuthProvider } from '@/lib/AuthContext';

export const metadata: Metadata = {
  title: 'Barberim.uz - Telegram Mini App for Barbers & Clients',
  description: 'Manage haircut appointments, working schedules, and direct client bookings in Uzbekistan.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-amber-500 selection:text-slate-950">
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
        <div
          style={{
            position: 'fixed',
            bottom: 2,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 9,
            color: '#64748b',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          build: fix1
        </div>
      </body>
    </html>
  );
}
