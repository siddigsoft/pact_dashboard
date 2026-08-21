import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RELOAD_KEY = 'pact_chunk_reload_ts';

const CHUNK_ERROR_PATTERN =
  /loading chunk|failed to fetch dynamically imported module|importing a module script failed|chunkloaderror/i;

export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return CHUNK_ERROR_PATTERN.test(msg);
}

/**
 * Reload once per browser session so stale post-deploy chunks pick up the new
 * manifest without trapping users in a refresh loop when the underlying issue
 * is not a stale chunk.
 * Returns true when a reload was triggered.
 */
export function reloadForStaleChunk(): boolean {
  if (typeof window === 'undefined') return false;

  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return false;

  sessionStorage.setItem(CHUNK_RELOAD_KEY, 'attempted');
  window.location.reload();
  return true;
}

/**
 * Install global handlers before React mounts so chunk failures never surface as raw errors.
 */
export function setupChunkLoadRecovery(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', (event: Event) => {
    event.preventDefault();
    reloadForStaleChunk();
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
      return await importer();
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;

      if (reloadForStaleChunk()) {
        return new Promise<ModuleDefault<T>>(() => {});
      }

      throw error;
    }
  });
}
