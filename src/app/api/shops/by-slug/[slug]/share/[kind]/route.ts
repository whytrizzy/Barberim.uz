import { locales, type Locale } from '@/i18n/locales';
import { AppError } from '@/server/http/errors';
import { rateLimit } from '@/server/http/rate-limit';
import { route } from '@/server/http/route';
import { SHARE_KINDS, shareImage, type ShareKind } from '@/server/services/share-kit';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ slug: string; kind: string }> };

/**
 * The sharing kit's pictures (story.png, poster.png, qr.svg) for a live shop. No sign-in: they
 * carry only what the shop's public page shows, and Telegram downloads them by address.
 */
export const GET = route(async (request, { params }: Context) => {
  const { slug, kind: file } = await params;
  const kind = file.replace(/\.(png|svg)$/, '') as ShareKind;
  if (!SHARE_KINDS.includes(kind)) throw new AppError('not_found', 'no such picture');
  const lang = new URL(request.url).searchParams.get('lang');
  const locale: Locale = (locales as readonly string[]).includes(lang ?? '')
    ? (lang as Locale)
    : 'uz-Latn';
  // No sign-in here, so the limit is per address (Render passes the client's in front).
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  rateLimit(`share-kit:${ip}`, 30, 60);
  const image = await shareImage(slug, kind, locale);
  const headers = new Headers(image.headers);
  // A renamed shop shows its new name within minutes.
  headers.set('Cache-Control', 'public, max-age=300');
  headers.set(
    'Content-Disposition',
    `inline; filename="${slug}-${kind}.${kind === 'qr' ? 'svg' : 'png'}"`,
  );
  return new Response(image.body, { status: image.status, headers });
});
