import { webhookCallback } from 'grammy';
import { createBot } from '@/bot/bot';
import { summarizeBotError } from '@/bot/errors';
import { clientEnv } from '@/env/client';
import { serverEnv } from '@/env/server';
import { savePhoneFromBotContact } from '@/server/services/profile';

export const dynamic = 'force-dynamic';

type Handler = (request: Request) => Promise<Response>;
let handler: Handler | null = null;

/** One bot per server instance, created on the first update. */
function getHandler(): Handler | null {
  if (handler) return handler;
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const bot = createBot({
    token,
    appUrl: clientEnv.NEXT_PUBLIC_APP_URL,
    savePhone: savePhoneFromBotContact,
  });
  // With secretToken set, grammY answers 401 when X-Telegram-Bot-Api-Secret-Token differs.
  handler = webhookCallback(bot, 'std/http', {
    secretToken: serverEnv.TELEGRAM_WEBHOOK_SECRET,
  });
  return handler;
}

/** Telegram webhook. Registered with `npm run bot:setup -- --webhook`. */
export async function POST(request: Request): Promise<Response> {
  const webhook = getHandler();
  if (!webhook) return new Response('Bot is not configured', { status: 503 });
  try {
    return await webhook(request);
  } catch (error) {
    // In webhook mode grammY rethrows handler errors instead of using bot.catch. Log a safe
    // summary (never the raw error: it carries the bot token) and answer 200 — a non-2xx makes
    // Telegram redeliver the same failing update over and over.
    console.error('bot update failed', summarizeBotError(error));
    return new Response(null, { status: 200 });
  }
}
