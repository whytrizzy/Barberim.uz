import { bookingActionRequestSchema } from '@/features/booking/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { applyBookingAction } from '@/server/services/booking';

export const dynamic = 'force-dynamic';

/** Cancel, reschedule, confirm, complete or mark a no-show — as the client or as shop staff. */
export const PATCH = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const id = uuidParam((await params).id, 'booking');
  const user = await requireUser(request);
  rateLimit(`booking:action:${user.id}`, 30, 60);
  const body = await readJson(request, bookingActionRequestSchema);
  const input = body.action === 'reschedule' ? { ...body, startAt: new Date(body.startAt) } : body;
  const booking = await applyBookingAction(user, id, input);
  return Response.json(booking, { headers: { 'Cache-Control': 'no-store' } });
});
