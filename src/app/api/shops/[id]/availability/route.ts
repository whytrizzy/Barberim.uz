import { availabilityQuerySchema } from '@/features/booking/schemas';
import { requireUser } from '@/server/auth/auth';
import { AppError } from '@/server/http/errors';
import { rateLimit } from '@/server/http/rate-limit';
import { route, uuidParam } from '@/server/http/route';
import { getBookingOptions } from '@/server/services/availability';

export const dynamic = 'force-dynamic';

/** The days and times a client can book for the chosen services and master. */
export const GET = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  rateLimit(`availability:${user.id}`, 120, 60);
  const search = new URL(request.url).searchParams;
  const query = availabilityQuerySchema.safeParse({
    staff: search.get('staff'),
    services: (search.get('services') ?? '').split(',').filter(Boolean),
  });
  if (!query.success) throw new AppError('invalid_input', 'bad query');
  const options = await getBookingOptions(
    uuidParam((await params).id, 'shop'),
    query.data.staff,
    query.data.services,
  );
  return Response.json(options, { headers: { 'Cache-Control': 'no-store' } });
});
