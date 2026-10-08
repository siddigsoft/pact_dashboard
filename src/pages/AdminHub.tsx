import { Suspense, lazy, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Loader2, Users, Shield, Building2, Award, DollarSign,
  CheckSquare, ClipboardList, Settings, Activity,
} from 'lucide-react';
import { HubLayout } from '@/components/ui/hub-layout';
import { useCurrentUserAccess } from '@/context/CurrentUserAccessContext';

const UsersPanel              = lazy(() => import('./Users'));
const RoleManagementPanel     = lazy(() => import('./RoleManagement'));
const DepartmentsPanel        = lazy(() => import('./Departments'));
const HubManagementPanel      = lazy(() => import('./HubManagement'));
const ClassificationsPanel    = lazy(() => import('./Classifications'));
const ClassificationFeesPanel = lazy(() => import('./ClassificationFeeManagement'));
const TaskAdminPanel          = lazy(() => import('./TaskAdmin'));
const ProjectFlowStagesPanel  = lazy(() => import('./AdminProjectFlowStages'));
const SettingsPanel           = lazy(() => import('./Settings'));
const AuditCompliancePanel    = lazy(() => import('./AuditCompliance'));
const MonitoringDashboardPanel = lazy(() => import('./MonitoringDashboard'));

type AdminSection = 'people' | 'organisation' | 'system';
type AdminTab =
  | 'users' | 'role-management' | 'departments' | 'hub-management'
  | 'classifications' | 'classification-fees' | 'task-admin' | 'project-flow-stages'
  | 'settings' | 'audit-compliance' | 'system-monitoring';

interface TabDef { id: AdminTab; label: string; icon: React.ElementType; description: string }
interface SectionDef { id: AdminSection; label: string; icon: React.ElementType; color: string; bg: string; description: string; tabs: TabDef[] }

const SECTIONS: SectionDef[] = [
  {
    id: 'people', label: 'People & Access', icon: Users,
    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',
    description: 'Manage users, roles, access permissions, departments, and hub structures.',
    tabs: [
      { id: 'users',          label: 'User Management',    icon: Users,      description: 'Create, edit, and deactivate user accounts — assign roles, set hub affiliations, manage profile details, and view login history.' },
      { id: 'role-management',label: 'Role Management',    icon: Shield,     description: 'Define and configure roles, permissions, and per-user access overrides — use the Access Manager inside Role Management for page, tab, column, and action-level control.' },
      { id: 'departments',    label: 'Departments',        icon: Building2,  description: 'Manage organisational departments — create entries, assign staff, and link departments to hubs for reporting and filtering.' },
      { id: 'hub-management', label: 'Hub Management',     icon: Building2,  description: 'Configure hubs and sub-hubs — define geographic coverage, assign managers, set operational parameters, and manage locality lists.' },
    ],
  },
  {
    id: 'organisation', label: 'Organisation', icon: ClipboardList,
    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',
    description: 'Configure classification schemes, fee structures, task templates, and project workflow stages.',
    tabs: [
      { id: 'classifications',      label: 'Classifications',     icon: Award,        description: 'Manage data collector and staff classification levels — define grade names, criteria, and the classification hierarchy used across modules.' },
      { id: 'classification-fees',  label: 'Classification Fees', icon: DollarSign,   description: 'Set daily or per-visit fee rates per classification level — used to calculate transportation advances and cost submissions.' },
      { id: 'task-admin',           label: 'Task Admin',          icon: CheckSquare,  description: 'Administer task templates and assignments used across the organisation.' },
      { id: 'project-flow-stages',  label: 'Project Flow Stages', icon: Activity,     description: 'Configure project workflow stages and transitions.' },
    ],
  },
  {
    id: 'system', label: 'System', icon: Settings,
    color: '#64748b', bg: 'rgba(100,116,139,0.12)',
    description: 'System settings, audit, and monitoring.',
    tabs: [
      { id: 'settings',           label: 'Settings',           icon: Settings, description: 'Organisation-wide application settings.' },
      { id: 'audit-compliance',   label: 'Audit & Compliance', icon: Shield,   description: 'Review audit trails and compliance controls.' },
      { id: 'system-monitoring',  label: 'System Monitoring',  icon: Activity, description: 'Operational health and monitoring dashboards.' },
    ],
  },
];

const ALL_TABS = SECTIONS.flatMap(s => s.tabs.map(t => ({ ...t, sectionId: s.id })));
const DEFAULT_TAB: AdminTab = 'users';

const PanelMap: Record<AdminTab, React.LazyExoticComponent<any>> = {
  'users': UsersPanel,
  'role-management': RoleManagementPanel,
  'departments': DepartmentsPanel,
  'hub-management': HubManagementPanel,
  'classifications': ClassificationsPanel,
  'classification-fees': ClassificationFeesPanel,
  'task-admin': TaskAdminPanel,
  'project-flow-stages': ProjectFlowStagesPanel,
  'settings': SettingsPanel,
  'audit-compliance': AuditCompliancePanel,
  'system-monitoring': MonitoringDashboardPanel,
};

const Spinner = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function AdminHub() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') as AdminTab | null;
  const _savedAdm = localStorage.getItem('hub_last_tab_admin') as AdminTab | null;

  const { isTabBlocked } = useCurrentUserAccess();

  const visibleSections = useMemo(() =>
    SECTIONS
      .map(s => ({ ...s, tabs: s.tabs.filter(t => !isTabBlocked(`admin-hub:${t.id}`)) }))
      .filter(s => s.tabs.length > 0),
    [isTabBlocked],
  );
  const visibleAllTabs = useMemo(() =>
    visibleSections.flatMap(s => s.tabs.map(t => ({ ...t, sectionId: s.id }))),
    [visibleSections],
  );

  const _defaultAdm: AdminTab = (
    (_savedAdm && visibleAllTabs.find(t => t.id === _savedAdm)) ? _savedAdm : (visibleAllTabs[0]?.id ?? DEFAULT_TAB)
  ) as AdminTab;
  const activeTab: AdminTab = (visibleAllTabs.find(t => t.id === rawTab) ? rawTab : _defaultAdm) as AdminTab;

  useEffect(() => {
    if (activeTab !== 'role-management') return;
    localStorage.setItem('hub_last_tab_admin', 'users');
    navigate('/role-management', { replace: true });
  }, [activeTab, navigate]);

  const activeTabDef = ALL_TABS.find(t => t.id === activeTab) ?? ALL_TABS[0];
  const activeSection = visibleSections.find(s => s.id === activeTabDef.sectionId) ?? visibleSections[0] ?? null;

  const setTab = (tab: string) => {
    const nextTab = tab as AdminTab;
    localStorage.setItem('hub_last_tab_admin', nextTab);
    const next = new URLSearchParams(params);
    next.set('tab', nextTab);
    setParams(next, { replace: true });
  };

  const Panel = activeTab in PanelMap ? PanelMap[activeTab] : null;

  if (!activeSection) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Shield className="h-8 w-8 opacity-40" />
        <p>No Administration Hub pages are available for your access profile.</p>
      </div>
    );
  }

  return (
    <HubLayout
      title="Administration Hub"
      subtitle="People · Organisation · System"
      hubIcon={Settings}
      sections={visibleSections}
      activeSectionId={activeSection.id}
      activeTabId={activeTab}
      activeTabDescription={activeTabDef.description}
      tourSlug="admin-hub"
      onSectionClick={id => setTab(id)}
      onTabClick={id => setTab(id)}
    >
      <Suspense fallback={<Spinner />}>
        {Panel ? <Panel /> : null}
      </Suspense>
    </HubLayout>
  );
}
