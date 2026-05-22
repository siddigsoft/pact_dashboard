import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, Users, Shield, Lock, Building2, Award, DollarSign,
  CheckSquare, ClipboardList, Settings, Activity, Info,
} from 'lucide-react';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { cn } from '@/lib/utils';

const UsersPanel              = lazy(() => import('./Users'));
const RoleManagementPanel     = lazy(() => import('./RoleManagement'));
const PageAccessPanel         = lazy(() => import('./PageAccessControl'));
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
  | 'users' | 'role-management' | 'page-access' | 'departments' | 'hub-management'
  | 'classifications' | 'classification-fees' | 'task-admin' | 'project-flow-stages'
  | 'settings' | 'audit-compliance' | 'system-monitoring';

interface TabDef { id: AdminTab; label: string; icon: React.ElementType; description: string }
interface SectionDef { id: AdminSection; label: string; icon: React.ElementType; color: string; description: string; tabs: TabDef[] }

const SECTIONS: SectionDef[] = [
  {
    id: 'people', label: 'People & Access', icon: Users, color: '#1d4ed8',
    description: 'Manage users, roles, access permissions, departments, and hub structures.',
    tabs: [
      {
        id: 'users', label: 'User Management', icon: Users,
        description: 'Create, edit, and deactivate user accounts — assign roles, set hub affiliations, manage profile details, and view login history.',
      },
      {
        id: 'role-management', label: 'Role Management', icon: Shield,
        description: 'Define and configure roles — set default permissions for each role, manage role hierarchies, and control which modules each role can access.',
      },
      {
        id: 'page-access', label: 'Page Access Control', icon: Lock,
        description: 'Override page visibility on a per-user basis — grant or block specific pages independently of role defaults for individual staff.',
      },
      {
        id: 'departments', label: 'Departments', icon: Building2,
        description: 'Manage organisational departments — create department entries, assign staff, and link departments to hubs for reporting and filtering.',
      },
      {
        id: 'hub-management', label: 'Hub Management', icon: Building2,
        description: 'Configure hubs and sub-hubs — define geographic coverage areas, assign hub managers, set operational parameters, and manage locality lists.',
      },
    ],
  },
  {
    id: 'organisation', label: 'Organisation', icon: ClipboardList, color: '#b45309',
    description: 'Configure classification schemes, fee structures, task templates, and project workflow stages.',
    tabs: [
      {
        id: 'classifications', label: 'Classifications', icon: Award,
        description: 'Manage data collector and staff classification levels — define grade names, criteria, and the classification hierarchy used across modules.',
      },
      {
        id: 'classification-fees', label: 'Classification Fees', icon: DollarSign,
        description: 'Set daily or per-visit fee rates per classification level — these rates are used to calculate transportation advances and cost submissions.',
      },
      {
        id: 'task-admin', label: 'Task Admin', icon: CheckSquare,
        description: 'Admin overview of all tasks across the organisation — bulk-assign tasks, manage templates, set recurring rules, and view payroll-ready completion data.',
      },
      {
        id: 'project-flow-stages', label: 'Project Flow Stages', icon: ClipboardList,
        description: 'Configure the lifecycle stages for each project type — add, rename, or reorder stages and set which are mandatory or skippable.',
      },
    ],
  },
  {
    id: 'system', label: 'System', icon: Settings, color: '#4b5563',
    description: 'System-wide settings, compliance monitoring, and platform performance dashboards.',
    tabs: [
      {
        id: 'settings', label: 'Settings', icon: Settings,
        description: 'Global platform settings — notification channels, integration configurations, branding, language defaults, and system-wide behaviour toggles.',
      },
      {
        id: 'audit-compliance', label: 'Audit & Compliance', icon: Shield,
        description: 'Review compliance status across modules — flag overdue approvals, missing documentation, and policy violations with severity ratings and resolution tracking.',
      },
      {
        id: 'system-monitoring', label: 'System Monitoring', icon: Activity,
        description: 'Live platform health dashboard — active user sessions, API response times, background job queues, error rates, and recent system events.',
      },
    ],
  },
];

const ALL_TABS = SECTIONS.flatMap(s => s.tabs.map(t => ({ ...t, sectionId: s.id, sectionColor: s.color })));
const DEFAULT_TAB: AdminTab = 'users';

const PanelMap: Record<AdminTab, React.LazyExoticComponent<any>> = {
  'users': UsersPanel,
  'role-management': RoleManagementPanel,
  'page-access': PageAccessPanel,
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
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') as AdminTab | null;
  const _savedAdm = localStorage.getItem('hub_last_tab_admin') as AdminTab | null;
  const _defaultAdm: AdminTab = (_savedAdm && ALL_TABS.find(t => t.id === _savedAdm)) ? _savedAdm : DEFAULT_TAB;
  const activeTab: AdminTab = ALL_TABS.find(t => t.id === rawTab) ? (rawTab as AdminTab) : _defaultAdm;

  const activeTabDef = ALL_TABS.find(t => t.id === activeTab)!;
  const activeSection = SECTIONS.find(s => s.id === activeTabDef.sectionId)!;

  const setTab = (tab: AdminTab) => {
    localStorage.setItem('hub_last_tab_admin', tab);
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  };

  const Panel = PanelMap[activeTab];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="sticky top-0 z-30 bg-gray-900 text-white shadow-lg">
        <div className="px-4 pt-4 pb-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Administration Hub</h1>
              <p className="text-gray-400 text-xs mt-0.5">People & Access · Organisation · System</p>
            </div>
            <ConnectedPagesBar currentPath="/admin" className="hidden md:flex" />
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setTab(s.tabs[0].id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  activeSection.id === s.id
                    ? 'text-white shadow-md'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20',
                )}
                style={activeSection.id === s.id ? { backgroundColor: s.color } : undefined}
              >
                <s.icon className="h-3 w-3" />
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1 overflow-x-auto pb-0 scrollbar-none">
            {activeSection.tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-all',
                  activeTab === tab.id
                    ? 'border-white text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500',
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="px-4 py-2.5 flex items-start gap-2 text-white text-xs border-b"
        style={{ backgroundColor: activeSection.color + 'dd' }}
      >
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-80" />
        <span className="opacity-90">{activeTabDef.description}</span>
      </div>

      <div className="flex-1">
        <Suspense fallback={<Spinner />}>
          <Panel />
        </Suspense>
      </div>
    </div>
  );
}
