import { handleShopPayme } from '@/server/deposits/providers';
import { route, uuidParam } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/**
 * Payme's Merchant API calls for one shop's client deposits, signed with that shop's own key.
 * Every answer is HTTP 200, errors included, as Payme expects.
 */
export const POST = route(async (request, { params }: { params: Promise<{ shopId: string }> }) => {
  const shopId = uuidParam((await params).shopId, 'shop');
  const body: unknown = await request.json().catch(() => null);
  const answer = await handleShopPayme(shopId, request.headers.get('authorization'), body);
  return Response.json(answer, { headers: { 'Cache-Control': 'no-store' } });
});
