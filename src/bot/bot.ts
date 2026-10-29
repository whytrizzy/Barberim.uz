import { Bot, InlineKeyboard } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { summarizeBotError } from './errors';
import { botTexts, startMessage } from './messages';
import { canOpenMiniApp, miniAppUrl, parseStartPayload } from './payload';

export type ContactSaveResult = 'saved' | 'not_own' | 'not_uz';

export type BotConfig = {
  token: string;
  /** Public HTTPS address of the Mini App (NEXT_PUBLIC_APP_URL). */
  appUrl: string;
  /**
   * Stores a phone the user shared with the bot (Telegram also sends one here when the user
   * shares it from the Mini App). Injected so this module stays free of database code.
   */
  savePhone?: (
    from: { id: number; first_name: string; last_name?: string; username?: string },
    contact: { user_id?: number; phone_number: string },
  ) => Promise<ContactSaveResult>;
  /** Skips the getMe call (tests). */
  botInfo?: UserFromGetMe;
};

/** Builds the bot with all handlers. Transport-agnostic: used by the webhook and local polling. */
export function createBot({ token, appUrl, savePhone, botInfo }: BotConfig): Bot {
  const bot = new Bot(token, botInfo ? { botInfo } : undefined);
  const miniAppAvailable = canOpenMiniApp(appUrl);

  // Only private chats: the bot is a personal assistant, not a group bot.
  const dm = bot.chatType('private');

  dm.command('start', async (ctx) => {
    const t = botTexts(ctx.from.language_code);
    const payload = parseStartPayload(ctx.match);
    const { text, button } = startMessage(t, payload);
    if (!miniAppAvailable) {
      await ctx.reply(text + t.devNoButton);
      return;
    }
    await ctx.reply(text, {
      reply_markup: new InlineKeyboard().webApp(button, miniAppUrl(appUrl, payload)),
    });
  });

  dm.command('help', async (ctx) => {
    await ctx.reply(botTexts(ctx.from.language_code).help);
  });

  dm.on('message:contact', async (ctx) => {
    if (!savePhone) return;
    const t = botTexts(ctx.from.language_code);
    const result = await savePhone(ctx.from, ctx.message.contact);
    const reply = { saved: t.phoneSaved, not_own: t.phoneNotOwn, not_uz: t.phoneNotUz }[result];
    await ctx.reply(reply, { reply_markup: { remove_keyboard: true } });
  });

  // Used by long polling only; the webhook route catches and logs errors itself.
  bot.catch((error) => {
    console.error('bot update failed', summarizeBotError(error));
  });

  return bot;
}
