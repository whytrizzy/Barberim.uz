import { route } from '@/server/http/route';
import { handleClick } from '@/server/billing/click';

export const dynamic = 'force-dynamic';

/** Click's Complete call (a signed form post); the answer carries Click's own error code. */
export const POST = route(async (request) => {
  const form = await request.formData().catch(() => null);
  const fields = Object.fromEntries(
    [...(form?.entries() ?? [])].map(([key, value]) => [key, String(value)]),
  );
  return Response.json(await handleClick('complete', fields), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
