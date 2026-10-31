import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { route } from '@/server/http/route';
import { getShopProfile } from '@/server/services/shop-profile';

export const dynamic = 'force-dynamic';

/** The page behind a shop's link. */
export const GET = route(async (request, { params }: { params: Promise<{ slug: string }> }) => {
  const user = await requireUser(request);
  rateLimit(`shop:profile:${user.id}`, 60, 60);
  return Response.json(await getShopProfile(user, (await params).slug), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
