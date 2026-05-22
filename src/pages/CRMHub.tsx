import { Suspense, lazy, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, Handshake, Building2, Users, MessageSquare, TrendingUp,
  LayoutDashboard, Info, ArrowRight,
} from 'lucide-react';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { cn } from '@/lib/utils';

const CRMDashboardPanel   = lazy(() => import('./CRMDashboard'));
const CRMPartnersPanel    = lazy(() => import('./CRMPartners'));
const CRMContactsPanel    = lazy(() => import('./CRMContacts'));
const CRMEngagementsPanel = lazy(() => import('./CRMEngagements'));
const CRMPipelinePanel    = lazy(() => import('./CRMOpportunities'));

type CRMSection = 'network' | 'pipeline';
type CRMTab = 'dashboard' | 'partners' | 'contacts' | 'engagements' | 'pipeline';

interface TabDef { id: CRMTab; label: string; icon: React.ElementType; description: string }
interface SectionDef { id: CRMSection; label: string; icon: React.ElementType; color: string; description: string; tabs: TabDef[] }

const SECTIONS: SectionDef[] = [
  {
    id: 'network', label: 'Overview & Network', icon: Building2, color: '#0891b2',
    description: 'Monitor overall CRM health and manage your partner and contact records.',
    tabs: [
      {
        id: 'dashboard', label: 'CRM Dashboard', icon: LayoutDashboard,
        description: 'At-a-glance summary of partners, contacts, open opportunities, pipeline value, and recent engagement activity across all relationships.',
      },
      {
        id: 'partners', label: 'Partners & Donors', icon: Building2,
        description: 'Manage the full partner registry — contact details, partner type (donor, NGO, government), status, associated projects, and compliance notes.',
      },
      {
        id: 'contacts', label: 'Contacts', icon: Users,
        description: 'Maintain individual contacts linked to partner organisations — name, title, email, phone, and their role in ongoing engagements.',
      },
    ],
  },
  {
    id: 'pipeline', label: 'Pipeline & Engagement', icon: TrendingUp, color: '#d97706',
    description: 'Track active engagement activities and manage your funding and partnership pipeline.',
    tabs: [
      {
        id: 'engagements', label: 'Engagements', icon: MessageSquare,
        description: 'Log and review every engagement with a partner — meetings, calls, emails, and visits — with notes, outcomes, and follow-up actions.',
      },
      {
        id: 'pipeline', label: 'Pipeline', icon: TrendingUp,
        description: 'Manage funding and partnership opportunities through stages from prospect to won — with pipeline value, probability, and linked project conversions.',
      },
    ],
  },
];

const LS_KEY = 'hub_last_tab_crm';
const ALL_TABS = SECTIONS.flatMap(s => s.tabs.map(t => ({ ...t, sectionId: s.id as CRMSection, sectionColor: s.color })));

const PanelMap: Record<CRMTab, React.LazyExoticComponent<any>> = {
  dashboard:   CRMDashboardPanel,
  partners:    CRMPartnersPanel,
  contacts:    CRMContactsPanel,
  engagements: CRMEngagementsPanel,
  pipeline:    CRMPipelinePanel,
};

function PanelLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin opacity-30" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

export default function CRMHub() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') ?? '';
  const tabDef = ALL_TABS.find(t => t.id === rawTab);

  const getDefaultTab = (): CRMTab | null => {
    const saved = localStorage.getItem(LS_KEY) as CRMTab | null;
    if (saved && ALL_TABS.some(t => t.id === saved)) return saved;
    return null;
  };

  const activeTab: CRMTab | null = tabDef ? (rawTab as CRMTab) : getDefaultTab();

  useEffect(() => {
    if (!rawTab && activeTab) setParams({ tab: activeTab }, { replace: true });
  }, []);

  const setTab = (t: CRMTab) => {
    localStorage.setItem(LS_KEY, t);
    setParams({ tab: t }, { replace: true });
  };

  const activeTabDef = activeTab ? ALL_TABS.find(t => t.id === activeTab)! : null;
  const activeSection = activeTabDef ? SECTIONS.find(s => s.id === activeTabDef.sectionId)! : null;
  const accent = activeSection?.color ?? '#0891b2';

  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-[#0d1117]">

      {/* Header */}
      <div className="sticky top-0 z-30" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #111827 60%, #0f2240 100%)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">

          <div className="pt-3 pb-1 opacity-90">
            <ConnectedPagesBar pages={['dashboard', 'projects', 'communication', 'my-tasks']} />
          </div>

          {/* Title + section pills */}
          <div className="flex items-center justify-between pt-3 pb-2 gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent + '22' }}>
                <Handshake className="h-5 w-5" style={{ color: accent }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white leading-tight tracking-tight">CRM</h1>
                <p className="text-xs font-medium" style={{ color: accent }}>
                  {activeSection ? `${activeSection.label} · ${activeTabDef?.label}` : 'Partner & Pipeline Management'}
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
                    data-testid={`crm-section-${s.id}`}
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

          {/* Sub-tab strip */}
          {activeSection && (
            <div className="flex gap-0 overflow-x-auto scrollbar-hide -mb-px">
              {activeSection.tabs.map(t => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    data-testid={`crm-tab-${t.id}`}
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

      {/* Description banner */}
      {activeTabDef && (
        <div className="border-b" style={{ background: accent + '0d', borderColor: accent + '25' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-start gap-2.5">
            <Info className="h-4 w-4 mt-0.5 shrink-0 opacity-60" style={{ color: accent }} />
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">{activeTabDef.description}</p>
          </div>
        </div>
      )}

      {/* Overview landing (no tab selected) */}
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
                      style={{ ['--tw-text-opacity' as any]: 1 }}
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

      {/* Panel */}
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
