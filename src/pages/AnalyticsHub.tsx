import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, Download, Eye, BarChart3, FileText, Archive,
  PieChart, LayoutDashboard, TrendingUp, Info,
} from 'lucide-react';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { cn } from '@/lib/utils';

const DataExportCenterPanel    = lazy(() => import('./DataExportCenter'));
const DataVisibilityPanel      = lazy(() => import('./DataVisibility'));
const ReportsPanel             = lazy(() => import('./Reports'));
const DocumentsPanel           = lazy(() => import('./Documents'));
const ArchivePanel             = lazy(() => import('./Archive'));
const QuestionnairePanel       = lazy(() => import('./QuestionnaireAnalytics'));
const DCTPDMPanel              = lazy(() => import('./DCTPDMDashboard'));
const ExecutiveDashboardPanel  = lazy(() => import('./ExecutiveDashboard'));

type ASection = 'data' | 'dashboards';
type ATab =
  | 'data-export-center' | 'data-visibility' | 'reports' | 'documents' | 'archive'
  | 'questionnaire-analytics' | 'dct-pdm' | 'executive';

interface TabDef { id: ATab; label: string; icon: React.ElementType; description: string }
interface SectionDef { id: ASection; label: string; icon: React.ElementType; color: string; description: string; tabs: TabDef[] }

const SECTIONS: SectionDef[] = [
  {
    id: 'data', label: 'Data & Reports', icon: BarChart3, color: '#7c3aed',
    description: 'Export raw data, manage document storage, generate programme reports, and access the archive.',
    tabs: [
      {
        id: 'data-export-center', label: 'Data Export Center', icon: Download,
        description: 'Export any dataset — site visits, financials, HR records, survey responses — in CSV or Excel format with custom date and field filters.',
      },
      {
        id: 'data-visibility', label: 'Data Visibility', icon: Eye,
        description: 'Control which data fields and records are visible to each role or user — configure row-level and column-level visibility rules across modules.',
      },
      {
        id: 'reports', label: 'Reports', icon: BarChart3,
        description: 'Generate pre-built operational reports — site visit summaries, MMP progress, staff activity, and financial overviews — with date range filtering.',
      },
      {
        id: 'documents', label: 'Documents', icon: FileText,
        description: 'Central document repository — upload, organize, and share files across teams with folder structure, version history, and access controls.',
      },
      {
        id: 'archive', label: 'Archive', icon: Archive,
        description: 'Access closed cycles, completed projects, and historical records in read-only archive mode — search, filter, and export archived data.',
      },
    ],
  },
  {
    id: 'dashboards', label: 'Dashboards', icon: LayoutDashboard, color: '#0891b2',
    description: 'High-level analytical dashboards for data quality monitoring, PDM insights, and executive-level KPIs.',
    tabs: [
      {
        id: 'questionnaire-analytics', label: 'Questionnaire Analytics', icon: PieChart,
        description: 'Analyse survey and questionnaire response data — response rates, question-level breakdowns, skip patterns, and completion trends over time.',
      },
      {
        id: 'dct-pdm', label: 'DCT PDM Dashboard', icon: TrendingUp,
        description: 'Data collection team post-distribution monitoring dashboard — track distribution coverage, beneficiary reach, and follow-up verification status.',
      },
      {
        id: 'executive', label: 'Executive Dashboard', icon: LayoutDashboard,
        description: 'Director-level KPI overview — programme reach, budget utilization, staff deployment, cycle health scores, and cross-hub performance comparisons.',
      },
    ],
  },
];

const ALL_TABS = SECTIONS.flatMap(s => s.tabs.map(t => ({ ...t, sectionId: s.id, sectionColor: s.color })));
const DEFAULT_TAB: ATab = 'data-export-center';

const PanelMap: Record<ATab, React.LazyExoticComponent<any>> = {
  'data-export-center': DataExportCenterPanel,
  'data-visibility': DataVisibilityPanel,
  'reports': ReportsPanel,
  'documents': DocumentsPanel,
  'archive': ArchivePanel,
  'questionnaire-analytics': QuestionnairePanel,
  'dct-pdm': DCTPDMPanel,
  'executive': ExecutiveDashboardPanel,
};

const Spinner = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function AnalyticsHub() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') as ATab | null;
  const _savedAn = localStorage.getItem('hub_last_tab_analytics') as ATab | null;
  const _defaultAn: ATab = (_savedAn && ALL_TABS.find(t => t.id === _savedAn)) ? _savedAn : DEFAULT_TAB;
  const activeTab: ATab = ALL_TABS.find(t => t.id === rawTab) ? (rawTab as ATab) : _defaultAn;

  const activeTabDef = ALL_TABS.find(t => t.id === activeTab)!;
  const activeSection = SECTIONS.find(s => s.id === activeTabDef.sectionId)!;

  const setTab = (tab: ATab) => {
    localStorage.setItem('hub_last_tab_analytics', tab);
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
              <h1 className="text-xl font-bold tracking-tight">Analytics Hub</h1>
              <p className="text-gray-400 text-xs mt-0.5">Data & Reports · Dashboards</p>
            </div>
            <ConnectedPagesBar pages={['dashboard', 'projects', 'portfolio', 'reports']} className="hidden md:flex" />
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
