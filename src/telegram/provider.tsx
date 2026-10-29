'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { devTelegramUser } from '@/lib/dev-user';
import type { ColorScheme, TelegramUser, TelegramWebApp } from './types';
import { getWebApp, readToken, safely, supports } from './webapp';

/** What a page asks the bottom button to be. Rendered natively in Telegram, in-page elsewhere. */
export type MainButtonConfig = {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
};

type Mode = 'loading' | 'telegram' | 'browser';

type TelegramContextValue = {
  /** `loading` until mounted; `browser` = opened outside Telegram (development, shared links). */
  mode: Mode;
  webApp: TelegramWebApp | null;
  colorScheme: ColorScheme;
  /** The Telegram user; in development outside Telegram, a fake one so screens can be built. */
  user: TelegramUser | null;
  /** Deep-link payload, e.g. `shop_ustoz` from t.me/<bot>?startapp=shop_ustoz. */
  startParam: string | null;
  browserMain: MainButtonConfig | null;
  browserBack: (() => void) | null;
  setBrowserMain: (config: MainButtonConfig | null) => void;
  setBrowserBack: (onBack: (() => void) | null) => void;
};

const TelegramContext = createContext<TelegramContextValue | null>(null);

const devUser: TelegramUser = devTelegramUser;

/** Paints Telegram's header, background and bottom bar in the current theme's tile color. */
function paintChrome(webApp: TelegramWebApp) {
  const tile = readToken('--tile');
  if (!tile) return;
  if (supports(webApp, '6.1')) {
    safely(() => webApp.setHeaderColor(tile));
    safely(() => webApp.setBackgroundColor(tile));
  }
  if (supports(webApp, '7.10')) safely(() => webApp.setBottomBarColor(tile));
}

function applyTheme(webApp: TelegramWebApp) {
  document.documentElement.dataset.theme = webApp.colorScheme;
  paintChrome(webApp);
}

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('loading');
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [colorScheme, setColorScheme] = useState<ColorScheme>('light');
  const [browserMain, setBrowserMain] = useState<MainButtonConfig | null>(null);
  const [browserBack, setBrowserBackState] = useState<(() => void) | null>(null);
  // Stable identity matters: hooks list it as an effect dependency. The wrapper makes React
  // store the callback instead of calling it as a state updater.
  const setBrowserBack = useCallback(
    (onBack: (() => void) | null) => setBrowserBackState(() => onBack),
    [],
  );

  useEffect(() => {
    const app = getWebApp();
    /* eslint-disable react-hooks/set-state-in-effect -- reading Telegram is only possible after mount */
    if (!app) {
      setColorScheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      setMode('browser');
      return;
    }
    setWebApp(app);
    setColorScheme(app.colorScheme);
    setMode('telegram');
    /* eslint-enable react-hooks/set-state-in-effect */

    applyTheme(app);
    safely(() => app.ready());
    safely(() => app.expand());
    // Stop a downward scroll from accidentally closing the app mid-booking.
    if (supports(app, '7.7')) safely(() => app.disableVerticalSwipes());

    const onThemeChanged = () => {
      applyTheme(app);
      setColorScheme(app.colorScheme);
    };
    app.onEvent('themeChanged', onThemeChanged);
    return () => app.offEvent('themeChanged', onThemeChanged);
  }, []);

  const value = useMemo<TelegramContextValue>(
    () => ({
      mode,
      webApp,
      colorScheme,
      user: webApp?.initDataUnsafe.user ?? (mode === 'browser' && isDev() ? devUser : null),
      startParam: webApp?.initDataUnsafe.start_param ?? null,
      browserMain,
      browserBack,
      setBrowserMain,
      setBrowserBack,
    }),
    [mode, webApp, colorScheme, browserMain, browserBack, setBrowserBack],
  );

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

function isDev() {
  return process.env.NODE_ENV === 'development';
}

export function useTelegram(): TelegramContextValue {
  const value = useContext(TelegramContext);
  if (!value) throw new Error('useTelegram must be used inside <TelegramProvider>');
  return value;
}
