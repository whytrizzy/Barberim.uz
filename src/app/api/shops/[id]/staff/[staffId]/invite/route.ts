import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { route, uuidParam } from '@/server/http/route';
import { createInvite } from '@/server/services/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; staffId: string }> };

/** A new invite link for someone on the team who has no login yet. */
export const POST = route(async (request, { params }: Context) => {
  const user = await requireUser(request);
  rateLimit(`staff:invite:${user.id}`, 10, 60);
  const { id, staffId } = await params;
  const invite = await createInvite(user, uuidParam(id, 'shop'), uuidParam(staffId, 'staff'));
  return Response.json(invite, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
