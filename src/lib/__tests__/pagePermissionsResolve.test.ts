import { describe, expect, it } from 'vitest';
import {
  mapLegacyScreenToOverride,
  resolveTypedPagePermissions,
} from '../pagePermissionsResolve';

describe('resolveTypedPagePermissions', () => {
  it('gives super admin full access without consulting overrides', () => {
    expect(
      resolveTypedPagePermissions({
        isSuperAdmin: true,
        pageOverride: { is_blocked: true },
      }),
    ).toMatchObject({ canRead: true, canManage: true, hasOverride: false });
  });

  it('honors explicit typed blocks', () => {
    expect(
      resolveTypedPagePermissions({
        isSuperAdmin: false,
        pageOverride: { is_blocked: true },
      }),
    ).toMatchObject({ isBlocked: true, hasOverride: true, canRead: false });
  });

  it('honors explicit typed grants from notes', () => {
    expect(
      resolveTypedPagePermissions({
        isSuperAdmin: false,
        pageOverride: { is_blocked: false, notes: '{"r":true,"w":true,"c":false,"d":false}' },
      }),
    ).toMatchObject({
      hasOverride: true,
      canRead: true,
      canWrite: true,
      canCreate: false,
      canManage: true,
    });
  });

  it('signals role-default fallback when no override exists', () => {
    expect(
      resolveTypedPagePermissions({ isSuperAdmin: false, pageOverride: null }),
    ).toMatchObject({ hasOverride: false, isBlocked: false, canRead: false });
  });
});

describe('mapLegacyScreenToOverride', () => {
  it('maps hidden screens to typed blocks', () => {
    expect(
      mapLegacyScreenToOverride({
        screenId: 'surveys',
        isVisible: false,
        permissions: { read: true },
      }),
    ).toMatchObject({ page_slug: 'surveys', is_blocked: true });
  });

  it('maps visible grants into notes JSON', () => {
    expect(
      mapLegacyScreenToOverride({
        screenId: 'accounting-coa',
        isVisible: true,
        permissions: { read: true, write: true, create: false, delete: false, open: true },
      }),
    ).toEqual({
      page_slug: 'accounting-coa',
      is_blocked: false,
      notes: JSON.stringify({
        r: true,
        w: true,
        c: false,
        d: false,
        migrated_from: 'user_screen_permissions',
      }),
    });
  });

  it('skips empty default rows', () => {
    expect(
      mapLegacyScreenToOverride({
        screenId: 'dashboard',
        isVisible: true,
        permissions: {},
      }),
    ).toBeNull();
  });
});
