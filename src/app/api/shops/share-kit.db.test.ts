import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { shopShareLink } from '@/server/services/share-kit';
import { GET as picture } from './by-slug/[slug]/share/[kind]/route';

// The sharing kit's pictures against the real database (npm run test:db). They render for real:
// a PNG that starts with the PNG signature is a picture that was drawn.

const slug = `sk-${Date.now().toString(36)}`;
const draft = `${slug}-d`;
let shopIds: string[] = [];

const get = (shop: string, file: string, lang = 'uz-Latn') =>
  picture(new Request(`http://t/api?lang=${lang}`), {
    params: Promise.resolve({ slug: shop, kind: file }),
  });
const isPng = async (response: Response) => {
  const bytes = new Uint8Array(await response.arrayBuffer());
  return [0x89, 0x50, 0x4e, 0x47].every((byte, i) => bytes[i] === byte) && bytes.length > 10_000;
};

beforeAll(async () => {
  const place = { region: 'tashkent-city', district: 'yunusobod', address: `Manzil ${slug}` };
  const live = await db.shop.create({
    data: { slug, name: 'Ustoz Qoʻqon', status: 'ACTIVE', ...place },
  });
  const hidden = await db.shop.create({ data: { slug: draft, name: 'Draft', ...place } });
  shopIds = [live.id, hidden.id];
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.shop.deleteMany({ where: { id: { in: shopIds } } });
  await db.$disconnect();
});

describe('the sharing kit', () => {
  it('draws the story card and the poster, in each language', async () => {
    for (const lang of ['uz-Latn', 'uz-Cyrl', 'ru']) {
      const story = await get(slug, 'story.png', lang);
      expect(story.status).toBe(200);
      expect(story.headers.get('Content-Type')).toBe('image/png');
      expect(story.headers.get('Cache-Control')).toContain('max-age=300');
      expect(await isPng(story)).toBe(true);
    }
    expect(await isPng(await get(slug, 'poster.png'))).toBe(true);
  }, 120_000);

  it('gives the bare QR code as SVG, for the shop’s bot link', async () => {
    const qr = await get(slug, 'qr.svg');
    expect(qr.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(await qr.text()).toMatch(/^<svg/);
    expect(shopShareLink(slug).link).toMatch(new RegExp(`\\?start=shop_${slug}$`));
  });

  it('has nothing for a shop that isn’t live, or a picture that doesn’t exist', async () => {
    expect((await get(draft, 'story.png')).status).toBe(404);
    expect((await get('no-such-shop-here', 'qr.svg')).status).toBe(404);
    expect((await get(slug, 'menu.pdf')).status).toBe(404);
  });
});
