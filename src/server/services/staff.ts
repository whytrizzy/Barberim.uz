import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { canAssignRole, canManageStaff } from '@/domain/staff';
import {
  INVITE_DAYS,
  MAX_SHOP_STAFF,
  inviteTokenPattern,
  type AddStaffRequest,
  type InvitePreviewDto,
  type InviteState,
  type StaffMemberDto,
  type TeamDto,
  type TeamRefusal,
  type UpdateStaffRequest,
} from '@/features/team/schemas';
import type { User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';

const managers = ['OWNER', 'ADMIN'] as const;

function refuse(reason: TeamRefusal | InviteState): never {
  throw new AppError('conflict', reason, { reason });
}

/** Only the hash is stored, so a database leak can't be used to join a shop. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

async function audit(user: User, shopId: string, action: string, staffId: string) {
  await db.auditLog.create({
    data: { shopId, actorUserId: user.id, action, entity: 'staff', entityId: staffId },
  });
}

async function findMember(shopId: string, staffId: string) {
  const member = await db.staff.findFirst({ where: { id: staffId, shopId, isActive: true } });
  if (!member) throw new AppError('not_found', 'no such staff member');
  return member;
}

/** Who works at the shop, for its staff. */
export async function listTeam(user: User, shopId: string): Promise<TeamDto> {
  const me = await requireStaff(user.id, shopId);
  const now = new Date();
  const members = await db.staff.findMany({
    where: { shopId, isActive: true },
    include: {
      invites: {
        where: { usedAt: null, expiresAt: { gt: now } },
        orderBy: { expiresAt: 'desc' },
        take: 1,
        select: { expiresAt: true },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return {
    canAdd: canAssignRole(me.role, 'MASTER'),
    canAssignAdmin: canAssignRole(me.role, 'ADMIN'),
    members: members.map((member): StaffMemberDto => ({
      id: member.id,
      name: member.displayName,
      role: member.role,
      isBookable: member.isBookable,
      linked: member.userId !== null,
      isYou: member.id === me.id,
      canManage: canManageStaff(me.role, member.role),
      inviteExpiresAt: member.invites[0]?.expiresAt.toISOString() ?? null,
    })),
  };
}

/** Adds someone who has no login yet. They start with all the shop's services, as most do. */
export async function addStaff(user: User, shopId: string, input: AddStaffRequest) {
  const me = await requireStaff(user.id, shopId, [...managers]);
  if (!canAssignRole(me.role, input.role)) throw new AppError('forbidden', 'cannot assign role');
  const existing = await db.staff.count({ where: { shopId, isActive: true } });
  if (existing >= MAX_SHOP_STAFF) refuse('too_many_staff');

  const staff = await db.$transaction(async (tx) => {
    const { _max } = await tx.staff.aggregate({ where: { shopId }, _max: { sortOrder: true } });
    const services = await tx.service.findMany({
      where: { shopId, isActive: true },
      select: { id: true },
    });
    return tx.staff.create({
      data: {
        shopId,
        displayName: input.name,
        role: input.role,
        sortOrder: (_max.sortOrder ?? 0) + 1,
        services: { create: services.map((service) => ({ serviceId: service.id })) },
      },
    });
  });
  await audit(user, shopId, 'staff.add', staff.id);
  return { id: staff.id };
}

export async function updateStaff(
  user: User,
  shopId: string,
  staffId: string,
  input: UpdateStaffRequest,
) {
  const me = await requireStaff(user.id, shopId, [...managers]);
  const member = await findMember(shopId, staffId);
  if (!canManageStaff(me.role, member.role)) throw new AppError('forbidden', 'cannot manage');
  if (input.role !== member.role && !canAssignRole(me.role, input.role)) {
    throw new AppError('forbidden', 'cannot assign role');
  }
  // The shop's one owner stays its owner (handing a shop over is a separate, later feature).
  if (member.role === 'OWNER' && input.role !== 'OWNER') {
    throw new AppError('forbidden', 'the owner stays the owner');
  }
  await db.staff.update({
    where: { id: staffId },
    data: { displayName: input.name, role: input.role, isBookable: input.isBookable },
  });
  await audit(user, shopId, 'staff.update', staffId);
  return { id: staffId };
}

/**
 * Removes someone from the team, ending their access at once. Refused while clients are booked
 * with them, so nobody turns up for a master who no longer works there. Their past bookings stay.
 */
export async function removeStaff(user: User, shopId: string, staffId: string) {
  const me = await requireStaff(user.id, shopId, [...managers]);
  const member = await findMember(shopId, staffId);
  if (member.role === 'OWNER' || member.id === me.id || !canManageStaff(me.role, member.role)) {
    throw new AppError('forbidden', 'cannot remove');
  }
  const upcoming = await db.booking.count({
    where: { staffId, startAt: { gt: new Date() }, status: { in: ['PENDING', 'CONFIRMED'] } },
  });
  if (upcoming > 0) {
    throw new AppError('conflict', 'has_upcoming_bookings', {
      reason: 'has_upcoming_bookings' satisfies TeamRefusal,
      count: upcoming,
    });
  }
  await db.$transaction([
    // Freeing the login lets the same person be invited back later.
    db.staff.update({ where: { id: staffId }, data: { isActive: false, userId: null } }),
    db.staffInvite.deleteMany({ where: { staffId, usedAt: null } }),
  ]);
  await audit(user, shopId, 'staff.remove', staffId);
}

/** A new invite link for someone without a login; any earlier link stops working. */
export async function createInvite(user: User, shopId: string, staffId: string) {
  const me = await requireStaff(user.id, shopId, [...managers]);
  const member = await findMember(shopId, staffId);
  if (!canManageStaff(me.role, member.role)) throw new AppError('forbidden', 'cannot invite');
  if (member.userId) refuse('already_linked');

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  await db.$transaction([
    db.staffInvite.deleteMany({ where: { staffId, usedAt: null } }),
    db.staffInvite.create({
      data: { staffId, tokenHash: hashToken(token), expiresAt, createdById: user.id },
    }),
  ]);
  await audit(user, shopId, 'staff.invite', staffId);
  return { token, expiresAt: expiresAt.toISOString() };
}

async function loadInvite(token: string) {
  const invite = inviteTokenPattern.test(token)
    ? await db.staffInvite.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { staff: { include: { shop: { select: { id: true, name: true } } } } },
      })
    : null;
  if (!invite) throw new AppError('not_found', 'no such invite');
  return invite;
}

type LoadedInvite = Awaited<ReturnType<typeof loadInvite>>;

async function inviteState(user: User, invite: LoadedInvite): Promise<InviteState> {
  if (invite.staff.userId === user.id) return 'accepted';
  if (invite.usedAt || invite.staff.userId || !invite.staff.isActive) return 'used';
  if (invite.expiresAt <= new Date()) return 'expired';
  const member = await db.staff.findFirst({
    where: { shopId: invite.staff.shopId, userId: user.id, isActive: true },
    select: { id: true },
  });
  return member ? 'already_member' : 'valid';
}

/** What the invite screen shows to the person who opened the link. */
export async function previewInvite(user: User, token: string): Promise<InvitePreviewDto> {
  const invite = await loadInvite(token);
  return {
    shopId: invite.staff.shop.id,
    shopName: invite.staff.shop.name,
    name: invite.staff.displayName,
    role: invite.staff.role,
    state: await inviteState(user, invite),
  };
}

const isUniqueViolation = (error: unknown) =>
  (error as { code?: unknown }).code === 'P2002' ||
  String((error as Error)?.message).includes('staff_shop_id_user_id_key');

/** Joins the shop. Each step only succeeds once, so a link can't be used by two people. */
export async function acceptInvite(user: User, token: string) {
  const invite = await loadInvite(token);
  const shopId = invite.staff.shop.id;
  const state = await inviteState(user, invite);
  if (state === 'accepted') return { shopId }; // a double tap, or the reply got lost
  if (state !== 'valid') refuse(state);

  try {
    await db.$transaction(async (tx) => {
      const used = await tx.staffInvite.updateMany({
        where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      const linked = await tx.staff.updateMany({
        where: { id: invite.staffId, userId: null, isActive: true },
        data: { userId: user.id },
      });
      if (used.count === 0 || linked.count === 0) refuse('used');
    });
  } catch (error) {
    if (isUniqueViolation(error)) refuse('already_member');
    throw error;
  }
  await audit(user, shopId, 'staff.join', invite.staffId);
  return { shopId };
}
