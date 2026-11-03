import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { route, uuidParam } from '@/server/http/route';
import { addFavorite, removeFavorite } from '@/server/services/favorites';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ shopId: string }> };

const shopId = async ({ params }: Context) => uuidParam((await params).shopId, 'shop');
const noStore = { 'Cache-Control': 'no-store' };

/** Saves a shop. */
export const PUT = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`favorite:${user.id}`, 60, 60);
  return Response.json(await addFavorite(user, await shopId(context)), { headers: noStore });
});

/** Forgets a saved shop. */
export const DELETE = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`favorite:${user.id}`, 60, 60);
  return Response.json(await removeFavorite(user, await shopId(context)), { headers: noStore });
});
