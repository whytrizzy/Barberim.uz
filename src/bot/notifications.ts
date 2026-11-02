import { Api, GrammyError, InlineKeyboard } from 'grammy';
import { z } from 'zod';
import { formatDayMonth, formatTime } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import { locales, type Locale } from '@/i18n/locales';
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
  'booking.reminder24h',
  'booking.reminder2h',
  'booking.review_ask',
] as const;
export type BookingTemplate = (typeof bookingTemplates)[number];

export const REMINDER_TEMPLATES = ['booking.reminder24h', 'booking.reminder2h'] as const;

/** Notification.payload. Facts are copied in, so a message says what was true when it happened. */
export const bookingPayloadSchema = z.object({
  bookingId: z.string(),
  shopName: z.string(),
  masterName: z.string(),
  startAt: z.string(),
  locale: z.enum(locales),
});
export type BookingPayload = z.infer<typeof bookingPayloadSchema>;

export const staffTemplates = [
  'staff.new_booking',
  'staff.request',
  'staff.moved',
  'staff.cancelled',
] as const;
export type StaffTemplate = (typeof staffTemplates)[number];

export const staffPayloadSchema = bookingPayloadSchema.extend({
  shopId: z.string(),
  clientName: z.string(),
  /** Where it was, when it moved. */
  oldStartAt: z.string().optional(),
});
export type StaffPayload = z.infer<typeof staffPayloadSchema>;

function renderStaffAlert(template: StaffTemplate, payload: StaffPayload): OutgoingMessage {
  const { bookingId, shopId, clientName, masterName, startAt, oldStartAt, locale } = payload;
  const { notify } = getMessages(locale);
  const moment = (iso: string) => {
    const when = new Date(iso);
    return { date: formatDayMonth(when, locale), time: formatTime(when) };
  };
  const body: Record<StaffTemplate, string> = {
    'staff.new_booking': notify.staffNew,
    'staff.request': notify.staffRequest,
    'staff.moved': notify.staffMoved,
    'staff.cancelled': notify.staffCancelled,
  };
  const old = oldStartAt ? moment(oldStartAt) : null;
  const open = [{ label: notify.staffOpen, path: `/staff/shop/${shopId}/calendar/${bookingId}` }];
  return {
    text: interpolate(body[template], {
      client: typedText(clientName, locale),
      master: typedText(masterName, locale),
      ...moment(startAt),
      old: old ? `${old.date}, ${old.time}` : '',
    }),
    buttons: template === 'staff.request' ? [...requestButtons(locale, bookingId), open] : [open],
  };
}

/** Opens a Mini App page, or (with `data`) comes back to the bot as a tap to answer. */
export type MessageButton = { label: string; path: string } | { label: string; data: string };

export type OutgoingMessage = { text: string; buttons: MessageButton[][] };

/** Tapped on a reminder: bk:<action>:<booking id>. Telegram allows 64 bytes; this takes 50 at most. */
export const replyPattern =
  /^bk:(coming|cancel|cancel_yes|cancel_no|accept|reject|reject_yes|reject_no):([0-9a-f-]{36})$/;

/** Accept or reject a request that's waiting for the shop. */
export function requestButtons(locale: Locale, bookingId: string): MessageButton[][] {
  const { notify } = getMessages(locale);
  return [
    [
      { label: notify.accept, data: `bk:accept:${bookingId}` },
      { label: notify.reject, data: `bk:reject:${bookingId}` },
    ],
  ];
}

export function rejectAskButtons(locale: Locale, bookingId: string): MessageButton[][] {
  const { notify } = getMessages(locale);
  return [
    [
      { label: notify.rejectYes, data: `bk:reject_yes:${bookingId}` },
      { label: notify.rejectNo, data: `bk:reject_no:${bookingId}` },
    ],
  ];
}

/** Coming, Cancel, and a page to move the booking on. */
export function reminderButtons(locale: Locale, bookingId: string): MessageButton[][] {
  const { notify } = getMessages(locale);
  return [
    [
      { label: notify.coming, data: `bk:coming:${bookingId}` },
      { label: notify.cancel, data: `bk:cancel:${bookingId}` },
    ],
    [{ label: notify.reschedule, path: `/booking/${bookingId}` }],
  ];
}

/** One slip of the thumb shouldn't lose someone their appointment. */
export function cancelAskButtons(locale: Locale, bookingId: string): MessageButton[][] {
  const { notify } = getMessages(locale);
  return [
    [
      { label: notify.cancelYes, data: `bk:cancel_yes:${bookingId}` },
      { label: notify.cancelNo, data: `bk:cancel_no:${bookingId}` },
    ],
  ];
}

/** The message in the person's language, or null for a template or payload we can't read. */
export function renderNotification(template: string, payload: unknown): OutgoingMessage | null {
  if ((staffTemplates as readonly string[]).includes(template)) {
    const staff = staffPayloadSchema.safeParse(payload);
    return staff.success ? renderStaffAlert(template as StaffTemplate, staff.data) : null;
  }
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
    'booking.reminder24h': notify.reminder24h,
    'booking.reminder2h': notify.reminder2h,
    'booking.review_ask': notify.reviewAsk,
  };
  const isReminder = (REMINDER_TEMPLATES as readonly string[]).includes(template);
  return {
    text: interpolate(body[template as BookingTemplate], {
      shop: typedText(shopName, locale),
      master: typedText(masterName, locale),
      date: formatDayMonth(start, locale),
      time: formatTime(start),
    }),
    buttons: isReminder
      ? reminderButtons(locale, bookingId)
      : [
          [
            {
              label: template === 'booking.review_ask' ? notify.reviewOpen : notify.open,
              path: `/booking/${bookingId}`,
            },
          ],
        ],
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

/** Page buttons are left out where a Mini App can't open (a plain http address in development). */
export function buildKeyboard(buttons: MessageButton[][], appUrl: string): InlineKeyboard {
  const base = appUrl.replace(/\/+$/, '');
  const keyboard = new InlineKeyboard();
  for (const row of buttons) {
    for (const button of row) {
      if ('data' in button) keyboard.text(button.label, button.data);
      else if (canOpenMiniApp(base)) keyboard.webApp(button.label, `${base}${button.path}`);
    }
    keyboard.row();
  }
  return keyboard;
}

export type Sender = (chatId: bigint, message: OutgoingMessage) => Promise<void>;

export function createSender(token: string, appUrl: string): Sender {
  const api = new Api(token);
  return async (chatId, { text, buttons }) => {
    await api.sendMessage(Number(chatId), text, {
      reply_markup: buildKeyboard(buttons, appUrl),
    });
  };
}
