// Compatibility exports for historical imports. All editable access UI lives in UnifiedAccessManager.
import { Navigate } from 'react-router-dom';
import { normalizeRole } from '@/utils/roleMapping';
import type { PageDef } from '@/lib/access-registry';
import { overrideIsActive } from '@/lib/current-user-access';
import { UserCheck, Lock, Shield, UserX } from 'lucide-react';
export * from '@/lib/access-registry';
// ── Role display helpers ──────────────────────────────────────────────────────

export const ROLE_LABELS: Record<string, string> = {
  superAdmin: 'Super Admin', admin: 'Admin', ict: 'ICT', fom: 'FOM',
  financialAdmin: 'Financial Admin', auditor: 'Auditor', supervisor: 'Supervisor',
  coordinator: 'Coordinator', dataCollector: 'Data Collector', dataTeam: 'Data Team',
  reviewer: 'Reviewer', projectManager: 'Project Manager', countryDirector: 'Country Director',
  seniorOperationsLead: 'Senior Ops Lead',
  SMT: 'SMT',
  '!dataCollector': 'All except DC',
};

export const ROLE_COLORS: Record<string, string> = {
  superAdmin: 'bg-purple-100 text-purple-700',
  admin: 'bg-[#1D3461]/10 text-[#1D3461]',
  ict: 'bg-cyan-100 text-cyan-700',
  fom: 'bg-indigo-100 text-indigo-700',
  financialAdmin: 'bg-emerald-100 text-emerald-700',
  auditor: 'bg-orange-100 text-orange-700',
  supervisor: 'bg-blue-100 text-blue-700',
  coordinator: 'bg-teal-100 text-teal-700',
  dataCollector: 'bg-yellow-100 text-yellow-700',
  dataTeam: 'bg-lime-100 text-lime-700',
  reviewer: 'bg-rose-100 text-rose-700',
  projectManager: 'bg-violet-100 text-violet-700',
  countryDirector: 'bg-sky-100 text-sky-700',
  seniorOperationsLead: 'bg-amber-100 text-amber-700',
};

export function getRoleCode(rawRole: string | null): string | null {
  if (!rawRole) return null;
  const n = normalizeRole(rawRole);
  return n ?? rawRole.toLowerCase();
}

function roleCls(rawRole: string | null) {
  const code = getRoleCode(rawRole);
  return ROLE_COLORS[code ?? ''] ?? 'bg-slate-100 text-slate-500';
}

function roleLabel(rawRole: string | null) {
  const code = getRoleCode(rawRole);
  return ROLE_LABELS[code ?? ''] ?? (rawRole ?? 'Unknown');
}

/** effectiveRoles overrides page.roles when the super admin has customised defaults. */
export function hasDefaultAccess(page: PageDef, rawRole: string | null, effectiveRoles?: string[]): boolean {
  if (!rawRole) return false;
  const code = getRoleCode(rawRole);
  if (!code) return false;
  if (code === 'superAdmin') return true;
  const roles = effectiveRoles ?? page.roles;
  // Explicit listing always wins (case-insensitive) — needed for custom roles like SMT
  if (roles.some(r => !r.startsWith('!') && r.toLowerCase() === code.toLowerCase())) return true;
  // Built-in system roles inherit `all`; custom roles do not
  const systemCodes = new Set([
    'superAdmin', 'admin', 'ict', 'fom', 'financialAdmin', 'auditor',
    'supervisor', 'coordinator', 'dataCollector', 'dataTeam', 'reviewer',
    'projectManager', 'countryDirector', 'seniorOperationsLead', 'seniorManagement',
  ]);
  if (systemCodes.has(code) && roles.includes('all')) return true;
  if (roles.includes('!dataCollector')) return code !== 'dataCollector' && systemCodes.has(code);
  return false;
}

function initials(name: string | null) {
  return (name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const STATUS_UI = {
  granted: { label: 'Explicitly Granted', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400', icon: UserCheck },
  blocked: { label: 'Explicitly Blocked', cls: 'bg-red-100 text-red-700',     dot: 'bg-red-400',     icon: Lock     },
  role:    { label: 'Role Access',         cls: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-400',    icon: Shield   },
  denied:  { label: 'No Access',           cls: 'bg-slate-100 text-slate-500',  dot: 'bg-slate-300',   icon: UserX    },
};

// ── Granular permissions (R/W/C/D) ────────────────────────────────────────────
// Stored as JSON in page_access_overrides.notes: {"r":true,"w":false,"c":false,"d":false}
export type Perms = { r: boolean; w: boolean; c: boolean; d: boolean };
export const DEFAULT_PERMS: Perms = { r: true, w: false, c: false, d: false };

export function parsePermissions(notes: string | null): Perms {
  if (!notes) return { ...DEFAULT_PERMS };
  try {
    const p = JSON.parse(notes);
    if (p && typeof p === 'object' && 'r' in p)
      return { r: !!p.r, w: !!p.w, c: !!p.c, d: !!p.d };
  } catch { /* ignore */ }
  return { ...DEFAULT_PERMS };
}

function packPermissions(perms: Perms): string { return JSON.stringify(perms); }

export const PERM_DEFS: { key: keyof Perms; label: string; desc: string; activeClass: string }[] = [
  { key: 'r', label: 'Read',   desc: 'View and read data on this page',  activeClass: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300' },
  { key: 'w', label: 'Write',  desc: 'Edit and update existing records', activeClass: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300' },
  { key: 'c', label: 'Create', desc: 'Create new records on this page',  activeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { key: 'd', label: 'Delete', desc: 'Delete records on this page',      activeClass: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300' },
];

export type AccessStatus = keyof typeof STATUS_UI;
const STATUS_ORDER: Record<AccessStatus, number> = { blocked: 0, granted: 1, role: 2, denied: 3 };

export function getAccessStatus(
  page: PageDef,
  profile: Profile,
  overrideMap: Record<string, PageOverride>,
  effectiveRoles?: string[],
): AccessStatus {
  const ov = overrideMap[profile.id];
  if (ov && overrideIsActive(ov)) return ov.is_blocked ? 'blocked' : 'granted';
  return hasDefaultAccess(page, profile.role, effectiveRoles) ? 'role' : 'denied';
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Profile {
  id: string;
  full_name: string | null;
  role: string | null;
}

export interface PageOverride {
  id: string;
  page_slug: string;
  user_id: string;
  is_blocked: boolean;
  level: 'view' | 'manage';
  notes?: string | null;
  granted_by?: string | null;
  reason?: string | null;
  expires_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
}

export default function PageAccessControl() {
  return <Navigate to="/super-admin-hub?tab=user-access" replace />;
}
