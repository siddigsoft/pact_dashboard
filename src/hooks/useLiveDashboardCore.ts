/**
 * Live Dashboard Core Hook
 * Internal implementation - use useLiveDashboard from context instead
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeResource } from '@/hooks/useRealtimeResource';
import { queryClient } from '@/lib/queryClient';
import { queueTableRefresh, queueRealtimeToast } from '@/lib/realtime-utils';

interface LiveDashboardOptions {
  enableToasts?: boolean;
  toastBatchWindow?: number;
}

const DASHBOARD_TABLES = [
  'projects',
  'mmp_files',
  'mmp_site_entries',
  'site_visits',
];

export const useLiveDashboardCore = (options: LiveDashboardOptions = {}) => {
  const { enableToasts = true, toastBatchWindow = 2000 } = options;
  const { toast } = useToast();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  const showToast = useCallback((config: { title: string; description: string; duration?: number }) => {
    if (!mountedRef.current) return;
    toast(config);
  }, [toast]);

  const handleTableChange = useCallback((table: string, eventType: string) => {
    if (!mountedRef.current) return;
    
    console.log(`[LiveDashboard] ${table} change: ${eventType}`);
    setLastUpdate(new Date());
    
    queueTableRefresh(table, eventType);
    
    if (enableToasts) {
      queueRealtimeToast(table, eventType, showToast, {
        enabled: enableToasts,
        batchWindow: toastBatchWindow,
      });
    }
  }, [enableToasts, toastBatchWindow, showToast]);

  const { isSubscribed: projectsSubscribed, eventCount: projectEvents } = useRealtimeResource({
    configs: { table: 'projects', schema: 'public' },
    onInsert: () => handleTableChange('projects', 'INSERT'),
    onUpdate: () => handleTableChange('projects', 'UPDATE'),
    onDelete: () => handleTableChange('projects', 'DELETE'),
    enabled: true,
  });

  const { isSubscribed: mmpFilesSubscribed, eventCount: mmpFileEvents } = useRealtimeResource({
    configs: { table: 'mmp_files', schema: 'public' },
    onInsert: () => handleTableChange('mmp_files', 'INSERT'),
    onUpdate: () => handleTableChange('mmp_files', 'UPDATE'),
    onDelete: () => handleTableChange('mmp_files', 'DELETE'),
    enabled: true,
  });

  const { isSubscribed: siteEntriesSubscribed, eventCount: siteEntryEvents } = useRealtimeResource({
    configs: { table: 'mmp_site_entries', schema: 'public' },
    onInsert: () => handleTableChange('mmp_site_entries', 'INSERT'),
    onUpdate: () => handleTableChange('mmp_site_entries', 'UPDATE'),
    onDelete: () => handleTableChange('mmp_site_entries', 'DELETE'),
    enabled: true,
  });

  const { isSubscribed: visitsSubscribed, eventCount: visitEvents } = useRealtimeResource({
    configs: { table: 'site_visits', schema: 'public' },
    onInsert: () => handleTableChange('site_visits', 'INSERT'),
    onUpdate: () => handleTableChange('site_visits', 'UPDATE'),
    onDelete: () => handleTableChange('site_visits', 'DELETE'),
    enabled: true,
  });

  const isConnected = projectsSubscribed || mmpFilesSubscribed || siteEntriesSubscribed || visitsSubscribed;
  const totalEvents = projectEvents + mmpFileEvents + siteEntryEvents + visitEvents;

  useEffect(() => {
    mountedRef.current = true;
    console.log('[LiveDashboard] Core hook initialized');
    
    return () => {
      mountedRef.current = false;
      console.log('[LiveDashboard] Core hook cleanup');
    };
  }, []);

  const forceRefresh = useCallback(async () => {
    console.log('[LiveDashboard] Force refresh triggered');
    
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['mmp'] }),
      queryClient.invalidateQueries({ queryKey: ['mmp-files'] }),
      queryClient.invalidateQueries({ queryKey: ['site-visits'] }),
      queryClient.invalidateQueries({ queryKey: ['sites'] }),
    ]);
    
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
    isConnected,
    channels: isConnected ? DASHBOARD_TABLES.length : 0,
    totalEvents,
    lastUpdate,
    forceRefresh,
    subscriptionStatus: {
      projects: projectsSubscribed,
      mmp: mmpFilesSubscribed || siteEntriesSubscribed,
      visits: visitsSubscribed,
    },
  };
};
