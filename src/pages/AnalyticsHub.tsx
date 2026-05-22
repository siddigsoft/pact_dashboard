import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, Download, Eye, BarChart3, FileText, Archive,
  PieChart, LayoutDashboard, TrendingUp, Info,
} from 'lucide-react';
import { HubLayout } from '@/components/ui/hub-layout';
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
    <HubLayout
      title="Analytics Hub"
      subtitle="Data & Reports · Dashboards"
      hubIcon={PieChart}
      sections={SECTIONS}
      activeSectionId={activeSection.id}
      activeTabId={activeTab}
      activeTabDescription={activeTabDef.description}
      quickLinks={['dashboard', 'projects', 'portfolio', 'reports']}
      onSectionClick={id => setTab(id as ATab)}
      onTabClick={id => setTab(id as ATab)}
    >
      <Suspense fallback={<Spinner />}>
        <Panel />
      </Suspense>
    </HubLayout>
  );
}
