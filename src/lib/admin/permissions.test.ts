import { describe, it, expect } from 'vitest';
import {
  ADMIN_DEFAULT_PERMISSIONS,
  MAIN_ADMIN_ONLY,
  PERMISSIONS,
  canCreateAdmin,
  canManageAdmin,
  canSetPermissions,
  effectivePermissions,
  grantablePermissions,
  hasPermission,
  isAdminRole,
  isGrantable,
  type AdminPrincipal,
} from './permissions';

function mainAdmin(overrides: Partial<AdminPrincipal> = {}): AdminPrincipal {
  return {
    id: 'main-1',
    email: 'main@example.com',
    role: 'MainAdmin',
    status: 'active',
    grantedPermissions: [],
    ...overrides,
  };
}

function admin(overrides: Partial<AdminPrincipal> = {}): AdminPrincipal {
  return {
    id: 'admin-1',
    email: 'admin@example.com',
    role: 'Admin',
    status: 'active',
    grantedPermissions: [],
    ...overrides,
  };
}

describe('effectivePermissions', () => {
  it('gives the MainAdmin every permission', () => {
    expect(effectivePermissions(mainAdmin()).sort()).toEqual([...PERMISSIONS].sort());
  });

  it('gives a new Admin only the review-and-read defaults', () => {
    expect(effectivePermissions(admin()).sort()).toEqual([...ADMIN_DEFAULT_PERMISSIONS].sort());
  });

  it('withholds money-moving permissions from an Admin by default', () => {
    expect(hasPermission(admin(), 'deposit.authorize')).toBe(false);
    expect(hasPermission(admin(), 'ledger.adjust')).toBe(false);
    expect(hasPermission(admin(), 'trader.create')).toBe(false);
    expect(hasPermission(admin(), 'deposit_address.manage')).toBe(false);
  });

  it('honours an explicit grant of deposit authorization', () => {
    const granted = admin({ grantedPermissions: ['deposit.authorize'] });
    expect(hasPermission(granted, 'deposit.authorize')).toBe(true);
    // and nothing else came with it
    expect(hasPermission(granted, 'ledger.adjust')).toBe(false);
  });

  it('ignores a stored grant of a MainAdmin-only permission', () => {
    // A row that acquired this through a bad migration or a direct database
    // edit must not become authority just because it is persisted.
    const tampered = admin({ grantedPermissions: ['admin.manage', 'admin.create'] });
    expect(hasPermission(tampered, 'admin.manage')).toBe(false);
    expect(hasPermission(tampered, 'admin.create')).toBe(false);
  });

  it('ignores grants that are not permissions at all', () => {
    const tampered = admin({ grantedPermissions: ['*', 'root', 'ledger.adjust '] });
    expect(effectivePermissions(tampered).sort()).toEqual([...ADMIN_DEFAULT_PERMISSIONS].sort());
  });

  it('strips every permission from a suspended admin', () => {
    expect(effectivePermissions(admin({ status: 'suspended' }))).toEqual([]);
    expect(effectivePermissions(mainAdmin({ status: 'suspended' }))).toEqual([]);
  });
});

describe('grantability', () => {
  it('never offers the hierarchy-rewriting permissions for delegation', () => {
    for (const permission of MAIN_ADMIN_ONLY) {
      expect(isGrantable(permission)).toBe(false);
      expect(grantablePermissions()).not.toContain(permission);
    }
  });

  it('offers everything else', () => {
    expect(grantablePermissions()).toContain('deposit.authorize');
    expect(grantablePermissions()).toContain('ledger.adjust');
    expect(grantablePermissions()).toContain('trader.suspend');
  });
});

describe('canCreateAdmin', () => {
  it('lets the MainAdmin create an Admin', () => {
    expect(canCreateAdmin(mainAdmin(), 'Admin').allowed).toBe(true);
  });

  it('refuses a second MainAdmin even to the MainAdmin', () => {
    const decision = canCreateAdmin(mainAdmin(), 'MainAdmin');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/bootstrap/i);
  });

  it('refuses an Admin outright, granted permissions or not', () => {
    expect(canCreateAdmin(admin(), 'Admin').allowed).toBe(false);
    expect(canCreateAdmin(admin({ grantedPermissions: ['admin.create'] }), 'Admin').allowed).toBe(
      false
    );
  });
});

describe('canManageAdmin', () => {
  const target = { id: 'admin-2', role: 'Admin' as const, status: 'active' as const };

  it('lets the MainAdmin suspend an Admin', () => {
    expect(canManageAdmin(mainAdmin(), target).allowed).toBe(true);
  });

  it('refuses an Admin managing another Admin', () => {
    expect(canManageAdmin(admin(), target).allowed).toBe(false);
  });

  it('refuses an Admin acting on the MainAdmin', () => {
    const decision = canManageAdmin(admin(), {
      id: 'main-1',
      role: 'MainAdmin',
      status: 'active',
    });
    expect(decision.allowed).toBe(false);
  });

  it('refuses the MainAdmin account being modified through the console at all', () => {
    const decision = canManageAdmin(mainAdmin({ id: 'other-main' }), {
      id: 'main-1',
      role: 'MainAdmin',
      status: 'active',
    });
    expect(decision.allowed).toBe(false);
  });

  it('refuses self-modification, which would let the console be locked by accident', () => {
    const decision = canManageAdmin(mainAdmin({ id: 'x' }), {
      id: 'x',
      role: 'Admin',
      status: 'active',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/own account/i);
  });
});

describe('canSetPermissions', () => {
  const target = { id: 'admin-2', role: 'Admin' as const, status: 'active' as const };

  it('accepts a grantable set from the MainAdmin', () => {
    expect(canSetPermissions(mainAdmin(), target, ['deposit.authorize']).allowed).toBe(true);
  });

  it('rejects the whole set when one entry is reserved, rather than silently dropping it', () => {
    const decision = canSetPermissions(mainAdmin(), target, ['deposit.authorize', 'admin.manage']);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/admin\.manage/);
  });

  it('rejects unknown permission strings', () => {
    const decision = canSetPermissions(mainAdmin(), target, ['deposit.authorise']);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/Unknown permission/);
  });

  it('rejects an Admin editing permissions', () => {
    expect(canSetPermissions(admin(), target, ['kyc.review']).allowed).toBe(false);
  });
});

describe('isAdminRole', () => {
  it('never treats a trader as an admin principal', () => {
    expect(isAdminRole('Trader')).toBe(false);
    expect(isAdminRole('admin')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole('MainAdmin')).toBe(true);
    expect(isAdminRole('Admin')).toBe(true);
  });
});
