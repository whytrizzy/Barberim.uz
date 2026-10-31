import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { route, uuidParam } from '@/server/http/route';
import { searchClients } from '@/server/services/shop-clients';

export const dynamic = 'force-dynamic';

/** Finds the shop's clients by name or phone while staff type. */
export const GET = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  rateLimit(`clients:search:${user.id}`, 60, 60);
  const query = new URL(request.url).searchParams.get('q') ?? '';
  const clients = await searchClients(user, uuidParam((await params).id, 'shop'), query);
  return Response.json({ clients }, { headers: { 'Cache-Control': 'no-store' } });
});
