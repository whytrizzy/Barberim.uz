import { route } from '@/server/http/route';
import { handlePayme } from '@/server/billing/payme';

export const dynamic = 'force-dynamic';

/**
 * Payme's Merchant API calls (JSON-RPC, Basic auth with our key). Every answer is HTTP 200, errors
 * included, as Payme expects.
 */
export const POST = route(async (request) => {
  const body: unknown = await request.json().catch(() => null);
  const answer = await handlePayme(request.headers.get('authorization'), body);
  return Response.json(answer, { headers: { 'Cache-Control': 'no-store' } });
});
