import { z } from 'zod';
import { updateShopRequestSchema } from '@/features/shop/schemas';
import { requireUser } from '@/server/auth/auth';
import { AppError } from '@/server/http/errors';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route } from '@/server/http/route';
import { getShopForStaff, updateShop } from '@/server/services/shop';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

async function shopId({ params }: Context) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new AppError('not_found', 'bad shop id');
  return id;
}

/** The shop's details, for its staff. */
export const GET = route(async (request, context: Context) => {
  const user = await requireUser(request);
  return Response.json(await getShopForStaff(user, await shopId(context)), {
    headers: { 'Cache-Control': 'no-store' },
  });
});

/** Owners and admins update the shop's details. */
export const PATCH = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`shop:update:${user.id}`, 20, 60);
  const body = await readJson(request, updateShopRequestSchema);
  return Response.json(await updateShop(user, await shopId(context), body), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
