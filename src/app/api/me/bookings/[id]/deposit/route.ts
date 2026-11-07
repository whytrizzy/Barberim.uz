import { depositCheckoutRequestSchema } from '@/features/deposits/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { startDepositCheckout } from '@/server/services/deposits';

export const dynamic = 'force-dynamic';

/** Pay the deposit on one's own booking: a Payme/Click checkout page, or an Uzum code. */
export const POST = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  rateLimit(`deposit:checkout:${user.id}`, 20, 60);
  const { provider } = await readJson(request, depositCheckoutRequestSchema);
  const checkout = await startDepositCheckout(
    user,
    uuidParam((await params).id, 'booking'),
    provider,
  );
  return Response.json(checkout, { headers: { 'Cache-Control': 'no-store' } });
});
