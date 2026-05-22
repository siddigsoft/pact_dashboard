import { Suspense, lazy, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, MessageSquare, Phone, FileSignature, Megaphone,
  Smartphone, MessageCircle, Info, ArrowRight,
} from 'lucide-react';
import { HubLayout } from '@/components/ui/hub-layout';
import { cn } from '@/lib/utils';

const ChatPanel       = lazy(() => import('./Chat'));
const CallsPanel      = lazy(() => import('./Calls'));
const SignaturesPanel = lazy(() => import('./Signatures'));
const BroadcastPanel  = lazy(() => import('./AdminBroadcast'));
const WhatsAppPanel   = lazy(() => import('./AdminWhatsApp'));

type CommSection = 'team' | 'admin';
type CommTab = 'chat' | 'calls' | 'signatures' | 'broadcast' | 'whatsapp';

interface TabDef { id: CommTab; label: string; icon: React.ElementType; description: string }
interface SectionDef { id: CommSection; label: string; icon: React.ElementType; color: string; description: string; tabs: TabDef[] }

const SECTIONS: SectionDef[] = [
  {
    id: 'team', label: 'Team Communication', icon: MessageSquare, color: '#6366f1',
    description: 'Real-time messaging, video calls, and document signatures for the whole team.',
    tabs: [
      {
        id: 'chat', label: 'Chat', icon: MessageSquare,
        description: 'Real-time messaging with colleagues — one-on-one and group conversations, file sharing, mentions, and message reactions for the full team.',
      },
      {
        id: 'calls', label: 'Calls', icon: Phone,
        description: 'Initiate and receive video or audio calls with team members, with call history, scheduling, and connection quality monitoring.',
      },
      {
        id: 'signatures', label: 'Signatures', icon: FileSignature,
        description: 'Create, request, and track digital document signatures — send documents for sign-off, monitor completion status, and download signed copies.',
      },
    ],
  },
  {
    id: 'admin', label: 'Admin Tools', icon: Megaphone, color: '#0284c7',
    description: 'Admin-only tools for mass outreach and managing the WhatsApp notification channel.',
    tabs: [
      {
        id: 'broadcast', label: 'Broadcast Center', icon: Megaphone,
        description: 'Send targeted announcements to selected staff groups or all users — compose rich-text broadcasts, schedule delivery, and track open rates.',
      },
      {
        id: 'whatsapp', label: 'WhatsApp Admin', icon: Smartphone,
        description: 'Manage the organisational WhatsApp notification channel — configure connection, manage per-user opt-in settings, and view delivery logs.',
      },
    ],
  },
];

const LS_KEY = 'hub_last_tab_communication';
const ALL_TABS = SECTIONS.flatMap(s => s.tabs.map(t => ({ ...t, sectionId: s.id as CommSection, sectionColor: s.color })));

const PanelMap: Record<CommTab, React.LazyExoticComponent<any>> = {
  chat:       ChatPanel,
  calls:      CallsPanel,
  signatures: SignaturesPanel,
  broadcast:  BroadcastPanel,
  whatsapp:   WhatsAppPanel,
};

function PanelLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin opacity-30" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

export default function CommunicationHub() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') ?? '';
  const tabDef = ALL_TABS.find(t => t.id === rawTab);

  const getDefaultTab = (): CommTab | null => {
    const saved = localStorage.getItem(LS_KEY) as CommTab | null;
    if (saved && ALL_TABS.some(t => t.id === saved)) return saved;
    return null;
  };

  const activeTab: CommTab | null = tabDef ? (rawTab as CommTab) : getDefaultTab();

  useEffect(() => {
    if (!rawTab && activeTab) setParams({ tab: activeTab }, { replace: true });
  }, []);

  const setTab = (t: CommTab) => {
    localStorage.setItem(LS_KEY, t);
    setParams({ tab: t }, { replace: true });
  };

  const activeTabDef = activeTab ? ALL_TABS.find(t => t.id === activeTab)! : null;
  const activeSection = activeTabDef ? SECTIONS.find(s => s.id === activeTabDef.sectionId)! : null;
  const accent = activeSection?.color ?? '#6366f1';

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
      title="Communication"
      subtitle="Chat · Calls · Signatures · Broadcasts"
      hubIcon={MessageCircle}
      sections={SECTIONS}
      activeSectionId={activeSection?.id ?? null}
      activeTabId={activeTab}
      activeTabDescription={activeTabDef?.description ?? null}
      quickLinks={['dashboard', 'my-tasks', 'admin', 'projects']}
      onSectionClick={id => setTab(id as CommTab)}
      onTabClick={id => setTab(id as CommTab)}
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
