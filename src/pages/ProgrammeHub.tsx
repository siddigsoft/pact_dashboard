import { Suspense, lazy, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, FolderKanban, LayoutDashboard, BarChart3, Database,
  Building2, ClipboardList, TrendingUp, Info, ArrowRight,
} from 'lucide-react';
import { HubLayout } from '@/components/ui/hub-layout';
import { cn } from '@/lib/utils';

const ProjectsPanel       = lazy(() => import('./Projects'));
const PortfolioPanel      = lazy(() => import('./PortfolioDashboard'));
const AnalyticsPanel      = lazy(() => import('./ProjectAnalytics'));
const MMPPanel            = lazy(() => import('./MMP'));
const HubOpsPanel         = lazy(() => import('./HubOperations'));
const TrackerPanel        = lazy(() => import('./TrackerPreparationPlan'));

type ProgSection = 'projects' | 'planning';
type ProgTab = 'projects' | 'portfolio' | 'analytics' | 'mmp' | 'hub-ops' | 'tracker-prep';

interface TabDef { id: ProgTab; label: string; icon: React.ElementType; description: string }
interface SectionDef { id: ProgSection; label: string; icon: React.ElementType; color: string; description: string; tabs: TabDef[] }

const SECTIONS: SectionDef[] = [
  {
    id: 'projects', label: 'Projects & Portfolio', icon: FolderKanban, color: '#7c3aed',
    description: 'Manage the full project lifecycle and view the director-level portfolio view.',
    tabs: [
      {
        id: 'projects', label: 'Projects', icon: FolderKanban,
        description: 'Full project list across all 10 project types — create, search, filter by status or type, and drill into any project for details, tasks, milestones, and team.',
      },
      {
        id: 'portfolio', label: 'Portfolio Dashboard', icon: LayoutDashboard,
        description: 'Executive-level cross-project view with live KPI cards, a Health Matrix, and Financial, Milestones, Pipeline, and Project Mix analysis tabs.',
      },
      {
        id: 'analytics', label: 'Project Analytics', icon: BarChart3,
        description: 'Cross-project analytics covering budget utilisation, task completion rates, financial burn, and operational performance trends across all active projects.',
      },
    ],
  },
  {
    id: 'planning', label: 'Field Planning', icon: Database, color: '#059669',
    description: 'Plan and coordinate field monitoring cycles, hub-level operations, and data collection readiness.',
    tabs: [
      {
        id: 'mmp', label: 'MMP Management', icon: Database,
        description: 'Manage Monthly Monitoring Plans — create and assign site visits, track cycle progress, review data collection status, and close cycles with approval workflows.',
      },
      {
        id: 'hub-ops', label: 'Hub Operations', icon: Building2,
        description: 'View and manage field hub configurations — hub boundaries, assigned sites, coordinator assignments, and operational readiness for each hub location.',
      },
      {
        id: 'tracker-prep', label: 'Tracker Preparation', icon: ClipboardList,
        description: 'Prepare and finalise the data collection tracker for upcoming MMP cycles — upload site lists, configure indicators, and validate readiness before cycle launch.',
      },
    ],
  },
];

const LS_KEY = 'hub_last_tab_programme';
const ALL_TABS = SECTIONS.flatMap(s => s.tabs.map(t => ({ ...t, sectionId: s.id as ProgSection, sectionColor: s.color })));

const PanelMap: Record<ProgTab, React.LazyExoticComponent<any>> = {
  projects:     ProjectsPanel,
  portfolio:    PortfolioPanel,
  analytics:    AnalyticsPanel,
  mmp:          MMPPanel,
  'hub-ops':    HubOpsPanel,
  'tracker-prep': TrackerPanel,
};

function PanelLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin opacity-30" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

export default function ProgrammeHub() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') ?? '';
  const tabDef = ALL_TABS.find(t => t.id === rawTab);

  const getDefaultTab = (): ProgTab | null => {
    const saved = localStorage.getItem(LS_KEY) as ProgTab | null;
    if (saved && ALL_TABS.some(t => t.id === saved)) return saved;
    return null;
  };

  const activeTab: ProgTab | null = tabDef ? (rawTab as ProgTab) : getDefaultTab();

  useEffect(() => {
    if (!rawTab && activeTab) setParams({ tab: activeTab }, { replace: true });
  }, []);

  const setTab = (t: ProgTab) => {
    localStorage.setItem(LS_KEY, t);
    setParams({ tab: t }, { replace: true });
  };

  const activeTabDef = activeTab ? ALL_TABS.find(t => t.id === activeTab)! : null;
  const activeSection = activeTabDef ? SECTIONS.find(s => s.id === activeTabDef.sectionId)! : null;
  const accent = activeSection?.color ?? '#7c3aed';

  const overviewContent = (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <p className="text-sm text-muted-foreground mb-6">Select a section to get started, or jump directly to any tool below.</p>
      <div className="grid gap-5 sm:grid-cols-2">
        {SECTIONS.map(section => (
          <div
            key={section.id}
            className="bg-card rounded-2xl border border-border p-6 cursor-pointer hover:shadow-lg transition-shadow group"
            onClick={() => setTab(section.tabs[0].id)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: section.color + '18' }}>
                  <section.icon className="h-5 w-5" style={{ color: section.color }} />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-[15px]">{section.label}</h3>
                  <p className="text-xs text-muted-foreground">{section.tabs.length} tools</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors mt-1" />
            </div>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{section.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {section.tabs.map(t => (
                <button
                  key={t.id}
                  onClick={e => { e.stopPropagation(); setTab(t.id); }}
                  className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:border-current transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <HubLayout
      title="Programme Management"
      subtitle="Projects · Portfolio · Field Planning"
      hubIcon={TrendingUp}
      sections={SECTIONS}
      activeSectionId={activeSection?.id ?? null}
      activeTabId={activeTab}
      activeTabDescription={activeTabDef?.description ?? null}
      quickLinks={['dashboard', 'field-ops', 'analytics-hub', 'my-tasks']}
      onSectionClick={id => setTab(id as ProgTab)}
      onTabClick={id => setTab(id as ProgTab)}
      overviewContent={overviewContent}
    >
      {activeTab && (
        <div className="min-h-[calc(100vh-160px)]">
          <Suspense fallback={<PanelLoader />}>
            {(() => { const Panel = PanelMap[activeTab]; return <Panel />; })()}
          </Suspense>
        </div>
      )}
    </HubLayout>
  );
}
