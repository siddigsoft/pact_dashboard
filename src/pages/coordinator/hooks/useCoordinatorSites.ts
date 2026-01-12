import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useUserProjects } from '@/hooks/useUserProjects';
import { supabase } from '@/integrations/supabase/client';

export interface SiteEntryCounts {
  new: number;
  permitsAttached: number;
  verified: number;
  approved: number;
  completed: number;
  rejected: number;
}

export interface SiteVisit {
  id: string;
  site_name: string;
  site_code: string;
  status: string;
  state: string;
  locality: string;
  activity: string;
  main_activity: string;
  visit_date: string | null;
  assigned_at: string;
  comments: string;
  mmp_file_id: string;
  hub_office: string;
  cp_name?: string;
  activity_at_site?: string[] | string;
  monitoring_by?: string;
  survey_tool?: string;
  use_market_diversion?: boolean;
  use_warehouse_monitoring?: boolean;
  verified_at?: string;
  verified_by?: string;
  verification_notes?: string;
  additional_data?: any;
}

/**
 * Custom hook to fetch coordinator-specific sites directly from database
 * This fetches mmp_site_entries where forwarded_to_user_id matches the current user
 */
export const useCoordinatorSites = () => {
  const { currentUser } = useAppContext();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const [coordinatorSites, setCoordinatorSites] = useState<SiteVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteCounts, setSiteCounts] = useState<SiteEntryCounts>({
    new: 0,
    permitsAttached: 0,
    verified: 0,
    approved: 0,
    completed: 0,
    rejected: 0
  });

  // Compute counts from sites data (runs after sites are loaded)
  const computeCountsFromSites = useCallback((sites: SiteVisit[]) => {
    const counts: SiteEntryCounts = {
      new: 0,
      permitsAttached: 0,
      verified: 0,
      approved: 0,
      completed: 0,
      rejected: 0
    };

    sites.forEach((entry) => {
      const status = (entry.status || '').toLowerCase();
      if (status === 'pending' || status === 'dispatched' || status === 'assigned' || 
          status === 'inprogress' || status === 'in_progress') {
        counts.new++;
      } else if (status === 'permits_attached') {
        counts.permitsAttached++;
      } else if (status === 'verified') {
        counts.verified++;
      } else if (status === 'approved') {
        counts.approved++;
      } else if (status === 'completed') {
        counts.completed++;
      } else if (status === 'rejected') {
        counts.rejected++;
      }
    });

    setSiteCounts(counts);
  }, []);

  const fetchCoordinatorSites = useCallback(async (isBackgroundRefresh = false) => {
    if (!currentUser?.id) {
      setCoordinatorSites([]);
      setLoading(false);
      setInitialLoadComplete(true);
      return;
    }

    // Non-admin users with no project assignments should see nothing
    if (!isAdminOrSuperUser && userProjectIds.length === 0) {
      setCoordinatorSites([]);
      setLoading(false);
      setInitialLoadComplete(true);
      return;
    }

    try {
      // Only show loading spinner for initial load, not background refreshes
      if (!isBackgroundRefresh && !initialLoadComplete) {
        setLoading(true);
      }
      setError(null);

      // OPTIMIZATION: Fetch only essential columns for faster initial load
      // Select specific fields instead of * for better performance
      // Use dual-approach: Try forwarded_to_user_id column first, fallback to additional_data
      let query = supabase
        .from('mmp_site_entries')
        .select(`
          id,
          site_name,
          site_code,
          status,
          state,
          locality,
          main_activity,
          activity_at_site,
          visit_date,
          comments,
          mmp_file_id,
          hub_office,
          cp_name,
          monitoring_by,
          survey_tool,
          use_market_diversion,
          use_warehouse_monitoring,
          verified_at,
          verified_by,
          verification_notes,
          forwarded_at,
          additional_data,
          mmp_files!inner (
            id,
            name,
            project_id,
            status,
            hub
          )
        `)
        .neq('status', 'returned_to_fom');
      
      // Use OR filter to match either forwarded_to_user_id column or additional_data.assigned_to
      // This provides backward compatibility while the database is being migrated
      query = query.or(`forwarded_to_user_id.eq.${currentUser.id},additional_data->>assigned_to.eq.${currentUser.id}`);

      // For non-admins, filter by project membership
      if (!isAdminOrSuperUser && userProjectIds.length > 0) {
        query = query.in('mmp_files.project_id', userProjectIds);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        console.error('Error fetching coordinator sites:', fetchError);
        setError(fetchError.message);
        setCoordinatorSites([]);
        return;
      }

      // Transform data to SiteVisit format
      const sites: SiteVisit[] = (data || []).map((entry: any) => {
        const isUnverified = entry.status === 'Pending' || entry.status === 'Dispatched' || 
                            entry.status === 'assigned' || entry.status === 'inProgress' || 
                            entry.status === 'in_progress';
        const visitDate = isUnverified ? null : entry.visit_date;

        // Parse activity_at_site
        let activityAtSite = entry.activity_at_site;
        if (typeof activityAtSite === 'string') {
          activityAtSite = activityAtSite.split(', ').filter((a: string) => a.trim() !== '');
        }

        return {
          id: entry.id,
          site_name: entry.site_name,
          site_code: entry.site_code,
          status: entry.status,
          state: entry.state,
          locality: entry.locality,
          activity: entry.activity_at_site || entry.main_activity,
          main_activity: entry.main_activity,
          activity_at_site: activityAtSite || [],
          visit_date: visitDate,
          assigned_at: entry.additional_data?.assigned_at || entry.forwarded_at,
          comments: entry.comments,
          mmp_file_id: entry.mmp_file_id,
          hub_office: entry.hub_office,
          cp_name: entry.cp_name,
          monitoring_by: entry.monitoring_by,
          survey_tool: entry.survey_tool,
          use_market_diversion: entry.use_market_diversion ?? false,
          use_warehouse_monitoring: entry.use_warehouse_monitoring ?? false,
          verified_at: entry.verified_at,
          verified_by: entry.verified_by,
          verification_notes: entry.verification_notes,
          additional_data: entry.additional_data || {},
        };
      });

      console.log('[useCoordinatorSites] Fetched', sites.length, 'sites for coordinator', currentUser.id);
      setCoordinatorSites(sites);
      // Compute counts from the fetched sites data
      computeCountsFromSites(sites);
    } catch (err) {
      console.error('Error in useCoordinatorSites:', err);
      setError('Failed to fetch coordinator sites');
      setCoordinatorSites([]);
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
    }
  }, [currentUser?.id, userProjectIds, isAdminOrSuperUser, initialLoadComplete, computeCountsFromSites]);

  // Initial fetch
  useEffect(() => {
    fetchCoordinatorSites();
  }, [fetchCoordinatorSites]);

  // Debounce timer for realtime updates
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Set up realtime subscription for updates with debouncing
  useEffect(() => {
    if (!currentUser?.id) return;

    const channel = supabase
      .channel('coordinator-sites-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mmp_site_entries',
          filter: `forwarded_to_user_id=eq.${currentUser.id}`,
        },
        () => {
          // Debounce realtime updates to prevent rapid refetches
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          debounceTimerRef.current = setTimeout(() => {
            // Background refresh - counts are computed automatically after sites load
            fetchCoordinatorSites(true);
          }, 500);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, fetchCoordinatorSites]);

  return {
    coordinatorSites,
    loading,
    error,
    siteCounts,
    refetch: fetchCoordinatorSites,
  };
};
