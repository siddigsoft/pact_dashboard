
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { 
  Upload, ChevronLeft, ChevronRight, Trash2, Hand, FileText, ListChecks, CheckCircle, Eye, BarChart3, MapPin, AlertTriangle, Activity,
  ClipboardList, Send, ShieldCheck, LayoutDashboard, FilePlus, CheckSquare, Truck, Wand2, Handshake, PlayCircle, CheckCircle2, XCircle, Clock, UserCheck, FileCheck, Filter, X, RefreshCw, User, ArrowRight
} from 'lucide-react';
import { DataFreshnessBadge } from '@/components/realtime';
import { queryClient } from '@/lib/queryClient';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { MMPList } from '@/components/mmp/MMPList';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUserProjects } from '@/hooks/useUserProjects';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { SiteVisitRow } from '@/components/mmp/MMPCategorySitesTable';
import MMPSiteEntriesTable from '@/components/mmp/MMPSiteEntriesTable';
import { insertNotifications } from '@/services/mmpActions';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

// Using relative import fallback in case path alias resolution misses new file
import BulkClearForwardedDialog from '../components/mmp/BulkClearForwardedDialog';
import { DispatchSitesDialog } from '@/components/mmp/DispatchSitesDialog';
import { sudanStates } from '@/data/sudanStates';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { VisitReportDialog, VisitReportData } from '@/components/site-visit/VisitReportDialog';
import { StartVisitDialog } from '@/components/site-visit/StartVisitDialog';
import { useSiteClaimRealtime } from '@/hooks/use-site-claim-realtime';
import { saveGPSToRegistryFromSiteEntry } from '@/utils/sitesRegistryMatcher';
import { calculateEnumeratorFeeForUser } from '@/hooks/use-claim-fee-calculation';

import { useWallet } from '@/context/wallet/WalletContext';
import { createSiteVisitWalletTransaction } from '@/utils/wallet-transactions';
import { StatePermitUpload } from '@/components/StatePermitUpload';
import { DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOfflineSiteVisit } from '@/hooks/useOfflineSiteVisit';
import { useOffline } from '@/hooks/use-offline';
import WorkflowTrackerTab from '@/components/mmp/WorkflowTrackerTab';
import AdhocSiteVisitsTab from '@/components/mmp/AdhocSiteVisitsTab';
import { getHubAccessInfo, filterByHubAccess, shouldApplyHubFilter } from '@/utils/hubAccessControl';
import { MmpFilterBar } from '@/components/mmp/MmpFilterBar';
import { getStateName, normalizeStateId } from '@/utils/siteNormalization';
// Helper component to convert SiteVisitRow[] to site entries and display using MMPSiteEntriesTable
interface SitesDisplayTableProps {
  siteRows: SiteVisitRow[]; 
  mmpId?: string;
  editable?: boolean;
  title?: string;
}

const SitesDisplayTable = memo(function SitesDisplayTable({ siteRows, mmpId, editable = true, title }: SitesDisplayTableProps) {
  const { t } = useTranslation();
  const { mmpFiles, loading: mmpLoading, refreshMMPFiles } = useMMP();
  
  // Get site entries from MMP context
  const siteEntries = useMemo(() => {
    if (mmpLoading) return [];
    
    // Get unique mmp_ids from site rows
    const mmpIds = mmpId ? [mmpId] : [...new Set(siteRows.map(s => s.mmpId).filter(Boolean))];
    
    if (mmpIds.length === 0) return [];
    
    // Collect site entries from all relevant MMP files
    const entries: any[] = [];
    mmpFiles.forEach((mmp: any) => {
      if (mmpIds.includes(mmp.id) && Array.isArray(mmp.siteEntries)) {
        // Filter out completed sites and format for MMPSiteEntriesTable
        mmp.siteEntries
          .filter((entry: any) => entry.status?.toLowerCase() !== 'completed')
          .forEach((entry: any) => {
            entries.push({
              ...entry,
              verified_by: entry.verified_by || undefined,
              verified_at: entry.verified_at || undefined,
              verification_notes: entry.verification_notes || undefined,
              status: entry.status || 'Pending',
              mmpName: entry.mmpName || mmp.name,
              siteName: entry.site_name || entry.siteName,
              siteCode: entry.site_code || entry.siteCode,
              hubOffice: entry.hub_office || entry.hubOffice,
              cpName: entry.cp_name || entry.cpName,
              siteActivity: entry.activity_at_site || entry.siteActivity,
              monitoringBy: entry.monitoring_by || entry.monitoringBy,
              surveyTool: entry.survey_tool || entry.surveyTool,
              useMarketDiversion: entry.use_market_diversion ?? entry.useMarketDiversion,
              useWarehouseMonitoring: entry.use_warehouse_monitoring ?? entry.useWarehouseMonitoring,
              visitDate: entry.visit_date || entry.visitDate,
              comments: entry.comments,
              cost: entry.cost,
              additionalData: entry.additional_data || entry.additionalData || {}
            });
          });
      }
    });
    
    return entries;
  }, [mmpFiles, mmpLoading, siteRows, mmpId]);
  
  const loading = mmpLoading;

  if (loading) {
    return (
      <div className="mt-6">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">{t('mmpPage.loadingSites')}</div>
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
            <div className="text-center text-muted-foreground">{t('mmpPage.noSitesFound')}</div>
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
                verified_at: site.verified_at || site.verifiedAt
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
            
            // Refresh context to ensure real-time updates propagate
            await refreshMMPFiles();
            return true;
          } catch (error) {
            console.error('Failed to update sites:', error);
            return false;
          }
        }}
      />
    </div>
  );
});

// Component to display verified sites using MMPSiteEntriesTable
interface VerifiedSitesDisplayProps {
  verifiedSites: SiteVisitRow[];
  onApproveForCosting?: (site: any) => Promise<void>;
  showApproveButton?: boolean;
  onFilteredSiteIdsChange?: (filteredSiteIds: Set<string>, filteredCount: number, hasActiveFilter: boolean, filteredEntries: any[]) => void;
}

const VerifiedSitesDisplay = memo(function VerifiedSitesDisplay({ verifiedSites, onApproveForCosting, showApproveButton = false, onFilteredSiteIdsChange }: VerifiedSitesDisplayProps) {
  const { mmpFiles, loading: mmpLoading, refreshMMPFiles } = useMMP();

  // Derive site entries from context using the passed verifiedSites (already filtered by caller)
  const verifiedSiteEntries = useMemo(() => {
    if (verifiedSites.length === 0) return [];

    // Get unique mmp_ids from verified sites
    const mmpIds = [...new Set(verifiedSites.map(s => s.mmpId).filter(Boolean))];
    if (mmpIds.length === 0) return [];
    
    // Get the site IDs from the passed verifiedSites for matching
    const passedSiteIds = new Set(verifiedSites.map(s => s.id));

    // Get all site entries from context for these MMPs that match the passed sites
    const entries: any[] = [];
    mmpFiles.forEach((mmp: any) => {
      if (mmpIds.includes(mmp.id) && Array.isArray(mmp.siteEntries)) {
        mmp.siteEntries
          .filter((entry: any) => {
            // Include entries that match the passed verifiedSites IDs (already pre-filtered by caller)
            return passedSiteIds.has(entry.id);
          })
          .forEach((entry: any) => {
            entries.push({
              ...entry,
              verified_by: entry.verified_by || undefined,
              verified_at: entry.verified_at || undefined,
              verification_notes: entry.verification_notes || undefined,
              // Map to camelCase for MMPSiteEntriesTable
              siteName: entry.site_name || entry.siteName,
              siteCode: entry.site_code || entry.siteCode,
              hubOffice: entry.hub_office || entry.hubOffice,
              cpName: entry.cp_name || entry.cpName,
              siteActivity: entry.activity_at_site || entry.siteActivity,
              monitoringBy: entry.monitoring_by || entry.monitoringBy,
              surveyTool: entry.survey_tool || entry.surveyTool,
              useMarketDiversion: entry.use_market_diversion ?? entry.useMarketDiversion,
              useWarehouseMonitoring: entry.use_warehouse_monitoring ?? entry.useWarehouseMonitoring,
              visitDate: entry.visit_date || entry.visitDate,
              comments: entry.comments,
              cost: entry.cost,
              additionalData: entry.additional_data || entry.additionalData || {}
            });
          });
      }
    });

    // If no entries found from mmpFiles, use the passed verifiedSites directly (fallback)
    if (entries.length === 0 && verifiedSites.length > 0) {
      return verifiedSites.map(s => ({
        id: s.id,
        mmpId: s.mmpId,
        siteName: s.siteName,
        siteCode: s.siteCode,
        state: s.state,
        locality: s.locality,
        status: s.status,
        cost: (s as any).cost,
        verified_by: (s as any).verified_by,
        verified_at: (s as any).verified_at,
        verification_notes: (s as any).verification_notes,
        additionalData: {}
      }));
    }

    return entries;
  }, [verifiedSites, mmpFiles]);

  const loading = mmpLoading;

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
        showApproveButton={showApproveButton}
        onApproveForCosting={onApproveForCosting}
        onFilteredSiteIdsChange={onFilteredSiteIdsChange}
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
                verified_at: site.verified_at || site.verifiedAt
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
            
            // Refresh context to ensure real-time updates propagate
            await refreshMMPFiles();
            return true;
          } catch (error) {
            console.error('Failed to update verified sites:', error);
            return false;
          }
        }}
      />
    </div>
  );
});

const MMP = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { mmpFiles, loading, updateMMP, refreshMMPFiles, siteEntryCounts: contextCounts, refreshSiteEntryCounts, loadSiteEntriesForMMPs } = useMMP();
  const { checkPermission, hasAnyRole, currentUser } = useAuthorization();
  const { toast } = useToast();
  const { reconcileSiteVisitFee } = useWallet();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const { startSiteVisit: startSiteVisitOffline, completeSiteVisit: completeSiteVisitOffline } = useOfflineSiteVisit();
  const { queuePhotoUpload } = useOffline();
  const initialTab = new URLSearchParams(location.search).get('tab') || 'new';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get('tab');
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  // Subcategory state for Forwarded MMPs (Admin/ICT only)
  const [forwardedSubTab, setForwardedSubTab] = useState<'pending' | 'verified'>('pending');
  // Subcategory state for Verified Sites (Admin/ICT only)
  const [verifiedSubTab, setVerifiedSubTab] = useState<'all' | 'newSites' | 'approvedCosted' | 'dispatched' | 'smartAssigned' | 'accepted' | 'ongoing' | 'completed' | 'submitted' | 'wfpConfirmed' | 'notCovered' | 'rejected'>('all');
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [pendingBulkApproveCount, setPendingBulkApproveCount] = useState(0);
  const [tableFilteredSiteIds, setTableFilteredSiteIds] = useState<Set<string>>(new Set());
  const [tableFilteredCount, setTableFilteredCount] = useState<number>(0);
  const [tableFilteredEntries, setTableFilteredEntries] = useState<any[]>([]);
  // Subcategory state for Enumerator dashboard
  const [enumeratorSubTab, setEnumeratorSubTab] = useState<'availableSites' | 'smartAssigned' | 'mySites'>('availableSites');
  // Sub-subcategory state for My Sites (Data Collector)
  const [mySitesSubTab, setMySitesSubTab] = useState<'pending' | 'ongoing' | 'completed' | 'all'>('pending');

  const normalizeStatus = (raw: string | null | undefined): string =>
    (raw || '').trim().toLowerCase().replace(/[-_\s\u00a0]+/g, '');

  const isDraftStatus = (raw: string | null | undefined): boolean => {
    const s = normalizeStatus(raw);
    return s === 'inprogress' || s === 'ongoing';
  };

  const isCompletedStatus = (raw: string | null | undefined): boolean => {
    const s = normalizeStatus(raw);
    return s.includes('completed') || s.includes('finished') || s.includes('done') || s === 'submitted' || s === 'wfp_confirmed' || s === 'not_covered';
  };

  // Subcategory state for New MMPs (FOM only)
  const [newFomSubTab, setNewFomSubTab] = useState<'pending' | 'verified' | 'returned'>('pending');
  // Expanded states for returned sites view
  const [expandedReturnedStates, setExpandedReturnedStates] = useState<Set<string>>(new Set());
  const [expandedReturnedLocalities, setExpandedReturnedLocalities] = useState<Set<string>>(new Set());
  const [returnedGroupBy, setReturnedGroupBy] = useState<'state' | 'mmp'>('state');
  const [expandedReturnedMmps, setExpandedReturnedMmps] = useState<Set<string>>(new Set());
  // State permit upload dialog for returned sites
  const [returnedStatePermitDialogOpen, setReturnedStatePermitDialogOpen] = useState(false);
  const [selectedReturnedState, setSelectedReturnedState] = useState<{ state: string; sites: any[]; mmpFileId?: string; stateId?: string } | null>(null);
  const [selectedCoordinatorForReturned, setSelectedCoordinatorForReturned] = useState<string>('');
  const [selectedSupervisorForReturned, setSelectedSupervisorForReturned] = useState<string>('');
  // Returned sites action dialogs
  const [returnedSiteActionDialog, setReturnedSiteActionDialog] = useState<{ open: boolean; site: any; action: 'sendback' | 'report' | 'redispatch' }>({ open: false, site: null, action: 'sendback' });
  const [returnedSiteActionBatchSites, setReturnedSiteActionBatchSites] = useState<any[]>([]);
  const [showReturnedBatchSiteList, setShowReturnedBatchSiteList] = useState(false);
  const [returnedActionNotes, setReturnedActionNotes] = useState('');
  const [selectedCoordinatorForSendBack, setSelectedCoordinatorForSendBack] = useState<string>('');
  const [selectedReturnedActionType, setSelectedReturnedActionType] = useState<'sendback' | 'allow_without_state_permit' | 'upload_state_permit'>('sendback');
  const [coordinatorsList, setCoordinatorsList] = useState<any[]>([]);
  const [supervisorsList, setSupervisorsList] = useState<any[]>([]);
  const [hubStatesList, setHubStatesList] = useState<any[]>([]);
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
  const [adminRefreshTrigger, setAdminRefreshTrigger] = useState(0);
  // Loaded keys: set only after a successful DB fetch completes.
  // Prevents re-fetching the same data every time the user switches tabs and comes back.
  const dispatchedLoadedKeyRef = useRef<string>('');
  const acceptedLoadedKeyRef = useRef<string>('');
  const approvedCostedLoadedKeyRef = useRef<string>('');
  const [dispatchedStateFilter, setDispatchedStateFilter] = useState<string>('all');
  const [dispatchedLocalityFilter, setDispatchedLocalityFilter] = useState<string>('all');
  const [acceptedSiteEntries, setAcceptedSiteEntries] = useState<any[]>([]);
  const [loadingAccepted, setLoadingAccepted] = useState(false);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [ongoingSiteEntries, setOngoingSiteEntries] = useState<any[]>([]);
  const [loadingOngoing, setLoadingOngoing] = useState(false);
  const [ongoingCount, setOngoingCount] = useState(0);
  const [completedSiteEntries, setCompletedSiteEntries] = useState<any[]>([]);
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [rejectedSiteEntries, setRejectedSiteEntries] = useState<any[]>([]);
  const [loadingRejected, setLoadingRejected] = useState(false);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [smartAssignedSiteEntries, setSmartAssignedSiteEntries] = useState<any[]>([]);
  const [loadingSmartAssigned, setLoadingSmartAssigned] = useState(false);
  const [smartAssignedCount, setSmartAssignedCount] = useState(0);
  const [dpLinkedSiteNames, setDpLinkedSiteNames] = useState<Set<string>>(new Set());
  const [dpLinkedEntryIds, setDpLinkedEntryIds] = useState<Set<string>>(new Set());
  
  // Global site entry filters (applies to all tabs)
  const [siteStatusFilter, setSiteStatusFilter] = useState<string>('all');
  const [siteHubFilter, setSiteHubFilter] = useState<string>('all');
  const [siteStateFilter, setSiteStateFilter] = useState<string>('all');
  const [siteLocalityFilter, setSiteLocalityFilter] = useState<string>('all');
  const [siteMmpFilter, setSiteMmpFilter] = useState<string>('all');
  
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [dispatchType, setDispatchType] = useState<'state' | 'locality' | 'individual' | 'open'>('open');

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

  // Handle accepting/claiming a site (works for both Smart Assigned and Available Sites)
  const handleAcceptSite = useCallback(async (site: any) => {
    try {
      const isDispatchedSite = site.status?.toLowerCase() === 'dispatched';
      
      if (isDispatchedSite && currentUser?.id) {
        // Use atomic claim RPC for dispatched sites (first-claim system)
        const { data: result, error: rpcError } = await supabase.rpc('claim_site_visit', {
          p_site_id: site.id,
          p_user_id: currentUser.id
        });
        
        if (rpcError) {
          toast({
            title: 'Claim Failed',
            description: rpcError.message || 'Could not claim this site. It may have been claimed by another enumerator.',
            variant: 'destructive'
          });
          return;
        }
        
        const claimResult = result as { success: boolean; error?: string; message: string };
        
        if (!claimResult.success) {
          let description = claimResult.message;
          
          if (claimResult.error === 'ALREADY_CLAIMED') {
            description = 'Another enumerator claimed this site first. Try a different site.';
          } else if (claimResult.error === 'CLAIM_IN_PROGRESS') {
            description = 'Someone else is claiming this site right now. Try again in a moment.';
          }
          
          toast({
            title: 'Could Not Claim Site',
            description,
            variant: 'destructive'
          });
          return;
        }
      } else {
        // Standard accept for Smart Assigned sites
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
          throw error;
        }
      }

      toast({
        title: 'Site Accepted',
        description: 'The site has been successfully accepted and moved to "My Sites".',
        variant: 'default'
      });

      // Refresh context to ensure real-time updates propagate
      await refreshMMPFiles();
    } catch (error: any) {
      console.error('Failed to accept site:', error);
      toast({
        title: 'Acceptance Failed',
        description: error.message || 'Failed to accept the site. Please try again.',
        variant: 'destructive'
      });
    }
  }, [currentUser?.id, toast, refreshMMPFiles]);

  // Handle sending back available site to coordinator
  const handleSendBackToCoordinator = useCallback(async (site: any, comments: string, selectedCoordinatorId?: string, options?: { suppressToast?: boolean; skipRefresh?: boolean }) => {
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
      const coordinatorId = selectedCoordinatorId ||
               site.forwarded_to_user_id || 
                           existingAdditionalData.assigned_to || 
                           existingAdditionalData.dispatched_by_user_id ||
                           existingAdditionalData.forwarded_to_user_id;
      
      // Update site entry - use dedicated rejection columns (new schema)
      const { error: updateError } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'Pending',
          forwarded_to_user_id: coordinatorId || null,
          forwarded_at: now,
          forwarded_by_user_id: currentUser?.id,
          rejection_comments: comments.trim(),
          rejected_by: null,
          rejected_at: null,
          updated_at: now,
          // Also store in additional_data for backward compatibility and audit trail
          additional_data: {
            ...existingAdditionalData,
            rejection_comments: comments.trim(),
            rejected_by: undefined,
            rejected_at: undefined,
            rejection_reason: comments.trim(), // Alternative key for compatibility
            sent_back_by: currentUser?.id,
            sent_back_at: now,
            sent_back_to_coordinator_id: coordinatorId || null
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
          
          await insertNotifications([{
            recipient_id: coordinatorId,
            title_en: 'Site Sent Back for Editing',
            title_ar: 'تم إرجاع الموقع للتحرير',
            message_en: `Site "${siteName}" from ${mmpName} has been sent back with comments: ${comments.trim().substring(0, 100)}${comments.length > 100 ? '...' : ''}`,
            message_ar: `تم إرجاع الموقع "${siteName}" من ${mmpName} مع تعليقات: ${comments.trim().substring(0, 100)}${comments.length > 100 ? '...' : ''}`,
            event_type: 'approvals',
            entity_id: site.id,
            entity_type: 'mmpFile',
            action_url: `/coordinator/sites`,
            priority: 'high',
            status: 'pending'
          }]);
        } catch (notifError) {
          // Log but don't fail the operation if notification fails
          console.warn('Failed to create notification for coordinator:', notifError);
        }
      }

      if (!options?.suppressToast) {
        toast({
          title: 'Site Sent Back',
          description: 'The site has been sent back to the coordinator for editing.',
          variant: 'default'
        });
      }

      // Refresh context to ensure real-time updates propagate
      if (!options?.skipRefresh) {
        await refreshMMPFiles();
      }
    } catch (error: any) {
      console.error('Failed to send back site:', error);
      if (!options?.suppressToast) {
        toast({
          title: 'Send Back Failed',
          description: error.message || 'Failed to send the site back. Please try again.',
          variant: 'destructive'
        });
      }
    }
  }, [currentUser?.id, toast, refreshMMPFiles]);

  const handleAllowCoordinatorWithoutStatePermit = useCallback(async (site: any, coordinatorId: string, comments?: string, options?: { suppressToast?: boolean; skipRefresh?: boolean }) => {
    if (!coordinatorId) {
      toast({
        title: 'Coordinator Required',
        description: 'Please select a coordinator.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const now = new Date().toISOString();
      const existingAdditionalData = site.additional_data || site.additionalData || {};

      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'Pending',
          forwarded_to_user_id: coordinatorId,
          forwarded_at: now,
          forwarded_by_user_id: currentUser?.id,
          updated_at: now,
          additional_data: {
            ...existingAdditionalData,
            state_permit_not_required: true,
            state_permit_attached: false,
            state_permit_waived: true,
            state_permit_waived_by: currentUser?.id,
            state_permit_waived_at: now,
            state_permit_waived_notes: comments?.trim() || undefined,
            sent_back_to_coordinator_id: coordinatorId,
          }
        })
        .eq('id', site.id);

      if (error) throw error;

      const siteName = site.site_name || site.siteName || site.site_code || 'Site';
      await insertNotifications([{
        recipient_id: coordinatorId,
        title_en: 'Site returned without state permit',
        title_ar: 'تم إرجاع الموقع بدون تصريح الولاية',
        message_en: `${siteName} was returned to you and can continue without state permit.${comments?.trim() ? ` Note: ${comments.trim().substring(0, 120)}${comments.trim().length > 120 ? '...' : ''}` : ''}`,
        message_ar: `تم إرجاع ${siteName} إليك ويمكن المتابعة بدون تصريح الولاية.${comments?.trim() ? ` ملاحظة: ${comments.trim().substring(0, 120)}${comments.trim().length > 120 ? '...' : ''}` : ''}`,
        event_type: 'approvals',
        entity_id: site.id,
        entity_type: 'mmpFile',
        action_url: '/coordinator/sites',
        priority: 'high',
        status: 'pending'
      }]);

      if (!options?.suppressToast) {
        toast({
          title: 'Coordinator Allowed to Continue',
          description: 'Site was sent back and coordinator can continue without state permit.',
        });
      }

      if (!options?.skipRefresh) {
        await refreshMMPFiles();
      }
    } catch (err: any) {
      console.error('Failed to allow coordinator without state permit:', err);
      if (!options?.suppressToast) {
        toast({
          title: 'Action Failed',
          description: err.message || 'Failed to update site. Please try again.',
          variant: 'destructive'
        });
      }
    }
  }, [currentUser?.id, refreshMMPFiles, toast]);

  // Handle re-dispatching a returned site (reset to approved and costed status)
  const handleRedispatchReturnedSite = useCallback(async (site: any, notes: string) => {
    try {
      const now = new Date().toISOString();
      const existingAdditionalData = site.additional_data || {};
      
      const { error: updateError } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'approved and costed',
          verification_notes: notes.trim() || null,
          updated_at: now,
          additional_data: {
            ...existingAdditionalData,
            redispatched_by: currentUser?.id,
            redispatched_at: now,
            redispatch_notes: notes.trim() || undefined,
            previous_return_reason: site.verification_notes || existingAdditionalData.return_reason || undefined
          }
        })
        .eq('id', site.id);

      if (updateError) throw updateError;

      toast({
        title: 'Site Ready for Re-dispatch',
        description: `The site "${site.site_name || site.siteName || 'Site'}" has been moved back to Approved & Costed for re-dispatching.`,
      });

      await refreshMMPFiles();
    } catch (error: any) {
      console.error('Failed to re-dispatch site:', error);
      toast({
        title: 'Re-dispatch Failed',
        description: error.message || 'Failed to re-dispatch the site. Please try again.',
        variant: 'destructive'
      });
    }
  }, [currentUser?.id, toast, refreshMMPFiles]);

  // Handle reporting issue with returned site
  const handleReportReturnedSite = useCallback(async (site: any, reportNotes: string) => {
    if (!reportNotes.trim()) {
      toast({
        title: 'Report Notes Required',
        description: 'Please provide details about the issue you are reporting.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const now = new Date().toISOString();
      const existingAdditionalData = site.additional_data || {};
      const reports = existingAdditionalData.fom_reports || [];
      reports.push({
        reported_by: currentUser?.id,
        reported_by_name: currentUser?.name || currentUser?.fullName || currentUser?.username,
        reported_at: now,
        notes: reportNotes.trim()
      });

      const { error: updateError } = await supabase
        .from('mmp_site_entries')
        .update({
          updated_at: now,
          additional_data: {
            ...existingAdditionalData,
            fom_reports: reports,
            last_reported_at: now,
            last_reported_by: currentUser?.id
          }
        })
        .eq('id', site.id);

      if (updateError) throw updateError;

      // Notify admins about the report
      try {
        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['admin', 'Admin', 'ict', 'ICT', 'countryDirector', 'CountryDirector'])
          .eq('status', 'approved');

        if (admins && admins.length > 0) {
          const siteName = site.site_name || site.siteName || 'Site';
          await insertNotifications(admins.map(admin => ({
            recipient_id: admin.id,
            title_en: 'Returned Site Issue Reported',
            title_ar: 'تم الإبلاغ عن مشكلة في الموقع المرتجع',
            message_en: `FOM reported an issue with returned site "${siteName}" in ${site.state || 'Unknown'}: ${reportNotes.trim().substring(0, 100)}${reportNotes.length > 100 ? '...' : ''}`,
            message_ar: `أبلغ مدير العمليات الميدانية عن مشكلة في الموقع المرتجع "${siteName}" في ${site.state || 'غير معروف'}: ${reportNotes.trim().substring(0, 100)}${reportNotes.length > 100 ? '...' : ''}`,
            event_type: 'approvals',
            entity_id: site.id,
            entity_type: 'mmpFile',
            priority: 'high',
            status: 'pending'
          })));
        }
      } catch (notifErr) {
        console.warn('Failed to notify admins about returned site report:', notifErr);
      }

      toast({
        title: 'Report Submitted',
        description: 'Your report about this returned site has been submitted to administrators.',
      });

      await refreshMMPFiles();
    } catch (error: any) {
      console.error('Failed to report returned site:', error);
      toast({
        title: 'Report Failed',
        description: error.message || 'Failed to submit the report. Please try again.',
        variant: 'destructive'
      });
    }
  }, [currentUser?.id, toast, refreshMMPFiles]);

  // Handle cost acknowledgment for Smart Assigned sites
  // Calculate enumerator fee based on user's classification when opening dialog
  const handleCostAcknowledgment = useCallback(async (site: any) => {
    // Calculate enumerator fee for this user if not already set
    let siteWithFees = { ...site };
    
    if (!site.enumerator_fee && currentUser?.id) {
      try {
        const feeResult = await calculateEnumeratorFeeForUser(currentUser.id);
        siteWithFees.enumerator_fee = feeResult.fee;
        
        // Calculate total cost
        const transportFee = Number(site.transport_fee) || 0;
        siteWithFees.cost = feeResult.fee + transportFee;
        
        console.log('[CostAcknowledgment] Calculated fees for user:', {
          enumeratorFee: feeResult.fee,
          transportFee,
          totalCost: siteWithFees.cost,
          classificationLevel: feeResult.classificationLevel
        });
      } catch (error) {
        console.error('[CostAcknowledgment] Failed to calculate enumerator fee:', error);
      }
    }
    
    setSelectedSiteForAcknowledgment(siteWithFees);
    setCostAcknowledgmentOpen(true);
  }, [currentUser?.id]);

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
      const siteStatus = site.status?.toLowerCase();
      const isOnline = navigator.onLine;

      // Get current location if available
      let location: { lat: number; lng: number; accuracy?: number } | undefined;
      try {
        if (navigator.geolocation) {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0
            });
          });
          location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
        }
      } catch (locationError) {
        console.warn('[StartVisit] Could not get location:', locationError);
        // Continue without location - it's optional
      }

      // If offline, use offline hook to save the visit start
      if (!isOnline) {
        console.log('[StartVisit] Offline mode - saving visit start locally');
        
        const result = await startSiteVisitOffline(
          {
            siteEntryId: site.id,
            siteName: site.siteName || site.site_name || 'Unknown',
            siteCode: site.siteCode || site.site_code || site.id,
            state: site.state || '',
            locality: site.locality || '',
          },
          {
            siteEntryId: site.id,
            userId: currentUser?.id || '',
            location: location ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy } : undefined
          }
        );

        if (result.success) {
          console.log('[StartVisit] Visit start saved offline, will sync when online');
          
          toast({
            title: 'Visit Started (Offline)',
            description: 'Visit has been started and will be synced when you are back online.',
            variant: 'default'
          });

          // Close start dialog and open visit report dialog
          setStartVisitDialogOpen(false);
          setVisitReportDialogOpen(true);
          setStartingVisit(false);
          return;
        } else {
          throw new Error(result.error || 'Failed to save visit start offline');
        }
      }

      // Online mode - proceed with database update
      // Build update object - using direct columns for visit tracking
      const updateData: any = {
        status: 'In Progress',
        updated_at: now,
        visit_started_at: now,
        visit_started_by: currentUser?.id
      };

      // Add location to additional_data if available
      if (location) {
        updateData.additional_data = {
          ...(site.additional_data || site.additionalData || {}),
          start_location: location
        };
      }

      // If site was 'assigned' (not yet accepted), also set acceptance fields AND ensure fees are set
      if (siteStatus === 'assigned' && !site.accepted_by) {
        updateData.accepted_by = currentUser?.id;
        updateData.accepted_at = now;
        console.log('[StartVisit] Site was assigned - auto-accepting before starting');
        
        // Fetch fresh site data from database to get the latest fee values
        if (currentUser?.id) {
          try {
            const { data: freshSiteData } = await supabase
              .from('mmp_site_entries')
              .select('transport_fee, enumerator_fee, cost')
              .eq('id', site.id)
              .single();
            
            // Get fee values from database (with fallback to site object, then default to 0)
            let dbEnumeratorFee = Number(freshSiteData?.enumerator_fee) || 0;
            const dbTransportFee = Number(freshSiteData?.transport_fee) || Number(site.transport_fee) || Number(site.transportFee) || 0;
            let dbCost = Number(freshSiteData?.cost) || 0;
            
            console.log('[StartVisit] Current fees from database:', {
              dbEnumeratorFee,
              dbTransportFee,
              dbCost,
              siteId: site.id
            });
            
            // If enumerator_fee is missing, calculate it based on user classification
            if (dbEnumeratorFee === 0) {
              console.log('[StartVisit] Enumerator fee missing - calculating based on user classification...');
              const feeResult = await calculateEnumeratorFeeForUser(currentUser.id);
              dbEnumeratorFee = feeResult.fee;
              
              console.log('[StartVisit] Calculated enumerator fee:', {
                fee: dbEnumeratorFee,
                classificationLevel: feeResult.classificationLevel,
                source: feeResult.source
              });
            }
            
            // Always recalculate and set cost to ensure it's correct (enumerator_fee + transport_fee)
            const calculatedCost = dbEnumeratorFee + dbTransportFee;
            
            // Only update if we have valid fees or if cost was missing/incorrect
            if (dbEnumeratorFee > 0 || dbCost !== calculatedCost) {
              updateData.enumerator_fee = dbEnumeratorFee;
              updateData.transport_fee = dbTransportFee;
              updateData.cost = calculatedCost;
              
              console.log('[StartVisit] Fee values set for auto-accept:', {
                enumeratorFee: dbEnumeratorFee,
                transportFee: dbTransportFee,
                totalCost: calculatedCost
              });
            } else {
              console.log('[StartVisit] Existing fees are valid, no changes needed');
            }
          } catch (feeError) {
            console.error('[StartVisit] Failed to process fees for auto-accept:', feeError);
            // Continue without fees - the wallet payment will show a warning
          }
        }
      }

      // Update site status to 'In Progress' and save visit start information
      const { error } = await supabase
        .from('mmp_site_entries')
        .update(updateData)
        .eq('id', site.id);

      if (error) {
        throw error;
      }

      console.log('[StartVisit] Visit started successfully for site:', site.id);

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
      
      // If online and error occurred, try offline fallback
      if (navigator.onLine && error) {
        console.log('[StartVisit] Online update failed, attempting offline save...');
        try {
          const site = selectedSiteForVisit;
          const location: { lat: number; lng: number; accuracy?: number } | undefined = undefined;
          
          const result = await startSiteVisitOffline(
            {
              siteEntryId: site.id,
              siteName: site.siteName || site.site_name || 'Unknown',
              siteCode: site.siteCode || site.site_code || site.id,
              state: site.state || '',
              locality: site.locality || '',
            },
            {
              siteEntryId: site.id,
              userId: currentUser?.id || '',
              location
            }
          );

          if (result.success) {
            toast({
              title: 'Visit Started (Saved Offline)',
              description: 'Visit has been started and will be synced when connection is restored.',
              variant: 'default'
            });
            setStartVisitDialogOpen(false);
            setVisitReportDialogOpen(true);
            setStartingVisit(false);
            return;
          }
        } catch (offlineError) {
          console.error('[StartVisit] Offline fallback also failed:', offlineError);
        }
      }
      
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
    // Open the report dialog immediately so the user isn't waiting on network/GPS
    setSelectedSiteForVisit(site);
    setVisitReportDialogOpen(true);

    try {
      const isOnline = navigator.onLine;
      
      // Get final location
      let location: { lat: number; lng: number; accuracy?: number } | undefined;
      try {
        const currentLocation = await getCurrentLocation();
        location = {
          lat: currentLocation.latitude,
          lng: currentLocation.longitude,
          accuracy: 10 // Default accuracy value
        };
      } catch (locationError) {
        console.warn('[CompleteVisit] Could not get location:', locationError);
        // Continue without location - it's optional
      }

      const now = new Date().toISOString();

      // Stop location tracking
      stopLocationTracking(site.id);

      // If offline, use offline hook to save completion
      if (!isOnline) {
        console.log('[CompleteVisit] Offline mode - saving visit completion locally');
        
        const result = await completeSiteVisitOffline({
          siteEntryId: site.id,
          userId: currentUser?.id || '',
          location: location ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy } : undefined,
          notes: undefined, // Notes will be added in the report
          photos: [] // Photos will be added in the report
        });

        if (result.success) {
          console.log('[CompleteVisit] Visit completion saved offline, will sync when online');
          
          toast({
            title: 'Visit Completed (Offline)',
            description: 'Visit has been completed and will be synced when you are back online.',
            variant: 'default'
          });

          // Set the site for visit report and open dialog
          setSelectedSiteForVisit(site);
          setVisitReportDialogOpen(true);
          return;
        } else {
          throw new Error(result.error || 'Failed to save visit completion offline');
        }
      }

      // Online mode - proceed with database update
      // Update site with visit completion time, actual visit date, and final location (but don't change status yet)
      await supabase
        .from('mmp_site_entries')
        .update({
          updated_at: now,
          visit_date: now,
          visit_completed_at: now,
          visit_completed_by: currentUser?.id,
          additional_data: {
            ...(site.additional_data || {}),
            final_location: location
          }
        })
        .eq('id', site.id);

      // Save final location to site_locations table
      if (location) {
        await supabase
          .from('site_locations')
          .insert({
            site_id: site.id,
            user_id: currentUser?.id || null,
            latitude: location.lat,
            longitude: location.lng,
            accuracy: location.accuracy || 10,
            notes: 'Visit end location',
            recorded_at: now
          });
      }

      // Process wallet payment for the user who completed the site entry
      // Using centralized wallet transaction function (single point of truth)
      try {
        const result = await createSiteVisitWalletTransaction({
          siteVisitId: site.id,
          description: `Site visit completed: ${site.site_name || site.siteName || 'Site'}`,
          showNotifications: true,
          toast: toast,
        });

        if (result.success) {
          console.log(`✅ Wallet transaction created successfully: ${result.message}`);
        } else {
          console.warn(`⚠️ Wallet transaction creation failed: ${result.message}`);
          // Don't fail the entire operation if wallet payment fails
          toast({
            title: 'Payment Warning',
            description: result.message || 'Site visit completed but wallet payment failed. Please contact support.',
            variant: 'destructive',
          });
        }
      } catch (walletErr: any) {
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
      
      // If online and error occurred, try offline fallback
      if (navigator.onLine && error) {
        console.log('[CompleteVisit] Online update failed, attempting offline save...');
        try {
          const site = selectedSiteForVisit;
          const location: { lat: number; lng: number; accuracy?: number } | undefined = undefined;
          
          const result = await completeSiteVisitOffline({
            siteEntryId: site.id,
            userId: currentUser?.id || '',
            location,
            notes: undefined,
            photos: []
          });

          if (result.success) {
            toast({
              title: 'Visit Completed (Saved Offline)',
              description: 'Visit has been completed and will be synced when connection is restored.',
              variant: 'default'
            });
            setSelectedSiteForVisit(site);
            setVisitReportDialogOpen(true);
            return;
          }
        } catch (offlineError) {
          console.error('[CompleteVisit] Offline fallback also failed:', offlineError);
        }
      }
      
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
      const isOnline = navigator.onLine;

      // Upload photos to Supabase storage (or queue for offline)
      console.log('📸 Processing photos...');
      const photoUrls: string[] = [];
      
      if (isOnline) {
        // Online: Upload photos immediately
        for (const photo of reportData.photos) {
          const fileName = `visit-photos/${site.id}/${Date.now()}-${photo.name}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('site-visit-photos')
            .upload(fileName, photo);

          if (uploadError) {
            console.error('❌ Error uploading photo:', uploadError);
            // If upload fails, queue it for offline sync
            try {
              const reader = new FileReader();
              reader.onloadend = async () => {
                const base64Data = reader.result as string;
                await queuePhotoUpload(site.id, base64Data, photo.name);
              };
              reader.readAsDataURL(photo);
            } catch (queueError) {
              console.error('Failed to queue photo for offline upload:', queueError);
            }
            continue;
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
      } else {
        // Offline: Queue all photos for upload
        console.log('📸 Offline mode - queuing photos for upload...');
        for (const photo of reportData.photos) {
          try {
            const reader = new FileReader();
            await new Promise<void>((resolve, reject) => {
              reader.onloadend = async () => {
                try {
                  const base64Data = reader.result as string;
                  await queuePhotoUpload(site.id, base64Data, photo.name);
                  resolve();
                } catch (error) {
                  reject(error);
                }
              };
              reader.onerror = reject;
              reader.readAsDataURL(photo);
            });
          } catch (queueError) {
            console.error('Failed to queue photo for offline upload:', queueError);
          }
        }
        console.log(`✅ ${reportData.photos.length} photos queued for offline upload`);
      }

      // Prepare coordinates in the format expected by the database (JSONB with latitude and longitude)
      const coordinatesJsonb = reportData.coordinates ? {
        latitude: reportData.coordinates.latitude,
        longitude: reportData.coordinates.longitude,
        accuracy: reportData.coordinates.accuracy
      } : {};

      // Prepare GPS coordinates for Sites Registry (used in both online and offline flows)
      const siteEntryId = site.id || site.siteId || site.entry_id;
      const gpsCoordinates = siteEntryId && reportData.coordinates && reportData.coordinates.latitude && reportData.coordinates.longitude
        ? {
            latitude: reportData.coordinates.latitude,
            longitude: reportData.coordinates.longitude,
            accuracy: reportData.coordinates.accuracy,
          }
        : undefined;

      let report: any = null;

      if (isOnline) {
        // Online: Save report to database immediately
        console.log('💾 Saving visit report to database...');
        const { data: savedReport, error: reportError } = await supabase
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
        report = savedReport;
        console.log('✅ Report saved with ID:', report.id);

        // Link photos to site visit via report_photos table
        if (photoUrls.length > 0) {
          console.log('📎 Linking photos to report...');
          // Match mobile column names: report_id, photo_url, storage_path, is_synced
          const reportPhotos = photoUrls.map((photoUrl) => ({
            report_id: report.id,
            photo_url: photoUrl,
            storage_path: photoUrl,
            is_synced: true,
          }));

          const { error: photosError } = await supabase
            .from('report_photos')
            .insert(reportPhotos);
          if (photosError) {
            console.error('❌ Error linking photos:', photosError);
            // Don't throw - report is already created, just log the error
          } else {
            console.log('✅ Photos linked to report:', photoUrls.length);
          }
        }
        // Generate PDF report
        console.log('📄 Generating PDF report...');
        await generateVisitReportPDF(site, reportData, report, photoUrls);
      } else {
        // Offline: Queue report submission and save completed visit to offline DB
        console.log('💾 Offline mode - queuing report submission...');
        const { addPendingSync, saveSiteVisitOffline, getOfflineSiteVisit, updateSiteVisitOffline } = await import('@/lib/offline-db');
        
        // Prepare GPS coordinates for registry save during sync (if available)
        const gpsForRegistry = gpsCoordinates ? {
          latitude: gpsCoordinates.latitude,
          longitude: gpsCoordinates.longitude,
          accuracy: gpsCoordinates.accuracy,
          userId: currentUser?.id || 'system',
          sourceType: 'site_visit' as const,
          overwriteExisting: false
        } : undefined;
        
        // Queue sync action - include GPS coordinates for registry save during sync
        await addPendingSync({
          type: 'site_visit_complete',
          payload: {
            siteEntryId: site.id,
            userId: currentUser?.id || null,
            completedAt: now,
            location: reportData.coordinates ? {
              lat: reportData.coordinates.latitude,
              lng: reportData.coordinates.longitude,
              accuracy: reportData.coordinates.accuracy
            } : undefined,
            notes: reportData.notes || 'No additional notes provided',
            photos: [], // Photos are queued separately
            visitReport: {
              activities: reportData.activities,
              durationMinutes: reportData.visitDuration,
              coordinates: coordinatesJsonb,
              submittedAt: now
            },
            // Include GPS coordinates for Sites Registry save during sync
            gpsForRegistry
          }
        });

        // Save/update offline site visit as completed but not synced
        const existingOfflineVisit = await getOfflineSiteVisit(site.id);
        if (existingOfflineVisit) {
          await updateSiteVisitOffline(existingOfflineVisit.id, {
            status: 'completed',
            completedAt: now,
            notes: reportData.notes || 'No additional notes provided',
            synced: false // Mark as unsynced so it appears in Outbox
          });
        } else {
          // Create new offline visit record for completed visit
          const visitId = await saveSiteVisitOffline({
            siteEntryId: site.id,
            siteName: site.siteName || site.site_name || 'Unknown',
            siteCode: site.siteCode || site.site_code || site.id,
            state: site.state || '',
            locality: site.locality || '',
            status: 'completed',
            startedAt: site.visit_started_at || now,
            completedAt: now,
            endLocation: reportData.coordinates ? {
              lat: reportData.coordinates.latitude,
              lng: reportData.coordinates.longitude,
              accuracy: reportData.coordinates.accuracy
            } : undefined,
            notes: reportData.notes || 'No additional notes provided'
          });
          // Ensure it's marked as unsynced (saveSiteVisitOffline sets synced: false by default)
        }
        
        console.log('✅ Report queued for offline submission and saved to offline DB');
      }

      // Save GPS coordinates to Sites Registry (if coordinates were captured and site has valid ID)
      // IMPORTANT: Only attempt GPS save when online. When offline, GPS data is included in sync payload
      if (siteEntryId && gpsCoordinates) {
        if (isOnline) {
          // Online: Save GPS immediately
          console.log('📍 Saving GPS to Sites Registry for site entry:', siteEntryId);
          try {
            const gpsResult = await saveGPSToRegistryFromSiteEntry(
              siteEntryId,
              gpsCoordinates,
              {
                userId: currentUser?.id || 'system',
                sourceType: 'site_visit',
                overwriteExisting: false, // Don't overwrite if GPS already exists
              }
            );
            if (gpsResult.success) {
              console.log('✅ GPS saved to Sites Registry');
              toast({
                title: 'GPS Coordinates Saved',
                description: 'Site GPS coordinates have been saved to the Sites Registry.',
                variant: 'default'
              });
            } else {
              console.warn('⚠️ Failed to save GPS to registry:', gpsResult.error);
              // Show warning toast but don't fail the visit completion
              toast({
                title: 'GPS Save Warning',
                description: gpsResult.error || 'GPS coordinates could not be saved to the Sites Registry.',
                variant: 'destructive'
              });
            }
          } catch (gpsError) {
            console.error('❌ Error saving GPS to registry:', gpsError);
            // Non-blocking - don't fail the visit completion for GPS errors
            toast({
              title: 'GPS Save Error',
              description: 'An error occurred while saving GPS coordinates. Please contact support if this persists.',
              variant: 'destructive'
            });
          }
        } else {
          // Offline: GPS data will be saved during sync (included in payload below)
          console.log('📍 Offline mode - GPS coordinates will be saved to registry during sync');
        }
      } else if (gpsCoordinates) {
        console.warn('⚠️ Cannot save GPS: No valid site entry ID available');
        toast({
          title: 'GPS Not Saved',
          description: 'GPS coordinates were captured but could not be linked to the Sites Registry.',
          variant: 'destructive'
        });
      }

      // Update site status to 'Completed' and save report info
      // CRITICAL: Ensure visit_completed_at and visit_completed_by are set if not already set
      if (isOnline) {
        console.log('🔄 Updating site status to Completed...');
        
        // First, check if visit_completed_at is already set
        const { data: currentSite, error: fetchError } = await supabase
          .from('mmp_site_entries')
          .select('visit_completed_at, visit_completed_by')
          .eq('id', site.id)
          .single();

        if (fetchError) {
          console.error('❌ Error fetching current site data:', fetchError);
        }

        // Prepare update data - ensure visit_completed_at and visit_completed_by are set
        const updatePayload: any = {
          status: 'Completed',
          additional_data: {
            ...(site.additional_data || {}),
            visit_report_submitted: true,
            visit_report_id: report?.id || null,
            visit_report_submitted_at: now
          }
        };

        // Only set visit_completed_at, visit_date, and visit_completed_by if they're not already set
        if (!currentSite?.visit_completed_at) {
          updatePayload.visit_completed_at = now;
          updatePayload.visit_date = now;
          console.log('📝 Setting visit_completed_at and visit_date (was null)');
        }
        if (!currentSite?.visit_completed_by) {
          updatePayload.visit_completed_by = currentUser?.id;
          console.log('📝 Setting visit_completed_by (was null)');
        }

        const { data: updateData, error: updateError } = await supabase
          .from('mmp_site_entries')
          .update(updatePayload)
          .eq('id', site.id)
          .select();

        if (updateError) {
          console.error('❌ Site status update error:', updateError);
          throw updateError;
        }
        console.log('✅ Site status updated to Completed:', updateData);
      } else {
        // Offline: Site status update is already included in site_visit_complete sync
        console.log('🔄 Offline mode - site status update included in completion sync');
      }

      // CRITICAL: Create wallet transaction if it doesn't exist
      // This ensures wallet transactions are created even if handleCompleteVisit wasn't called
      if (isOnline) {
        try {
          console.log('💰 Creating wallet transaction for completed site:', site.id);
          const walletResult = await createSiteVisitWalletTransaction({
            siteVisitId: site.id,
            description: `Site visit completed: ${site.site_name || site.siteName || 'Site'}`,
            showNotifications: true,
            toast: toast,
          });

          if (walletResult.success) {
            console.log('✅ Wallet transaction created:', walletResult.message);
            toast({
              title: 'Payment Processed',
              description: walletResult.message,
              variant: 'default'
            });
          } else {
            // If transaction already exists, that's okay - just log it
            if (walletResult.message.includes('already exists')) {
              console.log('ℹ️ Wallet transaction already exists (skipped duplicate)');
            } else {
              console.warn('⚠️ Wallet transaction creation failed:', walletResult.message);
              toast({
                title: 'Payment Warning',
                description: walletResult.message || 'Wallet payment could not be processed. Please contact support.',
                variant: 'destructive'
              });
            }
          }
        } catch (walletErr: any) {
          console.error('❌ Wallet transaction error:', walletErr);
          // Don't fail the entire operation if wallet transaction fails
          toast({
            title: 'Payment Warning',
            description: 'Site visit completed but wallet payment failed. Please contact support.',
            variant: 'destructive'
          });
        }
      } else {
        // Wallet transaction will be handled when syncing site_visit_complete
        console.log('💰 Wallet transaction will be processed when syncing completion');
      }

      // Notify coordinator (or assignee) that site visit was completed
      try {
        const coordinatorId = (site as any).forwarded_to_user_id ?? (site as any).forwardedToUserId;
        const siteName = site.site_name || site.siteName || 'Site';
        const collectorName = (currentUser as any)?.fullName ?? (currentUser as any)?.full_name ?? (currentUser as any)?.email ?? 'Data collector';
        if (coordinatorId) {
          await NotificationTriggerService.siteVisitCompleted(coordinatorId, siteName, collectorName, site.id);
        }
      } catch (notifErr) {
        console.warn('[MMP] Failed to send site visit completed notification:', notifErr);
      }

      // Check coverage milestones for the MMP (25 / 50 / 75 / 100%)
      try {
        const mmpFileId = (site as any).mmp_file_id || (site as any).mmpFileId;
        const hubId = (site as any).hub_office || (site as any).hubOffice;
        const activityName = (site as any).main_activity || (site as any).mainActivity || 'Activity';
        if (mmpFileId && hubId) {
          const { data: allEntries } = await supabase
            .from('mmp_site_entries')
            .select('status')
            .eq('mmp_file_id', mmpFileId);
          if (allEntries && allEntries.length > 0) {
            const total = allEntries.length;
            const terminalStatuses = ['verified', 'approved', 'completed', 'costed', 'approved_and_costed', 'cp_verified', 'cp_verification'];
            const completed = allEntries.filter(e => terminalStatuses.includes(e.status)).length;
            const prevCompleted = Math.max(0, completed - 1);
            const oldPct = Math.floor((prevCompleted / total) * 100);
            const newPct = Math.floor((completed / total) * 100);
            for (const milestone of [25, 50, 75, 100]) {
              if (oldPct < milestone && newPct >= milestone) {
                NotificationTriggerService.activityCoverageUpdate(hubId, activityName, milestone, total, completed).catch(console.warn);
                break;
              }
            }
          }
        }
      } catch (covErr) {
        console.warn('[MMP] Coverage milestone check failed:', covErr);
      }

      toast({
        title: isOnline ? 'Visit Report Submitted' : 'Visit Report Saved (Offline)',
        description: isOnline 
          ? 'Visit report has been submitted successfully and site visit is now completed.'
          : 'Visit report has been saved and will be submitted when you are back online.',
        variant: 'default'
      });

      // Close dialog and reset state
      setVisitReportDialogOpen(false);
      setSelectedSiteForVisit(null);
      setSubmittingReport(false);

        // Reload enumerator data immediately instead of full page reload
      if (canClaimSites && currentUser?.id) {
        console.log('🔄 Reloading enumerator data after visit completion...');
        try {
          // Reload unsynced completed visits (for Outbox)
          if (!isOnline) {
            const { getUnsyncedSiteVisits } = await import('@/lib/offline-db');
            const unsyncedVisits = await getUnsyncedSiteVisits();
            const completedUnsynced = unsyncedVisits
              .filter(v => v.status === 'completed' && !v.synced)
              .map(visit => ({
                id: visit.siteEntryId,
                siteEntryId: visit.siteEntryId,
                siteName: visit.siteName,
                siteCode: visit.siteCode,
                state: visit.state,
                locality: visit.locality,
                status: 'Completed',
                completedAt: visit.completedAt,
                accepted_by: currentUser.id,
                additionalData: {
                  offline_completed: true,
                  offline_sync_pending: true,
                  completed_at_offline: visit.completedAt,
                  notes: visit.notes
                },
                _isOfflineVisit: true
              }));
            setUnsyncedCompletedVisits(completedUnsynced);
          }

          // Load updated my sites data (only when online)
          if (isOnline) {
            const { data: mySitesData, error: mySitesError } = await supabase
              .from('mmp_site_entries')
              .select('*')
              .eq('accepted_by', currentUser.id)
              .order('created_at', { ascending: false })
              .limit(10000);

            if (!mySitesError && mySitesData) {
              const excludeStatuses = new Set(['rejected']);
              const activeSites = mySitesData.filter((entry: any) => {
                const status = (entry.status || '').trim().toLowerCase();
                return !excludeStatuses.has(status);
              });
              const formatEntries = (entries: any[]) => entries.map(entry => {
                const enumeratorFee = entry.enumerator_fee;
                const transportFee = entry.transport_fee;
                return {
                  ...entry,
                  siteName: entry.site_name,
                  siteCode: entry.site_code,
                  enumerator_fee: enumeratorFee,
                  enumeratorFee: enumeratorFee,
                  transport_fee: transportFee,
                  transportFee: transportFee,
                };
              });

              const formattedMySites = formatEntries(activeSites);
              setEnumeratorMySites(formattedMySites);
              console.log('✅ Enumerator My Sites updated:', formattedMySites.length, 'sites');
            }
          } else {
            console.log('📴 Offline mode - skipping data reload, will sync when online');
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
      
      // If online and error occurred, try offline fallback
      if (navigator.onLine && error && selectedSiteForVisit) {
        console.log('[SubmitReport] Online submission failed, attempting offline save...');
        try {
          const { addPendingSync } = await import('@/lib/offline-db');
          const fallbackSite = selectedSiteForVisit;
          
          // Queue report submission using site_visit_complete type
          await addPendingSync({
            type: 'site_visit_complete',
            payload: {
              siteEntryId: fallbackSite.id,
              userId: currentUser?.id || null,
              completedAt: new Date().toISOString(),
              location: reportData.coordinates ? {
                lat: reportData.coordinates.latitude,
                lng: reportData.coordinates.longitude,
                accuracy: reportData.coordinates.accuracy
              } : undefined,
              notes: reportData.notes || 'No additional notes provided',
              photos: [],
              visitReport: {
                activities: reportData.activities,
                durationMinutes: reportData.visitDuration,
                coordinates: reportData.coordinates ? {
                  latitude: reportData.coordinates.latitude,
                  longitude: reportData.coordinates.longitude,
                  accuracy: reportData.coordinates.accuracy
                } : {},
                submittedAt: new Date().toISOString()
              }
            }
          });
          
          // Queue photos
          for (const photo of reportData.photos) {
            try {
              const reader = new FileReader();
              await new Promise<void>((resolve, reject) => {
                reader.onloadend = async () => {
                  try {
                    const base64Data = reader.result as string;
                    await queuePhotoUpload(fallbackSite.id, base64Data, photo.name);
                    resolve();
                  } catch (err) {
                    reject(err);
                  }
                };
                reader.onerror = reject;
                reader.readAsDataURL(photo);
              });
            } catch (queueError) {
              console.error('Failed to queue photo:', queueError);
            }
          }
          
          toast({
            title: 'Report Saved (Offline)',
            description: 'Report has been saved and will be submitted when connection is restored.',
            variant: 'default'
          });
          
          setVisitReportDialogOpen(false);
          setSelectedSiteForVisit(null);
          setSubmittingReport(false);
          return;
        } catch (offlineError) {
          console.error('[SubmitReport] Offline fallback also failed:', offlineError);
        }
      }
      
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
      const visitStart = site.visit_started_at || site.additional_data?.visit_started_at;
      const visitEnd = site.visit_completed_at || site.additional_data?.visit_completed_at;
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
  const [unsyncedCompletedVisits, setUnsyncedCompletedVisits] = useState<any[]>([]);
  const [viewerEnumeratorFee, setViewerEnumeratorFee] = useState<number>(0);
  const [enumeratorRefreshTrigger, setEnumeratorRefreshTrigger] = useState(0);
  const enumeratorDbLoadedRef = useRef(false);

  // Helper function to normalize role checking (handles both lowercase, proper case, and spaces)
  const hasRole = (rolesToCheck: string[]) => {
    if (!currentUser) return false;
    
    const normalize = (r: string) => r.toLowerCase().replace(/[\s_-]/g, '');
    
    const userRole = normalize(currentUser.role || '');
    const userRoles = (currentUser.roles || []).map(r => normalize(r));
    
    return rolesToCheck.some(role => {
      const normalizedRole = normalize(role);
      return userRole === normalizedRole || userRoles.includes(normalizedRole);
    });
  };

  const isSuperAdmin = hasRole(['super_admin', 'Super Admin', 'superadmin', 'super admin', 'SuperAdmin']);
  const isAdmin = hasRole(['Admin', 'admin', 'super_admin', 'Super Admin', 'superadmin', 'super admin', 'SuperAdmin']);
  const isICT = hasRole(['ICT', 'ict']);
  const isFOM = hasRole(['Field Operation Manager (FOM)', 'fom', 'field operation manager']);
  const isSupervisor = hasRole(['Supervisor', 'supervisor', 'hubsupervisor', 'hub_supervisor']);
  const isCoordinator = hasRole(['Coordinator', 'coordinator']);
  const isDataCollector = hasRole(['DataCollector', 'datacollector', 'Data Collector', 'data collector', 'enumerator', 'Enumerator']);
  const isDataTeam = hasRole(['DataTeam', 'dataTeam', 'data_team', 'Data Team']);
  // Data collectors and coordinators can claim/accept sites; supervisors, FOM, ICT and admins are oversight-only.
  // PRIORITY RULE: admin/ICT/FOM always override DataCollector, even when DataCollector appears
  // as a secondary entry in the user_roles table (same priority logic used in Dashboard routing).
  const canClaimSites = !isAdmin && !isICT && !isFOM && (isDataCollector || isCoordinator);
  
  // Hub-based access control for supervisors
  // Supervisors should only see operations within their assigned hub
  const hubAccessInfo = useMemo(() => getHubAccessInfo(currentUser), [currentUser]);
  const applyHubFilter = shouldApplyHubFilter(currentUser);

  // Pre-load the set of MMP IDs that have at least one site entry in the user's hub.
  // Applies to both supervisors and coordinators who have a hub assignment.
  // This avoids relying on lazy-loaded siteEntries for the hub filter.
  const [supervisorHubMmpIds, setSupervisorHubMmpIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!applyHubFilter || !hubAccessInfo.isHubSupervisor) {
      setSupervisorHubMmpIds(null);
      return;
    }
    const stateNames = hubAccessInfo.hubStateNames;
    const stateIds = hubAccessInfo.hubStates;
    if (stateNames.length === 0 && stateIds.length === 0) {
      setSupervisorHubMmpIds(null);
      return;
    }
    // Derive base names by stripping " State" / "-state" suffix so "Khartoum" matches "Khartoum State"
    const baseNames = [
      ...stateNames.map(n => n.replace(/\s+state$/i, '').trim()),
      ...stateIds.map(s => s.replace(/-state$/, '').replace(/-/g, ' ').trim()),
    ].filter(Boolean);
    const uniqueBases = Array.from(new Set(baseNames.map(b => b.toLowerCase())));

    const fetchHubMmpIds = async () => {
      // Fetch all distinct mmp_file_id + state values — lightweight, no site details needed
      const { data, error } = await supabase
        .from('mmp_site_entries')
        .select('mmp_file_id, state, hub_office');
      if (error) {
        console.warn('[MMP] supervisorHubMmpIds fetch error:', error.message);
        setSupervisorHubMmpIds(null);
        return;
      }
      const ids = new Set<string>();
      for (const row of (data || [])) {
        const rowState = (row.state || '').toLowerCase().replace(/\s+state$/i, '').trim();
        const rowHub = (row.hub_office || '').toLowerCase();
        const stateMatch = uniqueBases.some(b => rowState === b || rowState.includes(b) || b.includes(rowState));
        const hubMatch = hubAccessInfo.hubIds.some(h =>
          rowHub.includes(h.toLowerCase()) || h.toLowerCase().includes(rowHub));
        if ((stateMatch || hubMatch) && row.mmp_file_id) ids.add(row.mmp_file_id);
      }
      setSupervisorHubMmpIds(ids);
    };

    fetchHubMmpIds();
  }, [applyHubFilter, hubAccessInfo.isHubSupervisor,
      hubAccessInfo.hubStateNames.join('|'), hubAccessInfo.hubStates.join('|'),
      hubAccessInfo.hubIds.join('|')]);

  // Load viewer's enumerator fee once on mount (used for calculating total cost display)
  useEffect(() => {
    const loadViewerFee = async () => {
      if (!currentUser?.id) return;
      try {
        const feeResult = await calculateEnumeratorFeeForUser(currentUser.id);
        setViewerEnumeratorFee(feeResult.fee);
        console.log('[MMP] Loaded viewer enumerator fee:', feeResult.fee, 'Level:', feeResult.classificationLevel);
      } catch (error) {
        console.warn('[MMP] Could not load viewer enumerator fee:', error);
      }
    };
    loadViewerFee();
  }, [currentUser?.id]);

  // Direct database load of dispatched sites for data collectors/coordinators
  // This ensures sites are visible even if MMP context hasn't loaded site entries yet
  useEffect(() => {
    const loadDispatchedSitesForEnumerator = async () => {
      if (!canClaimSites || !currentUser?.id) {
        return;
      }
      
      setLoadingEnumerator(true);
      try {
        // Use siteNormalization utility to resolve state name with alias support (e.g., Gedaref -> Gedarif)
        const collectorStateName = getStateName(currentUser.stateId);
        
        if (!collectorStateName) {
          console.warn('[MMP Direct Load] No state found for user. stateId:', currentUser.stateId);
          setLoadingEnumerator(false);
          return;
        }

        // Build state filter that handles aliases (e.g., both "Gedaref" and "Gedarif")
        const normalizedStateId = normalizeStateId(currentUser.stateId);
        const stateObj = normalizedStateId ? sudanStates.find(s => s.id === normalizedStateId) : null;
        const stateVariants = new Set<string>();
        stateVariants.add(collectorStateName);
        if (stateObj) {
          stateVariants.add(stateObj.name);
          stateVariants.add(stateObj.id);
        }
        if (currentUser.stateId) stateVariants.add(currentUser.stateId);

        // Remove any empty/whitespace-only variants
        const validVariants = [...stateVariants].filter(v => v && v.trim().length > 0);
        
        if (validVariants.length === 0) {
          console.warn('[MMP Direct Load] No valid state variants found for filtering');
          setLoadingEnumerator(false);
          return;
        }

        // Query with OR filter for all state name variants
        const stateFilterStr = validVariants.map(v => `state.ilike.%${v}%`).join(',');
        
        let query = supabase
          .from('mmp_site_entries')
          .select('id, site_code, hub_office, state, locality, site_name, cp_name, visit_type, visit_date, main_activity, activity_at_site, monitoring_by, survey_tool, use_market_diversion, use_warehouse_monitoring, comments, cost, enumerator_fee, transport_fee, dispatched_by, dispatched_at, accepted_by, accepted_at, cost_acknowledged, additional_data, status, mmp_file_id, created_at')
          .in('status', ['Dispatched', 'dispatched'])
          .is('accepted_by', null);

        // Use OR for multiple variants, simple ilike for single variant
        if (validVariants.length === 1) {
          query = query.ilike('state', `%${validVariants[0]}%`);
        } else {
          query = query.or(stateFilterStr);
        }
        
        const { data: dispatchedSites, error } = await query
          .order('created_at', { ascending: false })
          .limit(10000);

        if (error) {
          console.error('[MMP Direct Load] DB Error:', error);
          console.error('[MMP Direct Load] Query details - state filter:', collectorStateName, 'user:', currentUser.id);
          setLoadingEnumerator(false);
          return;
        }

        console.log(`[MMP Direct Load] Found ${dispatchedSites?.length || 0} dispatched sites for state "${collectorStateName}"`);
        enumeratorDbLoadedRef.current = true;
        if (dispatchedSites && dispatchedSites.length > 0) {
          const formattedEntries = dispatchedSites.map(entry => ({
            ...entry,
            siteName: entry.site_name,
            siteCode: entry.site_code,
            mmp_file_id: entry.mmp_file_id,
            mmpId: entry.mmp_file_id,
            enumerator_fee: entry.enumerator_fee,
            transport_fee: entry.transport_fee,
            additionalData: entry.additional_data || {}
          }));
          
          setEnumeratorSiteEntries(formattedEntries);
          
          const grouped = formattedEntries.reduce((acc: Record<string, any[]>, entry: any) => {
            const state = entry.state || 'Unknown State';
            const locality = entry.locality || 'Unknown Locality';
            const key = `${state} - ${locality}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(entry);
            return acc;
          }, {});
          setEnumeratorGroupedByStates(grouped);
        } else {
          setEnumeratorSiteEntries([]);
          setEnumeratorGroupedByStates({});
        }
      } catch (error) {
        console.error('[MMP Direct Load] Failed:', error);
      } finally {
        setLoadingEnumerator(false);
      }
    };

    enumeratorDbLoadedRef.current = false;
    loadDispatchedSitesForEnumerator();
  }, [canClaimSites, currentUser?.id, currentUser?.stateId, enumeratorRefreshTrigger]);

  // Direct database load of MY SITES (accepted by current user)
  // This ensures "My Sites" tab shows data even if MMP context hasn't loaded site entries yet
  useEffect(() => {
    const loadMySitesForEnumerator = async () => {
      if (!canClaimSites || !currentUser?.id) {
        return;
      }
      
      try {
        const { data: acceptedData, error } = await supabase
          .from('mmp_site_entries')
          .select('id, site_code, hub_office, state, locality, site_name, cp_name, visit_type, visit_date, main_activity, activity_at_site, monitoring_by, survey_tool, comments, cost, enumerator_fee, transport_fee, dispatched_by, dispatched_at, accepted_by, accepted_at, cost_acknowledged, additional_data, status, mmp_file_id, created_at')
          .eq('accepted_by', currentUser.id)
          .or('status.is.null,status.not.in.("Rejected","rejected")')
          .order('created_at', { ascending: false })
          .limit(10000);

        const mySitesData: any[] = acceptedData || [];

        if (error) {
          console.error('[MMP My Sites Load] DB Error:', error);
        }

        // Query 2: Sites assigned via down_payment_requests (requested_by = user.id)
        const { data: dpRequests, error: dpError } = await supabase
          .from('down_payment_requests')
          .select('mmp_site_entry_id, site_name, requested_amount, total_transportation_budget')
          .eq('requested_by', currentUser.id)
          .in('status', ['approved', 'partially_paid', 'fully_paid', 'pending_admin', 'pending_supervisor']);

        if (dpError) {
          console.error('[MMP My Sites Load] Down payment query error:', dpError);
        }

        const acceptedIds = new Set((mySitesData || []).map(e => e.id));
        let dpSiteEntries: any[] = [];
        
        if (dpRequests && dpRequests.length > 0) {
          // Split: those with mmp_site_entry_id and those with only site_name
          const withId = dpRequests.filter((dp: any) => dp.mmp_site_entry_id && !acceptedIds.has(dp.mmp_site_entry_id));
          const withoutId = dpRequests.filter((dp: any) => !dp.mmp_site_entry_id && dp.site_name);
          
          // Fetch by ID
          if (withId.length > 0) {
            const uniqueIds = [...new Set(withId.map((dp: any) => dp.mmp_site_entry_id))];
            const dpIdMap = new Map<string, any>();
            withId.forEach((dp: any) => { if (dp.mmp_site_entry_id) dpIdMap.set(dp.mmp_site_entry_id, dp); });
            let idEntries: any[] = [];
            for (let _from = 0; ; _from += 1000) {
              const { data: _page } = await supabase.from('mmp_site_entries').select('*').in('id', uniqueIds).range(_from, _from + 999);
              if (!_page) break;
              idEntries = [...idEntries, ..._page];
              if (_page.length < 1000) break;
            }
            dpSiteEntries.push(...idEntries.map(entry => {
                const dpReq = dpIdMap.get(entry.id);
                const hasCost = (entry.enumerator_fee != null && entry.transport_fee != null) || entry.cost != null;
                const dpAmount = dpReq?.requested_amount || dpReq?.total_transportation_budget;
                return {
                  ...entry,
                  accepted_by: entry.accepted_by || currentUser.id,
                  cost: hasCost ? (entry.cost || (Number(entry.enumerator_fee || 0) + Number(entry.transport_fee || 0))) : (dpAmount ? Number(dpAmount) : entry.cost),
                  enumerator_fee: entry.enumerator_fee != null ? entry.enumerator_fee : (dpAmount ? Number(dpAmount) : null),
                  transport_fee: entry.transport_fee != null ? entry.transport_fee : 0,
                };
              }));
          }
          
          // Fallback: match by site_name
          if (withoutId.length > 0) {
            const siteNames = [...new Set(withoutId.map((dp: any) => dp.site_name).filter(Boolean))];
            const nameToReq = new Map<string, any>();
            withoutId.forEach((dp: any) => { if (dp.site_name) nameToReq.set(dp.site_name.toLowerCase(), dp); });
            const alreadyFound = new Set([...acceptedIds, ...dpSiteEntries.map(e => e.id)]);
            for (let i = 0; i < siteNames.length; i += 50) {
              const batch = siteNames.slice(i, i + 50);
              let nameEntries: any[] = [];
              for (let _nf = 0; ; _nf += 1000) {
                const { data: _np } = await supabase.from('mmp_site_entries').select('*').in('site_name', batch).range(_nf, _nf + 999);
                if (!_np) break;
                nameEntries = [...nameEntries, ..._np];
                if (_np.length < 1000) break;
              }
              if (nameEntries.length > 0) {
                nameEntries
                  .filter(e => !alreadyFound.has(e.id))
                  .forEach(e => {
                    const dpReq = nameToReq.get((e.site_name || '').toLowerCase());
                    const hasCost = (e.enumerator_fee != null && e.transport_fee != null) || e.cost != null;
                    const dpAmount = dpReq?.requested_amount || dpReq?.total_transportation_budget;
                    dpSiteEntries.push({
                      ...e,
                      accepted_by: e.accepted_by || currentUser.id,
                      cost: hasCost ? (e.cost || (Number(e.enumerator_fee || 0) + Number(e.transport_fee || 0))) : (dpAmount ? Number(dpAmount) : e.cost),
                      enumerator_fee: e.enumerator_fee != null ? e.enumerator_fee : (dpAmount ? Number(dpAmount) : null),
                      transport_fee: e.transport_fee != null ? e.transport_fee : 0,
                    });
                    alreadyFound.add(e.id);
                  });
              }
            }
          }
        }

        const excludeStatuses = new Set(['rejected']);
        const allEntries = [...(mySitesData || []), ...dpSiteEntries];
        const dedupIds = new Set<string>();
        const deduped = allEntries.filter(e => {
          if (dedupIds.has(e.id)) return false;
          dedupIds.add(e.id);
          const status = (e.status || '').trim().toLowerCase();
          if (excludeStatuses.has(status)) return false;
          return true;
        });

        console.log(`📊 [MMP My Sites Load] Found ${deduped.length} sites (${mySitesData?.length || 0} accepted + ${dpSiteEntries.length} from advance requests)`);

        if (deduped.length > 0) {
          const formattedEntries = deduped.map(entry => ({
            ...entry,
            siteName: entry.site_name,
            siteCode: entry.site_code,
            mmp_file_id: entry.mmp_file_id,
            mmpId: entry.mmp_file_id,
            enumerator_fee: entry.enumerator_fee,
            transport_fee: entry.transport_fee,
            additionalData: entry.additional_data || {}
          }));
          
          setEnumeratorMySites(formattedEntries);
          console.log('[MMP My Sites Load] Successfully loaded My Sites:', formattedEntries.length);
        } else {
          console.log('[MMP My Sites Load] No sites found for this user');
          setEnumeratorMySites([]);
        }
      } catch (error) {
        console.error('[MMP My Sites Load] Failed:', error);
      }
    };

    loadMySitesForEnumerator();
  }, [canClaimSites, currentUser?.id, enumeratorRefreshTrigger]);

  const canRead = checkPermission('mmp', 'read') || isAdmin || isFOM || isSupervisor || isCoordinator || isICT || isDataCollector || isDataTeam;
  // Only Admin and ICT accounts should see the Upload button on the MMP management page.
  // We intentionally DO NOT fallback to checkPermission here to prevent other roles (e.g. FOM)
  // that may have broad permissions from seeing the upload control.
  const canCreate = isAdmin || isICT;

  const [hasClosingCycle, setHasClosingCycle] = useState(false);
  const [closingCycleName, setClosingCycleName] = useState<string | null>(null);
  const [closingCycleId, setClosingCycleId] = useState<string | null>(null);

  const [pendingApprovalMmps, setPendingApprovalMmps] = useState<{ id: string; name: string }[]>([]);
  const [mmpBannerRejectId, setMmpBannerRejectId] = useState<string | null>(null);
  const [mmpBannerRejectNote, setMmpBannerRejectNote] = useState('');
  const [mmpBannerApproving, setMmpBannerApproving] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin && !isSuperAdmin) return;
    const checkClosingCycles = async () => {
      const { data } = await supabase
        .from('mmp_files')
        .select('id, name')
        .eq('cycle_status', 'closing')
        .limit(1);
      setHasClosingCycle(!!data && data.length > 0);
      setClosingCycleName(data?.[0]?.name ?? null);
      setClosingCycleId(data?.[0]?.id ?? null);
    };
    checkClosingCycles();
  }, [isAdmin, isSuperAdmin]);

  useEffect(() => {
    if (!isFOM && !isAdmin && !isSuperAdmin) return;
    supabase
      .from('mmp_files')
      .select('id, name')
      .eq('cycle_status', 'pending_approval')
      .then(({ data }) => setPendingApprovalMmps((data || []) as { id: string; name: string }[]));
  }, [isFOM, isAdmin, isSuperAdmin]);

  const handleMmpBannerApprove = useCallback(async (mmpId: string) => {
    setMmpBannerApproving(mmpId);
    try {
      const userId = currentUser?.id;
      const { error } = await supabase.rpc('cycle_approve_close', { p_mmp_id: mmpId, p_approved_by: userId });
      if (error) throw error;
      setPendingApprovalMmps(prev => prev.filter(m => m.id !== mmpId));
      toast({ title: 'Cycle Approved & Closed', description: 'The MMP cycle has been approved and closed.' });
    } catch (err: any) {
      await supabase.from('mmp_files')
        .update({ cycle_status: 'closed', cycle_closed_at: new Date().toISOString(), cycle_closed_by: currentUser?.id } as any)
        .eq('id', mmpId);
      setPendingApprovalMmps(prev => prev.filter(m => m.id !== mmpId));
      toast({ title: 'Cycle Approved & Closed', description: 'The MMP cycle has been approved and closed.' });
    } finally {
      setMmpBannerApproving(null);
    }
  }, [currentUser, toast]);

  const handleMmpBannerReject = useCallback(async (mmpId: string, note: string) => {
    try {
      await supabase.from('mmp_files')
        .update({ cycle_status: 'closing', cycle_approval_note: note } as any)
        .eq('id', mmpId);
      setPendingApprovalMmps(prev => prev.filter(m => m.id !== mmpId));
      setMmpBannerRejectId(null);
      setMmpBannerRejectNote('');
      toast({ title: 'Cycle Sent Back', description: 'The cycle has been returned to the admin for corrections.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to reject cycle', variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    if (!isAdmin && !isSupervisor && !isDataTeam) return;
    import('@/services/verificationReminderService').then(({ checkAndSendVerificationReminders }) => {
      checkAndSendVerificationReminders().catch(console.error);
    });
  }, [isAdmin, isSupervisor, isDataTeam]);

  // Real-time subscription for site claims (Uber-like first-claim system)
  // When another enumerator claims a site, it will be removed from available sites in real-time
  const handleSiteClaimedRealtime = useCallback((siteId: string, claimedBy: string) => {
    // Remove the claimed site from available sites immediately
    setEnumeratorSiteEntries(prev => prev.filter(s => s.id !== siteId));
    setEnumeratorGroupedByStates(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        updated[key] = updated[key].filter(s => s.id !== siteId);
        if (updated[key].length === 0) delete updated[key];
      });
      return updated;
    });
    // Trigger a full DB refresh for both dispatched and My Sites tabs
    setEnumeratorRefreshTrigger(prev => prev + 1);
  }, [currentUser?.id]);

  useSiteClaimRealtime({
    onSiteClaimed: handleSiteClaimedRealtime,
    enabled: canClaimSites,
    currentUserId: currentUser?.id
  });

  // Admin/FOM/Supervisor: listen for claim events to refresh dispatched/accepted tabs
  useSiteClaimRealtime({
    onSiteClaimed: () => {
      setAdminRefreshTrigger(prev => prev + 1);
    },
    enabled: !canClaimSites && (isAdmin || isICT || isFOM || isSupervisor || isCoordinator),
    channelName: 'admin_claim_updates',
    suppressToast: true
  });

  // Set initial active tab based on role
  // Coordinators should see the enumerator tab (they can claim sites like data collectors)
  useEffect(() => {
    if (canClaimSites) {
      setActiveTab('enumerator');
    } else {
      setActiveTab('new');
    }
  }, [canClaimSites]);

  // Get users from context for coordinator/supervisor selection
  const { users: contextUsers } = useAppContext();
  
  // Derive coordinators and supervisors from context users
  useEffect(() => {
    if (!isFOM && !isSupervisor && !isAdmin && !isICT) return;
    
    // Filter coordinators from context users
    const coords = contextUsers.filter(u => String(u.role || '').trim().toLowerCase() === 'coordinator');
    setCoordinatorsList(coords.map(c => ({
      id: c.id,
      fullName: c.fullName || c.name || c.email,
      email: c.email,
      stateId: c.stateId,
      localityId: c.localityId,
      hubId: c.hubId
    })));
    
    // Filter supervisors from context users
    const sups = contextUsers.filter(u => String(u.role || '').trim().toLowerCase() === 'supervisor');
    setSupervisorsList(sups.map(s => ({
      id: s.id,
      fullName: s.fullName || s.name || s.email,
      email: s.email,
      hubId: s.hubId
    })));
    
    // Load hub-state relationships
    const loadHubStates = async () => {
      try {
        const { data: hubStatesData } = await supabase
          .from('hub_states')
          .select('hub_id, state_id, state_name');
        if (hubStatesData) {
          setHubStatesList(hubStatesData);
        }
      } catch (err) {
        console.error('Failed to load hub states:', err);
      }
    };
    loadHubStates();
  }, [isFOM, isSupervisor, isAdmin, isICT, contextUsers]);

  const resolveOriginalCoordinatorId = useCallback((site: any): string => {
    if (!site) return '';

    const ad = site.additional_data || site.additionalData || {};
    const coordinatorIds = new Set((coordinatorsList || []).map((c: any) => String(c.id)));

    const idCandidates = [
      site.verified_by,
      site.verifiedBy,
      ad.sent_back_by,
      site.rejected_by,
      site.rejectedBy,
      ad.rejected_by,
      ad.returned_by_user_id,
      site.forwarded_to_user_id,
      site.forwardedToUserId,
      ad.assigned_to,
      ad.assignedTo,
      ad.forwarded_to_user_id,
      ad.forwardedToUserId,
      ad.sent_back_to_coordinator_id,
      ad.sentBackToCoordinatorId,
    ].filter(Boolean);

    for (const candidate of idCandidates) {
      const normalizedCandidate = String(candidate);
      if (coordinatorIds.has(normalizedCandidate)) return normalizedCandidate;
    }

    const returnedByName = String(
      ad.returned_by_name ||
      ad.sent_back_by_name ||
      ad.returnedByName ||
      ad.sentBackByName ||
      ''
    ).trim().toLowerCase();

    const returnedByEmail = String(
      ad.returned_by_email ||
      ad.sent_back_by_email ||
      ad.returnedByEmail ||
      ad.sentBackByEmail ||
      ''
    ).trim().toLowerCase();

    if (returnedByName) {
      const byName = coordinatorsList.find((c: any) => {
        const fullName = String(c.fullName || '').trim().toLowerCase();
        const name = String(c.name || '').trim().toLowerCase();
        const email = String(c.email || '').trim().toLowerCase();
        return fullName === returnedByName ||
               name === returnedByName ||
               fullName.includes(returnedByName) ||
               returnedByName.includes(fullName) ||
               name.includes(returnedByName) ||
               returnedByName.includes(name) ||
               email === returnedByName ||
               (returnedByEmail && email === returnedByEmail);
      });
      if (byName?.id) return String(byName.id);
    }

    if (returnedByEmail) {
      const byEmail = coordinatorsList.find((c: any) => String(c.email || '').trim().toLowerCase() === returnedByEmail);
      if (byEmail?.id) return String(byEmail.id);
    }

    return '';
  }, [coordinatorsList]);

  useEffect(() => {
    if (!returnedSiteActionDialog.open || returnedSiteActionDialog.action !== 'sendback') return;
    if (!returnedSiteActionDialog.site) return;
    if (selectedCoordinatorForSendBack) return;

    const resolved = resolveOriginalCoordinatorId(returnedSiteActionDialog.site);
    if (resolved) {
      setSelectedCoordinatorForSendBack(resolved);
    }
  }, [
    returnedSiteActionDialog.open,
    returnedSiteActionDialog.action,
    returnedSiteActionDialog.site,
    selectedCoordinatorForSendBack,
    resolveOriginalCoordinatorId,
  ]);

  const canRedispatchReturnedSite = (site: any): boolean => {
    if (!site) return false;
    const ad = site.additional_data || site.additionalData || {};
    const normalizedStatus = normalizeStatus(site.status);

    const wasDispatched = Boolean(
      site.dispatched_at ||
      site.dispatchedAt ||
      site.dispatched_by ||
      site.dispatchedBy ||
      ad.dispatched_at ||
      ad.dispatchedAt ||
      ad.dispatched_by ||
      ad.dispatchedBy
    );

    const hasApprovedAndCostedMarker = Boolean(
      ad.approved_and_costed_at ||
      ad.approvedAndCostedAt ||
      ad.approved_and_costed_by ||
      ad.approvedAndCostedBy ||
      ad.costed_at ||
      ad.costedAt ||
      ad.costed_by ||
      ad.costedBy ||
      site.approved_and_costed_at ||
      site.approvedAndCostedAt ||
      site.costed_at ||
      site.costedAt
    );

    const isApprovedAndCostedStatus =
      normalizedStatus === 'costed' ||
      normalizedStatus === 'approvedandcosted';

    return wasDispatched && (hasApprovedAndCostedMarker || isApprovedAndCostedStatus);
  };

  useEffect(() => {
    if (!returnedSiteActionDialog.open) {
      setShowReturnedBatchSiteList(false);
      return;
    }
    if (returnedSiteActionBatchSites.length <= 1) {
      setShowReturnedBatchSiteList(false);
    }
  }, [returnedSiteActionDialog.open, returnedSiteActionBatchSites.length]);

  // Pre-compute which MMP IDs have sites with verified/dispatched/etc statuses
  // This runs before categorization and updates when siteEntries are loaded
  const mmpIdsWithVerifiedSites = useMemo(() => {
    const idsWithVerified = new Set<string>();
    let totalSiteEntries = 0;
    for (const mmp of mmpFiles) {
      const entries = mmp.siteEntries || [];
      totalSiteEntries += entries.length;
      const hasVerified = entries.some(site => {
        const siteStatus = (site.status || '').toLowerCase();
        // Include all verified status variations
        return siteStatus === 'verified' || 
               siteStatus === 'cp_verified' ||
               siteStatus === 'permits_verified' ||
               siteStatus === 'locality_permit_verified' ||
               siteStatus === 'dispatched' || 
               siteStatus === 'accepted' || 
               siteStatus === 'assigned' ||
               siteStatus === 'completed' ||
               siteStatus === 'approved' ||
               (siteStatus.includes('approved') && siteStatus.includes('costed'));
      });
      if (hasVerified) {
        idsWithVerified.add(mmp.id);
      }
    }
    console.log('[MMP Page] mmpIdsWithVerifiedSites:', idsWithVerified.size, 'MMPs with verified sites, total site entries:', totalSiteEntries);
    return idsWithVerified;
  }, [mmpFiles]);

  // Categorize MMPs
  const categorizedMMPs = useMemo(() => {
    let filteredMMPs = mmpFiles;

    // HUB-BASED ACCESS FILTER FOR SUPERVISORS — two passes:
    // Pass 1 (list): Only show MMPs that have at least one entry in the supervisor's hub.
    //   Uses pre-fetched supervisorHubMmpIds to avoid dependency on lazy-loaded siteEntries.
    //   While the pre-fetch is in progress (null), show all MMPs (brief loading state).
    // Pass 2 (detail): Within each MMP, filter site entries to hub-relevant ones only,
    //   so coordinator assignments / state breakdowns are scoped to the hub.
    if (applyHubFilter && hubAccessInfo.isHubSupervisor) {
      if (supervisorHubMmpIds !== null) {
        filteredMMPs = filteredMMPs.filter(mmp => supervisorHubMmpIds.has(mmp.id));
      }
      // Filter loaded site entries within each remaining MMP to hub-only
      filteredMMPs = filteredMMPs.map(mmp => {
        const siteEntries = mmp.siteEntries || [];
        if (siteEntries.length === 0) return mmp; // not loaded yet — show MMP as-is
        const hubEntries = filterByHubAccess(siteEntries, hubAccessInfo);
        return { ...mmp, siteEntries: hubEntries };
      });
    }

    // PROJECT TEAM MEMBERSHIP FILTER
    // Only show MMPs from projects the user belongs to (unless admin/superuser).
    // For FOMs and Supervisors, still honor project membership but also allow MMPs explicitly forwarded to them.
    if (!isAdminOrSuperUser && !isDataTeam) {
      if (userProjectIds.length > 0) {
        // For hub-scoped roles (supervisors & coordinators), apply the project filter ON TOP of
        // the already hub-filtered list so the hub filter is not overridden.
        const filterBase = applyHubFilter ? filteredMMPs : mmpFiles;
        filteredMMPs = filterBase.filter(mmp => {
          const inProject = mmp.projectId ? userProjectIds.includes(mmp.projectId) : false;
          if (isFOM) {
            const workflow = mmp.workflow as any;
            const forwardedToFomIds = workflow?.forwardedToFomIds || [];
            const isForwarded = forwardedToFomIds.includes(currentUser?.id || '');
            return inProject || isForwarded;
          }
          // Supervisor and non-FOM path: show all MMPs in their projects
          return inProject;
        });
      } else if (userProjectIds.length === 0) {
        // User is not admin and has no project assignments - show no MMPs
        // But allow Data Collectors to see Available Sites (handled separately)
        // For FOMs with no project membership, allow forwarded MMPs; Supervisors see all (hub-scoped)
        if (isFOM) {
          filteredMMPs = mmpFiles.filter(mmp => {
            const workflow = mmp.workflow as any;
            const forwardedToFomIds = workflow?.forwardedToFomIds || [];
            return forwardedToFomIds.includes(currentUser?.id || '');
          });
        } else if (applyHubFilter) {
          // Keep filteredMMPs as-is (already hub-filtered above) for supervisors and coordinators.
          // Do NOT reset to mmpFiles here — that would undo the hub filter.
        } else if (!canClaimSites) {
          filteredMMPs = [];
        }
      }
    }

    // For FOM users only, restrict to MMPs forwarded to them or their verified MMPs
    // Supervisors see all MMPs in their scope (hub-filtered) for oversight/follow-up
    if (isFOM && currentUser) {
      filteredMMPs = filteredMMPs.filter(mmp => {
        const workflow = mmp.workflow as any;
        const forwardedToFomIds = workflow?.forwardedToFomIds || [];
        const isForwardedToThisUser = forwardedToFomIds.includes(currentUser.id);
        
        // Include MMPs forwarded to this FOM or verified MMPs
        return isForwardedToThisUser || mmp.type === 'verified-template';
      });
    }

    // For Coordinator users, show verified MMPs that contain sites they can verify
    if (isCoordinator && currentUser) {
      filteredMMPs = filteredMMPs.filter(mmp => 
        mmp.type === 'verified-template' || 
        mmp.status === 'approved' ||
        ((mmp.workflow as any)?.currentStage && ['permitsVerified', 'cpVerification', 'completed'].includes((mmp.workflow as any)?.currentStage))
      );
    }

    const newMMPs = filteredMMPs.filter(mmp => {
      if (isFOM) {
        // For FOM: New MMPs are all items forwarded to them (regardless of coordinator forwarding)
        const workflow = mmp.workflow as any;
        const forwardedToFomIds = workflow?.forwardedToFomIds || [];
        return forwardedToFomIds.includes(currentUser?.id || '');
      } else if (isCoordinator) {
        // For Coordinator: They don't see "new" MMPs, only verified ones with sites to verify
        return false;
      } else if (isAdmin || isICT || isDataTeam || isSupervisor) {
        // For admin/ICT/DataTeam/Supervisor: New MMPs are those uploaded but not forwarded to any FOM yet
        return mmp.status === 'pending' && 
               (!(mmp.workflow as any)?.forwardedToFomIds || (mmp.workflow as any)?.forwardedToFomIds.length === 0);
      }
      return false;
    });
    
    const forwardedMMPs = filteredMMPs.filter(mmp => {
      const workflow = mmp.workflow as any;
      
      // CRITICAL: Recalled MMPs with pending status should NEVER appear in "Forwarded MMPs"
      // They should only appear in "New MMPs"
      const isRecalledToPending = mmp.status === 'pending' && 
        (workflow?.isRecalled === true || workflow?.recalledAt) &&
        (!workflow?.forwardedToFomIds || workflow?.forwardedToFomIds.length === 0);
      
      if (isRecalledToPending) {
        return false; // Exclude from Forwarded - should be in New MMPs only
      }
      
      if (isFOM) {
        // For FOM: Forwarded means MMPs they've processed and sent to coordinators
        return workflow?.forwardedToCoordinators === true ||
               workflow?.currentStage === 'coordinatorReview';
      } else if (isCoordinator) {
        // For Coordinator: They don't have a "forwarded" category
        return false;
      } else if (isAdmin || isICT || isDataTeam || isSupervisor) {
        // For admin/ICT/DataTeam/Supervisor: Forwarded means MMPs that have been forwarded to FOMs or coordinators
        const hasForwardedToFomIds = workflow?.forwardedToFomIds && workflow?.forwardedToFomIds.length > 0;
        const hasForwardedToCoordinators = workflow?.forwardedToCoordinators === true || 
                                           (workflow?.forwardedToCoordinatorAt && !workflow?.isRecalled) ||
                                           (workflow?.currentStage === 'forwarded_to_coordinator' && !workflow?.isRecalled);
        // Include if forwarded to FOMs OR coordinators (workflow has progressed)
        return hasForwardedToFomIds || hasForwardedToCoordinators;
      }
      return false;
    });
    
    const newMMPIds = new Set(newMMPs.map(m => m.id));
    const forwardedMMPIds = new Set(forwardedMMPs.map(m => m.id));

    const verifiedMMPs = filteredMMPs.filter(mmp => {
      const workflow = mmp.workflow as any;
      
      // CRITICAL: Recalled MMPs with pending status should NEVER appear in "Verified Sites"
      // They should only appear in "New MMPs"
      const isRecalledToPending = mmp.status === 'pending' && 
        (workflow?.isRecalled === true || workflow?.recalledAt) &&
        (!workflow?.forwardedToFomIds || workflow?.forwardedToFomIds.length === 0);
      
      if (isRecalledToPending) {
        return false; // Exclude from Verified - should be in New MMPs only
      }
      
      // Normalize status for case-insensitive comparison (production data may have mixed casing)
      const normalizedStatus = (mmp.status || '').toLowerCase();
      
      // Use pre-computed set to check if MMP has verified sites
      // This updates when siteEntries are loaded asynchronously
      const hasVerifiedSites = mmpIdsWithVerifiedSites.has(mmp.id);
      
      if (isCoordinator) {
        // For Coordinator: Show MMPs that have been forwarded to coordinators
        return workflow?.forwardedToCoordinators === true;
      } else if (isFOM) {
        // For FOM: Verified means MMPs with sites available for verification
        return mmp.type === 'verified-template' || 
               normalizedStatus === 'verified' ||
               normalizedStatus === 'approved' ||
               hasVerifiedSites ||
               (workflow?.currentStage && ['permitsVerified', 'cpVerification', 'completed'].includes(workflow?.currentStage));
      } else {
        // For admin/ICT/DataTeam/Supervisor and others: full admin-style verified criteria
        // For admin/other roles: Include verified, approved, specific workflow stages, OR MMPs with verified sites
        // Also catch any MMP not already shown in New or Forwarded tabs so nothing is invisible
        const matchesVerifiedCriteria = normalizedStatus === 'verified' ||
               normalizedStatus === 'approved' || 
               mmp.type === 'verified-template' ||
               hasVerifiedSites ||
               (workflow?.currentStage && ['permitsVerified', 'cpVerification', 'completed'].includes(workflow?.currentStage));

        const notInOtherTabs = !newMMPIds.has(mmp.id) && !forwardedMMPIds.has(mmp.id);

        return matchesVerifiedCriteria || notInOtherTabs;
      }
    });

    return {
      new: newMMPs,
      forwarded: forwardedMMPs,
      verified: verifiedMMPs
    };
  }, [mmpFiles, isFOM, isSupervisor, isCoordinator, isDataTeam, currentUser, isAdminOrSuperUser, userProjectIds, canClaimSites, mmpIdsWithVerifiedSites, applyHubFilter, hubAccessInfo, supervisorHubMmpIds]);

  // Hub-scoped MMP list for the MMP Tracker tab.
  // Supervisors and coordinators should only see their hub's MMPs in the tracker; for all other roles pass mmpFiles as-is.
  const trackerMMPs = useMemo(() => {
    if (!applyHubFilter) return mmpFiles;
    const seen = new Set<string>();
    const combined: typeof mmpFiles = [];
    for (const arr of [categorizedMMPs.new, categorizedMMPs.forwarded, categorizedMMPs.verified]) {
      for (const mmp of arr) {
        if (!seen.has(mmp.id)) { seen.add(mmp.id); combined.push(mmp); }
      }
    }
    return combined;
  }, [isSupervisor, applyHubFilter, mmpFiles, categorizedMMPs]);

  // Load site entries for MMPs when tabs become active (ensures site data is synchronized)
  useEffect(() => {
    let mmpsToLoad: { id: string }[] = [];
    
    if (activeTab === 'verified') {
      mmpsToLoad = categorizedMMPs.verified || [];
    } else if (activeTab === 'forwarded') {
      mmpsToLoad = categorizedMMPs.forwarded || [];
    } else if (activeTab === 'new') {
      mmpsToLoad = categorizedMMPs.new || [];
    } else if (activeTab === 'tracker') {
      mmpsToLoad = trackerMMPs;
    }
    
    // Find MMPs that don't have site entries loaded yet
    const mmpsNeedingEntries = mmpsToLoad
      .filter(mmp => {
        const fullMmp = mmpFiles.find(m => m.id === mmp.id);
        return !fullMmp?.siteEntries || fullMmp.siteEntries.length === 0;
      })
      .map(mmp => mmp.id);
    
    if (mmpsNeedingEntries.length > 0) {
      loadSiteEntriesForMMPs(mmpsNeedingEntries);
    }
  }, [activeTab, categorizedMMPs.verified, categorizedMMPs.forwarded, categorizedMMPs.new, trackerMMPs, mmpFiles, loadSiteEntriesForMMPs]);

  // Forwarded subcategories for Admin/ICT view (Removed Rejected)
  const forwardedSubcategories = useMemo(() => {
    const base = categorizedMMPs.forwarded || [];
    // Pending: All forwarded MMPs that are not yet verified or approved
    const pending = base.filter(mmp => {
      const status = (mmp.status || '').toLowerCase();
      return status !== 'approved' && status !== 'verified' && status !== 'rejected';
    });
    // Verified: All forwarded MMPs that have been verified or approved
    const verified = base.filter(mmp => {
      const status = (mmp.status || '').toLowerCase();
      return status === 'approved' || status === 'verified';
    });
    return { pending, verified };
  }, [categorizedMMPs.forwarded]);

  // New MMP subcategories for FOM, Supervisor and Admin (Removed Rejected)
  const newFomSubcategories = useMemo(() => {
    if (!isFOM && !isSupervisor && !isAdmin && !isICT && !isDataTeam) return { pending: [], verified: [], returned: [] } as Record<string, typeof categorizedMMPs.new>;
    const base = categorizedMMPs.new || [];
    const pending = base.filter(mmp => {
      const status = (mmp.status || '').toLowerCase();
      return status !== 'approved' && status !== 'verified' && status !== 'rejected';
    });
    const verified = base.filter(mmp => {
      const status = (mmp.status || '').toLowerCase();
      return status === 'approved' || status === 'verified';
    });
    // Returned: Search mmpFiles for any MMP that has sites with 'returned_to_fom' status
    // Apply hub filter for supervisors so they only see returned sites from their hubs
    const allReturnedMMPs = mmpFiles.filter(mmp => 
      mmp.siteEntries?.some(site => {
        const siteStatus = (site.status || '').toLowerCase();
        return siteStatus === 'returned_to_fom';
      })
    );
    const returned = (applyHubFilter && hubAccessInfo.isHubSupervisor && hubAccessInfo.hubStates.length > 0)
      ? allReturnedMMPs.map(mmp => {
          const hubFilteredEntries = filterByHubAccess(mmp.siteEntries || [], hubAccessInfo)
            .filter(s => (s.status || '').toLowerCase() === 'returned_to_fom');
          if (hubFilteredEntries.length === 0) return null;
          return { ...mmp, siteEntries: hubFilteredEntries };
        }).filter((mmp): mmp is NonNullable<typeof mmp> => mmp !== null)
      : allReturnedMMPs;
    return { pending, verified, returned };
  }, [isFOM, isSupervisor, isAdmin, isICT, isDataTeam, categorizedMMPs.new, mmpFiles, applyHubFilter, hubAccessInfo]);

  // Returned sites grouped by state for FOM/Supervisor view
  // Hub supervisors only see returned sites from their assigned hub states
  const returnedSitesByState = useMemo(() => {
    const allReturnedSites = mmpFiles.flatMap(mmp => {
      let siteEntries = mmp.siteEntries || [];
      // Apply hub filter so supervisors only see sites in their hub(s)
      if (applyHubFilter && hubAccessInfo.isHubSupervisor && hubAccessInfo.hubStates.length > 0) {
        siteEntries = filterByHubAccess(siteEntries, hubAccessInfo);
      }
      return siteEntries
        .filter(site => (site.status || '').toLowerCase() === 'returned_to_fom')
        .map(site => ({ ...site, mmp_file_id: mmp.id, mmpName: mmp.name }));
    });
    
    // Group by state
    const grouped: Record<string, { state: string; sites: any[]; totalSites: number }> = {};
    allReturnedSites.forEach(site => {
      const state = site.state || 'Unknown';
      if (!grouped[state]) {
        grouped[state] = { state, sites: [], totalSites: 0 };
      }
      grouped[state].sites.push(site);
      grouped[state].totalSites++;
    });
    
    return Object.values(grouped);
  }, [mmpFiles, applyHubFilter, hubAccessInfo]);

  // Same data grouped by MMP name (month) for the "By Month" view
  const returnedSitesByMmp = useMemo(() => {
    const allReturnedSites = mmpFiles.flatMap(mmp => {
      let siteEntries = mmp.siteEntries || [];
      if (applyHubFilter && hubAccessInfo.isHubSupervisor && hubAccessInfo.hubStates.length > 0) {
        siteEntries = filterByHubAccess(siteEntries, hubAccessInfo);
      }
      return siteEntries
        .filter(site => (site.status || '').toLowerCase() === 'returned_to_fom')
        .map(site => ({ ...site, mmp_file_id: mmp.id, mmpName: mmp.name }));
    });

    const grouped: Record<string, { mmpName: string; mmpFileId: string; sites: any[]; totalSites: number }> = {};
    allReturnedSites.forEach(site => {
      const key = site.mmpName || 'Unknown MMP';
      if (!grouped[key]) {
        grouped[key] = { mmpName: key, mmpFileId: site.mmp_file_id, sites: [], totalSites: 0 };
      }
      grouped[key].sites.push(site);
      grouped[key].totalSites++;
    });

    return Object.values(grouped).sort((a, b) => a.mmpName.localeCompare(b.mmpName));
  }, [mmpFiles, applyHubFilter, hubAccessInfo]);

  // Load down-payment-linked site info once for use across all badge/count computations
  useEffect(() => {
    const loadDpLinkedSites = async () => {
      const { data: dpReqs } = await supabase
        .from('down_payment_requests')
        .select('mmp_site_entry_id, site_name')
        .in('status', ['approved', 'partially_paid', 'fully_paid', 'pending_admin', 'pending_supervisor']);
      
      const ids = new Set<string>();
      const names = new Set<string>();
      (dpReqs || []).forEach((dp: any) => {
        if (dp.mmp_site_entry_id) ids.add(dp.mmp_site_entry_id);
        if (dp.site_name) names.add(dp.site_name.toLowerCase());
      });
      setDpLinkedEntryIds(ids);
      setDpLinkedSiteNames(names);
    };
    loadDpLinkedSites();
  }, [adminRefreshTrigger]);

  // Calculate all counts from context using useMemo (for global stats, not specific to Verified Sites tab)
  const siteEntryCounts = useMemo(() => {
    const allEntries = mmpFiles.flatMap(mmp => {
      const entries = mmp.siteEntries || [];
      return entries.map(entry => ({
        ...entry,
        mmp_file_id: mmp.id,
        mmpId: mmp.id
      }));
    });
    
    return {
      dispatched: allEntries.filter(e => {
        const status = String(e.status || '').toLowerCase();
        const acceptedBy = (e as any).accepted_by;
        return status === 'dispatched' && !acceptedBy;
      }).length,
      accepted: allEntries.filter(e => {
        const status = String(e.status || '').toLowerCase();
        return status === 'accepted';
      }).length,
      smartAssigned: allEntries.filter(e => {
        const status = String(e.status || '').toLowerCase();
        return status === 'assigned';
      }).length,
      ongoing: allEntries.filter(e => {
        const status = String(e.status || '').toLowerCase();
        return /inprogress|in_progress|ongoing/.test(status);
      }).length,
      completed: allEntries.filter(e => {
        const status = String(e.status || '').toLowerCase();
        return status === 'completed' || status === 'submitted' || status === 'wfp_confirmed' || status === 'not_covered';
      }).length,
      rejected: allEntries.filter(e => {
        const status = String(e.status || '').toLowerCase();
        return status === 'rejected' || status === 'declined';
      }).length,
      approvedCosted: allEntries.filter(e => {
        const status = String(e.status || '').toLowerCase();
        return status === 'approved and costed' || status === 'costed';
      }).length
    };
  }, [mmpFiles, dpLinkedEntryIds, dpLinkedSiteNames]);

  // Update count state from context (fast counts loaded separately from site entries)
  useEffect(() => {
    setDispatchedCount(contextCounts.dispatched);
    setAcceptedCount(contextCounts.accepted);
    setSmartAssignedCount(contextCounts.smartAssigned);
    setOngoingCount(contextCounts.ongoing);
    setCompletedCount(contextCounts.completed);
    setRejectedCount(contextCounts.rejected);
    setApprovedCostedCount(contextCounts.approvedCosted);
  }, [contextCounts]);

  // Helper function to format site entries for display
  const formatSiteEntry = useCallback((entry: any) => {
    const additionalData = entry.additional_data || entry.additionalData || {};
    const enumeratorFee = entry.enumerator_fee;
    const transportFee = entry.transport_fee;
    return {
      ...entry,
      siteName: entry.site_name || entry.siteName,
      siteCode: entry.site_code || entry.siteCode,
      hubOffice: entry.hub_office || entry.hubOffice,
      cpName: entry.cp_name || entry.cpName,
      siteActivity: entry.activity_at_site || entry.siteActivity,
      monitoringBy: entry.monitoring_by || entry.monitoringBy,
      surveyTool: entry.survey_tool || entry.surveyTool,
      useMarketDiversion: entry.use_market_diversion ?? entry.useMarketDiversion,
      useWarehouseMonitoring: entry.use_warehouse_monitoring ?? entry.useWarehouseMonitoring,
      visitDate: entry.visit_date || entry.visitDate,
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
      claimed_by: additionalData.claimed_by || null,
      claimed_at: additionalData.claimed_at || null,
      cost_acknowledged: entry.cost_acknowledged ?? additionalData.cost_acknowledged,
      updated_at: entry.updated_at,
      additionalData: additionalData,
      mmp_file_id: entry.mmp_file_id || entry.mmpId,
      mmpId: entry.mmp_file_id || entry.mmpId
    };
  }, []);

  // Extract all site entries from MMP context
  const allSiteEntries = useMemo(() => {
    return mmpFiles.flatMap(mmp => {
      const entries = mmp.siteEntries || [];
      return entries.map(entry => ({
        ...entry,
        mmp_file_id: mmp.id,
        mmpId: mmp.id
      }));
    });
  }, [mmpFiles]);

  // Create a stable set of verified MMP IDs to avoid reference changes
  const verifiedMMPIds = useMemo(() => {
    const verifiedMMPs = categorizedMMPs.verified || [];
    return new Set(verifiedMMPs.map(mmp => mmp.id));
  }, [categorizedMMPs]);

  // Extract site entries ONLY from verified MMPs (for Verified Sites tab)
  // Uses categorizedMMPs.verified which already has hub filtering applied for supervisors
  const verifiedSiteEntries = useMemo(() => {
    const verifiedMMPs = categorizedMMPs.verified || [];
    return verifiedMMPs.flatMap(mmp => {
      const entries = mmp.siteEntries || [];
      return entries.map(entry => ({
        ...entry,
        mmp_file_id: mmp.id,
        mmpId: mmp.id
      }));
    });
  }, [categorizedMMPs.verified]);

  const mmpFilterOptions = useMemo(() => {
    const verifiedMMPs = categorizedMMPs.verified || [];
    return verifiedMMPs.map(mmp => ({
      id: mmp.id,
      label: mmp.name || mmp.id.substring(0, 8),
      uploadDate: mmp.uploadedAt || '',
      siteCount: (mmp.siteEntries || []).length
    })).sort((a, b) => (b.uploadDate || '').localeCompare(a.uploadDate || ''));
  }, [categorizedMMPs.verified]);

  // Memoized filter options for dispatched site entries
  const dispatchedFilterOptions = useMemo(() => {
    const states = new Set<string>();
    const localitiesByState: Record<string, Set<string>> = {};
    
    dispatchedSiteEntries.forEach(entry => {
      const state = entry.state || entry.stateName || '';
      const locality = entry.locality || entry.localityName || '';
      
      if (state) {
        states.add(state);
        if (!localitiesByState[state]) {
          localitiesByState[state] = new Set();
        }
        if (locality) {
          localitiesByState[state].add(locality);
        }
      }
    });
    
    return {
      states: Array.from(states).sort(),
      localitiesByState: Object.fromEntries(
        Object.entries(localitiesByState).map(([state, locs]) => [state, Array.from(locs).sort()])
      )
    };
  }, [dispatchedSiteEntries]);

  // Global site entry filter options (for all tabs)
  const globalSiteFilterOptions = useMemo(() => {
    const statuses = new Set<string>();
    const hubs = new Set<string>();
    const states = new Set<string>();
    const localitiesByState: Record<string, Set<string>> = {};
    const statesByHub: Record<string, Set<string>> = {};
    
    verifiedSiteEntries.forEach(entry => {
      const e = entry as any;
      const status = e.status || '';
      const hub = e.hubOffice || e.hub_office || e.hub || e.hubName || '';
      const state = e.state || e.stateName || '';
      const locality = e.locality || e.localityName || '';
      
      if (status) statuses.add(status);
      if (hub) {
        hubs.add(hub);
        if (!statesByHub[hub]) {
          statesByHub[hub] = new Set();
        }
        if (state) {
          statesByHub[hub].add(state);
        }
      }
      if (state) {
        states.add(state);
        if (!localitiesByState[state]) {
          localitiesByState[state] = new Set();
        }
        if (locality) {
          localitiesByState[state].add(locality);
        }
      }
    });
    
    return {
      statuses: Array.from(statuses).sort(),
      hubs: Array.from(hubs).sort(),
      states: Array.from(states).sort(),
      localitiesByState: Object.fromEntries(
        Object.entries(localitiesByState).map(([state, locs]) => [state, Array.from(locs).sort()])
      ),
      statesByHub: Object.fromEntries(
        Object.entries(statesByHub).map(([hub, sts]) => [hub, Array.from(sts).sort()])
      )
    };
  }, [verifiedSiteEntries]);

  // Apply global filters to get filtered states and localities
  const filteredStatesForDropdown = useMemo(() => {
    if (siteHubFilter === 'all') {
      return globalSiteFilterOptions.states;
    }
    return globalSiteFilterOptions.statesByHub[siteHubFilter] || [];
  }, [siteHubFilter, globalSiteFilterOptions]);

  const filteredLocalitiesForDropdown = useMemo(() => {
    if (siteStateFilter === 'all') {
      return [];
    }
    return globalSiteFilterOptions.localitiesByState[siteStateFilter] || [];
  }, [siteStateFilter, globalSiteFilterOptions]);

  const applyGlobalFilters = useCallback((entries: any[]) => {
    let filtered = entries;
    
    if (siteMmpFilter !== 'all') {
      filtered = filtered.filter(entry => {
        const entryMmpId = entry.mmp_file_id || entry.mmpId || '';
        return entryMmpId === siteMmpFilter;
      });
    }
    
    if (siteStatusFilter !== 'all') {
      filtered = filtered.filter(entry => {
        const status = entry.status || '';
        return status.toLowerCase() === siteStatusFilter.toLowerCase();
      });
    }
    
    if (siteHubFilter !== 'all') {
      filtered = filtered.filter(entry => {
        const hub = entry.hubOffice || entry.hub_office || entry.hub || entry.hubName || '';
        return hub === siteHubFilter;
      });
    }
    
    if (siteStateFilter !== 'all') {
      filtered = filtered.filter(entry => {
        const state = entry.state || entry.stateName || '';
        return state === siteStateFilter;
      });
    }
    
    if (siteLocalityFilter !== 'all') {
      filtered = filtered.filter(entry => {
        const locality = entry.locality || entry.localityName || '';
        return locality === siteLocalityFilter;
      });
    }
    
    return filtered;
  }, [siteStatusFilter, siteHubFilter, siteStateFilter, siteLocalityFilter, siteMmpFilter]);

  // Check if global filters are active (moved before globalFilteredDispatchedEntries which depends on it)
  const hasActiveGlobalFilters = useMemo(() => {
    return siteStatusFilter !== 'all' || siteHubFilter !== 'all' || siteStateFilter !== 'all' || siteLocalityFilter !== 'all' || siteMmpFilter !== 'all';
  }, [siteStatusFilter, siteHubFilter, siteStateFilter, siteLocalityFilter, siteMmpFilter]);

  // Filtered dispatched entries based on state/locality selection
  const globalFilteredDispatchedEntries = useMemo(() => {
    if (!hasActiveGlobalFilters) return dispatchedSiteEntries;
    return dispatchedSiteEntries.filter(entry => {
      if (siteMmpFilter !== 'all') {
        const entryMmpId = entry.mmpId || entry.mmp_file_id || '';
        if (entryMmpId !== siteMmpFilter) return false;
      }
      if (siteStatusFilter !== 'all') {
        const status = entry.status || '';
        if (status.toLowerCase() !== siteStatusFilter.toLowerCase()) return false;
      }
      if (siteHubFilter !== 'all') {
        const hub = entry.hub || entry.hubName || entry.hubOffice || entry.hub_office || '';
        if (hub !== siteHubFilter) return false;
      }
      if (siteStateFilter !== 'all') {
        const state = entry.state || entry.stateName || '';
        if (state !== siteStateFilter) return false;
      }
      if (siteLocalityFilter !== 'all') {
        const locality = entry.locality || entry.localityName || '';
        if (locality !== siteLocalityFilter) return false;
      }
      return true;
    });
  }, [dispatchedSiteEntries, hasActiveGlobalFilters, siteMmpFilter, siteStatusFilter, siteHubFilter, siteStateFilter, siteLocalityFilter]);

  const filteredDispatchedEntries = useMemo(() => {
    let filtered = globalFilteredDispatchedEntries;
    
    if (dispatchedStateFilter !== 'all') {
      filtered = filtered.filter(entry => {
        const state = entry.state || entry.stateName || '';
        return state === dispatchedStateFilter;
      });
    }
    
    if (dispatchedLocalityFilter !== 'all') {
      filtered = filtered.filter(entry => {
        const locality = entry.locality || entry.localityName || '';
        return locality === dispatchedLocalityFilter;
      });
    }
    
    return filtered;
  }, [globalFilteredDispatchedEntries, dispatchedStateFilter, dispatchedLocalityFilter]);

  // Note: verifiedTabSiteEntryCounts is now derived from precomputedSubcategorySites
  // which is calculated after buildSiteRowsFromMMPs is defined (around line 2736)

  // Derive enumerator data from context (Available Sites, Smart Assigned, My Sites)
  const enumeratorData = useMemo(() => {
    if (!canClaimSites || !currentUser?.id) {
      return {
        availableSites: [],
        smartAssigned: [],
        mySites: [],
        groupedByStateLocality: {},
        loading: false
      };
    }

    // Convert collector's stateId/localityId to names for matching using siteNormalization
    const collectorStateName = getStateName(currentUser.stateId) || undefined;
    const normalizedCollectorStateId = normalizeStateId(currentUser.stateId);
    const collectorLocalityName = normalizedCollectorStateId && currentUser.localityId
      ? sudanStates.find(s => s.id === normalizedCollectorStateId)
          ?.localities.find(l => l.id === currentUser.localityId)?.name
      : undefined;

    // Format all entries
    const formattedEntries = allSiteEntries.map(formatSiteEntry);

    // Debug: Log what we have for filtering
    const dispatchedEntries = formattedEntries.filter(e => String(e.status || '').toLowerCase() === 'dispatched');
    console.log(`📊 [EnumeratorData Debug] Total entries: ${formattedEntries.length}, Dispatched: ${dispatchedEntries.length}, Collector State: "${collectorStateName}"`);
    if (dispatchedEntries.length > 0) {
      console.log(`📊 [EnumeratorData Debug] Sample dispatched entry states:`, dispatchedEntries.slice(0, 3).map(e => ({ state: e.state, status: e.status, accepted_by: e.accepted_by })));
    }

    // Filter available sites: status = "Dispatched", accepted_by = null, in collector's STATE
    // Users can see all dispatched sites within their assigned state (not restricted to locality)
    // Also calculate total cost (enumerator fee + transport fee) for display
    const availableSites = formattedEntries.filter(entry => {
      const status = String(entry.status || '').toLowerCase();
      if (status !== 'dispatched') return false;
      if (entry.accepted_by) return false; // Must be unclaimed

      // Filter by STATE only - users can claim any site in their state
      // Use getStateName() for normalized comparison (handles aliases like Gedaref/Gedarif)
      if (collectorStateName) {
        const normalizedEntryState = getStateName(entry.state);
        const matches = normalizedEntryState.toLowerCase() === collectorStateName.toLowerCase();
        if (!matches && dispatchedEntries.length > 0) {
          console.log(`📊 [State Mismatch] Entry state: "${entry.state}" (normalized: "${normalizedEntryState}") vs Collector state: "${collectorStateName}"`);
        }
        return matches;
      }
      return false; // No state assigned = no sites
    }).map(entry => {
      // Calculate total cost using viewer's enumerator fee
      const transportFee = Number(entry.transport_fee) || 0;
      const totalCost = viewerEnumeratorFee + transportFee;
      return {
        ...entry,
        enumerator_fee: entry.enumerator_fee || viewerEnumeratorFee,
        cost: totalCost
      };
    }).sort((a, b) => {
      // Sort by created_at descending
      const aDate = a.created_at || a.createdAt || '';
      const bDate = b.created_at || b.createdAt || '';
      return bDate.localeCompare(aDate);
    }).slice(0, 1000); // Limit to 1000

    // Filter smart assigned: status = "Assigned", accepted_by = currentUser.id, not cost-acknowledged
    // Also calculate total cost for display
    const smartAssigned = formattedEntries.filter(entry => {
      const status = String(entry.status || '').toLowerCase();
      if (status !== 'assigned') return false;
      if (entry.accepted_by !== currentUser.id) return false;
      return !entry.cost_acknowledged; // Exclude cost-acknowledged sites
    }).map(entry => {
      // Calculate total cost using viewer's enumerator fee
      const transportFee = Number(entry.transport_fee) || 0;
      const totalCost = viewerEnumeratorFee + transportFee;
      return {
        ...entry,
        enumerator_fee: entry.enumerator_fee || viewerEnumeratorFee,
        cost: totalCost
      };
    }).sort((a, b) => {
      const aDate = a.created_at || a.createdAt || '';
      const bDate = b.created_at || b.createdAt || '';
      return bDate.localeCompare(aDate);
    }).slice(0, 1000);

    // Filter my sites: accepted_by = currentUser.id, excluding pre-claim statuses
    // The claim_site_visit RPC sets accepted_by = user UUID when claiming.
    const preClaimStatusSet = new Set(['approved and costed', 'costed', 'dispatched', 'verified', 'approved', 'pending', 'rejected']);
    const mySites = formattedEntries.filter(entry => {
      if (entry.accepted_by !== currentUser.id) return false;
      const status = (entry.status || '').trim().toLowerCase();
      if (preClaimStatusSet.has(status)) return false;
      return true;
    }).sort((a, b) => {
      const aDate = a.created_at || a.createdAt || '';
      const bDate = b.created_at || b.createdAt || '';
      return bDate.localeCompare(aDate);
    }).slice(0, 1000);

    // Group available sites by state and locality combined
    const groupedByStateLocality = availableSites.reduce((acc, entry) => {
      const state = entry.state || 'Unknown State';
      const locality = entry.locality || 'Unknown Locality';
      const key = `${state} - ${locality}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(entry);
      return acc;
    }, {} as Record<string, any[]>);

    // Build deduplicated union for "My Sites" (prefer smartAssigned entries first)
    const mySitesDeduplicated = (() => {
      const byId = new Map<string, any>();
      smartAssigned.forEach((e: any) => {
        if (e && e.id) byId.set(String(e.id), e);
      });
      mySites.forEach((e: any) => {
        if (!e) return;
        const key = e.id ? String(e.id) : `${e.mmp_file_id || e.mmpId}-${e.site_code || e.siteCode || ''}`;
        if (!byId.has(key)) byId.set(key, e);
      });
      return Array.from(byId.values());
    })();

    return {
      availableSites,
      smartAssigned,
      mySites: mySitesDeduplicated,
      groupedByStateLocality,
      loading: loading
    };
  }, [allSiteEntries, canClaimSites, currentUser?.id, currentUser?.stateId, currentUser?.localityId, formatSiteEntry, loading, viewerEnumeratorFee]);

  // Load unsynced completed visits from offline DB
  useEffect(() => {
    const loadUnsyncedCompletedVisits = async () => {
      if (!canClaimSites || !currentUser?.id) {
        setUnsyncedCompletedVisits([]);
        return;
      }

      try {
        const { getUnsyncedSiteVisits } = await import('@/lib/offline-db');
        const unsyncedVisits = await getUnsyncedSiteVisits();
        
        // Filter for completed visits only and map to site entry format
        const completedUnsynced = unsyncedVisits
          .filter(v => v.status === 'completed' && !v.synced)
          .map(visit => ({
            id: visit.siteEntryId,
            siteEntryId: visit.siteEntryId,
            siteName: visit.siteName,
            siteCode: visit.siteCode,
            state: visit.state,
            locality: visit.locality,
            status: 'Completed',
            completedAt: visit.completedAt,
            accepted_by: currentUser.id, // Assume it's for current user
            additionalData: {
              offline_completed: true,
              offline_sync_pending: true,
              completed_at_offline: visit.completedAt,
              notes: visit.notes
            },
            _isOfflineVisit: true
          }));

        setUnsyncedCompletedVisits(completedUnsynced);
      } catch (error) {
        console.error('Failed to load unsynced completed visits:', error);
        setUnsyncedCompletedVisits([]);
      }
    };

    loadUnsyncedCompletedVisits();
    
    // Also reload when online status changes (to catch synced items)
    const handleOnline = () => {
      setTimeout(loadUnsyncedCompletedVisits, 2000); // Wait a bit for sync to complete
    };
    
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [canClaimSites, currentUser?.id]);

  useEffect(() => {
    // If DB has already loaded fresh dispatched data, do NOT overwrite with stale context data.
    // The direct DB query (loadDispatchedSitesForEnumerator) filters by actual DB status/accepted_by,
    // while context data may still include claimed sites that haven't been refreshed.
    if (!enumeratorDbLoadedRef.current) {
      if (enumeratorData.availableSites.length > 0) {
        setEnumeratorSiteEntries(enumeratorData.availableSites);
        setEnumeratorGroupedByStates(enumeratorData.groupedByStateLocality);
      }
    }
    setEnumeratorGroupedByLocality({});
    setEnumeratorSmartAssigned(enumeratorData.smartAssigned);
    // Merge My Sites: DB-loaded rows take priority over context-derived rows
    setEnumeratorMySites(prev => {
      if (prev.length === 0 && enumeratorData.mySites.length === 0) return prev;
      const byId = new Map<string, any>();
      prev.forEach(e => { if (e?.id) byId.set(String(e.id), e); });
      enumeratorData.mySites.forEach((e: any) => { if (e?.id && !byId.has(String(e.id))) byId.set(String(e.id), e); });
      const merged = Array.from(byId.values());
      if (merged.length === prev.length && prev.every(e => byId.has(String(e.id)))) return prev;
      return merged;
    });
  }, [enumeratorData]);

  // Load smart assigned site entries only when the tab is active
  // Uses verifiedSiteEntries (only from verified MMPs) for consistency
  useEffect(() => {
    if (verifiedSubTab !== 'smartAssigned') {
      setSmartAssignedSiteEntries([]);
      setLoadingSmartAssigned(false);
      return;
    }

    // Using in-memory data only, no async loading
    setLoadingSmartAssigned(false);

    const formattedEntries = verifiedSiteEntries
      .map(formatSiteEntry)
      .filter(entry => {
        const status = String(entry.status || '').toLowerCase();
        if (status !== 'assigned') return false;
        const hasAcceptedBy = entry.accepted_by;
        if (hasAcceptedBy) return false;
        const ad = entry.additional_data || entry.additionalData || {};
        const hasAssignedTo = ad.assigned_to || ad.smart_assigned_to || (entry as any).assigned_to || (entry as any).smart_assigned_to;
        return !!hasAssignedTo;
      })
      .sort((a, b) => {
        const aDate =
          (a as any).created_at ||
          (a as any).createdAt ||
          '';
        const bDate =
          (b as any).created_at ||
          (b as any).createdAt ||
          '';
        return bDate.localeCompare(aDate);
      });

    setSmartAssignedSiteEntries(formattedEntries);
    setSmartAssignedCount(formattedEntries.length);
  }, [verifiedSubTab, verifiedSiteEntries, formatSiteEntry]);

  // Load approved and costed site entries directly from database for fresh data
  useEffect(() => {
      if (verifiedSubTab !== 'approvedCosted') {
        // Keep cached data — don't clear it so switching back is instant.
        setLoadingApprovedCosted(false);
        return;
      }

      const verifiedMmpIdsSorted = (categorizedMMPs.verified || []).map(m => m.id).sort().join(',');
      const fetchKey = `${adminRefreshTrigger}::${verifiedMmpIdsSorted}`;
      // Skip fetch if same data already loaded — avoids refetch on every tab switch.
      if (approvedCostedLoadedKeyRef.current === fetchKey) {
        setLoadingApprovedCosted(false);
        return;
      }

      let cancelled = false;
      const loadApprovedCostedFromDB = async () => {
        setLoadingApprovedCosted(true);
        try {
          const verifiedMmpIds = (categorizedMMPs.verified || []).map(mmp => mmp.id);
          if (verifiedMmpIds.length === 0) {
            setApprovedCostedSiteEntries([]);
            setApprovedCostedCount(0);
            setLoadingApprovedCosted(false);
            return;
          }

          const selectColumns = 'id, site_code, hub_office, state, locality, site_name, cp_name, visit_type, visit_date, main_activity, activity_at_site, monitoring_by, survey_tool, use_market_diversion, use_warehouse_monitoring, comments, cost, enumerator_fee, transport_fee, dispatched_by, dispatched_at, accepted_by, accepted_at, additional_data, status, mmp_file_id, created_at, verified_by, verified_at, updated_at';
          const batchSize = 100;

          const batchPromises = [];
          for (let i = 0; i < verifiedMmpIds.length; i += batchSize) {
            const batch = verifiedMmpIds.slice(i, i + batchSize);
            batchPromises.push(
              supabase
                .from('mmp_site_entries')
                .select(selectColumns)
                .in('mmp_file_id', batch)
                .in('status', [
                  'costed', 'Costed',
                  'approved and costed', 'Approved and Costed', 'Approved And Costed',
                  'approved', 'Approved'
                ])
                .order('created_at', { ascending: false })
                .limit(2000)
            );
          }

          const results = await Promise.all(batchPromises);
          if (cancelled) return;

          let allEntries: any[] = [];
          for (const result of results) {
            if (result.error) {
              console.error('[ApprovedCosted] DB query error:', result.error);
              continue;
            }
            if (result.data) allEntries = allEntries.concat(result.data);
          }

          const mmpLookup = new Map(mmpFiles.map(m => [m.id, m.name || '']));
          const formattedEntries = allEntries.map(entry => {
            const formatted = formatSiteEntry(entry);
            return {
              ...formatted,
              mmp_file_id: entry.mmp_file_id,
              mmpId: entry.mmp_file_id,
              mmpName: mmpLookup.get(entry.mmp_file_id) || '',
            };
          });

          if (!cancelled) {
            setApprovedCostedSiteEntries(formattedEntries);
            setApprovedCostedCount(formattedEntries.length);
            approvedCostedLoadedKeyRef.current = fetchKey;
          }
        } catch (err) {
          console.error('[ApprovedCosted] Failed to load:', err);
        } finally {
          if (!cancelled) setLoadingApprovedCosted(false);
        }
      };

      loadApprovedCostedFromDB();
      return () => { cancelled = true; };
  }, [verifiedSubTab, categorizedMMPs.verified, adminRefreshTrigger, formatSiteEntry]);

  
  // Load dispatched site entries directly from database for fresh data
  // This ensures sites claimed by data collectors are immediately excluded
  useEffect(() => {
    if (verifiedSubTab !== 'dispatched') {
      // Keep cached data — don't clear it so switching back is instant.
      setLoadingDispatched(false);
      return;
    }

    const verifiedMmpIdsSorted = (categorizedMMPs.verified || []).map(m => m.id).sort().join(',');
    const fetchKey = `${adminRefreshTrigger}::${verifiedMmpIdsSorted}`;
    // Skip fetch if same data already loaded — avoids refetch on every tab switch.
    if (dispatchedLoadedKeyRef.current === fetchKey) {
      setLoadingDispatched(false);
      return;
    }

    let cancelled = false;
    const loadDispatchedFromDB = async () => {
      setLoadingDispatched(true);
      
      try {
        const verifiedMmpIds = (categorizedMMPs.verified || []).map(mmp => mmp.id);
        if (verifiedMmpIds.length === 0) {
          setDispatchedSiteEntries([]);
          setDispatchedCount(0);
          setLoadingDispatched(false);
          return;
        }

        const selectColumns = 'id, site_code, hub_office, state, locality, site_name, cp_name, visit_type, visit_date, main_activity, activity_at_site, monitoring_by, survey_tool, use_market_diversion, use_warehouse_monitoring, comments, cost, enumerator_fee, transport_fee, dispatched_by, dispatched_at, accepted_by, accepted_at, additional_data, status, mmp_file_id, created_at, verified_by, verified_at, updated_at';
        const batchSize = 100;

        const batchPromises = [];
        for (let i = 0; i < verifiedMmpIds.length; i += batchSize) {
          const batch = verifiedMmpIds.slice(i, i + batchSize);
          batchPromises.push(
            supabase
              .from('mmp_site_entries')
              .select(selectColumns)
              .in('mmp_file_id', batch)
              .in('status', ['dispatched', 'Dispatched'])
              .is('accepted_by', null)
              .order('dispatched_at', { ascending: false })
              .limit(2000)
          );
        }

        const results = await Promise.all(batchPromises);
        if (cancelled) return;

        let allEntries: any[] = [];
        for (const result of results) {
          if (result.error) {
            console.error('[Dispatched] DB query error:', result.error);
            continue;
          }
          if (result.data) allEntries = allEntries.concat(result.data);
        }

        const mmpLookup = new Map(mmpFiles.map(m => [m.id, m.name || '']));
        const formattedEntries = allEntries.map(entry => {
          const formatted = formatSiteEntry(entry);
          return {
            ...formatted,
            mmp_file_id: entry.mmp_file_id,
            mmpId: entry.mmp_file_id,
            mmpName: mmpLookup.get(entry.mmp_file_id) || '',
          };
        });

        if (!cancelled) {
          setDispatchedSiteEntries(formattedEntries);
          setDispatchedCount(formattedEntries.length);
          dispatchedLoadedKeyRef.current = fetchKey;
        }
      } catch (err) {
        console.error('[Dispatched] Failed to load:', err);
      } finally {
        if (!cancelled) setLoadingDispatched(false);
      }
    };
    
    loadDispatchedFromDB();
    return () => { cancelled = true; };
  }, [verifiedSubTab, categorizedMMPs.verified, adminRefreshTrigger]);

  // Load accepted site entries directly from database for fresh data
  useEffect(() => {
      if (verifiedSubTab !== 'accepted') {
        // Keep cached data — don't clear it so switching back is instant.
        setLoadingAccepted(false);
        return;
      }

      const verifiedMmpIdsSorted = (categorizedMMPs.verified || []).map(m => m.id).sort().join(',');
      const fetchKey = `${adminRefreshTrigger}::${verifiedMmpIdsSorted}`;
      // Skip fetch if same data already loaded — avoids refetch on every tab switch.
      if (acceptedLoadedKeyRef.current === fetchKey) {
        setLoadingAccepted(false);
        return;
      }

      let cancelled = false;
      const acceptedStatuses = ['accepted', 'Accepted', 'claimed', 'Claimed', 'dispatched', 'Dispatched', 'ongoing', 'Ongoing', 'in progress', 'In Progress', 'in_progress', 'assigned', 'Assigned'];
      const selectColumns = 'id, site_code, hub_office, state, locality, site_name, cp_name, visit_type, visit_date, main_activity, activity_at_site, monitoring_by, survey_tool, use_market_diversion, use_warehouse_monitoring, comments, cost, enumerator_fee, transport_fee, dispatched_by, dispatched_at, accepted_by, accepted_at, additional_data, status, mmp_file_id, created_at, verified_by, verified_at, updated_at';

      const loadAcceptedFromDB = async () => {
        setLoadingAccepted(true);
        try {
          const verifiedMmpIds = (categorizedMMPs.verified || []).map(mmp => mmp.id);
          if (verifiedMmpIds.length === 0) {
            setAcceptedSiteEntries([]);
            setAcceptedCount(0);
            setLoadingAccepted(false);
            return;
          }

          const batchSize = 100;
          const batchPromises = [];
          for (let i = 0; i < verifiedMmpIds.length; i += batchSize) {
            const batch = verifiedMmpIds.slice(i, i + batchSize);
            batchPromises.push(
              supabase
                .from('mmp_site_entries')
                .select(selectColumns)
                .in('mmp_file_id', batch)
                .not('accepted_by', 'is', null)
                .in('status', acceptedStatuses)
                .order('accepted_at', { ascending: false })
                .limit(2000)
            );
          }

          const [batchResults, dpResult] = await Promise.all([
            Promise.all(batchPromises),
            supabase
              .from('down_payment_requests')
              .select('mmp_site_entry_id, requested_by, site_name, requested_amount, total_transportation_budget')
              .in('status', ['approved', 'partially_paid', 'fully_paid', 'pending_admin', 'pending_supervisor'])
          ]);

          if (cancelled) return;

          let allDbEntries: any[] = [];
          for (const result of batchResults) {
            if (result.error) {
              console.error('[Accepted] DB query error:', result.error);
              continue;
            }
            if (result.data) allDbEntries = allDbEntries.concat(result.data);
          }

          const dpRequests = dpResult.data;
          if (dpResult.error) {
            console.error('[Accepted] Down payment query error:', dpResult.error);
          }

          const acceptedIds = new Set(allDbEntries.map(e => e.id));
          let dpSiteEntries: any[] = [];

          if (dpRequests && dpRequests.length > 0) {
            const withEntryId = dpRequests.filter((dp: any) => dp.mmp_site_entry_id && !acceptedIds.has(dp.mmp_site_entry_id));
            const withoutEntryId = dpRequests.filter((dp: any) => !dp.mmp_site_entry_id && dp.site_name);

            if (withEntryId.length > 0) {
              const uniqueDpIds = [...new Set(withEntryId.map((dp: any) => dp.mmp_site_entry_id))];
              const { data: dpEntries } = await supabase
                .from('mmp_site_entries')
                .select(selectColumns)
                .in('id', uniqueDpIds)
                .in('mmp_file_id', verifiedMmpIds)
                .in('status', acceptedStatuses)
                .limit(2000);

              if (dpEntries) {
                const dpRequestMap = new Map<string, any>();
                withEntryId.forEach((dp: any) => {
                  if (dp.mmp_site_entry_id) dpRequestMap.set(dp.mmp_site_entry_id, dp);
                });
                dpSiteEntries.push(...dpEntries.map(entry => {
                  const dpReq = dpRequestMap.get(entry.id);
                  const hasCost = (entry.enumerator_fee != null && entry.transport_fee != null) || entry.cost != null;
                  const dpAmount = dpReq?.requested_amount || dpReq?.total_transportation_budget;
                  return {
                    ...entry,
                    accepted_by: entry.accepted_by || dpReq?.requested_by,
                    cost: hasCost ? (entry.cost || (Number(entry.enumerator_fee || 0) + Number(entry.transport_fee || 0))) : (dpAmount ? Number(dpAmount) : entry.cost),
                    enumerator_fee: entry.enumerator_fee != null ? entry.enumerator_fee : (dpAmount ? Number(dpAmount) : null),
                    transport_fee: entry.transport_fee != null ? entry.transport_fee : 0,
                    _from_down_payment: true
                  };
                }));
              }
            }

            if (withoutEntryId.length > 0) {
              const siteNames = [...new Set(withoutEntryId.map((dp: any) => dp.site_name).filter(Boolean))];
              const nameToRequest = new Map<string, any>();
              withoutEntryId.forEach((dp: any) => {
                if (dp.site_name) nameToRequest.set(dp.site_name.toLowerCase(), dp);
              });

              const alreadyFoundIds = new Set([...acceptedIds, ...dpSiteEntries.map(e => e.id)]);
              for (let i = 0; i < siteNames.length; i += 50) {
                if (cancelled) return;
                const batch = siteNames.slice(i, i + 50);
                let nameMatches: any[] = [];
                for (let _mf = 0; ; _mf += 1000) {
                  const { data: _mp } = await supabase.from('mmp_site_entries').select(selectColumns).in('mmp_file_id', verifiedMmpIds).in('site_name', batch).in('status', acceptedStatuses).range(_mf, _mf + 999);
                  if (!_mp) break;
                  nameMatches = [...nameMatches, ..._mp];
                  if (_mp.length < 1000) break;
                }

                if (nameMatches.length > 0) {
                  nameMatches
                    .filter(entry => !alreadyFoundIds.has(entry.id))
                    .forEach(entry => {
                      const dpReq = nameToRequest.get((entry.site_name || '').toLowerCase());
                      const hasCost = (entry.enumerator_fee != null && entry.transport_fee != null) || entry.cost != null;
                      const dpAmount = dpReq?.requested_amount || dpReq?.total_transportation_budget;
                      dpSiteEntries.push({
                        ...entry,
                        accepted_by: entry.accepted_by || dpReq?.requested_by,
                        cost: hasCost ? (entry.cost || (Number(entry.enumerator_fee || 0) + Number(entry.transport_fee || 0))) : (dpAmount ? Number(dpAmount) : entry.cost),
                        enumerator_fee: entry.enumerator_fee != null ? entry.enumerator_fee : (dpAmount ? Number(dpAmount) : null),
                        transport_fee: entry.transport_fee != null ? entry.transport_fee : 0,
                        _from_down_payment: true
                      });
                      alreadyFoundIds.add(entry.id);
                    });
                }
              }
            }
          }

          const dpRequestLookup = new Map<string, any>();
          (dpRequests || []).forEach((dp: any) => {
            if (dp.mmp_site_entry_id) dpRequestLookup.set(dp.mmp_site_entry_id, dp);
            if (dp.site_name) dpRequestLookup.set(`name:${dp.site_name.toLowerCase()}`, dp);
          });

          const enrichedDbEntries = allDbEntries.map(entry => {
            const hasCost = (entry.enumerator_fee != null && entry.transport_fee != null) || entry.cost != null;
            if (hasCost) return entry;
            const matchingDp = dpRequestLookup.get(entry.id) || dpRequestLookup.get(`name:${(entry.site_name || '').toLowerCase()}`);
            if (matchingDp) {
              const dpAmount = matchingDp.requested_amount || matchingDp.total_transportation_budget;
              if (dpAmount) {
                return {
                  ...entry,
                  cost: Number(dpAmount),
                  enumerator_fee: Number(dpAmount),
                  transport_fee: 0,
                };
              }
            }
            return entry;
          });

          const allEntries = [...enrichedDbEntries, ...dpSiteEntries];
          const seenIds = new Set<string>();
          const deduped = allEntries.filter(e => {
            if (seenIds.has(e.id)) return false;
            seenIds.add(e.id);
            return true;
          });

          const mmpLookup = new Map(mmpFiles.map(m => [m.id, m.name || '']));
          const formattedEntries = deduped.map(entry => {
            const formatted = formatSiteEntry(entry);
            return {
              ...formatted,
              mmp_file_id: entry.mmp_file_id,
              mmpId: entry.mmp_file_id,
              mmpName: mmpLookup.get(entry.mmp_file_id) || '',
            };
          });

          if (!cancelled) {
            setAcceptedSiteEntries(formattedEntries);
            setAcceptedCount(formattedEntries.length);
            acceptedLoadedKeyRef.current = fetchKey;
          }
        } catch (err) {
          console.error('[Accepted] Failed to load:', err);
        } finally {
          if (!cancelled) setLoadingAccepted(false);
        }
      };

      loadAcceptedFromDB();
      return () => { cancelled = true; };
  }, [verifiedSubTab, categorizedMMPs.verified, formatSiteEntry, adminRefreshTrigger]);

  // Load ongoing site entries only when the tab is active
  // Uses verifiedSiteEntries (only from verified MMPs) for consistency
  useEffect(() => {
    
      if (verifiedSubTab !== 'ongoing') {
        setOngoingSiteEntries([]);
        setLoadingOngoing(false);
        return;
      }

      setLoadingOngoing(false);

      const formattedEntries = verifiedSiteEntries
      .map(entry => {
        const formatted = formatSiteEntry(entry);
        const parentMmp = mmpFiles.find(m => m.id === (entry.mmp_file_id || entry.mmpId));
        return { ...formatted, mmpName: formatted.mmpName || parentMmp?.name || '' };
      })
      .filter(entry =>{
        const status = String(entry.status || '').toLowerCase();
        return /inprogress|in_progress|ongoing/.test(status);
      }
      )
       .sort((a, b) => {
      const aDate = (a as any).updated_at || (a as any).createdAt || '';
      const bDate = (b as any).updated_at || (b as any).createdAt || '';
      return bDate.localeCompare(aDate);
    });

        setOngoingSiteEntries(formattedEntries);
        // Update count when entries are loaded (count is also loaded separately for badge)
        setOngoingCount(formattedEntries.length);
       
    

    
  }, [verifiedSubTab, verifiedSiteEntries, formatSiteEntry]);

  // Load completed site entries only when the tab is active
  // Uses verifiedSiteEntries (only from verified MMPs) for consistency
  useEffect(() => {
    
      if (verifiedSubTab !== 'completed') {
        setCompletedSiteEntries([]);
        setLoadingCompleted(false);
        return;
      }

      setLoadingCompleted(false);

      const formattedEntries = verifiedSiteEntries
      .map(entry => {
        const formatted = formatSiteEntry(entry);
        const parentMmp = mmpFiles.find(m => m.id === (entry.mmp_file_id || entry.mmpId));
        return { ...formatted, mmpName: formatted.mmpName || parentMmp?.name || '' };
      })
      .filter(entry =>{
        const status = String(entry.status || '').toLowerCase();
        return status === "completed";
      }
      )
      .sort((a, b) => {
      const aDate = (a as any).updated_at || (a as any).createdAt || '';
      const bDate = (b as any).updated_at || (b as any).createdAt || '';
      return bDate.localeCompare(aDate);
    });

    setCompletedSiteEntries(formattedEntries);
    setCompletedCount(formattedEntries.length);
    
     
  }, [verifiedSubTab, verifiedSiteEntries, formatSiteEntry]);

  // Load rejected site entries only when the tab is active
  // Uses verifiedSiteEntries (only from verified MMPs) for consistency
  useEffect(() => {
    
      if (verifiedSubTab !== 'rejected') {
        setRejectedSiteEntries([]);
        setLoadingRejected(false);
        return;
      }

      setLoadingRejected(false);
      const formattedEntries = verifiedSiteEntries
      .map(entry => {
        const formatted = formatSiteEntry(entry);
        const parentMmp = mmpFiles.find(m => m.id === (entry.mmp_file_id || entry.mmpId));
        return { ...formatted, mmpName: formatted.mmpName || parentMmp?.name || '' };
      })
      .filter(entry =>{
        const status = String(entry.status || '').toLowerCase();
        return status === "rejected";
      }
      )
      .sort((a, b) => {
      const aDate = (a as any).updated_at || (a as any).createdAt || '';
      const bDate = (b as any).updated_at || (b as any).createdAt || '';
      return bDate.localeCompare(aDate);
    });
    setRejectedSiteEntries(formattedEntries);
    setRejectedCount(formattedEntries.length);
      
    

    
  }, [verifiedSubTab, verifiedSiteEntries, formatSiteEntry]);

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
        // Approved & Costed: ALL site entries must have AND status = 'verified'
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
  // This merges siteVisitRows with any siteEntries that don't have a corresponding visit row
  const buildSiteRowsFromMMPs = (mmps: any[], filterFn?: (row: SiteVisitRow) => boolean): SiteVisitRow[] => {
    const rows: SiteVisitRow[] = [];
    const mmpIds = new Set(mmps.map(m => m.id));
    
    // First, get all siteVisitRows for these MMPs
    const visitRows = siteVisitRows.filter(r => mmpIds.has(r.mmpId));
    
    // Track which site entry IDs have visit rows to avoid duplicates
    const visitRowSiteIds = new Set(visitRows.map(r => r.id));
    
    // For each MMP, add siteEntries that don't have corresponding visit rows
    for (const mmp of mmps) {
      if (Array.isArray(mmp.siteEntries)) {
        for (const se of mmp.siteEntries) {
          const siteId = se.id || `${mmp.id}-site-${rows.length}`;
          // Skip if this site entry already has a visit row
          if (visitRowSiteIds.has(siteId)) continue;
          
          const row = {
            id: siteId,
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
            accepted_by: se.accepted_by,
            dispatched_by: se.dispatched_by,
            dispatched_at: se.dispatched_at,
            verified_by: se.verified_by,
          } as SiteVisitRow;
          if (!filterFn || filterFn(row)) {
            rows.push(row);
          }
        }
      }
    }
    
    // Apply filter to visit rows and merge
    const filteredVisitRows = filterFn ? visitRows.filter(filterFn) : visitRows;
    return [...filteredVisitRows, ...rows];
  };

  // Pre-compute all subcategory site rows in a SINGLE PASS for optimal performance
  // This ensures badge counts match table data (both use same deduplication logic)
  const precomputedSubcategorySites = useMemo(() => {
    const allVerifiedMMPs = categorizedMMPs.verified || [];
    
    const result = {
      newSites: [] as SiteVisitRow[],
      dispatched: [] as SiteVisitRow[],
      accepted: [] as SiteVisitRow[],
      smartAssigned: [] as SiteVisitRow[],
      ongoing: [] as SiteVisitRow[],
      completed: [] as SiteVisitRow[],
      submitted: [] as SiteVisitRow[],
      wfpConfirmed: [] as SiteVisitRow[],
      notCovered: [] as SiteVisitRow[],
      rejected: [] as SiteVisitRow[],
      approvedCosted: [] as SiteVisitRow[]
    };
    
    if (allVerifiedMMPs.length === 0) {
      return result;
    }
    
    // Build MMP ID set for quick lookup
    const mmpIds = new Set(allVerifiedMMPs.map(m => m.id));
    
    // Get all siteVisitRows for verified MMPs
    const visitRows = siteVisitRows.filter(r => mmpIds.has(r.mmpId));
    
    // Track which site entry IDs have visit rows to avoid duplicates
    const visitRowSiteIds = new Set(visitRows.map(r => r.id));
    
    // Helper to categorize a single row - returns the category key or null
    const categorizeRow = (row: SiteVisitRow): keyof typeof result | null => {
      const status = row.status?.toLowerCase() || '';
      const acceptedBy = (row as any).accepted_by;
      const dispatchedAt = (row as any).dispatched_at;
      const ad = (row as any).additionalData || (row as any).additional_data || {};
      const assignedTo = ad.assigned_to || ad.smart_assigned_to || (row as any).assigned_to || (row as any).smart_assigned_to;
      
      // approvedCosted check FIRST: status-based routing takes priority over stale accepted_by
      if (status === 'approved and costed' || status === 'costed') {
        return 'approvedCosted';
      }
      
      // Any site with accepted_by set goes to 'accepted' (post-claim statuses)
      if (acceptedBy) {
        if (status === 'wfp_confirmed') return 'wfpConfirmed';
        if (status === 'not_covered') return 'notCovered';
        if (status === 'submitted') return 'submitted';
        if (status === 'completed') return 'completed';
        if (status === 'rejected' || status === 'declined') return 'rejected';
        if (/inprogress|in_progress|ongoing/.test(status)) return 'ongoing';
        return 'accepted';
      }
      if (status === 'wfp_confirmed') {
        return 'wfpConfirmed';
      }
      if (status === 'not_covered') {
        return 'notCovered';
      }
      if (status === 'submitted') {
        return 'submitted';
      }
      if (status === 'completed') {
        return 'completed';
      }
      if (status === 'rejected' || status === 'declined') {
        return 'rejected';
      }
      if (/inprogress|in_progress|ongoing/.test(status)) {
        return 'ongoing';
      }
      if (status === 'accepted') {
        return 'accepted';
      }
      if (status === 'assigned' && assignedTo) {
        return 'smartAssigned';
      }
      if (status === 'dispatched') {
        return 'dispatched';
      }
      // New sites - pending/verified statuses before costing/dispatch
      if (status === 'pending' ||
          status === 'verified' || 
          status === 'cp_verified' || 
          status === 'permits_verified' || 
          status === 'locality_permit_verified' ||
          (status === 'approved' && !status.includes('costed'))) {
        return 'newSites';
      }
      return null;
    };
    
    // Process visit rows in single pass
    for (const row of visitRows) {
      const category = categorizeRow(row);
      if (category) {
        result[category].push(row);
      }
    }
    
    // Process site entries from MMPs that don't have visit rows
    // Use deterministic index-based ID generation matching buildSiteRowsFromMMPs
    let siteEntryIndex = 0;
    for (const mmp of allVerifiedMMPs) {
      if (Array.isArray(mmp.siteEntries)) {
        for (let i = 0; i < mmp.siteEntries.length; i++) {
          const se = mmp.siteEntries[i];
          // Use deterministic ID: prefer se.id, then index-based fallback matching original logic
          const siteId = se.id || `${mmp.id}-site-${siteEntryIndex}`;
          siteEntryIndex++;
          
          // Skip if this site entry already has a visit row
          if (visitRowSiteIds.has(siteId)) continue;
          
          const seAny = se as any;
          const row = {
            id: siteId,
            mmpId: mmp.id,
            mmpName: mmp.name || '',
            siteName: se.siteName || se.siteCode || se.state || 'Site',
            siteCode: se.siteCode,
            state: se.state,
            locality: se.locality,
            status: (se.status || 'pending'),
            feesTotal: 0,
            assignedAt: undefined,
            completedAt: undefined,
            rejectionReason: undefined,
            accepted_by: seAny.accepted_by,
            dispatched_by: seAny.dispatched_by,
            dispatched_at: seAny.dispatched_at,
            verified_by: seAny.verified_by,
          } as SiteVisitRow;
          
          const category = categorizeRow(row);
          if (category) {
            result[category].push(row);
          }
        }
      }
    }
    
    return result;
  }, [categorizedMMPs.verified, siteVisitRows, dpLinkedEntryIds, dpLinkedSiteNames]);

  // Calculate total verified sites count from precomputed data
  const totalVerifiedSitesCount = useMemo(() => {
    return (
      precomputedSubcategorySites.newSites.length +
      precomputedSubcategorySites.approvedCosted.length +
      precomputedSubcategorySites.dispatched.length +
      precomputedSubcategorySites.smartAssigned.length +
      precomputedSubcategorySites.accepted.length +
      precomputedSubcategorySites.ongoing.length +
      precomputedSubcategorySites.completed.length +
      precomputedSubcategorySites.submitted.length +
      precomputedSubcategorySites.wfpConfirmed.length +
      precomputedSubcategorySites.notCovered.length +
      precomputedSubcategorySites.rejected.length
    );
  }, [precomputedSubcategorySites]);

  const filterSubcategoryRows = useCallback((rows: any[]) => {
    if (!hasActiveGlobalFilters) return rows;
    return rows.filter(entry => {
      if (siteMmpFilter !== 'all') {
        const entryMmpId = entry.mmpId || entry.mmp_file_id || '';
        if (entryMmpId !== siteMmpFilter) return false;
      }
      if (siteStatusFilter !== 'all') {
        const status = entry.status || '';
        if (status.toLowerCase() !== siteStatusFilter.toLowerCase()) return false;
      }
      if (siteHubFilter !== 'all') {
        const hub = entry.hub || entry.hubName || entry.hubOffice || entry.hub_office || '';
        if (hub !== siteHubFilter) return false;
      }
      if (siteStateFilter !== 'all') {
        const state = entry.state || entry.stateName || '';
        if (state !== siteStateFilter) return false;
      }
      if (siteLocalityFilter !== 'all') {
        const locality = entry.locality || entry.localityName || '';
        if (locality !== siteLocalityFilter) return false;
      }
      return true;
    });
  }, [hasActiveGlobalFilters, siteMmpFilter, siteStatusFilter, siteHubFilter, siteStateFilter, siteLocalityFilter]);

  const newSitesVerifiedCount = useMemo(() => 
    filterSubcategoryRows(precomputedSubcategorySites.newSites).length,
  [precomputedSubcategorySites.newSites, filterSubcategoryRows]);

  const verifiedTabSiteEntryCounts = useMemo(() => {
    const filteredDispatched = filterSubcategoryRows(
      dispatchedSiteEntries.length > 0 ? dispatchedSiteEntries : precomputedSubcategorySites.dispatched
    );
    const filteredAccepted = filterSubcategoryRows(
      acceptedSiteEntries.length > 0 ? acceptedSiteEntries : precomputedSubcategorySites.accepted
    );
    const filteredApprovedCosted = filterSubcategoryRows(
      approvedCostedSiteEntries.length > 0 ? approvedCostedSiteEntries : precomputedSubcategorySites.approvedCosted
    );
    return {
      verified: filterSubcategoryRows(precomputedSubcategorySites.newSites).length,
      dispatched: filteredDispatched.length,
      accepted: filteredAccepted.length,
      smartAssigned: filterSubcategoryRows(precomputedSubcategorySites.smartAssigned).length,
      ongoing: filterSubcategoryRows(precomputedSubcategorySites.ongoing).length,
      completed: filterSubcategoryRows(precomputedSubcategorySites.completed).length,
      submitted: filterSubcategoryRows(precomputedSubcategorySites.submitted).length,
      wfpConfirmed: filterSubcategoryRows(precomputedSubcategorySites.wfpConfirmed).length,
      notCovered: filterSubcategoryRows(precomputedSubcategorySites.notCovered).length,
      rejected: filterSubcategoryRows(precomputedSubcategorySites.rejected).length,
      approvedCosted: filteredApprovedCosted.length,
    };
  }, [precomputedSubcategorySites, dispatchedSiteEntries, acceptedSiteEntries, approvedCostedSiteEntries, filterSubcategoryRows]);

  // Verified site rows per subcategory (all roles seeing Verified tab)
  // Uses precomputed data for consistency with badge counts
  const verifiedCategorySiteRows = useMemo(() => {
    const subKey = verifiedSubTab;
    
    // Use precomputed data for each subcategory
    if (subKey === 'newSites') {
      return precomputedSubcategorySites.newSites;
    }
    
    // Use precomputed data for other subcategories
    if (subKey === 'dispatched') {
      return precomputedSubcategorySites.dispatched;
    }
    
    if (subKey === 'approvedCosted') {
      return precomputedSubcategorySites.approvedCosted;
    }
    
    if (subKey === 'accepted') {
      return precomputedSubcategorySites.accepted;
    }
    
    if (subKey === 'smartAssigned') {
      return precomputedSubcategorySites.smartAssigned;
    }
    
    if (subKey === 'ongoing') {
      return precomputedSubcategorySites.ongoing;
    }
    
    if (subKey === 'completed') {
      return precomputedSubcategorySites.completed;
    }

    if (subKey === 'submitted') {
      return precomputedSubcategorySites.submitted;
    }

    if (subKey === 'wfpConfirmed') {
      return precomputedSubcategorySites.wfpConfirmed;
    }

    if (subKey === 'notCovered') {
      return precomputedSubcategorySites.notCovered;
    }
    
    if (subKey === 'rejected') {
      return precomputedSubcategorySites.rejected;
    }
    
    // Fallback for any unknown subcategory (shouldn't reach here)
    return [];
  }, [verifiedSubTab, precomputedSubcategorySites, verifiedSubcategories, siteVisitRows]);

  // Apply global filters to verified site rows
  const filteredVerifiedCategorySiteRows = useMemo(() => {
    if (!hasActiveGlobalFilters) {
      return verifiedCategorySiteRows;
    }
    
    return verifiedCategorySiteRows.filter(entry => {
      const e = entry as any;
      if (siteMmpFilter !== 'all') {
        const entryMmpId = e.mmpId || e.mmp_file_id || '';
        if (entryMmpId !== siteMmpFilter) return false;
      }
      if (siteStatusFilter !== 'all') {
        const status = e.status || '';
        if (status.toLowerCase() !== siteStatusFilter.toLowerCase()) return false;
      }
      if (siteHubFilter !== 'all') {
        const hub = e.hubOffice || e.hub || e.hubName || '';
        if (hub !== siteHubFilter) return false;
      }
      if (siteStateFilter !== 'all') {
        const state = e.state || e.stateName || '';
        if (state !== siteStateFilter) return false;
      }
      if (siteLocalityFilter !== 'all') {
        const locality = e.locality || e.localityName || '';
        if (locality !== siteLocalityFilter) return false;
      }
      return true;
    });
  }, [verifiedCategorySiteRows, hasActiveGlobalFilters, siteStatusFilter, siteHubFilter, siteStateFilter, siteLocalityFilter, siteMmpFilter]);

  // Group verified site rows by MMP for display
  const verifiedVisibleMMPs = useMemo(() => {
    const allVerified = categorizedMMPs.verified || [];

    // "all" (default) – show every verified MMP as a directory overview
    if (verifiedSubTab === 'all') {
      return allVerified;
    }

    // For "newSites" subcategory, show MMPs that have new-site entries
    if (verifiedSubTab === 'newSites') {
      const mmpIdsWithVerifiedSites = new Set(filteredVerifiedCategorySiteRows.map(s => s.mmpId));
      return allVerified.filter(mmp => mmpIdsWithVerifiedSites.has(mmp.id));
    }
    
    return (isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam)
      ? (verifiedSubcategories[verifiedSubTab] || [])
      : allVerified;
  }, [isAdmin, isICT, isFOM, isSupervisor, isCoordinator, isDataTeam, verifiedSubTab, verifiedSubcategories, categorizedMMPs.verified, filteredVerifiedCategorySiteRows]);

  const verifiedGroupedRows = useMemo(() => {
    // Group the precomputed site rows by MMP (using filtered data)
    // filteredVerifiedCategorySiteRows has global filters applied
    return verifiedVisibleMMPs.map(m => ({
      mmp: m,
      rows: filteredVerifiedCategorySiteRows.filter(row => row.mmpId === m.id),
    }));
  }, [verifiedVisibleMMPs, filteredVerifiedCategorySiteRows]);

  // Forwarded site rows per subcategory (FOM/Supervisor only for site data)
  const forwardedCategorySiteRows = useMemo(() => {
    if (!isFOM && !isSupervisor) return [] as SiteVisitRow[];
    const mmps = forwardedSubcategories[forwardedSubTab] || [];
    if (mmps.length === 0) return [];
    return buildSiteRowsFromMMPs(mmps, (row) => {
      // Exclude completed sites from editable tables
      const status = row.status?.toLowerCase() || '';
      return status !== 'completed';
    });
  }, [isFOM, forwardedSubTab, forwardedSubcategories, siteVisitRows]);

  // Aggregated site entries (raw MMP.siteEntries) for Forwarded section
  const forwardedEntries = useMemo(() => {
    const mmps = (isAdmin || isICT || isFOM || isSupervisor || isDataTeam) ? (forwardedSubcategories[forwardedSubTab] || []) : (categorizedMMPs.forwarded || []);
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
  }, [isAdmin, isICT, isFOM, isSupervisor, isDataTeam, forwardedSubTab, forwardedSubcategories, categorizedMMPs.forwarded]);

  // Derive site visit stats from context (Admin/ICT/FOM/Supervisor/Coordinator)
  const { siteVisitStats: derivedStats, siteVisitRows: derivedRows } = useMemo(() => {
    if (!(isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam)) {
      return { siteVisitStats: {}, siteVisitRows: [] };
    }
    
    let list: any[] = [];
    if (isFOM || isSupervisor) {
      list = [ ...(categorizedMMPs.verified || []), ...(categorizedMMPs.forwarded || []) ];
    } else if (isAdmin || isICT || isCoordinator || isDataTeam) {
      list = [ ...(categorizedMMPs.verified || []) ];
    }
    if (list.length === 0) {
      return { siteVisitStats: {}, siteVisitRows: [] };
    }
    
    const ids = list.map(m => m.id);
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
    
    // Process site entries from context
    const entriesByMmp = new Map<string, any[]>();
    mmpFiles.forEach((mmp: any) => {
      if (ids.includes(mmp.id) && Array.isArray(mmp.siteEntries)) {
        mmp.siteEntries.forEach((entry: any) => {
          const mmpId = mmp.id;
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
          if (status === 'accepted' || (entry as any).accepted_by) map[mmpId].hasAccepted = true;
          if (status === 'inprogress' || status === 'in_progress') map[mmpId].hasInProgress = true;
          if (status === 'completed' || status === 'submitted' || status === 'wfp_confirmed' || status === 'not_covered') map[mmpId].hasCompleted = true;
          if (status === 'rejected' || status === 'declined') map[mmpId].hasRejected = true;
          if (status === 'dispatched' || (entry as any).dispatched_at) map[mmpId].hasDispatched = true;
          
          const cost = Number(entry.cost || 0);
          if (cost > 0) map[mmpId].hasCosted = true;
          
          const siteRow: SiteVisitRow = {
            id: entry.id || `${mmpId}-${entry.site_code || entry.siteCode}`,
            mmpId: mmpId,
            mmpName: mmp.name || '',
            siteName: entry.site_name || entry.siteName || entry.site_code || entry.siteCode || 'Site',
            siteCode: entry.site_code || entry.siteCode || undefined,
            state: entry.state || undefined,
            locality: entry.locality || undefined,
            status: entry.status || 'Pending',
            feesTotal: cost,
            verifiedBy: entry.verified_by || undefined,
            verifiedAt: entry.verified_at || undefined,
          };
          rows.push(siteRow);
        });
      }
    });
    
    // Check if all entries for each MMP are approved and costedabcdf
    for (const [mmpId, entries] of entriesByMmp.entries()) {
      if (!map[mmpId]) {
        map[mmpId] = { exists: false, hasCosted: false, hasAssigned: false, hasInProgress: false, hasAccepted: false, hasCompleted: false, hasRejected: false, hasDispatched: false, allApprovedAndCosted: false };
      }
      
      // For "Approved & Costed", check if there are still undispatched/unaccepted costed sites
      if (entries.length > 0) {
        const costedEntries = entries.filter(entry => {
          const status = String(entry.status || '').toLowerCase();
          return status === 'approved and costed';
        });
        // Only mark as approvedCosted if there are costed entries that haven't been dispatched or accepted
        const hasUndispatchedCosted = costedEntries.some(entry => {
          return !entry.accepted_by && !entry.dispatched_at;
        });
        map[mmpId].allApprovedAndCosted = costedEntries.length > 0 && hasUndispatchedCosted;
      }
    }
    
    return { siteVisitStats: map, siteVisitRows: rows };
  }, [isAdmin, isICT, isFOM, isSupervisor, isCoordinator, categorizedMMPs.verified, categorizedMMPs.forwarded, mmpFiles]);

  // Update state from derived values
  useEffect(() => {
    setSiteVisitStats(derivedStats);
    setSiteVisitRows(derivedRows);
  }, [derivedStats, derivedRows]);

  if (!canRead) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">{t('mmpPage.accessDenied')}</CardTitle>
            <CardDescription>
              {t('mmpPage.noPermission')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="w-full">
              {t('mmpPage.returnToDashboard')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 min-h-screen bg-slate-50 dark:bg-gray-900 py-2 sm:py-3 px-2 sm:px-4 md:px-6">
      <PageInfoBanner
        title="Monthly Monitoring Plans (MMP)"
        description="Plan, dispatch, and track monthly site visits across all hubs and projects. Upload an MMP to add planned visits, then dispatch them to data collectors who claim and execute them. Track progress by state, locality, partner, and project. Use the cycle-close tools at month end to lock the cycle, compare vs. prior month, and trigger follow-up actions."
        descriptionAr="خطّط ونفّذ وتابع زيارات المواقع الشهرية عبر جميع المراكز والمشاريع. ارفع خطة شهرية لإضافة زيارات مخطط لها، ثم وزّعها على جامعي البيانات الذين يطالبون بها وينفذونها. تابع التقدم حسب الولاية والمحلية والشريك والمشروع. استخدم أدوات إغلاق الدورة في نهاية الشهر لقفل الدورة ومقارنتها بالشهر السابق وإطلاق إجراءات المتابعة."
        workflowSteps={[
          { step: 1, role: 'Admin', action: 'Upload MMP', description: 'Admin or FOM uploads the monthly plan file or creates entries manually.' },
          { step: 2, role: 'FOM', action: 'Dispatch sites', description: 'Field Operations Manager dispatches each site to a state/locality so collectors can claim it.' },
          { step: 3, role: 'Data Collector', action: 'Claim & visit', description: 'Collectors claim available sites by GPS proximity and complete the visit on the ground.' },
          { step: 4, role: 'Supervisor', action: 'Verify report', description: 'Supervisors review the submitted visit report and request fixes or approve.' },
          { step: 5, role: 'Admin', action: 'Close cycle', description: 'At month end, lock the cycle, compare to prior month, and trigger any follow-ups.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'المدير', action: 'رفع الخطة', description: 'يرفع المدير أو مدير العمليات الميدانية ملف الخطة الشهرية أو ينشئ المدخلات يدويًا.' },
          { step: 2, role: 'المدير', action: 'توزيع المواقع', description: 'يوزع مدير العمليات الميدانية كل موقع على ولاية/محلية حتى يتمكن المجمعون من المطالبة به.' },
          { step: 3, role: 'جامع بيانات', action: 'مطالبة وزيارة', description: 'يطالب المجمعون بالمواقع المتاحة حسب القرب الجغرافي وينفذون الزيارة على الأرض.' },
          { step: 4, role: 'المشرف', action: 'تحقق من التقرير', description: 'يراجع المشرفون تقرير الزيارة المقدم ويطلبون تصحيحات أو يوافقون.' },
          { step: 5, role: 'المدير', action: 'إغلاق الدورة', description: 'في نهاية الشهر، اقفل الدورة، قارنها بالشهر السابق، وأطلق أي إجراءات متابعة.' },
        ]}
      />
      {/* Blue Header Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-lg p-3 sm:p-4 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-full">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">{t('mmpPage.title')}</h1>
              <p className="text-blue-100 text-sm mt-0.5">
                {t('mmpPage.description')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                onClick={() => navigate('/mmp/cycle-close')}
                variant="outline"
                size="sm"
                className="bg-white/10 text-white border-white/30 flex items-center gap-1.5 text-xs"
                data-testid="button-cycle-close"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Close Cycle
              </Button>
            )}
            {canCreate && (
              <Button 
                onClick={() => navigate('/mmp/upload')} 
                size="sm"
                className="bg-white text-blue-700 hover:bg-blue-50 shadow-md flex items-center gap-1.5 text-xs"
                data-testid="button-upload-mmp"
                disabled={hasClosingCycle}
                title={hasClosingCycle ? 'Cannot upload while a cycle is being closed' : ''}
              >
                <Upload className="h-3.5 w-3.5" />
                {hasClosingCycle ? 'Upload Blocked (Cycle Closing)' : t('mmpPage.uploadMMP')}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-0.5">
            <ListChecks className="h-3.5 w-3.5" />
            <span>{t('mmpPage.siteTracking')}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-0.5">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>{t('mmpPage.verificationWorkflow')}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-0.5">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>{t('mmpPage.progressAnalytics')}</span>
          </div>
          <DataFreshnessBadge className="bg-white/10 rounded-full px-2.5 py-0.5" />
        </div>
      </div>

      {/* Upload blocked banner — shown when a cycle is in closing state */}
      {hasClosingCycle && canCreate && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3 mb-2" data-testid="banner-upload-blocked">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Upload blocked — a cycle is being closed
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                {closingCycleName
                  ? <>The MMP <strong>"{closingCycleName}"</strong> is currently in the closing process. Complete all closing steps first, then the upload button will unlock automatically.</>
                  : <>An MMP cycle is currently being closed. Complete all closing steps first, then the upload button will unlock automatically.</>
                }
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white gap-1.5 text-xs"
            onClick={() => navigate(`/mmp/cycle-close${closingCycleId ? `?wizardFor=${closingCycleId}` : ''}`)}
            data-testid="button-go-to-cycle-close"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Go to Cycle Close → finish closing first
          </Button>
        </div>
      )}

      {/* ── Purple "Awaiting Your Approval" banner — FOM / Admin / Super Admin ── */}
      {(isFOM || isAdmin || isSuperAdmin) && pendingApprovalMmps.length > 0 && (
        <div className="flex flex-col gap-2 mb-2">
          {pendingApprovalMmps.map(mmp => (
            <div
              key={mmp.id}
              className="rounded-xl border border-purple-300 dark:border-purple-700 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/30 px-4 py-4 shadow-sm"
              data-testid={`banner-mmp-pending-approval-${mmp.id}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <span className="relative flex h-3 w-3 shrink-0 mt-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-purple-900 dark:text-purple-100">
                    ⏳ Awaiting Your Approval — <span className="text-purple-700 dark:text-purple-300">{mmp.name}</span>
                  </p>
                  <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">
                    The admin has completed all closing steps and submitted this cycle for final approval.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white font-semibold shadow"
                  disabled={mmpBannerApproving === mmp.id}
                  onClick={() => handleMmpBannerApprove(mmp.id)}
                  data-testid={`button-mmp-banner-approve-${mmp.id}`}
                >
                  {mmpBannerApproving === mmp.id
                    ? <><span className="h-3.5 w-3.5 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Approving…</>
                    : <><CheckCircle2 className="h-4 w-4" /> ✓ Approve &amp; Close Cycle</>}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5 font-semibold shadow"
                  onClick={() => { setMmpBannerRejectId(mmp.id); setMmpBannerRejectNote(''); }}
                  data-testid={`button-mmp-banner-reject-${mmp.id}`}
                >
                  <XCircle className="h-4 w-4" />
                  Reject — Send Back
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs border-purple-300 text-purple-800 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900"
                  onClick={() => navigate(`/mmp/cycle-close?wizardFor=${mmp.id}`)}
                  data-testid={`button-mmp-banner-review-${mmp.id}`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Full Wizard &amp; Reports
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject dialog for MMP page banner */}
      <Dialog open={!!mmpBannerRejectId} onOpenChange={open => { if (!open) setMmpBannerRejectId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Cycle Close</DialogTitle>
            <DialogDescription>This will return the cycle to &quot;Closing&quot; status. The admin will need to resolve the issues and resubmit for approval.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-1.5 block">Reason for rejection <span className="text-muted-foreground font-normal">(required)</span></label>
            <Textarea
              rows={3}
              placeholder="Explain what the team needs to fix before resubmitting..."
              value={mmpBannerRejectNote}
              onChange={e => setMmpBannerRejectNote(e.target.value)}
              data-testid="input-mmp-banner-reject-note"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMmpBannerRejectId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!mmpBannerRejectNote.trim()}
              onClick={() => mmpBannerRejectId && handleMmpBannerReject(mmpBannerRejectId, mmpBannerRejectNote.trim())}
              data-testid="button-confirm-mmp-banner-reject"
            >
              Reject &amp; Send Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Body - Show tabs immediately with loading states per section for faster perceived loading */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="overflow-x-auto mb-3">
              <TabsList className="inline-flex w-max bg-gradient-to-r from-slate-900/90 to-blue-900/90 border border-blue-500/40 backdrop-blur-xl p-1 min-h-[38px] rounded-lg shadow-lg">
                {canClaimSites && (
                  <TabsTrigger value="enumerator" className="flex items-center gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[32px] text-xs flex-shrink-0 whitespace-nowrap rounded-md px-3 text-blue-100 hover:text-white transition-all">
                    <UserCheck className="h-3.5 w-3.5" />
                    {t('mmpPage.tabs.myAssignments')}
                    <Badge className="bg-blue-400/30 text-white border-0 text-[10px] px-1.5 py-0">{enumeratorMySites.length}</Badge>
                  </TabsTrigger>
                )}
                {!canClaimSites && (
                  <TabsTrigger value="new" className="flex items-center gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[32px] text-xs flex-shrink-0 whitespace-nowrap rounded-md px-3 text-blue-100 hover:text-white transition-all">
                    <ClipboardList className="h-3.5 w-3.5" />
                    {t('mmpPage.tabs.newMMPs')}
                    <Badge className="bg-emerald-400/30 text-white border-0 text-[10px] px-1.5 py-0">{categorizedMMPs.new.length}</Badge>
                  </TabsTrigger>
                )}
                {!canClaimSites && (
                  <TabsTrigger value="forwarded" className="flex items-center gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[32px] text-xs flex-shrink-0 whitespace-nowrap rounded-md px-3 text-blue-100 hover:text-white transition-all">
                    <Send className="h-3.5 w-3.5" />
                    {isFOM ? t('mmpPage.tabs.forwardedSites') : t('mmpPage.tabs.forwardedMMPs')}
                    <Badge className="bg-amber-400/30 text-white border-0 text-[10px] px-1.5 py-0">{categorizedMMPs.forwarded.length}</Badge>
                  </TabsTrigger>
                )}
                {!canClaimSites && (
                  <TabsTrigger value="verified" className="flex items-center gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[32px] text-xs flex-shrink-0 whitespace-nowrap rounded-md px-3 text-blue-100 hover:text-white transition-all">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {t('mmpPage.tabs.verifiedSites')}
                    <Badge className="bg-violet-400/30 text-white border-0 text-[10px] px-1.5 py-0">{totalVerifiedSitesCount}</Badge>
                  </TabsTrigger>
                )}
                {!canClaimSites && (
                  <TabsTrigger value="tracker" className="flex items-center gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[32px] text-xs flex-shrink-0 whitespace-nowrap rounded-md px-3 text-blue-100 hover:text-white transition-all">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    {t('mmpPage.tabs.mmpTracker')}
                  </TabsTrigger>
                )}
                {(isSuperAdmin || isAdmin || isFOM || isCoordinator) && (
                  <TabsTrigger value="adhoc" className="flex items-center gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[32px] text-xs flex-shrink-0 whitespace-nowrap rounded-md px-3 text-blue-100 hover:text-white transition-all"
                    data-testid="tab-adhoc-visits">
                    <FilePlus className="h-3.5 w-3.5" />
                    Ad-hoc Visits
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {!canClaimSites && (
              <TabsContent value="new">
                {(isFOM || isSupervisor || isAdmin || isICT || isDataTeam) && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-muted-foreground mb-2">{t('mmpPage.subcategory')}:</div>
                    <div className="flex gap-1.5 flex-wrap">
                        {isFOM && (
                          <>
                            <Button 
                              variant={newFomSubTab === 'pending' ? 'default' : 'outline'} 
                              size="sm" 
                              onClick={() => setNewFomSubTab('pending')} 
                              className={`${newFomSubTab === 'pending' ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white border-0 shadow-md' : 'hover:bg-emerald-50 dark:hover:bg-emerald-950'} flex-shrink-0 whitespace-nowrap rounded-lg transition-all text-xs`}
                            >
                              <Clock className="h-3.5 w-3.5 mr-1.5" />
                              {t('mmpPage.subcategories.mmpsPendingVerification')}
                              <Badge className={`ml-1.5 text-xs ${newFomSubTab === 'pending' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'}`}>{newFomSubcategories.pending.length}</Badge>
                            </Button>
                            <Button 
                              variant={newFomSubTab === 'verified' ? 'default' : 'outline'} 
                              size="sm" 
                              onClick={() => setNewFomSubTab('verified')} 
                              className={`${newFomSubTab === 'verified' ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white border-0 shadow-md' : 'hover:bg-green-50 dark:hover:bg-green-950'} flex-shrink-0 whitespace-nowrap rounded-lg transition-all text-xs`}
                            >
                              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                              {t('mmpPage.subcategories.verifiedMMPs')}
                              <Badge className={`ml-1.5 text-xs ${newFomSubTab === 'verified' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>{newFomSubcategories.verified.length}</Badge>
                            </Button>
                          </>
                        )}
                        <Button 
                          variant={newFomSubTab === 'returned' ? 'default' : 'outline'} 
                          size="sm" 
                          onClick={() => setNewFomSubTab('returned')} 
                          className={`${newFomSubTab === 'returned' ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0 shadow-md' : 'hover:bg-orange-50 dark:hover:bg-orange-950 border-orange-200 dark:border-orange-800'} flex-shrink-0 whitespace-nowrap rounded-lg transition-all text-xs`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                          {t('mmpPage.subcategories.returnedSites')}
                          <Badge className={`ml-1.5 text-xs ${newFomSubTab === 'returned' ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'}`}>{returnedSitesByState.reduce((sum, g) => sum + g.totalSites, 0)}</Badge>
                        </Button>
                      </div>
                  </div>
                )}
                {(isFOM || isSupervisor || isAdmin || isICT) && newFomSubTab === 'returned' ? (
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <CardTitle>
                            {returnedGroupBy === 'state' ? 'Returned Sites by State' : 'Returned Sites by Month'}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            These sites were returned by coordinators and require action.
                          </p>
                        </div>
                        <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium shrink-0">
                          <button
                            onClick={() => setReturnedGroupBy('state')}
                            className={`px-3 py-1.5 transition-colors ${returnedGroupBy === 'state' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                          >
                            By State
                          </button>
                          <button
                            onClick={() => setReturnedGroupBy('mmp')}
                            className={`px-3 py-1.5 transition-colors border-l border-border ${returnedGroupBy === 'mmp' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                          >
                            By Month
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* ── By Month view ── */}
                      {returnedGroupBy === 'mmp' && (
                        returnedSitesByMmp.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">No returned sites found.</div>
                        ) : (
                          <div className="space-y-3">
                            {returnedSitesByMmp.map(mmpGroup => {
                              const isExpanded = expandedReturnedMmps.has(mmpGroup.mmpName);
                              // Group sites by state then locality within this MMP
                              const byState: Record<string, Record<string, any[]>> = {};
                              mmpGroup.sites.forEach((site: any) => {
                                const st = site.state || 'Unknown State';
                                const loc = site.locality || 'Unknown Locality';
                                if (!byState[st]) byState[st] = {};
                                if (!byState[st][loc]) byState[st][loc] = [];
                                byState[st][loc].push(site);
                              });
                              return (
                                <Card key={mmpGroup.mmpName} className="overflow-hidden">
                                  <CardContent className="pt-4 pb-3">
                                    {/* MMP header row */}
                                    <div
                                      className="flex items-center justify-between cursor-pointer select-none"
                                      onClick={() => setExpandedReturnedMmps(prev => {
                                        const s = new Set(prev);
                                        s.has(mmpGroup.mmpName) ? s.delete(mmpGroup.mmpName) : s.add(mmpGroup.mmpName);
                                        return s;
                                      })}
                                    >
                                      <div className="flex items-center gap-2">
                                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                        <span className="font-semibold text-base">{mmpGroup.mmpName}</span>
                                        <Badge className="bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700 text-xs">
                                          {mmpGroup.totalSites} site{mmpGroup.totalSites !== 1 ? 's' : ''} returned
                                        </Badge>
                                      </div>
                                      <span className="text-xs text-muted-foreground">{Object.keys(byState).length} state{Object.keys(byState).length !== 1 ? 's' : ''}</span>
                                    </div>

                                    {/* Expanded: flat list of every site with state + locality */}
                                    {isExpanded && (
                                      <div className="mt-3 border-t pt-3 space-y-1" onClick={e => e.stopPropagation()}>
                                        {Object.entries(byState).map(([stateName, localities]) =>
                                          Object.entries(localities).map(([localityName, sites]) =>
                                            sites.map((site: any) => {
                                              const siteName = site.site_name || site.siteName || site.site_code || 'Unknown Site';
                                              const siteCode = site.site_code || site.siteCode || '';
                                              const returnReason = site.verification_notes || site.additional_data?.rejection_comments || site.additional_data?.return_reason || site.rejection_comments || '';
                                              const returnedBy = site.verified_by || site.additional_data?.returned_by_name || site.additional_data?.sent_back_by || '';
                                              return (
                                                <div
                                                  key={site.id}
                                                  className="flex items-start gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
                                                >
                                                  <AlertTriangle className="h-3.5 w-3.5 text-orange-500 mt-0.5 shrink-0" />
                                                  <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <span className="font-medium text-sm">{siteName}</span>
                                                      {siteCode && <span className="text-xs text-muted-foreground">({siteCode})</span>}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                      {stateName} › {localityName}
                                                    </div>
                                                    {returnReason && (
                                                      <div className="text-xs text-orange-700 dark:text-orange-400 mt-0.5 italic">"{returnReason}"</div>
                                                    )}
                                                  </div>
                                                  {returnedBy && (
                                                    <span className="text-xs text-muted-foreground shrink-0">by {returnedBy}</span>
                                                  )}
                                                </div>
                                              );
                                            })
                                          )
                                        )}
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        )
                      )}

                      {/* ── By State view (original) ── */}
                      {returnedGroupBy === 'state' && (returnedSitesByState.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No returned sites found.
                        </div>
                      ) : (
                        returnedSitesByState.map(stateGroup => {
                          const isExpanded = expandedReturnedStates.has(stateGroup.state);
                          // Group sites by locality within state
                          const sitesByLocality: Record<string, any[]> = {};
                          stateGroup.sites.forEach((site: any) => {
                            const loc = site.locality || 'Unknown';
                            if (!sitesByLocality[loc]) sitesByLocality[loc] = [];
                            sitesByLocality[loc].push(site);
                          });
                          const localityCount = Object.keys(sitesByLocality).length;
                          const uniqueMmpNames = [...new Set(stateGroup.sites.map((s: any) => s.mmpName).filter(Boolean))];
                          
                          return (
                            <Card 
                              key={stateGroup.state}
                              className="overflow-hidden transition-shadow hover:shadow-md cursor-pointer"
                              onClick={() => {
                                setExpandedReturnedStates(prev => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(stateGroup.state)) {
                                    newSet.delete(stateGroup.state);
                                  } else {
                                    newSet.add(stateGroup.state);
                                  }
                                  return newSet;
                                });
                              }}
                            >
                              <CardContent className="pt-4">
                                <div className="flex items-start gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <h3 className="font-semibold text-lg">{stateGroup.state}</h3>
                                        {uniqueMmpNames.length > 0 && (
                                          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                                            {uniqueMmpNames.join(', ')}
                                          </p>
                                        )}
                                        <p className="text-sm text-muted-foreground">{localityCount} localit{localityCount !== 1 ? 'ies' : 'y'}</p>
                                        <p className="text-sm text-muted-foreground">{stateGroup.totalSites} site{stateGroup.totalSites !== 1 ? 's' : ''} assigned</p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline">
                                          <AlertTriangle className="h-3 w-3 mr-1" />
                                          State Permit Required
                                        </Badge>
                                        <Button
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const sitesForBatch = stateGroup.sites || [];
                                            if (!sitesForBatch.length) return;
                                            const firstSite = sitesForBatch[0];
                                            setReturnedSiteActionBatchSites(sitesForBatch);
                                            setReturnedSiteActionDialog({ open: true, site: firstSite, action: 'sendback' });
                                            setSelectedReturnedActionType('sendback');
                                            setReturnedActionNotes('');
                                            setSelectedCoordinatorForSendBack(resolveOriginalCoordinatorId(firstSite));
                                          }}
                                        >
                                          <Upload className="h-3 w-3 mr-1" />
                                          Send Back
                                        </Button>
                                      </div>
                                    </div>
                                    
                                    {/* Show localities and individual sites when state is expanded */}
                                    {isExpanded && (
                                      <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                                        <div className="text-sm text-muted-foreground mb-2">
                                          Localities in this state:
                                        </div>
                                        <div className="space-y-2">
                                          {Object.entries(sitesByLocality).map(([locality, sites]) => {
                                            const locKey = `${stateGroup.state}|${locality}`;
                                            const isLocExpanded = expandedReturnedLocalities.has(locKey);
                                            return (
                                              <div key={locality} className="space-y-1">
                                                <div 
                                                  className="flex items-center justify-between p-3 bg-muted/50 dark:bg-muted/20 rounded-md cursor-pointer hover-elevate"
                                                  onClick={() => {
                                                    setExpandedReturnedLocalities(prev => {
                                                      const newSet = new Set(prev);
                                                      if (newSet.has(locKey)) newSet.delete(locKey);
                                                      else newSet.add(locKey);
                                                      return newSet;
                                                    });
                                                  }}
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <ChevronRight className={`h-4 w-4 transition-transform ${isLocExpanded ? 'rotate-90' : ''}`} />
                                                    <span className="font-medium">{locality}</span>
                                                    <span className="text-muted-foreground text-sm">({sites.length} site{sites.length !== 1 ? 's' : ''})</span>
                                                  </div>
                                                  <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700 text-xs">
                                                    Returned
                                                  </Badge>
                                                </div>
                                                {isLocExpanded && (
                                                  <div className="ml-6 space-y-2 pt-1">
                                                    {sites.map((site: any) => {
                                                      const returnReason = site.verification_notes || site.additional_data?.rejection_comments || site.additional_data?.rejection_reason || site.additional_data?.return_reason || site.rejection_comments || '';
                                                      const returnedBy = site.verified_by || site.additional_data?.sent_back_by || site.rejected_by || site.additional_data?.rejected_by || site.additional_data?.returned_by_name || '';
                                                      const returnedAt = site.verified_at || site.rejected_at || site.additional_data?.rejected_at || site.additional_data?.sent_back_at || site.additional_data?.returned_at || '';
                                                      const siteName = site.site_name || site.siteName || site.site_code || 'Unknown Site';
                                                      const siteCode = site.site_code || site.siteCode || '';
                                                      const fomReports = site.additional_data?.fom_reports || [];
                                                      
                                                      return (
                                                        <Card key={site.id} className="border-l-0 shadow-sm">
                                                          <CardContent className="p-3 space-y-2">
                                                            <div className="flex items-start justify-between gap-2">
                                                              <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                  <span className="font-medium text-sm">{siteName}</span>
                                                                  {siteCode && <span className="text-xs text-muted-foreground">({siteCode})</span>}
                                                                </div>
                                                                {site.mmpName && (
                                                                  <p className="text-xs text-muted-foreground mt-0.5">MMP: {site.mmpName}</p>
                                                                )}
                                                              </div>
                                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                                {canRedispatchReturnedSite(site) && (
                                                                  <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="text-xs h-7"
                                                                    data-testid={`button-redispatch-${site.id}`}
                                                                    onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      setReturnedSiteActionDialog({ open: true, site, action: 'redispatch' });
                                                                      setReturnedActionNotes('');
                                                                    }}
                                                                  >
                                                                    <RefreshCw className="h-3 w-3 mr-1" />
                                                                    Re-dispatch
                                                                  </Button>
                                                                )}
                                                                <Button
                                                                  size="sm"
                                                                  variant="outline"
                                                                  className="text-xs h-7"
                                                                  data-testid={`button-sendback-returned-${site.id}`}
                                                                  onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setReturnedSiteActionDialog({ open: true, site, action: 'sendback' });
                                                                    setReturnedActionNotes('');
                                                                    setSelectedCoordinatorForSendBack(
                                                                      resolveOriginalCoordinatorId(site)
                                                                    );
                                                                  }}
                                                                >
                                                                  <Send className="h-3 w-3 mr-1" />
                                                                  Send Back
                                                                </Button>
                                                                <Button
                                                                  size="sm"
                                                                  variant="outline"
                                                                  className="text-xs h-7 text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-700"
                                                                  data-testid={`button-report-returned-${site.id}`}
                                                                  onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setReturnedSiteActionDialog({ open: true, site, action: 'report' });
                                                                    setReturnedActionNotes('');
                                                                  }}
                                                                >
                                                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                                                  Report
                                                                </Button>
                                                              </div>
                                                            </div>
                                                            
                                                            {/* Return reason section */}
                                                            {returnReason && (
                                                              <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md p-2.5">
                                                                <div className="flex items-start gap-2">
                                                                  <AlertTriangle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                                                                  <div className="flex-1 min-w-0">
                                                                    <p className="text-xs font-medium text-orange-800 dark:text-orange-300 mb-0.5">Return Reason:</p>
                                                                    <p className="text-sm text-orange-900 dark:text-orange-200">{returnReason}</p>
                                                                  </div>
                                                                </div>
                                                              </div>
                                                            )}
                                                            {!returnReason && (
                                                              <div className="bg-muted/50 rounded-md p-2.5">
                                                                <p className="text-xs text-muted-foreground italic">No return reason provided.</p>
                                                              </div>
                                                            )}
                                                            
                                                            {/* Returned by info */}
                                                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                              {returnedBy && (
                                                                <span className="flex items-center gap-1">
                                                                  <User className="h-3 w-3" />
                                                                  Returned by: {returnedBy}
                                                                </span>
                                                              )}
                                                              {returnedAt && (
                                                                <span className="flex items-center gap-1">
                                                                  <Clock className="h-3 w-3" />
                                                                  {new Date(returnedAt).toLocaleDateString()} {new Date(returnedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                                </span>
                                                              )}
                                                              {fomReports.length > 0 && (
                                                                <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800">
                                                                  {fomReports.length} report{fomReports.length !== 1 ? 's' : ''} filed
                                                                </Badge>
                                                              )}
                                                            </div>
                                                          </CardContent>
                                                        </Card>
                                                      );
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })
                      ))}
                    </CardContent>
                  </Card>
                ) : loading ? (
                  <Card>
                    <CardContent className="py-8">
                      <div className="flex items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                        <span className="text-muted-foreground">{t('common.loading')}</span>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <MMPList mmpFiles={(isFOM || isSupervisor || isAdmin || isICT) ? newFomSubcategories[newFomSubTab] : categorizedMMPs.new} />
                )}
              </TabsContent>
            )}

            {!canClaimSites && (
              <TabsContent value="forwarded">
                {(isAdmin || isICT || isFOM) && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-muted-foreground mb-2">{t('mmpPage.subcategory')}:</div>
                    <div className="flex gap-1.5 flex-wrap">
                        <Button 
                          variant={forwardedSubTab === 'pending' ? 'default' : 'outline'} 
                          size="sm" 
                          onClick={() => setForwardedSubTab('pending')} 
                          className={`${forwardedSubTab === 'pending' ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-md' : 'hover:bg-amber-50 dark:hover:bg-amber-950'} flex-shrink-0 whitespace-nowrap rounded-lg transition-all text-xs`}
                        >
                          <Clock className="h-3.5 w-3.5 mr-1.5" />
                          {isFOM ? t('mmpPage.subcategories.sitesPendingVerification') : t('mmpPage.subcategories.mmpsPendingVerification')}
                          <Badge className={`ml-1.5 text-xs ${forwardedSubTab === 'pending' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}`}>{forwardedSubcategories.pending.length}</Badge>
                        </Button>
                        <Button 
                          variant={forwardedSubTab === 'verified' ? 'default' : 'outline'} 
                          size="sm" 
                          onClick={() => setForwardedSubTab('verified')} 
                          className={`${forwardedSubTab === 'verified' ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white border-0 shadow-md' : 'hover:bg-green-50 dark:hover:bg-green-950'} flex-shrink-0 whitespace-nowrap rounded-lg transition-all text-xs`}
                        >
                          <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                          {isFOM ? t('mmpPage.subcategories.verifiedSites') : t('mmpPage.subcategories.verifiedMMPs')}
                          <Badge className={`ml-1.5 text-xs ${forwardedSubTab === 'verified' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>{forwardedSubcategories.verified.length}</Badge>
                        </Button>
                      </div>
                  </div>
                )}
                {loading ? (
                  <Card>
                    <CardContent className="py-8">
                      <div className="flex items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                        <span className="text-muted-foreground">{t('common.loading')}</span>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <MMPList mmpFiles={(isAdmin || isICT || isFOM || isSupervisor || isDataTeam) ? forwardedSubcategories[forwardedSubTab] : categorizedMMPs.forwarded} />
                )}
                {isFOM && (
                  <SitesDisplayTable 
                    siteRows={forwardedCategorySiteRows}
                    editable={true}
                    title={`${t('mmpPage.siteEntries')} (${forwardedCategorySiteRows.length}) - ${t('mmpPage.forwardedSubcategory')}: ${t(`mmpPage.subcategories.${forwardedSubTab === 'pending' ? 'sitesPendingVerification' : 'verifiedSites'}`)}`}
                  />
                )}
              </TabsContent>
            )}

            <TabsContent value="verified">
              {/* Global Site Entry Filters - above subcategory tabs */}
              {(isAdmin || isICT || isFOM || isCoordinator || isSupervisor || isDataTeam) && (
                <MmpFilterBar
                  mmpOptions={mmpFilterOptions.map(m => ({ id: m.id, label: m.label, count: m.siteCount }))}
                  mmpFilter={siteMmpFilter}
                  onMmpFilterChange={setSiteMmpFilter}
                  statusOptions={globalSiteFilterOptions.statuses}
                  statusFilter={siteStatusFilter}
                  onStatusFilterChange={setSiteStatusFilter}
                  hubOptions={globalSiteFilterOptions.hubs}
                  hubFilter={siteHubFilter}
                  onHubFilterChange={(val) => { setSiteHubFilter(val); setSiteStateFilter('all'); setSiteLocalityFilter('all'); }}
                  stateOptions={filteredStatesForDropdown}
                  stateFilter={siteStateFilter}
                  onStateFilterChange={(val) => { setSiteStateFilter(val); setSiteLocalityFilter('all'); }}
                  localityOptions={filteredLocalitiesForDropdown}
                  localityFilter={siteLocalityFilter}
                  onLocalityFilterChange={setSiteLocalityFilter}
                  totalCount={verifiedSiteEntries.length}
                  filteredCount={hasActiveGlobalFilters ? applyGlobalFilters(verifiedSiteEntries).length : verifiedSiteEntries.length}
                  onClearAll={() => { setSiteMmpFilter('all'); setSiteStatusFilter('all'); setSiteHubFilter('all'); setSiteStateFilter('all'); setSiteLocalityFilter('all'); }}
                  title="Filter Verified Sites"
                />
              )}

              {/* Subcategory tabs - below filters */}
              {(isAdmin || isICT || isFOM || isCoordinator || isDataTeam || isSupervisor) && (
                <div className="mb-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">{t('mmpPage.subcategory')}:</div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 flex-wrap">
                    {/* "All" — shows the full MMP directory of verified MMPs */}
                    <Button
                      variant={verifiedSubTab === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setVerifiedSubTab('all')}
                      className={`${verifiedSubTab === 'all' ? 'bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white border-0 shadow-md' : 'hover:bg-slate-50 dark:hover:bg-slate-900'} text-xs whitespace-nowrap flex-shrink-0 rounded-lg transition-all`}
                    >
                      <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                      All
                      <Badge className={`ml-1.5 text-xs ${verifiedSubTab === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'}`}>
                        {totalVerifiedSitesCount}
                      </Badge>
                    </Button>
                    <Button 
                      variant={verifiedSubTab === 'newSites' ? 'default' : 'outline'} 
                      size="sm" 
                      onClick={() => setVerifiedSubTab('newSites')} 
                      className={`${verifiedSubTab === 'newSites' ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 shadow-md' : 'hover:bg-blue-50 dark:hover:bg-blue-950'} text-xs whitespace-nowrap flex-shrink-0 rounded-lg transition-all`}
                    >
                      <FilePlus className="h-3.5 w-3.5 mr-1.5" />
                      {t('mmpPage.subcategories.newSites')}
                      <Badge className={`ml-1.5 text-xs ${verifiedSubTab === 'newSites' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'}`}>
                        {newSitesVerifiedCount}
                      </Badge>
                    </Button>
                    <Button 
                      variant={verifiedSubTab === 'approvedCosted' ? 'default' : 'outline'} 
                      size="sm" 
                      onClick={() => setVerifiedSubTab('approvedCosted')} 
                      className={`${verifiedSubTab === 'approvedCosted' ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white border-0 shadow-md' : 'hover:bg-emerald-50 dark:hover:bg-emerald-950'} text-xs whitespace-nowrap flex-shrink-0 rounded-lg transition-all`}
                    >
                      <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                      {t('mmpPage.subcategories.approved')}
                      <Badge className={`ml-1.5 text-xs ${verifiedSubTab === 'approvedCosted' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'}`}>{verifiedTabSiteEntryCounts.approvedCosted}</Badge>
                    </Button>
                    <Button 
                      variant={verifiedSubTab === 'dispatched' ? 'default' : 'outline'} 
                      size="sm" 
                      onClick={() => setVerifiedSubTab('dispatched')} 
                      className={`${verifiedSubTab === 'dispatched' ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-md' : 'hover:bg-amber-50 dark:hover:bg-amber-950'} text-xs whitespace-nowrap flex-shrink-0 rounded-lg transition-all`}
                    >
                      <Truck className="h-3.5 w-3.5 mr-1.5" />
                      {t('mmpPage.subcategories.dispatched')}
                      <Badge className={`ml-1.5 text-xs ${verifiedSubTab === 'dispatched' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}`}>{verifiedTabSiteEntryCounts.dispatched}</Badge>
                    </Button>
                    {(isAdmin || isICT || isFOM || isSupervisor) && (
                      <>
                        <Button 
                          variant={verifiedSubTab === 'smartAssigned' ? 'default' : 'outline'} 
                          size="sm" 
                          onClick={() => setVerifiedSubTab('smartAssigned')} 
                          className={`${verifiedSubTab === 'smartAssigned' ? 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0 shadow-md' : 'hover:bg-violet-50 dark:hover:bg-violet-950'} text-xs whitespace-nowrap flex-shrink-0 rounded-lg transition-all`}
                        >
                          <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                          {t('mmpPage.subcategories.smartAssigned')}
                          <Badge className={`ml-1.5 text-xs ${verifiedSubTab === 'smartAssigned' ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200'}`}>{verifiedTabSiteEntryCounts.smartAssigned}</Badge>
                        </Button>
                        <Button 
                          variant={verifiedSubTab === 'accepted' ? 'default' : 'outline'} 
                          size="sm" 
                          onClick={() => setVerifiedSubTab('accepted')} 
                          className={`${verifiedSubTab === 'accepted' ? 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white border-0 shadow-md' : 'hover:bg-teal-50 dark:hover:bg-teal-950'} text-xs whitespace-nowrap flex-shrink-0 rounded-lg transition-all`}
                        >
                          <Handshake className="h-3.5 w-3.5 mr-1.5" />
                          {t('mmpPage.subcategories.accepted')}
                          <Badge className={`ml-1.5 text-xs ${verifiedSubTab === 'accepted' ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200'}`}>{verifiedTabSiteEntryCounts.accepted}</Badge>
                        </Button>
                        <Button 
                          variant={verifiedSubTab === 'ongoing' ? 'default' : 'outline'} 
                          size="sm" 
                          onClick={() => setVerifiedSubTab('ongoing')} 
                          className={`${verifiedSubTab === 'ongoing' ? 'bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600 text-white border-0 shadow-md' : 'hover:bg-sky-50 dark:hover:bg-sky-950'} text-xs whitespace-nowrap flex-shrink-0 rounded-lg transition-all`}
                        >
                          <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
                          {t('mmpPage.subcategories.ongoing')}
                          <Badge className={`ml-1.5 text-xs ${verifiedSubTab === 'ongoing' ? 'bg-white/20 text-white' : 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200'}`}>{verifiedTabSiteEntryCounts.ongoing}</Badge>
                        </Button>
                      </>
                    )}
                    <Button 
                      variant={verifiedSubTab === 'completed' ? 'default' : 'outline'} 
                      size="sm" 
                      onClick={() => setVerifiedSubTab('completed')} 
                      className={`${verifiedSubTab === 'completed' ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white border-0 shadow-md' : 'hover:bg-green-50 dark:hover:bg-green-950'} text-xs whitespace-nowrap flex-shrink-0 rounded-lg transition-all`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      {t('mmpPage.subcategories.completed')}
                      <Badge className={`ml-1.5 text-xs ${verifiedSubTab === 'completed' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>{verifiedTabSiteEntryCounts.completed}</Badge>
                    </Button>
                    <Button
                      variant={verifiedSubTab === 'submitted' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setVerifiedSubTab('submitted')}
                      className={`${verifiedSubTab === 'submitted' ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white border-0 shadow-md' : 'hover:bg-indigo-50 dark:hover:bg-indigo-950'} text-xs whitespace-nowrap flex-shrink-0 rounded-lg transition-all`}
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      Submitted
                      <Badge className={`ml-1.5 text-xs ${verifiedSubTab === 'submitted' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'}`}>{verifiedTabSiteEntryCounts.submitted}</Badge>
                    </Button>
                    <Button
                      variant={verifiedSubTab === 'wfpConfirmed' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setVerifiedSubTab('wfpConfirmed')}
                      className={`${verifiedSubTab === 'wfpConfirmed' ? 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white border-0 shadow-md' : 'hover:bg-cyan-50 dark:hover:bg-cyan-950'} text-xs whitespace-nowrap flex-shrink-0 rounded-lg transition-all`}
                    >
                      <FileCheck className="h-3.5 w-3.5 mr-1.5" />
                      WFP Confirmed
                      <Badge className={`ml-1.5 text-xs ${verifiedSubTab === 'wfpConfirmed' ? 'bg-white/20 text-white' : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200'}`}>{verifiedTabSiteEntryCounts.wfpConfirmed}</Badge>
                    </Button>
                    <Button
                      variant={verifiedSubTab === 'notCovered' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setVerifiedSubTab('notCovered')}
                      className={`${verifiedSubTab === 'notCovered' ? 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white border-0 shadow-md' : 'hover:bg-orange-50 dark:hover:bg-orange-950'} text-xs whitespace-nowrap flex-shrink-0 rounded-lg transition-all`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                      Not Covered
                      <Badge className={`ml-1.5 text-xs ${verifiedSubTab === 'notCovered' ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'}`}>{verifiedTabSiteEntryCounts.notCovered}</Badge>
                    </Button>
                    <Button 
                      variant={verifiedSubTab === 'rejected' ? 'default' : 'outline'} 
                      size="sm" 
                      onClick={() => setVerifiedSubTab('rejected')} 
                      className={`${verifiedSubTab === 'rejected' ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white border-0 shadow-md' : 'hover:bg-red-50 dark:hover:bg-red-950 border-red-200 dark:border-red-800'} text-xs whitespace-nowrap flex-shrink-0 rounded-lg transition-all`}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />
                      {t('mmpPage.subcategories.rejected')}
                      <Badge className={`ml-1.5 text-xs ${verifiedSubTab === 'rejected' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>{verifiedTabSiteEntryCounts.rejected}</Badge>
                    </Button>
                  </div>
                </div>
              )}
              
              {verifiedSubTab !== 'approvedCosted' && verifiedSubTab !== 'dispatched' && verifiedSubTab !== 'smartAssigned' && verifiedSubTab !== 'accepted' && verifiedSubTab !== 'ongoing' && verifiedSubTab !== 'completed' && verifiedSubTab !== 'submitted' && verifiedSubTab !== 'wfpConfirmed' && verifiedSubTab !== 'notCovered' && verifiedSubTab !== 'rejected' && verifiedSubTab !== 'newSites' && (
                loading ? (
                  <Card>
                    <CardContent className="py-8">
                      <div className="flex items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                        <span className="text-muted-foreground">{t('common.loading')}</span>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <MMPList mmpFiles={verifiedVisibleMMPs} />
                )
              )}
              {(isAdminOrSuperUser || isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam) && verifiedSubTab === 'newSites' && (
                <>
                  {(isAdminOrSuperUser || isAdmin || isICT) && filteredVerifiedCategorySiteRows.length > 0 && (
                    <div className="mb-4">
                      <Button
                        variant="default"
                        size="lg"
                        disabled={isBulkApproving}
                        onClick={async () => {
                          try {
                            let verifiedEntries: any[] = filteredVerifiedCategorySiteRows;

                            if (tableFilteredCount > 0) {
                              if (tableFilteredEntries.length > 0) {
                                verifiedEntries = tableFilteredEntries;
                              } else if (tableFilteredSiteIds.size > 0) {
                                const matched = filteredVerifiedCategorySiteRows.filter(row => tableFilteredSiteIds.has(row.id));
                                if (matched.length > 0) {
                                  verifiedEntries = matched;
                                }
                              }
                            }

                            if (pendingBulkApproveCount === 0) {
                              const count = verifiedEntries.length;
                              const filteredNote = tableFilteredCount > 0 ? ` (filtered from ${filteredVerifiedCategorySiteRows.length} total)` : '';
                              setPendingBulkApproveCount(count);
                              toast({ title: 'Click "Approve and Cost" again to confirm', description: `Will approve and cost ${count} site(s)${filteredNote}.` });
                              return;
                            }
                            setPendingBulkApproveCount(0);

                            if (!verifiedEntries || verifiedEntries.length === 0) {
                              toast({
                                title: 'No Sites to Process',
                                description: 'There are no verified or approved sites to process.',
                                variant: 'default'
                              });
                              return;
                            }

                            setIsBulkApproving(true);

                            const approvedAt = new Date().toISOString();
                            const approvedBy = currentUser?.username || currentUser?.fullName || currentUser?.email || 'System';

                            const updates = verifiedEntries.map((entry: any) => {
                              const currentCost = entry.cost;
                              const enumFee = entry.enumerator_fee ?? entry.enumeratorFee;
                              const transFee = entry.transport_fee ?? entry.transportFee;
                              const bothFeesPresent = (enumFee !== undefined && enumFee !== null) && (transFee !== undefined && transFee !== null);
                              const finalCost = bothFeesPresent ? Number(enumFee) + Number(transFee) : currentCost;

                              const cleanedAdditionalData = { ...(entry.additional_data || entry.additionalData || {}) };
                              delete cleanedAdditionalData.claimed_by;
                              delete cleanedAdditionalData.claimed_at;
                              delete cleanedAdditionalData.assigned_to;
                              delete cleanedAdditionalData.assigned_by;
                              delete cleanedAdditionalData.assigned_at;
                              delete cleanedAdditionalData.dispatched_by;
                              delete cleanedAdditionalData.dispatched_at;
                              const additional_data = {
                                ...cleanedAdditionalData,
                                ...(enumFee !== undefined ? { enumerator_fee: enumFee } : {}),
                                ...(transFee !== undefined ? { transport_fee: transFee } : {}),
                                ...(finalCost !== undefined ? { cost: finalCost } : {}),
                                approved_and_costed_at: approvedAt,
                                approved_and_costed_by: approvedBy
                              };

                              return {
                                id: entry.id,
                                status: 'Approved and Costed',
                                ...(finalCost !== undefined ? { cost: finalCost } : {}),
                                ...(enumFee !== undefined ? { enumerator_fee: enumFee } : {}),
                                ...(transFee !== undefined ? { transport_fee: transFee } : {}),
                                additional_data
                              } as any;
                            });

                            const batchSize = 25;
                            for (let i = 0; i < updates.length; i += batchSize) {
                              const batch = updates.slice(i, i + batchSize);
                              await Promise.all(batch.map(update => {
                                const payload: any = { 
                                  status: update.status, 
                                  additional_data: update.additional_data,
                                  accepted_by: null,
                                  accepted_at: null,
                                  dispatched_at: null,
                                  dispatched_by: null,
                                };
                                if (update.cost !== undefined) payload.cost = update.cost;
                                if (update.enumerator_fee !== undefined) payload.enumerator_fee = update.enumerator_fee;
                                if (update.transport_fee !== undefined) payload.transport_fee = update.transport_fee;
                                return supabase
                                  .from('mmp_site_entries')
                                  .update(payload)
                                  .eq('id', update.id);
                              }));
                            }

                            const reApprovedIds = updates.map((u: any) => u.id);
                            if (reApprovedIds.length > 0) {
                              try {
                                const batchIdSize = 50;
                                const allLinkedDpRequests: any[] = [];
                                for (let i = 0; i < reApprovedIds.length; i += batchIdSize) {
                                  const idBatch = reApprovedIds.slice(i, i + batchIdSize);
                                  const { data } = await supabase
                                    .from('down_payment_requests')
                                    .select('id, mmp_site_entry_id, status, metadata')
                                    .in('mmp_site_entry_id', idBatch)
                                    .in('status', ['approved', 'pending_admin', 'pending_supervisor', 'pending']);
                                  if (data) allLinkedDpRequests.push(...data);
                                }
                                
                                if (allLinkedDpRequests.length > 0) {
                                  const dpBatchSize = 10;
                                  for (let i = 0; i < allLinkedDpRequests.length; i += dpBatchSize) {
                                    const dpBatch = allLinkedDpRequests.slice(i, i + dpBatchSize);
                                    await Promise.all(dpBatch.map(dpReq => {
                                      const existingMeta = (dpReq.metadata as Record<string, any>) || {};
                                      return supabase
                                        .from('down_payment_requests')
                                        .update({
                                          status: 'cancelled',
                                          updated_at: approvedAt,
                                          metadata: {
                                            ...existingMeta,
                                            cancelled_reason: 'Site re-approved and costed - advance request voided',
                                            cancelled_at: approvedAt,
                                            cancelled_by: approvedBy,
                                          }
                                        })
                                        .eq('id', dpReq.id);
                                    }));
                                  }
                                }
                              } catch (dpClearError) {
                                console.error('Failed to clear linked advance requests:', dpClearError);
                              }
                            }

                            setIsBulkApproving(false);
                            toast({
                              title: 'Bulk Cost Successful',
                              description: `Successfully approved and costed ${updates.length} site(s).`,
                              variant: 'default'
                            });

                            window.location.reload();
                          } catch (error: any) {
                            setIsBulkApproving(false);
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
                        {isBulkApproving ? (
                          <span className="flex items-center gap-2">
                            <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                            Processing...
                          </span>
                        ) : pendingBulkApproveCount > 0 ? (
                          <>Click again to confirm ({pendingBulkApproveCount} sites)</>
                        ) : (
                          <>Approve for Costing ({tableFilteredCount > 0 ? `${tableFilteredCount} filtered` : filteredVerifiedCategorySiteRows.length} sites)</>
                        )}
                      </Button>
                    </div>
                  )}
                  <VerifiedSitesDisplay 
                    verifiedSites={filteredVerifiedCategorySiteRows} 
                    showApproveButton={isAdmin || isICT || isFOM || isDataTeam}
                    onFilteredSiteIdsChange={(ids, count, hasFilter, entries) => {
                      setTableFilteredSiteIds(ids);
                      setTableFilteredCount(hasFilter ? count : 0);
                      setTableFilteredEntries(hasFilter ? entries : []);
                    }}
                    onApproveForCosting={async (site) => {
                      try {
                        const currentCost = site.cost;
                        const enumFee = site.enumerator_fee ?? site.enumeratorFee;
                        const transFee = site.transport_fee ?? site.transportFee;
                        const bothFeesPresent = (enumFee !== undefined && enumFee !== null) && (transFee !== undefined && transFee !== null);
                        const finalCost = bothFeesPresent ? Number(enumFee) + Number(transFee) : currentCost;

                        const cleanedData = { ...(site.additional_data || site.additionalData || {}) };
                        delete cleanedData.claimed_by;
                        delete cleanedData.claimed_at;
                        delete cleanedData.assigned_to;
                        delete cleanedData.assigned_by;
                        delete cleanedData.assigned_at;
                        delete cleanedData.dispatched_by;
                        delete cleanedData.dispatched_at;
                        const additional_data = {
                          ...cleanedData,
                          ...(enumFee !== undefined ? { enumerator_fee: enumFee } : {}),
                          ...(transFee !== undefined ? { transport_fee: transFee } : {}),
                          ...(finalCost !== undefined ? { cost: finalCost } : {}),
                          approved_and_costed_at: new Date().toISOString(),
                          approved_and_costed_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System'
                        };

                        const payload: any = { 
                          status: 'costed', 
                          additional_data,
                          accepted_by: null,
                          accepted_at: null,
                          dispatched_at: null,
                          dispatched_by: null,
                        };
                        if (finalCost !== undefined) payload.cost = finalCost;
                        if (enumFee !== undefined) payload.enumerator_fee = enumFee;
                        if (transFee !== undefined) payload.transport_fee = transFee;

                        const { error } = await supabase
                          .from('mmp_site_entries')
                          .update(payload)
                          .eq('id', site.id);

                        if (error) throw error;

                        toast({
                          title: 'Site Approved',
                          description: `Successfully approved "${site.siteName || site.site_name}" for costing.`,
                          variant: 'default'
                        });

                        // Refresh data
                        await refreshMMPFiles();
                      } catch (error: any) {
                        console.error('Error approving site:', error);
                        toast({
                          title: 'Approval Failed',
                          description: error.message || 'Failed to approve site. Please try again.',
                          variant: 'destructive'
                        });
                      }
                    }}
                  />
                </>
              )}
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam) && verifiedSubTab === 'approvedCosted' && (
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
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Approved & Costed Site Entries</h3>
                        <Badge variant="secondary">{approvedCostedSiteEntries.length} entries</Badge>
                      </div>
                      {(isAdmin || isICT || isDataTeam) && approvedCostedSiteEntries.length > 0 && (
                        <div className="mb-4 flex flex-wrap gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setDispatchType('open');
                              setDispatchDialogOpen(true);
                            }}
                            data-testid="button-open-dispatch"
                          >
                            Dispatch for Claim
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDispatchType('state');
                              setDispatchDialogOpen(true);
                            }}
                            disabled={approvedCostedSiteEntries.length < 2}
                            title={approvedCostedSiteEntries.length < 2 ? 'Bulk dispatch requires at least 2 sites' : ''}
                          >
                            By State
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDispatchType('locality');
                              setDispatchDialogOpen(true);
                            }}
                            disabled={approvedCostedSiteEntries.length < 2}
                            title={approvedCostedSiteEntries.length < 2 ? 'Bulk dispatch requires at least 2 sites' : ''}
                          >
                            By Locality
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDispatchType('individual');
                              setDispatchDialogOpen(true);
                            }}
                          >
                            Assign to Specific Collector
                          </Button>
                        </div>
                      )}
                      <MMPSiteEntriesTable 
                        siteEntries={applyGlobalFilters(approvedCostedSiteEntries)} 
                        editable={true}
                        onUpdateSites={async (sites) => {
                          // Update mmp_site_entries in database
                          try {
                            for (const site of sites) {
                              // Get fees values
                              const enumFee = site.enumerator_fee;
                              const transFee = site.transport_fee;
                              
                              // Always calculate cost from fees if both are present
                              let calculatedCost: number | undefined;
                              if (enumFee !== undefined && transFee !== undefined) {
                                calculatedCost = Number(enumFee) + Number(transFee);
                              }
                              
                              // Use calculated cost if available, otherwise use provided cost
                              const finalCost = calculatedCost ?? site.cost;
                              
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
                                verified_at: site.verified_at || site.verifiedAt
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
                            let approvedCostedEntries: any[] = [];
                            for (let _af = 0; ; _af += 1000) {
                              const { data: _ap } = await supabase.from('mmp_site_entries').select('*').or('status.ilike.%Approved and Costed%,status.ilike.%approved%costed%').order('created_at', { ascending: false }).range(_af, _af + 999);
                              if (!_ap) break;
                              approvedCostedEntries = [...approvedCostedEntries, ..._ap];
                              if (_ap.length < 1000) break;
                            }

                            if (approvedCostedEntries.length >= 0) {
                              
                              const formattedEntries = approvedCostedEntries.map(entry => {
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
                                  enumerator_fee: entry.enumerator_fee,
                                  enumeratorFee: entry.enumerator_fee,
                                  transport_fee: entry.transport_fee,
                                  transportFee: entry.transport_fee,
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
                    </>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam) && verifiedSubTab === 'dispatched' && (
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
                      <div className="flex flex-col gap-3 mb-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">Dispatched Site Entries</h3>
                          <Badge variant="secondary">{filteredDispatchedEntries.length} of {globalFilteredDispatchedEntries.length} entries</Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-muted-foreground">State:</label>
                            <Select value={dispatchedStateFilter} onValueChange={(val) => {
                              setDispatchedStateFilter(val);
                              setDispatchedLocalityFilter('all');
                            }}>
                              <SelectTrigger className="w-[180px] h-8">
                                <SelectValue placeholder="All States" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All States</SelectItem>
                                {dispatchedFilterOptions.states.map(state => (
                                  <SelectItem key={state} value={state}>{state}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-muted-foreground">Locality:</label>
                            <Select 
                              value={dispatchedLocalityFilter} 
                              onValueChange={setDispatchedLocalityFilter}
                              disabled={dispatchedStateFilter === 'all'}
                            >
                              <SelectTrigger className="w-[180px] h-8">
                                <SelectValue placeholder="All Localities" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Localities</SelectItem>
                                {(dispatchedStateFilter !== 'all' && dispatchedFilterOptions.localitiesByState[dispatchedStateFilter] || []).map(locality => (
                                  <SelectItem key={locality} value={locality}>{locality}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {(dispatchedStateFilter !== 'all' || dispatchedLocalityFilter !== 'all') && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setDispatchedStateFilter('all');
                                setDispatchedLocalityFilter('all');
                              }}
                              className="h-8"
                            >
                              Clear Filters
                            </Button>
                          )}
                        </div>
                      </div>
                      <MMPSiteEntriesTable 
                        siteEntries={filteredDispatchedEntries} 
                        editable={false}
                      />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isSupervisor || isDataTeam) && verifiedSubTab === 'smartAssigned' && (
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
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam) && verifiedSubTab === 'accepted' && (
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
                        <Badge variant="secondary">{applyGlobalFilters(acceptedSiteEntries).length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable 
                        siteEntries={applyGlobalFilters(acceptedSiteEntries)} 
                        editable={false}
                      />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam) && verifiedSubTab === 'ongoing' && (
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
                        <Badge variant="secondary">{applyGlobalFilters(ongoingSiteEntries).length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable 
                        siteEntries={applyGlobalFilters(ongoingSiteEntries)} 
                        editable={false}
                      />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam) && verifiedSubTab === 'completed' && (
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
                        <Badge variant="secondary">{applyGlobalFilters(completedSiteEntries).length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable 
                        siteEntries={applyGlobalFilters(completedSiteEntries)} 
                        editable={false}
                      />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam) && verifiedSubTab === 'rejected' && (
                <div className="mt-6">
                  {loadingRejected ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">Loading rejected site entries...</div>
                      </CardContent>
                    </Card>
                  ) : rejectedSiteEntries.length === 0 ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">No rejected site entries found.</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Rejected Site Entries</h3>
                        <Badge variant="secondary">{applyGlobalFilters(rejectedSiteEntries).length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable 
                        siteEntries={applyGlobalFilters(rejectedSiteEntries)} 
                        editable={false}
                      />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam) && verifiedSubTab === 'submitted' && (
                <div className="mt-6">
                  {filteredVerifiedCategorySiteRows.length === 0 ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">No submitted site entries found.</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Submitted Site Entries</h3>
                        <Badge variant="secondary">{filteredVerifiedCategorySiteRows.length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable siteEntries={filteredVerifiedCategorySiteRows} editable={false} />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam) && verifiedSubTab === 'wfpConfirmed' && (
                <div className="mt-6">
                  {filteredVerifiedCategorySiteRows.length === 0 ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">No WFP-confirmed site entries found.</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">WFP Confirmed Site Entries</h3>
                        <Badge variant="secondary">{filteredVerifiedCategorySiteRows.length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable siteEntries={filteredVerifiedCategorySiteRows} editable={false} />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam) && verifiedSubTab === 'notCovered' && (
                <div className="mt-6">
                  {filteredVerifiedCategorySiteRows.length === 0 ? (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">No not-covered site entries found.</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Not Covered Site Entries</h3>
                        <Badge variant="secondary">{filteredVerifiedCategorySiteRows.length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable siteEntries={filteredVerifiedCategorySiteRows} editable={false} />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator || isDataTeam) && verifiedSubTab !== 'newSites' && verifiedSubTab !== 'approvedCosted' && verifiedSubTab !== 'dispatched' && verifiedSubTab !== 'accepted' && verifiedSubTab !== 'ongoing' && verifiedSubTab !== 'completed' && verifiedSubTab !== 'submitted' && verifiedSubTab !== 'wfpConfirmed' && verifiedSubTab !== 'notCovered' && verifiedSubTab !== 'rejected' && (
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

            {canClaimSites && (
              <TabsContent value="enumerator">
                <div className="mb-4">
                  <div className="text-sm font-medium text-muted-foreground mb-2">View:</div>
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      variant={enumeratorSubTab === 'availableSites' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setEnumeratorSubTab('availableSites')} 
                      className={`flex items-center gap-1.5 flex-shrink-0 ${enumeratorSubTab === 'availableSites' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : 'hover:bg-gray-50'}`}
                      data-testid="tab-available-sites"
                      aria-label="View available sites"
                    >
                      <span className="whitespace-nowrap">Claimable</span>
                      <Badge variant="secondary" className="text-xs px-1.5 py-0.5 min-w-[1.25rem] h-5 flex items-center justify-center">{Object.values(enumeratorGroupedByStates).flat().length}</Badge>
                    </Button>
                    <Button 
                      variant={enumeratorSubTab === 'smartAssigned' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setEnumeratorSubTab('smartAssigned')} 
                      className={`flex items-center gap-1.5 flex-shrink-0 ${enumeratorSubTab === 'smartAssigned' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : 'hover:bg-gray-50'}`}
                      data-testid="tab-smart-assigned"
                      aria-label="View smart assigned sites"
                    >
                      <span className="whitespace-nowrap">Assigned</span>
                      <Badge variant="secondary" className="text-xs px-1.5 py-0.5 min-w-[1.25rem] h-5 flex items-center justify-center">{enumeratorSmartAssigned.length}</Badge>
                    </Button>
                    <Button 
                      variant={enumeratorSubTab === 'mySites' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setEnumeratorSubTab('mySites')} 
                      className={`flex items-center gap-1.5 flex-shrink-0 ${enumeratorSubTab === 'mySites' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : 'hover:bg-gray-50'}`}
                      data-testid="tab-my-sites"
                      aria-label="View my sites"
                    >
                      <span className="whitespace-nowrap">My Sites</span>
                      <Badge variant="secondary" className="text-xs px-1.5 py-0.5 min-w-[1.25rem] h-5 flex items-center justify-center">{enumeratorMySites.length}</Badge>
                    </Button>
                  </div>

                  {enumeratorSubTab === 'mySites' && (
                    <div className="mt-3">
                      <div className="text-sm font-medium text-muted-foreground mb-2">Subcategories:</div>
                      <div className="flex gap-1">
                          <Button 
                            variant={mySitesSubTab === 'pending' ? 'default' : 'outline'} 
                            size="sm" 
                            onClick={() => setMySitesSubTab('pending')} 
                            className={`${mySitesSubTab === 'pending' ? 'bg-green-100 hover:bg-green-200 text-green-800 border border-green-300' : ''} flex-shrink-0 whitespace-nowrap`}
                          >
                            Inbox
                            <Badge variant="secondary" className="ml-0.5 text-xs px-0.5 py-0.5 min-w-[0.75rem] h-3 flex items-center justify-center">
                              {enumeratorMySites.filter(site => {
                                if (isDraftStatus(site.status)) return false;
                                if (isCompletedStatus(site.status)) return false;
                                if (unsyncedCompletedVisits.some(uv => uv.id === site.id)) return false;
                                return true;
                              }).length}
                            </Badge>
                          </Button>
                          <Button 
                            variant={mySitesSubTab === 'all' ? 'default' : 'outline'} 
                            size="sm" 
                            onClick={() => setMySitesSubTab('all')} 
                            className={`${mySitesSubTab === 'all' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''} flex-shrink-0 whitespace-nowrap`}
                          >
                            Drafts
                            <Badge variant="secondary" className="ml-0.5 text-xs px-0.5 py-0.5 min-w-[0.75rem] h-3 flex items-center justify-center">
                              {enumeratorMySites.filter(site => isDraftStatus(site.status)).length}
                            </Badge>
                          </Button>
                          <Button 
                            variant={mySitesSubTab === 'ongoing' ? 'default' : 'outline'} 
                            size="sm" 
                            onClick={() => setMySitesSubTab('ongoing')} 
                            className={`${mySitesSubTab === 'ongoing' ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300' : ''} flex-shrink-0 whitespace-nowrap`}
                          >
                            Outbox
                            <Badge variant="secondary" className="ml-0.5 text-xs px-0.5 py-0.5 min-w-[0.75rem] h-3 flex items-center justify-center">
                              {unsyncedCompletedVisits.length}
                            </Badge>
                          </Button>
                          <Button 
                            variant={mySitesSubTab === 'completed' ? 'default' : 'outline'} 
                            size="sm" 
                            onClick={() => setMySitesSubTab('completed')} 
                            className={`${mySitesSubTab === 'completed' ? 'bg-green-100 hover:bg-green-200 text-green-800 border border-green-300' : ''} flex-shrink-0 whitespace-nowrap`}
                          >
                            Sent
                            <Badge variant="secondary" className="ml-0.5 text-xs px-0.5 py-0.5 min-w-[0.75rem] h-3 flex items-center justify-center">
                              {enumeratorMySites.filter(site => {
                                if (!isCompletedStatus(site.status)) return false;
                                return !unsyncedCompletedVisits.some(uv => uv.id === site.id);
                              }).length}
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
                  <div className="space-y-4">
                    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
                      <CardContent className="py-4 px-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-full shrink-0">
                            <Hand className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-blue-900 dark:text-blue-100 text-base">First-Come, First-Served</h3>
                            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                              Tap <span className="font-semibold">"Claim Site"</span> to assign a site to yourself. Be quick - other enumerators can see these sites too!
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
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
                                showClaimButton={true}
                                currentUserId={currentUser?.id}
                                onSiteClaimed={() => {
                                  setEnumeratorSiteEntries(prev => prev.filter(s => !sites.find(site => site.id === s.id && s.accepted_by)));
                                  setEnumeratorRefreshTrigger(prev => prev + 1);
                                }}
                                onUpdateSites={async (updatedSites) => {
                                  // Handle updates for enumerator sites
                                  try {
                                    for (const site of updatedSites) {
                                      const enumFee = site.enumerator_fee;
                                      const transFee = site.transport_fee;
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
                                    let updatedEntries: any[] = [];
                                    for (let _uf = 0; ; _uf += 1000) {
                                      const { data: _up } = await supabase.from('mmp_site_entries').select('*').or('status.ilike.dispatched,dispatched_at.not.is.null').or(`state.eq.${currentUser?.stateId},locality.eq.${currentUser?.localityId}`).order('created_at', { ascending: false }).range(_uf, _uf + 999);
                                      if (!_up) break;
                                      updatedEntries = [...updatedEntries, ..._up];
                                      if (_up.length < 1000) break;
                                    }
                                    
                                    if (updatedEntries.length >= 0) {
                                      const formattedEntries = updatedEntries.map(entry => {
                                        const additionalData = entry.additional_data || {};
                                        return {
                                          ...entry,
                                          siteName: entry.site_name,
                                          siteCode: entry.site_code,
                                          enumerator_fee: entry.enumerator_fee,
                                          enumeratorFee: entry.enumerator_fee,
                                          transport_fee: entry.transport_fee,
                                          transportFee: entry.transport_fee,
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
                            ? (mySitesSubTab === 'pending' ? 'Pending Visits' 
                               : mySitesSubTab === 'ongoing' ? 'Ongoing Visits' 
                               : mySitesSubTab === 'all' ? 'Drafts (In-Progress & Ongoing Visits)'
                               : 'Completed Sites')
                            : 'Smart Assigned Sites'
                          }
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {enumeratorSubTab === 'mySites'
                            ? (mySitesSubTab === 'pending' 
                                ? 'Sites that have been accepted or smart assigned' 
                                : mySitesSubTab === 'ongoing'
                                ? 'Completed visits stored offline - will sync automatically when internet is available'
                                : mySitesSubTab === 'all'
                                ? 'In-progress and ongoing site visits (drafts) - sites that have been started but not completed'
                                : 'Completed visits that have been successfully submitted and synced')
                            : 'Sites assigned to your area that must be visited'
                          }
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {enumeratorSubTab === 'mySites'
                          ? (mySitesSubTab === 'pending' 
                              ? enumeratorMySites.filter(site => {
                                  if (isDraftStatus(site.status)) return false;
                                  if (isCompletedStatus(site.status)) return false;
                                  if (unsyncedCompletedVisits.some(uv => uv.id === site.id)) return false;
                                  return true;
                                }).length
                              : mySitesSubTab === 'ongoing'
                              ? unsyncedCompletedVisits.length
                              : mySitesSubTab === 'all'
                              ? enumeratorMySites.filter(site => isDraftStatus(site.status)).length
                              : enumeratorMySites.filter(site => {
                                  if (!isCompletedStatus(site.status)) return false;
                                  return !unsyncedCompletedVisits.some(uv => uv.id === site.id);
                                }).length)
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
                      let sitesToShow: any[] = [];
                      if (enumeratorSubTab === 'mySites') {
                        if (mySitesSubTab === 'all') {
                          sitesToShow = enumeratorMySites.filter(site => isDraftStatus(site.status));
                        } else if (mySitesSubTab === 'pending') {
                          sitesToShow = enumeratorMySites.filter(site => {
                            if (isDraftStatus(site.status)) return false;
                            if (isCompletedStatus(site.status)) return false;
                            if (unsyncedCompletedVisits.some(uv => uv.id === site.id)) return false;
                            return true;
                          });
                        } else if (mySitesSubTab === 'ongoing') {
                          sitesToShow = unsyncedCompletedVisits;
                        } else if (mySitesSubTab === 'completed') {
                          sitesToShow = enumeratorMySites.filter(site => {
                            if (!isCompletedStatus(site.status)) return false;
                            return !unsyncedCompletedVisits.some(uv => uv.id === site.id);
                          });
                        } else {
                          // Fallback: show nothing (should not reach here)
                          sitesToShow = [];
                        }
                      } else {
                        sitesToShow = enumeratorSmartAssigned;
                      }
                      
                      return sitesToShow.length === 0 ? (
                        <Card>
                          <CardContent className="py-8">
                            <div className="text-center text-muted-foreground">
                              {enumeratorSubTab === 'mySites'
                                ? (mySitesSubTab === 'pending' 
                                    ? 'No pending visits found.' 
                                    : mySitesSubTab === 'ongoing'
                                    ? 'No completed visits waiting to sync. All visits have been submitted.'
                                    : mySitesSubTab === 'all'
                                    ? 'No in-progress or ongoing site visits found. Start a visit to see it here.'
                                    : 'No completed sites found.')
                                : 'No sites assigned to you yet.'
                              }
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <MMPSiteEntriesTable 
                          key={`enumerator-${enumeratorSubTab}-${mySitesSubTab}`}
                          siteEntries={sitesToShow} 
                          editable={enumeratorSubTab === 'mySites' && mySitesSubTab !== 'completed'}
                          onAcceptSite={enumeratorSubTab === 'smartAssigned' ? handleAcceptSite : undefined}
                          onAcknowledgeCost={enumeratorSubTab === 'smartAssigned' ? handleCostAcknowledgment : undefined}
                          onStartVisit={mySitesSubTab === 'completed' ? undefined : handleStartVisit}
                          onCompleteVisit={
                            enumeratorSubTab === 'mySites' 
                              && (mySitesSubTab === 'pending' 
                                  || mySitesSubTab === 'ongoing' 
                                  || mySitesSubTab === 'all')
                              ? handleCompleteVisit 
                              : undefined
                          }
                          currentUserId={currentUser?.id}
                          showAcceptRejectForAssigned={enumeratorSubTab === 'smartAssigned'}
                          showVisitActions={true}
                          onUpdateSites={async (updatedSites) => {
                            // Same update logic as above
                            try {
                              for (const site of updatedSites) {
                                const enumFee = site.enumerator_fee;
                                const transFee = site.transport_fee;
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
                              // Reload available sites data as well (paginated)
                              const [smartData, myData, availableData] = await Promise.all([
                                (async () => { let all: any[] = []; for (let f = 0; ; f += 1000) { const { data: p } = await supabase.from('mmp_site_entries').select('*').eq('accepted_by', currentUser?.id).order('created_at', { ascending: false }).range(f, f + 999); if (!p) break; all = [...all, ...p]; if (p.length < 1000) break; } return all; })(),
                                (async () => { let all: any[] = []; for (let f = 0; ; f += 1000) { const { data: p } = await supabase.from('mmp_site_entries').select('*').or(`accepted_by.eq.${currentUser?.id},and(status.ilike.dispatched,accepted_by.is.null,or(state.eq.${currentUser?.stateId},locality.eq.${currentUser?.localityId}))`).order('created_at', { ascending: false }).range(f, f + 999); if (!p) break; all = [...all, ...p]; if (p.length < 1000) break; } return all; })(),
                                (async () => { let all: any[] = []; for (let f = 0; ; f += 1000) { const { data: p } = await supabase.from('mmp_site_entries').select('*').or('status.ilike.dispatched,dispatched_at.not.is.null').or(`state.eq.${currentUser?.stateId},locality.eq.${currentUser?.localityId}`).order('created_at', { ascending: false }).range(f, f + 999); if (!p) break; all = [...all, ...p]; if (p.length < 1000) break; } return all; })(),
                              ]);

                              // Format and set
                              const format = (entries: any[]) => entries.map((entry: any) => {
                                const additionalData = entry.additional_data || {};
                                return {
                                  ...entry,
                                  siteName: entry.site_name,
                                  siteCode: entry.site_code,
                                  enumerator_fee: entry.enumerator_fee,
                                  enumeratorFee: entry.enumerator_fee,
                                  transport_fee: entry.transport_fee,
                                  transportFee: entry.transport_fee,
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
            
            {/* MMP Tracker Status Tab */}
            {!canClaimSites && (
              <TabsContent value="tracker">
                {loading ? (
                  <Card>
                    <CardContent className="py-8">
                      <div className="flex items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                        <span className="text-muted-foreground">{t('common.loading')}</span>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <WorkflowTrackerTab 
                    mmpFiles={trackerMMPs} 
                    coordinators={coordinatorsList.map(c => ({ id: c.id, name: c.fullName || c.email || 'Unknown' }))}
                  />
                )}
              </TabsContent>
            )}

            {/* Ad-hoc Site Visits Tab */}
            {(isSuperAdmin || isAdmin || isFOM || isCoordinator) && (
              <TabsContent value="adhoc">
                <AdhocSiteVisitsTab canManage={isSuperAdmin || isAdmin || isFOM || isCoordinator} />
              </TabsContent>
            )}
          </Tabs>
      {(isAdmin || isICT) && (
        <>
        <BulkClearForwardedDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen} />
          <DispatchSitesDialog
            open={dispatchDialogOpen}
            onOpenChange={setDispatchDialogOpen}
            siteEntries={approvedCostedSiteEntries}
            dispatchType={dispatchType}
            onDispatched={async () => {
              await refreshMMPFiles();
              if (verifiedSubTab === 'dispatched') {
                let dispatchedEntries: any[] = [];
                for (let _df = 0; ; _df += 1000) {
                  const { data: _dp } = await supabase.from('mmp_site_entries').select('*').in('status', ['Dispatched', 'dispatched']).is('accepted_by', null).order('dispatched_at', { ascending: false }).range(_df, _df + 999);
                  if (!_dp) break;
                  dispatchedEntries = [...dispatchedEntries, ..._dp];
                  if (_dp.length < 1000) break;
                }

                if (dispatchedEntries.length >= 0) {

                  const formattedEntries = dispatchedEntries.map(entry => {
                    const additionalData = entry.additional_data || {};
                    const enumeratorFee = entry.enumerator_fee;
                    const transportFee = entry.transport_fee;
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
                let approvedCostedEntries: any[] = [];
                for (let _acf = 0; ; _acf += 1000) {
                  const { data: _acp } = await supabase.from('mmp_site_entries').select('*').or('status.ilike.%Approved and Costed%,status.ilike.%approved%costed%').order('created_at', { ascending: false }).range(_acf, _acf + 999);
                  if (!_acp) break;
                  approvedCostedEntries = [...approvedCostedEntries, ..._acp];
                  if (_acp.length < 1000) break;
                }

                if (approvedCostedEntries.length >= 0) {
                  const formattedEntries = approvedCostedEntries.map(entry => {
                    const additionalData = entry.additional_data || {};
                    const enumeratorFee = entry.enumerator_fee;
                    const transportFee = entry.transport_fee;
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

              {/* Section 2: Total Visit Cost */}
              <div className="bg-gray-50 p-5 rounded-lg border space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b">
                  <div className="bg-gray-700 text-white rounded w-6 h-6 flex items-center justify-center font-semibold text-sm">
                    2
                  </div>
                  <h3 className="text-base font-semibold text-gray-900">Total Visit Cost</h3>
                </div>
                <div className="bg-blue-600 p-6 rounded-lg border border-blue-700 text-center">
                  <p className="text-sm font-medium text-blue-100 mb-3">Total Amount for This Visit</p>
                  {(() => {
                    const enumeratorFee = Number(selectedSiteForAcknowledgment.enumerator_fee) || 0;
                    const transportFee = Number(selectedSiteForAcknowledgment.transport_fee) || 0;
                    const totalCost = selectedSiteForAcknowledgment.cost || (enumeratorFee + transportFee);
                    return totalCost > 0 ? (
                      <p className="text-4xl font-bold text-white">
                        {Number(totalCost).toLocaleString()} SDG
                      </p>
                    ) : (
                      <p className="text-2xl font-bold text-blue-100">Pending</p>
                    );
                  })()}
                  <p className="text-sm text-blue-100 mt-4">
                    This is the total amount for your visit (transportation and your fees)
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Upon successful completion of the site visit, this amount will be credited to your wallet. 
                    Payment is processed automatically after you submit your visit report.
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
                    if (canClaimSites && currentUser?.id) {
                      try {
                        // Convert user location IDs to names for matching
                        const collectorStateName = currentUser.stateId 
                          ? sudanStates.find(s => s.id === currentUser.stateId)?.name 
                          : undefined;
                        const collectorLocalityName = currentUser.stateId && currentUser.localityId
                          ? sudanStates.find(s => s.id === currentUser.stateId)?.localities.find(l => l.id === currentUser.localityId)?.name
                          : undefined;

                        // Load available sites, smart assigned, my sites — all paginated
                        const locationConditions: string[] = [];
                        if (collectorStateName) locationConditions.push(`state.ilike.${collectorStateName}`);
                        if (collectorLocalityName) locationConditions.push(`locality.ilike.${collectorLocalityName}`);

                        const [availableRes, smartRes, mySitesRes] = await Promise.all([
                          (async () => {
                            let all: any[] = [];
                            for (let f = 0; ; f += 1000) {
                              let q = supabase.from('mmp_site_entries').select('*').in('status', ['Dispatched', 'dispatched']).is('accepted_by', null).order('created_at', { ascending: false });
                              if (locationConditions.length > 0) q = q.or(locationConditions.join(','));
                              const { data: p } = await q.range(f, f + 999);
                              if (!p) break;
                              all = [...all, ...p];
                              if (p.length < 1000) break;
                            }
                            return { data: all };
                          })(),
                          (async () => {
                            let all: any[] = [];
                            for (let f = 0; ; f += 1000) {
                              const { data: p } = await supabase.from('mmp_site_entries').select('*').in('status', ['Assigned', 'assigned']).eq('accepted_by', currentUser.id).order('created_at', { ascending: false }).range(f, f + 999);
                              if (!p) break;
                              all = [...all, ...p];
                              if (p.length < 1000) break;
                            }
                            return { data: all };
                          })(),
                          (async () => {
                            let all: any[] = [];
                            for (let f = 0; ; f += 1000) {
                              const { data: p } = await supabase.from('mmp_site_entries').select('*').eq('accepted_by', currentUser.id).order('created_at', { ascending: false }).range(f, f + 999);
                              if (!p) break;
                              all = [...all, ...p];
                              if (p.length < 1000) break;
                            }
                            return { data: all };
                          })(),
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
                          const enumeratorFee = entry.enumerator_fee;
                          const transportFee = entry.transport_fee;
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

      {/* State Permit Upload Dialog for Returned Sites */}
      <Dialog open={returnedStatePermitDialogOpen} onOpenChange={setReturnedStatePermitDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload State Permit & Forward Sites</DialogTitle>
            <DialogDescription>
              Upload a state permit for {selectedReturnedState?.state} and select a coordinator to forward the sites to.
            </DialogDescription>
          </DialogHeader>
          {selectedReturnedState && (
            <div className="space-y-6 py-4">
              {/* Sites Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">{selectedReturnedState.sites.length} site(s) in {selectedReturnedState.state}</h4>
                <p className="text-sm text-muted-foreground">
                  These sites were returned by the coordinator and require a state permit before being forwarded again.
                </p>
              </div>

              {/* Coordinator Selection */}
              <div className="space-y-2">
                <Label>Select Coordinator</Label>
                <Select 
                  value={selectedCoordinatorForReturned} 
                  onValueChange={(val) => {
                    setSelectedCoordinatorForReturned(val);
                    // Auto-select supervisor for the hub that has the coordinator's state
                    const coord = coordinatorsList.find(c => c.id === val);
                    if (coord && coord.stateId) {
                      const hubForState = hubStatesList.find(hs => hs.state_id === coord.stateId);
                      if (hubForState) {
                        const supervisorForHub = supervisorsList.find(s => s.hubId === hubForState.hub_id);
                        if (supervisorForHub) {
                          setSelectedSupervisorForReturned(supervisorForHub.id);
                        }
                      }
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select coordinator..." />
                  </SelectTrigger>
                  <SelectContent>
                    {coordinatorsList.map(coord => (
                      <SelectItem key={coord.id} value={coord.id}>
                        {coord.fullName || coord.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Supervisor Selection */}
              <div className="space-y-2">
                <Label>Select Supervisor (optional - for notifications)</Label>
                <Select value={selectedSupervisorForReturned} onValueChange={setSelectedSupervisorForReturned}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supervisor (optional)..." />
                  </SelectTrigger>
                  <SelectContent>
                    {supervisorsList.map(sup => (
                      <SelectItem key={sup.id} value={sup.id}>
                        {sup.fullName || sup.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* State Permit Upload */}
              <div className="space-y-2">
                <Label>Attach State Permit</Label>
                <div className="border rounded-lg p-4">
                  <StatePermitUpload
                    state={selectedReturnedState.state}
                    mmpFileId={selectedReturnedState.mmpFileId}
                    userType="fom"
                    onPermitUploaded={async () => {
                      // After permit uploaded, forward sites to coordinator
                      if (!selectedCoordinatorForReturned) {
                        toast({
                          title: 'Select Coordinator',
                          description: 'Please select a coordinator to forward the sites to.',
                          variant: 'destructive'
                        });
                        return;
                      }

                      try {
                        const siteIds = selectedReturnedState.sites.map(s => s.id);
                        const now = new Date().toISOString();

                        // Update sites: clear returned status, mark state permit attached, and forward to coordinator
                        const updateResults = await Promise.all(
                          selectedReturnedState.sites.map((site: any) => {
                            const existingAdditionalData = site.additional_data || site.additionalData || {};
                            return supabase
                              .from('mmp_site_entries')
                              .update({
                                status: 'Pending',
                                forwarded_to_user_id: selectedCoordinatorForReturned,
                                forwarded_at: now,
                                forwarded_by_user_id: currentUser?.id,
                                verification_notes: null,
                                updated_at: now,
                                additional_data: {
                                  ...existingAdditionalData,
                                  state_permit_attached: true,
                                  state_permit_not_required: false,
                                  state_permit_uploaded_at: now,
                                  state_permit_uploaded_by: currentUser?.id,
                                  sent_back_to_coordinator_id: selectedCoordinatorForReturned,
                                }
                              })
                              .eq('id', site.id);
                          })
                        );

                        const failedUpdate = updateResults.find((res: any) => res.error);
                        if (failedUpdate?.error) throw failedUpdate.error;

                        // Create notifications
                        const notifications: any[] = [{
                          user_id: selectedCoordinatorForReturned,
                          title: 'Sites Forwarded to You',
                          message: `${siteIds.length} site(s) in ${selectedReturnedState.state} have been forwarded to you with state permit attached.`,
                          type: 'info',
                          link: '/coordinator/sites'
                        }];

                        // Also notify supervisor if selected
                        if (selectedSupervisorForReturned) {
                          const coordName = coordinatorsList.find(c => c.id === selectedCoordinatorForReturned)?.fullName || 'Coordinator';
                          notifications.push({
                            user_id: selectedSupervisorForReturned,
                            title: 'Sites Assigned to Coordinator',
                            message: `${siteIds.length} site(s) in ${selectedReturnedState.state} have been assigned to ${coordName} for verification (State permit attached).`,
                            type: 'info',
                            link: '/supervisor/sites'
                          });
                        }

                        await insertNotifications(notifications);

                        const coordName = coordinatorsList.find(c => c.id === selectedCoordinatorForReturned)?.fullName || 'Coordinator';
                        toast({
                          title: 'Sites Forwarded',
                          description: `${siteIds.length} site(s) have been forwarded to ${coordName} with state permit attached.${selectedSupervisorForReturned ? ' Supervisor notified.' : ''}`,
                          variant: 'default'
                        });

                        setReturnedStatePermitDialogOpen(false);
                        setSelectedReturnedState(null);
                        setSelectedCoordinatorForReturned('');
                        setSelectedSupervisorForReturned('');
                        
                        // Refresh data
                        await refreshMMPFiles();
                      } catch (err: any) {
                        console.error('Failed to forward sites:', err);
                        toast({
                          title: 'Forward Failed',
                          description: err.message || 'Failed to forward sites. Please try again.',
                          variant: 'destructive'
                        });
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setReturnedStatePermitDialogOpen(false);
              setSelectedReturnedState(null);
              setSelectedCoordinatorForReturned('');
              setSelectedSupervisorForReturned('');
            }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Returned Site Action Dialog (Send Back / Report / Re-dispatch) */}
      <Dialog 
        open={returnedSiteActionDialog.open} 
        onOpenChange={(open) => {
          if (!open) {
            setReturnedSiteActionDialog({ open: false, site: null, action: 'sendback' });
            setReturnedSiteActionBatchSites([]);
            setShowReturnedBatchSiteList(false);
            setReturnedActionNotes('');
            setSelectedCoordinatorForSendBack('');
            setSelectedReturnedActionType('sendback');
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {returnedSiteActionDialog.action === 'sendback' && (returnedSiteActionBatchSites.length > 1
                ? `Send Back ${returnedSiteActionBatchSites.length} Sites to Coordinator`
                : 'Send Site Back to Coordinator')}
              {returnedSiteActionDialog.action === 'redispatch' && 'Re-dispatch Site'}
              {returnedSiteActionDialog.action === 'report' && 'Report Issue with Returned Site'}
            </DialogTitle>
            <DialogDescription>
              {returnedSiteActionDialog.action === 'sendback' && (returnedSiteActionBatchSites.length > 0
                ? `Send ${returnedSiteActionBatchSites.length} site(s) back to the coordinator with your comments.`
                : 'Send this site back to the coordinator with your comments.')}
              {returnedSiteActionDialog.action === 'redispatch' && 'Move this site back to Approved & Costed so it can be dispatched again.'}
              {returnedSiteActionDialog.action === 'report' && 'Report an issue with this returned site to administrators.'}
            </DialogDescription>
          </DialogHeader>
          {returnedSiteActionDialog.site && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="space-y-4 py-2 pr-1">
              {returnedSiteActionDialog.action === 'sendback' && returnedSiteActionBatchSites.length > 1 && (
                <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3">
                  <button
                    type="button"
                    onClick={() => setShowReturnedBatchSiteList(prev => !prev)}
                    className="w-full text-left"
                  >
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200 underline underline-offset-2">
                      {returnedSiteActionBatchSites.length} site(s) will be sent back. Click to {showReturnedBatchSiteList ? 'hide' : 'view'} list.
                    </p>
                  </button>
                  {showReturnedBatchSiteList && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-blue-200/70 dark:border-blue-800/70 bg-white/70 dark:bg-blue-950/20">
                      {returnedSiteActionBatchSites.map((batchSite: any, index: number) => (
                        <div key={batchSite.id || `${batchSite.site_code || 'site'}-${index}`} className="px-3 py-2 text-xs border-b last:border-b-0 border-blue-100 dark:border-blue-900/50">
                          <p className="font-medium text-foreground">{batchSite.site_name || batchSite.siteName || 'Unknown Site'}</p>
                          <p className="text-muted-foreground">
                            {(batchSite.site_code || batchSite.siteCode || 'No code')} • {(batchSite.state || '')}{batchSite.locality ? ` - ${batchSite.locality}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="bg-muted/50 rounded-md p-3 space-y-1">
                <p className="text-sm font-medium">{returnedSiteActionDialog.site.site_name || returnedSiteActionDialog.site.siteName || 'Unknown Site'}</p>
                {returnedSiteActionDialog.site.site_code && (
                  <p className="text-xs text-muted-foreground">Code: {returnedSiteActionDialog.site.site_code}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {returnedSiteActionDialog.site.state || ''}{returnedSiteActionDialog.site.locality ? ` - ${returnedSiteActionDialog.site.locality}` : ''}
                </p>
                {(() => {
                  const returnedByRaw =
                    returnedSiteActionDialog.site.verified_by ||
                    returnedSiteActionDialog.site.additional_data?.sent_back_by ||
                    returnedSiteActionDialog.site.rejected_by ||
                    returnedSiteActionDialog.site.additional_data?.rejected_by ||
                    returnedSiteActionDialog.site.additional_data?.returned_by_name ||
                    returnedSiteActionDialog.site.additional_data?.sent_back_by_name ||
                    '';

                  const coordinatorName =
                    coordinatorsList.find(c => c.id === returnedByRaw)?.fullName ||
                    returnedSiteActionDialog.site.additional_data?.returned_by_name ||
                    returnedSiteActionDialog.site.additional_data?.sent_back_by_name ||
                    returnedByRaw;

                  if (!coordinatorName) return null;

                  return (
                    <p className="text-xs text-muted-foreground mt-1">
                      Returned by Coordinator: <span className="font-medium text-foreground">{coordinatorName}</span>
                    </p>
                  );
                })()}
                {(returnedSiteActionDialog.site.verification_notes || returnedSiteActionDialog.site.additional_data?.rejection_comments || returnedSiteActionDialog.site.additional_data?.rejection_reason || returnedSiteActionDialog.site.additional_data?.return_reason || returnedSiteActionDialog.site.rejection_comments) && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-xs font-medium text-orange-700 dark:text-orange-400">Original Return Reason:</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{returnedSiteActionDialog.site.verification_notes || returnedSiteActionDialog.site.additional_data?.rejection_comments || returnedSiteActionDialog.site.additional_data?.rejection_reason || returnedSiteActionDialog.site.additional_data?.return_reason || returnedSiteActionDialog.site.rejection_comments}</p>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                {returnedSiteActionDialog.action === 'sendback' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Action *</label>
                    <Select value={selectedReturnedActionType} onValueChange={(v: any) => setSelectedReturnedActionType(v)}>
                      <SelectTrigger data-testid="select-sendback-action">
                        <SelectValue placeholder="Select action" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sendback">Send Site Back to Coordinator to upload state permit</SelectItem>
                        <SelectItem value="allow_without_state_permit">Allow coordinator to continue without state permit</SelectItem>
                        <SelectItem value="upload_state_permit">Upload state permit</SelectItem>
                      </SelectContent>
                    </Select>

                    <label className="text-sm font-medium">Coordinator *</label>
                    <Select value={selectedCoordinatorForSendBack} onValueChange={setSelectedCoordinatorForSendBack}>
                      <SelectTrigger data-testid="select-sendback-coordinator">
                        <SelectValue placeholder="Select coordinator" />
                      </SelectTrigger>
                      <SelectContent>
                        {coordinatorsList.map(coord => (
                          <SelectItem key={coord.id} value={coord.id}>
                            {coord.fullName || coord.email || 'Coordinator'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Defaults to the original coordinator who returned this site. You can choose a different coordinator.</p>
                  </div>
                )}
                <label className="text-sm font-medium">
                  {returnedSiteActionDialog.action === 'sendback' && selectedReturnedActionType === 'sendback' && 'Comments for Coordinator *'}
                  {returnedSiteActionDialog.action === 'sendback' && selectedReturnedActionType === 'allow_without_state_permit' && 'Comments (Optional)'}
                  {returnedSiteActionDialog.action === 'sendback' && selectedReturnedActionType === 'upload_state_permit' && 'Notes (Optional)'}
                  {returnedSiteActionDialog.action === 'redispatch' && 'Notes (Optional)'}
                  {returnedSiteActionDialog.action === 'report' && 'Report Details *'}
                </label>
                <Textarea
                  value={returnedActionNotes}
                  onChange={(e) => setReturnedActionNotes(e.target.value)}
                  placeholder={
                    returnedSiteActionDialog.action === 'sendback' && selectedReturnedActionType === 'sendback' ? 'Explain why this site needs to go back to the coordinator...' :
                    returnedSiteActionDialog.action === 'sendback' && selectedReturnedActionType === 'allow_without_state_permit' ? 'Optional note to coordinator...' :
                    returnedSiteActionDialog.action === 'sendback' && selectedReturnedActionType === 'upload_state_permit' ? 'Optional note before uploading state permit...' :
                    returnedSiteActionDialog.action === 'redispatch' ? 'Add any notes for re-dispatching this site...' :
                    'Describe the issue you want to report...'
                  }
                  className="min-h-[100px]"
                  data-testid="textarea-returned-action-notes"
                />
              </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 shrink-0 flex-col-reverse sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setReturnedSiteActionDialog({ open: false, site: null, action: 'sendback' });
                setReturnedSiteActionBatchSites([]);
                setShowReturnedBatchSiteList(false);
                setReturnedActionNotes('');
                setSelectedCoordinatorForSendBack('');
                setSelectedReturnedActionType('sendback');
              }}
              data-testid="button-cancel-returned-action"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const site = returnedSiteActionDialog.site;
                const action = returnedSiteActionDialog.action;
                if (!site) return;
                const targetSites = returnedSiteActionBatchSites.length > 0 ? returnedSiteActionBatchSites : [site];
                
                if (action === 'sendback') {
                  if (selectedReturnedActionType === 'sendback') {
                    if (targetSites.length > 1) {
                      for (const targetSite of targetSites) {
                        await handleSendBackToCoordinator(targetSite, returnedActionNotes, selectedCoordinatorForSendBack || undefined, { suppressToast: true, skipRefresh: true });
                      }
                      await refreshMMPFiles();
                      toast({
                        title: 'Sites Sent Back',
                        description: `${targetSites.length} site(s) have been sent back to the coordinator for editing.`,
                        variant: 'default'
                      });
                    } else {
                      await handleSendBackToCoordinator(site, returnedActionNotes, selectedCoordinatorForSendBack || undefined);
                    }
                  } else if (selectedReturnedActionType === 'allow_without_state_permit') {
                    if (targetSites.length > 1) {
                      for (const targetSite of targetSites) {
                        await handleAllowCoordinatorWithoutStatePermit(targetSite, selectedCoordinatorForSendBack, returnedActionNotes, { suppressToast: true, skipRefresh: true });
                      }
                      await refreshMMPFiles();
                      toast({
                        title: 'Sites Updated',
                        description: `${targetSites.length} site(s) were sent back and coordinator can continue without state permit.`,
                        variant: 'default'
                      });
                    } else {
                      await handleAllowCoordinatorWithoutStatePermit(site, selectedCoordinatorForSendBack, returnedActionNotes);
                    }
                  } else if (selectedReturnedActionType === 'upload_state_permit') {
                    const firstTargetSite = targetSites[0] || site;
                    const siteStateId = firstTargetSite.state_id || firstTargetSite.stateId;
                    setSelectedReturnedState({
                      state: firstTargetSite.state || '',
                      sites: targetSites,
                      mmpFileId: firstTargetSite.mmp_file_id || firstTargetSite.mmpFileId,
                      stateId: siteStateId,
                    });
                    setSelectedCoordinatorForReturned(selectedCoordinatorForSendBack || resolveOriginalCoordinatorId(firstTargetSite));
                    if (siteStateId) {
                      const hubForState = hubStatesList.find((hs: any) => hs.state_id === siteStateId);
                      if (hubForState) {
                        const supervisorForHub = supervisorsList.find((s: any) => s.hubId === hubForState.hub_id);
                        setSelectedSupervisorForReturned(supervisorForHub?.id || '');
                      }
                    }
                    setReturnedStatePermitDialogOpen(true);
                  }
                } else if (action === 'redispatch') {
                  await handleRedispatchReturnedSite(site, returnedActionNotes);
                } else if (action === 'report') {
                  await handleReportReturnedSite(site, returnedActionNotes);
                }
                
                setReturnedSiteActionDialog({ open: false, site: null, action: 'sendback' });
                setReturnedSiteActionBatchSites([]);
                setShowReturnedBatchSiteList(false);
                setReturnedActionNotes('');
                setSelectedCoordinatorForSendBack('');
                setSelectedReturnedActionType('sendback');
              }}
              disabled={
                (returnedSiteActionDialog.action === 'sendback' && !selectedCoordinatorForSendBack) ||
                (returnedSiteActionDialog.action === 'sendback' && selectedReturnedActionType === 'sendback' && !returnedActionNotes.trim()) ||
                (returnedSiteActionDialog.action === 'report' && !returnedActionNotes.trim())
              }
              className={`w-full sm:w-auto ${
                returnedSiteActionDialog.action === 'report' 
                  ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                  : returnedSiteActionDialog.action === 'redispatch'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : ''
              }`}
              data-testid="button-confirm-returned-action"
            >
              {returnedSiteActionDialog.action === 'sendback' && selectedReturnedActionType === 'sendback' && (returnedSiteActionBatchSites.length > 1
                ? `Send Back (${returnedSiteActionBatchSites.length})`
                : 'Send Back')}
              {returnedSiteActionDialog.action === 'sendback' && selectedReturnedActionType === 'allow_without_state_permit' && (returnedSiteActionBatchSites.length > 1
                ? `Allow Continue (${returnedSiteActionBatchSites.length})`
                : 'Allow Continue')}
              {returnedSiteActionDialog.action === 'sendback' && selectedReturnedActionType === 'upload_state_permit' && 'Proceed to Upload Permit'}
              {returnedSiteActionDialog.action === 'redispatch' && 'Re-dispatch'}
              {returnedSiteActionDialog.action === 'report' && 'Submit Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MMP;
