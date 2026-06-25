import { Suspense, lazy, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, LayoutDashboard, FolderOpen, GitBranch, RotateCcw, Settings2, Banknote, FileBarChart2, Users } from 'lucide-react';
import { HubLayout } from '@/components/ui/hub-layout';

const OverviewPanel        = lazy(() => import('./PreFundingOverview'));
const RegistryPanel        = lazy(() => import('./PreFundingRegistry'));
const ApprovalFlowPanel    = lazy(() => import('./PreFundingApprovalFlow'));
const ReconciliationPanel  = lazy(() => import('./PreFundingReconciliation'));
const SettingsPanel        = lazy(() => import('./PreFundingSettings'));
const ReportPanel          = lazy(() => import('./PreFundingReport'));
const AllocationsPanel     = lazy(() => import('./PreFundingAllocations'));

type PFTab = 'overview' | 'registry' | 'approvals' | 'reconciliation' | 'allocations' | 'settings' | 'report';

type SectionDef = { id: string; label: string; icon: React.ElementType; color: string; description: string; tabs: { id: string; label: string; icon: React.ElementType; description: string }[] };

const SECTIONS: SectionDef[] = [
  {
    id: 'main',
    label: 'Pre-Funding',
    icon: Banknote,
    color: '#0369a1',
    description: 'Manage incoming pre-funds, track balances, and reconcile periods.',
    tabs: [
      {
        id: 'overview',
        label: 'Balance Dashboard',
        icon: LayoutDashboard,
        description: 'Multi-currency fund balance dashboard — active funds, available balances, committed amounts, exhaustion projections, and ending-soon alerts.',
      },
      {
        id: 'registry',
        label: 'Fund Registry',
        icon: FolderOpen,
        description: 'Create, edit, and manage pre-fund requests. Includes receipt upload, donor statement PDF export, and auto-renewal configuration.',
      },
      {
        id: 'approvals',
        label: 'Approval Flow Manager',
        icon: GitBranch,
        description: 'Build per-fund approval chains, assign approvers to each step, reorder steps, and monitor the approval status of all pending funds.',
      },
      {
        id: 'reconciliation',
        label: 'Reconciliation',
        icon: RotateCcw,
        description: 'Reconcile transactions against each pre-fund period, choose surplus actions, close periods with GL postings, and export full PDF reconciliation reports.',
      },
      {
        id: 'allocations',
        label: 'Allocation Dashboard',
        icon: Users,
        description: 'Per-staff fund allocation tracker — see how much each person was assigned, how much they spent, and what remains across all active funds.',
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: Settings2,
        description: 'Configure system-wide defaults, period types, GL account mappings, currency settings, auto-renewal rules, bank API feed, and integration toggles.',
      },
      {
        id: 'report',
        label: 'Report',
        icon: FileBarChart2,
        description: 'Comprehensive pre-funding report with KPI cards, utilization charts, fund-by-fund breakdown, transaction history, approval chain status, and PDF/Excel export.',
      },
    ],
  },
];

function PanelLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin opacity-30" />
      <span className="text-sm font-medium">Loading…</span>
    </div>
  );
}

const ALL_TABS = SECTIONS.flatMap(s => s.tabs);
const DEFAULT_TAB: PFTab = 'overview';
const LS_KEY = 'hub_last_tab_prefunding';

export default function PreFundingHub() {
  const [params, setParams] = useSearchParams();

  const rawTab = params.get('tab') ?? '';
  const tabDef = ALL_TABS.find(t => t.id === rawTab);
  const savedTab = localStorage.getItem(LS_KEY) as PFTab | null;
  const fallback: PFTab = savedTab && ALL_TABS.some(t => t.id === savedTab) ? savedTab : DEFAULT_TAB;
  const tab: PFTab = tabDef ? (rawTab as PFTab) : fallback;

  const setTab = (t: string) => {
    localStorage.setItem(LS_KEY, t);
    setParams({ tab: t }, { replace: true });
  };

  useEffect(() => {
    if (rawTab && tab !== rawTab) setParams({ tab }, { replace: true });
  }, [rawTab, tab]);

  const activeTabDef = ALL_TABS.find(t => t.id === tab)!;

  return (
    <HubLayout
      title="Pre-Funding"
      subtitle="Balance Dashboard · Fund Registry · Approvals · Reconciliation · Settings"
      hubIcon={Banknote}
      sections={SECTIONS}
      activeSectionId="main"
      activeTabId={tab}
      activeTabDescription={activeTabDef?.description ?? ''}
      quickLinks={['dashboard', 'accounting', 'finance-hub', 'approvals']}
      onSectionClick={() => setTab('overview')}
      onTabClick={id => setTab(id)}
    >
      <div className="min-h-[calc(100vh-160px)]">
        {tab === 'overview'        && <Suspense fallback={<PanelLoader />}><OverviewPanel /></Suspense>}
        {tab === 'registry'        && <Suspense fallback={<PanelLoader />}><RegistryPanel /></Suspense>}
        {tab === 'approvals'       && <Suspense fallback={<PanelLoader />}><ApprovalFlowPanel /></Suspense>}
        {tab === 'reconciliation'  && <Suspense fallback={<PanelLoader />}><ReconciliationPanel /></Suspense>}
        {tab === 'allocations'     && <Suspense fallback={<PanelLoader />}><AllocationsPanel /></Suspense>}
        {tab === 'settings'        && <Suspense fallback={<PanelLoader />}><SettingsPanel /></Suspense>}
        {tab === 'report'          && <Suspense fallback={<PanelLoader />}><ReportPanel /></Suspense>}
      </div>
    </HubLayout>
  );
}
