import { shopStatusRequestSchema } from '@/features/shop/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { setShopStatus } from '@/server/services/shop-profile';

export const dynamic = 'force-dynamic';

/** Owners and admins put the shop live or take it down. */
export const POST = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  rateLimit(`shop:status:${user.id}`, 20, 60);
  const body = await readJson(request, shopStatusRequestSchema);
  return Response.json(await setShopStatus(user, uuidParam((await params).id, 'shop'), body), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
