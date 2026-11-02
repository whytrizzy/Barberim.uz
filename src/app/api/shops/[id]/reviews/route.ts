import { requireUser } from '@/server/auth/auth';
import { route, uuidParam } from '@/server/http/route';
import { listShopReviews } from '@/server/services/reviews';

export const dynamic = 'force-dynamic';

/** The shop's reviews, for its staff. */
export const GET = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  return Response.json(await listShopReviews(user, uuidParam((await params).id, 'shop')), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
