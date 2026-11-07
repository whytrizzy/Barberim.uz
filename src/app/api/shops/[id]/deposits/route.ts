import { depositSettingsRequestSchema } from '@/features/deposits/schemas';
import { requireUser } from '@/server/auth/auth';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route, uuidParam } from '@/server/http/route';
import { getDepositSettings, saveDepositSettings } from '@/server/services/deposits';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };
const noStore = { 'Cache-Control': 'no-store' };

/** The owner's deposit settings. Saved provider secrets are never sent back. */
export const GET = route(async (request, { params }: Context) => {
  const user = await requireUser(request);
  const settings = await getDepositSettings(user, uuidParam((await params).id, 'shop'));
  return Response.json(settings, { headers: noStore });
});

export const PUT = route(async (request, { params }: Context) => {
  const user = await requireUser(request);
  rateLimit(`deposits:settings:${user.id}`, 20, 60);
  const body = await readJson(request, depositSettingsRequestSchema);
  const settings = await saveDepositSettings(user, uuidParam((await params).id, 'shop'), body);
  return Response.json(settings, { headers: noStore });
});
