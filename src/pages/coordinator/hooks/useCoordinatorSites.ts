import { useMemo } from 'react';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { useUserProjects } from '@/hooks/useUserProjects';

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
 * Custom hook to filter and transform coordinator-specific sites from MMP context data
 * Following the same pattern as MMP.tsx for data filtering
 */
export const useCoordinatorSites = () => {
  const { currentUser } = useAppContext();
  const { mmpFiles: contextMmpFiles, loading: contextLoading } = useMMP();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();

  const coordinatorSites = useMemo(() => {
    if (!currentUser?.id || !contextMmpFiles || contextLoading) return [];
    
    // Non-admin users with no project assignments should see nothing
    if (!isAdminOrSuperUser && userProjectIds.length === 0) {
      return [];
    }

    const allSites: SiteVisit[] = [];
    
    // Collect all site entries from context that are forwarded to this coordinator
    contextMmpFiles.forEach((mmp: any) => {
      if (!mmp.siteEntries || !Array.isArray(mmp.siteEntries)) return;
      
      mmp.siteEntries.forEach((entry: any) => {
        // Filter by forwarded_to_user_id
        if (entry.forwardedToUserId !== currentUser.id) return;
        
        // Exclude sites that have been returned to FOM
        if (entry.status === 'returned_to_fom') return;
        
        // For non-admins, also check project membership
        if (!isAdminOrSuperUser) {
          const projectId = mmp.projectId;
          if (!projectId || !userProjectIds.includes(projectId)) return;
        }

        // Transform entry to SiteVisit format
        const isUnverified = entry.status === 'Pending' || entry.status === 'Dispatched' || 
                            entry.status === 'assigned' || entry.status === 'inProgress' || 
                            entry.status === 'in_progress';
        const visitDate = isUnverified ? null : entry.visitDate;

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
            ? (typeof entry.siteActivity === 'string' ? entry.siteActivity.split(', ').filter(a => a.trim() !== '') : entry.siteActivity)
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

  return {
    coordinatorSites,
    loading: contextLoading,
  };
};

