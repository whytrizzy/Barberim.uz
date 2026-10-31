import { parseDateKey } from '@/domain/time';
import { requireUser } from '@/server/auth/auth';
import { AppError } from '@/server/http/errors';
import { route, uuidParam } from '@/server/http/route';
import { getCalendarDay } from '@/server/services/calendar';

export const dynamic = 'force-dynamic';

/** One day of the shop's calendar. */
export const GET = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(request);
  const shopId = uuidParam((await params).id, 'shop');
  const date = parseDateKey(new URL(request.url).searchParams.get('date') ?? '');
  if (!date) throw new AppError('invalid_input', 'bad date');
  return Response.json(await getCalendarDay(user, shopId, date), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
