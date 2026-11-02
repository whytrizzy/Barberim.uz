import { requireUser } from '@/server/auth/auth';
import { route, uuidParam } from '@/server/http/route';
import { getMyBooking } from '@/server/services/my-bookings';

export const dynamic = 'force-dynamic';

/** One of the person's bookings. Actions go through PATCH /api/bookings/:id. */
export const GET = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  return Response.json(await getMyBooking(user, uuidParam((await params).id, 'booking')), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
