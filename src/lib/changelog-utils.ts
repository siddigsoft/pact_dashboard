export type AffectedRole = 'all' | 'SuperAdmin' | 'Admin' | 'Supervisor' | 'Coordinator' | 'DataCollector' | 'DataTeam' | 'Reviewer' | 'FOM' | 'Finance';

export interface ChangeEntryMeta {
  id: string;
  affectedRoles: AffectedRole[];
}

const READ_KEY = 'pact_changelog_read';

// Minimal metadata — only what's needed to compute unread counts
export const CHANGELOG_META: ChangeEntryMeta[] = [
  { id: 'v4-timesheet',        affectedRoles: ['all'] },
  { id: 'v4-subscriptions',    affectedRoles: ['Admin', 'SuperAdmin', 'Finance'] },
  { id: 'v4-integrations',     affectedRoles: ['all'] },
  { id: 'v4-portfolio',        affectedRoles: ['Admin', 'SuperAdmin', 'Supervisor', 'Coordinator', 'Reviewer'] },
  { id: 'v35-leave-entitlements', affectedRoles: ['Admin', 'SuperAdmin', 'Finance'] },
  { id: 'v35-pdm-coverage',    affectedRoles: ['Admin', 'SuperAdmin', 'DataTeam', 'Coordinator'] },
  { id: 'v35-gantt',           affectedRoles: ['Admin', 'SuperAdmin', 'Supervisor', 'Coordinator'] },
  { id: 'v3-crm',              affectedRoles: ['Admin', 'SuperAdmin', 'Coordinator', 'Reviewer'] },
  { id: 'v3-workspace',        affectedRoles: ['all'] },
  { id: 'v3-leave',            affectedRoles: ['all'] },
  { id: 'v3-fom',              affectedRoles: ['FOM', 'Admin', 'SuperAdmin'] },
  { id: 'v3-broadcast',        affectedRoles: ['Admin', 'SuperAdmin'] },
  { id: 'v25-scanner',         affectedRoles: ['Admin', 'SuperAdmin', 'Finance'] },
  { id: 'v25-reconciliation',  affectedRoles: ['Admin', 'SuperAdmin', 'Finance'] },
  { id: 'v25-pdm',             affectedRoles: ['Admin', 'SuperAdmin', 'DataTeam', 'Coordinator'] },
  { id: 'v2-wallet',           affectedRoles: ['all'] },
  { id: 'v2-signatures',       affectedRoles: ['Admin', 'SuperAdmin', 'Supervisor', 'FOM'] },
];

export function getReadIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${READ_KEY}_${userId}`);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function saveReadIds(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(`${READ_KEY}_${userId}`, JSON.stringify([...ids]));
  } catch { /* noop */ }
}

export function matchesRole(affectedRoles: AffectedRole[], userRole: string): boolean {
  if (affectedRoles.includes('all')) return true;
  const norm = userRole?.toLowerCase() ?? '';
  return affectedRoles.some(r => {
    const rn = r.toLowerCase();
    return norm.includes(rn) || rn.includes(norm);
  });
}

export function getChangelogUnreadCount(userId: string, userRole: string): number {
  const readIds = getReadIds(userId);
  return CHANGELOG_META.filter(e => !readIds.has(e.id) && matchesRole(e.affectedRoles, userRole)).length;
}
