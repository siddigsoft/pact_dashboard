import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, Users, Shield, Lock, Building2, Award, DollarSign,
  CheckSquare, ClipboardList, Settings, Activity, Info,
  ChevronRight,
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
interface SectionDef { id: AdminSection; label: string; icon: React.ElementType; color: string; bg: string; description: string; tabs: TabDef[] }

const SECTIONS: SectionDef[] = [
  {
    id: 'people', label: 'People & Access', icon: Users,
    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',
    description: 'Manage users, roles, access permissions, departments, and hub structures.',
    tabs: [
      { id: 'users',          label: 'User Management',    icon: Users,      description: 'Create, edit, and deactivate user accounts — assign roles, set hub affiliations, manage profile details, and view login history.' },
      { id: 'role-management',label: 'Role Management',    icon: Shield,     description: 'Define and configure roles — set default permissions for each role, manage role hierarchies, and control which modules each role can access.' },
      { id: 'page-access',    label: 'Page Access',        icon: Lock,       description: 'Override page visibility on a per-user basis — grant or block specific pages independently of role defaults for individual staff.' },
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
      { id: 'task-admin',           label: 'Task Admin',          icon: CheckSquare,  description: 'Admin overview of all tasks across the organisation — bulk-assign, manage templates, set recurring rules, and view payroll-ready completion data.' },
      { id: 'project-flow-stages',  label: 'Project Flow Stages', icon: ClipboardList,description: 'Configure lifecycle stages for each project type — add, rename, or reorder stages and set which are mandatory or skippable.' },
    ],
  },
  {
    id: 'system', label: 'System', icon: Settings,
    color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',
    description: 'System-wide settings, compliance monitoring, and platform performance dashboards.',
    tabs: [
      { id: 'settings',         label: 'Settings',          icon: Settings, description: 'Global platform settings — notification channels, integration configs, branding, language defaults, and system-wide behaviour toggles.' },
      { id: 'audit-compliance', label: 'Audit & Compliance', icon: Shield,   description: 'Review compliance status — flag overdue approvals, missing documentation, and policy violations with severity ratings and resolution tracking.' },
      { id: 'system-monitoring',label: 'System Monitoring',  icon: Activity, description: 'Live platform health — active user sessions, API response times, background job queues, error rates, and recent system events.' },
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

      {/* ── Sticky composite header ── */}
      <div
        className="sticky top-0 z-30 shadow-2xl"
        style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 60%, #0f2240 100%)' }}
      >

        {/* ── Level 1: Hub identity + quick nav ── */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
              style={{ background: activeSection.color, boxShadow: `0 0 16px ${activeSection.color}55` }}
            >
              <activeSection.icon className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-[17px] font-bold text-white tracking-tight leading-tight">
                Administration Hub
              </h1>
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-400">
                {SECTIONS.map((s, i) => (
                  <span key={s.id} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="h-2.5 w-2.5 opacity-40" />}
                    <span
                      className={cn(
                        'transition-colors',
                        activeSection.id === s.id ? 'font-semibold' : 'opacity-60'
                      )}
                      style={activeSection.id === s.id ? { color: s.color } : {}}
                    >
                      {s.label}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="hidden md:block shrink-0">
            <ConnectedPagesBar currentPath="/admin" />
          </div>
        </div>

        {/* ── Level 2: Section tabs ── */}
        <div className="px-5 pt-3 flex items-end gap-1.5">
          {SECTIONS.map(s => {
            const isActive = activeSection.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setTab(s.tabs[0].id)}
                className={cn(
                  'group relative flex items-center gap-2 px-4 pt-2.5 pb-3 rounded-t-xl text-sm font-semibold',
                  'transition-all duration-150 border border-b-0',
                  isActive
                    ? 'text-white border-white/15'
                    : 'text-gray-400 border-transparent hover:text-gray-200 hover:border-white/10',
                )}
                style={isActive
                  ? { backgroundColor: s.bg, borderColor: `${s.color}40` }
                  : { backgroundColor: 'transparent' }
                }
              >
                {/* active bottom-colour accent */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                )}
                <s.icon
                  className="h-4 w-4 transition-colors"
                  style={isActive ? { color: s.color } : {}}
                />
                <span>{s.label}</span>
                <span
                  className={cn(
                    'ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1',
                    isActive ? 'text-white' : 'text-gray-500 bg-white/5'
                  )}
                  style={isActive ? { backgroundColor: `${s.color}55`, color: s.color } : {}}
                >
                  {s.tabs.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Level 3: Sub-tab strip ── */}
        <div
          className="flex items-center overflow-x-auto scrollbar-none border-t"
          style={{ borderColor: `${activeSection.color}30`, backgroundColor: `${activeSection.color}08` }}
        >
          {activeSection.tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={cn(
                  'relative flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] font-medium whitespace-nowrap',
                  'transition-all duration-100',
                  isActive
                    ? 'text-white'
                    : 'text-gray-400 hover:text-gray-200',
                )}
              >
                {isActive && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ backgroundColor: activeSection.color }}
                  />
                )}
                <tab.icon
                  className={cn('h-3.5 w-3.5 transition-colors', isActive ? 'opacity-100' : 'opacity-60')}
                  style={isActive ? { color: activeSection.color } : {}}
                />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Description strip ── */}
      <div
        className="flex items-start gap-3 px-5 py-2.5 border-b border-l-[3px]"
        style={{
          borderLeftColor: activeSection.color,
          backgroundColor: `${activeSection.color}08`,
          borderBottomColor: `${activeSection.color}20`,
        }}
      >
        <Info
          className="h-4 w-4 mt-0.5 shrink-0"
          style={{ color: activeSection.color }}
        />
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
          {activeTabDef.description}
        </p>
      </div>

      {/* ── Page content ── */}
      <div className="flex-1">
        <Suspense fallback={<Spinner />}>
          <Panel />
        </Suspense>
      </div>
    </div>
  );
}
