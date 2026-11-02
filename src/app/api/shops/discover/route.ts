import { discoverRequestSchema } from '@/features/shop/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route } from '@/server/http/route';
import { discoverShops } from '@/server/services/discover';

export const dynamic = 'force-dynamic';

/** Finds live shops by text, place, price, free time today or distance. */
export const POST = route(async (request) => {
  const user = await requireUser(request);
  rateLimit(`shop:discover:${user.id}`, 60, 60);
  const body = await readJson(request, discoverRequestSchema);
  return Response.json(await discoverShops(body), { headers: { 'Cache-Control': 'no-store' } });
});
