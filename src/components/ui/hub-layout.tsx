import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ConnectedPagesBar } from './connected-pages-bar';
import { TourButton } from '@/components/onboarding/TourButton';

export interface HubSection {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bg?: string;
  tabs: HubTab[];
}

export interface HubTab {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
}

interface HubLayoutProps {
  title: string;
  subtitle: string;
  hubIcon: React.ElementType;
  sections: HubSection[];
  activeSectionId: string | null;
  activeTabId: string | null;
  activeTabDescription: string | null;
  quickLinks: string[];
  onSectionClick: (firstTabId: string) => void;
  onTabClick: (tabId: string) => void;
  children: React.ReactNode;
  overviewContent?: React.ReactNode;
  /** Page slug for the tour registry — shows a Tour button in the hub header */
  tourSlug?: string;
}

export function HubLayout({
  title, subtitle, hubIcon: HubIcon,
  sections, activeSectionId, activeTabId, activeTabDescription,
  quickLinks, onSectionClick, onTabClick,
  children, overviewContent, tourSlug,
}: HubLayoutProps) {
  const activeSection = sections.find(s => s.id === activeSectionId) ?? null;
  const activeTab = activeSection?.tabs.find(t => t.id === activeTabId) ?? null;
  const accent = activeSection?.color ?? sections[0]?.color ?? '#3b82f6';

  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close dropdown when section changes
  useEffect(() => { setDropOpen(false); }, [activeSectionId]);

  const handleTabSelect = (tabId: string) => {
    onTabClick(tabId);
    setDropOpen(false);
  };

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
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg transition-all duration-300"
              style={{ background: accent, boxShadow: `0 0 16px ${accent}55` }}
            >
              <HubIcon style={{ width: 18, height: 18, color: 'white' }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-[17px] font-bold text-white tracking-tight leading-tight">{title}</h1>
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-400 flex-wrap">
                {sections.map((s, i) => (
                  <span key={s.id} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="h-2.5 w-2.5 opacity-30" />}
                    <span
                      className="transition-colors"
                      style={activeSectionId === s.id ? { color: s.color, fontWeight: 600 } : { opacity: 0.5 }}
                    >
                      {s.label}
                    </span>
                  </span>
                ))}
                {sections.length === 0 && <span className="opacity-50">{subtitle}</span>}
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {tourSlug && <TourButton slug={tourSlug} variant="inline" />}
            <ConnectedPagesBar pages={quickLinks} />
          </div>
        </div>

        {/* ── Level 2: Section tabs ── */}
        <div id="tour-hub-sections" className="px-5 pt-3 flex items-end gap-1.5 overflow-x-auto scrollbar-none">
          {sections.map(s => {
            const isActive = activeSectionId === s.id;
            const bg = s.bg ?? `${s.color}1e`;
            return (
              <button
                key={s.id}
                onClick={() => onSectionClick(s.tabs[0]?.id)}
                className={cn(
                  'group relative flex items-center gap-2 px-4 pt-2.5 pb-3 rounded-t-xl text-sm font-semibold whitespace-nowrap',
                  'transition-all duration-150 border border-b-0 shrink-0',
                  isActive
                    ? 'text-white border-white/15'
                    : 'text-gray-400 border-transparent hover:text-gray-200 hover:border-white/10',
                )}
                style={isActive ? { backgroundColor: bg, borderColor: `${s.color}40` } : {}}
              >
                {isActive && (
                  <span
                    className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                )}
                <s.icon className="h-4 w-4 transition-colors shrink-0" style={isActive ? { color: s.color } : {}} />
                <span>{s.label}</span>
                <span
                  className={cn(
                    'ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1',
                    isActive ? '' : 'text-gray-500 bg-white/5',
                  )}
                  style={isActive ? { backgroundColor: `${s.color}44`, color: s.color } : {}}
                >
                  {s.tabs.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Level 3: Sub-tab dropdown bar ── */}
        {activeSection && (
          <div
            id="tour-hub-tab-bar"
            className="relative px-4 py-2 border-t flex items-center gap-3"
            style={{ borderColor: `${accent}30`, backgroundColor: `${accent}0a` }}
            ref={dropRef}
          >
            {/* Dropdown trigger button */}
            <button
              onClick={() => setDropOpen(v => !v)}
              className={cn(
                'flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 border min-w-0 flex-1 max-w-sm',
                dropOpen
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/8 hover:text-white',
              )}
            >
              {activeTab ? (
                <>
                  <activeTab.icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
                  <span className="truncate">{activeTab.label}</span>
                </>
              ) : (
                <>
                  <activeSection.icon className="h-4 w-4 shrink-0 opacity-50" />
                  <span className="text-gray-400">Select a page…</span>
                </>
              )}
              <ChevronDown
                className={cn('h-4 w-4 shrink-0 ml-auto transition-transform duration-150 opacity-60', dropOpen && 'rotate-180')}
              />
            </button>

            {/* Tab count + current position pill */}
            {activeTab && (
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-gray-400 shrink-0">
                <span
                  className="px-2 py-1 rounded-full font-medium"
                  style={{ backgroundColor: `${accent}22`, color: accent }}
                >
                  {(activeSection.tabs.findIndex(t => t.id === activeTabId) + 1)} / {activeSection.tabs.length}
                </span>
                <span className="opacity-50">{activeSection.label}</span>
              </div>
            )}

            {/* ── Dropdown panel ── */}
            {dropOpen && (
              <div
                className="absolute top-full left-4 right-4 mt-1 rounded-xl border shadow-2xl overflow-hidden z-50"
                style={{
                  background: 'linear-gradient(135deg, #0d1f3c 0%, #0f2240 100%)',
                  borderColor: `${accent}35`,
                  boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px ${accent}25`,
                }}
              >
                {/* Panel header */}
                <div
                  className="px-4 py-2.5 border-b flex items-center gap-2"
                  style={{ borderColor: `${accent}25`, backgroundColor: `${accent}12` }}
                >
                  <activeSection.icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
                  <span className="text-[12px] font-bold text-white tracking-wide">{activeSection.label}</span>
                  <span className="ml-auto text-[10px] text-gray-400">{activeSection.tabs.length} pages</span>
                </div>

                {/* Tab grid */}
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-[55vh] overflow-y-auto">
                  {activeSection.tabs.map(tab => {
                    const isActive = activeTabId === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleTabSelect(tab.id)}
                        className={cn(
                          'flex items-start gap-2 px-3 py-2.5 rounded-lg text-left transition-all duration-100 group',
                          isActive
                            ? 'text-white'
                            : 'text-gray-400 hover:text-gray-100 hover:bg-white/5',
                        )}
                        style={isActive ? { backgroundColor: `${accent}28`, outline: `1px solid ${accent}50` } : {}}
                      >
                        <tab.icon
                          className="h-4 w-4 shrink-0 mt-0.5"
                          style={{ color: isActive ? accent : undefined, opacity: isActive ? 1 : 0.55 }}
                        />
                        <span className="text-[12px] font-medium leading-tight">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Description strip ── */}
      {activeTabDescription && !dropOpen && (
        <div
          className="flex items-start gap-3 px-5 py-2 border-b border-l-[3px] text-[12px] text-muted-foreground"
          style={{ borderLeftColor: accent, backgroundColor: `${accent}08`, borderBottomColor: `${accent}20` }}
        >
          <p className="leading-relaxed">{activeTabDescription}</p>
        </div>
      )}

      {/* ── Overview landing (when no tab selected) ── */}
      {!activeTabId && overviewContent && (
        <div className="flex-1">{overviewContent}</div>
      )}

      {/* ── Page content ── */}
      {activeTabId && (
        <div className="flex-1">{children}</div>
      )}
    </div>
  );
}
