/**
 * Runs on Cloudflare, apart from the app (`npx wrangler deploy` from this folder):
 * - serves uploaded photos from the R2 bucket on a free workers.dev address, read-only;
 * - every 5 minutes, asks the app to send what's due in its outbox.
 */

/** The only keys the app writes (see src/server/storage/media.ts); anything else is a 404. */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PHOTO_KEY = new RegExp(`^shops/${UUID}/${UUID}\\.(jpg|webp)$`);

export function photoKey(url) {
  const key = new URL(url).pathname.slice(1);
  return PHOTO_KEY.test(key) ? key : null;
}

async function servePhoto(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const key = photoKey(request.url);
  if (!key) return new Response('Not found', { status: 404 });

  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  // The content type and "cache forever" were stored with the photo when it was uploaded.
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
}

async function runOutbox(env) {
  const response = await fetch(`${env.APP_URL}/api/cron/dispatch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  // Failing here marks the run as failed in Cloudflare's logs; the next one tries again anyway.
  if (!response.ok) throw new Error(`outbox answered ${response.status}`);
}

const worker = {
  fetch: servePhoto,
  scheduled: (_event, env, ctx) => ctx.waitUntil(runOutbox(env)),
};

export default worker;
