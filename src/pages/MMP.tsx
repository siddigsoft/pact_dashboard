
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Upload, ChevronLeft, Trash2 } from 'lucide-react';
import { useMMP } from '@/context/mmp/MMPContext';
import { MMPList } from '@/components/mmp/MMPList';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/use-authorization';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { SiteVisitRow } from '@/components/mmp/MMPCategorySitesTable';
import MMPSiteEntriesTable from '@/components/mmp/MMPSiteEntriesTable';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

// Using relative import fallback in case path alias resolution misses new file
import BulkClearForwardedDialog from '../components/mmp/BulkClearForwardedDialog';
import { DispatchSitesDialog } from '@/components/mmp/DispatchSitesDialog';
import { sudanStates } from '@/data/sudanStates';
import { VisitReportDialog, VisitReportData } from '@/components/site-visit/VisitReportDialog';
import { StartVisitDialog } from '@/components/site-visit/StartVisitDialog';

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
        // Filter for verified sites (case-insensitive)
        const { data: mmpEntries, error: mmpError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .in('mmp_file_id', mmpIds)
          .ilike('status', 'verified');

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
  const [verifiedSubTab, setVerifiedSubTab] = useState<'newSites' | 'approvedCosted' | 'dispatched' | 'smartAssigned' | 'accepted' | 'ongoing' | 'completed'>('newSites');
  // Subcategory state for Enumerator dashboard
  const [enumeratorSubTab, setEnumeratorSubTab] = useState<'availableSites' | 'smartAssigned' | 'mySites'>('availableSites');
  // Sub-subcategory state for My Sites (Data Collector)
  const [mySitesSubTab, setMySitesSubTab] = useState<'pending' | 'ongoing' | 'completed'>('pending');
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
  const [smartAssignedSiteEntries, setSmartAssignedSiteEntries] = useState<any[]>([]);
  const [loadingSmartAssigned, setLoadingSmartAssigned] = useState(false);
  const [smartAssignedCount, setSmartAssignedCount] = useState(0);
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [dispatchType, setDispatchType] = useState<'state' | 'locality' | 'individual'>('state');

  // Load smart assigned site entries only when the tab is active
  useEffect(() => {
    const loadSmartAssignedEntries = async () => {
      if (verifiedSubTab !== 'smartAssigned') {
        setSmartAssignedSiteEntries([]);
        return;
      }

      setLoadingSmartAssigned(true);
      try {
        // Load entries with status = 'Assigned' (case-insensitive)
        const { data: smartAssignedEntries, error: allError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .ilike('status', 'Assigned')
          .order('created_at', { ascending: false })
          .limit(1000);

        if (allError) throw allError;

        // Format entries for MMPSiteEntriesTable
        const formattedEntries = smartAssignedEntries.map(entry => {
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
            cost_acknowledged: entry.cost_acknowledged ?? additionalData.cost_acknowledged,
            updated_at: entry.updated_at,
            additionalData: additionalData
          };
        });

        setSmartAssignedSiteEntries(formattedEntries);
        setSmartAssignedCount(formattedEntries.length);
      } catch (error) {
        console.error('Failed to load smart assigned site entries:', error);
        setSmartAssignedSiteEntries([]);
        setSmartAssignedCount(0);
      } finally {
        setLoadingSmartAssigned(false);
      }
    };

    loadSmartAssignedEntries();
  }, [verifiedSubTab]);

  // Cost acknowledgment dialog state for Smart Assigned sites
  const [costAcknowledgmentOpen, setCostAcknowledgmentOpen] = useState(false);
  const [selectedSiteForAcknowledgment, setSelectedSiteForAcknowledgment] = useState<any>(null);
  const [costAcknowledged, setCostAcknowledged] = useState(false);

  // Site visit workflow state
  const [startVisitDialogOpen, setStartVisitDialogOpen] = useState(false);
  const [completeVisitDialogOpen, setCompleteVisitDialogOpen] = useState(false);
  const [selectedSiteForVisit, setSelectedSiteForVisit] = useState<any>(null);
  const [visitLocationTracking, setVisitLocationTracking] = useState<{[key: string]: boolean}>({});
  const [visitLocations, setVisitLocations] = useState<{[key: string]: any[]}>({});
  const [currentLocation, setCurrentLocation] = useState<{latitude: number, longitude: number} | null>(null);

  // Visit report dialog state
  const [visitReportDialogOpen, setVisitReportDialogOpen] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [startingVisit, setStartingVisit] = useState(false);

  // Accept/Reject dialog state for Smart Assigned sites
  const [acceptRejectDialogOpen, setAcceptRejectDialogOpen] = useState(false);
  const [selectedSiteForAction, setSelectedSiteForAction] = useState<any>(null);
  const [rejectComments, setRejectComments] = useState('');
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  // Handle accepting a Smart Assigned site
  const handleAcceptSite = async (site: any) => {
    try {
      console.log('🔄 Starting site acceptance for site:', site.id, site.site_name);
      
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'accepted',
          accepted_by: currentUser?.id,
          accepted_at: now,
          updated_at: now
        })
        .eq('id', site.id);

      if (error) {
        console.error('❌ Database update failed:', error);
        throw error;
      }

      console.log('✅ Database update successful');

      toast({
        title: 'Site Accepted',
        description: 'The site has been successfully accepted and moved to "My Sites".',
        variant: 'default'
      });

      // Reload enumerator data instead of full page reload
      if (isDataCollector && currentUser?.id) {
        setLoadingEnumerator(true);
        try {
          console.log('🔄 Reloading enumerator data after site acceptance...');

          // Convert collector's stateId/localityId to names for matching with site entries
          const collectorStateName = currentUser.stateId ? sudanStates.find(s => s.id === currentUser.stateId)?.name : undefined;
          const collectorLocalityName = currentUser.stateId && currentUser.localityId
            ? sudanStates.find(s => s.id === currentUser.stateId)?.localities.find(l => l.id === currentUser.localityId)?.name
            : undefined;

          // Build query for "Available Sites" - status = "Dispatched" (bulk dispatched)
          // These are unclaimed sites (accepted_by IS NULL) in the collector's area
          let availableSitesQuery = supabase
            .from('mmp_site_entries')
            .select('*')
            .ilike('status', 'Dispatched') // Only "Dispatched" status (bulk dispatched)
            .is('accepted_by', null); // Only unclaimed sites

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
          const smartAssignedQuery = supabase
            .from('mmp_site_entries')
            .select('*')
            .ilike('status', 'Assigned')
            .eq('accepted_by', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(1000);

          // Load accepted sites for "My Sites" tab
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

          console.log('🔍 Query results after acceptance:');
          console.log('  Available sites:', availableResult.data?.length || 0, 'found');
          console.log('  Smart assigned:', smartAssignedResult.data?.length || 0, 'found');
          console.log('  My sites:', mySitesResult.data?.length || 0, 'found');

          // Check if the accepted site is still in available sites (it shouldn't be)
          const acceptedSiteInAvailable = availableResult.data?.find(s => s.id === site.id);
          if (acceptedSiteInAvailable) {
            console.error('❌ BUG: Accepted site still appears in Available Sites!', acceptedSiteInAvailable);
          } else {
            console.log('✅ Good: Accepted site no longer appears in Available Sites');
          }

          // Check if the accepted site appears in My Sites (it should)
          const acceptedSiteInMySites = mySitesResult.data?.find(s => s.id === site.id);
          if (acceptedSiteInMySites) {
            console.log('✅ Good: Accepted site appears in My Sites');
          } else {
            console.error('❌ BUG: Accepted site does not appear in My Sites!');
          }

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
          const rawSmartAssigned = formatEntries(smartAssignedResult.data || []);
          const smartAssignedEntries = rawSmartAssigned.filter(entry => {
            const additionalData = entry.additional_data || {};
            const costAcknowledged = entry.cost_acknowledged ?? additionalData.cost_acknowledged;
            return !costAcknowledged;
          });
          const mySitesEntries = formatEntries(mySitesResult.data || []);

          console.log('📊 Final state after formatting:');
          console.log('  Available entries:', availableEntries.length);
          console.log('  Smart assigned entries:', smartAssignedEntries.length);
          console.log('  My sites entries:', mySitesEntries.length);

          // Store all entries for reference
          setEnumeratorSiteEntries(availableEntries);

          // Group available sites by state and locality combined
          const groupedByStateLocality = availableEntries.reduce((acc, entry) => {
            const state = entry.state || 'Unknown State';
            const locality = entry.locality || 'Unknown Locality';
            const key = `${state} - ${locality}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(entry);
            return acc;
          }, {} as Record<string, any[]>);
          setEnumeratorGroupedByStates(groupedByStateLocality);
          setEnumeratorGroupedByLocality({});

          // Set smart assigned entries
          setEnumeratorSmartAssigned(smartAssignedEntries);

          // Build deduplicated union for "My Sites"
          try {
            const byId = new Map<string, any>();
            (smartAssignedEntries || []).forEach((e: any) => {
              if (e && e.id) byId.set(String(e.id), e);
            });
            (mySitesEntries || []).forEach((e: any) => {
              if (!e) return;
              const key = e.id ? String(e.id) : `${e.mmp_file_id || e.mmpId}-${e.site_code || e.siteCode || ''}`;
              if (!byId.has(key)) byId.set(key, e);
            });
            setEnumeratorMySites(Array.from(byId.values()));
            console.log('✅ Enumerator data reloaded successfully after site acceptance');
          } catch (e) {
            console.error('❌ Error building My Sites union:', e);
            setEnumeratorMySites(mySitesEntries);
          }

        } catch (reloadError) {
          console.error('❌ Failed to reload enumerator data:', reloadError);
          // Fallback to page reload if data reload fails
          window.location.reload();
        } finally {
          setLoadingEnumerator(false);
        }
      } else {
        // Fallback for non-enumerator users
        window.location.reload();
      }
    } catch (error: any) {
      console.error('Failed to accept site:', error);
      toast({
        title: 'Acceptance Failed',
        description: error.message || 'Failed to accept the site. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Handle sending back available site to coordinator
  const handleSendBackToCoordinator = async (site: any, comments: string) => {
    if (!comments.trim()) {
      toast({
        title: 'Comments Required',
        description: 'Please provide comments explaining why this site needs to be sent back.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const now = new Date().toISOString();
      const existingAdditionalData = site.additional_data || {};
      
      // Identify coordinator to notify (from forwarded_to_user_id)
      // Note: dispatched_by is text (name), not UUID, so we use forwarded_to_user_id which is UUID
      const coordinatorId = site.forwarded_to_user_id || 
                           existingAdditionalData.assigned_to || 
                           existingAdditionalData.dispatched_by_user_id ||
                           existingAdditionalData.forwarded_to_user_id;
      
      // Update site entry - use dedicated rejection columns (new schema)
      const { error: updateError } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'Rejected',
          rejection_comments: comments.trim(),
          rejected_by: currentUser?.id,
          rejected_at: now,
          updated_at: now,
          // Also store in additional_data for backward compatibility and audit trail
          additional_data: {
            ...existingAdditionalData,
            rejection_comments: comments.trim(),
            rejected_by: currentUser?.id,
            rejected_at: now,
            rejection_reason: comments.trim(), // Alternative key for compatibility
            sent_back_by: currentUser?.id,
            sent_back_at: now
          }
        })
        .eq('id', site.id);

      if (updateError) throw updateError;

      // Create notification for coordinator if we can identify them
      if (coordinatorId && typeof coordinatorId === 'string') {
        try {
          // Get site details for notification
          const siteName = site.site_name || site.siteName || site.siteCode || 'Site';
          const mmpName = site.mmp_name || site.mmpName || 'MMP';
          
          await supabase.from('notifications').insert({
            user_id: coordinatorId,
            title: 'Site Sent Back for Editing',
            message: `Site "${siteName}" from ${mmpName} has been sent back with comments: ${comments.trim().substring(0, 100)}${comments.length > 100 ? '...' : ''}`,
            type: 'warning',
            link: `/coordinator/sites`,
            related_entity_id: site.id,
            related_entity_type: 'mmpFile'
          });
        } catch (notifError) {
          // Log but don't fail the operation if notification fails
          console.warn('Failed to create notification for coordinator:', notifError);
        }
      }

      toast({
        title: 'Site Sent Back',
        description: 'The site has been sent back to the coordinator for editing.',
        variant: 'default'
      });

      // Reload available sites data
      const loadEnumeratorEntries = async () => {
        if (!isDataCollector || !currentUser?.id) return;

        try {
          // Load available sites in the enumerator's state or locality for "Available Sites" tab
          const availableSitesQuery = supabase
            .from('mmp_site_entries')
            .select('*')
            .ilike('status', 'Dispatched')
            .or(`state.eq.${currentUser.stateId},locality.eq.${currentUser.localityId}`)
            .is('accepted_by', null) // Only show unclaimed dispatched sites
            .order('created_at', { ascending: false })
            .limit(1000);

          const { data: availableEntries, error: availableError } = await availableSitesQuery;
          if (availableError) throw availableError;

          // Format entries for display
          const formatEntries = (entries: any[]) => entries.map(entry => {
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

          const formattedAvailable = formatEntries(availableEntries || []);
          setEnumeratorSiteEntries(formattedAvailable);

          // Group available sites by state and locality combined
          const groupedByStateLocality = formattedAvailable.reduce((acc, entry) => {
            const state = entry.state || 'Unknown State';
            const locality = entry.locality || 'Unknown Locality';
            const key = `${state} - ${locality}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(entry);
            return acc;
          }, {} as Record<string, any[]>);
          setEnumeratorGroupedByStates(groupedByStateLocality);
        } catch (error) {
          console.error('Failed to reload enumerator entries:', error);
        }
      };

      await loadEnumeratorEntries();
    } catch (error: any) {
      console.error('Failed to send back site:', error);
      toast({
        title: 'Send Back Failed',
        description: error.message || 'Failed to send the site back. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Handle cost acknowledgment for Smart Assigned sites
  const handleCostAcknowledgment = (site: any) => {
    setSelectedSiteForAcknowledgment(site);
    setCostAcknowledgmentOpen(true);
  };

  // GPS location functions
  const getCurrentLocation = (): Promise<{latitude: number, longitude: number}> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    });
  };

  const startLocationTracking = (siteId: string) => {
    if (!visitLocationTracking[siteId]) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: new Date().toISOString(),
            accuracy: position.coords.accuracy
          };

          setVisitLocations(prev => ({
            ...prev,
            [siteId]: [...(prev[siteId] || []), location]
          }));

          setCurrentLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          console.error('Location tracking error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000 // 30 seconds
        }
      );

      setVisitLocationTracking(prev => ({
        ...prev,
        [siteId]: true
      }));

      // Store watchId for cleanup
      setVisitLocations(prev => ({
        ...prev,
        [siteId]: prev[siteId] || []
      }));
    }
  };

  const stopLocationTracking = (siteId: string) => {
    setVisitLocationTracking(prev => ({
      ...prev,
      [siteId]: false
    }));
  };

  // Handle starting a site visit
  const handleStartVisit = async (site: any) => {
    try {
      // Check location permissions first
      if (!navigator.geolocation) {
        toast({
          title: 'Location Not Supported',
          description: 'Geolocation is not supported by this browser.',
          variant: 'destructive'
        });
        return;
      }

      // Request location permission
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      if (permission.state === 'denied') {
        toast({
          title: 'Location Permission Denied',
          description: 'Please enable location permissions in your browser settings to start site visits.',
          variant: 'destructive'
        });
        return;
      }

      // Set the site for visit and open start dialog
      setSelectedSiteForVisit(site);
      setStartVisitDialogOpen(true);

    } catch (error: any) {
      console.error('Failed to check location permissions:', error);
      toast({
        title: 'Permission Check Failed',
        description: error.message || 'Failed to check location permissions. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Handle confirming start visit after dialog - now starts the visit (sets to in_progress)
  const handleConfirmStartVisit = async () => {
    if (!selectedSiteForVisit) return;

    try {
      setStartingVisit(true);

      const site = selectedSiteForVisit;
      const now = new Date().toISOString();

      // Update site status to 'In Progress' and save visit start information
      await supabase
        .from('mmp_site_entries')
        .update({
          status: 'In Progress',
          visit_started_at: now,
          visit_started_by: currentUser?.id,
          updated_at: now,
          additional_data: {
            ...(site.additional_data || {}),
            visit_started_at: now,
            visit_started_by: currentUser?.id
          }
        })
        .eq('id', site.id);

      toast({
        title: 'Visit Started',
        description: 'Site visit has been started successfully. Please complete your visit report.',
        variant: 'default'
      });

      // Close start dialog and open visit report dialog
      setStartVisitDialogOpen(false);
      setVisitReportDialogOpen(true);
      setStartingVisit(false);

    } catch (error: any) {
      console.error('Failed to start visit:', error);
      toast({
        title: 'Visit Start Failed',
        description: error.message || 'Failed to start the site visit. Please try again.',
        variant: 'destructive'
      });
      setStartingVisit(false);
    }
  };

  // Handle completing a site visit
  const handleCompleteVisit = async (site: any) => {
    try {
      // Get final location
      const location = await getCurrentLocation();

      const now = new Date().toISOString();

      // Stop location tracking
      stopLocationTracking(site.id);

      // Update site with visit completion time and final location (but don't change status yet)
      await supabase
        .from('mmp_site_entries')
        .update({
          visit_completed_at: now,
          visit_completed_by: currentUser?.id,
          updated_at: now,
          additional_data: {
            ...(site.additional_data || {}),
            visit_completed_at: now,
            visit_completed_by: currentUser?.id,
            final_location: location
          }
        })
        .eq('id', site.id);

      // Save final location to site_locations table
      await supabase
        .from('site_locations')
        .insert({
          site_id: site.id,
          user_id: currentUser?.id || null,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: 10, // Default accuracy value
          notes: 'Visit end location',
          recorded_at: now
        });

      // Process wallet payment for the user who completed the site entry
      try {
        const acceptedBy = site.accepted_by || site.additional_data?.accepted_by;
        
        if (acceptedBy) {
          // Get the cost amount from the site entry
          const additionalData = site.additional_data || {};
          const enumeratorFee = additionalData.enumerator_fee || site.enumerator_fee || 0;
          const transportFee = additionalData.transport_fee || site.transport_fee || 0;
          const directCost = site.cost || 0;
          
          // Calculate total cost: use direct cost if available, otherwise sum fees
          const totalCost = directCost > 0 
            ? directCost 
            : (Number(enumeratorFee) + Number(transportFee));
          
          if (totalCost > 0) {
            // Get or create wallet for the user
            const { data: walletData, error: walletError } = await supabase
              .from('wallets')
              .select('*')
              .eq('user_id', acceptedBy)
              .single();

            let walletId: string;
            let currentBalance = 0;

            if (walletError && walletError.code === 'PGRST116') {
              // Wallet doesn't exist, create it
              const { data: newWallet, error: createError } = await supabase
                .from('wallets')
                .insert({
                  user_id: acceptedBy,
                  balances: { SDG: totalCost },
                  total_earned: totalCost,
                })
                .select()
                .single();

              if (createError) throw createError;
              walletId = newWallet.id;
            } else if (walletError) {
              throw walletError;
            } else {
              walletId = walletData.id;
              currentBalance = parseFloat(walletData.balances?.SDG || 0);
              const newBalance = currentBalance + totalCost;

              // Update wallet balance
              await supabase
                .from('wallets')
                .update({
                  balances: { ...walletData.balances, SDG: newBalance },
                  total_earned: parseFloat(walletData.total_earned || 0) + totalCost,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', walletId);
            }

            // Create wallet transaction
            await supabase.from('wallet_transactions').insert({
              wallet_id: walletId,
              user_id: acceptedBy,
              type: 'site_visit_fee',
              amount: totalCost,
              currency: 'SDG',
              site_visit_id: site.id, // Using site entry ID as reference
              description: `MMP site entry completed: ${site.site_name || site.siteName || 'Site'}`,
              balance_before: currentBalance,
              balance_after: currentBalance + totalCost,
              created_by: currentUser?.id,
            });

            console.log(`Payment of ${totalCost} SDG added to wallet for user ${acceptedBy} for site entry ${site.id}`);
          }
        } else {
          console.warn(`No accepted_by user found for site entry ${site.id}, skipping wallet payment`);
        }
      } catch (walletErr) {
        console.error('Failed to process wallet payment for completed site entry:', walletErr);
        // Don't fail the entire operation if wallet payment fails
        toast({
          title: 'Payment Warning',
          description: 'Site visit completed but wallet payment failed. Please contact support.',
          variant: 'destructive',
        });
      }

      // Set the site for visit report and open dialog
      setSelectedSiteForVisit(site);
      setVisitReportDialogOpen(true);

      toast({
        title: 'Visit Completed',
        description: 'Site visit has been completed. Please submit your report.',
        variant: 'default'
      });

    } catch (error: any) {
      console.error('Failed to complete visit:', error);
      toast({
        title: 'Complete Visit Failed',
        description: error.message || 'Failed to complete the site visit. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Handle submitting visit report
  const handleSubmitVisitReport = async (reportData: VisitReportData) => {
    if (!selectedSiteForVisit) {
      console.error('❌ No selected site for visit');
      return;
    }

    try {
      console.log('🚀 Starting visit report submission for site:', selectedSiteForVisit.id);
      setSubmittingReport(true);

      const site = selectedSiteForVisit;
      const now = new Date().toISOString();

      // Upload photos to Supabase storage
      console.log('📸 Uploading photos...');
      const photoUrls: string[] = [];
      for (const photo of reportData.photos) {
        const fileName = `visit-photos/${site.id}/${Date.now()}-${photo.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('site-visit-photos')
          .upload(fileName, photo);

        if (uploadError) {
          console.error('❌ Error uploading photo:', uploadError);
          continue; // Continue with other photos
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('site-visit-photos')
          .getPublicUrl(fileName);

        if (urlData?.publicUrl) {
          photoUrls.push(urlData.publicUrl);
        }
      }
      console.log('✅ Photos uploaded:', photoUrls.length);

      // Prepare coordinates in the format expected by the database (JSONB with latitude and longitude)
      const coordinatesJsonb = reportData.coordinates ? {
        latitude: reportData.coordinates.latitude,
        longitude: reportData.coordinates.longitude,
        accuracy: reportData.coordinates.accuracy
      } : {};

      // Save report to reports table
      console.log('💾 Saving visit report to database...');
      const { data: report, error: reportError } = await supabase
        .from('reports')
        .insert({
          site_visit_id: site.id,
          submitted_by: currentUser?.id || null,
          activities: reportData.activities,
          notes: reportData.notes || 'No additional notes provided',
          duration_minutes: reportData.visitDuration,
          coordinates: coordinatesJsonb,
          submitted_at: now
        })
        .select()
        .single();

      if (reportError) {
        console.error('❌ Report save error:', reportError);
        throw reportError;
      }
      console.log('✅ Report saved with ID:', report.id);

      // Link photos to report via report_photos table
      if (photoUrls.length > 0) {
        console.log('📎 Linking photos to report...');
        const reportPhotos = photoUrls.map((photoUrl, index) => ({
          report_id: report.id,
          photo_url: photoUrl,
          storage_path: null // Can be added if we track the storage path
        }));

        const { error: photosError } = await supabase
          .from('report_photos')
          .insert(reportPhotos);

        if (photosError) {
          console.error('❌ Error linking photos to report:', photosError);
          // Don't throw - report is already created, just log the error
        } else {
          console.log('✅ Photos linked to report');
        }
      }

      // Generate PDF report
      console.log('📄 Generating PDF report...');
      await generateVisitReportPDF(site, reportData, report, photoUrls);

      // Update site status to 'Completed' and save report info
      console.log('🔄 Updating site status to Completed...');
      const { data: updateData, error: updateError } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'Completed',
          additional_data: {
            ...(site.additional_data || {}),
            visit_report_submitted: true,
            visit_report_id: report.id,
            visit_report_submitted_at: now
          }
        })
        .eq('id', site.id)
        .select();

      if (updateError) {
        console.error('❌ Site status update error:', updateError);
        throw updateError;
      }
      console.log('✅ Site status updated to Completed:', updateData);

      toast({
        title: 'Visit Report Submitted',
        description: 'Visit report has been submitted successfully and site visit is now completed.',
        variant: 'default'
      });

      // Close dialog and reset state
      setVisitReportDialogOpen(false);
      setSelectedSiteForVisit(null);
      setSubmittingReport(false);

      // Reload enumerator data immediately instead of full page reload
      if (isDataCollector && currentUser?.id) {
        console.log('🔄 Reloading enumerator data after visit completion...');
        try {
          // Load updated my sites data
          const { data: mySitesData, error: mySitesError } = await supabase
            .from('mmp_site_entries')
            .select('*')
            .eq('accepted_by', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(1000);

          if (!mySitesError && mySitesData) {
            const formatEntries = (entries: any[]) => entries.map(entry => {
              const additionalData = entry.additional_data || {};
              const enumeratorFee = entry.enumerator_fee ?? additionalData.enumerator_fee;
              const transportFee = entry.transport_fee ?? additionalData.transport_fee;
              return {
                ...entry,
                siteName: entry.site_name,
                siteCode: entry.site_code,
                enumerator_fee: enumeratorFee,
                enumeratorFee: enumeratorFee,
                transport_fee: transportFee,
                transportFee: transportFee,
                additionalData: additionalData
              };
            });

            const formattedMySites = formatEntries(mySitesData);
            setEnumeratorMySites(formattedMySites);
            console.log('✅ Enumerator My Sites updated:', formattedMySites.length, 'sites');
          }
        } catch (error) {
          console.error('❌ Failed to reload enumerator data:', error);
        }
      }

      // Still do a full page reload as fallback
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error: any) {
      console.error('❌ Failed to submit visit report:', error);
      toast({
        title: 'Report Submission Failed',
        description: error.message || 'Failed to submit the visit report. Please try again.',
        variant: 'destructive'
      });
      setSubmittingReport(false);
    }
  };

  // Generate PDF report for visit
  const generateVisitReportPDF = async (site: any, reportData: VisitReportData, report: any, photoUrls: string[]) => {
    try {
      // Import jsPDF dynamically to avoid issues with SSR
      const { jsPDF } = await import('jspdf');

      const doc = new jsPDF();

      // Title
      doc.setFontSize(20);
      doc.text('Site Visit Report', 105, 20, { align: 'center' });

      // Site Information
      doc.setFontSize(14);
      doc.text('Site Information', 20, 40);

      doc.setFontSize(10);
      doc.text(`Site Code: ${site.siteCode || site.site_code || 'N/A'}`, 20, 55);
      doc.text(`Site Name: ${site.siteName || site.site_name || 'N/A'}`, 20, 65);
      doc.text(`Location: ${site.locality || site.state || 'N/A'}`, 20, 75);
      doc.text(`CP Name: ${site.cpName || site.cp_name || 'N/A'}`, 20, 85);
      doc.text(`Activity: ${site.siteActivity || site.activity_at_site || 'N/A'}`, 20, 95);

      // Visit Information
      doc.setFontSize(14);
      doc.text('Visit Information', 20, 115);

      doc.setFontSize(10);
      const visitStart = site.additional_data?.visit_started_at;
      const visitEnd = site.additional_data?.visit_completed_at;
      doc.text(`Visit Started: ${visitStart ? new Date(visitStart).toLocaleString() : 'N/A'}`, 20, 130);
      doc.text(`Visit Completed: ${visitEnd ? new Date(visitEnd).toLocaleString() : 'N/A'}`, 20, 140);
      doc.text(`Visit Duration: ${reportData.visitDuration} minutes`, 20, 150);
      doc.text(`Data Collector: ${currentUser?.fullName || currentUser?.email || 'N/A'}`, 20, 160);

      // Activities Performed
      doc.setFontSize(14);
      doc.text('Activities Performed', 20, 180);

      doc.setFontSize(10);
      const activitiesLines = doc.splitTextToSize(reportData.activities, 170);
      doc.text(activitiesLines, 20, 195);

      // Additional Notes
      const notesY = 195 + (activitiesLines.length * 5) + 10;
      doc.setFontSize(14);
      doc.text('Additional Notes', 20, notesY);

      doc.setFontSize(10);
      const notesLines = doc.splitTextToSize(reportData.notes, 170);
      doc.text(notesLines, 20, notesY + 15);

      // Location Data Summary
      const locationY = notesY + 15 + (notesLines.length * 5) + 10;
      if (reportData.locationData && reportData.locationData.length > 0) {
        doc.setFontSize(14);
        doc.text('Location Tracking Summary', 20, locationY);

        doc.setFontSize(10);
        doc.text(`Total Location Points: ${reportData.locationData.length}`, 20, locationY + 15);

        // Show first and last location points
        if (reportData.locationData.length > 0) {
          const firstLocation = reportData.locationData[0];
          const lastLocation = reportData.locationData[reportData.locationData.length - 1];

          doc.text(`Start Location: ${firstLocation.latitude?.toFixed(6)}, ${firstLocation.longitude?.toFixed(6)}`, 20, locationY + 25);
          doc.text(`End Location: ${lastLocation.latitude?.toFixed(6)}, ${lastLocation.longitude?.toFixed(6)}`, 20, locationY + 35);
        }
      }

      // Photos information
      const photosY = locationY + 50;
      if (photoUrls.length > 0) {
        doc.setFontSize(14);
        doc.text('Photos Attached', 20, photosY);

        doc.setFontSize(10);
        doc.text(`Number of Photos: ${photoUrls.length}`, 20, photosY + 15);
        doc.text('Photos are stored in the system and can be viewed in the dashboard.', 20, photosY + 25);
      }

      // Footer
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.text(`Report Generated: ${new Date().toLocaleString()}`, 20, pageHeight - 20);
      doc.text(`Report ID: ${report.id}`, 20, pageHeight - 10);

      // Save the PDF
      const fileName = `visit-report-${site.siteCode || site.site_code || site.id}-${Date.now()}.pdf`;
      doc.save(fileName);

    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: 'PDF Generation Warning',
        description: 'Report submitted successfully, but PDF generation failed. You can still view the report in the dashboard.',
        variant: 'default'
      });
    }
  };

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
        // Count entries with status = 'accepted' only
        const { count, error } = await supabase
          .from('mmp_site_entries')
          .select('*', { count: 'exact', head: true })
          .ilike('status', 'accepted');

        if (error) throw error;

        setAcceptedCount(count || 0);
      } catch (error) {
        console.error('Failed to load accepted count:', error);
        setAcceptedCount(0);
      }
    };

    loadAcceptedCount();
  }, [mmpFiles]); // Reload when MMP files change

  // Always load the smart assigned count for the badge, regardless of active tab
  useEffect(() => {
    const loadSmartAssignedCount = async () => {
      try {
        // Use database count instead of loading all entries
        // Count entries with status = 'Assigned' only
        const { count, error } = await supabase
          .from('mmp_site_entries')
          .select('*', { count: 'exact', head: true })
          .ilike('status', 'Assigned');

        if (error) throw error;

        setSmartAssignedCount(count || 0);
      } catch (error) {
        console.error('Failed to load smart assigned count:', error);
        setSmartAssignedCount(0);
      }
    };

    loadSmartAssignedCount();
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
        console.log('🔍 Loading enumerator entries for user:', {
          userId: currentUser.id,
          stateId: currentUser.stateId,
          localityId: currentUser.localityId,
          role: currentUser.role
        });

        // Load available sites in the enumerator's state or locality for "Available Sites" tab
        // These are sites with status "Dispatched" (bulk dispatched by state/locality)
        // Convert collector's stateId/localityId to names for matching with site entries
        const collectorStateName = currentUser.stateId ? sudanStates.find(s => s.id === currentUser.stateId)?.name : undefined;
        const collectorLocalityName = currentUser.stateId && currentUser.localityId
          ? sudanStates.find(s => s.id === currentUser.stateId)?.localities.find(l => l.id === currentUser.localityId)?.name
          : undefined;
        
        console.log('🔍 Collector location:', {
          stateId: currentUser.stateId,
          localityId: currentUser.localityId,
          stateName: collectorStateName,
          localityName: collectorLocalityName
        });

        // Debug: Check if there are any dispatched sites at all
        const debugAllDispatchedQuery = supabase
          .from('mmp_site_entries')
          .select('id, site_name, state, locality, status, accepted_by')
          .ilike('status', 'Dispatched')
          .limit(10);
        
        const debugResult = await debugAllDispatchedQuery;
        console.log('🔍 Debug - All dispatched sites (sample):', {
          count: debugResult.data?.length || 0,
          sample: debugResult.data,
          error: debugResult.error
        });
        
        // Build query for "Available Sites" - status = "Dispatched" (bulk dispatched)
        // These are unclaimed sites (accepted_by IS NULL) in the collector's area
        let availableSitesQuery = supabase
          .from('mmp_site_entries')
          .select('*')
          .ilike('status', 'Dispatched') // Only "Dispatched" status (bulk dispatched)
          .is('accepted_by', null); // Only unclaimed sites
        
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
        } else {
          // If no state/locality is set, log a warning but still try to load all dispatched sites
          console.warn('⚠️ Data collector has no stateId or localityId set. Loading all dispatched sites.');
        }
        
        availableSitesQuery = availableSitesQuery
          .order('created_at', { ascending: false })
          .limit(1000);

        // Load smart assigned sites for "Smart Assigned" tab
        // These are sites with status "Assigned" (individually dispatched to this collector)
        // When individually dispatched, accepted_by is set immediately, so we filter by accepted_by
        // Only show sites that haven't been cost-acknowledged yet
        const smartAssignedQuery = supabase
          .from('mmp_site_entries')
          .select('*')
          .ilike('status', 'Assigned')
          .eq('accepted_by', currentUser.id) // Only sites individually assigned to this collector
          .order('created_at', { ascending: false })
          .limit(1000);

        // Load accepted sites for "My Sites" tab (all sites accepted/claimed by this collector)
        // Includes:
        // - "Assigned" sites (individually dispatched, accepted_by already set)
        // - "Dispatched" sites that this collector has accepted (accepted_by = currentUser.id)
        // - "accepted" status sites (legacy or manually accepted)
        const mySitesQuery = supabase
          .from('mmp_site_entries')
          .select('*')
          .eq('accepted_by', currentUser.id) // All sites where this collector is the accepted_by
          .order('created_at', { ascending: false })
          .limit(1000);

        // Execute all queries in parallel
        const [availableResult, smartAssignedResult, mySitesResult] = await Promise.all([
          availableSitesQuery,
          smartAssignedQuery,
          mySitesQuery
        ]);

        console.log('🔍 Query results:', {
          availableCount: availableResult.data?.length || 0,
          availableError: availableResult.error,
          smartAssignedCount: smartAssignedResult.data?.length || 0,
          smartAssignedError: smartAssignedResult.error,
          mySitesCount: mySitesResult.data?.length || 0,
          mySitesError: mySitesResult.error
        });

        if (availableResult.error) {
          console.error('❌ Available sites query error:', availableResult.error);
          throw availableResult.error;
        }
        if (smartAssignedResult.error) {
          console.error('❌ Smart assigned query error:', smartAssignedResult.error);
          throw smartAssignedResult.error;
        }
        if (mySitesResult.error) {
          console.error('❌ My sites query error:', mySitesResult.error);
          throw mySitesResult.error;
        }

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
        // Filter smart assigned to exclude cost-acknowledged sites (they move to My Sites)
        const rawSmartAssigned = formatEntries(smartAssignedResult.data || []);
        const smartAssignedEntries = rawSmartAssigned.filter(entry => {
          const additionalData = entry.additional_data || {};
          const costAcknowledged = entry.cost_acknowledged ?? additionalData.cost_acknowledged;
          return !costAcknowledged; // Only show non-acknowledged sites
        });
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
        // Use database-level filtering: only entries with status = 'accepted'
        const { data: acceptedEntries, error: allError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .ilike('status', 'accepted')
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
    <div className="space-y-6 sm:space-y-10 min-h-screen bg-slate-50 dark:bg-gray-900 py-4 sm:py-8 px-1 sm:px-4 md:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 bg-blue-600 dark:bg-blue-900 p-2 sm:p-4 md:p-7 rounded-2xl shadow-xl border border-blue-100 dark:border-blue-900">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-blue-100 dark:hover:bg-blue-900/40 flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10">
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 text-white dark:text-blue-200" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight truncate">
                {isDataCollector ? 'My Sites Management' : 'MMP Management'}
              </h1>
              <p className="text-blue-100 dark:text-blue-200/80 font-medium text-xs sm:text-sm md:text-base mt-1 leading-tight">
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
            <Button className="bg-blue-700 hover:bg-blue-800 text-white shadow-lg hover:shadow-xl transition-all duration-300 px-3 sm:px-4 md:px-6 py-2 rounded-full font-semibold text-xs sm:text-sm md:text-base flex-shrink-0 whitespace-nowrap" onClick={() => navigate('/mmp/upload')}>
              <Upload className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 mr-1 sm:mr-2" />
              <span className="hidden xs:inline">Upload MMP</span>
              <span className="xs:hidden">Upload</span>
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-2 sm:p-4 md:p-6">
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
                  <div className="mb-4">
                    <div className="text-sm font-medium text-muted-foreground mb-2">Subcategory:</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Button variant={newFomSubTab === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setNewFomSubTab('pending')} className={newFomSubTab === 'pending' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                        MMPs Pending Verification
                        <Badge variant="secondary" className="ml-2">{newFomSubcategories.pending.length}</Badge>
                      </Button>
                      <Button variant={newFomSubTab === 'verified' ? 'default' : 'outline'} size="sm" onClick={() => setNewFomSubTab('verified')} className={newFomSubTab === 'verified' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                        Verified MMPs
                        <Badge variant="secondary" className="ml-2">{newFomSubcategories.verified.length}</Badge>
                      </Button>
                    </div>
                  </div>
                )}
                <MMPList mmpFiles={isFOM ? newFomSubcategories[newFomSubTab] : categorizedMMPs.new} />
              </TabsContent>
            )}

            {!isCoordinator && (
              <TabsContent value="forwarded">
                {(isAdmin || isICT || isFOM) && (
                  <div className="mb-4">
                    <div className="text-sm font-medium text-muted-foreground mb-2">Subcategory:</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Button variant={forwardedSubTab === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setForwardedSubTab('pending')} className={forwardedSubTab === 'pending' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                        {isFOM ? 'Sites Pending Verification' : 'MMPs Pending Verification'}
                        <Badge variant="secondary" className="ml-2">{forwardedSubcategories.pending.length}</Badge>
                      </Button>
                      <Button variant={forwardedSubTab === 'verified' ? 'default' : 'outline'} size="sm" onClick={() => setForwardedSubTab('verified')} className={forwardedSubTab === 'verified' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                        {isFOM ? 'Verified Sites' : 'Verified MMPs'}
                        <Badge variant="secondary" className="ml-2">{forwardedSubcategories.verified.length}</Badge>
                      </Button>
                    </div>
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
                <div className="mb-4">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Subcategory:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
                    <Button variant={verifiedSubTab === 'newSites' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('newSites')} className={`${verifiedSubTab === 'newSites' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''} text-xs`}>
                      New Sites
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {newSitesVerifiedCount}
                      </Badge>
                    </Button>
                    <Button variant={verifiedSubTab === 'approvedCosted' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('approvedCosted')} className={`${verifiedSubTab === 'approvedCosted' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''} text-xs`}>
                      Approved & Costed
                      <Badge variant="secondary" className="ml-1 text-xs">{approvedCostedCount}</Badge>
                    </Button>
                    <Button variant={verifiedSubTab === 'dispatched' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('dispatched')} className={`${verifiedSubTab === 'dispatched' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''} text-xs`}>
                      Dispatched
                      <Badge variant="secondary" className="ml-1 text-xs">{dispatchedCount}</Badge>
                    </Button>
                    {(isAdmin || isICT || isFOM) && (
                      <>
                        <Button variant={verifiedSubTab === 'smartAssigned' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('smartAssigned')} className={`${verifiedSubTab === 'smartAssigned' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''} text-xs`}>
                          Smart Assigned
                          <Badge variant="secondary" className="ml-1 text-xs">{smartAssignedCount}</Badge>
                        </Button>
                        <Button variant={verifiedSubTab === 'accepted' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('accepted')} className={`${verifiedSubTab === 'accepted' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''} text-xs`}>
                          Accepted
                          <Badge variant="secondary" className="ml-1 text-xs">{acceptedCount}</Badge>
                        </Button>
                        <Button variant={verifiedSubTab === 'ongoing' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('ongoing')} className={`${verifiedSubTab === 'ongoing' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''} text-xs`}>
                          Ongoing
                          <Badge variant="secondary" className="ml-1 text-xs">{ongoingCount}</Badge>
                        </Button>
                      </>
                    )}
                    <Button variant={verifiedSubTab === 'completed' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('completed')} className={`${verifiedSubTab === 'completed' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''} text-xs`}>
                      Completed
                      <Badge variant="secondary" className="ml-1 text-xs">{completedCount}</Badge>
                    </Button>
                  </div>
                </div>
              )}
              {verifiedSubTab !== 'approvedCosted' && verifiedSubTab !== 'dispatched' && verifiedSubTab !== 'smartAssigned' && verifiedSubTab !== 'accepted' && verifiedSubTab !== 'ongoing' && verifiedSubTab !== 'completed' && <MMPList mmpFiles={verifiedVisibleMMPs} />}
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
                            // Filter by 'Approved and Costed' status, not 'verified'
                            const { data: approvedCostedEntries, error } = await supabase
                              .from('mmp_site_entries')
                              .select('*')
                              .or('status.ilike.Approved and Costed,status.ilike.Approved and costed')
                              .order('created_at', { ascending: false })
                              .limit(1000);

                            if (!error && approvedCostedEntries) {
                              
                              const formattedEntries = approvedCostedEntries.map(entry => {
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
              {(isAdmin || isICT || isFOM) && verifiedSubTab === 'smartAssigned' && (
                <div className="mt-6">
                  {loadingSmartAssigned ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">Loading smart assigned site entries...</div>
                      </CardContent>
                    </Card>
                  ) : smartAssignedSiteEntries.length === 0 ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">No smart assigned site entries found.</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Smart Assigned Site Entries</h3>
                        <Badge variant="secondary">{smartAssignedSiteEntries.length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable 
                        siteEntries={smartAssignedSiteEntries} 
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
                  {enumeratorSubTab === 'mySites' && (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-muted-foreground mb-2">Subcategories:</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Button 
                          variant={mySitesSubTab === 'pending' ? 'default' : 'outline'} 
                          size="sm" 
                          onClick={() => setMySitesSubTab('pending')} 
                          className={mySitesSubTab === 'pending' ? 'bg-green-100 hover:bg-green-200 text-green-800 border border-green-300' : ''}
                        >
                          Pending Visits
                          <Badge variant="secondary" className="ml-2">
                            {enumeratorMySites.filter(site => 
                              site.status?.toLowerCase() === 'accepted' || 
                              site.status?.toLowerCase() === 'assigned' ||
                              (site.accepted_by && site.status?.toLowerCase() !== 'completed')
                            ).length}
                          </Badge>
                        </Button>
                        <Button 
                          variant={mySitesSubTab === 'ongoing' ? 'default' : 'outline'} 
                          size="sm" 
                          onClick={() => setMySitesSubTab('ongoing')} 
                          className={mySitesSubTab === 'ongoing' ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300' : ''}
                        >
                          Ongoing
                          <Badge variant="secondary" className="ml-2">
                            {enumeratorMySites.filter(site => 
                              site.status?.toLowerCase() === 'in progress' || 
                              site.status?.toLowerCase() === 'in_progress'
                            ).length}
                          </Badge>
                        </Button>
                        <Button 
                          variant={mySitesSubTab === 'completed' ? 'default' : 'outline'} 
                          size="sm" 
                          onClick={() => setMySitesSubTab('completed')} 
                          className={mySitesSubTab === 'completed' ? 'bg-green-100 hover:bg-green-200 text-green-800 border border-green-300' : ''}
                        >
                          Completed
                          <Badge variant="secondary" className="ml-2">
                            {enumeratorMySites.filter(site => site.status?.toLowerCase() === 'completed').length}
                          </Badge>
                        </Button>
                      </div>
                    </div>
                  )}
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
                                onAcceptSite={handleAcceptSite}
                                onSendBackToCoordinator={handleSendBackToCoordinator}
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
                        <h3 className="text-lg font-semibold">
                          {enumeratorSubTab === 'mySites' 
                            ? (mySitesSubTab === 'pending' ? 'Pending Visits' : mySitesSubTab === 'ongoing' ? 'Ongoing Visits' : 'Completed Sites')
                            : 'Smart Assigned Sites'
                          }
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {enumeratorSubTab === 'mySites'
                            ? (mySitesSubTab === 'pending' 
                                ? 'Sites that have been accepted or smart assigned' 
                                : mySitesSubTab === 'ongoing'
                                ? 'Sites currently being visited or saved as drafts for offline access'
                                : 'Sites that have been completed with submitted reports')
                            : 'Sites assigned to your area that must be visited'
                          }
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {enumeratorSubTab === 'mySites'
                          ? (mySitesSubTab === 'pending' 
                              ? enumeratorMySites.filter(site => 
                                  site.status?.toLowerCase() === 'accepted' || 
                                  site.status?.toLowerCase() === 'assigned' ||
                                  (site.accepted_by && site.status?.toLowerCase() !== 'completed')
                                ).length
                              : mySitesSubTab === 'ongoing'
                              ? enumeratorMySites.filter(site => 
                                  site.status?.toLowerCase() === 'in progress' || 
                                  site.status?.toLowerCase() === 'in_progress'
                                ).length
                              : enumeratorMySites.filter(site => site.status?.toLowerCase() === 'completed').length)
                          : enumeratorSmartAssigned.length
                        } sites
                      </Badge>
                    </div>
                    {enumeratorSubTab === 'smartAssigned' && (
                      <div className="mb-4 p-3 sm:p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800 leading-relaxed">
                          <strong>Note:</strong> Sites under this category are mandatory to be visited. If you have any issues, please contact your immediate supervisors.
                        </p>
                      </div>
                    )}
                    {(() => {
                      const sitesToShow = enumeratorSubTab === 'mySites'
                        ? (mySitesSubTab === 'pending' 
                            ? enumeratorMySites.filter(site => 
                                site.status?.toLowerCase() === 'accepted' || 
                                site.status?.toLowerCase() === 'assigned' ||
                                (site.accepted_by && site.status?.toLowerCase() !== 'completed')
                              )
                            : mySitesSubTab === 'ongoing'
                            ? enumeratorMySites.filter(site => 
                                site.status?.toLowerCase() === 'in progress' || 
                                site.status?.toLowerCase() === 'in_progress'
                              )
                            : enumeratorMySites.filter(site => site.status?.toLowerCase() === 'completed'))
                        : enumeratorSmartAssigned;
                      
                      return sitesToShow.length === 0 ? (
                        <Card>
                          <CardContent className="py-8">
                            <div className="text-center text-muted-foreground">
                              {enumeratorSubTab === 'mySites'
                                ? (mySitesSubTab === 'pending' 
                                    ? 'No pending visits found.' 
                                    : mySitesSubTab === 'ongoing'
                                    ? 'No ongoing visits found.'
                                    : 'No completed sites found.')
                                : 'No sites assigned to you yet.'
                              }
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <MMPSiteEntriesTable 
                          siteEntries={sitesToShow} 
                          editable={true}
                          onAcceptSite={enumeratorSubTab === 'smartAssigned' ? handleAcceptSite : undefined}
                          onAcknowledgeCost={enumeratorSubTab === 'smartAssigned' ? handleCostAcknowledgment : undefined}
                          onStartVisit={enumeratorSubTab === 'mySites' && (mySitesSubTab === 'pending' || mySitesSubTab === 'ongoing') ? handleStartVisit : undefined}
                          onCompleteVisit={enumeratorSubTab === 'mySites' && (mySitesSubTab === 'pending' || mySitesSubTab === 'ongoing') ? handleCompleteVisit : undefined}
                          currentUserId={currentUser?.id}
                          showAcceptRejectForAssigned={enumeratorSubTab === 'smartAssigned'}
                          showVisitActions={enumeratorSubTab === 'mySites' && (mySitesSubTab === 'pending' || mySitesSubTab === 'ongoing')}
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
                      );
                    })()}
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
              // Filter by 'Approved and Costed' status, not 'verified'
              if (verifiedSubTab === 'approvedCosted') {
                const { data: approvedCostedEntries, error } = await supabase
                  .from('mmp_site_entries')
                  .select('*')
                  .or('status.ilike.Approved and Costed,status.ilike.Approved and costed')
                  .order('created_at', { ascending: false })
                  .limit(1000);

                if (!error && approvedCostedEntries) {
                  const formattedEntries = approvedCostedEntries.map(entry => {
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
                  setApprovedCostedCount(formattedEntries.length);
                }
              }
            }}
          />
        </>
      )}
      {/* Cost Acknowledgment Dialog for Smart Assigned Sites */}
      <Dialog open={costAcknowledgmentOpen} onOpenChange={setCostAcknowledgmentOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Cost Acknowledgment Required</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Review the complete site information and cost breakdown before acknowledging
            </p>
          </DialogHeader>
          {selectedSiteForAcknowledgment && (
            <div className="space-y-6">
              {/* Section 1: Site Details */}
              <div className="bg-gray-50 p-5 rounded-lg border space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b">
                  <div className="bg-gray-700 text-white rounded w-6 h-6 flex items-center justify-center font-semibold text-sm">
                    1
                  </div>
                  <h3 className="text-base font-semibold text-gray-900">Site Details</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">Site Code</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.siteCode || selectedSiteForAcknowledgment.site_code || '—'}</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">Site Name</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.siteName || selectedSiteForAcknowledgment.site_name || '—'}</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">Hub Office</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.hubOffice || selectedSiteForAcknowledgment.hub_office || '—'}</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">State</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.state || '—'}</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">Locality</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.locality || '—'}</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">CP Name</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.cpName || selectedSiteForAcknowledgment.cp_name || '—'}</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">Activity at Site</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.siteActivity || selectedSiteForAcknowledgment.activity_at_site || '—'}</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">Visit Date</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.visitDate || selectedSiteForAcknowledgment.visit_date || '—'}</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">Monitoring By</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.monitoringBy || selectedSiteForAcknowledgment.monitoring_by || '—'}</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">Survey Tool</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.surveyTool || selectedSiteForAcknowledgment.survey_tool || '—'}</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">Market Diversion</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.useMarketDiversion || selectedSiteForAcknowledgment.use_market_diversion ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">Warehouse Monitoring</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.useWarehouseMonitoring || selectedSiteForAcknowledgment.use_warehouse_monitoring ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="sm:col-span-2 bg-white p-3 rounded border">
                    <p className="text-xs font-medium text-gray-600 mb-1">Comments</p>
                    <p className="font-medium text-gray-900">{selectedSiteForAcknowledgment.comments || 'No comments provided'}</p>
                  </div>
                </div>
              </div>

              {/* Section 2: Site Cost Details */}
              <div className="bg-gray-50 p-5 rounded-lg border space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b">
                  <div className="bg-gray-700 text-white rounded w-6 h-6 flex items-center justify-center font-semibold text-sm">
                    2
                  </div>
                  <h3 className="text-base font-semibold text-gray-900">Site Cost Details</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-lg border">
                    <p className="text-xs font-medium text-gray-600 mb-2">Enumerator Fee</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      ${(selectedSiteForAcknowledgment.enumerator_fee || selectedSiteForAcknowledgment.enumeratorFee || 20).toLocaleString()}
                    </p>
                    {(!selectedSiteForAcknowledgment.enumerator_fee && !selectedSiteForAcknowledgment.enumeratorFee) && (
                      <p className="text-xs text-gray-500 mt-1">(Default Rate)</p>
                    )}
                    <p className="text-xs text-gray-600 mt-2">Payment for completing the site visit</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border">
                    <p className="text-xs font-medium text-gray-600 mb-2">Transport Fee</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      ${(selectedSiteForAcknowledgment.transport_fee || selectedSiteForAcknowledgment.transportFee || 10).toLocaleString()}
                    </p>
                    {(!selectedSiteForAcknowledgment.transport_fee && !selectedSiteForAcknowledgment.transportFee) && (
                      <p className="text-xs text-gray-500 mt-1">(Default Rate)</p>
                    )}
                    <p className="text-xs text-gray-600 mt-2">Transportation reimbursement</p>
                  </div>
                  <div className="bg-blue-600 p-4 rounded-lg border border-blue-700">
                    <p className="text-xs font-medium text-blue-100 mb-2">Total Cost</p>
                    <p className="text-2xl font-bold text-white">
                      ${(selectedSiteForAcknowledgment.cost || 
                        ((selectedSiteForAcknowledgment.enumerator_fee || selectedSiteForAcknowledgment.enumeratorFee || 20) + 
                         (selectedSiteForAcknowledgment.transport_fee || selectedSiteForAcknowledgment.transportFee || 10))).toLocaleString()}
                    </p>
                    <p className="text-xs text-blue-100 mt-2">Complete payment upon visit</p>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                  <p className="text-sm font-semibold text-gray-900 mb-2">Payment Information</p>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Upon successful completion of the site visit, the total cost amount will be credited to your wallet. 
                    Payment is processed automatically after you submit your visit report with photos and required documentation.
                  </p>
                </div>
              </div>

              {/* Acknowledgment Section */}
              <div className="bg-gray-50 p-4 rounded-lg border">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <Checkbox
                    id="costAcknowledgment"
                    checked={costAcknowledged}
                    onCheckedChange={(checked) => setCostAcknowledged(checked as boolean)}
                    className="mt-1 flex-shrink-0"
                  />
                  <div className="flex-1">
                    <label htmlFor="costAcknowledgment" className="text-sm font-medium cursor-pointer">
                      I acknowledge receipt of the smart assigned cost details
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      By checking this box, you confirm that you have reviewed and acknowledged the cost breakdown for this site visit.
                      The site will then be moved to your "My Sites" under "Pending Visits".
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => {
                setCostAcknowledgmentOpen(false);
                setSelectedSiteForAcknowledgment(null);
                setCostAcknowledged(false);
              }}
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                if (selectedSiteForAcknowledgment && costAcknowledged) {
                  try {
                    const acknowledgedAt = new Date().toISOString();
                    const acknowledgedBy = currentUser?.id;
                    
                    // Update the site: change status from "Assigned" to "Accepted"
                    const updateData: any = {
                      status: 'accepted', // Use lowercase to match other status values
                      updated_at: new Date().toISOString(),
                      // Set cost acknowledgment fields
                      cost_acknowledged: true,
                      cost_acknowledged_at: acknowledgedAt,
                      cost_acknowledged_by: acknowledgedBy,
                      // Set acceptance fields
                      accepted_at: acknowledgedAt,
                      accepted_by: acknowledgedBy || selectedSiteForAcknowledgment.accepted_by,
                      // Preserve existing additional_data and update with new fields
                      additional_data: {
                        ...(selectedSiteForAcknowledgment.additional_data || {}),
                        cost_acknowledged: true,
                        cost_acknowledged_at: acknowledgedAt,
                        cost_acknowledged_by: acknowledgedBy,
                        // Ensure status is updated in additional_data for backward compatibility
                        status: 'accepted',
                        // Update timestamps in additional_data
                        updated_at: new Date().toISOString(),
                        last_modified: new Date().toISOString()
                      }
                    };

                    console.log('🔄 Updating site status:', {
                      siteId: selectedSiteForAcknowledgment.id,
                      currentStatus: selectedSiteForAcknowledgment.status,
                      newStatus: 'accepted',
                      updateData
                    });

                    // First update the main fields
                    const { data: updateResult, error: updateError } = await supabase
                      .from('mmp_site_entries')
                      .update({
                        status: 'accepted',
                        cost_acknowledged: true,
                        cost_acknowledged_at: acknowledgedAt,
                        cost_acknowledged_by: acknowledgedBy,
                        accepted_at: acknowledgedAt,
                        accepted_by: acknowledgedBy || selectedSiteForAcknowledgment.accepted_by,
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', selectedSiteForAcknowledgment.id)
                      .select();
                    
                    // Then update the additional_data with the full object
                    if (!updateError) {
                      await supabase
                        .from('mmp_site_entries')
                        .update({
                          additional_data: updateData.additional_data
                        })
                        .eq('id', selectedSiteForAcknowledgment.id);
                    }

                    if (updateError) {
                      console.error('❌ Update error:', updateError);
                      throw updateError;
                    }

                    console.log('✅ Update successful:', updateResult);

                    // Reload the data to reflect changes
                    // Use a small delay to ensure database consistency
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Reload all enumerator data using the same logic as the main load function
                    if (isDataCollector && currentUser?.id) {
                      try {
                        // Convert user location IDs to names for matching
                        const collectorStateName = currentUser.stateId 
                          ? sudanStates.find(s => s.id === currentUser.stateId)?.name 
                          : undefined;
                        const collectorLocalityName = currentUser.stateId && currentUser.localityId
                          ? sudanStates.find(s => s.id === currentUser.stateId)?.localities.find(l => l.id === currentUser.localityId)?.name
                          : undefined;

                        // Load available sites (Dispatched, not accepted, matching location)
                        let availableSitesQuery = supabase
                          .from('mmp_site_entries')
                          .select('*')
                          .ilike('status', 'Dispatched')
                          .is('accepted_by', null)
                          .order('created_at', { ascending: false })
                          .limit(1000);

                        if (collectorStateName || collectorLocalityName) {
                          const conditions: string[] = [];
                          if (collectorStateName) conditions.push(`state.ilike.${collectorStateName}`);
                          if (collectorLocalityName) conditions.push(`locality.ilike.${collectorLocalityName}`);
                          if (conditions.length > 0) {
                            availableSitesQuery = availableSitesQuery.or(conditions.join(','));
                          }
                        }

                        // Load smart assigned sites (status = 'Assigned' only)
                        const smartAssignedQuery = supabase
                          .from('mmp_site_entries')
                          .select('*')
                          .ilike('status', 'Assigned')
                          .eq('accepted_by', currentUser.id)
                          .order('created_at', { ascending: false })
                          .limit(1000);

                        // Load my sites (all sites accepted by this collector)
                        const mySitesQuery = supabase
                          .from('mmp_site_entries')
                          .select('*')
                          .eq('accepted_by', currentUser.id)
                          .order('created_at', { ascending: false })
                          .limit(1000);

                        const [availableRes, smartRes, mySitesRes] = await Promise.all([
                          availableSitesQuery,
                          smartAssignedQuery,
                          mySitesQuery
                        ]);

                        console.log('🔄 Reload after acknowledgment:', {
                          availableCount: availableRes.data?.length || 0,
                          smartAssignedCount: smartRes.data?.length || 0,
                          mySitesCount: mySitesRes.data?.length || 0,
                          updateResult: updateResult?.[0]?.status
                        });

                        if (availableRes.error) console.error('Available sites reload error:', availableRes.error);
                        if (smartRes.error) console.error('Smart assigned reload error:', smartRes.error);
                        if (mySitesRes.error) console.error('My sites reload error:', mySitesRes.error);

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
                            cost_acknowledged: entry.cost_acknowledged ?? additionalData.cost_acknowledged,
                            additionalData: additionalData
                          };
                        });

                        const availableEntries = formatEntries(availableRes.data || []);
                        const rawSmartAssigned = formatEntries(smartRes.data || []);
                        // Filter smart assigned to exclude cost-acknowledged sites (they move to My Sites)
                        const smartAssignedEntries = rawSmartAssigned.filter(entry => {
                          const additionalData = entry.additional_data || {};
                          const costAcknowledged = entry.cost_acknowledged ?? additionalData.cost_acknowledged;
                          return !costAcknowledged;
                        });
                        const mySitesEntries = formatEntries(mySitesRes.data || []);

                        // Update state
                        setEnumeratorSiteEntries(availableEntries);
                        
                        // Group available sites by state and locality
                        const groupedByStateLocality = availableEntries.reduce((acc, entry) => {
                          const state = entry.state || 'Unknown State';
                          const locality = entry.locality || 'Unknown Locality';
                          const key = `${state} - ${locality}`;
                          if (!acc[key]) acc[key] = [];
                          acc[key].push(entry);
                          return acc;
                        }, {} as Record<string, any[]>);
                        setEnumeratorGroupedByStates(groupedByStateLocality);

                        setEnumeratorSmartAssigned(smartAssignedEntries);
                        
                        // Build deduplicated union for "My Sites"
                        const byId = new Map<string, any>();
                        (smartAssignedEntries || []).forEach((e: any) => {
                          if (e && e.id) byId.set(String(e.id), e);
                        });
                        (mySitesEntries || []).forEach((e: any) => {
                          if (!e) return;
                          const key = e.id ? String(e.id) : `${e.mmp_file_id || e.mmpId}-${e.site_code || e.siteCode || ''}`;
                          if (!byId.has(key)) byId.set(key, e);
                        });
                        setEnumeratorMySites(Array.from(byId.values()));

                      } catch (error) {
                        console.error('Failed to reload enumerator entries:', error);
                      }
                    }

                    setCostAcknowledgmentOpen(false);
                    setSelectedSiteForAcknowledgment(null);
                    setCostAcknowledged(false);

                    toast({
                      title: 'Cost Acknowledged',
                      description: 'The site status has been changed to "Accepted" and moved to your "My Sites" under "Pending Visits".',
                      variant: 'default'
                    });

                  } catch (error) {
                    console.error('Failed to acknowledge cost:', error);
                    toast({
                      title: 'Error',
                      description: 'Failed to acknowledge cost. Please try again.',
                      variant: 'destructive'
                    });
                  }
                }
              }}
              disabled={!costAcknowledged}
              className="bg-green-600 hover:bg-green-700 w-full sm:w-auto order-1 sm:order-2"
            >
              Acknowledge & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start Visit Dialog */}
      <StartVisitDialog
        open={startVisitDialogOpen}
        onOpenChange={setStartVisitDialogOpen}
        site={selectedSiteForVisit}
        onConfirm={handleConfirmStartVisit}
        isStarting={startingVisit}
        currentUser={currentUser}
      />

      {/* Visit Report Dialog */}
      <VisitReportDialog
        open={visitReportDialogOpen}
        onOpenChange={setVisitReportDialogOpen}
        site={selectedSiteForVisit}
        onSubmit={handleSubmitVisitReport}
        isSubmitting={submittingReport}
      />
    </div>
  );
};

export default MMP;
