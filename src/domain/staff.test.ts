import { describe, expect, it } from 'vitest';
import { canAssignRole, canManageStaff } from './staff';

describe('staff permissions', () => {
  it('lets owners manage everyone, admins only masters, masters no one', () => {
    expect(canManageStaff('OWNER', 'ADMIN')).toBe(true);
    expect(canManageStaff('ADMIN', 'MASTER')).toBe(true);
    expect(canManageStaff('ADMIN', 'ADMIN')).toBe(false);
    expect(canManageStaff('ADMIN', 'OWNER')).toBe(false);
    expect(canManageStaff('MASTER', 'MASTER')).toBe(false);
  });

  it('never hands out the owner role, and only owners make admins', () => {
    expect(canAssignRole('OWNER', 'ADMIN')).toBe(true);
    expect(canAssignRole('OWNER', 'OWNER')).toBe(false);
    expect(canAssignRole('ADMIN', 'MASTER')).toBe(true);
    expect(canAssignRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canAssignRole('MASTER', 'MASTER')).toBe(false);
  });
});
