import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireStaff } from '@/server/auth/auth';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { POST as sessionRoute } from './route';

// Runs against the real database (npm run test:db) with the dev bot token from .env.local.

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const telegramId = 900_000_000 + Math.floor(Math.random() * 1_000_000);
let shopId: string;

function sessionRequest(initData: string | null, body: object = {}) {
  return new Request('http://test/api/auth/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(initData !== null && { Authorization: `tma ${initData}` }),
    },
    body: JSON.stringify(body),
  });
}

const signed = (firstName: string, authDate?: number) =>
  signInitData({ user: { id: telegramId, first_name: firstName }, auth_date: authDate }, token);

beforeAll(() => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing in .env.local');
});

afterAll(async () => {
  if (shopId) await db.shop.delete({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: BigInt(telegramId) } });
  await db.$disconnect();
});

describe('POST /api/auth/session', () => {
  it('creates the account from verified launch data and saves the chosen language', async () => {
    const response = await sessionRoute(sessionRequest(signed('Aziz'), { locale: 'ru' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user).toMatchObject({ firstName: 'Aziz', locale: 'ru', phone: null });
    expect(body.memberships).toEqual([]);
    const row = await db.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    expect(row?.locale).toBe('ru');
  });

  it('refreshes the profile from Telegram on the next start', async () => {
    const body = await (await sessionRoute(sessionRequest(signed('Aziz K.')))).json();
    expect(body.user.firstName).toBe('Aziz K.');
    expect(body.user.locale).toBe('ru'); // unchanged when the app doesn't send one
  });

  it('rejects missing, forged and expired launch data', async () => {
    const missing = await sessionRoute(sessionRequest(null));
    expect(missing.status).toBe(401);
    expect((await missing.json()).error.code).toBe('unauthorized');

    const forged = signed('Aziz').replace(String(telegramId), String(telegramId + 1));
    const forgedResponse = await sessionRoute(sessionRequest(forged));
    expect(forgedResponse.status).toBe(401);

    const old = signed('Aziz', Math.floor(Date.now() / 1000) - 2 * 86_400);
    const expired = await sessionRoute(sessionRequest(old));
    expect(expired.status).toBe(401);
    expect((await expired.json()).error.code).toBe('session_expired');
  });

  it('rejects an unknown locale with a 400', async () => {
    const response = await sessionRoute(sessionRequest(signed('Aziz'), { locale: 'en' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_input');
  });
});

describe('requireStaff', () => {
  it('allows only active staff with an allowed role in that shop', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { telegramId: BigInt(telegramId) } });
    const shop = await db.shop.create({
      data: { slug: `test-auth-${Date.now().toString(36)}`, name: 'Auth test', address: 'Test' },
    });
    shopId = shop.id;
    const staff = await db.staff.create({
      data: { shopId, userId: user.id, displayName: 'Aziz', role: 'MASTER' },
    });

    await expect(requireStaff(user.id, shopId)).resolves.toMatchObject({ id: staff.id });
    await expect(requireStaff(user.id, shopId, ['OWNER', 'ADMIN'])).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(requireStaff(user.id, crypto.randomUUID())).rejects.toMatchObject({
      code: 'forbidden',
    });

    // The session now lists the membership.
    const body = await (await sessionRoute(sessionRequest(signed('Aziz')))).json();
    expect(body.memberships).toEqual([
      {
        staffId: staff.id,
        role: 'MASTER',
        shop: { id: shopId, slug: shop.slug, name: 'Auth test' },
      },
    ]);

    await db.staff.update({ where: { id: staff.id }, data: { isActive: false } });
    await expect(requireStaff(user.id, shopId)).rejects.toMatchObject({ code: 'forbidden' });
  });
});
