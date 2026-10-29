import { createBookingRequestSchema } from '@/features/booking/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route } from '@/server/http/route';
import { createClientBooking } from '@/server/services/booking';

export const dynamic = 'force-dynamic';

/** A client books a time with a master. */
export const POST = route(async (request) => {
  const user = await requireUser(request);
  rateLimit(`booking:create:${user.id}`, 10, 60);
  const body = await readJson(request, createBookingRequestSchema);
  const booking = await createClientBooking(user, { ...body, startAt: new Date(body.startAt) });
  return Response.json(booking, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
