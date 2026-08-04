import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type PageLoaderProps = {
  /** Short status text under the spinner */
  label?: string;
  /** Optional className for the outer shell */
  className?: string;
  /** Compact = shorter min-height (for panels / tabs) */
  compact?: boolean;
};

/**
 * Uniform in-page loading state for route content.
 * Use for initial loads. Prefer keeping existing UI + a refresh spinner
 * when refetching with cached data already on screen.
 */
export function PageLoader({
  label = 'Loading…',
  className,
  compact = false,
}: PageLoaderProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3 text-muted-foreground',
        compact ? 'min-h-[220px] py-10' : 'min-h-[50vh] py-16',
        className
      )}
      role="status"
      aria-live="polite"
      data-testid="page-loader"
    >
      <Loader2 className="h-7 w-7 animate-spin text-foreground/50" aria-hidden />
      <p className="text-sm font-medium tracking-tight">{label}</p>
    </div>
  );
}
