import { Suspense, lazy, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, Handshake, Building2, Users, MessageSquare, TrendingUp,
  LayoutDashboard, Info, ArrowRight,
} from 'lucide-react';
import { HubLayout } from '@/components/ui/hub-layout';
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
      title="CRM"
      subtitle="Partner & Pipeline Management"
      hubIcon={Handshake}
      sections={SECTIONS}
      activeSectionId={activeSection?.id ?? null}
      activeTabId={activeTab}
      activeTabDescription={activeTabDef?.description ?? null}
      quickLinks={['dashboard', 'projects', 'communication', 'my-tasks']}
      onSectionClick={id => setTab(id as CRMTab)}
      onTabClick={id => setTab(id as CRMTab)}
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
