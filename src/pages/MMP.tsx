
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Upload, ChevronLeft, Trash2 } from 'lucide-react';
import { useMMP } from '@/context/mmp/MMPContext';
import { MMPList } from '@/components/mmp/MMPList';
import { useAuthorization } from '@/hooks/use-authorization';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { SiteVisitRow } from '@/components/mmp/MMPCategorySitesTable';
import MMPSiteEntriesTable from '@/components/mmp/MMPSiteEntriesTable';
import { supabase } from '@/integrations/supabase/client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

// Using relative import fallback in case path alias resolution misses new file
import BulkClearForwardedDialog from '../components/mmp/BulkClearForwardedDialog';
import { DispatchSitesDialog } from '@/components/mmp/DispatchSitesDialog';

// Helper component to convert SiteVisitRow[] to site entries and display using MMPSiteEntriesTable
const SitesDisplayTable: React.FC<{ 
  siteRows: SiteVisitRow[]; 
  mmpId?: string;
  editable?: boolean;
  title?: string;
}> = ({ siteRows, mmpId, editable = true, title }) => {
  const [siteEntries, setSiteEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSiteEntries = async () => {
      if (siteRows.length === 0) {
        setSiteEntries([]);
        setLoading(false);
        return;
      }

      try {
        // Get unique mmp_ids from site rows
        const mmpIds = mmpId ? [mmpId] : [...new Set(siteRows.map(s => s.mmpId).filter(Boolean))];

        if (mmpIds.length === 0) {
          setSiteEntries([]);
          setLoading(false);
          return;
        }

        // Load from mmp_site_entries
        const { data: mmpEntries, error: mmpError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .in('mmp_file_id', mmpIds);

        if (mmpError) throw mmpError;

        // Load from site_visits to get verified_by and other info
        const { data: siteVisits, error: siteVisitsError } = await supabase
          .from('site_visits')
          .select('id,mmp_id,site_code,verified_by,verified_at,verification_notes,status')
          .in('mmp_id', mmpIds);

        if (siteVisitsError) console.warn('Failed to load site_visits:', siteVisitsError);

        // Create a map of site_visits by mmp_id and site_code
        const siteVisitMap = new Map<string, any>();
        (siteVisits || []).forEach(sv => {
          if (sv.mmp_id && sv.site_code) {
            siteVisitMap.set(`${sv.mmp_id}-${sv.site_code}`, sv);
          }
        });

        // Merge mmp_site_entries with site_visits data and format for MMPSiteEntriesTable
        const mergedEntries = (mmpEntries || []).map(entry => {
          const key = `${entry.mmp_file_id}-${entry.site_code}`;
          const siteVisit = siteVisitMap.get(key);
          
          return {
            ...entry,
            verified_by: siteVisit?.verified_by || undefined,
            verified_at: siteVisit?.verified_at || undefined,
            verification_notes: entry.verification_notes || siteVisit?.verification_notes || undefined,
            status: entry.status || siteVisit?.status || 'Pending',
            // Map to camelCase for MMPSiteEntriesTable
            siteName: entry.site_name,
            siteCode: entry.site_code,
            hubOffice: entry.hub_office,
            cpName: entry.cp_name,
            siteActivity: entry.activity_at_site,
            monitoringBy: entry.monitoring_by,
            surveyTool: entry.survey_tool,
            useMarketDiversion: entry.use_market_diversion,
            useWarehouseMonitoring: entry.use_warehouse_monitoring,
            visitDate: entry.visit_date,
            comments: entry.comments,
            cost: entry.cost,
            additionalData: entry.additional_data || {}
          };
        });

        setSiteEntries(mergedEntries);
      } catch (error) {
        console.error('Failed to load site entries:', error);
        setSiteEntries([]);
      } finally {
        setLoading(false);
      }
    };

    loadSiteEntries();
  }, [siteRows, mmpId]);

  if (loading) {
    return (
      <div className="mt-6">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">Loading sites...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (siteEntries.length === 0) {
    return (
      <div className="mt-6">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">No sites found.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {title && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
      )}
      <MMPSiteEntriesTable 
        siteEntries={siteEntries} 
        editable={editable}
        onUpdateSites={async (sites) => {
          // Update mmp_site_entries in database
          try {
            for (const site of sites) {
              // Get fees values
              const enumFee = site.enumerator_fee ?? site.enumeratorFee;
              const transFee = site.transport_fee ?? site.transportFee;
              
              // Always calculate cost from fees if both are present
              let calculatedCost: number | undefined;
              if (enumFee !== undefined && transFee !== undefined) {
                calculatedCost = Number(enumFee) + Number(transFee);
              }
              
              // Use calculated cost if available, otherwise use provided cost
              const finalCost = calculatedCost ?? site.cost;
              
              // Build additional_data with fees
              const existingAdditionalData = site.additionalData || site.additional_data || {};
              const updatedAdditionalData = {
                ...existingAdditionalData,
                enumerator_fee: enumFee,
                transport_fee: transFee,
                cost: finalCost
              };
              
              const updateData: any = {
                site_name: site.siteName || site.site_name,
                site_code: site.siteCode || site.site_code,
                hub_office: site.hubOffice || site.hub_office,
                state: site.state,
                locality: site.locality,
                cp_name: site.cpName || site.cp_name,
                activity_at_site: site.siteActivity || site.activity_at_site,
                monitoring_by: site.monitoringBy || site.monitoring_by,
                survey_tool: site.surveyTool || site.survey_tool,
                use_market_diversion: site.useMarketDiversion || site.use_market_diversion,
                use_warehouse_monitoring: site.useWarehouseMonitoring || site.use_warehouse_monitoring,
                visit_date: site.visitDate || site.visit_date,
                comments: site.comments,
                cost: finalCost, // Save calculated cost to the cost column
                enumerator_fee: enumFee,
                transport_fee: transFee,
                status: site.status,
                verification_notes: site.verification_notes || site.verificationNotes,
                verified_by: site.verified_by || site.verifiedBy,
                verified_at: site.verified_at || site.verifiedAt,
                additional_data: updatedAdditionalData // Store fees in additional_data
              };

              // Remove undefined values
              Object.keys(updateData).forEach(key => {
                if (updateData[key] === undefined) delete updateData[key];
              });

              if (site.id) {
                await supabase
                  .from('mmp_site_entries')
                  .update(updateData)
                  .eq('id', site.id);
              }

              // Also update site_visits if verified_by is set
              if (site.verified_by && site.mmp_file_id && site.site_code) {
                await supabase
                  .from('site_visits')
                  .update({
                    verified_by: site.verified_by,
                    verified_at: site.verified_at || new Date().toISOString(),
                    verification_notes: site.verification_notes || site.verificationNotes,
                    status: site.status || 'verified'
                  })
                  .eq('mmp_id', site.mmp_file_id)
                  .eq('site_code', site.site_code);
              }
            }
            setSiteEntries(sites as any[]);
            return true;
          } catch (error) {
            console.error('Failed to update sites:', error);
            return false;
          }
        }}
      />
    </div>
  );
};

// Component to display verified sites using MMPSiteEntriesTable
const VerifiedSitesDisplay: React.FC<{ verifiedSites: SiteVisitRow[] }> = ({ verifiedSites }) => {
  const [verifiedSiteEntries, setVerifiedSiteEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVerifiedSites = async () => {
      if (verifiedSites.length === 0) {
        setVerifiedSiteEntries([]);
        setLoading(false);
        return;
      }

      try {
        // Get unique mmp_ids from verified sites
        const mmpIds = [...new Set(verifiedSites.map(s => s.mmpId).filter(Boolean))];

        if (mmpIds.length === 0) {
          setVerifiedSiteEntries([]);
          setLoading(false);
          return;
        }

        // Load from mmp_site_entries
        const { data: mmpEntries, error: mmpError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .in('mmp_file_id', mmpIds)
          .eq('status', 'Verified');

        if (mmpError) throw mmpError;

        // Load from site_visits to get verified_by
        const { data: siteVisits, error: siteVisitsError } = await supabase
          .from('site_visits')
          .select('id,mmp_id,site_code,verified_by,verified_at,verification_notes')
          .in('mmp_id', mmpIds)
          .eq('status', 'verified');

        if (siteVisitsError) console.warn('Failed to load site_visits:', siteVisitsError);

        // Create a map of site_visits by mmp_id and site_code
        const siteVisitMap = new Map<string, any>();
        (siteVisits || []).forEach(sv => {
          if (sv.mmp_id && sv.site_code) {
            siteVisitMap.set(`${sv.mmp_id}-${sv.site_code}`, sv);
          }
        });

        // Merge mmp_site_entries with site_visits data and format for MMPSiteEntriesTable
        const mergedEntries = (mmpEntries || []).map(entry => {
          const key = `${entry.mmp_file_id}-${entry.site_code}`;
          const siteVisit = siteVisitMap.get(key);
          
          return {
            ...entry,
            verified_by: siteVisit?.verified_by || undefined,
            verified_at: siteVisit?.verified_at || undefined,
            verification_notes: entry.verification_notes || siteVisit?.verification_notes || undefined,
            // Map to camelCase for MMPSiteEntriesTable
            siteName: entry.site_name,
            siteCode: entry.site_code,
            hubOffice: entry.hub_office,
            cpName: entry.cp_name,
            siteActivity: entry.activity_at_site,
            monitoringBy: entry.monitoring_by,
            surveyTool: entry.survey_tool,
            useMarketDiversion: entry.use_market_diversion,
            useWarehouseMonitoring: entry.use_warehouse_monitoring,
            visitDate: entry.visit_date,
            comments: entry.comments,
            cost: entry.cost,
            additionalData: entry.additional_data || {}
          };
        });

        setVerifiedSiteEntries(mergedEntries);
      } catch (error) {
        console.error('Failed to load verified sites:', error);
        setVerifiedSiteEntries([]);
      } finally {
        setLoading(false);
      }
    };

    loadVerifiedSites();
  }, [verifiedSites]);

  if (loading) {
    return (
      <div className="mt-6">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">Loading verified sites...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (verifiedSiteEntries.length === 0) {
    return (
      <div className="mt-6">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">No verified sites found.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <MMPSiteEntriesTable 
        siteEntries={verifiedSiteEntries} 
        editable={true}
        onUpdateSites={async (sites) => {
          // Update mmp_site_entries in database
          try {
            for (const site of sites) {
              // Get fees values
              const enumFee = site.enumerator_fee ?? site.enumeratorFee;
              const transFee = site.transport_fee ?? site.transportFee;
              
              // Always calculate cost from fees if both are present
              let calculatedCost: number | undefined;
              if (enumFee !== undefined && transFee !== undefined) {
                calculatedCost = Number(enumFee) + Number(transFee);
              }
              
              // Use calculated cost if available, otherwise use provided cost
              const finalCost = calculatedCost ?? site.cost;
              
              // Build additional_data with fees
              const existingAdditionalData = site.additionalData || site.additional_data || {};
              const updatedAdditionalData = {
                ...existingAdditionalData,
                enumerator_fee: enumFee,
                transport_fee: transFee,
                cost: finalCost
              };
              
              const updateData: any = {
                site_name: site.siteName || site.site_name,
                site_code: site.siteCode || site.site_code,
                hub_office: site.hubOffice || site.hub_office,
                state: site.state,
                locality: site.locality,
                cp_name: site.cpName || site.cp_name,
                activity_at_site: site.siteActivity || site.activity_at_site,
                monitoring_by: site.monitoringBy || site.monitoring_by,
                survey_tool: site.surveyTool || site.survey_tool,
                use_market_diversion: site.useMarketDiversion || site.use_market_diversion,
                use_warehouse_monitoring: site.useWarehouseMonitoring || site.use_warehouse_monitoring,
                visit_date: site.visitDate || site.visit_date,
                comments: site.comments,
                cost: finalCost, // Save calculated cost to the cost column
                status: site.status,
                verification_notes: site.verification_notes || site.verificationNotes,
                verified_by: site.verified_by || site.verifiedBy,
                verified_at: site.verified_at || site.verifiedAt,
                additional_data: updatedAdditionalData // Store fees in additional_data
              };

              // Remove undefined values
              Object.keys(updateData).forEach(key => {
                if (updateData[key] === undefined) delete updateData[key];
              });

              if (site.id) {
                await supabase
                  .from('mmp_site_entries')
                  .update(updateData)
                  .eq('id', site.id);
              }

              // Also update site_visits if verified_by is set
              if (site.verified_by && site.mmp_file_id && site.site_code) {
                await supabase
                  .from('site_visits')
                  .update({
                    verified_by: site.verified_by,
                    verified_at: site.verified_at || new Date().toISOString(),
                    verification_notes: site.verification_notes || site.verificationNotes,
                    status: site.status || 'verified'
                  })
                  .eq('mmp_id', site.mmp_file_id)
                  .eq('site_code', site.site_code);
              }
            }
            setVerifiedSiteEntries(sites as any[]);
            return true;
          } catch (error) {
            console.error('Failed to update verified sites:', error);
            return false;
          }
        }}
      />
    </div>
  );
};

const MMP = () => {
  const navigate = useNavigate();
  const { mmpFiles, loading, updateMMP } = useMMP();
  const { checkPermission, hasAnyRole, currentUser } = useAuthorization();
  const [activeTab, setActiveTab] = useState('new');
  // Subcategory state for Forwarded MMPs (Admin/ICT only)
  const [forwardedSubTab, setForwardedSubTab] = useState<'pending' | 'verified'>('pending');
  // Subcategory state for Verified Sites (Admin/ICT only)
  const [verifiedSubTab, setVerifiedSubTab] = useState<'newSites' | 'approvedCosted' | 'dispatched' | 'completed'>('newSites');
  // Subcategory state for New MMPs (FOM only)
  const [newFomSubTab, setNewFomSubTab] = useState<'pending' | 'verified'>('pending');
  const [siteVisitStats, setSiteVisitStats] = useState<Record<string, {
    exists: boolean;
    hasCosted: boolean;
    hasAssigned: boolean;
    hasInProgress: boolean;
    hasCompleted: boolean;
    hasRejected: boolean;
    hasDispatched: boolean;
    allApprovedAndCosted: boolean;
  }>>({});
  const [siteVisitRows, setSiteVisitRows] = useState<SiteVisitRow[]>([]);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [approvedCostedSiteEntries, setApprovedCostedSiteEntries] = useState<any[]>([]);
  const [loadingApprovedCosted, setLoadingApprovedCosted] = useState(false);
  const [approvedCostedCount, setApprovedCostedCount] = useState(0);
  const [dispatchedSiteEntries, setDispatchedSiteEntries] = useState<any[]>([]);
  const [loadingDispatched, setLoadingDispatched] = useState(false);
  const [dispatchedCount, setDispatchedCount] = useState(0);
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [dispatchType, setDispatchType] = useState<'state' | 'locality' | 'individual'>('state');

  // Helper function to normalize role checking (handles both lowercase and proper case)
  const hasRole = (rolesToCheck: string[]) => {
    if (!currentUser) return false;
    
    // Get user's role (single) and roles (array) - normalize to lowercase for comparison
    const userRole = currentUser.role?.toLowerCase() || '';
    const userRoles = (currentUser.roles || []).map(r => r.toLowerCase());
    
    // Check if any of the provided roles match
    return rolesToCheck.some(role => {
      const normalizedRole = role.toLowerCase();
      return userRole === normalizedRole || userRoles.includes(normalizedRole);
    });
  };

  const isAdmin = hasRole(['Admin', 'admin']);
  const isICT = hasRole(['ICT', 'ict']);
  const isFOM = hasRole(['Field Operation Manager (FOM)', 'fom', 'field operation manager']);
  const isCoordinator = hasRole(['Coordinator', 'coordinator']);
  const canRead = checkPermission('mmp', 'read') || isAdmin || isFOM || isCoordinator || isICT;
  const canCreate = (checkPermission('mmp', 'create') || isAdmin || isICT);

  // Debug: Log role checks
  useEffect(() => {
    if (currentUser) {
      console.log('🔍 MMP Page - Current User:', currentUser);
      console.log('🔍 User Role:', currentUser.role);
      console.log('🔍 User Roles Array:', currentUser.roles);
      console.log('🔍 isAdmin:', isAdmin);
      console.log('🔍 isICT:', isICT);
      console.log('🔍 isFOM:', isFOM);
      console.log('🔍 isCoordinator:', isCoordinator);
      console.log('🔍 canCreate:', canCreate);
    }
  }, [currentUser, isAdmin, isICT, isFOM, isCoordinator, canCreate]);

  // Set initial active tab based on role
  useEffect(() => {
    if (isCoordinator) {
      setActiveTab('verified');
    } else {
      setActiveTab('new');
    }
  }, [isCoordinator]);

  // Categorize MMPs
  const categorizedMMPs = useMemo(() => {
    let filteredMMPs = mmpFiles;

    // For FOM users, only show MMPs forwarded to them or their verified MMPs
    if (isFOM && currentUser) {
      filteredMMPs = mmpFiles.filter(mmp => {
        const workflow = mmp.workflow as any;
        const forwardedToFomIds = workflow?.forwardedToFomIds || [];
        const isForwardedToThisFOM = forwardedToFomIds.includes(currentUser.id);
        
        // Include MMPs forwarded to this FOM or verified MMPs under this FOM
        return isForwardedToThisFOM || mmp.type === 'verified-template';
      });
    }

    // For Coordinator users, show verified MMPs that contain sites they can verify
    if (isCoordinator && currentUser) {
      filteredMMPs = mmpFiles.filter(mmp => 
        mmp.type === 'verified-template' || 
        mmp.status === 'approved' ||
        ((mmp.workflow as any)?.currentStage && ['permitsVerified', 'cpVerification', 'completed'].includes((mmp.workflow as any)?.currentStage))
      );
    }

    const newMMPs = filteredMMPs.filter(mmp => {
      if (isFOM) {
        // For FOM: New MMPs are those forwarded to them that haven't been processed yet
        const workflow = mmp.workflow as any;
        const forwardedToFomIds = workflow?.forwardedToFomIds || [];
        // Keep showing items forwarded to this FOM under "New MMPs" until they are forwarded to coordinators
        return forwardedToFomIds.includes(currentUser?.id || '') &&
               workflow?.forwardedToCoordinators !== true;
      } else if (isCoordinator) {
        // For Coordinator: They don't see "new" MMPs, only verified ones with sites to verify
        return false;
      } else if (isAdmin || isICT) {
        // For admin/ICT: New MMPs are those uploaded but not forwarded to any FOM yet
        return mmp.status === 'pending' && 
               (!(mmp.workflow as any)?.forwardedToFomIds || (mmp.workflow as any)?.forwardedToFomIds.length === 0);
      }
      return false;
    });
    
    const forwardedMMPs = filteredMMPs.filter(mmp => {
      if (isFOM) {
        // For FOM: Forwarded means MMPs they've processed and sent to coordinators
        const workflow = mmp.workflow as any;
        return workflow?.forwardedToCoordinators === true ||
               workflow?.currentStage === 'coordinatorReview';
      } else if (isCoordinator) {
        // For Coordinator: They don't have a "forwarded" category
        return false;
      } else if (isAdmin || isICT) {
        // For admin/ICT: Forwarded means MMPs that have been forwarded to FOMs
        return (mmp.workflow as any)?.forwardedToFomIds && (mmp.workflow as any)?.forwardedToFomIds.length > 0;
      }
      return false;
    });
    
    const verifiedMMPs = filteredMMPs.filter(mmp => {
      if (isCoordinator) {
        // For Coordinator: Show MMPs that have been forwarded to coordinators
        return (mmp.workflow as any)?.forwardedToCoordinators === true;
      } else if (isFOM) {
        // For FOM: Verified means MMPs with sites available for verification
        return mmp.type === 'verified-template' || 
               mmp.status === 'approved' ||
               ((mmp.workflow as any)?.currentStage && ['permitsVerified', 'cpVerification', 'completed'].includes((mmp.workflow as any)?.currentStage));
      } else {
        // For admin/other roles: keep existing logic
        return mmp.status === 'approved' || 
               mmp.type === 'verified-template' ||
               ((mmp.workflow as any)?.currentStage && ['permitsVerified', 'cpVerification', 'completed'].includes((mmp.workflow as any)?.currentStage));
      }
    });

    return {
      new: newMMPs,
      forwarded: forwardedMMPs,
      verified: verifiedMMPs
    };
  }, [mmpFiles, isFOM, currentUser]);

  // Forwarded subcategories for Admin/ICT view (Removed Rejected)
  const forwardedSubcategories = useMemo(() => {
    const base = categorizedMMPs.forwarded || [];
    const pending = base.filter(mmp => {
      const hasFederalPermit = Boolean(mmp.permits && (mmp.permits as any).federal);
      return !hasFederalPermit && mmp.status !== 'approved' && mmp.status !== 'rejected';
    });
    const verified = base.filter(mmp => mmp.status === 'approved');
    return { pending, verified };
  }, [categorizedMMPs.forwarded]);

  // New MMP subcategories for FOM (Removed Rejected)
  const newFomSubcategories = useMemo(() => {
    if (!isFOM) return { pending: [], verified: [] } as Record<string, typeof categorizedMMPs.new>;
    const base = categorizedMMPs.new || [];
    const pending = base.filter(mmp => mmp.status !== 'approved' && mmp.status !== 'rejected');
    const verified = base.filter(mmp => mmp.status === 'approved');
    return { pending, verified };
  }, [isFOM, categorizedMMPs.new]);

  // Always load the count for the badge, regardless of active tab
  useEffect(() => {
    const loadApprovedCostedCount = async () => {
      try {
        // Use database count instead of loading all entries
        // Count entries with status = 'verified' (case-insensitive) using ilike
        const { count, error } = await supabase
          .from('mmp_site_entries')
          .select('*', { count: 'exact', head: true })
          .ilike('status', 'verified');

        if (error) throw error;

        // Count verified entries (including those that will get default cost of 30)
        // We count all verified entries since they'll either have cost > 0 or get default cost
        setApprovedCostedCount(count || 0);
      } catch (error) {
        console.error('Failed to load approved and costed count:', error);
        setApprovedCostedCount(0);
      }
    };

    loadApprovedCostedCount();
  }, [mmpFiles]); // Reload when MMP files change

  // Load approved and costed site entries only when the tab is active
  useEffect(() => {
    const loadApprovedCostedEntries = async () => {
      if (verifiedSubTab !== 'approvedCosted') {
        setApprovedCostedSiteEntries([]);
        return;
      }

      setLoadingApprovedCosted(true);
      try {
        // Use database-level filtering instead of loading all entries
        // Filter at database level for status = 'verified' (case-insensitive) using ilike
        const { data: verifiedEntries, error: allError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .ilike('status', 'verified')
          .order('created_at', { ascending: false })
          .limit(1000); // Limit to 1000 entries for performance

        if (allError) throw allError;

        // Process verified entries
        let processedEntries = verifiedEntries || [];

        // Set default fees for verified entries that don't have a cost
        // Default: Enumerator fees ($20) + Transport fees ($10 minimum) = $30
        const entriesToUpdate: any[] = [];
        for (const entry of processedEntries) {
          const currentCost = entry.cost;
          const additionalData = entry.additional_data || {};
          const currentEnumFee = additionalData?.enumerator_fee;
          const currentTransFee = additionalData?.transport_fee;
          
          if (!currentCost || currentCost === 0 || currentCost === null) {
            entriesToUpdate.push({
              id: entry.id,
              cost: 30, // Total: $30
              additional_data: {
                ...additionalData,
                enumerator_fee: 20, // $20 enumerator fee
                transport_fee: 10 // $10 transport fee (minimum)
              }
            });
          } else if ((!currentEnumFee || currentEnumFee === 0) && (!currentTransFee || currentTransFee === 0)) {
            // If cost exists but fees don't, set fees based on cost
            let enumFee = 20;
            let transFee = 10;
            if (currentCost === 30) {
              enumFee = 20;
              transFee = 10;
            } else if (currentCost) {
              enumFee = currentCost - 10;
              transFee = 10;
            }
            entriesToUpdate.push({
              id: entry.id,
              additional_data: {
                ...additionalData,
                enumerator_fee: enumFee,
                transport_fee: transFee
              }
            });
          }
        }

        // Update entries that need default fees
        if (entriesToUpdate.length > 0) {
          for (const entryUpdate of entriesToUpdate) {
            await supabase
              .from('mmp_site_entries')
              .update({
                cost: entryUpdate.cost || (entryUpdate.additional_data.enumerator_fee + entryUpdate.additional_data.transport_fee),
                enumerator_fee: entryUpdate.additional_data.enumerator_fee,
                transport_fee: entryUpdate.additional_data.transport_fee,
                additional_data: entryUpdate.additional_data
              })
              .eq('id', entryUpdate.id);
          }
          // Update the local entries array with the new fees
          processedEntries = processedEntries.map(entry => {
            const update = entriesToUpdate.find(u => u.id === entry.id);
            if (update) {
              return {
                ...entry,
                cost: update.cost || (update.additional_data.enumerator_fee + update.additional_data.transport_fee),
                enumerator_fee: update.additional_data.enumerator_fee,
                transport_fee: update.additional_data.transport_fee,
                additional_data: update.additional_data
              };
            }
            return entry;
          });
        }

        // Filter to only include entries with cost > 0 (after setting defaults)
        processedEntries = processedEntries.filter(entry => {
          const cost = Number(entry.cost || 0);
          return cost > 0;
        });

        // Format entries for MMPSiteEntriesTable
        const formattedEntries = processedEntries.map(entry => {
          const additionalData = entry.additional_data || {};
          const enumFee = entry.enumerator_fee ?? additionalData.enumerator_fee;
          const transFee = entry.transport_fee ?? additionalData.transport_fee;
          return {
            ...entry,
            siteName: entry.site_name,
            siteCode: entry.site_code,
            hubOffice: entry.hub_office,
            cpName: entry.cp_name,
            siteActivity: entry.activity_at_site,
            monitoringBy: entry.monitoring_by,
            surveyTool: entry.survey_tool,
            useMarketDiversion: entry.use_market_diversion,
            useWarehouseMonitoring: entry.use_warehouse_monitoring,
            visitDate: entry.visit_date,
            comments: entry.comments,
            enumerator_fee: enumFee,
            enumeratorFee: enumFee,
            transport_fee: transFee,
            transportFee: transFee,
            cost: entry.cost,
            status: entry.status,
            additionalData: additionalData
          };
        });

        setApprovedCostedSiteEntries(formattedEntries);
        // Update count when entries are loaded
        setApprovedCostedCount(formattedEntries.length);
      } catch (error) {
        console.error('Failed to load approved and costed site entries:', error);
        setApprovedCostedSiteEntries([]);
      } finally {
        setLoadingApprovedCosted(false);
      }
    };

    loadApprovedCostedEntries();
  }, [verifiedSubTab]);

  // Load dispatched site entries only when the tab is active
  useEffect(() => {
    const loadDispatchedEntries = async () => {
      if (verifiedSubTab !== 'dispatched') {
        setDispatchedSiteEntries([]);
        return;
      }

      setLoadingDispatched(true);
      try {
        // Use database-level filtering: entries with status = 'dispatched' OR dispatched_at is not null
        // Use or() to combine conditions at database level
        const { data: dispatchedEntries, error: allError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .or('status.ilike.dispatched,dispatched_at.not.is.null')
          .order('dispatched_at', { ascending: false })
          .limit(1000); // Limit to 1000 entries for performance

        if (allError) throw allError;

        // Format entries for MMPSiteEntriesTable
        const formattedEntries = dispatchedEntries.map(entry => {
          const additionalData = entry.additional_data || {};
          // Read fees from columns first, fallback to additional_data
          const enumeratorFee = entry.enumerator_fee ?? additionalData.enumerator_fee;
          const transportFee = entry.transport_fee ?? additionalData.transport_fee;
          return {
            ...entry,
            siteName: entry.site_name,
            siteCode: entry.site_code,
            hubOffice: entry.hub_office,
            cpName: entry.cp_name,
            siteActivity: entry.activity_at_site,
            monitoringBy: entry.monitoring_by,
            surveyTool: entry.survey_tool,
            useMarketDiversion: entry.use_market_diversion,
            useWarehouseMonitoring: entry.use_warehouse_monitoring,
            visitDate: entry.visit_date,
            comments: entry.comments,
            enumerator_fee: enumeratorFee,
            enumeratorFee: enumeratorFee,
            transport_fee: transportFee,
            transportFee: transportFee,
            cost: entry.cost,
            status: entry.status,
            verified_by: entry.verified_by,
            verified_at: entry.verified_at,
            dispatched_by: entry.dispatched_by,
            dispatched_at: entry.dispatched_at,
            updated_at: entry.updated_at,
            additionalData: additionalData
          };
        });

        setDispatchedSiteEntries(formattedEntries);
        setDispatchedCount(formattedEntries.length);
      } catch (error) {
        console.error('Failed to load dispatched site entries:', error);
        setDispatchedSiteEntries([]);
        setDispatchedCount(0);
      } finally {
        setLoadingDispatched(false);
      }
    };

    loadDispatchedEntries();
  }, [verifiedSubTab]);

  // Verified subcategories for Admin/ICT
  const verifiedSubcategories = useMemo(() => {
    const base = categorizedMMPs.verified || [];
    return {
      newSites: base.filter(mmp => {
        const stage = (mmp.workflow as any)?.currentStage;
        const stats = siteVisitStats[mmp.id];
        const coordinatorVerified = Boolean((mmp.workflow as any)?.coordinatorVerified);
        // New Sites includes:
        // 1) Coordinator-verified MMPs still in early stage and pending, with no cost/dispatch/completion
        const isCoordinatorNew = coordinatorVerified && (stage === 'verified' || stage === 'draft') && mmp.status === 'pending' && !(stats?.hasCosted || stats?.hasInProgress || stats?.hasCompleted || stats?.hasRejected);
        // 2) Verified-template MMPs that have no cost/dispatch/completion/rejection yet (status may already be approved)
        const isVerifiedTemplateNew = (mmp.type === 'verified-template') && !(stats?.hasCosted || stats?.hasInProgress || stats?.hasCompleted || stats?.hasRejected);
        return isCoordinatorNew || isVerifiedTemplateNew;
      }),
      approvedCosted: base.filter(mmp => {
        const stats = siteVisitStats[mmp.id];
        // Approved & Costed: ALL site entries must have cost > 0 AND status = 'verified'
        return Boolean(stats?.allApprovedAndCosted);
      }),
      dispatched: base.filter(mmp => {
        const stats = siteVisitStats[mmp.id];
        // Dispatched: sites that have been dispatched (have site_visits created) or marked as dispatched
        // Check if any site entries are marked as 'Dispatched' or have site_visits
        return Boolean(stats?.hasInProgress || stats?.hasAssigned || stats?.hasDispatched);
      }),
      // Completed: rely on site visits completed or workflow stage
      completed: base.filter(mmp => {
        const stats = siteVisitStats[mmp.id];
        return Boolean(stats?.hasCompleted) || (mmp.workflow as any)?.currentStage === 'completed';
      })
    };
  }, [categorizedMMPs.verified, siteVisitStats]);

  // Build unified site rows (site_visits + fallback to mmp.siteEntries) for given MMP list
  const buildSiteRowsFromMMPs = (mmps: any[], filterFn?: (row: SiteVisitRow) => boolean): SiteVisitRow[] => {
    const rows: SiteVisitRow[] = [];
    const existingIds = new Set(siteVisitRows.map(r => r.mmpId));
    for (const mmp of mmps) {
      // Use siteEntries when we don't yet have site_visits for this MMP
      if (!existingIds.has(mmp.id) && Array.isArray(mmp.siteEntries)) {
        for (const se of mmp.siteEntries) {
          const row: SiteVisitRow = {
            id: se.id || `${mmp.id}-site-${rows.length}`,
            mmpId: mmp.id,
            siteName: se.siteName || se.siteCode || se.state || 'Site',
            siteCode: se.siteCode,
            state: se.state,
            locality: se.locality,
            status: (se.status || 'pending'),
            feesTotal: 0,
            assignedAt: undefined,
            completedAt: undefined,
            rejectionReason: undefined,
          };
          if (!filterFn || filterFn(row)) {
            rows.push(row);
          }
        }
      }
    }
    // Merge with siteVisitRows restricted to those MMPs
    const visitRows = siteVisitRows.filter(r => {
      const matchesMMP = mmps.find(m => m.id === r.mmpId);
      if (!matchesMMP) return false;
      return !filterFn || filterFn(r);
    });
    return [...visitRows, ...rows];
  };

  // Always calculate verified sites count for "newSites" subcategory (for badge display)
  const newSitesVerifiedCount = useMemo(() => {
    const allVerifiedMMPs = categorizedMMPs.verified || [];
    
    if (allVerifiedMMPs.length === 0) return 0;
    
    // Filter to only count verified sites from any MMP
    const verifiedSites = buildSiteRowsFromMMPs(allVerifiedMMPs, (row) => {
      // Show sites that are verified (from site_visits or mmp_site_entries)
      // Check both lowercase and capitalized versions
      const status = row.status?.toLowerCase() || '';
      return status === 'verified';
    });
    
    return verifiedSites.length;
  }, [categorizedMMPs.verified, siteVisitRows]);

  // Verified site rows per subcategory (all roles seeing Verified tab)
  const verifiedCategorySiteRows = useMemo(() => {
    const subKey = verifiedSubTab;
    
    // For "newSites" subcategory, get all MMPs with verified sites
    if (subKey === 'newSites') {
      // Get all MMPs from verified category (they may or may not be marked coordinatorVerified yet)
      const allVerifiedMMPs = categorizedMMPs.verified || [];
      
      if (allVerifiedMMPs.length === 0) return [];
      
      // Filter to only show verified sites from any MMP
      const verifiedSites = buildSiteRowsFromMMPs(allVerifiedMMPs, (row) => {
        // Show sites that are verified (from site_visits or mmp_site_entries)
        // Check both lowercase and capitalized versions
        const status = row.status?.toLowerCase() || '';
        return status === 'verified';
      });
      
      // Only return sites that are actually verified
      return verifiedSites;
    }
    
    // For "dispatched" subcategory, filter to only show dispatched entries
    if (subKey === 'dispatched') {
      const mmps = verifiedSubcategories[subKey] || [];
      if (mmps.length === 0) return [];
      
      // Filter to only show entries with dispatched status
      const dispatchedSites = buildSiteRowsFromMMPs(mmps, (row) => {
        const status = row.status?.toLowerCase() || '';
        // Show entries with status = 'dispatched' or entries that have dispatched_at set
        return status === 'dispatched' || (row as any).dispatched_at !== undefined;
      });
      
      return dispatchedSites;
    }
    
    const mmps = verifiedSubcategories[subKey] || [];
    if (mmps.length === 0) return [];
    return buildSiteRowsFromMMPs(mmps);
  }, [verifiedSubTab, verifiedSubcategories, categorizedMMPs.verified, siteVisitRows]);

  // Group verified site rows by MMP for display
  const verifiedVisibleMMPs = useMemo(() => {
    // For "newSites" subcategory, show all MMPs that have verified sites
    if (verifiedSubTab === 'newSites') {
      // Use the verifiedCategorySiteRows which already has the filtered verified sites
      const verifiedSites = verifiedCategorySiteRows;
      
      // Get unique MMP IDs from verified sites
      const mmpIdsWithVerifiedSites = new Set(verifiedSites.map(s => s.mmpId));
      
      // Return only MMPs that have verified sites
      const allVerifiedMMPs = categorizedMMPs.verified || [];
      return allVerifiedMMPs.filter(mmp => mmpIdsWithVerifiedSites.has(mmp.id));
    }
    
    return (isAdmin || isICT || isFOM || isCoordinator)
      ? (verifiedSubcategories[verifiedSubTab] || [])
      : (categorizedMMPs.verified || []);
  }, [isAdmin, isICT, isFOM, isCoordinator, verifiedSubTab, verifiedSubcategories, categorizedMMPs.verified, verifiedCategorySiteRows]);

  const verifiedGroupedRows = useMemo(() => {
    // For "newSites" subcategory, filter to only show verified sites
    const filterFn = verifiedSubTab === 'newSites' 
      ? (row: SiteVisitRow) => {
          const status = row.status?.toLowerCase() || '';
          return status === 'verified';
        }
      : undefined;
    
    return verifiedVisibleMMPs.map(m => ({
      mmp: m,
      rows: buildSiteRowsFromMMPs([m], filterFn),
    }));
  }, [verifiedVisibleMMPs, verifiedSubTab, siteVisitRows]);

  // Forwarded site rows per subcategory (FOM only for site data)
  const forwardedCategorySiteRows = useMemo(() => {
    if (!isFOM) return [] as SiteVisitRow[];
    const mmps = forwardedSubcategories[forwardedSubTab] || [];
    if (mmps.length === 0) return [];
    return buildSiteRowsFromMMPs(mmps);
  }, [isFOM, forwardedSubTab, forwardedSubcategories, siteVisitRows]);

  // Aggregated site entries (raw MMP.siteEntries) for Forwarded section
  const forwardedEntries = useMemo(() => {
    const mmps = (isAdmin || isICT || isFOM) ? (forwardedSubcategories[forwardedSubTab] || []) : (categorizedMMPs.forwarded || []);
    const entries: any[] = [];
    for (const m of mmps) {
      const list = (m as any).siteEntries || [];
      if (Array.isArray(list)) {
        list.forEach((se: any, idx: number) => {
          entries.push({
            ...se,
            __mmpId: m.id,
            __siteIndex: idx,
            _key: se?.id || se?.siteCode || `${m.id}-site-${idx}`,
          });
        });
      }
    }
    return entries;
  }, [isAdmin, isICT, isFOM, forwardedSubTab, forwardedSubcategories, categorizedMMPs.forwarded]);

  // - Coordinator: Verified only
  useEffect(() => {
    const loadStats = async () => {
      if (!(isAdmin || isICT || isFOM || isCoordinator)) return;
      let list: any[] = [];
      if (isFOM) {
        list = [ ...(categorizedMMPs.verified || []), ...(categorizedMMPs.forwarded || []) ];
      } else if (isAdmin || isICT || isCoordinator) {
        list = [ ...(categorizedMMPs.verified || []) ];
      }
      if (list.length === 0) {
        setSiteVisitStats({});
        return;
      }
      const ids = list.map(m => m.id);
      try {
        // Load from site_visits
        const { data: siteVisitsData, error: siteVisitsError } = await supabase
          .from('site_visits')
          .select('id,mmp_id,status,fees,site_name,site_code,state,locality,assigned_at,completed_at,rejection_reason,verified_by,verified_at')
          .in('mmp_id', ids);
        if (siteVisitsError) throw siteVisitsError;
        
        // Load ALL mmp_site_entries (not just verified) to check cost and status for "Approved & Costed"
        const { data: mmpEntriesData, error: mmpEntriesError } = await supabase
          .from('mmp_site_entries')
          .select('id,mmp_file_id,status,site_code,state,locality,site_name,verification_notes,cost')
          .in('mmp_file_id', ids);
        if (mmpEntriesError) console.warn('Failed to load mmp_site_entries:', mmpEntriesError);
        
        const map: Record<string, {
          exists: boolean; hasCosted: boolean; hasAssigned: boolean; hasInProgress: boolean; hasCompleted: boolean; hasRejected: boolean; hasDispatched: boolean; allApprovedAndCosted: boolean;
        }> = {};
        const rows: SiteVisitRow[] = [];
        const siteVisitMap = new Map<string, SiteVisitRow>();
        
        // Initialize map for all MMPs
        for (const id of ids) {
          if (!map[id]) {
            map[id] = { exists: false, hasCosted: false, hasAssigned: false, hasInProgress: false, hasCompleted: false, hasRejected: false, hasDispatched: false, allApprovedAndCosted: false };
          }
        }
        
        // Process site_visits
        for (const row of (siteVisitsData || []) as any[]) {
          const id = row.mmp_id;
          if (!map[id]) {
            map[id] = { exists: false, hasCosted: false, hasAssigned: false, hasInProgress: false, hasCompleted: false, hasRejected: false, hasDispatched: false, allApprovedAndCosted: false };
          }
          map[id].exists = true;
          const status = String(row.status || '').toLowerCase();
          if (status === 'assigned') map[id].hasAssigned = true;
          if (status === 'inprogress' || status === 'accepted') map[id].hasInProgress = true;
          if (status === 'completed') map[id].hasCompleted = true;
          if (status === 'rejected' || status === 'declined') map[id].hasRejected = true;
          const fees = row.fees || {};
          const total = Number(fees.total || 0);
          if (total > 0) map[id].hasCosted = true;
          
          const siteRow: SiteVisitRow = {
            id: row.id,
            mmpId: row.mmp_id,
            siteName: row.site_name || row.site_code || row.id,
            siteCode: row.site_code || undefined,
            state: row.state || undefined,
            locality: row.locality || undefined,
            status: row.status || 'unknown',
            feesTotal: total,
            assignedAt: row.assigned_at || undefined,
            completedAt: row.completed_at || undefined,
            rejectionReason: row.rejection_reason || undefined,
            verifiedBy: row.verified_by || undefined,
            verifiedAt: row.verified_at || undefined,
          };
          rows.push(siteRow);
          // Map by mmp_id and site_code for merging
          if (row.site_code) {
            siteVisitMap.set(`${row.mmp_id}-${row.site_code}`, siteRow);
          }
        }
        
        // Process mmp_site_entries - add verified sites that might not be in site_visits
        // Also check if all entries are approved and costed, and check for dispatched status
        const entriesByMmp = new Map<string, any[]>();
        for (const entry of (mmpEntriesData || []) as any[]) {
          const mmpId = entry.mmp_file_id;
          if (!entriesByMmp.has(mmpId)) {
            entriesByMmp.set(mmpId, []);
          }
          entriesByMmp.get(mmpId)!.push(entry);
          
          const key = `${entry.mmp_file_id}-${entry.site_code}`;
          // If we don't have this site in site_visits, add it from mmp_site_entries
          if (!siteVisitMap.has(key)) {
            const siteRow: SiteVisitRow = {
              id: entry.id || `${entry.mmp_file_id}-${entry.site_code}`,
              mmpId: entry.mmp_file_id,
              siteName: entry.site_name || entry.site_code || 'Site',
              siteCode: entry.site_code || undefined,
              state: entry.state || undefined,
              locality: entry.locality || undefined,
              status: entry.status || 'Pending', // Use actual status from mmp_site_entries
              feesTotal: Number(entry.cost || 0),
              verifiedBy: undefined, // mmp_site_entries doesn't have verified_by, will need to get from site_visits if exists
              verifiedAt: undefined,
            };
            rows.push(siteRow);
            siteVisitMap.set(key, siteRow);
          } else {
            // Update existing row with verified status if it's verified in mmp_site_entries
            const existingRow = siteVisitMap.get(key);
            if (existingRow && entry.status === 'Verified' && existingRow.status?.toLowerCase() !== 'verified') {
              existingRow.status = 'Verified';
            }
            // Update cost if available
            if (entry.cost && Number(entry.cost) > 0) {
              existingRow.feesTotal = Number(entry.cost);
            }
          }
        }
        
        // Check if all entries for each MMP are approved and costed, and check for dispatched status
        for (const [mmpId, entries] of entriesByMmp.entries()) {
          if (!map[mmpId]) {
            map[mmpId] = { exists: false, hasCosted: false, hasAssigned: false, hasInProgress: false, hasCompleted: false, hasRejected: false, hasDispatched: false, allApprovedAndCosted: false };
          }
          
          // For "Approved & Costed", ALL entries must have cost > 0 AND status = 'verified'
          if (entries.length > 0) {
            const allApprovedAndCosted = entries.every(entry => {
              const cost = Number(entry.cost || 0);
              const status = String(entry.status || '').toLowerCase();
              return cost > 0 && status === 'verified';
            });
            map[mmpId].allApprovedAndCosted = allApprovedAndCosted;
            
            // Check if any entry is dispatched
            const hasDispatched = entries.some(entry => {
              const status = String(entry.status || '').toLowerCase();
              return status === 'dispatched';
            });
            if (hasDispatched) {
              map[mmpId].hasDispatched = true;
            }
          }
        }
        
        setSiteVisitStats(map);
        setSiteVisitRows(rows);
      } catch (e) {
        console.warn('Failed to load site visit stats', e);
        setSiteVisitStats({});
        setSiteVisitRows([]);
      }
    };
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isICT, categorizedMMPs.verified?.length]);

  if (!canRead) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="w-full">
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-10 min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-blue-100 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 py-8 px-2 md:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-blue-600/90 to-blue-400/80 dark:from-blue-900 dark:to-blue-700 p-7 rounded-2xl shadow-xl border border-blue-100 dark:border-blue-900">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-blue-100 dark:hover:bg-blue-900/40">
            <ChevronLeft className="h-5 w-5 text-white dark:text-blue-200" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-white to-blue-200 dark:from-blue-200 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">MMP Management</h1>
            <p className="text-blue-100 dark:text-blue-200/80 font-medium">
              {isAdmin || isICT
                ? 'Upload, validate, and forward MMPs to Field Operations Managers'
                : isFOM
                  ? 'Process MMPs, attach permits, and assign sites to coordinators'
                  : isCoordinator
                    ? 'Review and verify site assignments'
                    : 'Manage your MMP files and site visits'}
            </p>
          </div>
        </div>
        {canCreate && (
          <Button className="bg-gradient-to-r from-blue-700 to-blue-500 hover:from-blue-800 hover:to-blue-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 px-6 py-2 rounded-full font-semibold" onClick={() => navigate('/mmp/upload')}>
            <Upload className="h-5 w-5 mr-2" />
            Upload MMP
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6">
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading MMP files...</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full mb-6 ${isCoordinator ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {!isCoordinator && (
                <TabsTrigger value="new" className="flex items-center gap-2 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 data-[state=active]:shadow-none">
                  New MMPs
                  <Badge variant="secondary">{categorizedMMPs.new.length}</Badge>
                </TabsTrigger>
              )}
              {!isCoordinator && (
                <TabsTrigger value="forwarded" className="flex items-center gap-2 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 data-[state=active]:shadow-none">
                  {isFOM ? 'Forwarded Sites' : 'Forwarded MMPs'}
                  <Badge variant="secondary">{categorizedMMPs.forwarded.length}</Badge>
                </TabsTrigger>
              )}
              <TabsTrigger value="verified" className="flex items-center gap-2 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 data-[state=active]:shadow-none">
                {isCoordinator ? 'MMPs to Review' : 'Verified Sites'}
                <Badge variant="secondary">{categorizedMMPs.verified.length}</Badge>
              </TabsTrigger>
            </TabsList>

            {!isCoordinator && (
              <TabsContent value="new">
                {isFOM && (
                  <div className="mb-4 flex flex-wrap gap-2 items-center">
                    <div className="text-sm font-medium text-muted-foreground mr-2">Subcategory:</div>
                    <Button variant={newFomSubTab === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setNewFomSubTab('pending')} className={newFomSubTab === 'pending' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                      MMPs Pending Verification
                      <Badge variant="secondary" className="ml-2">{newFomSubcategories.pending.length}</Badge>
                    </Button>
                    <Button variant={newFomSubTab === 'verified' ? 'default' : 'outline'} size="sm" onClick={() => setNewFomSubTab('verified')} className={newFomSubTab === 'verified' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                      Verified MMPs
                      <Badge variant="secondary" className="ml-2">{newFomSubcategories.verified.length}</Badge>
                    </Button>
                  </div>
                )}
                <MMPList mmpFiles={isFOM ? newFomSubcategories[newFomSubTab] : categorizedMMPs.new} />
              </TabsContent>
            )}

            {!isCoordinator && (
              <TabsContent value="forwarded">
                {(isAdmin || isICT || isFOM) && (
                  <div className="mb-4 flex flex-wrap gap-2 items-center">
                    <div className="text-sm font-medium text-muted-foreground mr-2">Subcategory:</div>
                    <Button variant={forwardedSubTab === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setForwardedSubTab('pending')} className={forwardedSubTab === 'pending' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                      {isFOM ? 'Sites Pending Verification' : 'MMPs Pending Verification'}
                      <Badge variant="secondary" className="ml-2">{forwardedSubcategories.pending.length}</Badge>
                    </Button>
                    <Button variant={forwardedSubTab === 'verified' ? 'default' : 'outline'} size="sm" onClick={() => setForwardedSubTab('verified')} className={forwardedSubTab === 'verified' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                      {isFOM ? 'Verified Sites' : 'Verified MMPs'}
                      <Badge variant="secondary" className="ml-2">{forwardedSubcategories.verified.length}</Badge>
                    </Button>
                  </div>
                )}
                <MMPList mmpFiles={(isAdmin || isICT || isFOM) ? forwardedSubcategories[forwardedSubTab] : categorizedMMPs.forwarded} />
                {isFOM && (
                  <SitesDisplayTable 
                    siteRows={forwardedCategorySiteRows}
                    editable={true}
                    title={`Site Entries (${forwardedCategorySiteRows.length}) - Forwarded subcategory: ${forwardedSubTab}`}
                  />
                )}
              </TabsContent>
            )}

            <TabsContent value="verified">
              {(isAdmin || isICT || isFOM || isCoordinator) && (
                <div className="mb-4 flex flex-wrap gap-2 items-center">
                  <div className="text-sm font-medium text-muted-foreground mr-2">Subcategory:</div>
                  <Button variant={verifiedSubTab === 'newSites' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('newSites')} className={verifiedSubTab === 'newSites' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                    New Sites Verified by Coordinators
                    <Badge variant="secondary" className="ml-2">
                      {newSitesVerifiedCount}
                    </Badge>
                  </Button>
                  <Button variant={verifiedSubTab === 'approvedCosted' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('approvedCosted')} className={verifiedSubTab === 'approvedCosted' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                    Approved & Costed
                    <Badge variant="secondary" className="ml-2">{approvedCostedCount}</Badge>
                  </Button>
                  <Button variant={verifiedSubTab === 'dispatched' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('dispatched')} className={verifiedSubTab === 'dispatched' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                    Dispatched
                    <Badge variant="secondary" className="ml-2">{dispatchedCount}</Badge>
                  </Button>
                  <Button variant={verifiedSubTab === 'completed' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('completed')} className={verifiedSubTab === 'completed' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                    Completed
                    <Badge variant="secondary" className="ml-2">{verifiedSubcategories.completed.length}</Badge>
                  </Button>
                </div>
              )}
              {verifiedSubTab !== 'approvedCosted' && verifiedSubTab !== 'dispatched' && <MMPList mmpFiles={verifiedVisibleMMPs} />}
              {(isAdmin || isICT || isFOM || isCoordinator) && verifiedSubTab === 'newSites' && <VerifiedSitesDisplay verifiedSites={verifiedCategorySiteRows} />}
              {(isAdmin || isICT || isFOM || isCoordinator) && verifiedSubTab === 'approvedCosted' && (
                <div className="mt-6">
                  {loadingApprovedCosted ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">Loading approved and costed site entries...</div>
                      </CardContent>
                    </Card>
                  ) : approvedCostedSiteEntries.length === 0 ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">No approved and costed site entries found.</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Approved & Costed Site Entries</h3>
                        <Badge variant="secondary">{approvedCostedSiteEntries.length} entries</Badge>
                      </div>
                      {(isAdmin || isICT) && approvedCostedSiteEntries.length > 0 && (
                        <div className="mb-4 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDispatchType('state');
                              setDispatchDialogOpen(true);
                            }}
                            className="bg-blue-50 hover:bg-blue-100"
                          >
                            Bulk Dispatch by State
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDispatchType('locality');
                              setDispatchDialogOpen(true);
                            }}
                            className="bg-blue-50 hover:bg-blue-100"
                          >
                            Bulk Dispatch by Locality
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDispatchType('individual');
                              setDispatchDialogOpen(true);
                            }}
                            className="bg-blue-50 hover:bg-blue-100"
                          >
                            Individual Dispatch
                          </Button>
                        </div>
                      )}
                      <MMPSiteEntriesTable 
                        siteEntries={approvedCostedSiteEntries} 
                        editable={true}
                        onUpdateSites={async (sites) => {
                          // Update mmp_site_entries in database
                          try {
                            for (const site of sites) {
                              // Get fees values
                              const enumFee = site.enumerator_fee ?? site.enumeratorFee;
                              const transFee = site.transport_fee ?? site.transportFee;
                              
                              // Always calculate cost from fees if both are present
                              let calculatedCost: number | undefined;
                              if (enumFee !== undefined && transFee !== undefined) {
                                calculatedCost = Number(enumFee) + Number(transFee);
                              }
                              
                              // Use calculated cost if available, otherwise use provided cost
                              const finalCost = calculatedCost ?? site.cost;
                              
                              // Build additional_data with fees
                              const existingAdditionalData = site.additionalData || site.additional_data || {};
                              const updatedAdditionalData = {
                                ...existingAdditionalData,
                                enumerator_fee: enumFee,
                                transport_fee: transFee,
                                cost: finalCost
                              };
                              
                              const updateData: any = {
                                site_name: site.siteName || site.site_name,
                                site_code: site.siteCode || site.site_code,
                                hub_office: site.hubOffice || site.hub_office,
                                state: site.state,
                                locality: site.locality,
                                cp_name: site.cpName || site.cp_name,
                                activity_at_site: site.siteActivity || site.activity_at_site,
                                monitoring_by: site.monitoringBy || site.monitoring_by,
                                survey_tool: site.surveyTool || site.survey_tool,
                                use_market_diversion: site.useMarketDiversion || site.use_market_diversion,
                                use_warehouse_monitoring: site.useWarehouseMonitoring || site.use_warehouse_monitoring,
                                visit_date: site.visitDate || site.visit_date,
                                comments: site.comments,
                                cost: finalCost, // Save calculated cost to the cost column
                                enumerator_fee: enumFee !== undefined ? Number(enumFee) : undefined,
                                transport_fee: transFee !== undefined ? Number(transFee) : undefined,
                                status: site.status,
                                verification_notes: site.verification_notes || site.verificationNotes,
                                verified_by: site.verified_by || site.verifiedBy,
                                verified_at: site.verified_at || site.verifiedAt,
                                additional_data: updatedAdditionalData // Store fees in additional_data for backward compatibility
                              };

                              // Remove undefined values
                              Object.keys(updateData).forEach(key => {
                                if (updateData[key] === undefined) delete updateData[key];
                              });

                              if (site.id) {
                                await supabase
                                  .from('mmp_site_entries')
                                  .update(updateData)
                                  .eq('id', site.id);
                              }
                            }
                            // Reload the entries after update with database-level filtering
                            const { data: verifiedEntries, error } = await supabase
                              .from('mmp_site_entries')
                              .select('*')
                              .ilike('status', 'verified')
                              .gt('cost', 0)
                              .order('created_at', { ascending: false })
                              .limit(1000);

                            if (!error && verifiedEntries) {
                              
                              const formattedEntries = verifiedEntries.map(entry => {
                                const additionalData = entry.additional_data || {};
                                // Read fees from columns first, fallback to additional_data
                                const enumeratorFee = entry.enumerator_fee ?? additionalData.enumerator_fee;
                                const transportFee = entry.transport_fee ?? additionalData.transport_fee;
                                return {
                                  ...entry,
                                  siteName: entry.site_name,
                                  siteCode: entry.site_code,
                                  hubOffice: entry.hub_office,
                                  cpName: entry.cp_name,
                                  siteActivity: entry.activity_at_site,
                                  monitoringBy: entry.monitoring_by,
                                  surveyTool: entry.survey_tool,
                                  useMarketDiversion: entry.use_market_diversion,
                                  useWarehouseMonitoring: entry.use_warehouse_monitoring,
                                  visitDate: entry.visit_date,
                                  comments: entry.comments,
                                  enumerator_fee: enumeratorFee,
                                  enumeratorFee: enumeratorFee,
                                  transport_fee: transportFee,
                                  transportFee: transportFee,
                                  cost: entry.cost,
                                  status: entry.status,
                                  verified_by: entry.verified_by,
                                  verified_at: entry.verified_at,
                                  dispatched_by: entry.dispatched_by,
                                  dispatched_at: entry.dispatched_at,
                                  updated_at: entry.updated_at,
                                  additionalData: additionalData
                                };
                              });
                              setApprovedCostedSiteEntries(formattedEntries);
                              // Update count when entries are reloaded
                              setApprovedCostedCount(formattedEntries.length);
                            }
                            return true;
                          } catch (error) {
                            console.error('Failed to update sites:', error);
                            return false;
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isCoordinator) && verifiedSubTab === 'dispatched' && (
                <div className="mt-6">
                  {loadingDispatched ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">Loading dispatched site entries...</div>
                      </CardContent>
                    </Card>
                  ) : dispatchedSiteEntries.length === 0 ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">No dispatched site entries found.</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Dispatched Site Entries</h3>
                        <Badge variant="secondary">{dispatchedSiteEntries.length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable 
                        siteEntries={dispatchedSiteEntries} 
                        editable={false}
                      />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isCoordinator) && verifiedSubTab !== 'newSites' && verifiedSubTab !== 'approvedCosted' && verifiedSubTab !== 'dispatched' && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold">Sites by MMP</h3>
                    <span className="text-xs text-muted-foreground">Verified subcategory: {verifiedSubTab}</span>
                  </div>
                  <Accordion type="multiple" className="w-full">
                    {verifiedGroupedRows.map(({ mmp, rows }) => (
                      <AccordionItem key={mmp.id} value={mmp.id}>
                        <AccordionTrigger>
                          <div className="flex items-center gap-3 text-left">
                            <span className="font-medium">{mmp.name}</span>
                            <Badge variant="secondary">{rows.length} sites</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <SitesDisplayTable 
                            siteRows={rows}
                            mmpId={mmp.id}
                            editable={true}
                            title={`Sites for ${mmp.name}`}
                          />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
      {(isAdmin || isICT) && (
        <>
        <BulkClearForwardedDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen} />
          <DispatchSitesDialog
            open={dispatchDialogOpen}
            onOpenChange={setDispatchDialogOpen}
            siteEntries={approvedCostedSiteEntries}
            dispatchType={dispatchType}
            onDispatched={async () => {
              // Reload dispatched entries after dispatch
              if (verifiedSubTab === 'dispatched') {
                const { data: dispatchedEntries, error: allError } = await supabase
                  .from('mmp_site_entries')
                  .select('*')
                  .or('status.ilike.dispatched,dispatched_at.not.is.null')
                  .order('dispatched_at', { ascending: false })
                  .limit(1000);

                if (!allError && dispatchedEntries) {

                  const formattedEntries = dispatchedEntries.map(entry => {
                    const additionalData = entry.additional_data || {};
                    const enumeratorFee = entry.enumerator_fee ?? additionalData.enumerator_fee;
                    const transportFee = entry.transport_fee ?? additionalData.transport_fee;
                    return {
                      ...entry,
                      siteName: entry.site_name,
                      siteCode: entry.site_code,
                      hubOffice: entry.hub_office,
                      cpName: entry.cp_name,
                      siteActivity: entry.activity_at_site,
                      monitoringBy: entry.monitoring_by,
                      surveyTool: entry.survey_tool,
                      useMarketDiversion: entry.use_market_diversion,
                      useWarehouseMonitoring: entry.use_warehouse_monitoring,
                      visitDate: entry.visit_date,
                      comments: entry.comments,
                      enumerator_fee: enumeratorFee,
                      enumeratorFee: enumeratorFee,
                      transport_fee: transportFee,
                      transportFee: transportFee,
                      cost: entry.cost,
                      status: entry.status,
                      verified_by: entry.verified_by,
                      verified_at: entry.verified_at,
                      dispatched_by: entry.dispatched_by,
                      dispatched_at: entry.dispatched_at,
                      updated_at: entry.updated_at,
                      additionalData: additionalData
                    };
                  });
                  setDispatchedSiteEntries(formattedEntries);
                  setDispatchedCount(formattedEntries.length);
                }
              }
              // Reload approved and costed entries after dispatch
              if (verifiedSubTab === 'approvedCosted') {
                const { data: verifiedEntries, error } = await supabase
                  .from('mmp_site_entries')
                  .select('*')
                  .ilike('status', 'verified')
                  .gt('cost', 0)
                  .order('created_at', { ascending: false })
                  .limit(1000);

                if (!error && verifiedEntries) {
                  const entriesWithCost = verifiedEntries;

                  const formattedEntries = entriesWithCost.map(entry => {
                    const additionalData = entry.additional_data || {};
                    return {
                      ...entry,
                      siteName: entry.site_name,
                      siteCode: entry.site_code,
                      hubOffice: entry.hub_office,
                      cpName: entry.cp_name,
                      siteActivity: entry.activity_at_site,
                      monitoringBy: entry.monitoring_by,
                      surveyTool: entry.survey_tool,
                      useMarketDiversion: entry.use_market_diversion,
                      useWarehouseMonitoring: entry.use_warehouse_monitoring,
                      visitDate: entry.visit_date,
                      comments: entry.comments,
                      enumerator_fee: additionalData.enumerator_fee,
                      enumeratorFee: additionalData.enumerator_fee,
                      transport_fee: additionalData.transport_fee,
                      transportFee: additionalData.transport_fee,
                      cost: entry.cost,
                      status: entry.status,
                      verified_by: entry.verified_by,
                      verified_at: entry.verified_at,
                      dispatched_by: entry.dispatched_by,
                      dispatched_at: entry.dispatched_at,
                      updated_at: entry.updated_at,
                      additionalData: additionalData
                    };
                  });
                  setApprovedCostedSiteEntries(formattedEntries);
                  setApprovedCostedCount(formattedEntries.length);
                }
              }
            }}
          />
        </>
      )}
    </div>
  );
};

export default MMP;
