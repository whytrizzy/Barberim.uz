import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { route, uuidParam } from '@/server/http/route';
import { removeShopPhoto } from '@/server/services/shop-photos';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; photoId: string }> };

/** Deletes a photo. */
export const DELETE = route(async (request, { params }: Context) => {
  const user = await requireUser(request);
  rateLimit(`shop:update:${user.id}`, 20, 60);
  const { id, photoId } = await params;
  return Response.json(
    await removeShopPhoto(user, uuidParam(id, 'shop'), uuidParam(photoId, 'photo')),
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
