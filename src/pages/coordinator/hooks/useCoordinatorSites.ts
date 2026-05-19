import { useMemo } from 'react';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { useUserProjects } from '@/hooks/useUserProjects';
import { getHubAccessInfo, isStateInAnyHub } from '@/utils/hubAccessControl';
import {
  useCoordinatorSiteEntriesQuery,
  useSupervisorSiteEntriesQuery,
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
  completed_at?: string;
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
    completed_at: row.completed_at ?? (ad as any).completed_at ?? (ad as any)['Completed At'] ?? undefined,
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

  const role = (currentUser?.role || '').toLowerCase().trim();
  const isSupervisor = role === 'supervisor' || role === 'hubsupervisor' || role === 'hub_supervisor';
  const hubAccessInfo = isSupervisor ? getHubAccessInfo(currentUser) : null;

  // Supervisors use a dedicated direct query (not the coordinator RPC which filters by user_id).
  const {
    data: supervisorRows,
    isLoading: supervisorQueryLoading,
    refetch: refetchSupervisorQuery,
  } = useSupervisorSiteEntriesQuery(isSupervisor && !!currentUser?.id);

  // Coordinators use the coordinator-specific RPC.
  const rpcUserId = isSupervisor ? null : currentUser?.id ?? null;
  const {
    data: coordinatorRows,
    isLoading: coordinatorQueryLoading,
    refetch: refetchCoordinatorQuery,
  } = useCoordinatorSiteEntriesQuery(rpcUserId, isAdminOrSuperUser ?? false);

  const allowedSupervisorStatuses = useMemo(() => new Set([
    // Pre-pipeline
    'pending',
    'inprogress',
    'in_progress',
    'forwarded',
    'forwarded_to_coordinator',
    'forwarded_to_coordinators',
    'new',
    'dispatched',
    'assigned',
    'accepted',
    // Permit/cp verification + post verification
    'permits_attached',
    'cp_verified',
    'cp_verification',
    'locality_permit_verified',
    'verified',
    'approved',
    'approved_and_costed',
    'costed',
    'completed',
    'rejected',
    'returned_to_fom',
  ]), []);

  const coordinatorSites = useMemo(() => {
    // Supervisors: use dedicated direct query results and filter by hub + status.
    if (isSupervisor) {
      const rows = supervisorRows ?? [];
      const supervisorHubIds = hubAccessInfo?.hubIds ?? [];
      const canApplyHubFilter =
        hubAccessInfo?.isHubSupervisor &&
        supervisorHubIds.length > 0 &&
        (hubAccessInfo.hubStates.length > 0 || hubAccessInfo.hubStateNames.length > 0);

      // Build hub state names for fuzzy matching (handles "Khartoum" matching "Khartoum State")
      const hubStateNamesNorm = (hubAccessInfo?.hubStateNames ?? []).map(n =>
        n.toLowerCase().trim().replace(/\s+state$/i, '').replace(/\s+/g, ' '));
      const hubStateIdsNorm = (hubAccessInfo?.hubStates ?? []).map(s =>
        s.toLowerCase().replace(/-state$/, '').replace(/-/g, ' ').trim());

      const filtered = rows
        .map(mapCoordinatorRowToSiteVisit)
        .filter(site => {
          const normalizedStatus = (site.status || '').toLowerCase().trim().replace(/\s+/g, '_');
          // Status filter
          if (!allowedSupervisorStatuses.has(normalizedStatus)) return false;
          // Hub filter — skip if no hub info is available
          if (!canApplyHubFilter) return true;
          // Exact match via utility
          const stateMatch = site.state ? isStateInAnyHub(site.state, supervisorHubIds) : false;
          if (stateMatch) return true;
          // Fuzzy partial match — handles "Khartoum" ↔ "Khartoum State" / "khartoum-state"
          if (site.state) {
            const sn = site.state.toLowerCase().trim().replace(/\s+state$/i, '').replace(/\s+/g, ' ');
            if (hubStateNamesNorm.some(h => h === sn || h.includes(sn) || sn.includes(h))) return true;
            if (hubStateIdsNorm.some(h => h === sn || h.includes(sn) || sn.includes(h))) return true;
          }
          // hub_office field match
          const hubOfficeMatch = site.hub_office
            ? supervisorHubIds.some(hid =>
                site.hub_office!.toLowerCase().includes(hid.toLowerCase()) ||
                hid.toLowerCase().includes(site.hub_office!.toLowerCase()))
            : false;
          return hubOfficeMatch;
        });

      return filtered;
    }

    // Coordinator path: use coordinator RPC results, fall back to MMP context.
    const rpcSites = (coordinatorRows ?? []).map(mapCoordinatorRowToSiteVisit);
    if (!currentUser?.id || !contextMmpFiles || contextLoading) {
      return rpcSites;
    }

    const allSites: SiteVisit[] = [];
    // supervisorHubIds is empty here: supervisors reach this path only when the RPC
    // returned 0 rows, so we fall back to context with no hub filter applied.
    const supervisorHubIds: string[] = [];

    contextMmpFiles.forEach((mmp: any) => {
      if (!mmp.siteEntries || !Array.isArray(mmp.siteEntries)) return;
      mmp.siteEntries.forEach((entry: any) => {
        if (!isAdminOrSuperUser) {
          // Supervisors: filter by hub/state access + pipeline statuses.
          if (isSupervisor) {
            const normalizedStatus = (entry.status || '')
              .toLowerCase()
              .trim()
              .replace(/\s+/g, '_');
            if (!allowedSupervisorStatuses.has(normalizedStatus)) return;

            // Apply hub filter only when the supervisor has a valid hub assignment.
            // If hub info is missing/incomplete, fall through and show all-status entries
            // (mirrors MMP management page behaviour which also skips hub filter when unavailable).
            const canApplyHubFilter =
              hubAccessInfo?.isHubSupervisor &&
              supervisorHubIds.length > 0 &&
              (hubAccessInfo.hubStates.length > 0 || hubAccessInfo.hubStateNames.length > 0);

            if (canApplyHubFilter) {
              const entryStateName = (entry.state || entry.state_name || entry.stateName || '').toString();
              const entryHubOffice = (entry.hubOffice || entry.hub_office || '').toString();
              const stateMatch = entryStateName ? isStateInAnyHub(entryStateName, supervisorHubIds) : false;
              // Also allow matching via hub_office name (e.g. "Khartoum Hub")
              const hubOfficeMatch = entryHubOffice
                ? supervisorHubIds.some(hid => entryHubOffice.toLowerCase().includes(hid.toLowerCase()) || hid.toLowerCase().includes(entryHubOffice.toLowerCase()))
                : false;
              if (!stateMatch && !hubOfficeMatch) return;
            }
            // If canApplyHubFilter is false, include the entry (no hub filter available)
          } else {
            // Coordinators: keep strict "assigned/forwarded/accepted" ownership filter.
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
  }, [
    supervisorRows,
    coordinatorRows,
    contextMmpFiles,
    contextLoading,
    currentUser?.id,
    currentUser?.role,
    (currentUser as any)?.hubId,
    (currentUser as any)?.secondaryHubId,
    isAdminOrSuperUser,
    isSupervisor,
    hubAccessInfo?.hubIds.join('|'),
    allowedSupervisorStatuses,
  ]);

  const siteCounts = useMemo(() => computeCounts(coordinatorSites), [coordinatorSites]);

  const loading = isSupervisor
    ? supervisorQueryLoading
    : coordinatorRows !== undefined ? coordinatorQueryLoading : contextLoading;
  const refetch = isSupervisor ? refetchSupervisorQuery : refetchCoordinatorQuery;

  return {
    coordinatorSites,
    loading,
    error: null,
    siteCounts,
    refetch,
  };
};
