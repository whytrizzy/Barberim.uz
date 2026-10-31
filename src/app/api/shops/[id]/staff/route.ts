import { addStaffRequestSchema } from '@/features/team/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { addStaff, listTeam } from '@/server/services/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const shopId = async ({ params }: Context) => uuidParam((await params).id, 'shop');

/** Who works at the shop, for its staff. */
export const GET = route(async (request, context: Context) => {
  const user = await requireUser(request);
  return Response.json(await listTeam(user, await shopId(context)), {
    headers: { 'Cache-Control': 'no-store' },
  });
});

/** Owners and admins add someone to the team. */
export const POST = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`staff:write:${user.id}`, 30, 60);
  const body = await readJson(request, addStaffRequestSchema);
  const added = await addStaff(user, await shopId(context), body);
  return Response.json(added, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
