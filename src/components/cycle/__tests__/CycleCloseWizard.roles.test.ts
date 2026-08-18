import { describe, it, expect } from 'vitest';
import { allUncoveredReasonsConfirmed, getCycleCloseRoleFlags } from '../CycleCloseWizard';

describe('getCycleCloseRoleFlags', () => {
  it('detects coordinator and supervisor variants', () => {
    const coordinator = getCycleCloseRoleFlags({ role: 'Coordinator' });
    const supervisor = getCycleCloseRoleFlags({ role: 'hub_supervisor' });

    expect(coordinator.isCoordinator).toBe(true);
    expect(coordinator.isSupervisor).toBe(false);
    expect(supervisor.isSupervisor).toBe(true);
  });

  it('detects admin and super admin variants', () => {
    const admin = getCycleCloseRoleFlags({ roles: ['Admin'] });
    const superAdmin = getCycleCloseRoleFlags({ role: 'super_admin' });

    expect(admin.isAdmin).toBe(true);
    expect(admin.isSuperAdmin).toBe(false);
    expect(superAdmin.isSuperAdmin).toBe(true);
  });
});

describe('allUncoveredReasonsConfirmed', () => {
  it('requires both reason text and confirmed status', () => {
    const wizardState: any = {
      matchResults: [{ action: 'reject', status: 'actioned', matchedSiteId: 'site-1' }],
      resolvedSites: { 'site-2': 'not_covered' },
      unmatchedMmpSiteIds: ['site-3'],
      uncoveredReasons: {
        'site-1': { reason: 'weather', status: 'confirmed' },
        'site-2': { reason: 'access_denied', status: 'draft' },
        'site-3': { reason: 'other', status: 'confirmed' },
      },
    };

    expect(allUncoveredReasonsConfirmed(wizardState)).toBe(false);

    wizardState.uncoveredReasons['site-2'].status = 'confirmed';
    expect(allUncoveredReasonsConfirmed(wizardState)).toBe(true);
  });
});
