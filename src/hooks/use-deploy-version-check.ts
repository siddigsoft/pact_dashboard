import { useEffect, useRef } from 'react';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_DELAY_MS = 60_000;
const ENTRY_SCRIPT_PATTERN = /<script[^>]*type="module"[^>]*src="(\/js\/[^"]+\.js)"/;

let updatePending = false;

/**
 * Once a new deployment is detected, the next in-app navigation becomes a full page load,
 * so users pick up the new build between screens instead of mid-task (no lost form input).
 */
function applyUpdateOnNextNavigation(): void {
  if (updatePending) return;
  updatePending = true;

  const originalPushState = window.history.pushState.bind(window.history);
  window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    if (url != null) {
      window.location.assign(String(url));
      return;
    }
    originalPushState(data, unused, url);
  };
  window.addEventListener('popstate', () => window.location.reload());
}

/**
 * Detects new production deployments by polling index.html.
 * When the shell changes, the new build is applied on the next navigation.
 */
export function useDeployVersionCheck(): void {
  const fingerprintRef = useRef<string | null>(
    typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLScriptElement>('script[type="module"][src*="/js/"]')?.getAttribute('src') ?? null,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !import.meta.env.PROD) return;

    let cancelled = false;

    const check = async () => {
      if (updatePending) return;
      try {
        const response = await fetch(`${window.location.origin}/index.html`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!response.ok || cancelled) return;

        const html = await response.text();
        const fingerprint = html.match(ENTRY_SCRIPT_PATTERN)?.[1] ?? null;
        if (!fingerprint) return;

        if (fingerprintRef.current === null) {
          fingerprintRef.current = fingerprint;
          return;
        }

        if (fingerprintRef.current !== fingerprint) {
          applyUpdateOnNextNavigation();
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
