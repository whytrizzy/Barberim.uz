import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { route } from '@/server/http/route';
import { acceptInvite, previewInvite } from '@/server/services/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ token: string }> };

/** What an invite link is for, for whoever opened it. */
export const GET = route(async (request, { params }: Context) => {
  const user = await requireUser(request);
  rateLimit(`invite:read:${user.id}`, 30, 60);
  return Response.json(await previewInvite(user, (await params).token), {
    headers: { 'Cache-Control': 'no-store' },
  });
});

/** Accepts the invite: the signed-in user joins the shop. */
export const POST = route(async (request, { params }: Context) => {
  const user = await requireUser(request);
  rateLimit(`invite:accept:${user.id}`, 10, 60);
  return Response.json(await acceptInvite(user, (await params).token), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
