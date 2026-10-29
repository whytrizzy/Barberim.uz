'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { htmlLang, isLocale, LOCALE_COOKIE, LOCALE_STORAGE_KEY, type Locale } from './locales';
import { getMessages, type Messages } from './messages';

type I18nContextValue = {
  locale: Locale;
  /** The dictionary for the current locale: t.common.back, t.calendar.weekdays[0]… */
  t: Messages;
  /** False until the user has picked a language (first launch). */
  chosen: boolean;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale | null {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function storeLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode or blocked storage: the cookie still carries the choice.
  }
  // SameSite=None lets Telegram Web (which runs the app in an iframe) send it; that requires HTTPS.
  const crossSite = location.protocol === 'https:' ? '; SameSite=None; Secure' : '; SameSite=Lax';
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000${crossSite}`;
}

export function I18nProvider({
  initialLocale,
  initialChosen,
  children,
}: {
  initialLocale: Locale;
  initialChosen: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState(initialLocale);
  const [chosen, setChosen] = useState(initialChosen);

  // The cookie can be blocked inside Telegram Web's iframe; localStorage is the fallback.
  useEffect(() => {
    const stored = readStoredLocale();
    if (!stored) return;
    /* eslint-disable react-hooks/set-state-in-effect -- storage is only readable after mount */
    setChosen(true);
    if (stored !== initialLocale) setLocaleState(stored);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialLocale]);

  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      storeLocale(next);
      setLocaleState(next);
      setChosen(true);
      // Server components re-render with the new cookie.
      router.refresh();
    },
    [router],
  );

  const value = useMemo(
    () => ({ locale, t: getMessages(locale), chosen, setLocale }),
    [locale, chosen, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
