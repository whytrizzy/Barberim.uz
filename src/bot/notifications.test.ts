import { GrammyError, HttpError } from 'grammy';
import { describe, expect, it } from 'vitest';
import { classifySendError, renderNotification } from './notifications';

const payload = {
  bookingId: 'b1',
  shopName: 'Ustoz',
  masterName: 'Sardor',
  // 15:00 in Tashkent.
  startAt: '2026-11-03T10:00:00.000Z',
  locale: 'uz-Latn',
};

const apiError = (code: number, description: string, parameters = {}) =>
  new GrammyError(
    'failed',
    { ok: false, error_code: code, description, parameters },
    'sendMessage',
    { chat_id: 1 },
  );

describe('renderNotification', () => {
  it('fills in the shop, master, date and time in Tashkent', () => {
    const message = renderNotification('booking.created', payload);
    expect(message?.text).toContain('Ustoz');
    expect(message?.text).toContain('Sardor');
    expect(message?.text).toContain('3-noyabr');
    expect(message?.text).toContain('15:00');
    expect(message?.buttons).toEqual([[{ label: 'Yozuvni ochish', path: '/booking/b1' }]]);
  });

  it('writes in all three languages, transliterating typed names for Cyrillic', () => {
    const ru = renderNotification('booking.moved', { ...payload, locale: 'ru' });
    expect(ru?.text).toContain('3 ноября');
    const cyrillic = renderNotification('booking.moved', { ...payload, locale: 'uz-Cyrl' });
    expect(cyrillic?.text).toContain('Сардор');
    expect(cyrillic?.text).not.toMatch(/Sardor|\{/);
  });

  it('refuses what it cannot read', () => {
    expect(renderNotification('booking.unknown', payload)).toBeNull();
    expect(renderNotification('booking.created', { bookingId: 'b1' })).toBeNull();
  });
});

describe('classifySendError', () => {
  it('gives up when the person can never receive it', () => {
    expect(classifySendError(apiError(403, 'bot was blocked by the user')).kind).toBe('permanent');
    expect(classifySendError(apiError(400, 'chat not found')).kind).toBe('permanent');
  });

  it('waits as long as Telegram asks', () => {
    const failure = classifySendError(apiError(429, 'Too Many Requests', { retry_after: 12 }));
    expect(failure).toMatchObject({ kind: 'rate_limited', retryAfterSec: 12 });
  });

  it('retries server and network trouble, and never keeps the token', () => {
    expect(classifySendError(apiError(502, 'Bad Gateway')).kind).toBe('temporary');
    const network = new HttpError('Network request failed', new Error('offline'));
    const failure = classifySendError(network);
    expect(failure.kind).toBe('temporary');
    expect(failure.reason).not.toContain('bot123');
  });
});
