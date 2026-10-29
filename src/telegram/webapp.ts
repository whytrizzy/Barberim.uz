import type { ColorScheme, TelegramWebApp } from './types';

/**
 * The Telegram Mini App object, or null when the page is not running inside Telegram.
 * telegram-web-app.js defines the object in any browser, so an empty `initData` is the real test.
 */
export function getWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  const webApp = window.Telegram?.WebApp;
  return webApp && webApp.initData ? webApp : null;
}

/** True when the Telegram client supports a feature introduced in `version` (e.g. "6.1"). */
export function supports(webApp: TelegramWebApp, version: string): boolean {
  try {
    return webApp.isVersionAtLeast(version);
  } catch {
    return false;
  }
}

/** Calls a Telegram method that may be missing or throw on old clients; never throws itself. */
export function safely(action: () => void): void {
  try {
    action();
  } catch {
    // Old or unusual Telegram clients: the feature is simply unavailable.
  }
}

/** Light or dark from a #rrggbb background, by relative luminance. */
export function schemeFromBackground(hex: string | undefined): ColorScheme | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.5 ? 'dark' : 'light';
}

/**
 * Inline script for <head>: sets <html data-theme> from Telegram's launch URL before the first paint,
 * so dark-mode users never see a light flash while telegram-web-app.js is still loading.
 * Telegram puts `tgWebAppThemeParams` (JSON with bg_color) in the URL hash when it opens the app.
 * Kept dependency-free and ES5; it mirrors `schemeFromBackground` above (see webapp.test.ts).
 */
export const themeBootScript = `(function(){try{
var m=/[#&]tgWebAppThemeParams=([^&]*)/.exec(location.hash);if(!m)return;
var bg=JSON.parse(decodeURIComponent(m[1])).bg_color;if(!/^#[0-9a-f]{6}$/i.test(bg))return;
var c=[1,3,5].map(function(i){return parseInt(bg.slice(i,i+2),16)/255});
document.documentElement.setAttribute('data-theme',(0.2126*c[0]+0.7152*c[1]+0.0722*c[2])<0.5?'dark':'light');
}catch(e){}})();`;

/** Reads a design token (a CSS custom property holding #rrggbb) for Telegram's color APIs. */
export function readToken(name: string): string | null {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}
