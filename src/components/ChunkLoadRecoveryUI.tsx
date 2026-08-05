import { useEffect } from 'react';
import { reloadForStaleChunk } from '@/lib/chunk-load-recovery';

interface ChunkLoadRecoveryUIProps {
  /** When true, attempt one automatic reload on mount. */
  autoReload?: boolean;
}

/**
 * Polished fallback shown while recovering from a stale code-split chunk.
 * Replaces raw "Failed to fetch dynamically imported module" error screens.
 */
export function ChunkLoadRecoveryUI({ autoReload = true }: ChunkLoadRecoveryUIProps) {
  useEffect(() => {
    if (!autoReload) return;
    reloadForStaleChunk();
  }, [autoReload]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div
          className="mx-auto h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin"
          aria-hidden
        />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Updating application</h2>
          <p className="text-sm text-muted-foreground">
            A new version was deployed. Refreshing to load the latest files…
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
        >
          Refresh now
        </button>
      </div>
    </div>
  );
}
