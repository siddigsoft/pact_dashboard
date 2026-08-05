/**
 * Live Dashboard Core Hook
 * Internal implementation - use useLiveDashboard from context instead
 *
 * ponytail: was 4 Realtime channels (projects, mmp_files, mmp_site_entries @ ~5k rows,
 * site_visits) per dashboard viewer — every row change fanned out to every viewer + an
 * RLS check, purely to bump a "last updated" timestamp (the subscriptions never actually
 * refetched). At 100 concurrent viewers that's pure server-side cost. Replaced with a
 * single interval poll that invalidates the dashboard queries — fewer moving parts, no
 * fan-out, and the data now auto-refreshes (which the subscriptions never did).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

interface LiveDashboardOptions {
  enableToasts?: boolean;
  toastBatchWindow?: number;
  /** How often to refresh dashboard data. Default 45s. */
  pollIntervalMs?: number;
}

const DASHBOARD_TABLES = [
  'projects',
  'mmp_files',
  'mmp_site_entries',
  'site_visits',
];

const DASHBOARD_QUERY_KEYS = [
  ['projects'],
  ['mmp'],
  ['mmp-files'],
  ['site-visits'],
  ['sites'],
];

export const useLiveDashboardCore = (options: LiveDashboardOptions = {}) => {
  const { enableToasts = true, pollIntervalMs = 45_000 } = options;
  const { toast } = useToast();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [totalEvents, setTotalEvents] = useState(0);
  const mountedRef = useRef(true);

  const invalidateDashboard = useCallback(() => {
    for (const key of DASHBOARD_QUERY_KEYS) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }, []);

  // Interval poll — skips work when the tab is backgrounded so idle sessions cost nothing.
  useEffect(() => {
    mountedRef.current = true;

    const tick = () => {
      if (!mountedRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      invalidateDashboard();
      setLastUpdate(new Date());
      setTotalEvents((n) => n + 1);
    };

    const interval = window.setInterval(tick, pollIntervalMs);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
    };
  }, [pollIntervalMs, invalidateDashboard]);

  const forceRefresh = useCallback(async () => {
    await Promise.all(
      DASHBOARD_QUERY_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: key })),
    );

    setLastUpdate(new Date());

    if (enableToasts) {
      toast({
        title: 'Data Refreshed',
        description: 'All dashboard data has been updated.',
        duration: 2000,
      });
    }
  }, [enableToasts, toast]);

  return {
    isConnected: true, // polling is always "connected"
    channels: DASHBOARD_TABLES.length,
    totalEvents,
    lastUpdate,
    forceRefresh,
    subscriptionStatus: {
      projects: true,
      mmp: true,
      visits: true,
    },
  };
};
