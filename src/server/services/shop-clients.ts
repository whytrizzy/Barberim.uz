import 'server-only';
import type { ClientMatch } from '@/features/booking/schemas';
import {
  CLIENT_HISTORY_LIMIT,
  CLIENTS_PAGE_SIZE,
  REGULAR_VISITS,
  type ClientDetailDto,
  type ClientFilter,
  type ClientListDto,
  type UpdateClientRequest,
} from '@/features/clients/schemas';
import type { Prisma, User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';

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

/** Owners and admins see every client; a master only those they have served. */
async function clientScope(user: User, shopId: string) {
  const me = await requireStaff(user.id, shopId);
  const scope: Prisma.ShopClientWhereInput = {
    shopId,
    ...(me.role === 'MASTER' && { bookings: { some: { staffId: me.id } } }),
  };
  return { me, scope };
}

const filters: Record<ClientFilter, Prisma.ShopClientWhereInput> = {
  all: {},
  regulars: { visitCount: { gte: REGULAR_VISITS } },
  no_shows: { noShowCount: { gt: 0 } },
  blocked: { isBlocked: true },
};

/** The latest finished visit of each of these clients. */
async function lastVisits(clientIds: string[]): Promise<Map<string, Date>> {
  const rows = await db.booking.groupBy({
    by: ['shopClientId'],
    where: { shopClientId: { in: clientIds }, status: 'COMPLETED' },
    _max: { startAt: true },
  });
  return new Map(rows.flatMap((r) => (r._max.startAt ? [[r.shopClientId, r._max.startAt]] : [])));
}

/** The shop's clients, most recently active first, a page at a time. */
export async function listClients(
  user: User,
  shopId: string,
  { q, filter, page }: { q: string; filter: ClientFilter; page: number },
): Promise<ClientListDto> {
  const { scope } = await clientScope(user, shopId);
  const digits = q.replace(/\D/g, '');
  const looksLikePhone = digits.length >= 2 && digits.length >= q.replace(/\s/g, '').length - 1;
  const rows = await db.shopClient.findMany({
    where: {
      ...scope,
      ...filters[filter],
      ...(q.length >= 2 &&
        (looksLikePhone
          ? { phone: { contains: digits } }
          : { name: { contains: q, mode: 'insensitive' } })),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    skip: page * CLIENTS_PAGE_SIZE,
    // One more than a page, to know whether there is a next one.
    take: CLIENTS_PAGE_SIZE + 1,
  });
  const shown = rows.slice(0, CLIENTS_PAGE_SIZE);
  const visits = await lastVisits(shown.map((row) => row.id));
  return {
    clients: shown.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      visitCount: row.visitCount,
      noShowCount: row.noShowCount,
      isBlocked: row.isBlocked,
      lastVisitAt: visits.get(row.id)?.toISOString() ?? null,
    })),
    more: rows.length > CLIENTS_PAGE_SIZE,
  };
}

export async function getClient(
  user: User,
  shopId: string,
  clientId: string,
): Promise<ClientDetailDto> {
  const { me, scope } = await clientScope(user, shopId);
  const client = await db.shopClient.findFirst({
    where: { ...scope, id: clientId },
    include: {
      bookings: {
        orderBy: { startAt: 'desc' },
        take: CLIENT_HISTORY_LIMIT,
        include: {
          staff: { select: { displayName: true } },
          items: { orderBy: { sortOrder: 'asc' }, select: { nameSnapshot: true } },
        },
      },
    },
  });
  // A client of the shop a master hasn't served looks the same as one that doesn't exist.
  if (!client) throw new AppError('not_found', 'no such client');
  const spent = await db.booking.aggregate({
    where: { shopClientId: client.id, status: 'COMPLETED' },
    _sum: { totalPrice: true },
  });
  const last = client.bookings.find((b) => b.status === 'COMPLETED');
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    visitCount: client.visitCount,
    noShowCount: client.noShowCount,
    isBlocked: client.isBlocked,
    lastVisitAt: last?.startAt.toISOString() ?? null,
    notes: client.notes,
    totalSpent: spent._sum.totalPrice ?? 0,
    hasTelegram: client.userId !== null,
    canBlock: me.role !== 'MASTER',
    visits: client.bookings.map((b) => ({
      id: b.id,
      startAt: b.startAt.toISOString(),
      status: b.status,
      masterName: b.staff.displayName,
      services: b.items.map((item) => item.nameSnapshot),
      totalPrice: b.totalPrice,
    })),
  };
}

/**
 * Notes (anyone who can see the client) and the blacklist (owners and admins): a blocked client
 * can't book or wait online; staff can still book them by hand.
 */
export async function updateClient(
  user: User,
  shopId: string,
  clientId: string,
  input: UpdateClientRequest,
): Promise<ClientDetailDto> {
  const { me, scope } = await clientScope(user, shopId);
  const client = await db.shopClient.findFirst({ where: { ...scope, id: clientId } });
  if (!client) throw new AppError('not_found', 'no such client');
  if (input.isBlocked !== undefined && me.role === 'MASTER') {
    throw new AppError('forbidden', 'only owners and admins block clients');
  }
  await db.$transaction([
    db.shopClient.update({
      where: { id: client.id },
      data: {
        ...(input.notes !== undefined && { notes: input.notes || null }),
        ...(input.isBlocked !== undefined && { isBlocked: input.isBlocked }),
      },
    }),
    db.auditLog.create({
      data: {
        shopId,
        actorUserId: user.id,
        action:
          input.isBlocked === undefined
            ? 'client.notes'
            : input.isBlocked
              ? 'client.block'
              : 'client.unblock',
        entity: 'shop_client',
        entityId: client.id,
      },
    }),
  ]);
  return getClient(user, shopId, client.id);
}
