import { reviewActionSchema } from '@/features/reviews/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { actOnReview } from '@/server/services/reviews';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; reviewId: string }> };

/** Answers a review, or flags it for moderation. */
export const PATCH = route(async (request, { params }: Context) => {
  const user = await requireUser(request);
  rateLimit(`review:act:${user.id}`, 30, 60);
  const body = await readJson(request, reviewActionSchema);
  const { id, reviewId } = await params;
  const result = await actOnReview(
    user,
    uuidParam(id, 'shop'),
    uuidParam(reviewId, 'review'),
    body,
  );
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
});
