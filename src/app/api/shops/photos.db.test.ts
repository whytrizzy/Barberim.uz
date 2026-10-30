import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_PHOTO_BYTES, MAX_SHOP_PHOTOS } from '@/features/shop/schemas';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { readLocalMedia } from '@/server/storage/media';
import { GET as media } from '../dev/media/[...key]/route';
import { DELETE } from './[id]/photos/[photoId]/route';
import { POST as upload, PUT as reorder } from './[id]/photos/route';
import { POST as createShop } from './route';

// Shop photos against the real database, stored in the local .media/ folder (npm run test:db).

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 950_000_000 + Math.floor(Math.random() * 1_000_000);
const userIds = { owner: BigInt(base + 1), other: BigInt(base + 2) };
type Who = keyof typeof userIds;
let shopId = '';

const auth = (who: Who) =>
  `tma ${signInitData({ user: { id: Number(userIds[who]), first_name: who } }, token)}`;

const ctx = <Extra extends Record<string, string>>(extra = {} as Extra) => ({
  params: Promise.resolve({ id: shopId, ...extra }),
});

/** A tiny but well-formed JPEG carrying an EXIF block with a GPS note. */
const jpeg = (() => {
  const exif = [...'Exif\0\0GPS 41.29 69.20'].map((c) => c.charCodeAt(0));
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, 0, exif.length + 2, ...exif,
    0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9,
  ]);
})(); // prettier-ignore

function send(who: Who, body: Uint8Array, type = 'image/jpeg') {
  return upload(
    new Request(`http://t/api/shops/${shopId}/photos`, {
      method: 'POST',
      headers: { Authorization: auth(who), 'Content-Type': type },
      body: new Uint8Array(body),
    }),
    ctx(),
  );
}

function order(who: Who, ids: string[]) {
  return reorder(
    new Request(`http://t/api/shops/${shopId}/photos`, {
      method: 'PUT',
      headers: { Authorization: auth(who), 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ids }),
    }),
    ctx(),
  );
}

function remove(who: Who, photoId: string) {
  return DELETE(
    new Request(`http://t/api/shops/${shopId}/photos/${photoId}`, {
      method: 'DELETE',
      headers: { Authorization: auth(who) },
    }),
    ctx({ photoId }),
  );
}

type Photo = { id: string; url: string };
const keyOf = (photo: Photo) => photo.url.replace('/api/dev/media/', '');

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const response = await createShop(
    new Request('http://t/api/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth('owner') },
      body: JSON.stringify({
        slug: `photos-${Date.now().toString(36)}`,
        name: 'Photo Barber',
        region: 'tashkent-city',
        district: 'yunusobod',
        address: '4-mavze, 12-uy',
      }),
    }),
  );
  shopId = (await response.json()).id;
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  // Leave no files behind in .media/.
  const shop = await db.shop.findUnique({ where: { id: shopId } });
  for (const key of shop?.photos ?? []) {
    const id = key.split('/').pop()!.split('.')[0]!;
    await remove('owner', id);
  }
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(userIds) } } });
  await db.$disconnect();
});

describe('shop photos', () => {
  let first: Photo;

  it('stores an uploaded photo without its EXIF and serves it locally', async () => {
    const response = await send('owner', jpeg);
    expect(response.status).toBe(201);
    const shop = await response.json();
    expect(shop.photos).toHaveLength(1);
    first = shop.photos[0];
    expect(first.url).toMatch(new RegExp(`^/api/dev/media/shops/${shopId}/[0-9a-f-]{36}\\.jpg$`));

    const stored = await readLocalMedia(keyOf(first));
    expect(stored).not.toBeNull();
    expect(String.fromCharCode(...stored!)).not.toContain('GPS');

    const served = await media(new Request(`http://t${first.url}`), {
      params: Promise.resolve({ key: keyOf(first).split('/') }),
    });
    expect(served.status).toBe(200);
    expect(served.headers.get('Content-Type')).toBe('image/jpeg');
    expect(served.headers.get('Cache-Control')).toContain('immutable');
  });

  it('refuses files that are not photos, oversized uploads and people outside the shop', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const notImage = await send('owner', png, 'image/jpeg');
    expect(notImage.status).toBe(400);
    expect((await notImage.json()).error.details.reason).toBe('not_an_image');

    const huge = new Uint8Array(MAX_PHOTO_BYTES + 1);
    huge.set(jpeg);
    const tooLarge = await send('owner', huge);
    expect(tooLarge.status).toBe(400);
    expect((await tooLarge.json()).error.details.reason).toBe('too_large');

    expect((await send('other', jpeg)).status).toBe(403);
    expect((await remove('other', first.id)).status).toBe(403);
    expect((await order('other', [first.id])).status).toBe(403);
  });

  it(`keeps at most ${MAX_SHOP_PHOTOS} photos, even when uploads arrive at once`, async () => {
    const responses = await Promise.all(
      Array.from({ length: MAX_SHOP_PHOTOS + 1 }, () => send('owner', jpeg)),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(MAX_SHOP_PHOTOS - 1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(2);
    const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } });
    expect(shop.photos).toHaveLength(MAX_SHOP_PHOTOS);
  }, 60_000);

  it('reorders photos, and refuses an order made from an out-of-date list', async () => {
    const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } });
    const ids = shop.photos.map((key) => key.split('/').pop()!.split('.')[0]!);
    const reversed = [...ids].reverse();

    const response = await order('owner', reversed);
    expect(response.status).toBe(200);
    expect((await response.json()).photos.map((p: Photo) => p.id)).toEqual(reversed);

    const stale = await order('owner', reversed.slice(1));
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.details.reason).toBe('photos_changed');
    expect((await order('owner', [...reversed.slice(1), reversed[1]!])).status).toBe(409);
  });

  it('deletes a photo and its file', async () => {
    const response = await remove('owner', first.id);
    expect(response.status).toBe(200);
    const shop = await response.json();
    expect(shop.photos.map((p: Photo) => p.id)).not.toContain(first.id);
    expect(await readLocalMedia(keyOf(first))).toBeNull();
    expect((await remove('owner', first.id)).status).toBe(404);
    expect((await remove('owner', 'not-a-uuid')).status).toBe(404);
  });
});
