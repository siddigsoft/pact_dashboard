import { describe, expect, it } from 'vitest';
import {
  evaluateManifestPageAccess,
  manifestHasPermission,
  type CurrentUserAccessManifest,
} from '@/lib/current-user-access';

const manifest = (overrides: Partial<CurrentUserAccessManifest> = {}): CurrentUserAccessManifest => ({
  user_id: 'user-1',
  roles: ['Procurement Lead'],
  page_role_configs: { 'finance-subscriptions': ['Procurement Lead'] },
  page_overrides: {},
  action_overrides: {},
  role_permissions: [],
  generated_at: '2026-09-15T00:00:00.000Z',
  ...overrides,
});

describe('current user access manifest evaluator', () => {
  it('uses the configured custom-role page grant without profile role fallbacks', () => {
    expect(evaluateManifestPageAccess(
      manifest(),
      'finance-subscriptions',
    )).toMatchObject({ allowed: true, source: 'role_baseline' });
  });

  it('applies a page block after the configured role baseline', () => {
    expect(evaluateManifestPageAccess(
      manifest({ page_overrides: { 'finance-subscriptions': { is_blocked: true } } }),
      'finance-subscriptions',
    )).toMatchObject({ allowed: false, source: 'page_override' });
  });

  it('uses role permissions for an action-protected direct route', () => {
    expect(evaluateManifestPageAccess(
      manifest({ role_permissions: [{ resource: 'subscriptions', action: 'read' }] }),
      'finance-subscriptions',
      { resource: 'subscriptions', action: 'read' },
    )).toMatchObject({ allowed: true, source: 'role_permission' });
  });

  it('lets an active action block override an action role permission', () => {
    const context = manifest({
      role_permissions: [{ resource: 'subscriptions', action: 'read' }],
      action_overrides: {
        'subscriptions:read': { is_granted: false, expires_at: '2099-01-01T00:00:00.000Z' },
      },
    });
    expect(evaluateManifestPageAccess(
      context,
      'finance-subscriptions',
      { resource: 'subscriptions', action: 'read' },
    )).toMatchObject({ allowed: false, source: 'action_override' });
    expect(manifestHasPermission(context, 'subscriptions', 'read')).toBe(false);
  });

  it('ignores an expired action override and returns to the role permission', () => {
    const context = manifest({
      role_permissions: [{ resource: 'subscriptions', action: 'read' }],
      action_overrides: {
        'subscriptions:read': { is_granted: false, expires_at: '2000-01-01T00:00:00.000Z' },
      },
    });

    expect(evaluateManifestPageAccess(
      context,
      'finance-subscriptions',
      { resource: 'subscriptions', action: 'read' },
    )).toMatchObject({ allowed: true, source: 'role_permission' });
    expect(manifestHasPermission(context, 'subscriptions', 'read')).toBe(true);
  });

  it('does not let a page grant manufacture an unrelated protected action', () => {
    expect(evaluateManifestPageAccess(
      manifest({ page_overrides: { 'finance-subscriptions': { is_blocked: false } } }),
      'finance-subscriptions',
      { resource: 'subscriptions', action: 'read' },
    )).toMatchObject({ allowed: false, source: 'role_baseline' });
    expect(manifestHasPermission(
      manifest({ page_overrides: { 'finance-subscriptions': { is_blocked: false } } }),
      'subscriptions',
      'read',
    )).toBe(false);
  });

  it('uses an active action grant for both the direct route and button check', () => {
    const context = manifest({
      action_overrides: {
        'subscriptions:read': { is_granted: true, expires_at: '2099-01-01T00:00:00.000Z' },
      },
    });

    expect(evaluateManifestPageAccess(
      context,
      'finance-subscriptions',
      { resource: 'subscriptions', action: 'read' },
    )).toMatchObject({ allowed: true, source: 'action_override' });
    expect(manifestHasPermission(context, 'subscriptions', 'read')).toBe(true);
  });

  it('does not use an expired action grant when no role permission exists', () => {
    const context = manifest({
      action_overrides: {
        'subscriptions:read': { is_granted: true, expires_at: '2000-01-01T00:00:00.000Z' },
      },
    });

    expect(evaluateManifestPageAccess(
      context,
      'finance-subscriptions',
      { resource: 'subscriptions', action: 'read' },
    )).toMatchObject({ allowed: false, source: 'role_baseline' });
    expect(manifestHasPermission(context, 'subscriptions', 'read')).toBe(false);
  });

  it('allows a page override for an ordinary page even when no role baseline exists', () => {
    expect(evaluateManifestPageAccess(
      manifest({ page_overrides: { 'finance-subscriptions': { is_blocked: false } } }),
      'finance-subscriptions',
    )).toMatchObject({ allowed: true, source: 'page_override' });
  });
});
