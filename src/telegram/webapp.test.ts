import { afterEach, describe, expect, it, vi } from 'vitest';
import { haptic } from './haptics';
import type { TelegramWebApp } from './types';
import { getWebApp, safely, schemeFromBackground, supports, themeBootScript } from './webapp';

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeWebApp(overrides: Partial<TelegramWebApp> = {}): TelegramWebApp {
  return {
    initData: 'query_id=1&user=%7B%7D&hash=abc',
    initDataUnsafe: {},
    version: '8.0',
    platform: 'android',
    colorScheme: 'light',
    themeParams: {},
    isVersionAtLeast: () => true,
    ...overrides,
  } as TelegramWebApp;
}

describe('getWebApp', () => {
  it('is null outside Telegram, where the script defines WebApp with empty initData', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: fakeWebApp({ initData: '' }) } });
    expect(getWebApp()).toBeNull();
  });

  it('returns the object inside Telegram', () => {
    const webApp = fakeWebApp();
    vi.stubGlobal('window', { Telegram: { WebApp: webApp } });
    expect(getWebApp()).toBe(webApp);
  });
});

describe('supports / safely', () => {
  it('treats a throwing version check as unsupported', () => {
    const webApp = fakeWebApp({
      isVersionAtLeast: () => {
        throw new Error('boom');
      },
    });
    expect(supports(webApp, '6.1')).toBe(false);
  });

  it('swallows errors from Telegram calls', () => {
    expect(() =>
      safely(() => {
        throw new Error('old client');
      }),
    ).not.toThrow();
  });
});

describe('haptic', () => {
  it('does not throw when the client throws on feedback', () => {
    const throwing = () => {
      throw new Error('haptics broken');
    };
    vi.stubGlobal('window', {
      Telegram: {
        WebApp: fakeWebApp({
          HapticFeedback: {
            selectionChanged: throwing,
            impactOccurred: throwing,
            notificationOccurred: throwing,
          },
        }),
      },
    });
    expect(() => {
      haptic.selection();
      haptic.impact();
      haptic.notify('success');
    }).not.toThrow();
  });

  it('does nothing outside Telegram', () => {
    vi.stubGlobal('window', {});
    expect(() => haptic.selection()).not.toThrow();
  });
});

describe('theme detection', () => {
  it('maps Telegram background colors to light or dark', () => {
    expect(schemeFromBackground('#ffffff')).toBe('light');
    expect(schemeFromBackground('#17212b')).toBe('dark'); // Telegram's default dark background
    expect(schemeFromBackground('red')).toBeNull();
    expect(schemeFromBackground(undefined)).toBeNull();
  });

  function runBootScript(hash: string) {
    const attributes: Record<string, string> = {};
    const document = {
      documentElement: { setAttribute: (k: string, v: string) => (attributes[k] = v) },
    };
    new Function('location', 'document', themeBootScript)({ hash }, document);
    return attributes['data-theme'];
  }

  it('boot script sets the theme from the launch URL, matching schemeFromBackground', () => {
    const params = (bg: string) =>
      `#tgWebAppData=x&tgWebAppThemeParams=${encodeURIComponent(JSON.stringify({ bg_color: bg }))}`;
    expect(runBootScript(params('#17212b'))).toBe('dark');
    expect(runBootScript(params('#ffffff'))).toBe('light');
  });

  it('boot script leaves the theme alone without Telegram params or with bad input', () => {
    expect(runBootScript('')).toBeUndefined();
    expect(runBootScript('#tgWebAppThemeParams=%7Bbroken')).toBeUndefined();
  });
});
