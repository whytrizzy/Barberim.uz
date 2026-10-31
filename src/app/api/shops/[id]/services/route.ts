import { serviceRequestSchema } from '@/features/services/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { createService, listShopServices } from '@/server/services/shop-services';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const shopId = async ({ params }: Context) => uuidParam((await params).id, 'shop');

/** The shop's services and masters, for its staff. */
export const GET = route(async (request, context: Context) => {
  const user = await requireUser(request);
  return Response.json(await listShopServices(user, await shopId(context)), {
    headers: { 'Cache-Control': 'no-store' },
  });
});

/** Owners and admins add a service. */
export const POST = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`service:write:${user.id}`, 30, 60);
  const body = await readJson(request, serviceRequestSchema);
  const service = await createService(user, await shopId(context), body);
  return Response.json(service, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
