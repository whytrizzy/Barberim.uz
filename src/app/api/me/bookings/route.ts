import { requireUser } from '@/server/auth/auth';
import { route } from '@/server/http/route';
import { listMyBookings } from '@/server/services/my-bookings';

export const dynamic = 'force-dynamic';

/** The signed-in person's upcoming and past bookings. */
export const GET = route(async (request) => {
  const user = await requireUser(request);
  return Response.json(await listMyBookings(user), { headers: { 'Cache-Control': 'no-store' } });
});
