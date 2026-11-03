import { requireUser } from '@/server/auth/auth';
import { route } from '@/server/http/route';
import { listFavorites } from '@/server/services/favorites';

export const dynamic = 'force-dynamic';

/** The signed-in person's saved shops. */
export const GET = route(async (request) => {
  const user = await requireUser(request);
  return Response.json(await listFavorites(user), { headers: { 'Cache-Control': 'no-store' } });
});
