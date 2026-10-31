import { createStaffBookingRequestSchema } from '@/features/booking/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { createStaffBooking } from '@/server/services/booking';

export const dynamic = 'force-dynamic';

/** Staff add a walk-in or a booking taken by phone. */
export const POST = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  rateLimit(`booking:staff:${user.id}`, 60, 60);
  const body = await readJson(request, createStaffBookingRequestSchema);
  const booking = await createStaffBooking(user, {
    ...body,
    shopId: uuidParam((await params).id, 'shop'),
    startAt: new Date(body.startAt),
  });
  return Response.json(booking, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
