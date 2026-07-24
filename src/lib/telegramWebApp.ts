'use client';

declare global {
  interface Window {
    Telegram?: {
      WebApp: any;
    };
  }
}

export function getTelegramWebApp() {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
}

export function initTelegramWebApp() {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    try {
      tg.ready();
      tg.expand();
      if (typeof tg.setHeaderColor === 'function') {
        tg.setHeaderColor('#0f172a');
      }
      if (typeof tg.setBackgroundColor === 'function') {
        tg.setBackgroundColor('#0f172a');
      }
    } catch (e) {
      console.warn('⚡ Telegram WebApp init exception:', e);
    }
  }
}

export function getTelegramUser() {
  const tg = getTelegramWebApp();
  if (tg?.initDataUnsafe?.user) {
    return tg.initDataUnsafe.user;
  }
  return null;
}

/** Raw, cryptographically signed initData string. Must be verified server-side. */
export function getInitData(): string {
  const tg = getTelegramWebApp();
  return tg?.initData || '';
}

export function getTelegramStartParam(): string | null {
  const tg = getTelegramWebApp();
  if (tg?.initDataUnsafe?.start_param) {
    return tg.initDataUnsafe.start_param;
  }
  // Check URL fallback ?start=barber_xyz or ?barberId=xyz
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const start = params.get('start') || params.get('tgWebAppStartParam');
    if (start) return start;
    const barberId = params.get('barberId');
    if (barberId) return `barber_${barberId}`;
  }
  return null;
}

export function triggerHapticFeedback(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') {
  const tg = getTelegramWebApp();
  // impactOccurred throws "WebAppMethodUnsupported" on some clients (e.g. Desktop).
  try {
    tg?.HapticFeedback?.impactOccurred?.(style);
  } catch {
    /* ignore unsupported haptics */
  }
}
