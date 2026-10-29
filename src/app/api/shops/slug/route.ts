import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { route } from '@/server/http/route';
import { checkSlugAvailable } from '@/server/services/shop';

export const dynamic = 'force-dynamic';

/** GET /api/shops/slug?value=ustoz — is this link name free? (while the owner types) */
export const GET = route(async (request) => {
  const user = await requireUser(request);
  rateLimit(`shop:slug:${user.id}`, 60, 60);
  const value = new URL(request.url).searchParams.get('value') ?? '';
  return Response.json(await checkSlugAvailable(value.slice(0, 60)), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
