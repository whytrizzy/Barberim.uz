import { serviceRequestSchema } from '@/features/services/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { deleteService, updateService } from '@/server/services/shop-services';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; serviceId: string }> };

const ids = async ({ params }: Context) => {
  const { id, serviceId } = await params;
  return { shopId: uuidParam(id, 'shop'), serviceId: uuidParam(serviceId, 'service') };
};

/** Owners and admins change a service and who does it. */
export const PATCH = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`service:write:${user.id}`, 30, 60);
  const body = await readJson(request, serviceRequestSchema);
  const { shopId, serviceId } = await ids(context);
  return Response.json(await updateService(user, shopId, serviceId, body), {
    headers: { 'Cache-Control': 'no-store' },
  });
});

export const DELETE = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`service:write:${user.id}`, 30, 60);
  const { shopId, serviceId } = await ids(context);
  await deleteService(user, shopId, serviceId);
  return Response.json({ deleted: true }, { headers: { 'Cache-Control': 'no-store' } });
});
