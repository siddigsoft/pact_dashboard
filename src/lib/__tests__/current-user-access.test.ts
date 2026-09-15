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
});
