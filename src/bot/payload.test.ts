import { describe, expect, it } from 'vitest';
import { botTexts, startMessage } from './messages';
import { canOpenMiniApp, miniAppUrl, parseStartPayload } from './payload';

describe('parseStartPayload', () => {
  it('reads shop, staff and invite links', () => {
    expect(parseStartPayload('shop_ustoz-barbershop')).toEqual({
      kind: 'shop',
      slug: 'ustoz-barbershop',
    });
    expect(parseStartPayload('staff_7f3a9c')).toEqual({ kind: 'staff', staffId: '7f3a9c' });
    expect(parseStartPayload('invite_AbC123_xyz-987654321')).toEqual({
      kind: 'invite',
      token: 'AbC123_xyz-987654321',
    });
  });

  it('treats empty, unknown and malformed payloads as a plain start', () => {
    expect(parseStartPayload(undefined)).toEqual({ kind: 'none' });
    expect(parseStartPayload('')).toEqual({ kind: 'none' });
    expect(parseStartPayload('barber_123')).toEqual({ kind: 'none' }); // v1 format
    expect(parseStartPayload('shop_UPPER')).toEqual({ kind: 'none' }); // slugs are lowercase
    expect(parseStartPayload('shop_../admin')).toEqual({ kind: 'none' });
    expect(parseStartPayload('invite_short')).toEqual({ kind: 'none' }); // tokens are long
  });
});

describe('miniAppUrl', () => {
  const app = 'https://app.barberim.uz/';

  it('maps each payload to its page', () => {
    expect(miniAppUrl(app, { kind: 'shop', slug: 'ustoz' })).toBe(
      'https://app.barberim.uz/shop/ustoz',
    );
    expect(miniAppUrl(app, { kind: 'staff', staffId: 'a1' })).toBe(
      'https://app.barberim.uz/master/a1',
    );
    expect(miniAppUrl(app, { kind: 'none' })).toBe('https://app.barberim.uz');
  });

  it('knows Telegram needs HTTPS', () => {
    expect(canOpenMiniApp('https://x.uz')).toBe(true);
    expect(canOpenMiniApp('http://localhost:3000')).toBe(false);
  });
});

describe('bot texts', () => {
  it('answers Russian users in Russian and everyone else in Uzbek', () => {
    expect(botTexts('ru').open).toBe('Открыть Barberim');
    expect(botTexts('RU-ru').open).toBe('Открыть Barberim');
    expect(botTexts('uz').open).toBe('Barberimni ochish');
    expect(botTexts('en').open).toBe('Barberimni ochish');
    expect(botTexts(undefined).open).toBe('Barberimni ochish');
  });

  it('picks the message and button for each payload', () => {
    const t = botTexts('uz');
    expect(startMessage(t, { kind: 'shop', slug: 'x' }).button).toBe('Yozilish');
    expect(startMessage(t, { kind: 'invite', token: 'x' }).button).toBe('Taklifni ochish');
    expect(startMessage(t, { kind: 'none' }).text).toContain('Barberim');
  });
});
