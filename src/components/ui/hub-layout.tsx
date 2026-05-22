import { cn } from '@/lib/utils';
import { Info, ChevronRight } from 'lucide-react';
import { ConnectedPagesBar } from './connected-pages-bar';

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
}

export function HubLayout({
  title, subtitle, hubIcon: HubIcon,
  sections, activeSectionId, activeTabId, activeTabDescription,
  quickLinks, onSectionClick, onTabClick,
  children, overviewContent,
}: HubLayoutProps) {
  const activeSection = sections.find(s => s.id === activeSectionId) ?? null;
  const accent = activeSection?.color ?? sections[0]?.color ?? '#3b82f6';

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
              style={{
                background: accent,
                boxShadow: `0 0 16px ${accent}55`,
              }}
            >
              <HubIcon style={{ width: 18, height: 18, color: 'white' }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-[17px] font-bold text-white tracking-tight leading-tight">
                {title}
              </h1>
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
                {sections.length === 0 && (
                  <span className="opacity-50">{subtitle}</span>
                )}
              </div>
            </div>
          </div>
          <div className="hidden md:block shrink-0">
            <ConnectedPagesBar pages={quickLinks} />
          </div>
        </div>

        {/* ── Level 2: Section tabs ── */}
        <div className="px-5 pt-3 flex items-end gap-1.5 overflow-x-auto scrollbar-none">
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
                <s.icon
                  className="h-4 w-4 transition-colors shrink-0"
                  style={isActive ? { color: s.color } : {}}
                />
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

        {/* ── Level 3: Sub-tab strip ── */}
        {activeSection && (
          <div
            className="flex items-center overflow-x-auto scrollbar-none border-t"
            style={{
              borderColor: `${accent}30`,
              backgroundColor: `${accent}08`,
            }}
          >
            {activeSection.tabs.map(tab => {
              const isActive = activeTabId === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabClick(tab.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] font-medium whitespace-nowrap',
                    'transition-all duration-100',
                    isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200',
                  )}
                >
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                      style={{ backgroundColor: accent }}
                    />
                  )}
                  <tab.icon
                    className={cn('h-3.5 w-3.5 transition-colors', isActive ? 'opacity-100' : 'opacity-60')}
                    style={isActive ? { color: accent } : {}}
                  />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Description strip ── */}
      {activeTabDescription && (
        <div
          className="flex items-start gap-3 px-5 py-2.5 border-b border-l-[3px]"
          style={{
            borderLeftColor: accent,
            backgroundColor: `${accent}08`,
            borderBottomColor: `${accent}20`,
          }}
        >
          <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: accent }} />
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            {activeTabDescription}
          </p>
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
