/**
 * The fake Telegram user for development outside Telegram (browser mode). Its id matches the
 * owner in prisma/seed.ts, so the demo shop's staff screens work locally.
 */
export const devTelegramUser = {
  id: 100000001,
  first_name: 'Dev',
  last_name: 'Owner',
  language_code: 'uz',
} as const;
