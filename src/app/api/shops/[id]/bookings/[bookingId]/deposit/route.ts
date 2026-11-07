import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { route, uuidParam } from '@/server/http/route';
import { markDepositRefunded } from '@/server/services/deposits';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; bookingId: string }> };

/** The shop refunded a client's deposit itself (in its Click cabinet, or by hand). */
export const POST = route(async (request, { params }: Context) => {
  const user = await requireUser(request);
  rateLimit(`deposit:refund:${user.id}`, 20, 60);
  const { id, bookingId } = await params;
  await markDepositRefunded(user, uuidParam(id, 'shop'), uuidParam(bookingId, 'booking'));
  return Response.json({ refunded: true }, { headers: { 'Cache-Control': 'no-store' } });
});
