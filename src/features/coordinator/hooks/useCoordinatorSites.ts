import { useMemo } from 'react';
import { useMMP } from '@/features/mmp/context/MMPContext';
import { useAppContext } from '@/shared/context/AppContext';
import { useUserProjects } from '@/features/project/hooks/useUserProjects';
import { getHubAccessInfo, isStateInAnyHub } from '@/utils/hubAccessControl';
import {
  useCoordinatorSiteEntriesQuery,
  useSupervisorSiteEntriesQuery,
  type CoordinatorSiteEntryRow,
} from '@/features/mmp/context/mmpQueries';

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

function computeCounts(sites: SiteVisit[]): SiteEntryCounts {
  const counts: SiteEntryCounts = {
    new: 0,
    permitsAttached: 0,
    verified: 0,
    approved: 0,
    completed: 0,
    rejected: 0,
    returnedToFom: 0,
  };
  const prePipelineStatuses = ['pending', 'inprogress', 'in_progress', 'forwarded', 'forwarded_to_coordinator', 'forwarded_to_coordinators', 'new', 'dispatched', 'assigned', 'accepted'];
  sites.forEach((entry) => {
    const status = (entry.status || '').toLowerCase().trim().replace(/\s+/g, '_');
    if (status === 'returned_to_fom') counts.returnedToFom++;
    else if (prePipelineStatuses.includes(status)) counts.new++;
    else if (status === 'permits_attached' || status === 'cp_verified' || status === 'cp_verification') counts.permitsAttached++;
    else if (status === 'verified') counts.verified++;
    else if (status === 'approved' || status === 'costed' || status === 'approved_and_costed') counts.approved++;
    else if (status === 'completed') counts.completed++;
    else if (status === 'rejected') counts.rejected++;
    else counts.new++;
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

export const useCoordinatorSites = () => {
  const { currentUser } = useAppContext();
  const { mmpFiles: contextMmpFiles, loading: contextLoading, refreshMMPFiles } = useMMP();
  const { isAdminOrSuperUser } = useUserProjects();

  const role = (currentUser?.role || '').toLowerCase().trim();
  const isSupervisor = role === 'supervisor' || role === 'hubsupervisor' || role === 'hub_supervisor';
  const hubAccessInfo = isSupervisor ? getHubAccessInfo(currentUser) : null;

  const { data: supervisorRows, isLoading: supervisorQueryLoading, refetch: refetchSupervisorQuery } = useSupervisorSiteEntriesQuery(isSupervisor && !!currentUser?.id);
  const rpcUserId = isSupervisor ? null : currentUser?.id ?? null;
  const { data: coordinatorRows, isLoading: coordinatorQueryLoading, refetch: refetchCoordinatorQuery } = useCoordinatorSiteEntriesQuery(rpcUserId, isAdminOrSuperUser ?? false);

  const allowedSupervisorStatuses = useMemo(() => new Set([
    'pending', 'inprogress', 'in_progress', 'forwarded', 'forwarded_to_coordinator', 'forwarded_to_coordinators', 'new', 'dispatched', 'assigned', 'accepted',
    'permits_attached', 'cp_verified', 'cp_verification', 'locality_permit_verified', 'verified', 'approved', 'approved_and_costed', 'costed', 'completed', 'rejected', 'returned_to_fom',
  ]), []);

  const coordinatorSites = useMemo(() => {
    if (isSupervisor) {
      const rows = supervisorRows ?? [];
      const supervisorHubIds = hubAccessInfo?.hubIds ?? [];
      const canApplyHubFilter =
        hubAccessInfo?.isHubSupervisor &&
        supervisorHubIds.length > 0 &&
        (hubAccessInfo.hubStates.length > 0 || hubAccessInfo.hubStateNames.length > 0);

      const hubStateNamesNorm = (hubAccessInfo?.hubStateNames ?? []).map((n) =>
        n.toLowerCase().trim().replace(/\s+state$/i, '').replace(/\s+/g, ' ')
      );
      const hubStateIdsNorm = (hubAccessInfo?.hubStates ?? []).map((s) =>
        s.toLowerCase().replace(/-state$/, '').replace(/-/g, ' ').trim()
      );

      return rows
        .map(mapCoordinatorRowToSiteVisit)
        .filter((site) => {
          const normalizedStatus = (site.status || '').toLowerCase().trim().replace(/\s+/g, '_');
          if (!allowedSupervisorStatuses.has(normalizedStatus)) return false;
          if (!canApplyHubFilter) return true;
          const stateMatch = site.state ? isStateInAnyHub(site.state, supervisorHubIds) : false;
          if (stateMatch) return true;
          if (site.state) {
            const sn = site.state.toLowerCase().trim().replace(/\s+state$/i, '').replace(/\s+/g, ' ');
            if (hubStateNamesNorm.some((h) => h === sn || h.includes(sn) || sn.includes(h))) return true;
            if (hubStateIdsNorm.some((h) => h === sn || h.includes(sn) || sn.includes(h))) return true;
          }
          const hubOfficeMatch = site.hub_office
            ? supervisorHubIds.some((hid) =>
                site.hub_office!.toLowerCase().includes(hid.toLowerCase()) ||
                hid.toLowerCase().includes(site.hub_office!.toLowerCase()))
            : false;
          return hubOfficeMatch;
        });
    }

    const rpcSites = (coordinatorRows ?? []).map(mapCoordinatorRowToSiteVisit);
    if (!currentUser?.id || !contextMmpFiles || contextLoading) return rpcSites;

    const allSites: SiteVisit[] = [];
    const supervisorHubIds: string[] = [];

    contextMmpFiles.forEach((mmp: any) => {
      if (!mmp.siteEntries || !Array.isArray(mmp.siteEntries)) return;
      mmp.siteEntries.forEach((entry: any) => {
        if (!isAdminOrSuperUser) {
          if (isSupervisor) {
            const normalizedStatus = (entry.status || '').toLowerCase().trim().replace(/\s+/g, '_');
            if (!allowedSupervisorStatuses.has(normalizedStatus)) return;
            const canApplyHubFilter =
              hubAccessInfo?.isHubSupervisor &&
              supervisorHubIds.length > 0 &&
              (hubAccessInfo.hubStates.length > 0 || hubAccessInfo.hubStateNames.length > 0);
            if (canApplyHubFilter) {
              const entryStateName = (entry.state || entry.state_name || entry.stateName || '').toString();
              const entryHubOffice = (entry.hubOffice || entry.hub_office || '').toString();
              const stateMatch = entryStateName ? isStateInAnyHub(entryStateName, supervisorHubIds) : false;
              const hubOfficeMatch = entryHubOffice
                ? supervisorHubIds.some((hid) => entryHubOffice.toLowerCase().includes(hid.toLowerCase()) || hid.toLowerCase().includes(entryHubOffice.toLowerCase()))
                : false;
              if (!stateMatch && !hubOfficeMatch) return;
            }
          }
        }

        allSites.push({
          id: entry.id,
          site_name: entry.site_name || entry.siteName || '',
          site_code: entry.site_code || entry.siteCode || '',
          status: entry.status || '',
          state: entry.state || '',
          locality: entry.locality || '',
          activity: entry.activity || entry.main_activity || '',
          main_activity: entry.main_activity || '',
          visit_date: entry.visit_date || null,
          assigned_at: entry.assigned_at || '',
          comments: entry.comments || '',
          mmp_file_id: mmp.id,
          mmp_name: mmp.name || 'Unknown MMP',
          hub_office: entry.hub_office || '',
          cp_name: entry.cp_name || undefined,
          activity_at_site: entry.activity_at_site || undefined,
          monitoring_by: entry.monitoring_by || undefined,
          survey_tool: entry.survey_tool || undefined,
          use_market_diversion: entry.use_market_diversion ?? false,
          use_warehouse_monitoring: entry.use_warehouse_monitoring ?? false,
          verified_at: entry.verified_at || undefined,
          verified_by: entry.verified_by || undefined,
          verification_notes: entry.verification_notes || undefined,
          additional_data: entry.additional_data || {},
        });
      });
    });

    return allSites;
  }, [
    isSupervisor,
    supervisorRows,
    coordinatorRows,
    currentUser?.id,
    contextMmpFiles,
    contextLoading,
    isAdminOrSuperUser,
    allowedSupervisorStatuses,
    hubAccessInfo,
  ]);

  const counts = useMemo(() => computeCounts(coordinatorSites), [coordinatorSites]);
  const loading = (isSupervisor ? supervisorQueryLoading : coordinatorQueryLoading) || contextLoading;

  const refresh = async () => {
    await Promise.all([refetchSupervisorQuery(), refetchCoordinatorQuery(), refreshMMPFiles()]);
  };

  return {
    coordinatorSites,
    counts,
    loading,
    refresh,
  };
};

