import { bookingNoticeRequestSchema } from '@/features/booking/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { sendBookingNotice } from '@/server/services/notices';

export const dynamic = 'force-dynamic';

/** "Your turn is next" or "running late", from the shop; "I'm running late", from the client. */
export const POST = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const id = uuidParam((await params).id, 'booking');
  const user = await requireUser(request);
  rateLimit(`booking:notice:${user.id}`, 20, 60);
  const body = await readJson(request, bookingNoticeRequestSchema);
  return Response.json(await sendBookingNotice(user, id, body), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
