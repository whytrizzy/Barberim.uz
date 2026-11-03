import { joinWaitlistRequestSchema } from '@/features/waitlist/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route } from '@/server/http/route';
import { joinWaitlist, listWaitlist } from '@/server/services/waitlist';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

/** The days the signed-in person is waiting for. */
export const GET = route(async (request) => {
  const user = await requireUser(request);
  return Response.json(await listWaitlist(user), { headers: noStore });
});

/** "Tell me if a time frees up that day." */
export const POST = route(async (request) => {
  const user = await requireUser(request);
  rateLimit(`waitlist:${user.id}`, 20, 60);
  const body = await readJson(request, joinWaitlistRequestSchema);
  return Response.json(await joinWaitlist(user, body), { status: 201, headers: noStore });
});
