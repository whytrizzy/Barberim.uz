import { createGroupBookingRequestSchema } from '@/features/booking/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route } from '@/server/http/route';
import { createClientBookings } from '@/server/services/booking';

export const dynamic = 'force-dynamic';

/** A family books back to back with one master (or any free one): all together or not at all. */
export const POST = route(async (request) => {
  const user = await requireUser(request);
  rateLimit(`booking:create:${user.id}`, 10, 60);
  const body = await readJson(request, createGroupBookingRequestSchema);
  const bookings = await createClientBookings(user, { ...body, startAt: new Date(body.startAt) });
  return Response.json(
    { groupId: bookings[0]?.groupId ?? null, bookings },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
});
