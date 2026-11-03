import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { route, uuidParam } from '@/server/http/route';
import { leaveWaitlist } from '@/server/services/waitlist';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** Stops waiting for that day. */
export const DELETE = route(async (request, { params }: Context) => {
  const user = await requireUser(request);
  rateLimit(`waitlist:${user.id}`, 20, 60);
  const id = uuidParam((await params).id, 'waitlist entry');
  return Response.json(await leaveWaitlist(user, id), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
