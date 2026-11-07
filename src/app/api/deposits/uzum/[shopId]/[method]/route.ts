import { AppError } from '@/server/http/errors';
import { handleShopUzum } from '@/server/deposits/providers';
import { route, uuidParam } from '@/server/http/route';
import { UZUM_METHODS, type UzumMethod } from '@/server/payments/uzum';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ shopId: string; method: string }> };

/**
 * Uzum Bank's Merchant API calls for one shop's client deposits (check, create, confirm,
 * reverse, status), with that shop's own login and password. Errors are HTTP 400, as Uzum expects.
 */
export const POST = route(async (request, { params }: Context) => {
  const { shopId: rawShopId, method } = await params;
  const shopId = uuidParam(rawShopId, 'shop');
  if (!(UZUM_METHODS as readonly string[]).includes(method)) {
    throw new AppError('not_found', 'unknown Uzum method');
  }
  const body: unknown = await request.json().catch(() => undefined);
  const answer = await handleShopUzum(
    shopId,
    method as UzumMethod,
    request.headers.get('authorization'),
    body,
  );
  return Response.json(answer.body, {
    status: answer.status,
    headers: { 'Cache-Control': 'no-store' },
  });
});
