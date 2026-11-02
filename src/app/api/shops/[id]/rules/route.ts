import { shopRulesRequestSchema } from '@/features/shop/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { updateShopRules } from '@/server/services/shop';

export const dynamic = 'force-dynamic';

/** Owners and admins change how the shop takes bookings. */
export const POST = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  rateLimit(`shop:update:${user.id}`, 20, 60);
  const body = await readJson(request, shopRulesRequestSchema);
  return Response.json(await updateShopRules(user, uuidParam((await params).id, 'shop'), body), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
