import { BotError, GrammyError } from 'grammy';
import { describe, expect, it } from 'vitest';
import { summarizeBotError } from './errors';

const token = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

describe('summarizeBotError', () => {
  it('keeps the API failure details but never the token or message text', () => {
    const apiError = new GrammyError(
      "Call to 'sendMessage' failed!",
      { ok: false, error_code: 400, description: 'Bad Request: chat not found' },
      'sendMessage',
      { chat_id: 1, text: 'private message text' },
    );
    const ctx = { update: { update_id: 7 }, api: { token } };
    const summary = summarizeBotError(new BotError(apiError, ctx as never));

    expect(summary).toEqual({
      kind: 'telegram_api',
      method: 'sendMessage',
      code: 400,
      description: 'Bad Request: chat not found',
      updateId: 7,
    });
    const logged = JSON.stringify(summary);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain('private message text');
  });

  it('handles plain errors and junk', () => {
    expect(summarizeBotError(new TypeError('x'))).toMatchObject({
      kind: 'handler',
      name: 'TypeError',
    });
    expect(summarizeBotError('weird')).toEqual({ kind: 'unknown', updateId: undefined });
  });
});
