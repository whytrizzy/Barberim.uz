import { Bot, InlineKeyboard } from 'grammy';
import { summarizeBotError } from './errors';
import { botTexts, startMessage } from './messages';
import { canOpenMiniApp, miniAppUrl, parseStartPayload } from './payload';

export type BotConfig = {
  token: string;
  /** Public HTTPS address of the Mini App (NEXT_PUBLIC_APP_URL). */
  appUrl: string;
};

/** Builds the bot with all handlers. Transport-agnostic: used by the webhook and local polling. */
export function createBot({ token, appUrl }: BotConfig): Bot {
  const bot = new Bot(token);
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

  // Used by long polling only; the webhook route catches and logs errors itself.
  bot.catch((error) => {
    console.error('bot update failed', summarizeBotError(error));
  });

  return bot;
}
