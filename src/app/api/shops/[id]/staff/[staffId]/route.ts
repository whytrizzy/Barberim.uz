import { updateStaffRequestSchema } from '@/features/team/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { removeStaff, updateStaff } from '@/server/services/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; staffId: string }> };

const ids = async ({ params }: Context) => {
  const { id, staffId } = await params;
  return { shopId: uuidParam(id, 'shop'), staffId: uuidParam(staffId, 'staff') };
};

export const PATCH = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`staff:write:${user.id}`, 30, 60);
  const body = await readJson(request, updateStaffRequestSchema);
  const { shopId, staffId } = await ids(context);
  return Response.json(await updateStaff(user, shopId, staffId, body), {
    headers: { 'Cache-Control': 'no-store' },
  });
});

export const DELETE = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`staff:write:${user.id}`, 30, 60);
  const { shopId, staffId } = await ids(context);
  await removeStaff(user, shopId, staffId);
  return Response.json({ removed: true }, { headers: { 'Cache-Control': 'no-store' } });
});
