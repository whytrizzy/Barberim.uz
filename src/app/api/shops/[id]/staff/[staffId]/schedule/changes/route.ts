import { changeRequestSchema, removeChangeQuerySchema } from '@/features/schedule/schemas';
import { requireUser } from '@/server/auth/auth';
import { AppError } from '@/server/http/errors';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { addChange, removeChange } from '@/server/services/schedule';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; staffId: string }> };

const ids = async ({ params }: Context) => {
  const { id, staffId } = await params;
  return { shopId: uuidParam(id, 'shop'), staffId: uuidParam(staffId, 'staff') };
};

/** A day off, a vacation, special hours or "today I leave at 16:00". */
export const POST = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`schedule:write:${user.id}`, 30, 60);
  const body = await readJson(request, changeRequestSchema);
  const { shopId, staffId } = await ids(context);
  return Response.json(await addChange(user, shopId, staffId, body), {
    status: 201,
    headers: { 'Cache-Control': 'no-store' },
  });
});

/** Undoes a change: those dates follow the weekly hours again. */
export const DELETE = route(async (request, context: Context) => {
  const user = await requireUser(request);
  rateLimit(`schedule:write:${user.id}`, 30, 60);
  const url = new URL(request.url);
  const range = removeChangeQuerySchema.safeParse({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
  });
  if (!range.success) throw new AppError('invalid_input', 'bad dates');
  const { shopId, staffId } = await ids(context);
  return Response.json(await removeChange(user, shopId, staffId, range.data), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
