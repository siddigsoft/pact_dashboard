import { describe, expect, it } from 'vitest';
import {
  effectAllowsAccess,
  isSuperAdminRole,
  resolveActionEffect,
  resolvePageEffect,
  unionRoleNames,
} from '../effectiveAccess';

describe('effectiveAccess precedence', () => {
  it('treats Super Admin as explicit bypass', () => {
    expect(isSuperAdminRole('SuperAdmin')).toBe(true);
    expect(isSuperAdminRole('super_admin')).toBe(true);
    expect(
      resolvePageEffect({ isSuperAdmin: true, override: { is_blocked: true }, roleAllows: false }),
    ).toBe('superadmin');
    expect(
      resolveActionEffect({ isSuperAdmin: true, explicitGrant: false, roleAllows: false }),
    ).toBe('superadmin');
    expect(effectAllowsAccess('superadmin')).toBe(true);
  });

  it('lets explicit user block override role grants', () => {
    expect(
      resolvePageEffect({ isSuperAdmin: false, override: { is_blocked: true }, roleAllows: true }),
    ).toBe('blocked');
    expect(
      resolveActionEffect({ isSuperAdmin: false, explicitGrant: false, roleAllows: true }),
    ).toBe('blocked');
  });

  it('lets explicit user grant override role denial', () => {
    expect(
      resolvePageEffect({ isSuperAdmin: false, override: { is_blocked: false }, roleAllows: false }),
    ).toBe('granted');
    expect(
      resolveActionEffect({ isSuperAdmin: false, explicitGrant: true, roleAllows: false }),
    ).toBe('granted');
  });

  it('falls back to role union when no override exists', () => {
    expect(resolvePageEffect({ isSuperAdmin: false, roleAllows: true })).toBe('role-yes');
    expect(resolvePageEffect({ isSuperAdmin: false, roleAllows: false })).toBe('role-no');
    expect(effectAllowsAccess('role-yes')).toBe(true);
    expect(effectAllowsAccess('role-no')).toBe(false);
  });

  it('unions primary profiles.role with assigned roles without duplicates', () => {
    expect(unionRoleNames('SMT', ['Admin', 'smt', 'Coordinator'])).toEqual([
      'SMT',
      'Admin',
      'Coordinator',
    ]);
  });

  it('treats multi-role union as role-yes when any assigned role allows', () => {
    // Evaluator contracts: callers pass roleAllows = union already computed.
    expect(resolvePageEffect({ isSuperAdmin: false, roleAllows: true })).toBe('role-yes');
    expect(effectAllowsAccess(resolvePageEffect({ isSuperAdmin: false, roleAllows: true }))).toBe(true);
  });

  it('lets explicit block win even when multi-role union would allow', () => {
    expect(
      resolvePageEffect({
        isSuperAdmin: false,
        override: { is_blocked: true },
        roleAllows: true,
      }),
    ).toBe('blocked');
  });
});
