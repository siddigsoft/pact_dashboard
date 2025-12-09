import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  FolderKanban,
  Database,
  Building2,
  ClipboardList,
  Activity,
  MapPin,
  CheckCircle,
  Archive,
  Link2,
  Calendar,
  Users,
  Shield,
  ShieldCheck,
  Award,
  TrendingUp,
  DollarSign,
  Settings,
  BarChart3,
  ClipboardCheck,
  Timer,
  FileSignature,
  MessageSquare,
  Phone,
  Bell,
} from 'lucide-react';
import { AppRole } from '@/types';
import { MenuPreferences, DEFAULT_MENU_PREFERENCES } from '@/types/user-preferences';

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
  const isAdmin = roles.includes('admin' as AppRole) || defaultRole === 'admin';
  const isICT = roles.includes('ict' as AppRole) || defaultRole === 'ict';
  const isFinancialAdmin = roles.includes('financialAdmin' as AppRole) || defaultRole === 'financialAdmin';
  const isDataCollector = roles.includes('DataCollector' as AppRole) || roles.includes('dataCollector' as AppRole) || defaultRole === 'dataCollector' || defaultRole === 'DataCollector';
  const isCoordinator = roles.includes('Coordinator' as AppRole) || roles.includes('coordinator' as AppRole) || defaultRole === 'coordinator' || defaultRole === 'Coordinator';
  const isFOM = roles.includes('fom' as AppRole) || defaultRole === 'fom';
  const isSupervisor = roles.includes('supervisor' as AppRole) || defaultRole === 'supervisor';
  const isProjectManager = roles.includes('projectManager' as AppRole) || defaultRole === 'projectManager';

  const isHidden = (url: string) => menuPrefs.hiddenItems.includes(url);
  const isPinned = (url: string) => menuPrefs.pinnedItems.includes(url);

  const groups: MenuGroup[] = [];

  const overviewItems: MenuGroup['items'] = [];
  if (!isHidden('/dashboard') && (isAdmin || isICT || isProjectManager || perms.dashboard)) {
    overviewItems.push({ id: 'dashboard', title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, priority: 1, isPinned: isPinned('/dashboard') });
  }
  if (!isHidden('/cost-submission') && (isDataCollector || isAdmin || isCoordinator)) {
    overviewItems.push({ id: 'cost-submission', title: 'Cost Submission', url: '/cost-submission', icon: Receipt, priority: 3, isPinned: isPinned('/cost-submission') });
  }
  if (overviewItems.length) groups.push({ id: 'overview', label: 'Overview', order: 1, items: overviewItems });

  // Communication section - available to all users
  const communicationItems: MenuGroup['items'] = [];
  if (!isHidden('/chat')) {
    communicationItems.push({ id: 'chat', title: 'Chat', url: '/chat', icon: MessageSquare, priority: 1, isPinned: isPinned('/chat') });
  }
  if (!isHidden('/calls')) {
    communicationItems.push({ id: 'calls', title: 'Calls', url: '/calls', icon: Phone, priority: 2, isPinned: isPinned('/calls') });
  }
  if (!isHidden('/notifications')) {
    communicationItems.push({ id: 'notifications', title: 'Notifications', url: '/notifications', icon: Bell, priority: 3, isPinned: isPinned('/notifications') });
  }
  if (communicationItems.length) groups.push({ id: 'communication', label: 'Communication', order: 1.5, items: communicationItems });

  const planningItems: MenuGroup['items'] = [];
  if (!isHidden('/projects') && (isAdmin || isICT || isProjectManager || perms.projects)) {
    planningItems.push({ id: 'projects', title: 'Projects', url: '/projects', icon: FolderKanban, priority: 1, isPinned: isPinned('/projects') });
  }
  if (!isHidden('/mmp') && (isAdmin || isICT || perms.mmp || isCoordinator)) {
    const mmpTitle = (isDataCollector || isCoordinator) ? 'My Sites Management' : 'MMP Management';
    planningItems.push({ id: 'mmp-management', title: mmpTitle, url: '/mmp', icon: Database, priority: 2, isPinned: isPinned('/mmp') });
  }
  if (!isHidden('/hub-operations') && (isAdmin || isSuperAdmin)) {
    planningItems.push({ id: 'hub-operations', title: 'Hub Operations', url: '/hub-operations', icon: Building2, priority: 3, isPinned: isPinned('/hub-operations') });
  }
  if (planningItems.length) groups.push({ id: 'planning', label: 'Planning & Setup', order: 2, items: planningItems });

  const fieldOpsItems: MenuGroup['items'] = [];
  if (!isHidden('/site-visits') && (isAdmin || isICT || perms.siteVisits)) {
    fieldOpsItems.push({ id: 'site-visits', title: 'Site Visits', url: '/site-visits', icon: ClipboardList, priority: 1, isPinned: isPinned('/site-visits') });
  }
  if (!isHidden('/field-team') && ((isAdmin || perms.fieldTeam) && !isICT)) {
    fieldOpsItems.push({ id: 'field-team', title: 'Field Team', url: '/field-team', icon: Activity, priority: 2, isPinned: isPinned('/field-team') });
  }
  if (!isHidden('/field-operation-manager') && (isAdmin || isFOM || perms.fieldOpManager) && !isCoordinator) {
    fieldOpsItems.push({ id: 'field-op-manager', title: 'Field Operation Manager', url: '/field-operation-manager', icon: MapPin, priority: 3, isPinned: isPinned('/field-operation-manager') });
  }
  if (fieldOpsItems.length) groups.push({ id: 'field-ops', label: 'Field Operations', order: 3, items: fieldOpsItems });

  const verificationItems: MenuGroup['items'] = [];
  if (!isHidden('/coordinator/sites') && isCoordinator) {
    verificationItems.push({ id: 'site-verification', title: 'Site Verification', url: '/coordinator/sites', icon: CheckCircle, priority: 1, isPinned: isPinned('/coordinator/sites') });
  }
  if (!isHidden('/archive') && (isAdmin || perms.archive)) {
    verificationItems.push({ id: 'archive', title: 'Archive', url: '/archive', icon: Archive, priority: 2, isPinned: isPinned('/archive') });
  }
  if (verificationItems.length) groups.push({ id: 'verification', label: 'Verification & Review', order: 4, items: verificationItems });

  const dataItems: MenuGroup['items'] = [];
  if (!isHidden('/data-visibility') && ((isAdmin || perms.dataVisibility) && !isICT)) {
    dataItems.push({ id: 'data-visibility', title: 'Data Visibility', url: '/data-visibility', icon: Link2, priority: 1, isPinned: isPinned('/data-visibility') });
  }
  if (!isHidden('/reports') && ((isAdmin || isProjectManager || perms.reports) && !isICT)) {
    dataItems.push({ id: 'reports', title: 'Reports', url: '/reports', icon: Calendar, priority: 2, isPinned: isPinned('/reports') });
  }
  if (!isHidden('/tracker-preparation-plan') && (isAdmin || isICT)) {
    dataItems.push({ id: 'tracker-plan', title: 'Tracker Preparation', url: '/tracker-preparation-plan', icon: BarChart3, priority: 3, isPinned: isPinned('/tracker-preparation-plan') });
  }
  if (dataItems.length) groups.push({ id: 'reports', label: 'Data & Reports', order: 5, items: dataItems });

  const projectMgmtItems: MenuGroup['items'] = [];
  if (!isHidden('/dashboard?tab=approvals') && isProjectManager) {
    projectMgmtItems.push({ id: 'project-approvals', title: 'Approvals Queue', url: '/dashboard?tab=approvals', icon: ClipboardCheck, priority: 1, isPinned: isPinned('/dashboard?tab=approvals') });
  }
  if (!isHidden('/dashboard?tab=deadlines') && isProjectManager) {
    projectMgmtItems.push({ id: 'project-deadlines', title: 'Deadline Tracker', url: '/dashboard?tab=deadlines', icon: Timer, priority: 2, isPinned: isPinned('/dashboard?tab=deadlines') });
  }
  if (!isHidden('/dashboard?tab=team') && isProjectManager) {
    projectMgmtItems.push({ id: 'team-performance', title: 'Team Performance', url: '/dashboard?tab=team', icon: Users, priority: 3, isPinned: isPinned('/dashboard?tab=team') });
  }
  if (projectMgmtItems.length) groups.push({ id: 'project-mgmt', label: 'Project Management', order: 5.5, items: projectMgmtItems });

  const adminItems: MenuGroup['items'] = [];
  if (!isHidden('/users') && (isAdmin || isICT || perms.users)) {
    adminItems.push({ id: 'user-management', title: 'User Management', url: '/users', icon: Users, priority: 1, isPinned: isPinned('/users') });
  }
  if (!isHidden('/role-management') && (isAdmin || perms.roleManagement)) {
    adminItems.push({ id: 'role-management', title: 'Role Management', url: '/role-management', icon: Shield, priority: 2, isPinned: isPinned('/role-management') });
  }
  if (!isHidden('/super-admin-management') && isSuperAdmin) {
    adminItems.push({ id: 'super-admin', title: 'Super Admin', url: '/super-admin-management', icon: ShieldCheck, priority: 3, isPinned: isPinned('/super-admin-management') });
  }
  if (!isHidden('/classifications') && (isAdmin || isFinancialAdmin)) {
    adminItems.push({ id: 'classifications', title: 'Classifications', url: '/classifications', icon: Award, priority: 4, isPinned: isPinned('/classifications') });
  }
  if (!isHidden('/classification-fees') && isAdmin) {
    adminItems.push({ id: 'classification-fees', title: 'Classification Fees', url: '/classification-fees', icon: DollarSign, priority: 5, isPinned: isPinned('/classification-fees') });
  }
  if (!isHidden('/financial-operations') && perms.financialOperations) {
    adminItems.push({ id: 'financial-ops', title: 'Financial Operations', url: '/financial-operations', icon: TrendingUp, priority: 5, isPinned: isPinned('/financial-operations') });
  }
  if (!isHidden('/budget') && (isAdmin || isFinancialAdmin || isProjectManager)) {
    adminItems.push({ id: 'budget', title: 'Budget', url: '/budget', icon: DollarSign, priority: 6, isPinned: isPinned('/budget') });
  }
  if (!isHidden('/admin/wallets') && (isAdmin || isFinancialAdmin)) {
    adminItems.push({ id: 'wallets', title: 'Wallets', url: '/admin/wallets', icon: CreditCard, priority: 7, isPinned: isPinned('/admin/wallets') });
  }
  if (!isHidden('/withdrawal-approval') && (isAdmin || isFinancialAdmin || isSupervisor || isFOM)) {
    adminItems.push({ id: 'withdrawal-approval', title: 'Supervisor Approval', url: '/withdrawal-approval', icon: ClipboardList, priority: 8, isPinned: isPinned('/withdrawal-approval') });
  }
  if (!isHidden('/finance-approval') && (isAdmin || isFinancialAdmin)) {
    adminItems.push({ id: 'finance-approval', title: 'Finance Approval', url: '/finance-approval', icon: TrendingUp, priority: 9, isPinned: isPinned('/finance-approval') });
  }
  if (!isHidden('/settings') && ((isAdmin || perms.settings) && !isDataCollector)) {
    adminItems.push({ id: 'settings', title: 'Settings', url: '/settings', icon: Settings, priority: 10, isPinned: isPinned('/settings') });
  }
  if (adminItems.length) groups.push({ id: 'admin', label: 'Administration', order: 6, items: adminItems });

  groups.forEach(group => {
    group.items.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.priority - b.priority;
    });
  });

  return groups;
};
