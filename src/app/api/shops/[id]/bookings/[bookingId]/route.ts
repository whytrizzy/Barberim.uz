import { requireUser } from '@/server/auth/auth';
import { route, uuidParam } from '@/server/http/route';
import { getBookingForStaff } from '@/server/services/calendar';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; bookingId: string }> };

/** One booking in full, for the shop's staff. Actions go through PATCH /api/bookings/:id. */
export const GET = route(async (request, { params }: Context) => {
  const user = await requireUser(request);
  const { id, bookingId } = await params;
  const booking = await getBookingForStaff(
    user,
    uuidParam(id, 'shop'),
    uuidParam(bookingId, 'booking'),
  );
  return Response.json(booking, { headers: { 'Cache-Control': 'no-store' } });
});
