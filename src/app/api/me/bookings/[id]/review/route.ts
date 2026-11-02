import { reviewRequestSchema } from '@/features/reviews/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { createReview, getMyReview } from '@/server/services/reviews';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const bookingId = async ({ params }: Context) => uuidParam((await params).id, 'booking');

/** The client's own review of this visit, if they left one. */
export const GET = route(async (request, context: Context) => {
  const user = await requireUser(request);
  return Response.json(await getMyReview(user, await bookingId(context)), {
    headers: { 'Cache-Control': 'no-store' },
  });
});

/** Reviews a finished visit. */
export const POST = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`review:write:${user.id}`, 10, 60);
  const body = await readJson(request, reviewRequestSchema);
  const review = await createReview(user, await bookingId(context), body);
  return Response.json(review, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
