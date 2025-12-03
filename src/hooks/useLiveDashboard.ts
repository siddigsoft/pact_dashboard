import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useToast } from '@/hooks/use-toast';
import { useMMP } from '@/context/mmp/MMPContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';

export const useLiveDashboard = () => {
  const { fetchProjects } = useProjectContext();
  const { toast } = useToast();
  const { refreshMMPFiles } = useMMP();
  const { refreshSiteVisits } = useSiteVisitContext();
  const [isConnected, setIsConnected] = useState(false);
  const [channelCount, setChannelCount] = useState(0);

  const handleDataChange = useCallback((table: string, eventType: string) => {
    console.log(`[LiveDashboard] ${table} change detected: ${eventType}`);
    
    if (table === 'projects' && (eventType === 'INSERT' || eventType === 'UPDATE' || eventType === 'DELETE')) {
      fetchProjects();
      toast({
        title: 'Projects Updated',
        description: 'Dashboard data refreshed automatically.',
        duration: 2000
      });
    } else if (table === 'mmp_files' || table === 'mmp_site_entries') {
      refreshMMPFiles();
      if (table === 'mmp_site_entries') {
        // Also affects site visit derived views
        refreshSiteVisits?.();
      }
      if (eventType === 'INSERT') {
        toast({
          title: table === 'mmp_files' ? 'New MMP Uploaded' : 'New Site Entry Created',
          description: 'Data refreshed automatically.',
          duration: 3000
        });
      } else if (eventType === 'UPDATE' || eventType === 'DELETE') {
        toast({
          title: table === 'mmp_files' ? 'MMP Updated' : 'Site Entry Updated',
          description: 'Data refreshed automatically.',
          duration: 3000
        });
      }
    } else if (table === 'site_visits'|| table === 'mmp_site_entries') {
      refreshSiteVisits?.();
      toast({
        title: 'Site Visits Updated',
        description: 'Data refreshed automatically.',
        duration: 2000
      });
    }
  }, [fetchProjects, refreshMMPFiles, refreshSiteVisits, toast]);

  useEffect(() => {
    console.log('[LiveDashboard] Setting up realtime subscriptions...');
    
    const mmpChannel = supabase
      .channel('dashboard_mmp_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mmp_files'
        },
        (payload) => handleDataChange('mmp_files', payload.eventType)
      )
      .subscribe((status) => {
        console.log('[LiveDashboard] MMP channel:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    const siteChannel = supabase
      .channel('dashboard_site_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mmp_site_entries'
        },
        (payload) => handleDataChange('mmp_site_entries', payload.eventType)
      )
      .subscribe((status) => {
        console.log('[LiveDashboard] Site entry channel:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    const projectChannel = supabase
      .channel('dashboard_project_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects'
        },
        (payload) => handleDataChange('projects', payload.eventType)
      )
      .subscribe((status) => {
        console.log('[LiveDashboard] Project channel:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    const siteVisitsChannel = supabase
      .channel('dashboard_site_visits_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'site_visits'
        },
        (payload) => handleDataChange('site_visits', payload.eventType)
      )
      .subscribe((status) => {
        console.log('[LiveDashboard] Site visits channel:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    setChannelCount(4);

    return () => {
      console.log('[LiveDashboard] Cleaning up realtime subscriptions');
      supabase.removeChannel(mmpChannel);
      supabase.removeChannel(siteChannel);
      supabase.removeChannel(projectChannel);
      supabase.removeChannel(siteVisitsChannel);
    };
  }, [handleDataChange]);

  return {
    isConnected,
    channels: channelCount
  };
};
