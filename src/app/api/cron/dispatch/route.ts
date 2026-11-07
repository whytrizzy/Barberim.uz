import { createHash, timingSafeEqual } from 'node:crypto';
import { createSender } from '@/bot/notifications';
import { clientEnv } from '@/env/client';
import { serverEnv } from '@/env/server';
import { expireDeposits } from '@/server/services/deposits';
import { dispatchDue } from '@/server/services/notifications';

export const dynamic = 'force-dynamic';

const digest = (text: string) => createHash('sha256').update(text).digest();

/** Sends what's due in the outbox (and expires unpaid deposits). Every 5 minutes, with CRON_SECRET. */
export async function POST(request: Request): Promise<Response> {
  const secret = serverEnv.CRON_SECRET;
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  if (!secret || !token) return new Response('Not configured', { status: 503 });

  const given = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!timingSafeEqual(digest(given), digest(secret))) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // First free the times held for deposits nobody paid, so their "cancelled" messages go now.
    const expiredDeposits = await expireDeposits();
    const result = await dispatchDue(createSender(token, clientEnv.NEXT_PUBLIC_APP_URL));
    return Response.json(
      { ...result, expiredDeposits },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('outbox dispatch failed', error instanceof Error ? error.message : error);
    return new Response('Dispatch failed', { status: 500 });
  }
}
