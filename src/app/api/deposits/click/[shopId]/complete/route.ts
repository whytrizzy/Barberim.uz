import { handleShopClick } from '@/server/deposits/providers';
import { route, uuidParam } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** Click's Complete call for one shop's client deposits, signed with that shop's secret key. */
export const POST = route(async (request, { params }: { params: Promise<{ shopId: string }> }) => {
  const shopId = uuidParam((await params).shopId, 'shop');
  const form = await request.formData().catch(() => null);
  const fields = Object.fromEntries(
    [...(form?.entries() ?? [])].map(([key, value]) => [key, String(value)]),
  );
  return Response.json(await handleShopClick(shopId, 'complete', fields), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
