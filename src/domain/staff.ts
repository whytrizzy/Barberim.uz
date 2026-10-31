export type StaffRole = 'OWNER' | 'ADMIN' | 'MASTER';

/** Owners manage everyone; admins manage masters; masters manage no one. */
export function canManageStaff(actor: StaffRole, target: StaffRole): boolean {
  if (actor === 'OWNER') return true;
  return actor === 'ADMIN' && target === 'MASTER';
}

/** A shop has one owner, so nobody can be given that role; only the owner can make admins. */
export function canAssignRole(actor: StaffRole, role: StaffRole): boolean {
  if (actor === 'OWNER') return role !== 'OWNER';
  return actor === 'ADMIN' && role === 'MASTER';
}
