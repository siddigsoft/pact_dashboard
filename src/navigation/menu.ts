import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  FolderKanban,
  Database,
  CheckCircle,
  Calendar,
  Users,
  ShieldCheck,
  DollarSign,
  Settings,
  BarChart3,
  ClipboardCheck,
  Timer,
  MessageSquare,
  Bell,
  Handshake,
  GitBranch,
  FileSearch,
  KeyRound,
  ScrollText,
  Compass,
  Briefcase,
  BookOpen,
  Inbox,
  CheckSquare,
  Banknote,
} from 'lucide-react';
import { AppRole } from '@/types';
import { MenuPreferences, DEFAULT_MENU_PREFERENCES } from '@/types/user-preferences';
import { normalizeRole } from '@/utils/roleMapping';

export interface MenuGroup {
  id: string;
  label: string;
  order: number;
  items: Array<{
    id: string;
    title: string;
    url: string;
    icon: any;
    priority: number;
    isPinned?: boolean;
  }>;
}

export const getWorkflowMenuGroups = (
  roles: AppRole[] = [],
  defaultRole: string = 'dataCollector',
  perms: Record<string, boolean> = {},
  isSuperAdmin: boolean = false,
  menuPrefs: MenuPreferences = DEFAULT_MENU_PREFERENCES
): MenuGroup[] => {
  const normalizedDefault = normalizeRole(defaultRole);
  const normalizedRoles = roles.map(r => normalizeRole(r)).filter(Boolean);
  const allNormalized = normalizedDefault ? [normalizedDefault, ...normalizedRoles] : normalizedRoles;
  const hasRole = (code: string) => allNormalized.includes(code as any);

  const isAdmin = hasRole('admin');
  const isICT = hasRole('ict');
  const isFinancialAdmin = hasRole('financialAdmin');
  const isDataCollector = hasRole('dataCollector');
  const isCoordinator = hasRole('coordinator');
  const isFOM = hasRole('fom');
  const isSupervisor = hasRole('supervisor');
  const isProjectManager = hasRole('projectManager');
  const isCountryDirector = hasRole('countryDirector');
  const isHR = hasRole('hr');
  const isAuditor = hasRole('auditor');

  const isHidden = (url: string) => menuPrefs.hiddenItems.includes(url);
  const isPinned = (url: string) => menuPrefs.pinnedItems.includes(url);

  const groups: MenuGroup[] = [];

  // 1. Overview / Workspace
  const overviewItems: MenuGroup['items'] = [];
  if (!isHidden('/dashboard') && (isAdmin || isICT || isProjectManager || isCountryDirector || perms.dashboard))
    overviewItems.push({ id: 'dashboard', title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, priority: 1, isPinned: isPinned('/dashboard') });
  if (!isHidden('/my-tasks'))
    overviewItems.push({ id: 'my-tasks', title: 'My Tasks', url: '/my-tasks', icon: CheckSquare, priority: 2, isPinned: isPinned('/my-tasks') });
  if (!isHidden('/cost-submission') && (isDataCollector || isAdmin || isCoordinator || isSupervisor || isCountryDirector))
    overviewItems.push({ id: 'cost-submission', title: 'Cost Submission', url: '/cost-submission', icon: Receipt, priority: 3, isPinned: isPinned('/cost-submission') });
  if (!isHidden('/my-expenses'))
    overviewItems.push({ id: 'my-expenses', title: 'My Expenses', url: '/my-expenses', icon: CreditCard, priority: 4, isPinned: isPinned('/my-expenses') });
  if (overviewItems.length) groups.push({ id: 'overview', label: 'Overview', order: 1, items: overviewItems });

  // 2. Communication Hub
  const communicationItems: MenuGroup['items'] = [];
  if (!isHidden('/communication-hub'))
    communicationItems.push({ id: 'communication-hub', title: 'Communication', url: '/communication-hub', icon: MessageSquare, priority: 1, isPinned: isPinned('/communication-hub') });
  if (!isHidden('/notifications'))
    communicationItems.push({ id: 'notifications', title: 'Notifications', url: '/notifications', icon: Bell, priority: 2, isPinned: isPinned('/notifications') });
  if (communicationItems.length) groups.push({ id: 'communication', label: 'Communication', order: 1.5, items: communicationItems });

  // 3. Programme Management
  const planningItems: MenuGroup['items'] = [];
  const canSeeProgrammeHub = isAdmin || isICT || isProjectManager || isCountryDirector || isFOM || isSuperAdmin || perms.projects;
  if (canSeeProgrammeHub && !isHidden('/programme-hub'))
    planningItems.push({ id: 'programme-hub', title: 'Programme Hub', url: '/programme-hub', icon: FolderKanban, priority: 1, isPinned: isPinned('/programme-hub') });
  if (!isHidden('/mmp') && (isAdmin || isICT || perms.mmp || isCoordinator || isSupervisor || isDataCollector || isFOM || isCountryDirector)) {
    const mmpTitle = (isDataCollector || isCoordinator || isSupervisor) ? 'My Sites Management' : 'MMP Management';
    planningItems.push({ id: 'mmp-management', title: mmpTitle, url: '/mmp', icon: Database, priority: 2, isPinned: isPinned('/mmp') });
  }
  if (planningItems.length) groups.push({ id: 'planning', label: 'Planning & Setup', order: 2, items: planningItems });

  // 4. Field Operations Hub
  const fieldOpsItems: MenuGroup['items'] = [];
  const canSeeFieldOps = isAdmin || isICT || isFOM || isCoordinator || isSupervisor || isDataCollector || isSuperAdmin || perms.siteVisits || perms.fieldTeam;
  if (canSeeFieldOps && !isHidden('/field-ops'))
    fieldOpsItems.push({ id: 'field-ops-hub', title: 'Field Ops Hub', url: '/field-ops', icon: Compass, priority: 1, isPinned: isPinned('/field-ops') });
  if (fieldOpsItems.length) groups.push({ id: 'field-ops', label: 'Field Operations', order: 3, items: fieldOpsItems });

  // 5. Coordination (kept as direct links — role-specific workflow)
  const verificationItems: MenuGroup['items'] = [];
  if (!isHidden('/coordinator/sites') && (isCoordinator || isSupervisor))
    verificationItems.push({ id: 'site-verification', title: 'Site Verification', url: '/coordinator/sites', icon: CheckCircle, priority: 1, isPinned: isPinned('/coordinator/sites') });
  if (!isHidden('/coordinator/sites-for-verification') && (isCoordinator || isSupervisor))
    verificationItems.push({ id: 'sites-for-verification', title: 'Sites for Verification', url: '/coordinator/sites-for-verification', icon: CheckCircle, priority: 1.1, isPinned: isPinned('/coordinator/sites-for-verification') });
  if (verificationItems.length) groups.push({ id: 'verification', label: 'Coordination', order: 4, items: verificationItems });

  // 6. Finance
  const financeItems: MenuGroup['items'] = [];
  if (!isHidden('/wallet') && (isFinancialAdmin || isFOM || isSupervisor || isDataCollector || isCoordinator))
    financeItems.push({ id: 'my-wallet', title: 'My Wallet', url: '/wallet', icon: CreditCard, priority: 1, isPinned: isPinned('/wallet') });
  if (!isHidden('/approvals') && (isAdmin || isSuperAdmin || isFinancialAdmin || isFOM || isSupervisor))
    financeItems.push({ id: 'approvals-hub', title: 'Approvals Hub', url: '/approvals', icon: Inbox, priority: 2, isPinned: isPinned('/approvals') });
  if (!isHidden('/finance-hub') && (isAdmin || isSuperAdmin || isFinancialAdmin || isAuditor || isFOM || isCountryDirector))
    financeItems.push({ id: 'finance-hub', title: 'Finance Hub', url: '/finance-hub', icon: DollarSign, priority: 3, isPinned: isPinned('/finance-hub') });
  if (!isHidden('/accounting') && (isAdmin || isSuperAdmin || isFinancialAdmin || isAuditor))
    financeItems.push({ id: 'accounting-hub', title: 'Accounting', url: '/accounting', icon: BookOpen, priority: 4, isPinned: isPinned('/accounting') });
  // Pre-Funding: finance/admin see full module; coordinators, supervisors, FOM, data collectors see their own allocation
  if (!isHidden('/pre-funding') && (isAdmin || isSuperAdmin || isFinancialAdmin || isCoordinator || isSupervisor || isFOM || isDataCollector || hasRole('employee') || hasRole('dataTeam')))
    financeItems.push({ id: 'pre-funding', title: 'Pre-Funding', url: '/pre-funding', icon: Banknote, priority: 5, isPinned: isPinned('/pre-funding') });
  if (financeItems.length) groups.push({ id: 'finance', label: 'Finance', order: 5, items: financeItems });

  // 7. Analytics Hub
  const dataItems: MenuGroup['items'] = [];
  const canSeeAnalytics = isAdmin || isSuperAdmin || isICT || isFinancialAdmin || isAuditor || isFOM || isProjectManager || isCountryDirector || perms.reports;
  if (canSeeAnalytics && !isHidden('/analytics'))
    dataItems.push({ id: 'analytics-hub', title: 'Analytics Hub', url: '/analytics', icon: BarChart3, priority: 1, isPinned: isPinned('/analytics') });
  if (dataItems.length) groups.push({ id: 'reports', label: 'Analytics & Reports', order: 5.5, items: dataItems });

  // 8. HR Hub
  const hrItems: MenuGroup['items'] = [];
  if (!isHidden('/hr') && (isAdmin || isSuperAdmin || isFinancialAdmin))
    hrItems.push({ id: 'hr-hub', title: 'HR Hub', url: '/hr', icon: Briefcase, priority: 1, isPinned: isPinned('/hr') });
  if (hrItems.length) groups.push({ id: 'hr', label: 'HR & People', order: 5.6, items: hrItems });

  // 9. Project Management shortcuts (kept for PM role)
  const projectMgmtItems: MenuGroup['items'] = [];
  if (!isHidden('/dashboard?tab=approvals') && isProjectManager)
    projectMgmtItems.push({ id: 'project-approvals', title: 'Approvals Queue', url: '/dashboard?tab=approvals', icon: ClipboardCheck, priority: 1, isPinned: isPinned('/dashboard?tab=approvals') });
  if (!isHidden('/dashboard?tab=deadlines') && isProjectManager)
    projectMgmtItems.push({ id: 'project-deadlines', title: 'Deadline Tracker', url: '/dashboard?tab=deadlines', icon: Timer, priority: 2, isPinned: isPinned('/dashboard?tab=deadlines') });
  if (!isHidden('/calendar'))
    projectMgmtItems.push({ id: 'calendar', title: 'Calendar', url: '/calendar', icon: Calendar, priority: 3, isPinned: isPinned('/calendar') });
  if (projectMgmtItems.length) groups.push({ id: 'project-mgmt', label: 'My Work', order: 5.7, items: projectMgmtItems });

  // 10. CRM
  const crmItems: MenuGroup['items'] = [];
  if (!isHidden('/crm') && (isAdmin || isSuperAdmin || isFOM || isProjectManager || isCountryDirector))
    crmItems.push({ id: 'crm-hub', title: 'CRM', url: '/crm', icon: Handshake, priority: 1, isPinned: isPinned('/crm') });
  if (crmItems.length) groups.push({ id: 'crm', label: 'CRM', order: 5.8, items: crmItems });

  // 11. Administration Hub
  const adminItems: MenuGroup['items'] = [];
  const canSeeAdmin = isAdmin || isSuperAdmin || isICT || perms.users || perms.roleManagement || perms.settings;
  if (canSeeAdmin && !isHidden('/admin-hub'))
    adminItems.push({ id: 'admin-hub', title: 'Admin Hub', url: '/admin-hub', icon: LayoutDashboard, priority: 1, isPinned: isPinned('/admin-hub') });
  if (isSuperAdmin && !isHidden('/super-admin-hub'))
    adminItems.push({ id: 'super-admin-hub', title: 'Super Admin Hub', url: '/super-admin-hub', icon: ShieldCheck, priority: 2, isPinned: isPinned('/super-admin-hub') });
  if (!isHidden('/settings') && ((isAdmin || perms.settings) && !isDataCollector))
    adminItems.push({ id: 'settings', title: 'Settings', url: '/settings', icon: Settings, priority: 3, isPinned: isPinned('/settings') });
  if (adminItems.length) groups.push({ id: 'admin', label: 'Administration', order: 6, items: adminItems });

  // 12. Audit & Security
  const auditItems: MenuGroup['items'] = [];
  if (!isHidden('/hierarchy-audit') && (isAdmin || isSuperAdmin || isHR))
    auditItems.push({ id: 'hierarchy-audit', title: 'Hierarchy Changes', url: '/hierarchy-audit', icon: GitBranch, priority: 1, isPinned: isPinned('/hierarchy-audit') });
  if (!isHidden('/audit-logs') && isSuperAdmin)
    auditItems.push({ id: 'audit-logs', title: 'System Audit Logs', url: '/audit-logs', icon: ScrollText, priority: 2, isPinned: isPinned('/audit-logs') });
  if (!isHidden('/audit-compliance') && (isAdmin || isSuperAdmin || isFinancialAdmin || isHR))
    auditItems.push({ id: 'audit-compliance', title: 'Audit & Compliance', url: '/audit-compliance', icon: FileSearch, priority: 3, isPinned: isPinned('/audit-compliance') });
  if (!isHidden('/login-analytics') && (isAdmin || isICT || isProjectManager || isSuperAdmin))
    auditItems.push({ id: 'login-analytics', title: 'Login Analytics', url: '/login-analytics', icon: KeyRound, priority: 4, isPinned: isPinned('/login-analytics') });
  if (auditItems.length) groups.push({ id: 'audit', label: 'Audit & Security', order: 6.5, items: auditItems });

  groups.forEach(group => {
    group.items.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.priority - b.priority;
    });
  });

  return groups;
};
