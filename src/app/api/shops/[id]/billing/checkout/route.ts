import { checkoutRequestSchema } from '@/features/billing/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { startCheckout } from '@/server/services/billing';

export const dynamic = 'force-dynamic';

/** A month of PRO: creates the order and returns the provider's checkout page. Owners only. */
export const POST = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  rateLimit(`billing:checkout:${user.id}`, 10, 60);
  const { provider } = await readJson(request, checkoutRequestSchema);
  const checkout = await startCheckout(user, uuidParam((await params).id, 'shop'), provider);
  return Response.json(checkout, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
