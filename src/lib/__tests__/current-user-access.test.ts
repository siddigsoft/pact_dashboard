import { describe, expect, it } from 'vitest';
import {
  evaluateManifestPageAccess,
  evaluateManifestRouteAccess,
  getManifestNavigationPages,
  manifestHasExplicitActionGrant,
  manifestHasPermission,
  legacySurveyActionAllowed,
  manifestIsTabBlocked,
  overrideIsActive,
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
  it.each([
    'hub_manager', 'Hub Manager', 'hubManager', 'HubManager',
    'sr_program_officer', 'Senior Programme Officer', 'seniorProgramOfficer',
  ])('preserves legacy survey lifecycle access for %s', (role) => {
    const context = manifest({ roles: [role] });
    expect(legacySurveyActionAllowed(context, 'create')).toBe(true);
    expect(legacySurveyActionAllowed(context, 'update')).toBe(true);
    expect(legacySurveyActionAllowed(context, 'delete')).toBe(true);
    expect(legacySurveyActionAllowed(context, 'status')).toBe(true);
  });

  it('honors explicit user denial over legacy survey compatibility access', () => {
    const context = manifest({
      roles: ['hub_manager'],
      action_overrides: { 'surveys:status': { is_granted: false } },
    });
    expect(legacySurveyActionAllowed(context, 'status')).toBe(false);
    expect(legacySurveyActionAllowed(context, 'create')).toBe(true);
  });

  it.each(['full_report', 'state_report', 'hub_report'] as const)(
    'uses the matching MMP report action for %s and lets an explicit block win',
    action => {
      const roleContext = manifest({
        role_permissions: [{ resource: 'mmp', action }],
      });
      expect(manifestHasPermission(roleContext, 'mmp', action)).toBe(true);
      expect(manifestHasPermission({
        ...roleContext,
        action_overrides: { [`mmp:${action}`]: { is_granted: false } },
      }, 'mmp', action)).toBe(false);
      expect(manifestHasPermission({
        ...manifest(),
        action_overrides: { [`mmp:${action}`]: { is_granted: true } },
      }, 'mmp', action)).toBe(true);
    },
  );

  it('uses the same denial for direct URLs and pinned or favorite navigation candidates', () => {
    const context = manifest({ roles: ['Admin'], page_overrides: { reports: { is_blocked: true } },
      action_overrides: { 'reports:read': { is_granted: true } } });
    const preferences = { pinned: ['/reports'], favorite: ['/reports'] };
    expect(evaluateManifestRouteAccess(context, '/reports')).toBe(false);
    const allowed = getManifestNavigationPages(context);
    expect(allowed.some(page => page.slug === 'reports')).toBe(false);
    expect(preferences.pinned.filter(path => allowed.some(page => page.path === path))).toEqual([]);
    expect(preferences.favorite.filter(path => allowed.some(page => page.path === path))).toEqual([]);
    expect(evaluateManifestRouteAccess(context, '/undeclared')).toBe(false);
  });

  it('uses canonical accounting parent IDs for legacy stored tab overrides', () => {
    const context = manifest({ roles: ['Admin'], page_overrides: {
      'accounting-hub': { is_blocked: true }, 'accounting:coa': { is_blocked: false },
    } });
    expect(manifestIsTabBlocked(context, 'accounting:coa')).toBe(true);
  });

  it('allows an explicit tab grant when its parent page is accessible', () => {
    const context = manifest({
      roles: ['Admin'],
      page_overrides: {
        'admin-hub': { is_blocked: false },
        'admin-hub:users': { is_blocked: false },
      },
    });
    expect(manifestIsTabBlocked(context, 'admin-hub:users')).toBe(false);
    expect(evaluateManifestRouteAccess(context, '/admin-hub', '?tab=users')).toBe(true);
  });

  it('expires overrides at the timestamp and ignores invalid expiry values', () => {
    const instant = Date.parse('2026-09-16T12:00:00Z');
    expect(overrideIsActive({ expires_at: '2026-09-16T12:00:00Z' }, instant)).toBe(false);
    expect(overrideIsActive({ expires_at: 'invalid' }, instant)).toBe(false);
    expect(overrideIsActive({ expires_at: null }, instant)).toBe(true);
  });

  it('keeps a page block effective despite an action grant or role action permission', () => {
    const context = manifest({
      page_overrides: { 'finance-subscriptions': { is_blocked: true } },
      action_overrides: { 'subscriptions:read': { is_granted: true } },
      role_permissions: [{ resource: 'subscriptions', action: 'read' }],
    });
    expect(evaluateManifestPageAccess(context, 'finance-subscriptions', { resource: 'subscriptions', action: 'read' }))
      .toMatchObject({ allowed: false, source: 'page_override' });
  });

  it('fails closed without a manifest and applies role tab blocks after active user overrides', () => {
    expect(manifestIsTabBlocked(undefined, 'admin-hub:users')).toBe(true);
    const context = manifest({ page_role_configs: { 'admin-hub': ['Procurement Lead'] }, role_tab_blocks: { 'admin-hub:users': true } });
    expect(manifestIsTabBlocked(context, 'admin-hub:users')).toBe(true);
    context.page_overrides['admin-hub:users'] = { is_blocked: false };
    expect(manifestIsTabBlocked(context, 'admin-hub:users')).toBe(false);
    context.page_overrides['admin-hub:users'].expires_at = '2000-01-01T00:00:00Z';
    expect(manifestIsTabBlocked(context, 'admin-hub:users')).toBe(true);
    context.roles = ['superAdmin'];
    expect(manifestIsTabBlocked(context, 'admin-hub:users')).toBe(false);
  });
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

  it('unions primary and custom additive role pages and persisted actions', () => {
    const context = manifest({
      roles: ['dataCollector', 'Procurement Lead'],
      page_role_configs: { 'finance-subscriptions': ['Procurement Lead'] },
      role_permissions: [{ resource: 'subscriptions', action: 'read' }],
    });
    expect(evaluateManifestPageAccess(context, 'dashboard').allowed).toBe(true);
    expect(evaluateManifestPageAccess(context, 'finance-subscriptions', { resource: 'subscriptions', action: 'read' }).allowed).toBe(true);
    context.roles = ['dataCollector'];
    context.role_permissions = [];
    expect(evaluateManifestPageAccess(context, 'finance-subscriptions').allowed).toBe(false);
  });

  it('never restores revoked persisted actions from a built-in Admin label', () => {
    const context = manifest({ roles: ['Admin'] });
    expect(evaluateManifestPageAccess(context, 'reports', { resource: 'reports', action: 'read' }).allowed).toBe(false);
    expect(manifestHasPermission(context, 'reports', 'read')).toBe(false);
  });

  it('treats granular read denial as page denial before any action grant', () => {
    const context = manifest({
      page_overrides: { 'finance-subscriptions': { is_blocked: false, notes: '{"r":false,"w":true}' } },
      action_overrides: { 'subscriptions:read': { is_granted: true } },
    });
    expect(evaluateManifestPageAccess(context, 'finance-subscriptions').allowed).toBe(false);
    expect(evaluateManifestPageAccess(context, 'finance-subscriptions', { resource: 'subscriptions', action: 'read' }).allowed).toBe(false);
  });

  it.each([true, false])('a parent denial closes a child page and tab despite child grants (blocked=%s)', blocked => {
    const context = manifest({
      page_role_configs: { 'finance-hub': ['Procurement Lead'] },
      page_overrides: {
        'finance-hub': { is_blocked: blocked, notes: blocked ? null : '{"r":false}' },
        'finance-subscriptions': { is_blocked: false },
        'finance-hub:subscriptions': { is_blocked: false },
      },
      action_overrides: { 'subscriptions:read': { is_granted: true } },
    });
    expect(evaluateManifestPageAccess(context, 'finance-subscriptions', { resource: 'subscriptions', action: 'read' }).allowed).toBe(false);
    expect(manifestIsTabBlocked(context, 'finance-hub:subscriptions')).toBe(true);
  });

  it('a child tab grant cannot mount a parent hub denied by the role baseline', () => {
    const context = manifest({ page_overrides: { 'admin-hub:users': { is_blocked: false } } });
    expect(manifestIsTabBlocked(context, 'admin-hub:users')).toBe(true);
    context.page_overrides['admin-hub'] = { is_blocked: false };
    expect(manifestIsTabBlocked(context, 'admin-hub:users')).toBe(false);
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

  it('distinguishes explicit action grants from role-default permissions', () => {
    const withOverride = manifest({
      action_overrides: { 'cost_submissions:read': { is_granted: true } },
      role_permissions: [],
    });
    const roleOnly = manifest({
      action_overrides: {},
      role_permissions: [{ resource: 'cost_submissions', action: 'read' }],
    });
    expect(manifestHasExplicitActionGrant(withOverride, 'cost_submissions', 'read')).toBe(true);
    expect(manifestHasPermission(withOverride, 'cost_submissions', 'read')).toBe(true);
    expect(manifestHasExplicitActionGrant(roleOnly, 'cost_submissions', 'read')).toBe(false);
    expect(manifestHasPermission(roleOnly, 'cost_submissions', 'read')).toBe(true);
  });

  it('allows a page override for an ordinary page even when no role baseline exists', () => {
    expect(evaluateManifestPageAccess(
      manifest({ page_overrides: { 'finance-subscriptions': { is_blocked: false } } }),
      'finance-subscriptions',
    )).toMatchObject({ allowed: true, source: 'page_override' });
  });

  it('ignores an expired page override and returns to the role baseline', () => {
    expect(evaluateManifestPageAccess(
      manifest({ page_overrides: {
        'finance-subscriptions': { is_blocked: true, expires_at: '2000-01-01T00:00:00.000Z' },
      } }),
      'finance-subscriptions',
    )).toMatchObject({ allowed: true, source: 'role_baseline' });
  });

  it('lets My Projects open membership project detail without org-wide Projects', () => {
    const context = manifest({
      roles: ['Field Assistant'],
      page_role_configs: {},
      page_overrides: { 'my-projects': { is_blocked: false } },
    });
    expect(evaluateManifestRouteAccess(
      context,
      '/projects/660399f4-80a2-4642-8f66-9f1f245775e6',
    )).toBe(true);
    expect(evaluateManifestRouteAccess(
      context,
      '/projects/660399f4-80a2-4642-8f66-9f1f245775e6',
      '?tab=field_tasks',
    )).toBe(true);
    // Org catalogue and edit still require Projects
    expect(evaluateManifestRouteAccess(context, '/projects')).toBe(false);
    expect(evaluateManifestRouteAccess(
      context,
      '/projects/660399f4-80a2-4642-8f66-9f1f245775e6/edit',
    )).toBe(false);
  });

  it('does not open project detail from My Projects when that page is blocked', () => {
    const context = manifest({
      roles: ['Field Assistant'],
      page_overrides: { 'my-projects': { is_blocked: true } },
    });
    expect(evaluateManifestRouteAccess(
      context,
      '/projects/660399f4-80a2-4642-8f66-9f1f245775e6',
    )).toBe(false);
  });
});
