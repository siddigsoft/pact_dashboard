import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RELOAD_KEY = 'pact_chunk_reload_ts';
/** Minimum gap between automatic reloads, so a genuinely broken chunk cannot cause a refresh loop. */
const RELOAD_COOLDOWN_MS = 60_000;

// "reading 'default'" is what React.lazy throws when Vite's preload helper resolves a failed import to undefined.
const CHUNK_ERROR_PATTERN =
  /loading chunk|failed to fetch dynamically imported module|importing a module script failed|chunkloaderror|error loading dynamically imported module|unable to preload css|reading 'default'/i;

export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return CHUNK_ERROR_PATTERN.test(msg);
}

/**
 * Reload so stale post-deploy chunks pick up the new manifest, at most once per
 * cooldown window so users are not trapped in a refresh loop when the underlying
 * issue is not a stale chunk.
 * Returns true when a reload was triggered.
 */
export function reloadForStaleChunk(): boolean {
  if (typeof window === 'undefined') return false;

  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0;
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;

  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  window.location.reload();
  return true;
}

/**
 * Install global handlers before React mounts so chunk failures never surface as raw errors.
 */
export function setupChunkLoadRecovery(): void {
  if (typeof window === 'undefined') return;

  // preventDefault makes Vite resolve the import to undefined, so only suppress it when a reload is under way;
  // otherwise let the real error reach the ErrorBoundary's recovery screen.
  window.addEventListener('vite:preloadError', (event: Event) => {
    if (reloadForStaleChunk()) event.preventDefault();
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (!isChunkLoadError(event.reason)) return;
    event.preventDefault();
    reloadForStaleChunk();
  });
}

type ModuleDefault<T> = { default: T };

/**
 * React.lazy wrapper that silently recovers from stale chunk URLs after deployments.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<ModuleDefault<T>>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await importer();
      if (!mod?.default) throw new Error('Failed to fetch dynamically imported module');
      return mod;
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;

      if (reloadForStaleChunk()) {
        return new Promise<ModuleDefault<T>>(() => {});
      }

      throw error;
    }
  });
}
