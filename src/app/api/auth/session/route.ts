import { sessionRequestSchema, type SessionResponse } from '@/features/auth/schemas';
import { authenticate, fromDbLocale, syncUser } from '@/server/auth/auth';
import { db } from '@/server/db/client';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/**
 * Called once when the app starts: verifies Telegram's launch data, creates or refreshes the
 * account and returns who the user is and where they work.
 */
export const POST = route(async (request) => {
  const verified = authenticate(request);
  rateLimit(`session:${verified.user.id}`, 30, 60);
  const { locale } = await readJson(request, sessionRequestSchema);

  const user = await syncUser(verified, locale);
  const staff = await db.staff.findMany({
    where: { userId: user.id, isActive: true, shop: { status: { not: 'SUSPENDED' } } },
    select: { id: true, role: true, shop: { select: { id: true, slug: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const body: SessionResponse = {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      locale: fromDbLocale(user.locale),
    },
    memberships: staff.map((s) => ({ staffId: s.id, role: s.role, shop: s.shop })),
  };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
});
