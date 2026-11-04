import { parseDateKey } from '@/domain/time';
import { earningsQuerySchema } from '@/features/earnings/schemas';
import { requireUser } from '@/server/auth/auth';
import { AppError } from '@/server/http/errors';
import { rateLimit } from '@/server/http/rate-limit';
import { route, uuidParam } from '@/server/http/route';
import { getEarnings } from '@/server/services/earnings';

export const dynamic = 'force-dynamic';

/** Income, visits, no-shows, masters, top services and busy hours for a day, week or month. */
export const GET = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  rateLimit(`earnings:${user.id}`, 60, 60);
  const query = earningsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const date = query.success && query.data.date ? parseDateKey(query.data.date) : undefined;
  if (!query.success || date === null) throw new AppError('invalid_input', 'bad query');
  const earnings = await getEarnings(
    user,
    uuidParam((await params).id, 'shop'),
    query.data.period,
    date,
  );
  return Response.json(earnings, { headers: { 'Cache-Control': 'no-store' } });
});
