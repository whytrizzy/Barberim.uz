import { isDevelopment } from '@/env/server';
import { cacheControlForMedia, readLocalMedia } from '@/server/storage/media';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ key: string[] }> };

/**
 * Development only: serves photos from the local .media/ folder, standing in for CloudFront.
 * 404 everywhere else (deployed environments serve photos from the CDN, never from here).
 */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  if (!isDevelopment) return new Response('Not found', { status: 404 });
  const key = (await params).key.join('/');
  const bytes = await readLocalMedia(key);
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': key.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
      'Cache-Control': cacheControlForMedia,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
