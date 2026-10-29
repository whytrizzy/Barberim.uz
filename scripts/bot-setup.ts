/**
 * Configures a bot's profile in Telegram: commands, descriptions, the menu button and (optionally)
 * the webhook. Safe to re-run.
 *   npm run bot:setup                 # dev bot from .env.local
 *   npm run bot:setup -- --webhook    # also point Telegram at <NEXT_PUBLIC_APP_URL>/api/bot
 */
import { Api } from 'grammy';
import { canOpenMiniApp } from '@/bot/payload';
import { clientEnv } from '@/env/client';
import { serverEnv } from '@/env/server';

// `language_code: undefined` is the default profile, shown for every language not listed below.
const profiles = [
  {
    language_code: undefined,
    commands: [
      { command: 'start', description: 'Barberimni ochish' },
      { command: 'help', description: 'Yordam' },
    ],
    short: 'Sartaroshga bir daqiqada yozilish — Telegram ichida.',
    description:
      'Barberim: ustangizni tanlang, boʻsh vaqtni bosing — tayyor. Eslatmani bot oʻzi yuboradi.',
  },
  {
    language_code: 'ru' as const,
    commands: [
      { command: 'start', description: 'Открыть Barberim' },
      { command: 'help', description: 'Помощь' },
    ],
    short: 'Запись к барберу за минуту — прямо в Telegram.',
    description: 'Barberim: выберите мастера и свободное время — готово. Напоминание пришлёт бот.',
  },
];

async function main() {
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN');
  const api = new Api(token);
  const appUrl = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  const me = await api.getMe();
  console.log(`Configuring @${me.username} (APP_ENV=${serverEnv.APP_ENV})`);

  for (const { language_code, ...profile } of profiles) {
    await api.setMyCommands(profile.commands, { language_code });
    await api.setMyShortDescription(profile.short, { language_code });
    await api.setMyDescription(profile.description, { language_code });
  }
  console.log('  commands and descriptions set (uz default, ru)');

  if (canOpenMiniApp(appUrl)) {
    await api.setChatMenuButton({
      menu_button: { type: 'web_app', text: 'Barberim', web_app: { url: appUrl } },
    });
    console.log(`  menu button opens ${appUrl}`);
  } else {
    console.log(`  menu button skipped: ${appUrl} is not HTTPS (Telegram requires HTTPS)`);
  }

  if (process.argv.includes('--webhook')) {
    if (!canOpenMiniApp(appUrl)) throw new Error('--webhook needs an HTTPS NEXT_PUBLIC_APP_URL');
    const secret = serverEnv.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) throw new Error('--webhook needs TELEGRAM_WEBHOOK_SECRET');
    await api.setWebhook(`${appUrl}/api/bot`, {
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    });
    console.log(`  webhook set to ${appUrl}/api/bot`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
