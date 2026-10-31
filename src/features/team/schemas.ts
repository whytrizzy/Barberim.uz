import { z } from 'zod';

const role = z.enum(['OWNER', 'ADMIN', 'MASTER']);
const name = z.string().trim().min(2).max(60);

/** More than any real shop; stops a runaway client filling the table. */
export const MAX_SHOP_STAFF = 50;
/** How long an invite link works. */
export const INVITE_DAYS = 7;

/** POST /api/shops/:id/staff */
export const addStaffRequestSchema = z.object({ name, role: z.enum(['ADMIN', 'MASTER']) });
export type AddStaffRequest = z.infer<typeof addStaffRequestSchema>;

/** PATCH /api/shops/:id/staff/:staffId */
export const updateStaffRequestSchema = z.object({ name, role, isBookable: z.boolean() });
export type UpdateStaffRequest = z.infer<typeof updateStaffRequestSchema>;

export const staffMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  role,
  isBookable: z.boolean(),
  /** Has accepted an invite (or opened the shop) and has their own login. */
  linked: z.boolean(),
  isYou: z.boolean(),
  /** Whether the person asking may change this member. */
  canManage: z.boolean(),
  /** When the current unused invite link stops working. */
  inviteExpiresAt: z.iso.datetime().nullable(),
});
export type StaffMemberDto = z.infer<typeof staffMemberSchema>;

/** GET /api/shops/:id/staff */
export const teamSchema = z.object({
  canAdd: z.boolean(),
  /** Only the owner can make someone an admin. */
  canAssignAdmin: z.boolean(),
  members: z.array(staffMemberSchema),
});
export type TeamDto = z.infer<typeof teamSchema>;

/** POST /api/shops/:id/staff/:staffId/invite — the only time the token is ever available. */
export const createdInviteSchema = z.object({
  token: z.string(),
  expiresAt: z.iso.datetime(),
});

export const removedSchema = z.object({ removed: z.literal(true) });

export const inviteTokenPattern = /^[A-Za-z0-9_-]{16,57}$/;

/** What this invite means for the person who opened it. */
export const inviteStateSchema = z.enum(['valid', 'accepted', 'used', 'expired', 'already_member']);
export type InviteState = z.infer<typeof inviteStateSchema>;

/** GET /api/invites/:token */
export const invitePreviewSchema = z.object({
  shopId: z.string(),
  shopName: z.string(),
  name: z.string(),
  role,
  state: inviteStateSchema,
});
export type InvitePreviewDto = z.infer<typeof invitePreviewSchema>;

/** POST /api/invites/:token */
export const acceptedInviteSchema = z.object({ shopId: z.string() });

/** `details.reason` when a team change is refused. */
export type TeamRefusal = 'too_many_staff' | 'has_upcoming_bookings' | 'already_linked';
