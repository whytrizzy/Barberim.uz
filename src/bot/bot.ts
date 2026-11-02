import { Bot, InlineKeyboard } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { localeFromLanguageCode, type Locale } from '@/i18n/locales';
import { getMessages } from '@/i18n/messages';
import { summarizeBotError } from './errors';
import { botTexts, startMessage } from './messages';
import { buildKeyboard, cancelAskButtons, reminderButtons, replyPattern } from './notifications';
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
  /** Answers taps on reminder buttons. Injected for the same reason. */
  bookingReplies?: BookingReplies;
  /** Skips the getMe call (tests). */
  botInfo?: UserFromGetMe;
};

export type ReplyOutcome = 'ok' | 'too_late' | 'not_found';

export type BookingReplies = {
  /** The language picked in the app; null for someone with no account. */
  localeOf: (telegramId: number) => Promise<Locale | null>;
  coming: (telegramId: number, bookingId: string) => Promise<ReplyOutcome>;
  cancel: (telegramId: number, bookingId: string) => Promise<ReplyOutcome>;
};

/** Builds the bot with all handlers. Transport-agnostic: used by the webhook and local polling. */
export function createBot({ token, appUrl, savePhone, bookingReplies, botInfo }: BotConfig): Bot {
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

  dm.callbackQuery(replyPattern, async (ctx) => {
    if (!bookingReplies) return ctx.answerCallbackQuery();
    const [, action, bookingId] = ctx.match as RegExpMatchArray;
    const id = bookingId as string;
    const locale =
      (await bookingReplies.localeOf(ctx.from.id)) ??
      localeFromLanguageCode(ctx.from.language_code);
    const { notify } = getMessages(locale);

    if (action === 'cancel' || action === 'cancel_no') {
      const buttons = action === 'cancel' ? cancelAskButtons : reminderButtons;
      await ctx.editMessageReplyMarkup({
        reply_markup: buildKeyboard(buttons(locale, id), appUrl),
      });
      return ctx.answerCallbackQuery(action === 'cancel' ? notify.cancelAsk : undefined);
    }

    const outcome =
      action === 'coming'
        ? await bookingReplies.coming(ctx.from.id, id)
        : await bookingReplies.cancel(ctx.from.id, id);
    const done = action === 'coming' ? notify.comingDone : notify.cancelledDone;
    const line = {
      ok: done,
      too_late: notify.replyTooLate,
      not_found: notify.replyNotFound,
    }[outcome];
    // The answer becomes part of the message, and its buttons go: there's nothing left to tap.
    const original = ctx.callbackQuery.message?.text ?? '';
    await ctx.editMessageText(`${original}\n\n${line}`, { reply_markup: new InlineKeyboard() });
    return ctx.answerCallbackQuery();
  });

  // Used by long polling only; the webhook route catches and logs errors itself.
  bot.catch((error) => {
    console.error('bot update failed', summarizeBotError(error));
  });

  return bot;
}
