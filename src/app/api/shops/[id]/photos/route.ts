import { MAX_PHOTO_BYTES, reorderPhotosRequestSchema } from '@/features/shop/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readBytes, readJson, route, uuidParam } from '@/server/http/route';
import { addShopPhoto, reorderShopPhotos } from '@/server/services/shop-photos';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const shopId = async ({ params }: Context) => uuidParam((await params).id, 'shop');
const noStore = { 'Cache-Control': 'no-store' };

/** Adds a photo. The body is the image itself (JPEG or WebP), resized by the app. */
export const POST = route(async (request, context: Context) => {
  const user = await requireUser(request);
  const id = await shopId(context);
  rateLimit(`shop:photo:${user.id}`, 30, 10 * 60);
  const bytes = await readBytes(request, MAX_PHOTO_BYTES);
  return Response.json(await addShopPhoto(user, id, bytes), { status: 201, headers: noStore });
});

/** Puts the photos in a new order (the first one becomes the cover). */
export const PUT = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`shop:update:${user.id}`, 20, 60);
  const { order } = await readJson(request, reorderPhotosRequestSchema);
  return Response.json(await reorderShopPhotos(user, await shopId(context), order), {
    headers: noStore,
  });
});
