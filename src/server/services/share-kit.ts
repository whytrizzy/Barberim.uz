import 'server-only';
import { ImageResponse } from 'next/og';
import { createElement } from 'react';
import { regions } from '@/domain/places';
import { checkSlug } from '@/domain/slug';
import { clientEnv } from '@/env/client';
import { formatMoney } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import type { Locale } from '@/i18n/locales';
import { getMessages } from '@/i18n/messages';
import { districtName, placeName, typedText } from '@/i18n/places';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { Poster, StoryCard, type ShareCardData } from '../share/cards';
import { shareFonts } from '../share/fonts';
import { qrDataUri, qrSvg } from '../share/qr';
import { ratingSummary } from './reviews';

// The sharing kit: a story card, a window poster and a bare QR code for a live shop, all pointing
// at its bot link. Only what the shop's public page shows goes on them.

export const SHARE_KINDS = ['story', 'poster', 'qr'] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

const SIZES = { story: { width: 1080, height: 1920 }, poster: { width: 1240, height: 1754 } };
const INK = '#0f332b';

/** The link every printed or posted code opens: the bot, straight to this shop. */
export function shopShareLink(slug: string): { link: string; bot: string } {
  const bot = clientEnv.NEXT_PUBLIC_BOT_USERNAME ?? 'barberim_bot';
  return { link: `https://t.me/${bot}?start=shop_${slug}`, bot: `@${bot}` };
}

async function liveShop(slug: string) {
  const shop = checkSlug(slug) === null ? await db.shop.findUnique({ where: { slug } }) : null;
  // A draft or suspended shop has nothing to share yet.
  if (!shop || shop.status !== 'ACTIVE') throw new AppError('not_found', 'no such shop');
  return shop;
}

async function cardData(slug: string, locale: Locale): Promise<ShareCardData> {
  const shop = await liveShop(slug);
  const { services: words } = getMessages(locale);
  const [rating, cheapest] = await Promise.all([
    ratingSummary(shop.id),
    db.service.aggregate({
      where: {
        shopId: shop.id,
        isActive: true,
        staff: { some: { staff: { isActive: true, isBookable: true } } },
      },
      _min: { price: true },
    }),
  ]);
  const region = regions.find((candidate) => candidate.key === shop.region);
  const area = [districtName(shop.district, locale), region && placeName(region, locale)]
    .filter(Boolean)
    .join(', ');
  const { link, bot } = shopShareLink(shop.slug);
  return {
    name: typedText(shop.name, locale),
    area,
    bot,
    rating:
      rating.average !== null
        ? `${rating.average.toFixed(1).replace('.', ',')} ★ · ${rating.count}`
        : null,
    fromPrice:
      cheapest._min.price !== null
        ? interpolate(words.fromPrice, { price: formatMoney(cheapest._min.price, locale) })
        : null,
    qr: await qrDataUri(link, INK),
  };
}

/** One picture of the kit, ready to send as the response. */
export async function shareImage(slug: string, kind: ShareKind, locale: Locale): Promise<Response> {
  if (kind === 'qr') {
    const shop = await liveShop(slug);
    const svg = await qrSvg(shopShareLink(shop.slug).link, INK);
    return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
  }
  const data = await cardData(slug, locale);
  const t = getMessages(locale).share;
  const card =
    kind === 'story' ? createElement(StoryCard, { data, t }) : createElement(Poster, { data, t });
  return new ImageResponse(card, { ...SIZES[kind], fonts: await shareFonts() });
}
