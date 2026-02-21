import { useMemo } from 'react';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { useUserProjects } from '@/hooks/useUserProjects';

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
 * Compute tab counts from sites (same logic as previous direct-query implementation).
 */
function computeCounts(sites: SiteVisit[]): SiteEntryCounts {
  const counts: SiteEntryCounts = {
    new: 0,
    permitsAttached: 0,
    verified: 0,
    approved: 0,
    completed: 0,
    rejected: 0
  };
  const prePipelineStatuses = ['pending', 'inprogress', 'in_progress', 'forwarded', 'forwarded_to_coordinator', 'forwarded_to_coordinators', 'new'];
  sites.forEach((entry) => {
    const status = (entry.status || '').toLowerCase().trim().replace(/\s+/g, '_');
    if (prePipelineStatuses.includes(status)) {
      counts.new++;
    } else if (status === 'dispatched' || status === 'assigned' || status === 'accepted') {
      // Dispatched/assigned/accepted sites are already in the workflow pipeline - don't count as new
    } else if (status === 'permits_attached' || status === 'cp_verified' || status === 'cp_verification') {
      counts.permitsAttached++;
    } else if (status === 'verified') {
      counts.verified++;
    } else if (status === 'approved' || status === 'costed' || status === 'approved_and_costed') {
      counts.approved++;
    } else if (status === 'completed') {
      counts.completed++;
    } else if (status === 'rejected') {
      counts.rejected++;
    } else {
      counts.new++;
    }
  });
  return counts;
}

/**
 * Custom hook to filter and transform coordinator-specific sites from MMP context data.
 * Matches backup behavior: sites come from MMP context (all MMPs + site entries loaded
 * in context), then filtered client-side by assignment to current user.
 */
export const useCoordinatorSites = () => {
  const { currentUser } = useAppContext();
  const { mmpFiles: contextMmpFiles, loading: contextLoading, refreshMMPFiles } = useMMP();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();

  const coordinatorSites = useMemo(() => {
    if (!currentUser?.id || !contextMmpFiles || contextLoading) return [];

    const allSites: SiteVisit[] = [];

    contextMmpFiles.forEach((mmp: any) => {
      if (!mmp.siteEntries || !Array.isArray(mmp.siteEntries)) return;

      mmp.siteEntries.forEach((entry: any) => {
        const forwardedToMe = entry.forwardedToUserId === currentUser.id;
        const assignedToMe = (entry.additionalData?.assigned_to || entry.additional_data?.assigned_to) === currentUser.id;
        const acceptedByMe = entry.accepted_by === currentUser.id;
        if (!forwardedToMe && !assignedToMe && !acceptedByMe) return;

        if (entry.status === 'returned_to_fom') return;

        const isUnverified = entry.status === 'Pending' || entry.status === 'Dispatched' ||
                            entry.status === 'assigned' || entry.status === 'inProgress' ||
                            entry.status === 'in_progress';
        const visitDate = isUnverified ? null : (entry.visitDate ?? entry.visit_date);

        allSites.push({
          id: entry.id,
          site_name: entry.siteName || entry.site_name,
          site_code: entry.siteCode || entry.site_code,
          status: entry.status,
          state: entry.state,
          locality: entry.locality,
          activity: entry.siteActivity || entry.activity_at_site || entry.mainActivity,
          main_activity: entry.mainActivity || entry.main_activity,
          activity_at_site: entry.siteActivity
            ? (typeof entry.siteActivity === 'string' ? entry.siteActivity.split(', ').filter((a: string) => a.trim() !== '') : entry.siteActivity)
            : [],
          visit_date: visitDate,
          assigned_at: entry.additionalData?.assigned_at || entry.additional_data?.assigned_at,
          comments: entry.comments,
          mmp_file_id: mmp.id,
          hub_office: entry.hubOffice || entry.hub_office,
          cp_name: entry.cpName || entry.cp_name,
          monitoring_by: entry.monitoringBy || entry.monitoring_by,
          survey_tool: entry.surveyTool || entry.survey_tool,
          use_market_diversion: entry.useMarketDiversion ?? entry.use_market_diversion ?? false,
          use_warehouse_monitoring: entry.useWarehouseMonitoring ?? entry.use_warehouse_monitoring ?? false,
          verified_at: entry.verified_at,
          verified_by: entry.verified_by,
          verification_notes: entry.verification_notes,
          additional_data: entry.additionalData || entry.additional_data || {},
        });
      });
    });

    return allSites;
  }, [contextMmpFiles, contextLoading, currentUser?.id, userProjectIds, isAdminOrSuperUser]);

  const siteCounts = useMemo(() => computeCounts(coordinatorSites), [coordinatorSites]);

  return {
    coordinatorSites,
    loading: contextLoading,
    error: null,
    siteCounts,
    refetch: refreshMMPFiles,
  };
};
