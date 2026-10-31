import { weeklyRequestSchema } from '@/features/schedule/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { getSchedule, setWeeklyHours } from '@/server/services/schedule';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; staffId: string }> };

const ids = async ({ params }: Context) => {
  const { id, staffId } = await params;
  return { shopId: uuidParam(id, 'shop'), staffId: uuidParam(staffId, 'staff') };
};

/** Someone's hours and upcoming changes, for the shop's staff. */
export const GET = route(async (request, context: Context) => {
  const user = await requireUser(request);
  const { shopId, staffId } = await ids(context);
  return Response.json(await getSchedule(user, shopId, staffId), {
    headers: { 'Cache-Control': 'no-store' },
  });
});

/** Replaces the weekly hours. */
export const PUT = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`schedule:write:${user.id}`, 30, 60);
  const body = await readJson(request, weeklyRequestSchema);
  const { shopId, staffId } = await ids(context);
  return Response.json(await setWeeklyHours(user, shopId, staffId, body), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
