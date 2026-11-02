import { describe, expect, it, vi } from 'vitest';
import { createBot, type BotConfig } from './bot';

const botInfo = {
  id: 1,
  is_bot: true,
  first_name: 'Barberim Dev',
  username: 'barberim_dev_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as NonNullable<BotConfig['botInfo']>;

/** A bot whose outgoing API calls are captured instead of sent to Telegram. */
function testBot(config: Partial<BotConfig> = {}) {
  const bot = createBot({ token: '1:test', appUrl: 'https://app.test', botInfo, ...config });
  const calls: { method: string; payload: Record<string, unknown> }[] = [];
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return Promise.resolve({ ok: true, result: true } as never);
  });
  return { bot, calls };
}

const from = { id: 42, is_bot: false, first_name: 'Aziz', language_code: 'uz' };

const bookingId = '01a19c4b-9c4a-77ef-b56c-e45457e311d0';

function tap(data: string) {
  return {
    update_id: 2,
    callback_query: {
      id: 'q1',
      from,
      chat_instance: 'c',
      data,
      message: {
        message_id: 9,
        date: 1,
        chat: { id: 42, type: 'private' as const, first_name: 'Aziz' },
        text: 'Eslatma',
      },
    },
  };
}

function replies(outcome: 'ok' | 'too_late' | 'not_found' = 'ok') {
  return {
    localeOf: vi.fn().mockResolvedValue('ru'),
    coming: vi.fn().mockResolvedValue(outcome),
    cancel: vi.fn().mockResolvedValue(outcome),
  };
}

describe('taps on a reminder', () => {
  it('records "coming" and turns the buttons into the answer', async () => {
    const bookingReplies = replies();
    const { bot, calls } = testBot({ bookingReplies });
    await bot.handleUpdate(tap(`bk:coming:${bookingId}`));
    expect(bookingReplies.coming).toHaveBeenCalledWith(42, bookingId);
    const edit = calls.find((c) => c.method === 'editMessageText');
    expect(edit?.payload.text).toContain('Eslatma');
    expect(edit?.payload.text).toContain('Спасибо');
    expect(calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
  });

  it('asks before cancelling, and doesn’t cancel on the first tap', async () => {
    const bookingReplies = replies();
    const { bot, calls } = testBot({ bookingReplies });
    await bot.handleUpdate(tap(`bk:cancel:${bookingId}`));
    expect(bookingReplies.cancel).not.toHaveBeenCalled();
    const edit = calls.find((c) => c.method === 'editMessageReplyMarkup');
    const markup = edit?.payload.reply_markup as {
      inline_keyboard: { callback_data: string }[][];
    };
    expect(markup.inline_keyboard[0]?.map((b) => b.callback_data)).toEqual([
      `bk:cancel_yes:${bookingId}`,
      `bk:cancel_no:${bookingId}`,
    ]);
  });

  it('cancels on yes, and puts the buttons back on no', async () => {
    const bookingReplies = replies();
    const { bot, calls } = testBot({ bookingReplies });
    await bot.handleUpdate(tap(`bk:cancel_no:${bookingId}`));
    expect(bookingReplies.cancel).not.toHaveBeenCalled();
    const back = calls.find((c) => c.method === 'editMessageReplyMarkup');
    expect(JSON.stringify(back?.payload.reply_markup)).toContain(`bk:coming:${bookingId}`);

    await bot.handleUpdate(tap(`bk:cancel_yes:${bookingId}`));
    expect(bookingReplies.cancel).toHaveBeenCalledWith(42, bookingId);
    const done = calls.find((c) => c.method === 'editMessageText');
    expect(done?.payload.text).toContain('Запись отменена');
  });

  it('says so when the booking is gone or over', async () => {
    const late = testBot({ bookingReplies: replies('too_late') });
    await late.bot.handleUpdate(tap(`bk:coming:${bookingId}`));
    const edit = late.calls.find((c) => c.method === 'editMessageText');
    expect(edit?.payload.text).toContain('уже не активна');
  });

  it('ignores anything that doesn’t look like one of ours', async () => {
    const bookingReplies = replies();
    const { bot } = testBot({ bookingReplies });
    await bot.handleUpdate(tap('bk:coming:not-a-booking'));
    await bot.handleUpdate(tap(`bk:delete:${bookingId}`));
    expect(bookingReplies.coming).not.toHaveBeenCalled();
  });
});

function contactUpdate(contact: { user_id?: number; phone_number: string }) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      chat: { id: 42, type: 'private' as const, first_name: 'Aziz' },
      from,
      contact: { first_name: 'Aziz', ...contact },
    },
  };
}

describe('bot contact handler', () => {
  it('saves the sender’s own contact and thanks them', async () => {
    const savePhone = vi.fn().mockResolvedValue('saved');
    const { bot, calls } = testBot({ savePhone });
    await bot.handleUpdate(contactUpdate({ user_id: 42, phone_number: '998901234567' }));
    expect(savePhone).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
      expect.objectContaining({ phone_number: '998901234567' }),
    );
    expect(calls[0]?.method).toBe('sendMessage');
    expect(calls[0]?.payload.text).toContain('saqlandi');
  });

  it('answers with the matching message when the number is refused', async () => {
    const { bot, calls } = testBot({ savePhone: vi.fn().mockResolvedValue('not_uz') });
    await bot.handleUpdate(contactUpdate({ user_id: 42, phone_number: '79001234567' }));
    expect(calls[0]?.payload.text).toContain('+998');
  });

  it('replies to /start with a Mini App button', async () => {
    const { bot, calls } = testBot();
    await bot.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        date: 1,
        chat: { id: 42, type: 'private', first_name: 'Aziz' },
        from,
        text: '/start shop_ustoz',
        entities: [{ type: 'bot_command', offset: 0, length: 6 }],
      },
    });
    const markup = calls[0]?.payload.reply_markup as {
      inline_keyboard: { web_app: { url: string } }[][];
    };
    expect(markup.inline_keyboard[0]?.[0]?.web_app.url).toBe('https://app.test/shop/ustoz');
  });
});
