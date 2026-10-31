import 'server-only';
import type { ClientMatch } from '@/features/booking/schemas';
import type { User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';

/**
 * Clients matching what's typed: by name, or by phone when it's mostly digits. Owners and admins
 * search the whole shop; a master only finds people they have served, as with their calendar.
 */
export async function searchClients(
  user: User,
  shopId: string,
  query: string,
): Promise<ClientMatch[]> {
  const me = await requireStaff(user.id, shopId);
  const text = query.trim().slice(0, 60);
  if (text.length < 2) return [];
  const digits = text.replace(/\D/g, '');
  const looksLikePhone = digits.length >= 2 && digits.length >= text.replace(/\s/g, '').length - 1;
  return db.shopClient.findMany({
    where: {
      shopId,
      ...(looksLikePhone
        ? { phone: { contains: digits } }
        : { name: { contains: text, mode: 'insensitive' } }),
      ...(me.role === 'MASTER' && { bookings: { some: { staffId: me.id } } }),
    },
    select: { id: true, name: true, phone: true, visitCount: true },
    orderBy: [{ visitCount: 'desc' }, { updatedAt: 'desc' }],
    take: 6,
  });
}
