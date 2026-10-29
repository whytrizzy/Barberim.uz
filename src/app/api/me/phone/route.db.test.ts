import { afterAll, describe, expect, it } from 'vitest';
import { signInitData, signParams } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { savePhoneFromBotContact } from '@/server/services/profile';
import { PUT } from './route';

// Runs against the real database (npm run test:db) with the dev bot token from .env.local.

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const telegramId = 910_000_000 + Math.floor(Math.random() * 1_000_000);
const now = () => Math.floor(Date.now() / 1000);

function put(body: object) {
  const initData = signInitData({ user: { id: telegramId, first_name: 'Phone' } }, token);
  return PUT(
    new Request('http://test/api/me/phone', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
      body: JSON.stringify(body),
    }),
  );
}

const signedContact = (userId: number, phone: string) =>
  signParams(
    new URLSearchParams({
      contact: JSON.stringify({ user_id: userId, phone_number: phone, first_name: 'Phone' }),
      auth_date: String(now()),
    }),
    token,
  );

afterAll(async () => {
  await db.user.deleteMany({ where: { telegramId: BigInt(telegramId) } });
  await db.$disconnect();
});

describe('PUT /api/me/phone', () => {
  it('saves a typed number as unverified, in E.164', async () => {
    const response = await put({ source: 'manual', phone: '90 123 45 67' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ phone: '+998901234567', phoneVerified: false });
  });

  it('rejects incomplete and foreign typed numbers with a reason', async () => {
    const short = await put({ source: 'manual', phone: '90 123' });
    expect(short.status).toBe(400);
    expect((await short.json()).error.details.reason).toBe('phone_invalid');

    const foreign = await put({ source: 'manual', phone: '+7 901 234 56 78' });
    expect((await foreign.json()).error.details.reason).toBe('phone_not_uz');
  });

  it('saves a Telegram-shared contact as verified', async () => {
    const response = await put({
      source: 'telegram',
      contact: signedContact(telegramId, '998935554433'),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ phone: '+998935554433', phoneVerified: true });
  });

  it('keeps it verified when the same number is typed again, not when it changes', async () => {
    expect(await (await put({ source: 'manual', phone: '93 555 44 33' })).json()).toEqual({
      phone: '+998935554433',
      phoneVerified: true,
    });
    expect(
      (await (await put({ source: 'manual', phone: '90 000 00 00' })).json()).phoneVerified,
    ).toBe(false);
  });

  it('refuses someone else’s contact and forged contacts', async () => {
    const other = await put({
      source: 'telegram',
      contact: signedContact(telegramId + 1, '998901111111'),
    });
    expect(other.status).toBe(403);

    const forged = signedContact(telegramId, '998901111111').replace(
      '998901111111',
      '998902222222',
    );
    const forgedResponse = await put({ source: 'telegram', contact: forged });
    expect(forgedResponse.status).toBe(400);
    expect((await forgedResponse.json()).error.details.reason).toBe('contact_invalid');
  });
});

describe('savePhoneFromBotContact', () => {
  it('verifies the sender’s own contact and ignores others', async () => {
    const from = { id: telegramId, first_name: 'Phone' };
    expect(
      await savePhoneFromBotContact(from, {
        user_id: telegramId + 5,
        phone_number: '998901234567',
      }),
    ).toBe('not_own');
    expect(
      await savePhoneFromBotContact(from, { user_id: telegramId, phone_number: '79001234567' }),
    ).toBe('not_uz');
    expect(
      await savePhoneFromBotContact(from, { user_id: telegramId, phone_number: '+998977777777' }),
    ).toBe('saved');
    const user = await db.user.findUniqueOrThrow({ where: { telegramId: BigInt(telegramId) } });
    expect(user).toMatchObject({ phone: '+998977777777', phoneVerified: true });
  });
});
