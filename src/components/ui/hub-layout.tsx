import { useState, useEffect } from 'react';
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

  // Track which section is expanded (accordion). Defaults to the active section.
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(activeSectionId);

  // When active section changes via URL navigation, auto-expand it.
  useEffect(() => {
    if (activeSectionId) setExpandedSectionId(activeSectionId);
  }, [activeSectionId]);

  function toggleSection(sectionId: string, firstTabId: string) {
    if (expandedSectionId === sectionId) {
      // Collapse
      setExpandedSectionId(null);
    } else {
      // Expand and navigate to first tab of this section
      setExpandedSectionId(sectionId);
      onSectionClick(firstTabId);
    }
  }

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

        {/* ── Level 2: Section accordion ── */}
        <div id="tour-hub-sections" className="flex flex-col">
          {sections.map(s => {
            const isSectionActive  = activeSectionId === s.id;
            const isSectionExpanded = expandedSectionId === s.id;
            const sectionAccent = s.color;

            return (
              <div key={s.id}>
                {/* Section header row */}
                <button
                  onClick={() => toggleSection(s.id, s.tabs[0]?.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-5 py-2.5 text-left transition-all duration-150 border-b',
                    isSectionActive
                      ? 'text-white'
                      : 'text-gray-400 hover:text-gray-200',
                  )}
                  style={{
                    borderColor: isSectionActive ? `${sectionAccent}30` : 'rgba(255,255,255,0.06)',
                    backgroundColor: isSectionActive ? `${sectionAccent}18` : 'transparent',
                  }}
                >
                  <s.icon
                    className="h-4 w-4 shrink-0"
                    style={{ color: isSectionActive ? sectionAccent : undefined, opacity: isSectionActive ? 1 : 0.45 }}
                  />
                  <span className={cn('text-[13px] font-semibold flex-1', !isSectionActive && 'opacity-60')}>
                    {s.label}
                  </span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={isSectionActive
                      ? { backgroundColor: `${sectionAccent}35`, color: sectionAccent }
                      : { backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}
                  >
                    {s.tabs.length}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-transform duration-200 opacity-50',
                      isSectionExpanded && 'rotate-180',
                    )}
                  />
                </button>

                {/* Inline tab strip — shown when expanded */}
                {isSectionExpanded && (
                  <div
                    id={isSectionActive ? 'tour-hub-tab-bar' : undefined}
                    className="flex flex-wrap gap-1.5 px-5 py-2.5 border-b"
                    style={{
                      borderColor: `${sectionAccent}20`,
                      backgroundColor: `${sectionAccent}0c`,
                    }}
                  >
                    {s.tabs.map(tab => {
                      const isTabActive = activeTabId === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => onTabClick(tab.id)}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium',
                            'transition-all duration-100 border whitespace-nowrap',
                            isTabActive
                              ? 'text-white border-transparent'
                              : 'text-gray-400 border-transparent hover:text-gray-100 hover:bg-white/5 hover:border-white/10',
                          )}
                          style={isTabActive ? {
                            backgroundColor: `${sectionAccent}30`,
                            borderColor: `${sectionAccent}55`,
                            color: 'white',
                          } : {}}
                        >
                          <tab.icon
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: isTabActive ? sectionAccent : undefined, opacity: isTabActive ? 1 : 0.5 }}
                          />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Description strip ── */}
      {activeTabDescription && (
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
