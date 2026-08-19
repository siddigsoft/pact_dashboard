import { describe, it, expect } from 'vitest';
import {
  allSiteReasonsConfirmed,
  allUncoveredReasonsConfirmed,
  getCycleCloseRoleFlags,
  isCycleCloseFinalizerProfile,
  isCycleCloseStep4ContributorOnly,
  justBecameFullyConfirmed,
  newPendingDraftSiteIds,
  pendingUnconfirmedReasonSiteIds,
  uncoveredReasonNeedsDraftPersist,
} from '../CycleCloseWizard';

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
    const superAdministrator = getCycleCloseRoleFlags({ role: 'Super Administrator' });

    expect(admin.isAdmin).toBe(true);
    expect(admin.isSuperAdmin).toBe(false);
    expect(superAdmin.isSuperAdmin).toBe(true);
    expect(superAdministrator.isSuperAdmin).toBe(true);
  });

  it('detects Finance executor variants', () => {
    expect(getCycleCloseRoleFlags({ role: 'Finance Admin' }).isFinance).toBe(true);
    expect(getCycleCloseRoleFlags({ roles: ['Accountant'] }).isFinance).toBe(true);
  });

  it('detects Field Operation Manager variants used by final close', () => {
    expect(getCycleCloseRoleFlags({ role: 'Field Operation Manager' }).isFOM).toBe(true);
    expect(getCycleCloseRoleFlags({ role: 'Field Operation Manager (FOM)' }).isFOM).toBe(true);
    expect(getCycleCloseRoleFlags({ additionalRoles: [{ role: 'FOM' }] }).isFOM).toBe(true);
  });
});

describe('isCycleCloseStep4ContributorOnly', () => {
  it('sends coordinators and supervisors to Step 4 even if user_roles still lists admin', () => {
    expect(isCycleCloseStep4ContributorOnly({ role: 'supervisor', roles: ['admin'] })).toBe(true);
    expect(isCycleCloseStep4ContributorOnly({ role: 'Coordinator' })).toBe(true);
  });

  it('keeps admin, FOM, and super admin on the full wizard when that is their primary role', () => {
    expect(isCycleCloseStep4ContributorOnly({ role: 'admin' })).toBe(false);
    expect(isCycleCloseStep4ContributorOnly({ role: 'fom', roles: ['supervisor'] })).toBe(false);
    expect(isCycleCloseStep4ContributorOnly({ role: 'super_admin' })).toBe(false);
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

  it('does not block advance when unmatched WFP rows keep a leftover best-guess site id', () => {
    const wizardState: any = {
      matchResults: [
        { action: undefined, status: 'unmatched', matchedSiteId: 'covered-site' },
        { action: 'confirm', status: 'auto', matchedSiteId: 'covered-site' },
      ],
      resolvedSites: {},
      unmatchedMmpSiteIds: ['uncovered-site'],
      uncoveredReasons: {
        'uncovered-site': { reason: 'duplicate_site', status: 'confirmed' },
      },
    };

    expect(allUncoveredReasonsConfirmed(wizardState)).toBe(true);
  });
});

describe('uncoveredReasonNeedsDraftPersist', () => {
  it('skips already-confirmed reasons so Next does not reset supervisor confirmation', () => {
    expect(uncoveredReasonNeedsDraftPersist({ reason: 'weather', status: 'confirmed' } as any)).toBe(false);
    expect(uncoveredReasonNeedsDraftPersist({ reason: 'weather', status: 'draft' } as any)).toBe(true);
    expect(uncoveredReasonNeedsDraftPersist({ reason: '', status: 'draft' } as any)).toBe(false);
  });
});

describe('pendingUnconfirmedReasonSiteIds', () => {
  it('returns only sites with a reason that are still draft', () => {
    const ids = pendingUnconfirmedReasonSiteIds({
      'site-1': { reason: 'weather', note: '', flagged: false, status: 'draft' },
      'site-2': { reason: 'access_denied', note: '', flagged: true, status: 'confirmed' },
      'site-3': { reason: '', note: '', flagged: false, status: 'draft' },
    });

    expect(ids).toEqual(['site-1']);
  });
});

describe('newPendingDraftSiteIds', () => {
  it('notifies only for newly drafted sites, not a repeat save of the same set', () => {
    const first = newPendingDraftSiteIds([], ['site-1', 'site-2']);
    expect(first).toEqual(['site-1', 'site-2']);

    const repeat = newPendingDraftSiteIds(['site-1', 'site-2'], ['site-1', 'site-2']);
    expect(repeat).toEqual([]);

    const added = newPendingDraftSiteIds(['site-1', 'site-2'], ['site-1', 'site-2', 'site-3']);
    expect(added).toEqual(['site-3']);
  });
});

describe('justBecameFullyConfirmed', () => {
  const draft = { reason: 'weather', note: '', flagged: false, status: 'draft' as const };
  const confirmed = { reason: 'weather', note: '', flagged: false, status: 'confirmed' as const };
  const siteIds = ['site-1', 'site-2'];

  it('is true only when the last remaining uncovered site becomes confirmed', () => {
    expect(allSiteReasonsConfirmed(siteIds, {
      'site-1': confirmed,
      'site-2': draft,
    })).toBe(false);

    expect(justBecameFullyConfirmed(
      { 'site-1': confirmed, 'site-2': draft },
      { 'site-1': confirmed, 'site-2': confirmed },
      siteIds,
    )).toBe(true);
  });

  it('does not fire again when a site is already fully confirmed', () => {
    expect(justBecameFullyConfirmed(
      { 'site-1': confirmed, 'site-2': confirmed },
      { 'site-1': confirmed, 'site-2': confirmed },
      siteIds,
    )).toBe(false);
  });

  it('does not fire when confirming one site while others remain draft', () => {
    expect(justBecameFullyConfirmed(
      { 'site-1': draft, 'site-2': draft },
      { 'site-1': confirmed, 'site-2': draft },
      siteIds,
    )).toBe(false);
  });
});

describe('isCycleCloseFinalizerProfile', () => {
  it('targets admin, super admin, and FOM for the post-confirmation handoff', () => {
    expect(isCycleCloseFinalizerProfile({ role: 'admin' })).toBe(true);
    expect(isCycleCloseFinalizerProfile({ role: 'super_admin' })).toBe(true);
    expect(isCycleCloseFinalizerProfile({ role: 'Super Administrator' })).toBe(true);
    expect(isCycleCloseFinalizerProfile({ role: 'fom' })).toBe(true);
    expect(isCycleCloseFinalizerProfile({ role: 'Field Operation Manager' })).toBe(true);
    expect(isCycleCloseFinalizerProfile({ role: 'Field Operation Manager (FOM)' })).toBe(true);
    expect(isCycleCloseFinalizerProfile({
      role: 'enumerator',
      additional_roles: [{ role: 'FOM' }],
    })).toBe(true);
    expect(isCycleCloseFinalizerProfile({ role: 'supervisor' })).toBe(false);
    expect(isCycleCloseFinalizerProfile({ role: 'coordinator' })).toBe(false);
  });
});
