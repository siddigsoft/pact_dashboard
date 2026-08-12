/**
 * TourButton.tsx
 * Renders a "Take a Tour" / ? button for any page that has a tour defined
 * in tourRegistry.ts. Handles auto-launch on first visit and manual replay.
 *
 * Usage:
 *   <TourButton slug="finance-hub" variant="inline" />   ← inside hub header
 *   <TourButton variant="floating" />                    ← MainLayout floating
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { driver } from 'driver.js';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  TOUR_REGISTRY,
  HUB_SLUGS,
  hasTourBeenSeen,
  markTourSeen,
  tourSeenKey,
} from '@/lib/tourRegistry';
import { resolveSlug } from '@/lib/page-roles';
import { useAppContext } from '@/context/AppContext';

// ── Start tour helper ─────────────────────────────────────────────────────────
function launchTour(slug: string, userId: string) {
  const def = TOUR_REGISTRY.find(t => t.slug === slug);
  if (!def) return;

  // Filter steps whose element selector doesn't exist on this page
  const steps = def.steps.filter(
    s => !s.element || document.querySelector(s.element as string),
  );
  if (steps.length === 0) return;

  driver({
    showProgress: true,
    animate: true,
    smoothScroll: true,
    overlayOpacity: 0.5,
    stagePadding: 8,
    stageRadius: 10,
    popoverClass: 'pact-tour-popover',
    nextBtnText: 'Next →',
    prevBtnText: '← Back',
    doneBtnText: 'Done',
    progressText: '{{current}} of {{total}}',
    steps,
    onDestroyed: () => markTourSeen(slug, userId),
  }).drive();
}

// ── Props ────────────────────────────────────────────────────────────────────
interface TourButtonProps {
  /** Override the page slug. When omitted, reads from the current URL. */
  slug?: string;
  /**
   * inline  → small icon-only button for placement inside a hub header bar
   * floating → labelled floating button for standalone pages
   */
  variant?: 'inline' | 'floating';
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────
export function TourButton({ slug: slugProp, variant = 'inline', className }: TourButtonProps) {
  const location  = useLocation();
  const { currentUser } = useAppContext();
  const autoFired = useRef(false);

  // Resolve which slug to use
  const effectiveSlug = slugProp ?? resolveSlug(location.pathname) ?? '';
  const tourDef = TOUR_REGISTRY.find(t => t.slug === effectiveSlug);
  const userId  = currentUser?.id ?? '';

  // Auto-launch: fire once on first visit (800 ms delay to let the page render)
  useEffect(() => {
    if (!tourDef || !userId || autoFired.current) return;
    if (hasTourBeenSeen(effectiveSlug, userId)) return;
    autoFired.current = true;
    const t = setTimeout(() => launchTour(effectiveSlug, userId), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSlug, userId, !!tourDef]);

  // Also reset autoFired when the slug changes (navigating to a new page)
  useEffect(() => { autoFired.current = false; }, [effectiveSlug]);

  // Don't render if no tour exists for this page
  if (!tourDef || !userId) return null;

  const handleClick = () => launchTour(effectiveSlug, userId);

  if (variant === 'floating') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className={
              className ??
              'fixed bottom-[72px] right-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl ' +
              'bg-white border border-slate-200 text-slate-600 text-xs font-semibold shadow-lg ' +
              'hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors ' +
              'dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
            }
            aria-label="Take a page tour"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Take a Tour</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          Quick tour of {tourDef.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Inline variant (used inside hub headers)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          className={
            className ??
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ' +
            'text-gray-300 border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white ' +
            'transition-colors shrink-0'
          }
          aria-label="Take a page tour"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Tour</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        Quick tour of {tourDef.label}
      </TooltipContent>
    </Tooltip>
  );
}

// Re-export helper so callers can reset tour state (e.g. for testing)
export { launchTour, tourSeenKey };

// ── HUB_SLUGS re-exported for MainLayout ─────────────────────────────────────
export { HUB_SLUGS };
