import { clientListQuerySchema } from '@/features/clients/schemas';
import { requireUser } from '@/server/auth/auth';
import { AppError } from '@/server/http/errors';
import { rateLimit } from '@/server/http/rate-limit';
import { route, uuidParam } from '@/server/http/route';
import { listClients, searchClients } from '@/server/services/shop-clients';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * Finds the shop's clients by name or phone while staff type (a few matches), or with
 * `view=list`, a page of the client list (filters, newest activity first).
 */
export const GET = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  rateLimit(`clients:search:${user.id}`, 60, 60);
  const shopId = uuidParam((await params).id, 'shop');
  const search = new URL(request.url).searchParams;
  if (search.get('view') === 'list') {
    const query = clientListQuerySchema.safeParse(Object.fromEntries(search));
    if (!query.success) throw new AppError('invalid_input', 'bad query');
    return Response.json(await listClients(user, shopId, query.data), { headers: noStore });
  }
  const clients = await searchClients(user, shopId, search.get('q') ?? '');
  return Response.json({ clients }, { headers: noStore });
});
