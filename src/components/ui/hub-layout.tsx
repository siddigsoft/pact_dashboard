import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
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
  onSectionClick: (firstTabId: string) => void;
  onTabClick: (tabId: string) => void;
  children: React.ReactNode;
  overviewContent?: React.ReactNode;
  /** Page slug for the tour registry — shows a Tour button in the hub header */
  tourSlug?: string;
  /** Use the viewport-filling shell only for hubs that explicitly opt in. */
  fullPage?: boolean;
  /** Apply the PACT navy/orange treatment to this hub only. */
  brandAccent?: boolean;
}

export function HubLayout({
  title, subtitle, hubIcon: HubIcon,
  sections, activeSectionId, activeTabId, activeTabDescription,
  onSectionClick, onTabClick,
  children, overviewContent, tourSlug, fullPage = false, brandAccent = false,
}: HubLayoutProps) {
  const activeSection = sections.find(s => s.id === activeSectionId) ?? null;
  const activeTab = activeSection?.tabs.find(t => t.id === activeTabId) ?? null;

  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setDropOpen(false); }, [activeSectionId]);

  const handleTabSelect = (tabId: string) => {
    onTabClick(tabId);
    setDropOpen(false);
  };

  return (
    <div className={fullPage ? 'flex h-full min-h-0 flex-col overflow-hidden bg-background' : 'flex flex-col min-h-screen bg-background'}>

      {/* Sticky hub chrome: light institutional toolbar with readable contrast */}
      <header className={cn('sticky top-0 z-30 border-b border-border', brandAccent ? 'bg-[#F7F8FB] dark:bg-slate-950' : 'bg-card')}>

        {/* Identity + sections */}
        <div className="px-4 sm:px-5 pt-3.5 pb-0 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', brandAccent ? 'bg-[#273677] text-white dark:bg-[#AAB7EC] dark:text-slate-950' : 'bg-primary text-primary-foreground')}>
                <HubIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-foreground tracking-tight leading-tight truncate">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-xs text-foreground/65 truncate mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>
            {tourSlug && (
              <div className="hidden sm:flex shrink-0">
                <TourButton slug={tourSlug} variant="inline" />
              </div>
            )}
          </div>

          {sections.length > 0 && (
            <nav
              id="tour-hub-sections"
              className="flex items-end gap-0.5 overflow-x-auto scrollbar-none -mb-px"
              aria-label="Hub sections"
            >
              {sections.map(s => {
                const isActive = activeSectionId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSectionClick(s.tabs[0]?.id)}
                    className={cn(
                      'relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] whitespace-nowrap shrink-0',
                      'border-b-2 transition-colors duration-150',
                      isActive
                        ? brandAccent
                          ? 'border-[#273677] text-[#273677] font-semibold dark:border-[#AAB7EC] dark:text-[#AAB7EC]'
                          : 'border-foreground text-foreground font-semibold'
                        : 'border-transparent text-foreground/70 font-medium hover:text-foreground',
                    )}
                  >
                    <s.icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'opacity-90' : 'opacity-75')} />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* In-section page picker */}
        {activeSection && (
          <div
            id="tour-hub-tab-bar"
            className={cn('relative px-4 sm:px-5 py-2.5 border-t border-border flex items-center gap-2.5', brandAccent ? 'bg-[#EFF1F7] dark:bg-slate-900' : 'bg-muted')}
            ref={dropRef}
          >
            <span className="hidden sm:inline text-xs font-medium text-foreground/70 shrink-0">
              Page
            </span>
            <button
              type="button"
              onClick={() => setDropOpen(v => !v)}
              aria-expanded={dropOpen}
              aria-haspopup="listbox"
              aria-label="Select hub page"
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold transition-colors duration-150',
                'border bg-card text-foreground shadow-sm min-w-0 flex-1 max-w-md',
                brandAccent ? 'border-[#273677]/30 hover:border-[#273677]/60 dark:border-[#AAB7EC]/40' : 'border-foreground/20 hover:border-foreground/35 hover:bg-background',
                dropOpen && (brandAccent ? 'border-[#273677] ring-2 ring-[#273677]/15 dark:border-[#AAB7EC]' : 'border-foreground/40 ring-2 ring-foreground/10'),
              )}
            >
              {activeTab ? (
                <>
                  <activeTab.icon className={cn('h-4 w-4 shrink-0', brandAccent ? 'text-[#273677] dark:text-[#AAB7EC]' : 'text-foreground/80')} />
                  <span className="truncate">{activeTab.label}</span>
                </>
              ) : (
                <>
                  <activeSection.icon className="h-4 w-4 shrink-0 text-foreground/80" />
                  <span className="text-foreground/70 font-medium">Select a page</span>
                </>
              )}
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 ml-auto text-foreground/70 transition-transform duration-150',
                  dropOpen && 'rotate-180',
                )}
              />
            </button>

            {activeTab && (
              <span className={cn('hidden sm:inline text-xs font-medium tabular-nums shrink-0', brandAccent ? 'text-[#B94B13] dark:text-orange-300' : 'text-foreground/60')}>
                {(activeSection.tabs.findIndex(t => t.id === activeTabId) + 1)} of {activeSection.tabs.length}
              </span>
            )}

            {dropOpen && (
              <div
                role="listbox"
                className="absolute top-full left-4 right-4 sm:left-5 sm:right-auto sm:min-w-[20rem] sm:max-w-lg mt-1 rounded-md border border-foreground/15 bg-popover text-popover-foreground shadow-md overflow-hidden z-50"
              >
                <div className="px-3 py-2 border-b border-border flex items-center gap-2 bg-muted">
                  <activeSection.icon className="h-3.5 w-3.5 shrink-0 text-foreground/70" />
                  <span className="text-[12px] font-semibold text-foreground">{activeSection.label}</span>
                  <span className="ml-auto text-[10px] font-medium text-foreground/60 tabular-nums">
                    {activeSection.tabs.length}
                  </span>
                </div>
                <div className="p-1.5 grid grid-cols-1 sm:grid-cols-2 gap-0.5 max-h-[50vh] overflow-y-auto">
                  {activeSection.tabs.map(tab => {
                    const isActive = activeTabId === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => handleTabSelect(tab.id)}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-[13px] transition-colors duration-150',
                          isActive
                            ? brandAccent
                              ? 'bg-[#273677]/10 text-[#273677] font-semibold dark:bg-[#AAB7EC]/15 dark:text-[#AAB7EC]'
                              : 'bg-accent text-accent-foreground font-semibold'
                            : 'text-foreground/80 font-medium hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <tab.icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                        <span className="leading-snug">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {activeTabDescription && !dropOpen && (
        <div className="px-4 sm:px-5 py-2.5 border-b border-border bg-background">
          <p className="text-[13px] text-foreground/75 leading-relaxed max-w-3xl">
            {activeTabDescription}
          </p>
        </div>
      )}

      {!activeTabId && overviewContent && (
        <div className={fullPage ? 'min-h-0 flex-1 overflow-y-auto' : 'flex-1'}>{overviewContent}</div>
      )}

      {activeTabId && (
        <div className={fullPage ? 'min-h-0 flex-1 overflow-y-auto' : 'flex-1'}>{children}</div>
      )}
    </div>
  );
}
