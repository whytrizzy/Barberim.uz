import { createShopRequestSchema } from '@/features/shop/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route } from '@/server/http/route';
import { createShop } from '@/server/services/shop';

export const dynamic = 'force-dynamic';

/** Opens a new shop with the signed-in user as its owner. */
export const POST = route(async (request) => {
  const user = await requireUser(request);
  rateLimit(`shop:create:${user.id}`, 5, 60);
  const body = await readJson(request, createShopRequestSchema);
  const shop = await createShop(user, body);
  return Response.json(shop, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
