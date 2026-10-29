/**
 * Runs the DEV bot locally with long polling, so no public URL is needed for the bot itself.
 *   npm run bot:dev
 * Reads .env.local. Refuses to run outside APP_ENV=development so the production bot is never
 * polled from a laptop (polling would also remove its webhook).
 */
import { createBot } from '@/bot/bot';
import { clientEnv } from '@/env/client';
import { serverEnv } from '@/env/server';

async function main() {
  if (serverEnv.APP_ENV !== 'development') {
    throw new Error(`bot:dev only runs with APP_ENV=development (got ${serverEnv.APP_ENV})`);
  }
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN (the dev bot) in .env.local');

  const bot = createBot({ token, appUrl: clientEnv.NEXT_PUBLIC_APP_URL });
  // Polling and a webhook can't coexist; the dev bot never needs its webhook.
  await bot.api.deleteWebhook();
  await bot.start({
    onStart: (me) =>
      console.log(`@${me.username} is polling. Mini App: ${clientEnv.NEXT_PUBLIC_APP_URL}`),
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
