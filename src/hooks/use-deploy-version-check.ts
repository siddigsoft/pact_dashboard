import { useEffect, useRef } from 'react';
import { reloadForStaleChunk } from '@/lib/chunk-load-recovery';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_DELAY_MS = 60_000;

/**
 * Detects new production deployments by polling index.html.
 * When the shell changes, silently reloads so lazy chunks stay in sync.
 */
export function useDeployVersionCheck(): void {
  const fingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !import.meta.env.PROD) return;

    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch(`${window.location.origin}/index.html`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!response.ok || cancelled) return;

        const html = await response.text();
        const fingerprint = html.length.toString(36) + ':' + (html.match(/\/js\/[^"']+\.js/g)?.join('|') ?? '');

        if (fingerprintRef.current === null) {
          fingerprintRef.current = fingerprint;
          return;
        }

        if (fingerprintRef.current !== fingerprint) {
          reloadForStaleChunk();
        }
      } catch {
        // Network blip — ignore; chunk recovery handles hard failures.
      }
    };

    const initialTimer = window.setTimeout(check, INITIAL_DELAY_MS);
    const interval = window.setInterval(check, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
