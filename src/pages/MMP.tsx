
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
import { useToast } from '@/hooks/use-toast';

// Using relative import fallback in case path alias resolution misses new file
import BulkClearForwardedDialog from '../components/mmp/BulkClearForwardedDialog';
import { DispatchSitesDialog } from '@/components/mmp/DispatchSitesDialog';
import { sudanStates } from '@/data/sudanStates';

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

        // Format mmp_site_entries for MMPSiteEntriesTable
        const mergedEntries = (mmpEntries || []).map(entry => {
          return {
            ...entry,
            verified_by: entry.verified_by || undefined,
            verified_at: entry.verified_at || undefined,
            verification_notes: entry.verification_notes || undefined,
            status: entry.status || 'Pending',
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

              // Verification data is now stored directly in mmp_site_entries, no need to update site_visits
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

        // Format mmp_site_entries for MMPSiteEntriesTable
        const mergedEntries = (mmpEntries || []).map(entry => {
          return {
            ...entry,
            verified_by: entry.verified_by || undefined,
            verified_at: entry.verified_at || undefined,
            verification_notes: entry.verification_notes || undefined,
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

              // Verification data is now stored directly in mmp_site_entries, no need to update site_visits
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
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('new');
  // Subcategory state for Forwarded MMPs (Admin/ICT only)
  const [forwardedSubTab, setForwardedSubTab] = useState<'pending' | 'verified'>('pending');
  // Subcategory state for Verified Sites (Admin/ICT only)
  const [verifiedSubTab, setVerifiedSubTab] = useState<'newSites' | 'approvedCosted' | 'dispatched' | 'accepted' | 'ongoing' | 'completed'>('newSites');
  // Subcategory state for Enumerator dashboard
  const [enumeratorSubTab, setEnumeratorSubTab] = useState<'availableSites' | 'smartAssigned' | 'mySites'>('availableSites');
  // Subcategory state for New MMPs (FOM only)
  const [newFomSubTab, setNewFomSubTab] = useState<'pending' | 'verified'>('pending');
  const [siteVisitStats, setSiteVisitStats] = useState<Record<string, {
    exists: boolean;
    hasCosted: boolean;
    hasAssigned: boolean;
    hasInProgress: boolean;
    hasAccepted: boolean;
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
  const [acceptedSiteEntries, setAcceptedSiteEntries] = useState<any[]>([]);
  const [loadingAccepted, setLoadingAccepted] = useState(false);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [ongoingSiteEntries, setOngoingSiteEntries] = useState<any[]>([]);
  const [loadingOngoing, setLoadingOngoing] = useState(false);
  const [ongoingCount, setOngoingCount] = useState(0);
  const [completedSiteEntries, setCompletedSiteEntries] = useState<any[]>([]);
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [dispatchType, setDispatchType] = useState<'state' | 'locality' | 'individual'>('state');

  // Enumerator-specific state
  const [enumeratorSiteEntries, setEnumeratorSiteEntries] = useState<any[]>([]);
  const [loadingEnumerator, setLoadingEnumerator] = useState(false);
  const [enumeratorGroupedByStates, setEnumeratorGroupedByStates] = useState<Record<string, any[]>>({});
  const [enumeratorGroupedByLocality, setEnumeratorGroupedByLocality] = useState<Record<string, any[]>>({});
  const [enumeratorSmartAssigned, setEnumeratorSmartAssigned] = useState<any[]>([]);
  const [enumeratorMySites, setEnumeratorMySites] = useState<any[]>([]);

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
  const isDataCollector = hasRole(['DataCollector', 'datacollector', 'enumerator', 'Enumerator']);
  const canRead = checkPermission('mmp', 'read') || isAdmin || isFOM || isCoordinator || isICT;
  // Only Admin and ICT accounts should see the Upload button on the MMP management page.
  // We intentionally DO NOT fallback to checkPermission here to prevent other roles (e.g. FOM)
  // that may have broad permissions from seeing the upload control.
  const canCreate = isAdmin || isICT;

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
      console.log('🔍 isDataCollector:', isDataCollector);
      console.log('🔍 canCreate:', canCreate);
    }
  }, [currentUser, isAdmin, isICT, isFOM, isCoordinator, canCreate]);

  // Set initial active tab based on role
  useEffect(() => {
    if (isCoordinator) {
      setActiveTab('verified');
    } else if (isDataCollector) {
      setActiveTab('enumerator');
    } else {
      setActiveTab('new');
    }
  }, [isCoordinator, isDataCollector]);

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
        // Count entries with status = 'Approved and Costed'
        const { count, error } = await supabase
          .from('mmp_site_entries')
          .select('*', { count: 'exact', head: true })
          .or('status.ilike.Approved and Costed,status.ilike.Approved and costed');

        if (error) throw error;
        setApprovedCostedCount(count || 0);
      } catch (error) {
        console.error('Failed to load approved and costed count:', error);
        setApprovedCostedCount(0);
      }
    };

    loadApprovedCostedCount();
  }, [mmpFiles]); // Reload when MMP files change

  // Always load the dispatched count for the badge, regardless of active tab
  useEffect(() => {
    const loadDispatchedCount = async () => {
      try {
        // Use database count instead of loading all entries
        // Count entries with status = 'Dispatched' only
        // BUT exclude entries that are already accepted (status = 'accepted' or accepted_by is not null)
        const { count, error } = await supabase
          .from('mmp_site_entries')
          .select('*', { count: 'exact', head: true })
          .ilike('status', 'Dispatched')
          .not('status', 'ilike', 'accepted')
          .is('accepted_by', null);

        if (error) throw error;

        setDispatchedCount(count || 0);
      } catch (error) {
        console.error('Failed to load dispatched count:', error);
        setDispatchedCount(0);
      }
    };

    loadDispatchedCount();
  }, [mmpFiles]); // Reload when MMP files change

  // Always load the accepted count for the badge, regardless of active tab
  useEffect(() => {
    const loadAcceptedCount = async () => {
      try {
        // Use database count instead of loading all entries
        // Count entries with status = 'accepted' OR accepted_by is not null
        const { count, error } = await supabase
          .from('mmp_site_entries')
          .select('*', { count: 'exact', head: true })
          .or('status.ilike.accepted,accepted_by.not.is.null');

        if (error) throw error;

        setAcceptedCount(count || 0);
      } catch (error) {
        console.error('Failed to load accepted count:', error);
        setAcceptedCount(0);
      }
    };

    loadAcceptedCount();
  }, [mmpFiles]); // Reload when MMP files change

  // Always load the ongoing count for the badge, regardless of active tab
  useEffect(() => {
    const loadOngoingCount = async () => {
      try {
        // Use database count instead of loading all entries
        // Count entries with status = 'inprogress' or 'in_progress' (case-insensitive)
        const { count, error } = await supabase
          .from('mmp_site_entries')
          .select('*', { count: 'exact', head: true })
          .or('status.ilike.inprogress,status.ilike.in_progress');

        if (error) throw error;

        setOngoingCount(count || 0);
      } catch (error) {
        console.error('Failed to load ongoing count:', error);
        setOngoingCount(0);
      }
    };

    loadOngoingCount();
  }, [mmpFiles]); // Reload when MMP files change

  // Always load the completed count for the badge, regardless of active tab
  useEffect(() => {
    const loadCompletedCount = async () => {
      try {
        // Use database count instead of loading all entries
        // Count entries with status = 'completed'
        const { count, error } = await supabase
          .from('mmp_site_entries')
          .select('*', { count: 'exact', head: true })
          .ilike('status', 'completed');

        if (error) throw error;

        setCompletedCount(count || 0);
      } catch (error) {
        console.error('Failed to load completed count:', error);
        setCompletedCount(0);
      }
    };

    loadCompletedCount();
  }, [mmpFiles]); // Reload when MMP files change

  // Load enumerator site entries only when user is DataCollector
  useEffect(() => {
    const loadEnumeratorEntries = async () => {
      if (!isDataCollector || !currentUser?.id) {
        setEnumeratorSiteEntries([]);
        setEnumeratorGroupedByStates({});
        setEnumeratorGroupedByLocality({});
        setEnumeratorSmartAssigned([]);
        return;
      }

      setLoadingEnumerator(true);
      try {
        // Load available sites in the enumerator's state or locality for "Available Sites" tab
        // These are sites with status "Dispatched" (bulk dispatched by state/locality)
        // Convert collector's stateId/localityId to names for matching with site entries
        const collectorStateName = sudanStates.find(s => s.id === currentUser.stateId)?.name;
        const collectorLocalityName = currentUser.stateId && currentUser.localityId
          ? sudanStates.find(s => s.id === currentUser.stateId)?.localities.find(l => l.id === currentUser.localityId)?.name
          : undefined;
        
        // Build query - match by state name or locality name
        let availableSitesQuery = supabase
          .from('mmp_site_entries')
          .select('*')
          .ilike('status', 'Dispatched')
          .is('accepted_by', null); // Only show unclaimed dispatched sites
        
        // Add state/locality filters if we have the names
        if (collectorStateName || collectorLocalityName) {
          const conditions: string[] = [];
          if (collectorStateName) {
            conditions.push(`state.ilike.${collectorStateName}`);
          }
          if (collectorLocalityName) {
            conditions.push(`locality.ilike.${collectorLocalityName}`);
          }
          if (conditions.length > 0) {
            availableSitesQuery = availableSitesQuery.or(conditions.join(','));
          }
        }
        
        availableSitesQuery = availableSitesQuery
          .order('created_at', { ascending: false })
          .limit(1000);

        // Load smart assigned sites for "Smart Assigned" tab
        // These are sites with status "Assigned" (individually dispatched) assigned to this collector
        const smartAssignedQuery = supabase
          .from('mmp_site_entries')
          .select('*')
          .ilike('status', 'Assigned')
          .eq('accepted_by', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(1000);

        // Load accepted sites for "My Sites" tab (all sites accepted/claimed by this collector)
        // Includes both "Assigned" (smart assigned) and "Dispatched" (claimed available sites)
        const mySitesQuery = supabase
          .from('mmp_site_entries')
          .select('*')
          .eq('accepted_by', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(1000);

        // Execute all queries in parallel
        const [availableResult, smartAssignedResult, mySitesResult] = await Promise.all([
          availableSitesQuery,
          smartAssignedQuery,
          mySitesQuery
        ]);

        if (availableResult.error) throw availableResult.error;
        if (smartAssignedResult.error) throw smartAssignedResult.error;
        if (mySitesResult.error) throw mySitesResult.error;

        // Format entries for display
        const formatEntries = (entries: any[]) => entries.map(entry => {
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
            accepted_by: entry.accepted_by,
            accepted_at: entry.accepted_at,
            updated_at: entry.updated_at,
            additionalData: additionalData
          };
        });

        const availableEntries = formatEntries(availableResult.data || []);
        const smartAssignedEntries = formatEntries(smartAssignedResult.data || []);
        const mySitesEntries = formatEntries(mySitesResult.data || []);

        // Store all entries for reference
        setEnumeratorSiteEntries(availableEntries);

        // Group available sites by state and locality combined (for Available Sites tab)
        const groupedByStateLocality = availableEntries.reduce((acc, entry) => {
          const state = entry.state || 'Unknown State';
          const locality = entry.locality || 'Unknown Locality';
          const key = `${state} - ${locality}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(entry);
          return acc;
        }, {} as Record<string, any[]>);
        setEnumeratorGroupedByStates(groupedByStateLocality); // Reuse this state for available sites
        setEnumeratorGroupedByLocality({}); // Clear locality grouping since we're combining

        // Set smart assigned entries (accepted sites)
        setEnumeratorSmartAssigned(smartAssignedEntries);

        // Build deduplicated union for "My Sites"
        try {
          const byId = new Map<string, any>();
          // prefer smartAssigned entries first
          (smartAssignedEntries || []).forEach((e: any) => {
            if (e && e.id) byId.set(String(e.id), e);
          });
          // then include mySitesEntries (may overlap)
          (mySitesEntries || []).forEach((e: any) => {
            if (!e) return;
            const key = e.id ? String(e.id) : `${e.mmp_file_id || e.mmpId}-${e.site_code || e.siteCode || ''}`;
            if (!byId.has(key)) byId.set(key, e);
          });
          setEnumeratorMySites(Array.from(byId.values()));
        } catch (e) {
          // fallback
          setEnumeratorMySites(mySitesEntries);
        }

      } catch (error) {
        console.error('Failed to load enumerator site entries:', error);
        setEnumeratorSiteEntries([]);
        setEnumeratorGroupedByStates({});
        setEnumeratorGroupedByLocality({});
        setEnumeratorSmartAssigned([]);
        setEnumeratorMySites([]);
      } finally {
        setLoadingEnumerator(false);
      }
    };

    loadEnumeratorEntries();
  }, [isDataCollector, currentUser?.id, currentUser?.stateId, currentUser?.localityId, mmpFiles]); // Reload when MMP files change or user changes

  // Load approved and costed site entries only when the tab is active
  useEffect(() => {
    const loadApprovedCostedEntries = async () => {
      if (verifiedSubTab !== 'approvedCosted') {
        setApprovedCostedSiteEntries([]);
        return;
      }

      setLoadingApprovedCosted(true);
      try {
        // Use database-level filtering to get only "Approved and Costed" status entries
        const { data: approvedCostedEntries, error: allError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .or('status.ilike.Approved and Costed,status.ilike.Approved and costed')
          .order('created_at', { ascending: false })
          .limit(1000); // Limit to 1000 entries for performance

        if (allError) throw allError;

        // Process approved and costed entries
        let processedEntries = approvedCostedEntries || [];

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

        // All entries should already be "Approved and Costed" status, no need to filter by cost
        // But we can ensure they have cost set

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
        // Only show entries with status = 'Dispatched' (case-insensitive)
        // Exclude entries that are already accepted (status = 'accepted' or accepted_by is not null)
        const { data: dispatchedEntries, error: allError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .ilike('status', 'Dispatched')
          .not('status', 'ilike', 'accepted')
          .is('accepted_by', null)
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
        // Update count when entries are loaded (count is also loaded separately for badge)
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

  // Load accepted site entries only when the tab is active
  useEffect(() => {
    const loadAcceptedEntries = async () => {
      if (verifiedSubTab !== 'accepted') {
        setAcceptedSiteEntries([]);
        return;
      }

      setLoadingAccepted(true);
      try {
        // Use database-level filtering: entries with status = 'accepted' OR accepted_by is not null
        const { data: acceptedEntries, error: allError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .or('status.ilike.accepted,accepted_by.not.is.null')
          .order('accepted_at', { ascending: false })
          .limit(1000); // Limit to 1000 entries for performance

        if (allError) throw allError;

        // Format entries for MMPSiteEntriesTable
        const formattedEntries = acceptedEntries.map(entry => {
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
            accepted_by: entry.accepted_by,
            accepted_at: entry.accepted_at,
            updated_at: entry.updated_at,
            additionalData: additionalData
          };
        });

        setAcceptedSiteEntries(formattedEntries);
        // Update count when entries are loaded (count is also loaded separately for badge)
        setAcceptedCount(formattedEntries.length);
      } catch (error) {
        console.error('Failed to load accepted site entries:', error);
        setAcceptedSiteEntries([]);
        setAcceptedCount(0);
      } finally {
        setLoadingAccepted(false);
      }
    };

    loadAcceptedEntries();
  }, [verifiedSubTab]);

  // Load ongoing site entries only when the tab is active
  useEffect(() => {
    const loadOngoingEntries = async () => {
      if (verifiedSubTab !== 'ongoing') {
        setOngoingSiteEntries([]);
        return;
      }

      setLoadingOngoing(true);
      try {
        // Use database-level filtering: entries with status = 'inprogress' or 'in_progress'
        // Use .or() to match either status value (case-insensitive)
        const { data: ongoingEntries, error: allError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .or('status.ilike.inprogress,status.ilike.in_progress')
          .order('updated_at', { ascending: false })
          .limit(1000); // Limit to 1000 entries for performance

        if (allError) throw allError;

        // Format entries for MMPSiteEntriesTable
        const formattedEntries = ongoingEntries.map(entry => {
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
            accepted_by: entry.accepted_by,
            accepted_at: entry.accepted_at,
            updated_at: entry.updated_at,
            additionalData: additionalData
          };
        });

        setOngoingSiteEntries(formattedEntries);
        // Update count when entries are loaded (count is also loaded separately for badge)
        setOngoingCount(formattedEntries.length);
      } catch (error) {
        console.error('Failed to load ongoing site entries:', error);
        setOngoingSiteEntries([]);
        setOngoingCount(0);
      } finally {
        setLoadingOngoing(false);
      }
    };

    loadOngoingEntries();
  }, [verifiedSubTab]);

  // Load completed site entries only when the tab is active
  useEffect(() => {
    const loadCompletedEntries = async () => {
      if (verifiedSubTab !== 'completed') {
        setCompletedSiteEntries([]);
        return;
      }

      setLoadingCompleted(true);
      try {
        // Use database-level filtering: entries with status = 'completed'
        const { data: completedEntries, error: allError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .ilike('status', 'completed')
          .order('updated_at', { ascending: false })
          .limit(1000); // Limit to 1000 entries for performance

        if (allError) throw allError;

        // Format entries for MMPSiteEntriesTable
        const formattedEntries = completedEntries.map(entry => {
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
            accepted_by: entry.accepted_by,
            accepted_at: entry.accepted_at,
            updated_at: entry.updated_at,
            additionalData: additionalData
          };
        });

        setCompletedSiteEntries(formattedEntries);
        // Update count when entries are loaded (count is also loaded separately for badge)
        setCompletedCount(formattedEntries.length);
      } catch (error) {
        console.error('Failed to load completed site entries:', error);
        setCompletedSiteEntries([]);
        setCompletedCount(0);
      } finally {
        setLoadingCompleted(false);
      }
    };

    loadCompletedEntries();
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
        // Dispatched: sites that have been dispatched (mmp_site_entries marked as dispatched) or marked as dispatched
        // Check if any site entries are marked as 'Dispatched' or have been assigned
        return Boolean(stats?.hasAssigned || stats?.hasDispatched);
      }),
      accepted: base.filter(mmp => {
        const stats = siteVisitStats[mmp.id];
        // Accepted: at least one site visit was accepted
        return Boolean(stats?.hasAccepted);
      }),
      ongoing: base.filter(mmp => {
        const stats = siteVisitStats[mmp.id];
        // Ongoing: site visits currently in progress
        return Boolean(stats?.hasInProgress);
      }),
      // Completed: rely on site visits completed or workflow stage
      completed: base.filter(mmp => {
        const stats = siteVisitStats[mmp.id];
        return Boolean(stats?.hasCompleted) || (mmp.workflow as any)?.currentStage === 'completed';
      })
    };
  }, [categorizedMMPs.verified, siteVisitStats]);

  // Build unified site rows (mmp_site_entries + fallback to mmp.siteEntries) for given MMP list
  const buildSiteRowsFromMMPs = (mmps: any[], filterFn?: (row: SiteVisitRow) => boolean): SiteVisitRow[] => {
    const rows: SiteVisitRow[] = [];
    const existingIds = new Set(siteVisitRows.map(r => r.mmpId));
    for (const mmp of mmps) {
      // Use siteEntries when we don't yet have mmp_site_entries for this MMP
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
      // Show sites that are verified (from mmp_site_entries)
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
        // Show sites that are verified (from mmp_site_entries)
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
        // Show only entries with status = 'dispatched'
        return status === 'dispatched';
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
        // Load ALL mmp_site_entries to check cost and status for "Approved & Costed"
        const { data: mmpEntriesData, error: mmpEntriesError } = await supabase
          .from('mmp_site_entries')
          .select('id,mmp_file_id,status,site_code,state,locality,site_name,verification_notes,cost,verified_by,verified_at,dispatched_at,accepted_by,accepted_at')
          .in('mmp_file_id', ids);
        if (mmpEntriesError) throw mmpEntriesError;
        
        const map: Record<string, {
          exists: boolean; hasCosted: boolean; hasAssigned: boolean; hasInProgress: boolean; hasAccepted: boolean; hasCompleted: boolean; hasRejected: boolean; hasDispatched: boolean; allApprovedAndCosted: boolean;
        }> = {};
        const rows: SiteVisitRow[] = [];
        
        // Initialize map for all MMPs
        for (const id of ids) {
          if (!map[id]) {
            map[id] = { exists: false, hasCosted: false, hasAssigned: false, hasInProgress: false, hasAccepted: false, hasCompleted: false, hasRejected: false, hasDispatched: false, allApprovedAndCosted: false };
          }
        }
        
        // Process mmp_site_entries - this is now the single source of truth
        const entriesByMmp = new Map<string, any[]>();
        for (const entry of (mmpEntriesData || []) as any[]) {
          const mmpId = entry.mmp_file_id;
          if (!entriesByMmp.has(mmpId)) {
            entriesByMmp.set(mmpId, []);
          }
          entriesByMmp.get(mmpId)!.push(entry);
          
          // Update stats based on entry status
          if (!map[mmpId]) {
            map[mmpId] = { exists: false, hasCosted: false, hasAssigned: false, hasInProgress: false, hasAccepted: false, hasCompleted: false, hasRejected: false, hasDispatched: false, allApprovedAndCosted: false };
          }
          map[mmpId].exists = true;
          
          const status = String(entry.status || '').toLowerCase();
          if (status === 'assigned') map[mmpId].hasAssigned = true;
          if (status === 'accepted' || entry.accepted_by) map[mmpId].hasAccepted = true;
          if (status === 'inprogress' || status === 'in_progress') map[mmpId].hasInProgress = true;
          if (status === 'completed') map[mmpId].hasCompleted = true;
          if (status === 'rejected' || status === 'declined') map[mmpId].hasRejected = true;
          if (status === 'dispatched' || entry.dispatched_at) map[mmpId].hasDispatched = true;
          
          const cost = Number(entry.cost || 0);
          if (cost > 0) map[mmpId].hasCosted = true;
          
            const siteRow: SiteVisitRow = {
              id: entry.id || `${entry.mmp_file_id}-${entry.site_code}`,
              mmpId: entry.mmp_file_id,
              siteName: entry.site_name || entry.site_code || 'Site',
              siteCode: entry.site_code || undefined,
              state: entry.state || undefined,
              locality: entry.locality || undefined,
            status: entry.status || 'Pending',
            feesTotal: cost,
            verifiedBy: entry.verified_by || undefined,
            verifiedAt: entry.verified_at || undefined,
            };
            rows.push(siteRow);
        }
        
        // Check if all entries for each MMP are approved and costed
        for (const [mmpId, entries] of entriesByMmp.entries()) {
          if (!map[mmpId]) {
            map[mmpId] = { exists: false, hasCosted: false, hasAssigned: false, hasInProgress: false, hasAccepted: false, hasCompleted: false, hasRejected: false, hasDispatched: false, allApprovedAndCosted: false };
          }
          
          // For "Approved & Costed", ALL entries must have cost > 0 AND status = 'verified'
          if (entries.length > 0) {
            const allApprovedAndCosted = entries.every(entry => {
              const status = String(entry.status || '').toLowerCase();
              return status === 'approved and costed';
            });
            map[mmpId].allApprovedAndCosted = allApprovedAndCosted;
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
    <div className="space-y-6 sm:space-y-10 min-h-screen bg-slate-50 dark:bg-gray-900 py-4 sm:py-8 px-2 sm:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-blue-600 dark:bg-blue-900 p-4 sm:p-7 rounded-2xl shadow-xl border border-blue-100 dark:border-blue-900">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-blue-100 dark:hover:bg-blue-900/40 flex-shrink-0">
            <ChevronLeft className="h-5 w-5 text-white dark:text-blue-200" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight truncate">
              {isDataCollector ? 'My Sites Management' : 'MMP Management'}
            </h1>
            <p className="text-blue-100 dark:text-blue-200/80 font-medium text-sm sm:text-base mt-1">
              {isAdmin || isICT
                ? 'Upload, validate, and forward MMPs to Field Operations Managers'
                : isFOM
                  ? 'Process MMPs, attach permits, and assign sites to coordinators'
                  : isCoordinator
                    ? 'Review and verify site assignments'
                    : isDataCollector
                      ? 'View and manage your assigned sites.'
                      : 'Manage your MMP files and site visits'}
            </p>
          </div>
        </div>
        {canCreate && (
          <Button className="bg-blue-700 hover:bg-blue-800 text-white shadow-lg hover:shadow-xl transition-all duration-300 px-4 sm:px-6 py-2 rounded-full font-semibold text-sm sm:text-base flex-shrink-0" onClick={() => navigate('/mmp/upload')}>
            <Upload className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
            Upload MMP
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-4 sm:p-6">
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading MMP files...</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full mb-6 ${isCoordinator ? 'grid-cols-1' : isDataCollector ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {isDataCollector && (
                <TabsTrigger value="enumerator" className="flex items-center gap-2 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 data-[state=active]:shadow-none">
                  My Assignments
                  <Badge variant="secondary">{enumeratorMySites.length}</Badge>
                </TabsTrigger>
              )}
              {!isCoordinator && !isDataCollector && (
                <TabsTrigger value="new" className="flex items-center gap-2 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 data-[state=active]:shadow-none">
                  New MMPs
                  <Badge variant="secondary">{categorizedMMPs.new.length}</Badge>
                </TabsTrigger>
              )}
              {!isCoordinator && !isDataCollector && (
                <TabsTrigger value="forwarded" className="flex items-center gap-2 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 data-[state=active]:shadow-none">
                  {isFOM ? 'Forwarded Sites' : 'Forwarded MMPs'}
                  <Badge variant="secondary">{categorizedMMPs.forwarded.length}</Badge>
                </TabsTrigger>
              )}
              {!isDataCollector && (
                <TabsTrigger value="verified" className="flex items-center gap-2 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 data-[state=active]:shadow-none">
                  {isCoordinator ? 'MMPs to Review' : 'Verified Sites'}
                  <Badge variant="secondary">{categorizedMMPs.verified.length}</Badge>
                </TabsTrigger>
              )}
            </TabsList>

            {!isCoordinator && (
              <TabsContent value="new">
                {isFOM && (
                  <div className="mb-4 flex flex-nowrap gap-2 items-center overflow-x-auto whitespace-nowrap">
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
                  <div className="mb-4 flex flex-nowrap gap-2 items-center overflow-x-auto whitespace-nowrap">
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
                <div className="mb-4 flex flex-nowrap gap-2 items-center overflow-x-auto whitespace-nowrap">
                  <div className="text-sm font-medium text-muted-foreground mr-2">Subcategory:</div>
                  <Button variant={verifiedSubTab === 'newSites' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('newSites')} className={verifiedSubTab === 'newSites' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                    New Sites
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
                  {(isAdmin || isICT || isFOM) && (
                    <>
                      <Button variant={verifiedSubTab === 'accepted' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('accepted')} className={verifiedSubTab === 'accepted' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                        Accepted
                        <Badge variant="secondary" className="ml-2">{acceptedCount}</Badge>
                      </Button>
                      <Button variant={verifiedSubTab === 'ongoing' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('ongoing')} className={verifiedSubTab === 'ongoing' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                        Ongoing
                        <Badge variant="secondary" className="ml-2">{ongoingCount}</Badge>
                      </Button>
                    </>
                  )}
                  <Button variant={verifiedSubTab === 'completed' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('completed')} className={verifiedSubTab === 'completed' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                    Completed
                    <Badge variant="secondary" className="ml-2">{completedCount}</Badge>
                  </Button>
                </div>
              )}
              {verifiedSubTab !== 'approvedCosted' && verifiedSubTab !== 'dispatched' && verifiedSubTab !== 'accepted' && verifiedSubTab !== 'ongoing' && verifiedSubTab !== 'completed' && <MMPList mmpFiles={verifiedVisibleMMPs} />}
              {(isAdmin || isICT || isFOM || isCoordinator) && verifiedSubTab === 'newSites' && (
                <>
                  {(isAdmin || isICT) && verifiedCategorySiteRows.length > 0 && (
                    <div className="mb-4">
                      <Button
                        variant="default"
                        size="lg"
                        onClick={async () => {
                          try {
                            // Get all verified site entries
                            const { data: verifiedEntries, error: fetchError } = await supabase
                              .from('mmp_site_entries')
                              .select('*')
                              .or('status.ilike.verified,status.ilike.Verified')
                              .limit(10000);

                            if (fetchError) throw fetchError;

                            if (!verifiedEntries || verifiedEntries.length === 0) {
                              toast({
                                title: 'No Sites to Process',
                                description: 'There are no verified sites to approve and cost.',
                                variant: 'default'
                              });
                              return;
                            }

                            // Update all verified sites to 'Approved and Costed' status
                            // Also ensure they have cost set (default to 30 if not set)
                            const updates = verifiedEntries.map(entry => {
                              const additionalData = entry.additional_data || {};
                              const currentCost = entry.cost;
                              const enumFee = entry.enumerator_fee ?? additionalData.enumerator_fee ?? 20;
                              const transFee = entry.transport_fee ?? additionalData.transport_fee ?? 10;
                              const finalCost = currentCost && currentCost > 0 ? currentCost : (enumFee + transFee);

                              return {
                                id: entry.id,
                                status: 'Approved and Costed',
                                cost: finalCost,
                                enumerator_fee: enumFee,
                                transport_fee: transFee,
                                additional_data: {
                                  ...additionalData,
                                  enumerator_fee: enumFee,
                                  transport_fee: transFee,
                                  cost: finalCost,
                                  approved_and_costed_at: new Date().toISOString(),
                                  approved_and_costed_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System'
                                }
                              };
                            });

                            // Update in batches to avoid timeout
                            const batchSize = 100;
                            for (let i = 0; i < updates.length; i += batchSize) {
                              const batch = updates.slice(i, i + batchSize);
                              const updatePromises = batch.map(update => 
                                supabase
                                  .from('mmp_site_entries')
                                  .update({
                                    status: update.status,
                                    cost: update.cost,
                                    enumerator_fee: update.enumerator_fee,
                                    transport_fee: update.transport_fee,
                                    additional_data: update.additional_data
                                  })
                                  .eq('id', update.id)
                              );
                              await Promise.all(updatePromises);
                            }

                            toast({
                              title: 'Bulk Cost Successful',
                              description: `Successfully approved and costed ${updates.length} site(s).`,
                              variant: 'default'
                            });

                            // Reload the page data
                            window.location.reload();
                          } catch (error: any) {
                            console.error('Error in bulk cost:', error);
                            toast({
                              title: 'Bulk Cost Failed',
                              description: error.message || 'Failed to approve and cost sites. Please try again.',
                              variant: 'destructive'
                            });
                          }
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white mb-4"
                      >
                        Bulk Cost ({verifiedCategorySiteRows.length} sites)
                      </Button>
                    </div>
                  )}
                  <VerifiedSitesDisplay verifiedSites={verifiedCategorySiteRows} />
                </>
              )}
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
              {(isAdmin || isICT || isFOM || isCoordinator) && verifiedSubTab === 'accepted' && (
                <div className="mt-6">
                  {loadingAccepted ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">Loading accepted site entries...</div>
                      </CardContent>
                    </Card>
                  ) : acceptedSiteEntries.length === 0 ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">No accepted site entries found.</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Accepted Site Entries</h3>
                        <Badge variant="secondary">{acceptedSiteEntries.length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable 
                        siteEntries={acceptedSiteEntries} 
                        editable={false}
                      />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isCoordinator) && verifiedSubTab === 'ongoing' && (
                <div className="mt-6">
                  {loadingOngoing ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">Loading ongoing site entries...</div>
                      </CardContent>
                    </Card>
                  ) : ongoingSiteEntries.length === 0 ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">No ongoing site entries found.</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Ongoing Site Entries</h3>
                        <Badge variant="secondary">{ongoingSiteEntries.length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable 
                        siteEntries={ongoingSiteEntries} 
                        editable={false}
                      />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isCoordinator) && verifiedSubTab === 'completed' && (
                <div className="mt-6">
                  {loadingCompleted ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">Loading completed site entries...</div>
                      </CardContent>
                    </Card>
                  ) : completedSiteEntries.length === 0 ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">No completed site entries found.</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Completed Site Entries</h3>
                        <Badge variant="secondary">{completedSiteEntries.length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable 
                        siteEntries={completedSiteEntries} 
                        editable={false}
                      />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isCoordinator) && verifiedSubTab !== 'newSites' && verifiedSubTab !== 'approvedCosted' && verifiedSubTab !== 'dispatched' && verifiedSubTab !== 'accepted' && verifiedSubTab !== 'ongoing' && verifiedSubTab !== 'completed' && (
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

            {isDataCollector && (
              <TabsContent value="enumerator">
                <div className="mb-4">
                  <div className="text-sm font-medium text-muted-foreground mb-3">View:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Button 
                      variant={enumeratorSubTab === 'availableSites' ? 'default' : 'outline'} 
                      onClick={() => setEnumeratorSubTab('availableSites')} 
                      className={`h-12 text-sm font-medium ${enumeratorSubTab === 'availableSites' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>Available Sites</span>
                        <Badge variant="secondary" className="text-xs">{Object.values(enumeratorGroupedByStates).flat().length}</Badge>
                      </div>
                    </Button>
                    <Button 
                      variant={enumeratorSubTab === 'smartAssigned' ? 'default' : 'outline'} 
                      onClick={() => setEnumeratorSubTab('smartAssigned')} 
                      className={`h-12 text-sm font-medium ${enumeratorSubTab === 'smartAssigned' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>Smart Assigned</span>
                        <Badge variant="secondary" className="text-xs">{enumeratorSmartAssigned.length}</Badge>
                      </div>
                    </Button>
                    <Button 
                      variant={enumeratorSubTab === 'mySites' ? 'default' : 'outline'} 
                      onClick={() => setEnumeratorSubTab('mySites')} 
                      className={`h-12 text-sm font-medium ${enumeratorSubTab === 'mySites' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>My Sites</span>
                        <Badge variant="secondary" className="text-xs">{enumeratorMySites.length}</Badge>
                      </div>
                    </Button>
                  </div>
                </div>
                {loadingEnumerator ? (
                  <Card>
                    <CardContent className="py-8">
                      <div className="text-center text-muted-foreground">Loading your assignments...</div>
                    </CardContent>
                  </Card>
                ) : enumeratorSubTab === 'availableSites' ? (
                  <div className="space-y-2">
                    {Object.keys(enumeratorGroupedByStates).length === 0 ? (
                      <Card>
                        <CardContent className="py-8">
                          <div className="text-center text-muted-foreground">No sites available in your area yet.</div>
                        </CardContent>
                      </Card>
                    ) : (
                      <Accordion type="single" collapsible className="w-full">
                        {Object.entries(enumeratorGroupedByStates).map(([stateLocality, sites]) => (
                          <AccordionItem key={stateLocality} value={stateLocality}>
                            <AccordionTrigger className="px-4 py-3 hover:bg-gray-50 rounded-lg">
                              <div className="flex items-center justify-between w-full mr-4">
                                <span className="font-medium">{stateLocality}</span>
                                <Badge variant="secondary" className="ml-2">{sites.length} sites</Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <MMPSiteEntriesTable 
                                siteEntries={sites} 
                                editable={true}
                                onUpdateSites={async (updatedSites) => {
                                  // Handle updates for enumerator sites
                                  try {
                                    for (const site of updatedSites) {
                                      const enumFee = site.enumerator_fee ?? site.enumeratorFee;
                                      const transFee = site.transport_fee ?? site.transportFee;
                                      const calculatedCost = enumFee && transFee ? Number(enumFee) + Number(transFee) : site.cost;
                                      
                                      const existingAdditionalData = site.additionalData || site.additional_data || {};
                                      const updatedAdditionalData = {
                                        ...existingAdditionalData,
                                        enumerator_fee: enumFee,
                                        transport_fee: transFee,
                                        cost: calculatedCost
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
                                        cost: calculatedCost,
                                        enumerator_fee: enumFee !== undefined ? Number(enumFee) : undefined,
                                        transport_fee: transFee !== undefined ? Number(transFee) : undefined,
                                        status: site.status,
                                        verification_notes: site.verification_notes || site.verificationNotes,
                                        verified_by: site.verified_by || site.verifiedBy,
                                        verified_at: site.verified_at || site.verifiedAt,
                                        additional_data: updatedAdditionalData
                                      };

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
                                    // Reload available sites data
                                    const { data: updatedEntries } = await supabase
                                      .from('mmp_site_entries')
                                      .select('*')
                                      .or('status.ilike.dispatched,dispatched_at.not.is.null')
                                      .or(`state.eq.${currentUser?.stateId},locality.eq.${currentUser?.localityId}`)
                                      .order('created_at', { ascending: false })
                                      .limit(1000);
                                    
                                    if (updatedEntries) {
                                      const formattedEntries = updatedEntries.map(entry => {
                                        const additionalData = entry.additional_data || {};
                                        return {
                                          ...entry,
                                          siteName: entry.site_name,
                                          siteCode: entry.site_code,
                                          enumerator_fee: entry.enumerator_fee ?? additionalData.enumerator_fee,
                                          enumeratorFee: entry.enumerator_fee ?? additionalData.enumerator_fee,
                                          transport_fee: entry.transport_fee ?? additionalData.transport_fee,
                                          transportFee: entry.transport_fee ?? additionalData.transport_fee,
                                          additionalData: additionalData
                                        };
                                      });
                                      setEnumeratorSiteEntries(formattedEntries);
                                      // Re-group by state-locality
                                      const regrouped = formattedEntries.reduce((acc, entry) => {
                                        const state = entry.state || 'Unknown State';
                                        const locality = entry.locality || 'Unknown Locality';
                                        const key = `${state} - ${locality}`;
                                        if (!acc[key]) acc[key] = [];
                                        acc[key].push(entry);
                                        return acc;
                                      }, {} as Record<string, any[]>);
                                      setEnumeratorGroupedByStates(regrouped);
                                    }
                                    return true;
                                  } catch (error) {
                                    console.error('Failed to update sites:', error);
                                    return false;
                                  }
                                }}
                              />
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                  </div>
                ) : enumeratorSubTab === 'smartAssigned' || enumeratorSubTab === 'mySites' ? (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">My Sites</h3>
                        {/* <p className="text-sm text-muted-foreground">Accepted sites + sites assigned to your area</p> */}
                      </div>
                      <Badge variant="secondary">{enumeratorMySites.length} sites</Badge>
                    </div>
                    {enumeratorSubTab === 'smartAssigned' && (
                      <div className="mb-4 p-3 sm:p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800 leading-relaxed">
                          <strong>Note:</strong> Sites under this category are mandatory to be visited. If you have any issues, please contact your immediate supervisors.
                        </p>
                      </div>
                    )}
                    {(enumeratorSubTab === 'smartAssigned' ? enumeratorSmartAssigned : enumeratorMySites).length === 0 ? (
                      <Card>
                        <CardContent className="py-8">
                          <div className="text-center text-muted-foreground">No sites assigned to you yet.</div>
                        </CardContent>
                      </Card>
                    ) : (
                      <MMPSiteEntriesTable 
                          siteEntries={enumeratorSubTab === 'smartAssigned' ? enumeratorSmartAssigned : enumeratorMySites} 
                          editable={true}
                          onUpdateSites={async (updatedSites) => {
                            // Same update logic as above
                            try {
                              for (const site of updatedSites) {
                                const enumFee = site.enumerator_fee ?? site.enumeratorFee;
                                const transFee = site.transport_fee ?? site.transportFee;
                                const calculatedCost = enumFee && transFee ? Number(enumFee) + Number(transFee) : site.cost;
                                
                                const existingAdditionalData = site.additionalData || site.additional_data || {};
                                const updatedAdditionalData = {
                                  ...existingAdditionalData,
                                  enumerator_fee: enumFee,
                                  transport_fee: transFee,
                                  cost: calculatedCost
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
                                  cost: calculatedCost,
                                  enumerator_fee: enumFee !== undefined ? Number(enumFee) : undefined,
                                  transport_fee: transFee !== undefined ? Number(transFee) : undefined,
                                  status: site.status,
                                  verification_notes: site.verification_notes || site.verificationNotes,
                                  verified_by: site.verified_by || site.verifiedBy,
                                  verified_at: site.verified_at || site.verifiedAt,
                                  additional_data: updatedAdditionalData
                                };

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
                              // Reload available sites data as well
                              const smartAssignedQ = supabase
                                .from('mmp_site_entries')
                                .select('*')
                                .eq('accepted_by', currentUser?.id)
                                .order('created_at', { ascending: false })
                                .limit(1000);

                              const mySitesQ = supabase
                                .from('mmp_site_entries')
                                .select('*')
                                .or(`accepted_by.eq.${currentUser?.id},and(status.ilike.dispatched,accepted_by.is.null,or(state.eq.${currentUser?.stateId},locality.eq.${currentUser?.localityId}))`)
                                .order('created_at', { ascending: false })
                                .limit(1000);

                              const availableQ = supabase
                                .from('mmp_site_entries')
                                .select('*')
                                .or('status.ilike.dispatched,dispatched_at.not.is.null')
                                .or(`state.eq.${currentUser?.stateId},locality.eq.${currentUser?.localityId}`)
                                .order('created_at', { ascending: false })
                                .limit(1000);

                              const [smartRes, myRes, availableRes] = await Promise.all([smartAssignedQ, mySitesQ, availableQ]);
                              const smartData = smartRes.data || [];
                              const myData = myRes.data || [];
                              const availableData = availableRes.data || [];

                              // Format and set
                              const format = (entries: any[]) => entries.map((entry: any) => {
                                const additionalData = entry.additional_data || {};
                                return {
                                  ...entry,
                                  siteName: entry.site_name,
                                  siteCode: entry.site_code,
                                  enumerator_fee: entry.enumerator_fee ?? additionalData.enumerator_fee,
                                  enumeratorFee: entry.enumerator_fee ?? additionalData.enumerator_fee,
                                  transport_fee: entry.transport_fee ?? additionalData.transport_fee,
                                  transportFee: entry.transport_fee ?? additionalData.transport_fee,
                                  additionalData: additionalData
                                };
                              });

                              const formattedSmart = format(smartData);
                              const formattedMy = format(myData);
                              const formattedAvailable = format(availableData);

                              setEnumeratorSmartAssigned(formattedSmart);
                              // dedupe union
                              const mapUnion = new Map<string, any>();
                              formattedSmart.forEach((e: any) => { if (e && e.id) mapUnion.set(String(e.id), e); });
                              formattedMy.forEach((e: any) => { if (!e) return; const k = e.id ? String(e.id) : `${e.mmp_file_id || e.mmpId}-${e.site_code || e.siteCode || ''}`; if (!mapUnion.has(k)) mapUnion.set(k, e); });
                              const unionList = Array.from(mapUnion.values());
                              setEnumeratorMySites(unionList);

                              // Update available sites
                              setEnumeratorSiteEntries(formattedAvailable);
                              const regroupedAvailable = formattedAvailable.reduce((acc, entry) => {
                                const state = entry.state || 'Unknown State';
                                const locality = entry.locality || 'Unknown Locality';
                                const key = `${state} - ${locality}`;
                                if (!acc[key]) acc[key] = [];
                                acc[key].push(entry);
                                return acc;
                              }, {} as Record<string, any[]>);
                              setEnumeratorGroupedByStates(regroupedAvailable);
                              return true;
                            } catch (error) {
                              console.error('Failed to update sites:', error);
                              return false;
                            }
                          }}
                        />
                    )}
                  </div>
                ) : null}
              </TabsContent>
            )}
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
                  .ilike('status', 'Dispatched')
                  .not('status', 'ilike', 'accepted')
                  .is('accepted_by', null)
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
