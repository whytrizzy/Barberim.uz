// The subset of Telegram's Mini App API (telegram-web-app.js) that Barberim uses.
// Reference: https://core.telegram.org/bots/webapps — version notes say when a method appeared.

export type ColorScheme = 'light' | 'dark';

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

export type ThemeParams = {
  bg_color?: string;
  text_color?: string;
  button_color?: string;
  button_text_color?: string;
};

export type SafeAreaInset = { top: number; bottom: number; left: number; right: number };

export type MainButtonParams = {
  text?: string;
  color?: string;
  text_color?: string;
  is_active?: boolean;
  is_visible?: boolean;
};

export type BottomButton = {
  setParams(params: MainButtonParams): void;
  show(): void;
  hide(): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
};

export type BackButton = {
  show(): void;
  hide(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
};

export type HapticFeedback = {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
};

export type WebAppEvent = 'themeChanged' | 'viewportChanged' | 'safeAreaChanged';

export type TelegramWebApp = {
  /** Signed launch data for the server; empty string when opened outside Telegram. */
  initData: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  version: string;
  platform: string;
  colorScheme: ColorScheme;
  themeParams: ThemeParams;
  safeAreaInset?: SafeAreaInset;
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  close(): void;
  openTelegramLink(url: string): void;
  setHeaderColor(color: string): void; // 6.1+
  setBackgroundColor(color: string): void; // 6.1+
  setBottomBarColor(color: string): void; // 7.10+
  disableVerticalSwipes(): void; // 7.7+
  showConfirm(message: string, callback: (ok: boolean) => void): void; // 6.2+
  onEvent(event: WebAppEvent, callback: () => void): void;
  offEvent(event: WebAppEvent, callback: () => void): void;
  MainButton: BottomButton;
  BackButton: BackButton; // 6.1+
  HapticFeedback: HapticFeedback; // 6.1+
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}
