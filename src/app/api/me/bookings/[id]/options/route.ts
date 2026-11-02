import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { route, uuidParam } from '@/server/http/route';
import { getMoveOptions } from '@/server/services/my-bookings';

export const dynamic = 'force-dynamic';

/** The days and times this booking can move to. */
export const GET = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  rateLimit(`availability:${user.id}`, 120, 60);
  return Response.json(await getMoveOptions(user, uuidParam((await params).id, 'booking')), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
