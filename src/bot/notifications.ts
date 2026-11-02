import { Api, GrammyError, InlineKeyboard } from 'grammy';
import { z } from 'zod';
import { formatDayMonth, formatTime } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import { locales } from '@/i18n/locales';
import { getMessages } from '@/i18n/messages';
import { typedText } from '@/i18n/places';
import { summarizeBotError } from './errors';
import { canOpenMiniApp } from './payload';

// What the outbox sends through the bot: the words for each template, and the sending itself.
// Delivery rules (when, how often, what counts as given up) live in server/services/notifications.

export const bookingTemplates = [
  'booking.created',
  'booking.requested',
  'booking.confirmed',
  'booking.moved',
  'booking.cancelled_by_shop',
] as const;
export type BookingTemplate = (typeof bookingTemplates)[number];

/** Notification.payload. Facts are copied in, so a message says what was true when it happened. */
export const bookingPayloadSchema = z.object({
  bookingId: z.string(),
  shopName: z.string(),
  masterName: z.string(),
  startAt: z.string(),
  locale: z.enum(locales),
});
export type BookingPayload = z.infer<typeof bookingPayloadSchema>;

export type OutgoingMessage = { text: string; button: { label: string; path: string } };

/** The message in the person's language, or null for a template or payload we can't read. */
export function renderNotification(template: string, payload: unknown): OutgoingMessage | null {
  const parsed = bookingPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const known = (bookingTemplates as readonly string[]).includes(template);
  if (!known) return null;

  const { bookingId, shopName, masterName, startAt, locale } = parsed.data;
  const { notify } = getMessages(locale);
  const start = new Date(startAt);
  const body: Record<BookingTemplate, string> = {
    'booking.created': notify.created,
    'booking.requested': notify.requested,
    'booking.confirmed': notify.confirmed,
    'booking.moved': notify.moved,
    'booking.cancelled_by_shop': notify.cancelledByShop,
  };
  return {
    text: interpolate(body[template as BookingTemplate], {
      shop: typedText(shopName, locale),
      master: typedText(masterName, locale),
      date: formatDayMonth(start, locale),
      time: formatTime(start),
    }),
    button: { label: notify.open, path: `/booking/${bookingId}` },
  };
}

export type SendFailure =
  /** Trying again won't help: they blocked the bot, or the chat doesn't exist. */
  | { kind: 'permanent'; reason: string }
  /** Telegram asked us to slow down; not the message's fault. */
  | { kind: 'rate_limited'; retryAfterSec: number; reason: string }
  | { kind: 'temporary'; reason: string };

/** A log-safe verdict on a failed send. Never keeps the raw error: it can carry the bot token. */
export function classifySendError(error: unknown): SendFailure {
  const reason = JSON.stringify(summarizeBotError(error));
  if (error instanceof GrammyError) {
    if (error.error_code === 429) {
      return { kind: 'rate_limited', retryAfterSec: error.parameters.retry_after ?? 30, reason };
    }
    if (error.error_code === 400 || error.error_code === 403) return { kind: 'permanent', reason };
  }
  return { kind: 'temporary', reason };
}

export type Sender = (chatId: bigint, message: OutgoingMessage) => Promise<void>;

/** Sends through the Telegram API. The button is left out where a Mini App can't open (http). */
export function createSender(token: string, appUrl: string): Sender {
  const api = new Api(token);
  const base = appUrl.replace(/\/+$/, '');
  return async (chatId, { text, button }) => {
    await api.sendMessage(Number(chatId), text, {
      reply_markup: canOpenMiniApp(base)
        ? new InlineKeyboard().webApp(button.label, `${base}${button.path}`)
        : undefined,
    });
  };
}
