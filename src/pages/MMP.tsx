
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { 
  Upload, ChevronLeft, Trash2, Hand, FileText, ListChecks, CheckCircle, Eye, BarChart3, MapPin, AlertTriangle, Activity,
  ClipboardList, Send, ShieldCheck, LayoutDashboard, FilePlus, CheckSquare, Truck, Wand2, Handshake, PlayCircle, CheckCircle2, XCircle, Clock, UserCheck, FileCheck
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
// Helper component to convert SiteVisitRow[] to site entries and display using MMPSiteEntriesTable
interface SitesDisplayTableProps {
  siteRows: SiteVisitRow[]; 
  mmpId?: string;
  editable?: boolean;
  title?: string;
}

const SitesDisplayTable = React.memo(function SitesDisplayTable({ siteRows, mmpId, editable = true, title }: SitesDisplayTableProps) {
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
}

const VerifiedSitesDisplay = React.memo(function VerifiedSitesDisplay({ verifiedSites }: VerifiedSitesDisplayProps) {
  const { mmpFiles, loading: mmpLoading, refreshMMPFiles } = useMMP();

  // Derive verified site entries from context
  const verifiedSiteEntries = useMemo(() => {
    if (verifiedSites.length === 0) return [];

    // Get unique mmp_ids from verified sites
    const mmpIds = [...new Set(verifiedSites.map(s => s.mmpId).filter(Boolean))];
    if (mmpIds.length === 0) return [];

    // Get all site entries from context for these MMPs
    const entries: any[] = [];
    mmpFiles.forEach((mmp: any) => {
      if (mmpIds.includes(mmp.id) && Array.isArray(mmp.siteEntries)) {
        mmp.siteEntries
          .filter((entry: any) => {
            // Filter for verified sites (case-insensitive)
            const status = String(entry.status || '').toLowerCase();
            return status === 'verified';
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
  const { t } = useTranslation();
  const { mmpFiles, loading, updateMMP, refreshMMPFiles, siteEntryCounts: contextCounts, refreshSiteEntryCounts } = useMMP();
  const { checkPermission, hasAnyRole, currentUser } = useAuthorization();
  const { toast } = useToast();
  const { reconcileSiteVisitFee } = useWallet();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const { startSiteVisit: startSiteVisitOffline, completeSiteVisit: completeSiteVisitOffline } = useOfflineSiteVisit();
  const { queuePhotoUpload } = useOffline();
  const [activeTab, setActiveTab] = useState('new');
  // Subcategory state for Forwarded MMPs (Admin/ICT only)
  const [forwardedSubTab, setForwardedSubTab] = useState<'pending' | 'verified'>('pending');
  // Subcategory state for Verified Sites (Admin/ICT only)
  const [verifiedSubTab, setVerifiedSubTab] = useState<'newSites' | 'approvedCosted' | 'dispatched' | 'smartAssigned' | 'accepted' | 'ongoing' | 'completed' | 'rejected'>('newSites');
  // Subcategory state for Enumerator dashboard
  const [enumeratorSubTab, setEnumeratorSubTab] = useState<'availableSites' | 'smartAssigned' | 'mySites'>('availableSites');
  // Sub-subcategory state for My Sites (Data Collector)
  const [mySitesSubTab, setMySitesSubTab] = useState<'pending' | 'ongoing' | 'completed' | 'all'>('pending');
  // Subcategory state for New MMPs (FOM only)
  const [newFomSubTab, setNewFomSubTab] = useState<'pending' | 'verified' | 'returned'>('pending');
  // Expanded states for returned sites view
  const [expandedReturnedStates, setExpandedReturnedStates] = useState<Set<string>>(new Set());
  // State permit upload dialog for returned sites
  const [returnedStatePermitDialogOpen, setReturnedStatePermitDialogOpen] = useState(false);
  const [selectedReturnedState, setSelectedReturnedState] = useState<{ state: string; sites: any[]; mmpFileId?: string; stateId?: string } | null>(null);
  const [selectedCoordinatorForReturned, setSelectedCoordinatorForReturned] = useState<string>('');
  const [selectedSupervisorForReturned, setSelectedSupervisorForReturned] = useState<string>('');
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
  const handleSendBackToCoordinator = useCallback(async (site: any, comments: string) => {
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

      toast({
        title: 'Site Sent Back',
        description: 'The site has been sent back to the coordinator for editing.',
        variant: 'default'
      });

      // Refresh context to ensure real-time updates propagate
      await refreshMMPFiles();
    } catch (error: any) {
      console.error('Failed to send back site:', error);
      toast({
        title: 'Send Back Failed',
        description: error.message || 'Failed to send the site back. Please try again.',
        variant: 'destructive'
      });
    }
  }, [currentUser?.id, toast, refreshMMPFiles]);

  // Handle cost acknowledgment for Smart Assigned sites
  const handleCostAcknowledgment = useCallback((site: any) => {
    setSelectedSiteForAcknowledgment(site);
    setCostAcknowledgmentOpen(true);
  }, []);

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
      // Update site with visit completion time and final location (but don't change status yet)
      await supabase
        .from('mmp_site_entries')
        .update({
          updated_at: now,
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

        // Only set visit_completed_at and visit_completed_by if they're not already set
        if (!currentSite?.visit_completed_at) {
          updatePayload.visit_completed_at = now;
          console.log('📝 Setting visit_completed_at (was null)');
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
              .limit(1000);

            if (!mySitesError && mySitesData) {
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

              const formattedMySites = formatEntries(mySitesData);
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

  const isAdmin = hasRole(['Admin', 'admin', 'Super Admin', 'superadmin', 'super admin']);
  const isICT = hasRole(['ICT', 'ict']);
  const isFOM = hasRole(['Field Operation Manager (FOM)', 'fom', 'field operation manager']);
  const isSupervisor = hasRole(['Supervisor', 'supervisor']);
  const isCoordinator = hasRole(['Coordinator', 'coordinator']);
  const isDataCollector = hasRole(['DataCollector', 'datacollector', 'enumerator', 'Enumerator']);
  // Coordinators have full data collector capabilities (can claim sites, view transport fees, etc.)
  const canClaimSites = isDataCollector || isCoordinator;
  const canRead = checkPermission('mmp', 'read') || isAdmin || isFOM || isSupervisor || isCoordinator || isICT || isDataCollector;
  // Only Admin and ICT accounts should see the Upload button on the MMP management page.
  // We intentionally DO NOT fallback to checkPermission here to prevent other roles (e.g. FOM)
  // that may have broad permissions from seeing the upload control.
  const canCreate = isAdmin || isICT;

  // Real-time subscription for site claims (Uber-like first-claim system)
  // When another enumerator claims a site, it will be removed from available sites in real-time
  const handleSiteClaimedRealtime = React.useCallback((siteId: string, claimedBy: string) => {
    // Skip if we're the one who claimed it
    if (claimedBy === currentUser?.id) return;
    
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
  }, [currentUser?.id]);

  useSiteClaimRealtime({
    onSiteClaimed: handleSiteClaimedRealtime,
    enabled: canClaimSites
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
    const coords = contextUsers.filter(u => u.role === 'coordinator');
    setCoordinatorsList(coords.map(c => ({
      id: c.id,
      fullName: c.fullName || c.name || c.email,
      email: c.email,
      stateId: c.stateId,
      localityId: c.localityId,
      hubId: c.hubId
    })));
    
    // Filter supervisors from context users
    const sups = contextUsers.filter(u => u.role === 'supervisor');
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

  // Categorize MMPs
  const categorizedMMPs = useMemo(() => {
    let filteredMMPs = mmpFiles;

    // PROJECT TEAM MEMBERSHIP FILTER
    // Only show MMPs from projects the user belongs to (unless admin/superuser).
    // For FOMs and Supervisors, still honor project membership but also allow MMPs explicitly forwarded to them.
    if (!isAdminOrSuperUser) {
      if (userProjectIds.length > 0) {
        filteredMMPs = mmpFiles.filter(mmp => {
          const inProject = mmp.projectId ? userProjectIds.includes(mmp.projectId) : false;
          if (isFOM || isSupervisor) {
            const workflow = mmp.workflow as any;
            const forwardedToFomIds = workflow?.forwardedToFomIds || [];
            const isForwarded = forwardedToFomIds.includes(currentUser?.id || '');
            return inProject || isForwarded;
          }
          // Non-FOM/Supervisor path
          return inProject;
        });
      } else if (userProjectIds.length === 0) {
        // User is not admin and has no project assignments - show no MMPs
        // But allow Data Collectors to see Available Sites (handled separately)
        // For FOMs and Supervisors with no project membership, we still allow forwarded MMPs
        if (isFOM || isSupervisor) {
          filteredMMPs = mmpFiles.filter(mmp => {
            const workflow = mmp.workflow as any;
            const forwardedToFomIds = workflow?.forwardedToFomIds || [];
            return forwardedToFomIds.includes(currentUser?.id || '');
          });
        } else if (!canClaimSites) {
          filteredMMPs = [];
        }
      }
    }

    // For FOM and Supervisor users, only show MMPs forwarded to them or their verified MMPs
    if ((isFOM || isSupervisor) && currentUser) {
      filteredMMPs = filteredMMPs.filter(mmp => {
        const workflow = mmp.workflow as any;
        const forwardedToFomIds = workflow?.forwardedToFomIds || [];
        const isForwardedToThisUser = forwardedToFomIds.includes(currentUser.id);
        
        // Include MMPs forwarded to this FOM/Supervisor or verified MMPs
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
      if (isFOM || isSupervisor) {
        // For FOM/Supervisor: New MMPs are all items forwarded to them (regardless of coordinator forwarding)
        const workflow = mmp.workflow as any;
        const forwardedToFomIds = workflow?.forwardedToFomIds || [];
        return forwardedToFomIds.includes(currentUser?.id || '');
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
      if (isFOM || isSupervisor) {
        // For FOM/Supervisor: Forwarded means MMPs they've processed and sent to coordinators
        const workflow = mmp.workflow as any;
        return workflow?.forwardedToCoordinators === true ||
               workflow?.currentStage === 'coordinatorReview';
      } else if (isCoordinator) {
        // For Coordinator: They don't have a "forwarded" category
        return false;
      } else if (isAdmin || isICT) {
        // For admin/ICT: Forwarded means MMPs that have been forwarded to FOMs or coordinators
        const workflow = mmp.workflow as any;
        const hasForwardedToFomIds = workflow?.forwardedToFomIds && workflow?.forwardedToFomIds.length > 0;
        const hasForwardedToCoordinators = workflow?.forwardedToCoordinators === true || 
                                           workflow?.forwardedToCoordinatorAt ||
                                           workflow?.currentStage === 'forwarded_to_coordinator';
        // Include if forwarded to FOMs OR coordinators (workflow has progressed)
        return hasForwardedToFomIds || hasForwardedToCoordinators;
      }
      return false;
    });
    
    const verifiedMMPs = filteredMMPs.filter(mmp => {
      // Normalize status for case-insensitive comparison (production data may have mixed casing)
      const normalizedStatus = (mmp.status || '').toLowerCase();
      
      if (isCoordinator) {
        // For Coordinator: Show MMPs that have been forwarded to coordinators
        return (mmp.workflow as any)?.forwardedToCoordinators === true;
      } else if (isFOM || isSupervisor) {
        // For FOM/Supervisor: Verified means MMPs with sites available for verification
        return mmp.type === 'verified-template' || 
               normalizedStatus === 'verified' ||
               normalizedStatus === 'approved' ||
               ((mmp.workflow as any)?.currentStage && ['permitsVerified', 'cpVerification', 'completed'].includes((mmp.workflow as any)?.currentStage));
      } else {
        // For admin/other roles: Include verified, approved, and specific workflow stages
        return normalizedStatus === 'verified' ||
               normalizedStatus === 'approved' || 
               mmp.type === 'verified-template' ||
               ((mmp.workflow as any)?.currentStage && ['permitsVerified', 'cpVerification', 'completed'].includes((mmp.workflow as any)?.currentStage));
      }
    });

    return {
      new: newMMPs,
      forwarded: forwardedMMPs,
      verified: verifiedMMPs
    };
  }, [mmpFiles, isFOM, isSupervisor, isCoordinator, currentUser, isAdminOrSuperUser, userProjectIds, canClaimSites]);

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
    if (!isFOM && !isSupervisor && !isAdmin && !isICT) return { pending: [], verified: [], returned: [] } as Record<string, typeof categorizedMMPs.new>;
    const base = categorizedMMPs.new || [];
    const pending = base.filter(mmp => {
      const status = (mmp.status || '').toLowerCase();
      return status !== 'approved' && status !== 'verified' && status !== 'rejected';
    });
    const verified = base.filter(mmp => {
      const status = (mmp.status || '').toLowerCase();
      return status === 'approved' || status === 'verified';
    });
    // Returned: Search ALL mmpFiles for any MMP that has sites with 'returned_to_fom' status
    const returned = mmpFiles.filter(mmp => 
      mmp.siteEntries?.some(site => {
        const siteStatus = (site.status || '').toLowerCase();
        return siteStatus === 'returned_to_fom';
      })
    );
    return { pending, verified, returned };
  }, [isFOM, isSupervisor, isAdmin, isICT, categorizedMMPs.new, mmpFiles]);

  // Returned sites grouped by state for FOM view
  const returnedSitesByState = useMemo(() => {
    const allReturnedSites = mmpFiles.flatMap(mmp => 
      (mmp.siteEntries || [])
        .filter(site => site.status === 'returned_to_fom')
        .map(site => ({ ...site, mmp_file_id: mmp.id, mmpName: mmp.name }))
    );
    
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
  }, [mmpFiles]);

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
        return status === 'completed';
      }).length,
      rejected: allEntries.filter(e => {
        const status = String(e.status || '').toLowerCase();
        return status === 'rejected' || status === 'declined';
      }).length,
      approvedCosted: allEntries.filter(e => {
        const status = String(e.status || '').toLowerCase();
        return status === 'approved and costed';
      }).length
    };
  }, [mmpFiles]);

  // Calculate counts specifically for Verified Sites tab (only from verified MMPs)
  const verifiedTabSiteEntryCounts = useMemo(() => {
    const verifiedMMPs = categorizedMMPs.verified || [];
    const allEntries = verifiedMMPs.flatMap(mmp => {
      const entries = mmp.siteEntries || [];
      return entries.map(entry => ({
        ...entry,
        mmp_file_id: mmp.id,
        mmpId: mmp.id
      }));
    });
    
    return {
      verified: allEntries.filter(e => {
        const status = String(e.status || '').toLowerCase();
        return status === 'verified';
      }).length,
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
        return status === 'completed';
      }).length,
      rejected: allEntries.filter(e => {
        const status = String(e.status || '').toLowerCase();
        return status === 'rejected' || status === 'declined';
      }).length,
      approvedCosted: allEntries.filter(e => {
        const status = String(e.status || '').toLowerCase();
        return status === 'approved and costed';
      }).length
    };
  }, [categorizedMMPs.verified]);

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
      claimed_by: entry.claimed_by,
      claimed_at: entry.claimed_at,
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

    // Convert collector's stateId/localityId to names for matching
    const collectorStateName = currentUser.stateId 
      ? sudanStates.find(s => s.id === currentUser.stateId)?.name 
      : undefined;
    const collectorLocalityName = currentUser.stateId && currentUser.localityId
      ? sudanStates.find(s => s.id === currentUser.stateId)
          ?.localities.find(l => l.id === currentUser.localityId)?.name
      : undefined;

    // Format all entries
    const formattedEntries = allSiteEntries.map(formatSiteEntry);

    // Filter available sites: status = "Dispatched", accepted_by = null, in collector's area
    const availableSites = formattedEntries.filter(entry => {
      const status = String(entry.status || '').toLowerCase();
      if (status !== 'dispatched') return false;
      if (entry.accepted_by) return false; // Must be unclaimed

      // Filter by location
      if (collectorLocalityName) {
        // User has locality set - filter by EXACT locality match only
        return String(entry.locality || '').toLowerCase() === collectorLocalityName.toLowerCase();
      } else if (collectorStateName) {
        // User only has state set (no locality) - filter by state
        return String(entry.state || '').toLowerCase() === collectorStateName.toLowerCase();
      }
      return false; // No location = no sites
    }).sort((a, b) => {
      // Sort by created_at descending
      const aDate = a.created_at || a.createdAt || '';
      const bDate = b.created_at || b.createdAt || '';
      return bDate.localeCompare(aDate);
    }).slice(0, 1000); // Limit to 1000

    // Filter smart assigned: status = "Assigned", accepted_by = currentUser.id, not cost-acknowledged
    const smartAssigned = formattedEntries.filter(entry => {
      const status = String(entry.status || '').toLowerCase();
      if (status !== 'assigned') return false;
      if (entry.accepted_by !== currentUser.id) return false;
      return !entry.cost_acknowledged; // Exclude cost-acknowledged sites
    }).sort((a, b) => {
      const aDate = a.created_at || a.createdAt || '';
      const bDate = b.created_at || b.createdAt || '';
      return bDate.localeCompare(aDate);
    }).slice(0, 1000);

    // Filter my sites: accepted_by = currentUser.id
    const mySites = formattedEntries.filter(entry => {
      return entry.accepted_by === currentUser.id;
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
  }, [allSiteEntries, canClaimSites, currentUser?.id, currentUser?.stateId, currentUser?.localityId, formatSiteEntry, loading]);

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

  // Set enumerator state from derived data
  useEffect(() => {
    setEnumeratorSiteEntries(enumeratorData.availableSites);
    setEnumeratorGroupedByStates(enumeratorData.groupedByStateLocality);
    setEnumeratorGroupedByLocality({});
    setEnumeratorSmartAssigned(enumeratorData.smartAssigned);
    setEnumeratorMySites(enumeratorData.mySites);
    setLoadingEnumerator(enumeratorData.loading);
  }, [enumeratorData]);

  // Load smart assigned site entries only when the tab is active
  useEffect(() => {
    if (verifiedSubTab !== 'smartAssigned') {
      setSmartAssignedSiteEntries([]);
      setLoadingSmartAssigned(false);
      return;
    }

    // Using in-memory data only, no async loading
    setLoadingSmartAssigned(false);

    const formattedEntries = allSiteEntries
      .map(formatSiteEntry)
      .filter(entry => {
        const status = String(entry.status || '').toLowerCase();
        // adjust this string if your DB uses a different status value
        return status === 'assigned';
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
  }, [verifiedSubTab, allSiteEntries, formatSiteEntry]);

  // Load approved and costed site entries only when the tab is active
  useEffect(() => {
    
      if (verifiedSubTab !== 'approvedCosted') {
        setApprovedCostedSiteEntries([]);
        setLoadingApprovedCosted(false);
        return;
      }

      setLoadingApprovedCosted(false);

      const formattedEntries = allSiteEntries
      .map(formatSiteEntry)
      .filter(entry =>{
        const status = String(entry.status || '').toLowerCase();
        return status.includes('approved') && status.includes('costed');

      }
      )
      setApprovedCostedSiteEntries(formattedEntries);
      setApprovedCostedCount(formattedEntries.length);
  }, [verifiedSubTab, allSiteEntries, formatSiteEntry]);

  
  // already-loaded MMP context (allSiteEntries).
  useEffect(() => {
    if (verifiedSubTab !== 'dispatched') {
      setDispatchedSiteEntries([]);
      setLoadingDispatched(false);
      return;
    }

    
    setLoadingDispatched(false);

    const formattedEntries = allSiteEntries
      .map(formatSiteEntry)
      .filter(entry => {
        const status = String(entry.status || '').toLowerCase();
        const acceptedBy = (entry as any).accepted_by;
        return status === 'dispatched' && !acceptedBy;
      })
      .sort((a, b) => {
        const aDate = (a as any).dispatched_at || (a as any).dispatchedAt || (a as any).created_at || (a as any).createdAt || '';
        const bDate = (b as any).dispatched_at || (b as any).dispatchedAt || (b as any).created_at || (b as any).createdAt || '';
        return bDate.localeCompare(aDate);
      });

    setDispatchedSiteEntries(formattedEntries);
    setDispatchedCount(formattedEntries.length);
  }, [verifiedSubTab, allSiteEntries, formatSiteEntry]);

  // Load accepted site entries only when the tab is active
  useEffect(() => {
    
      if (verifiedSubTab !== 'accepted') {
        setAcceptedSiteEntries([]);
        setLoadingAccepted(false);
        return;
      }

      setLoadingAccepted(false);
      const formattedEntries = allSiteEntries
      .map(formatSiteEntry)
      .filter(entry =>{
        const status = String(entry.status || '').toLowerCase();
        return status === "accepted";
      })
      .sort((a, b) => {
      const aDate = (a as any).accepted_at || (a as any).updated_at || (a as any).createdAt || '';
      const bDate = (b as any).accepted_at || (b as any).updated_at || (b as any).createdAt || '';
      return bDate.localeCompare(aDate);
    })

    setAcceptedSiteEntries(formattedEntries);
    setAcceptedCount(formattedEntries.length);

    // No async operation needed - using in-memory data
  }, [verifiedSubTab, allSiteEntries,formatSiteEntry]);

  // Load ongoing site entries only when the tab is active
  useEffect(() => {
    
      if (verifiedSubTab !== 'ongoing') {
        setOngoingSiteEntries([]);
        setLoadingOngoing(false);
        return;
      }

      setLoadingOngoing(false);

      const formattedEntries = allSiteEntries
      .map(formatSiteEntry)
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
       
    

    
  }, [verifiedSubTab,allSiteEntries,formatSiteEntry]);

  // Load completed site entries only when the tab is active
  useEffect(() => {
    
      if (verifiedSubTab !== 'completed') {
        setCompletedSiteEntries([]);
        setLoadingCompleted(false);
        return;
      }

      setLoadingCompleted(false);

      const formattedEntries = allSiteEntries
      .map(formatSiteEntry)
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
    
     
  }, [verifiedSubTab,allSiteEntries,formatSiteEntry]);

  // Load rejected site entries only when the tab is active
  useEffect(() => {
    
      if (verifiedSubTab !== 'rejected') {
        setRejectedSiteEntries([]);
        setLoadingRejected(false);
        return;
      }

      setLoadingRejected(false);
      const formattedEntries = allSiteEntries
      .map(formatSiteEntry)
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
      
    

    
  }, [verifiedSubTab,allSiteEntries,formatSiteEntry]);

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

  // Calculate total verified sites count across all verified MMPs (for "Verified Sites" tab badge)
  // This includes all sites in the verification workflow: verified, approved and costed, dispatched, etc.
  const totalVerifiedSitesCount = useMemo(() => {
    const allVerifiedMMPs = categorizedMMPs.verified || [];
    
    if (allVerifiedMMPs.length === 0) return 0;
    
    // Count all sites in the verification workflow (any status that indicates they've entered the verified workflow)
    const allSites = buildSiteRowsFromMMPs(allVerifiedMMPs, (row) => {
      const status = row.status?.toLowerCase() || '';
      // Include: verified, approved and costed, dispatched, assigned, accepted, ongoing, completed
      // These are all stages in the verification workflow
      return status === 'verified' || 
             status === 'approved and costed' || 
             status === 'dispatched' || 
             status === 'assigned' ||
             status === 'accepted' ||
             status.includes('progress') ||
             status === 'completed';
    });
    
    return allSites.length;
  }, [categorizedMMPs.verified, siteVisitRows]);

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
    
    return (isAdmin || isICT || isFOM || isSupervisor || isCoordinator)
      ? (verifiedSubcategories[verifiedSubTab] || [])
      : (categorizedMMPs.verified || []);
  }, [isAdmin, isICT, isFOM, isSupervisor, isCoordinator, verifiedSubTab, verifiedSubcategories, categorizedMMPs.verified, verifiedCategorySiteRows]);

  const verifiedGroupedRows = useMemo(() => {
    // For "newSites" subcategory, filter to only show verified sites
    // For other sub-tabs, exclude completed sites since tables are editable
    const filterFn = verifiedSubTab === 'newSites' 
      ? (row: SiteVisitRow) => {
          const status = row.status?.toLowerCase() || '';
          return status === 'verified';
        }
      : (row: SiteVisitRow) => {
          // Exclude completed sites from editable tables
          const status = row.status?.toLowerCase() || '';
          return status !== 'completed';
        };
    
    return verifiedVisibleMMPs.map(m => ({
      mmp: m,
      rows: buildSiteRowsFromMMPs([m], filterFn),
    }));
  }, [verifiedVisibleMMPs, verifiedSubTab, siteVisitRows]);

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
    const mmps = (isAdmin || isICT || isFOM || isSupervisor) ? (forwardedSubcategories[forwardedSubTab] || []) : (categorizedMMPs.forwarded || []);
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
  }, [isAdmin, isICT, isFOM, isSupervisor, forwardedSubTab, forwardedSubcategories, categorizedMMPs.forwarded]);

  // Derive site visit stats from context (Admin/ICT/FOM/Supervisor/Coordinator)
  const { siteVisitStats: derivedStats, siteVisitRows: derivedRows } = useMemo(() => {
    if (!(isAdmin || isICT || isFOM || isSupervisor || isCoordinator)) {
      return { siteVisitStats: {}, siteVisitRows: [] };
    }
    
    let list: any[] = [];
    if (isFOM || isSupervisor) {
      list = [ ...(categorizedMMPs.verified || []), ...(categorizedMMPs.forwarded || []) ];
    } else if (isAdmin || isICT || isCoordinator) {
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
          if (status === 'completed') map[mmpId].hasCompleted = true;
          if (status === 'rejected' || status === 'declined') map[mmpId].hasRejected = true;
          if (status === 'dispatched' || (entry as any).dispatched_at) map[mmpId].hasDispatched = true;
          
          const cost = Number(entry.cost || 0);
          if (cost > 0) map[mmpId].hasCosted = true;
          
          const siteRow: SiteVisitRow = {
            id: entry.id || `${mmpId}-${entry.site_code || entry.siteCode}`,
            mmpId: mmpId,
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
    
    // Check if all entries for each MMP are approved and costed
    for (const [mmpId, entries] of entriesByMmp.entries()) {
      if (!map[mmpId]) {
        map[mmpId] = { exists: false, hasCosted: false, hasAssigned: false, hasInProgress: false, hasAccepted: false, hasCompleted: false, hasRejected: false, hasDispatched: false, allApprovedAndCosted: false };
      }
      
      // For "Approved & Costed", ALL entries must have status = 'approved and costed'
      if (entries.length > 0) {
        const allApprovedAndCosted = entries.every(entry => {
          const status = String(entry.status || '').toLowerCase();
          return status === 'approved and costed';
        });
        map[mmpId].allApprovedAndCosted = allApprovedAndCosted;
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
    <div className="space-y-6 min-h-screen bg-slate-50 dark:bg-gray-900 py-4 sm:py-6 px-2 sm:px-4 md:px-8">
      {/* Blue Header Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-lg p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-full">
              <FileText className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('mmpPage.title')}</h1>
              <p className="text-blue-100 mt-1">
                {t('mmpPage.description')}
              </p>
            </div>
          </div>
          {canCreate && (
            <Button 
              onClick={() => navigate('/mmp/upload')} 
              className="bg-white text-blue-700 hover:bg-blue-50 shadow-md flex items-center gap-2"
              data-testid="button-upload-mmp"
            >
              <Upload className="h-4 w-4" />
              {t('mmpPage.uploadMMP')}
            </Button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1">
            <ListChecks className="h-4 w-4" />
            <span>{t('mmpPage.siteTracking')}</span>
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1">
            <CheckCircle className="h-4 w-4" />
            <span>{t('mmpPage.verificationWorkflow')}</span>
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1">
            <BarChart3 className="h-4 w-4" />
            <span>{t('mmpPage.progressAnalytics')}</span>
          </div>
          <DataFreshnessBadge className="bg-white/10 rounded-full px-3 py-1" />
        </div>
      </div>

      {/* Body - Show tabs immediately with loading states per section for faster perceived loading */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="overflow-x-auto mb-6">
              <TabsList className="inline-flex w-max bg-gradient-to-r from-slate-900/90 to-blue-900/90 border border-blue-500/40 backdrop-blur-xl p-1.5 min-h-[48px] rounded-xl shadow-lg">
                {canClaimSites && (
                  <TabsTrigger value="enumerator" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[40px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap rounded-lg px-4 text-blue-100 hover:text-white transition-all">
                    <UserCheck className="h-4 w-4" />
                    {t('mmpPage.tabs.myAssignments')}
                    <Badge className="bg-blue-400/30 text-white border-0">{enumeratorMySites.length}</Badge>
                  </TabsTrigger>
                )}
                {!canClaimSites && (
                  <TabsTrigger value="new" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[40px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap rounded-lg px-4 text-blue-100 hover:text-white transition-all">
                    <ClipboardList className="h-4 w-4" />
                    {t('mmpPage.tabs.newMMPs')}
                    <Badge className="bg-emerald-400/30 text-white border-0">{categorizedMMPs.new.length}</Badge>
                  </TabsTrigger>
                )}
                {!canClaimSites && (
                  <TabsTrigger value="forwarded" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[40px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap rounded-lg px-4 text-blue-100 hover:text-white transition-all">
                    <Send className="h-4 w-4" />
                    {(isFOM || isSupervisor) ? t('mmpPage.tabs.forwardedSites') : t('mmpPage.tabs.forwardedMMPs')}
                    <Badge className="bg-amber-400/30 text-white border-0">{categorizedMMPs.forwarded.length}</Badge>
                  </TabsTrigger>
                )}
                {!canClaimSites && (
                  <TabsTrigger value="verified" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[40px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap rounded-lg px-4 text-blue-100 hover:text-white transition-all">
                    <ShieldCheck className="h-4 w-4" />
                    {t('mmpPage.tabs.verifiedSites')}
                    <Badge className="bg-violet-400/30 text-white border-0">{totalVerifiedSitesCount}</Badge>
                  </TabsTrigger>
                )}
                {!canClaimSites && (
                  <TabsTrigger value="tracker" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[40px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap rounded-lg px-4 text-blue-100 hover:text-white transition-all">
                    <LayoutDashboard className="h-4 w-4" />
                    {t('mmpPage.tabs.mmpTracker')}
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {!canClaimSites && (
              <TabsContent value="new">
                {(isFOM || isSupervisor || isAdmin || isICT) && (
                  <div className="mb-6">
                    <div className="text-sm font-medium text-muted-foreground mb-3">{t('mmpPage.subcategory')}:</div>
                    <div className="flex gap-2 flex-wrap">
                        {(isFOM || isSupervisor) && (
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
                      <CardTitle>Returned Sites by State</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        These sites were returned by coordinators and require action.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {returnedSitesByState.length === 0 ? (
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
                                            // Get mmp_file_id from one of the sites
                                            const mmpFileId = stateGroup.sites[0]?.mmp_file_id;
                                            // Find stateId from hubStatesList
                                            const stateMatch = hubStatesList.find(hs => 
                                              hs.state_name?.toLowerCase() === stateGroup.state.toLowerCase()
                                            );
                                            const stateId = stateMatch?.state_id;
                                            
                                            setSelectedReturnedState({
                                              state: stateGroup.state,
                                              sites: stateGroup.sites,
                                              mmpFileId,
                                              stateId
                                            });
                                            
                                            // Auto-select coordinator for this state
                                            const recommendedCoord = coordinatorsList.find(c => c.stateId === stateId);
                                            setSelectedCoordinatorForReturned(recommendedCoord?.id || '');
                                            
                                            // Auto-select supervisor for the hub that has this state
                                            if (stateId) {
                                              const hubForState = hubStatesList.find(hs => hs.state_id === stateId);
                                              if (hubForState) {
                                                const supervisorForHub = supervisorsList.find(s => s.hubId === hubForState.hub_id);
                                                setSelectedSupervisorForReturned(supervisorForHub?.id || '');
                                              }
                                            }
                                            
                                            setReturnedStatePermitDialogOpen(true);
                                          }}
                                        >
                                          <Upload className="h-3 w-3 mr-1" />
                                          Upload Permits
                                        </Button>
                                      </div>
                                    </div>
                                    
                                    {/* Show localities when state is expanded */}
                                    {isExpanded && (
                                      <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                                        <div className="text-sm text-muted-foreground mb-2">
                                          Localities in this state:
                                        </div>
                                        <div className="space-y-2">
                                          {Object.entries(sitesByLocality).map(([locality, sites]) => (
                                            <div 
                                              key={locality}
                                              className="flex items-center justify-between p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                                            >
                                              <div>
                                                <span className="font-medium">{locality}</span>
                                                <span className="text-muted-foreground ml-2">({sites.length} sites)</span>
                                              </div>
                                              <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300 text-xs">
                                                Returned
                                              </Badge>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })
                      )}
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
                  <div className="mb-6">
                    <div className="text-sm font-medium text-muted-foreground mb-3">{t('mmpPage.subcategory')}:</div>
                    <div className="flex gap-2 flex-wrap">
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
                  <MMPList mmpFiles={(isAdmin || isICT || isFOM || isSupervisor) ? forwardedSubcategories[forwardedSubTab] : categorizedMMPs.forwarded} />
                )}
                {(isFOM || isSupervisor) && (
                  <SitesDisplayTable 
                    siteRows={forwardedCategorySiteRows}
                    editable={true}
                    title={`${t('mmpPage.siteEntries')} (${forwardedCategorySiteRows.length}) - ${t('mmpPage.forwardedSubcategory')}: ${t(`mmpPage.subcategories.${forwardedSubTab === 'pending' ? 'sitesPendingVerification' : 'verifiedSites'}`)}`}
                  />
                )}
              </TabsContent>
            )}

            <TabsContent value="verified">
              {(isAdmin || isICT || isFOM || isCoordinator) && (
                <div className="mb-6">
                  <div className="text-sm font-medium text-muted-foreground mb-3">{t('mmpPage.subcategory')}:</div>
                  <div className="flex gap-2 overflow-x-auto pb-2 flex-wrap">
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
              {verifiedSubTab !== 'approvedCosted' && verifiedSubTab !== 'dispatched' && verifiedSubTab !== 'smartAssigned' && verifiedSubTab !== 'accepted' && verifiedSubTab !== 'ongoing' && verifiedSubTab !== 'completed' && verifiedSubTab !== 'rejected' && (
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
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator) && verifiedSubTab === 'newSites' && (
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
                            // Build updates without defaulting fees; only use existing column values
                            const updates = verifiedEntries.map(entry => {
                              const currentCost = entry.cost;
                              const enumFee = entry.enumerator_fee;
                              const transFee = entry.transport_fee;
                              const bothFeesPresent = (enumFee !== undefined && enumFee !== null) && (transFee !== undefined && transFee !== null);
                              const finalCost = bothFeesPresent ? Number(enumFee) + Number(transFee) : currentCost;

                              const additional_data = {
                                ...entry.additional_data,
                                ...(enumFee !== undefined ? { enumerator_fee: enumFee } : {}),
                                ...(transFee !== undefined ? { transport_fee: transFee } : {}),
                                ...(finalCost !== undefined ? { cost: finalCost } : {}),
                                approved_and_costed_at: new Date().toISOString(),
                                approved_and_costed_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System'
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

                            // Update in batches to avoid timeout
                            const batchSize = 100;
                            for (let i = 0; i < updates.length; i += batchSize) {
                              const batch = updates.slice(i, i + batchSize);
                              const updatePromises = batch.map(update => {
                                const payload: any = { status: update.status, additional_data: update.additional_data };
                                if (update.cost !== undefined) payload.cost = update.cost;
                                if (update.enumerator_fee !== undefined) payload.enumerator_fee = update.enumerator_fee;
                                if (update.transport_fee !== undefined) payload.transport_fee = update.transport_fee;
                                return supabase
                                  .from('mmp_site_entries')
                                  .update(payload)
                                  .eq('id', update.id);
                              });
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
                        Approve for Costing ({verifiedCategorySiteRows.length} sites)
                      </Button>
                    </div>
                  )}
                  <VerifiedSitesDisplay verifiedSites={verifiedCategorySiteRows} />
                </>
              )}
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator) && verifiedSubTab === 'approvedCosted' && (
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
                      {(isAdmin || isICT) && approvedCostedSiteEntries.length > 0 && (
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
                        siteEntries={approvedCostedSiteEntries} 
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
                            const { data: approvedCostedEntries, error } = await supabase
                              .from('mmp_site_entries')
                              .select('*')
                              .or('status.ilike.%Approved and Costed%,status.ilike.%approved%costed%')
                              .order('created_at', { ascending: false })
                              .limit(1000);

                            if (!error && approvedCostedEntries) {
                              
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
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator) && verifiedSubTab === 'dispatched' && (
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
              {(isAdmin || isICT || isFOM || isSupervisor) && verifiedSubTab === 'smartAssigned' && (
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
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator) && verifiedSubTab === 'accepted' && (
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
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator) && verifiedSubTab === 'ongoing' && (
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
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator) && verifiedSubTab === 'completed' && (
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
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator) && verifiedSubTab === 'rejected' && (
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
                        <Badge variant="secondary">{rejectedSiteEntries.length} entries</Badge>
                      </div>
                      <MMPSiteEntriesTable 
                        siteEntries={rejectedSiteEntries} 
                        editable={false}
                      />
                    </div>
                  )}
                </div>
              )}
              {(isAdmin || isICT || isFOM || isSupervisor || isCoordinator) && verifiedSubTab !== 'newSites' && verifiedSubTab !== 'approvedCosted' && verifiedSubTab !== 'dispatched' && verifiedSubTab !== 'accepted' && verifiedSubTab !== 'ongoing' && verifiedSubTab !== 'completed' && verifiedSubTab !== 'rejected' && (
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
                                const status = (site.status || '').toLowerCase().replace(/[-_\s]/g, '');
                                return status === 'accepted' || 
                                       status === 'assigned' || 
                                       status === 'dispatched' ||
                                       status === 'smartassigned' ||
                                       status === 'pending' ||
                                       status === 'acknowledged' ||
                                       status === 'costandacknowledged' ||
                                       status.includes('pending') ||
                                       status.includes('accepted') ||
                                       status.includes('assigned');
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
                              {enumeratorMySites.filter(site => {
                                const status = (site.status || '').trim().toLowerCase();
                                return status === 'in progress' || status === 'ongoing';
                              }).length}
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
                                const status = (site.status || '').toLowerCase();
                                // Only count completed sites that are NOT in unsynced list (synced completed)
                                const isCompleted = status.includes('completed') || status.includes('finished') || status.includes('done');
                                if (!isCompleted) return false;
                                // Exclude sites that are still unsynced in offline DB
                                const isUnsynced = unsyncedCompletedVisits.some(uv => uv.id === site.id);
                                return !isUnsynced;
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
                                  const status = (site.status || '').toLowerCase().replace(/[-_\s]/g, '');
                                  return status === 'accepted' || 
                                         status === 'assigned' || 
                                         status === 'dispatched' ||
                                         status === 'smartassigned' ||
                                         status === 'pending' ||
                                         status === 'acknowledged' ||
                                         status === 'costandacknowledged' ||
                                         status.includes('pending') ||
                                         status.includes('accepted') ||
                                         status.includes('assigned');
                                }).length
                              : mySitesSubTab === 'ongoing'
                              ? unsyncedCompletedVisits.length
                              : mySitesSubTab === 'all'
                              ? enumeratorMySites.filter(site => {
                                  const status = (site.status || '').trim().toLowerCase();
                                  return status === 'in progress' || status === 'ongoing';
                                }).length
                              : enumeratorMySites.filter(site => {
                                  const status = (site.status || '').toLowerCase();
                                  const isCompleted = status.includes('completed') || status.includes('finished') || status.includes('done');
                                  if (!isCompleted) return false;
                                  // Exclude unsynced completed visits
                                  const isUnsynced = unsyncedCompletedVisits.some(uv => uv.id === site.id);
                                  return !isUnsynced;
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
                          // Drafts: Show both "In Progress" and "Ongoing" status site entries
                          sitesToShow = enumeratorMySites.filter(site => {
                            const status = (site.status || '').trim().toLowerCase();
                            return status === 'in progress' || status === 'ongoing';
                          });
                        } else if (mySitesSubTab === 'pending') {
                          sitesToShow = enumeratorMySites.filter(site => {
                            const status = (site.status || '').toLowerCase().replace(/[-_\s]/g, '');
                            return status === 'accepted' || 
                                   status === 'assigned' || 
                                   status === 'dispatched' ||
                                   status === 'smartassigned' ||
                                   status === 'pending' ||
                                   status === 'acknowledged' ||
                                   status === 'costandacknowledged' ||
                                   status.includes('pending') ||
                                   status.includes('accepted') ||
                                   status.includes('assigned');
                          });
                        } else if (mySitesSubTab === 'ongoing') {
                          // Outbox: Show completed visits that are not yet synced (from offline DB)
                          sitesToShow = unsyncedCompletedVisits;
                        } else {
                          // Sent: Show completed visits that are synced (from DB, excluding unsynced offline visits)
                          sitesToShow = enumeratorMySites.filter(site => {
                            const status = (site.status || '').toLowerCase();
                            const isCompleted = status.includes('completed') || status.includes('finished') || status.includes('done');
                            if (!isCompleted) return false;
                            // Exclude sites that are still unsynced in offline DB
                            const isUnsynced = unsyncedCompletedVisits.some(uv => uv.id === site.id);
                            return !isUnsynced;
                          });
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
                          siteEntries={sitesToShow} 
                          editable={enumeratorSubTab === 'mySites' && mySitesSubTab !== 'completed'}
                          onAcceptSite={enumeratorSubTab === 'smartAssigned' ? handleAcceptSite : undefined}
                          onAcknowledgeCost={enumeratorSubTab === 'smartAssigned' ? handleCostAcknowledgment : undefined}
                          onStartVisit={handleStartVisit}
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
                  <WorkflowTrackerTab mmpFiles={mmpFiles} />
                )}
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
                const { data: approvedCostedEntries, error } = await supabase
                  .from('mmp_site_entries')
                  .select('*')
                  .or('status.ilike.%Approved and Costed%,status.ilike.%approved%costed%')
                  .order('created_at', { ascending: false })
                  .limit(1000);

                if (!error && approvedCostedEntries) {
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
                    <p className="text-xs font-medium text-gray-600 mb-2">Data Collector Fee</p>
                    {selectedSiteForAcknowledgment.enumerator_fee !== undefined && selectedSiteForAcknowledgment.enumerator_fee !== null ? (
                      <p className="text-2xl font-semibold text-gray-900">
                        {Number(selectedSiteForAcknowledgment.enumerator_fee).toLocaleString()} SDG
                      </p>
                    ) : (
                      <div>
                        <p className="text-lg font-semibold text-amber-600">Pending</p>
                        <p className="text-xs text-gray-500 mt-1">Calculated when claimed</p>
                      </div>
                    )}
                    <p className="text-xs text-gray-600 mt-2">Payment for completing the site visit</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border">
                    <p className="text-xs font-medium text-gray-600 mb-2">Transport Fee</p>
                    {selectedSiteForAcknowledgment.transport_fee !== undefined && selectedSiteForAcknowledgment.transport_fee !== null ? (
                      <p className="text-2xl font-semibold text-gray-900">
                        {Number(selectedSiteForAcknowledgment.transport_fee).toLocaleString()} SDG
                      </p>
                    ) : (
                      <>
                        <p className="text-2xl font-semibold text-gray-900">0 SDG</p>
                        <p className="text-xs text-gray-500 mt-1">(Set at dispatch)</p>
                      </>
                    )}
                    <p className="text-xs text-gray-600 mt-2">Transportation reimbursement</p>
                  </div>
                  <div className="bg-blue-600 p-4 rounded-lg border border-blue-700">
                    <p className="text-xs font-medium text-blue-100 mb-2">Total Cost</p>
                    {selectedSiteForAcknowledgment.enumerator_fee !== undefined && selectedSiteForAcknowledgment.enumerator_fee !== null && selectedSiteForAcknowledgment.transport_fee !== undefined && selectedSiteForAcknowledgment.transport_fee !== null ? (
                      <p className="text-2xl font-bold text-white">
                        {(Number(selectedSiteForAcknowledgment.enumerator_fee) + Number(selectedSiteForAcknowledgment.transport_fee)).toLocaleString()} SDG
                      </p>
                    ) : selectedSiteForAcknowledgment.cost ? (
                      <p className="text-2xl font-bold text-white">
                        {Number(selectedSiteForAcknowledgment.cost).toLocaleString()} SDG
                      </p>
                    ) : (
                      <p className="text-lg font-bold text-blue-100">Pending</p>
                    )}
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
                    if (canClaimSites && currentUser?.id) {
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
                        
                        // Update sites: clear returned status and forward to new coordinator
                        const { error } = await supabase
                          .from('mmp_site_entries')
                          .update({
                            status: 'Pending',
                            forwarded_to_user_id: selectedCoordinatorForReturned,
                            forwarded_at: now,
                            forwarded_by_user_id: currentUser?.id,
                            verification_notes: null, // Clear old notes
                            updated_at: now
                          })
                          .in('id', siteIds);

                        if (error) throw error;

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
    </div>
  );
};

export default MMP;
