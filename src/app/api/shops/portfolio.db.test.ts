import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_PORTFOLIO_PHOTOS } from '@/features/portfolio/schemas';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { readLocalMedia } from '@/server/storage/media';
import { DELETE } from './[id]/staff/[staffId]/portfolio/[photoId]/route';
import { GET, POST, PUT } from './[id]/staff/[staffId]/portfolio/route';
import { GET as profile } from './by-slug/[slug]/route';

// Masters' portfolios against the real database, stored in the local .media/ folder
// (npm run test:db).

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 993_000_000 + Math.floor(Math.random() * 900_000);
const ids = {
  owner: BigInt(base + 1),
  admin: BigInt(base + 2),
  master: BigInt(base + 3),
  other: BigInt(base + 4),
  stranger: BigInt(base + 5),
};
type Who = keyof typeof ids;
const slug = `pf-${Date.now().toString(36)}`;
let shopId = '';
const staffIds = { owner: '', admin: '', master: '', other: '' };

const auth = (who: Who) =>
  `tma ${signInitData({ user: { id: Number(ids[who]), first_name: who } }, token)}`;
const on = <Extra extends Record<string, string>>(staffId: string, extra = {} as Extra) => ({
  params: Promise.resolve({ id: shopId, staffId, ...extra }),
});

/** A tiny but well-formed JPEG. */
const jpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9,
]); // prettier-ignore

const url = (staffId: string) => `http://t/api/shops/${shopId}/staff/${staffId}/portfolio`;
const send = (who: Who, staffId: string) =>
  POST(
    new Request(url(staffId), {
      method: 'POST',
      headers: { Authorization: auth(who), 'Content-Type': 'image/jpeg' },
      body: new Uint8Array(jpeg),
    }),
    on(staffId),
  );
const read = (who: Who, staffId: string) =>
  GET(new Request(url(staffId), { headers: { Authorization: auth(who) } }), on(staffId));
const order = (who: Who, staffId: string, photoIds: string[]) =>
  PUT(
    new Request(url(staffId), {
      method: 'PUT',
      headers: { Authorization: auth(who), 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: photoIds }),
    }),
    on(staffId),
  );
const remove = (who: Who, staffId: string, photoId: string) =>
  DELETE(
    new Request(`${url(staffId)}/${photoId}`, {
      method: 'DELETE',
      headers: { Authorization: auth(who) },
    }),
    on(staffId, { photoId }),
  );

type Photo = { id: string; url: string };
const keyOf = (photo: Photo) => photo.url.replace('/api/dev/media/', '');
const idOf = (key: string) => key.split('/').pop()!.split('.')[0]!;
const portfolioOf = async (staffId: string) =>
  (await db.staff.findUniqueOrThrow({ where: { id: staffId } })).portfolio;

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const shop = await db.shop.create({
    data: {
      slug,
      name: 'Portfolio Barber',
      region: 'tashkent-city',
      district: 'yunusobod',
      address: '4-mavze, 12-uy',
      status: 'ACTIVE',
    },
  });
  shopId = shop.id;
  const roles = { owner: 'OWNER', admin: 'ADMIN', master: 'MASTER', other: 'MASTER' } as const;
  for (const who of Object.keys(roles) as (keyof typeof roles)[]) {
    const user = await db.user.create({ data: { telegramId: ids[who], firstName: who } });
    const staff = await db.staff.create({
      data: { shopId, userId: user.id, displayName: who, role: roles[who] },
    });
    staffIds[who] = staff.id;
  }
  await db.user.create({ data: { telegramId: ids.stranger, firstName: 'stranger' } });
  await db.service.create({
    data: {
      shopId,
      name: 'Soch',
      durationMin: 30,
      price: 60_000,
      staff: { create: { staffId: staffIds.master } },
    },
  });
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  // Leave no files behind in .media/.
  for (const staffId of Object.values(staffIds)) {
    await db.staff.update({ where: { id: staffId }, data: { isActive: true } });
    for (const key of await portfolioOf(staffId)) await remove('owner', staffId, idOf(key));
  }
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(ids) } } });
  await db.$disconnect();
});

describe('a master’s portfolio', () => {
  let first: Photo;

  it('takes a master’s own photo and shows it under them on the shop’s page', async () => {
    const response = await send('master', staffIds.master);
    expect(response.status).toBe(201);
    const portfolio = await response.json();
    expect(portfolio).toMatchObject({ staffId: staffIds.master, canEdit: true });
    first = portfolio.photos[0];
    expect(first.url).toMatch(new RegExp(`^/api/dev/media/shops/${shopId}/[0-9a-f-]{36}\\.jpg$`));
    expect(await readLocalMedia(keyOf(first))).not.toBeNull();

    const shop = await (
      await profile(new Request('http://t/api', { headers: { Authorization: auth('stranger') } }), {
        params: Promise.resolve({ slug }),
      })
    ).json();
    const master = shop.masters.find((m: { id: string }) => m.id === staffIds.master);
    expect(master.portfolio).toEqual([first]);
  });

  it('lets owners and admins look after it, but not other masters or outsiders', async () => {
    expect((await send('admin', staffIds.master)).status).toBe(201);
    expect((await send('owner', staffIds.master)).status).toBe(201);
    expect((await send('other', staffIds.master)).status).toBe(403);
    expect((await send('stranger', staffIds.master)).status).toBe(403);
    expect((await remove('other', staffIds.master, first.id)).status).toBe(403);
    expect((await order('other', staffIds.master, [first.id])).status).toBe(403);
    // An admin doesn't manage the owner.
    expect((await send('admin', staffIds.owner)).status).toBe(403);

    expect(await (await read('other', staffIds.master)).json()).toMatchObject({ canEdit: false });
    expect((await read('stranger', staffIds.master)).status).toBe(403);
  });

  it(`keeps at most ${MAX_PORTFOLIO_PHOTOS} photos, even when uploads arrive at once`, async () => {
    const room = MAX_PORTFOLIO_PHOTOS - (await portfolioOf(staffIds.other)).length;
    const responses = await Promise.all(
      Array.from({ length: room + 2 }, () => send('other', staffIds.other)),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(room);
    expect(statuses.filter((s) => s === 409)).toHaveLength(2);
    expect(await portfolioOf(staffIds.other)).toHaveLength(MAX_PORTFOLIO_PHOTOS);
  }, 60_000);

  it('reorders photos, and refuses an order made from an out-of-date list', async () => {
    const reversed = (await portfolioOf(staffIds.master)).map(idOf).reverse();
    const response = await order('master', staffIds.master, reversed);
    expect(response.status).toBe(200);
    expect((await response.json()).photos.map((p: Photo) => p.id)).toEqual(reversed);

    const stale = await order('master', staffIds.master, reversed.slice(1));
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.details.reason).toBe('photos_changed');
  });

  it('deletes a photo and its file', async () => {
    const response = await remove('master', staffIds.master, first.id);
    expect(response.status).toBe(200);
    expect((await response.json()).photos.map((p: Photo) => p.id)).not.toContain(first.id);
    expect(await readLocalMedia(keyOf(first))).toBeNull();
    expect((await remove('master', staffIds.master, first.id)).status).toBe(404);
  });

  it('is gone once the master has left the shop', async () => {
    await db.staff.update({ where: { id: staffIds.other }, data: { isActive: false } });
    expect((await read('owner', staffIds.other)).status).toBe(404);
    expect((await send('owner', staffIds.other)).status).toBe(404);
  });
});
