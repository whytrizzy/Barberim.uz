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
  const tg = getTelegramWebApp();
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor('#0f172a');
      tg.setBackgroundColor('#0f172a');
    } catch (e) {
      // Ignore if unsupported in older client
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
  if (tg?.HapticFeedback) {
    tg.HapticFeedback.impactOccurred(style);
  }
}
