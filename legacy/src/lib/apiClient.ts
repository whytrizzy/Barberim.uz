'use client';

import { getInitData } from './telegramWebApp';

/**
 * fetch wrapper for all authenticated API calls from the mini app.
 * Attaches the signed Telegram initData so the server can verify the caller.
 * In development (outside Telegram) it falls back to the stored dev telegramId.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});

  const initData = getInitData();
  if (initData) {
    headers.set('x-telegram-init-data', initData);
  } else if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    try {
      const dev = localStorage.getItem('barberim_dev_user');
      if (dev) {
        const u = JSON.parse(dev);
        if (u?.telegramId) headers.set('x-dev-telegram-id', String(u.telegramId));
      }
    } catch {
      /* ignore */
    }
  }

  return fetch(input, { ...init, headers });
}
