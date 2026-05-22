import { Suspense, lazy, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, FolderKanban, LayoutDashboard, BarChart3, Database,
  Building2, ClipboardList, TrendingUp, Info, ArrowRight,
} from 'lucide-react';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
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

  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-[#0d1117]">

      {/* Header */}
      <div className="sticky top-0 z-30" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #111827 60%, #0f2240 100%)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">

          <div className="pt-3 pb-1 opacity-90">
            <ConnectedPagesBar exclude="programme-hub" />
          </div>

          <div className="flex items-center justify-between pt-3 pb-2 gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent + '22' }}>
                <TrendingUp className="h-5 w-5" style={{ color: accent }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white leading-tight tracking-tight">Programme Management</h1>
                <p className="text-xs font-medium" style={{ color: accent }}>
                  {activeSection ? `${activeSection.label} · ${activeTabDef?.label}` : 'Projects · Portfolio · Field Planning'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {SECTIONS.map(s => {
                const SIcon = s.icon;
                const isActive = activeSection?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setTab(s.tabs[0].id)}
                    data-testid={`prog-section-${s.id}`}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border',
                      isActive
                        ? 'bg-white text-slate-900 border-white shadow-sm'
                        : 'text-blue-200/80 border-blue-200/20 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <SIcon className="h-3 w-3 shrink-0" />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {activeSection && (
            <div className="flex gap-0 overflow-x-auto scrollbar-hide -mb-px">
              {activeSection.tabs.map(t => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    data-testid={`prog-tab-${t.id}`}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap shrink-0',
                      isActive
                        ? 'border-white text-white'
                        : 'border-transparent text-blue-200/50 hover:text-blue-100 hover:border-blue-200/30'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {activeTabDef && (
        <div className="border-b" style={{ background: accent + '0d', borderColor: accent + '25' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-start gap-2.5">
            <Info className="h-4 w-4 mt-0.5 shrink-0 opacity-60" style={{ color: accent }} />
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">{activeTabDef.description}</p>
          </div>
        </div>
      )}

      {/* Overview landing */}
      {!activeTab && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Select a section to get started, or jump directly to any tool below.</p>
          <div className="grid gap-5 sm:grid-cols-2">
            {SECTIONS.map(section => (
              <div
                key={section.id}
                className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 cursor-pointer hover:shadow-lg transition-shadow group"
                onClick={() => setTab(section.tabs[0].id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: section.color + '18' }}>
                      <section.icon className="h-5 w-5" style={{ color: section.color }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white text-[15px]">{section.label}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{section.tabs.length} tools</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 transition-colors mt-1" />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">{section.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {section.tabs.map(t => (
                    <button
                      key={t.id}
                      onClick={e => { e.stopPropagation(); setTab(t.id); }}
                      className="text-xs px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-current transition-colors"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab && (
        <div className="min-h-[calc(100vh-160px)]">
          <Suspense fallback={<PanelLoader />}>
            {(() => {
              const Panel = PanelMap[activeTab];
              return <Panel />;
            })()}
          </Suspense>
        </div>
      )}
    </div>
  );
}
