import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InitDataInvalid, signInitData, verifyInitData } from './init-data';

const token = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
const user = { id: 42, first_name: 'Aziz', language_code: 'uz' };
const now = new Date('2026-11-03T09:00:00Z');
const authDate = Math.floor(now.getTime() / 1000) - 60;

function reason(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    return error instanceof InitDataInvalid ? error.reason : 'other';
  }
  return 'accepted';
}

describe('verifyInitData', () => {
  it('accepts data signed with the bot token', () => {
    const raw = signInitData({ user, auth_date: authDate, start_param: 'shop_ustoz' }, token);
    const result = verifyInitData(raw, token, { now });
    expect(result.user).toEqual(user);
    expect(result.startParam).toBe('shop_ustoz');
    expect(result.authDate.getTime()).toBe(authDate * 1000);
  });

  it('matches an independent implementation of Telegram’s algorithm', () => {
    // Built by hand here (not with signInitData) so a shared bug can't hide.
    const fields = {
      auth_date: String(authDate),
      query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
      user: JSON.stringify(user),
      signature: 'ed25519-signature-is-part-of-the-check-string',
    };
    const check = Object.entries(fields)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    const hash = createHmac('sha256', secret).update(check).digest('hex');
    const raw = new URLSearchParams({ ...fields, hash }).toString();
    expect(verifyInitData(raw, token, { now }).user.id).toBe(42);
  });

  it('rejects tampering: another user id with the original hash', () => {
    const raw = signInitData({ user, auth_date: authDate }, token);
    const forged = raw.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
    expect(forged).not.toBe(raw);
    expect(reason(() => verifyInitData(forged, token, { now }))).toBe('bad_signature');
  });

  it('rejects data signed with a different bot token', () => {
    const raw = signInitData(
      { user, auth_date: authDate },
      '987654321:ZZHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',
    );
    expect(reason(() => verifyInitData(raw, token, { now }))).toBe('bad_signature');
  });

  it('rejects stale data and data from the future', () => {
    const old = signInitData({ user, auth_date: authDate - 25 * 3600 }, token);
    expect(reason(() => verifyInitData(old, token, { now }))).toBe('expired');
    const future = signInitData({ user, auth_date: authDate + 3600 }, token);
    expect(reason(() => verifyInitData(future, token, { now }))).toBe('expired');
  });

  it('rejects missing or malformed input', () => {
    expect(reason(() => verifyInitData('', token, { now }))).toBe('missing');
    expect(reason(() => verifyInitData(null, token, { now }))).toBe('missing');
    expect(reason(() => verifyInitData('user=x&auth_date=1', token, { now }))).toBe('malformed');
    expect(reason(() => verifyInitData('hash=zz', token, { now }))).toBe('malformed');
  });
});
