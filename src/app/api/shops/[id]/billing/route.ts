import { requireUser } from '@/server/auth/auth';
import { route, uuidParam } from '@/server/http/route';
import { getBilling } from '@/server/services/billing';

export const dynamic = 'force-dynamic';

/** The plan page: price, paid time, how to pay, past payments. */
export const GET = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  const billing = await getBilling(user, uuidParam((await params).id, 'shop'));
  return Response.json(billing, { headers: { 'Cache-Control': 'no-store' } });
});
