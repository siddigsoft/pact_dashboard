import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useToast } from '@/hooks/use-toast';

export const useLiveDashboard = () => {
  const { fetchProjects } = useProjectContext();
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [channelCount, setChannelCount] = useState(0);

  const handleDataChange = useCallback((table: string, eventType: string) => {
    console.log(`[LiveDashboard] ${table} change detected: ${eventType}`);
    
    if (table === 'projects' && eventType === 'INSERT') {
      fetchProjects();
      toast({
        title: 'New Project Created',
        description: 'Dashboard has been updated automatically.',
        duration: 2000
      });
    } else if (table === 'mmp_files') {
      if (eventType === 'INSERT') {
        toast({
          title: 'New MMP Uploaded',
          description: 'Click Refresh to see the latest changes.',
          duration: 3000
        });
      } else if (eventType === 'UPDATE') {
        toast({
          title: 'MMP Updated',
          description: 'Click Refresh to see the latest changes.',
          duration: 3000
        });
      }
    } else if (table === 'mmp_site_entries') {
      if (eventType === 'INSERT') {
        toast({
          title: 'New Site Entry Created',
          description: 'Click Refresh to see the latest changes.',
          duration: 3000
        });
      } else if (eventType === 'UPDATE') {
        toast({
          title: 'Site Entry Updated',
          description: 'Click Refresh to see the latest changes.',
          duration: 3000
        });
      }
    }
  }, [fetchProjects, toast]);

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

    setChannelCount(3);

    return () => {
      console.log('[LiveDashboard] Cleaning up realtime subscriptions');
      supabase.removeChannel(mmpChannel);
      supabase.removeChannel(siteChannel);
      supabase.removeChannel(projectChannel);
    };
  }, [handleDataChange]);

  return {
    isConnected,
    channels: channelCount
  };
};
