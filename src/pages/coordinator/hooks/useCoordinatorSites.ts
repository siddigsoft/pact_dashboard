import { useMemo } from 'react';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { useUserProjects } from '@/hooks/useUserProjects';
import {
  useCoordinatorSiteEntriesQuery,
  type CoordinatorSiteEntryRow,
} from '@/context/mmp/mmpQueries';

export interface SiteEntryCounts {
  new: number;
  permitsAttached: number;
  verified: number;
  approved: number;
  completed: number;
  rejected: number;
  returnedToFom: number;
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
  mmp_name: string;
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
    rejected: 0,
    returnedToFom: 0
  };
  const prePipelineStatuses = ['pending', 'inprogress', 'in_progress', 'forwarded', 'forwarded_to_coordinator', 'forwarded_to_coordinators', 'new', 'dispatched', 'assigned', 'accepted'];
  sites.forEach((entry) => {
    const status = (entry.status || '').toLowerCase().trim().replace(/\s+/g, '_');
    if (status === 'returned_to_fom') {
      counts.returnedToFom++;
    } else if (prePipelineStatuses.includes(status)) {
      counts.new++;
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

function mapCoordinatorRowToSiteVisit(row: CoordinatorSiteEntryRow): SiteVisit {
  const ad = row.additional_data || {};
  const isUnverified = ['Pending', 'Dispatched', 'assigned', 'inProgress', 'in_progress'].includes(row.status || '');
  const visitDate = isUnverified ? null : (row.visit_date ?? null);
  const activityAtSite = row.activity_at_site;
  const activityArray = activityAtSite
    ? (typeof activityAtSite === 'string' ? activityAtSite.split(', ').filter((a: string) => a.trim() !== '') : [])
    : [];

  return {
    id: row.id,
    site_name: row.site_name ?? '',
    site_code: row.site_code ?? '',
    status: row.status ?? '',
    state: row.state ?? '',
    locality: row.locality ?? '',
    activity: activityAtSite ?? row.main_activity ?? '',
    main_activity: row.main_activity ?? '',
    activity_at_site: activityArray,
    visit_date: visitDate,
    assigned_at: (ad as any).assigned_at ?? '',
    comments: row.comments ?? '',
    mmp_file_id: row.mmp_file_id,
    mmp_name: row.mmp_name ?? 'Unknown MMP',
    hub_office: row.hub_office ?? '',
    cp_name: row.cp_name ?? undefined,
    monitoring_by: row.monitoring_by ?? undefined,
    survey_tool: row.survey_tool ?? undefined,
    use_market_diversion: row.use_market_diversion ?? false,
    use_warehouse_monitoring: row.use_warehouse_monitoring ?? false,
    verified_at: row.verified_at ?? undefined,
    verified_by: row.verified_by ?? undefined,
    verification_notes: row.verification_notes ?? undefined,
    additional_data: ad,
  };
}

/**
 * Custom hook for coordinator-specific sites. Uses RPC get_coordinator_site_entries when
 * possible (fewer rows, no client-side filter); falls back to MMP context for compatibility.
 */
export const useCoordinatorSites = () => {
  const { currentUser } = useAppContext();
  const { mmpFiles: contextMmpFiles, loading: contextLoading, refreshMMPFiles } = useMMP();
  const { isAdminOrSuperUser } = useUserProjects();

  const {
    data: coordinatorRows,
    isLoading: coordinatorQueryLoading,
    refetch: refetchCoordinatorQuery,
  } = useCoordinatorSiteEntriesQuery(currentUser?.id ?? null, isAdminOrSuperUser ?? false);

  const coordinatorSites = useMemo(() => {
    const rpcSites = (coordinatorRows ?? []).map(mapCoordinatorRowToSiteVisit);
    if (!currentUser?.id || !contextMmpFiles || contextLoading) {
      return rpcSites;
    }

    const allSites: SiteVisit[] = [];
    contextMmpFiles.forEach((mmp: any) => {
      if (!mmp.siteEntries || !Array.isArray(mmp.siteEntries)) return;
      mmp.siteEntries.forEach((entry: any) => {
        if (!isAdminOrSuperUser) {
          const forwardedToMe = entry.forwardedToUserId === currentUser.id;
          const assignedToMe = (entry.additionalData?.assigned_to || entry.additional_data?.assigned_to) === currentUser.id;
          const acceptedByMe = entry.accepted_by === currentUser.id;
          const workflow = entry.workflow || {};
          const forwardedIds: string[] = Array.isArray(workflow.forwardedToCoordinatorIds)
            ? workflow.forwardedToCoordinatorIds
            : [];
          const listedInWorkflow = forwardedIds.includes(currentUser.id);
          if (!forwardedToMe && !assignedToMe && !acceptedByMe && !listedInWorkflow) return;
        }
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
          mmp_name: mmp.name || 'Unknown MMP',
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
    if (rpcSites.length === 0) {
      return allSites;
    }

    const merged = new Map<string, SiteVisit>();
    allSites.forEach((site) => merged.set(site.id, site));
    rpcSites.forEach((site) => merged.set(site.id, site));
    return Array.from(merged.values());
  }, [coordinatorRows, contextMmpFiles, contextLoading, currentUser?.id, isAdminOrSuperUser]);

  const siteCounts = useMemo(() => computeCounts(coordinatorSites), [coordinatorSites]);

  const loading = coordinatorRows !== undefined ? coordinatorQueryLoading : contextLoading;
  const refetch = refetchCoordinatorQuery;

  return {
    coordinatorSites,
    loading,
    error: null,
    siteCounts,
    refetch,
  };
};
