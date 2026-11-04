import { updateClientRequestSchema } from '@/features/clients/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { getClient, updateClient } from '@/server/services/shop-clients';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; clientId: string }> };

const ids = async ({ params }: Context) => {
  const { id, clientId } = await params;
  return { shopId: uuidParam(id, 'shop'), clientId: uuidParam(clientId, 'client') };
};
const noStore = { 'Cache-Control': 'no-store' };

/** One client: counts, notes and visit history, for the shop's staff. */
export const GET = route(async (request, context: Context) => {
  const user = await requireUser(request);
  const { shopId, clientId } = await ids(context);
  return Response.json(await getClient(user, shopId, clientId), { headers: noStore });
});

/** Notes, or the blacklist. */
export const PATCH = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`clients:update:${user.id}`, 30, 60);
  const body = await readJson(request, updateClientRequestSchema);
  const { shopId, clientId } = await ids(context);
  return Response.json(await updateClient(user, shopId, clientId, body), { headers: noStore });
});
