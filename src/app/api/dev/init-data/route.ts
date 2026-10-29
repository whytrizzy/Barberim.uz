import { isDevelopment, serverEnv } from '@/env/server';
import { devTelegramUser } from '@/lib/dev-user';
import { signInitData } from '@/server/auth/init-data';

export const dynamic = 'force-dynamic';

/**
 * Development only: launch data for the fake dev user, signed with the DEV bot's token, so the
 * app can call the real, verified API from a normal browser. 404 everywhere else.
 */
export function GET(): Response {
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  if (!isDevelopment || !token) return new Response('Not found', { status: 404 });
  return Response.json(
    { initData: signInitData({ user: devTelegramUser }, token) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
