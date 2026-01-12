import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { useUserProjects } from '@/hooks/useUserProjects';
import { CheckCircle, Clock, FileCheck, XCircle, ArrowLeft, Eye, Edit, Search, ChevronLeft, ChevronRight, Calendar, CheckSquare, MapPin, AlertTriangle, ChevronUp, ChevronDown, Play, Upload } from 'lucide-react';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { format } from 'date-fns';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCoordinatorLocalityPermits } from '@/hooks/use-coordinator-permits';
import { LocalityPermitUpload } from '@/components/LocalityPermitUpload';
import { StatePermitUpload } from '@/components/StatePermitUpload';
import { SequentialPermitUpload } from '@/components/SequentialPermitUpload';
import { LocalityPermitStatus } from '@/types/coordinator-permits';
import { PermitVerificationQuestions, PermitDecision } from '@/components/PermitVerificationQuestions';
import { LocalityRequirementTriageDialog } from '@/components/mmp/LocalityRequirementTriageDialog';
import { LocalityPermitManager } from '@/components/coordinator/LocalityPermitManager';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { useGestures } from '@/hooks/use-gestures'; // Assuming this hook exists for swipe gestures
import { useLocation } from '@/context/location/LocationContext';
import { useCoordinatorSites, type SiteVisit, type SiteEntryCounts } from './hooks/useCoordinatorSites';
import { DataFreshnessBadge } from '@/components/realtime/DataFreshnessBadge';
import { FileCheck as FileCheck2, ListChecks, BarChart3, Shield } from 'lucide-react';

// Predefined options for dropdowns
const HUB_OFFICE_OPTIONS = [
  'Khartoum', 'Omdurman', 'Bahri', 'Port Sudan', 'Kassala', 'Gedaref', 
  'El Obeid', 'Nyala', 'El Fasher', 'Geneina', 'Zalingei', 'El Daein'
];

const ACTIVITY_OPTIONS = [
  'Use Market Diversion', 'Use Warehouse Monitoring'
];

const MONITORING_BY_OPTIONS = [
  'PACT'
];

const SURVEY_TOOL_OPTIONS = [
  'Kobo Toolbox', 'ODK', 'SurveyCTO', 'CommCare', 'ONA', 'Magpi',
  'Excel', 'Paper-based', 'Other'
];

// Location types are now imported from LocationContext
import type { Hub, State, Locality } from '@/context/location/LocationContext';

// SiteVisit type is now imported from useCoordinatorSites hook

interface SiteEditFormProps {
  site: SiteVisit;
  onSave: (site: SiteVisit, shouldVerify: boolean) => void;
  onCancel: () => void;
  hubs: Hub[];
  states: State[];
  localities: Locality[];
  hubStates?: { hub_id: string; state_id: string; state_name: string; state_code: string; }[];
}

function formatDateLocal(date: Date | undefined | null): string | null {
  if (!date) return null;
  // Get local date parts
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const SiteEditForm: React.FC<SiteEditFormProps> = ({ site, onSave, onCancel, hubs, states, localities, hubStates = [] }) => {
  const { toast } = useToast();
  const [formData, setFormData] = React.useState<SiteVisit>({
    ...site,
    activity_at_site: Array.isArray(site.activity_at_site) ? site.activity_at_site : 
                     (site.activity_at_site ? [site.activity_at_site] : [])
  });
  const [visitDate, setVisitDate] = React.useState<Date | undefined>(undefined);
  const [expectedStartDate, setExpectedStartDate] = React.useState<Date | undefined>(undefined);
  const [expectedEndDate, setExpectedEndDate] = React.useState<Date | undefined>(undefined);
  const [customValues, setCustomValues] = React.useState({
    survey_tool: ''
  });

  React.useEffect(() => {
    try {
      if (site?.visit_date) {
        const vd = new Date(site.visit_date);
        if (!isNaN(vd.getTime())) setVisitDate(vd);
      }
      const ev = (site as any)?.additional_data?.expected_visit;
      if (ev) {
        if (ev.start_date) {
          const sd = new Date(ev.start_date);
          if (!isNaN(sd.getTime())) setExpectedStartDate(sd);
        }
        if (ev.end_date) {
          const ed = new Date(ev.end_date);
          if (!isNaN(ed.getTime())) setExpectedEndDate(ed);
        }
      }
    } catch {}
  }, [site]);

  const isDMActivity = React.useMemo(() => {
    const a = `${formData?.main_activity || ''} ${formData?.activity || ''}`.toUpperCase();
    return a.includes('GFA') || a.includes('CBT') || a.includes('EBSFP');
  }, [formData?.main_activity, formData?.activity]);

  const validateExpectedForVerify = () => {
    if (isDMActivity) {
      if (!expectedStartDate || !expectedEndDate) {
        toast({
          title: 'Expected period required',
          description: 'Please select the expected period (start and end dates) for distribution (DM activities).',
          variant: 'destructive'
        });
        return false;
      }
      if (!visitDate) {
        toast({ title: 'Expected visit date required', description: 'Please select the expected visit date.', variant: 'destructive' });
        return false;
      }
      const d0 = new Date(expectedStartDate);
      const d1 = new Date(expectedEndDate);
      const dv = new Date(visitDate);
      d0.setHours(0,0,0,0); d1.setHours(23,59,59,999); dv.setHours(12,0,0,0);
      if (dv < d0 || dv > d1) {
        toast({ title: 'Date out of range', description: 'Expected visit date must fall within the selected expected period.', variant: 'destructive' });
        return false;
      }
      return true;
    }
    if (!visitDate) {
      toast({ title: 'Expected visit date required', description: 'Please select the expected visit date.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  // Get filtered states for selected hub
  const selectedHub = hubs.find(h => h.name === formData.hub_office);
  const hubStateOptions = selectedHub ? hubStates.filter(hs => hs.hub_id === selectedHub.id) : [];
  
  // Get localities for selected state
  const selectedState = hubStateOptions.find(s => s.state_name === formData.state);
  const localityOptions = selectedState ? localities.filter(loc => loc.state_id === selectedState.state_id) : [];

  const isCustomValue = (field: 'survey_tool', value: string) => {
    if (value === 'Other') return false;
    const options = {
      survey_tool: SURVEY_TOOL_OPTIONS
    };
    return !options[field].includes(value) && value !== '';
  };

  

  return (
    <div className="space-y-6">
      {/* Rejection Comments Section - Show for rejected sites */}
      {site.status?.toLowerCase() === 'rejected' && site.verification_notes && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-800">Rejection Reason</h3>
              <p className="text-sm text-red-700 mt-1">{site.verification_notes}</p>
            </div>
          </div>
        </div>
      )}

      {/* Check if site is in read-only mode (verified, approved, or completed) */}
      {(() => {
        const isReadOnly = ['verified', 'approved', 'completed'].includes(site.status?.toLowerCase() || '');
        return (
          <>
            {/* Site Details Summary */}
            <div className="border rounded-md p-3 bg-muted/30 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div><span className="text-muted-foreground">Locality:</span> <span className="font-medium">{formData.locality}</span></div>
                <div><span className="text-muted-foreground">Site Name:</span> <span className="font-medium">{formData.site_name}</span></div>
                <div><span className="text-muted-foreground">Site ID:</span> <span className="font-medium">{formData.site_code}</span></div>
                <div><span className="text-muted-foreground">CP name:</span> <span className="font-medium">{formData.cp_name || (formData as any)?.additional_data?.cp_name || '-'}</span></div>
                <div className="md:col-span-3"><span className="text-muted-foreground">Activity at the site:</span> <span className="font-medium">{Array.isArray(formData.activity_at_site) && formData.activity_at_site.length > 0 ? formData.activity_at_site.join(', ') : (formData.main_activity || formData.activity || '-')}</span></div>
                <div className="md:col-span-3"><span className="text-muted-foreground">Activity Details:</span> <span className="font-medium">{formData.activity || formData.main_activity || '-'}</span></div>
                <div><span className="text-muted-foreground">Visit by:</span> <span className="font-medium">{formData.monitoring_by || (formData as any)?.additional_data?.monitoring_by || '-'}</span></div>
                <div><span className="text-muted-foreground">Tool to be used:</span> <span className="font-medium">{formData.survey_tool || (formData as any)?.additional_data?.survey_tool || '-'}</span></div>
                <div><span className="text-muted-foreground">Use Market Diversion Monitoring:</span> <span className="font-medium">{formData.use_market_diversion ? 'Yes' : 'No'}</span></div>
                <div><span className="text-muted-foreground">Use Warehouse Monitoring:</span> <span className="font-medium">{formData.use_warehouse_monitoring ? 'Yes' : 'No'}</span></div>
                {/* Show verification info for verified sites */}
                {isReadOnly && formData.verified_at && (
                  <>
                    <div><span className="text-muted-foreground">Verified At:</span> <span className="font-medium">{new Date(formData.verified_at).toLocaleDateString()}</span></div>
                    <div><span className="text-muted-foreground">Verified By:</span> <span className="font-medium">{formData.verified_by || '-'}</span></div>
                    {formData.visit_date && (
                      <div><span className="text-muted-foreground">Expected Visit Date:</span> <span className="font-medium">{new Date(formData.visit_date).toLocaleDateString()}</span></div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Only show date pickers for non-verified sites */}
            {!isReadOnly && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Expected Visit Dates */}
                {isDMActivity ? (
                  <>
                    <div>
                      <Label>Expected Distribution Start <span className="text-red-500">*</span></Label>
                      <DatePicker date={expectedStartDate} onSelect={setExpectedStartDate} className="w-full" />
                    </div>
                    <div>
                      <Label>Expected Distribution End <span className="text-red-500">*</span></Label>
                      <DatePicker date={expectedEndDate} onSelect={setExpectedEndDate} className="w-full" />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Expected Visit Date <span className="text-red-500">*</span></Label>
                      <DatePicker date={visitDate} onSelect={setVisitDate} className="w-full" />
                      <p className="text-xs text-muted-foreground mt-1">Must be within the expected period above.</p>
                    </div>
                  </>
                ) : (
                  <div>
                    <Label>Expected Visit Date <span className="text-red-500">*</span></Label>
                    <DatePicker date={visitDate} onSelect={setVisitDate} className="w-full" />
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}

      <DialogFooter>
        {site.status?.toLowerCase() === 'permits_attached' ? (
          // For sites with permits attached, only show Verify button
          <Button 
            type="button"
            onClick={() => {
              if (!validateExpectedForVerify()) return;
              const expected_visit = isDMActivity ? {
                type: 'range',
                start_date: formatDateLocal(expectedStartDate),
                end_date: formatDateLocal(expectedEndDate),
                expected_date: formatDateLocal(visitDate),
              } : {
                type: 'single',
                expected_date: formatDateLocal(visitDate),
              };
              const updatedSite = {
                ...formData,
                visit_date: formatDateLocal(visitDate),
                additional_data: { ...(formData as any)?.additional_data, expected_visit },
                hub_office: formData.hub_office,
                monitoring_by: formData.monitoring_by,
                survey_tool: formData.survey_tool === 'Other' ? customValues.survey_tool : formData.survey_tool,
              };
              onSave(updatedSite, true);
            }}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Verify Site
          </Button>
        ) : site.status?.toLowerCase() === 'rejected' ? (
          // For rejected sites, show Save and Re-verify buttons
          <>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button 
              type="button" 
              variant="outline"
              onClick={() => {
                // Validate that visit date is required
                if (!visitDate) {
                  toast({
                    title: 'Validation Error',
                    description: 'Visit date is required. Please select a visit date before saving.',
                    variant: 'destructive'
                  });
                  return;
                }
                const updatedSite = {
                  ...formData,
                  visit_date: formatDateLocal(visitDate),
                  hub_office: formData.hub_office,
                  monitoring_by: formData.monitoring_by,
                  survey_tool: formData.survey_tool === 'Other' ? customValues.survey_tool : formData.survey_tool,
                };
                onSave(updatedSite, false);
              }}
            >
              Save Changes
            </Button>
            <Button 
              type="button" 
              variant="outline"
              onClick={() => {
                if (!validateExpectedForVerify()) return;
                const expected_visit = isDMActivity ? {
                  type: 'range',
                  start_date: formatDateLocal(expectedStartDate),
                  end_date: formatDateLocal(expectedEndDate),
                  expected_date: formatDateLocal(visitDate),
                } : {
                  type: 'single',
                  expected_date: formatDateLocal(visitDate),
                };
                const updatedSite = {
                  ...formData,
                  visit_date: formatDateLocal(visitDate),
                  additional_data: { ...(formData as any)?.additional_data, expected_visit },
                  hub_office: formData.hub_office,
                  monitoring_by: formData.monitoring_by,
                  survey_tool: formData.survey_tool === 'Other' ? customValues.survey_tool : formData.survey_tool,
                };
                onSave(updatedSite, true);
              }}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Re-verify Site
            </Button>
          </>
        ) : site.status?.toLowerCase() === 'verified' || site.status?.toLowerCase() === 'approved' || site.status?.toLowerCase() === 'completed' ? (
          // For verified/approved/completed sites, only show Close button (read-only mode)
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mr-auto">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>This site has been verified and cannot be edited.</span>
            </div>
            <Button type="button" variant="outline" onClick={onCancel}>
              Close
            </Button>
          </>
        ) : (
          // For other sites (new, pending, etc.), show both Save and Verify buttons
          <>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button 
              type="button" 
              variant="outline"
              onClick={() => {
                // Validate that visit date is required
                if (!visitDate) {
                  toast({
                    title: 'Validation Error',
                    description: 'Visit date is required. Please select a visit date before saving.',
                    variant: 'destructive'
                  });
                  return;
                }
                const updatedSite = {
                  ...formData,
                  visit_date: formatDateLocal(visitDate),
                  hub_office: formData.hub_office,
                  monitoring_by: formData.monitoring_by,
                  survey_tool: formData.survey_tool === 'Other' ? customValues.survey_tool : formData.survey_tool,
                };
                onSave(updatedSite, false);
              }}
            >
              Save
            </Button>
            <Button 
              type="button" 
              variant="outline"
              onClick={() => {
                if (!validateExpectedForVerify()) return;
                const expected_visit = isDMActivity ? {
                  type: 'range',
                  start_date: formatDateLocal(expectedStartDate),
                  end_date: formatDateLocal(expectedEndDate),
                  expected_date: formatDateLocal(visitDate),
                } : {
                  type: 'single',
                  expected_date: formatDateLocal(visitDate),
                };
                const updatedSite = {
                  ...formData,
                  visit_date: formatDateLocal(visitDate),
                  additional_data: { ...(formData as any)?.additional_data, expected_visit },
                  hub_office: formData.hub_office,
                  monitoring_by: formData.monitoring_by,
                  survey_tool: formData.survey_tool === 'Other' ? customValues.survey_tool : formData.survey_tool,
                };
                onSave(updatedSite, true);
              }}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Verify
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
};

// SiteVisit type is imported from useCoordinatorSites hook

const CoordinatorSites: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const { updateMMP, refreshMMPFiles, mmpFiles: contextMmpFiles } = useMMP();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const siteVisitContext = useSiteVisitContext();
  const [isStartingVisit, setIsStartingVisit] = useState(false);
  const { permits, loading: permitsLoading, uploadPermit, fetchPermits } = useCoordinatorLocalityPermits();
  const { hubs, states, localities, hubStates, loading: loadingLocations } = useLocation();
  const { coordinatorSites, loading: contextLoading, refetch: refreshSites, siteCounts } = useCoordinatorSites();
  
  // Parallel refresh helper for speed optimization
  const refreshAll = useCallback(async () => {
    await Promise.all([refreshMMPFiles(), refreshSites()]);
  }, [refreshMMPFiles, refreshSites]);
  
  const [localitiesData, setLocalitiesData] = useState<any[]>([]);
  const isPermitsSectionLoading =
    (contextLoading || permitsLoading || loadingLocations) &&
    localitiesData.length === 0;
  const [activeTab, setActiveTab] = useState('new');
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [siteVisitDates, setSiteVisitDates] = useState<{ [key: string]: Date | undefined }>({});
  const [selectedSiteForEdit, setSelectedSiteForEdit] = useState<SiteVisit | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Bulk actions state
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [bulkAssignDateDialogOpen, setBulkAssignDateDialogOpen] = useState(false);
  const [bulkVerifyDialogOpen, setBulkVerifyDialogOpen] = useState(false);
  const [bulkApproveDialogOpen, setBulkApproveDialogOpen] = useState(false);
  const [bulkVisitDate, setBulkVisitDate] = useState<string>('');
  const [bulkVerificationNotes, setBulkVerificationNotes] = useState('');
  const [bulkApprovalNotes, setBulkApprovalNotes] = useState('');
  
  // Bulk locality verification state
  const [bulkLocalityVerifyDialogOpen, setBulkLocalityVerifyDialogOpen] = useState(false);
  const [selectedLocalityForBulkVerify, setSelectedLocalityForBulkVerify] = useState<{localityKey: string, sites: SiteVisit[]} | null>(null);
  const [bulkLocalityVisitDate, setBulkLocalityVisitDate] = useState<string>('');
  const [bulkLocalityVisitDateObj, setBulkLocalityVisitDateObj] = useState<Date | undefined>(undefined);
  const [bulkExpectedStartDate, setBulkExpectedStartDate] = useState<Date | undefined>(undefined);
  const [bulkExpectedEndDate, setBulkExpectedEndDate] = useState<Date | undefined>(undefined);

  const hasBulkDMActivities = useMemo(() => {
    const sitesArr = selectedLocalityForBulkVerify?.sites || [];
    return sitesArr.some((s: any) => {
      const a = `${s?.main_activity || ''} ${s?.activity || ''}`.toUpperCase();
      return a.includes('GFA') || a.includes('CBT') || a.includes('EBSFP');
    });
  }, [selectedLocalityForBulkVerify]);
  
  // Filter states
  const [hubFilter, setHubFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [localityFilter, setLocalityFilter] = useState<string>('all');
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [monitoringFilter, setMonitoringFilter] = useState<string>('all');
  const [surveyToolFilter, setSurveyToolFilter] = useState<string>('all');
  
  // Badge counts - loaded separately for performance
  const [newSitesCount, setNewSitesCount] = useState(0);
  const [permitsAttachedCount, setPermitsAttachedCount] = useState(0);
  const [verifiedSitesCount, setVerifiedSitesCount] = useState(0);
  const [approvedSitesCount, setApprovedSitesCount] = useState(0);
  const [completedSitesCount, setCompletedSitesCount] = useState(0);
  const [rejectedSitesCount, setRejectedSitesCount] = useState(0);
  
  // Subcategory counts for new sites tabs
  const [statePermitRequiredCount, setStatePermitRequiredCount] = useState(0);
  const [localPermitRequiredCount, setLocalPermitRequiredCount] = useState(0);

  // Permit workflow state
  const [permitQuestionDialogOpen, setPermitQuestionDialogOpen] = useState(false);
  const [workWithoutPermitDialogOpen, setWorkWithoutPermitDialogOpen] = useState(false);
  const [selectedLocalityForWorkflow, setSelectedLocalityForWorkflow] = useState<any>(null);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());
  const [expandedLocalities, setExpandedLocalities] = useState<Set<string>>(new Set());
  const [expandedPermitsAttachedLocalities, setExpandedPermitsAttachedLocalities] = useState<Set<string>>(new Set());

  // State permit workflow state
  const [statePermitQuestionDialogOpen, setStatePermitQuestionDialogOpen] = useState(false);
  const [selectedStateForWorkflow, setSelectedStateForWorkflow] = useState<any>(null);

  // Locality permit upload dialog state
  const [localityPermitUploadDialogOpen, setLocalityPermitUploadDialogOpen] = useState(false);

  // Sequential permit upload dialog state (state first, then localities)
  const [sequentialPermitDialogOpen, setSequentialPermitDialogOpen] = useState(false);
  const [selectedStateForSequentialUpload, setSelectedStateForSequentialUpload] = useState<{state: string; stateId: string; mmpFileId: string} | null>(null);

  // Individual site verification without permit dialog state
  const [siteWithoutPermitDialogOpen, setSiteWithoutPermitDialogOpen] = useState(false);
  const [selectedSiteForWithoutPermit, setSelectedSiteForWithoutPermit] = useState<SiteVisit | null>(null);

  // Permit verification questions dialog state (for state/locality permit workflow)
  const [permitVerificationDialogOpen, setPermitVerificationDialogOpen] = useState(false);
  const [siteForPermitVerification, setSiteForPermitVerification] = useState<SiteVisit | null>(null);
  const [pendingVerificationData, setPendingVerificationData] = useState<any>(null);
  const [stateForPermitVerification, setStateForPermitVerification] = useState<{state: string; locality: string; mmpFileId: string} | null>(null);
  
  // Bulk permit verification state
  const [bulkSitesForPermitVerification, setBulkSitesForPermitVerification] = useState<SiteVisit[]>([]);
  const [bulkVerificationMode, setBulkVerificationMode] = useState<'single' | 'bulk' | 'locality'>('single');

  // Confirmation dialog for proceeding without permit
  const [confirmWithoutPermitDialogOpen, setConfirmWithoutPermitDialogOpen] = useState(false);
  const [withoutPermitComments, setWithoutPermitComments] = useState('');

  // Preview dialog for completed sites
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedSiteForPreview, setSelectedSiteForPreview] = useState<SiteVisit | null>(null);

  // Sub-tab state for new sites categorization
  const [newSitesSubTab, setNewSitesSubTab] = useState('state_required');

  // Locality permit requirement triage state
  const [localityTriageDialogOpen, setLocalityTriageDialogOpen] = useState(false);
  const [localityPermitRequirements, setLocalityPermitRequirements] = useState<Record<string, boolean>>({});
  const [triageCompleted, setTriageCompleted] = useState(false);
  
  // Initial yes/no prompt for locality permits
  const [localityPermitPromptOpen, setLocalityPermitPromptOpen] = useState(false);

  // Location data is now provided by LocationContext (removed local state)

  // Helper function to check if all sites in an MMP are verified and update MMP status
  // Returns true if MMP status was updated, false otherwise
  const checkAndUpdateMMPStatus = async (mmpFileId: string): Promise<boolean> => {
    if (!mmpFileId) {
      console.log('[MMP STATUS] No mmpFileId provided');
      return false;
    }
    
    try {
      // Get all sites for this MMP
      const { data: allSites, error: fetchError } = await supabase
        .from('mmp_site_entries')
        .select('id, status, site_name')
        .eq('mmp_file_id', mmpFileId);
      
      if (fetchError) {
        console.error('[MMP STATUS] Error fetching sites for MMP status check:', fetchError);
        return false;
      }
      
      if (!allSites || allSites.length === 0) {
        console.log('[MMP STATUS] No sites found for MMP', mmpFileId);
        return false;
      }
      
      console.log(`[MMP STATUS] Checking ${allSites.length} sites for MMP ${mmpFileId}:`, 
        allSites.map(s => ({ id: s.id, site: s.site_name, status: s.status }))
      );
      
      // Check if all sites are verified or approved (case-insensitive)
      // Also accept 'permits_verified' and 'cp_verified' as completed states
      const allVerified = allSites.every(site => {
        const status = (site.status || '').toLowerCase();
        const isVerified = status === 'verified' || status === 'approved' || status === 'completed' ||
                          status === 'permits_verified' || status === 'cp_verified';
        if (!isVerified) {
          console.log(`[MMP STATUS] Site ${site.site_name || site.id} NOT verified. Status: '${site.status}'`);
        }
        return isVerified;
      });
      
      if (allVerified) {
        console.log(`[MMP STATUS] All ${allSites.length} sites verified for MMP ${mmpFileId}, updating MMP status to approved`);
        
        // Update MMP status to 'approved' and update workflow stage
        const { data: currentMmp, error: getMmpError } = await supabase
          .from('mmp_files')
          .select('workflow')
          .eq('id', mmpFileId)
          .single();
        
        if (getMmpError) {
          console.error('[MMP STATUS] Error fetching MMP workflow:', getMmpError);
        }
        
        const currentWorkflow = (currentMmp?.workflow as any) || {};
        const updatedWorkflow = {
          ...currentWorkflow,
          currentStage: 'allSitesVerified',
          allSitesVerifiedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        
        const { error: updateError, data: updateResult } = await supabase
          .from('mmp_files')
          .update({
            status: 'approved',
            workflow: updatedWorkflow,
            updated_at: new Date().toISOString()
          })
          .eq('id', mmpFileId)
          .select();
        
        if (updateError) {
          console.error('[MMP STATUS] Error updating MMP status:', updateError);
          return false;
        } else {
          console.log(`[MMP STATUS] MMP ${mmpFileId} status updated to approved`, updateResult);
          return true;
        }
      } else {
        console.log(`[MMP STATUS] Not all sites verified for MMP ${mmpFileId}. No status change.`);
      }
      return false;
    } catch (error) {
      console.error('[MMP STATUS] Error in checkAndUpdateMMPStatus:', error);
      return false;
    }
  };

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Coordinator sites are now provided by useCoordinatorSites hook (following MMP.tsx pattern)

  // Filter sites by active tab status
  const sitesByTab = useMemo(() => {
    if (!coordinatorSites) return [];
    
    let result = [...coordinatorSites];
    
    // Filter by status based on active tab
    switch (activeTab) {
      case 'new':
        result = result.filter((e: any) => 
          e.status === 'Pending' || e.status === 'Dispatched' || e.status === 'assigned' || e.status === 'inProgress' || e.status === 'in_progress'
        );
        break;
      case 'permits_attached':
        result = result.filter((e: any) => 
          e.status?.toLowerCase() === 'permits_attached'
        );
        break;
      case 'verified':
        result = result.filter((e: any) => 
          e.status?.toLowerCase() === 'verified'
        );
        break;
      case 'approved':
        result = result.filter((e: any) => 
          e.status?.toLowerCase() === 'approved'
        );
        break;
      case 'completed':
        result = result.filter((e: any) => 
          e.status?.toLowerCase() === 'completed'
        );
        break;
      case 'rejected':
        result = result.filter((e: any) => 
          e.status?.toLowerCase() === 'rejected'
        );
        break;
    }
    
    // Sort by assigned_at
    result.sort((a: any, b: any) => {
      const aAt = a.assigned_at || a.additional_data?.assigned_at;
      const bAt = b.assigned_at || b.additional_data?.assigned_at;
      return new Date(bAt || 0).getTime() - new Date(aAt || 0).getTime();
    });
    
    return result;
  }, [coordinatorSites, activeTab]);

  // Memoize filtered sites to avoid recalculation on every render
  const filteredSites = useMemo(() => {
    if (!sitesByTab) return [];
    
    let result = sitesByTab;
    
    // Apply search filter
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter(site =>
        site.site_name?.toLowerCase().includes(query) ||
        site.site_code?.toLowerCase().includes(query) ||
        site.locality?.toLowerCase().includes(query)
      );
    }
    
    // Apply location filters
    if (hubFilter !== 'all') {
      result = result.filter(site => site.hub_office === hubFilter);
    }
    if (stateFilter !== 'all') {
      result = result.filter(site => site.state === stateFilter);
    }
    if (localityFilter !== 'all') {
      result = result.filter(site => site.locality === localityFilter);
    }
    if (activityFilter !== 'all') {
      result = result.filter(site => site.activity === activityFilter);
    }
    if (monitoringFilter !== 'all') {
      result = result.filter(site => site.monitoring_by === monitoringFilter);
    }
    if (surveyToolFilter !== 'all') {
      result = result.filter(site => site.survey_tool === surveyToolFilter);
    }
    
    return result;
  }, [sitesByTab, debouncedSearchQuery, hubFilter, stateFilter, localityFilter, activityFilter, monitoringFilter, surveyToolFilter]);

  // Memoize paginated sites
  const paginatedSites = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredSites.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredSites, currentPage, itemsPerPage]);

  // Memoize total pages
  const totalPages = useMemo(() => {
    return Math.ceil(filteredSites.length / itemsPerPage);
  }, [filteredSites.length, itemsPerPage]);

  // Memoize sites grouped by locality
  const sitesGroupedByLocality = useMemo(() => {
    const grouped: { [key: string]: SiteVisit[] } = {};
    filteredSites.forEach(site => {
      const key = `${site.state}|${site.locality}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(site);
    });
    return grouped;
  }, [filteredSites]);

  // Location data is now provided by LocationContext (no need to fetch manually)

  // Calculate badge counts from coordinator sites (using useMemo like MMP.tsx pattern)
  const badgeCounts = useMemo(() => {
    const newCount = coordinatorSites.filter((e: any) => 
      e.status === 'Pending' || e.status === 'Dispatched' || e.status === 'assigned' || e.status === 'inProgress' || e.status === 'in_progress'
    ).length;
    const permitsAttachedCount = coordinatorSites.filter((e: any) => 
      e.status?.toLowerCase() === 'permits_attached'
    ).length;
    const verifiedCount = coordinatorSites.filter((e: any) => 
      e.status?.toLowerCase() === 'verified'
    ).length;
    const approvedCount = coordinatorSites.filter((e: any) => 
      e.status?.toLowerCase() === 'approved'
    ).length;
    const completedCount = coordinatorSites.filter((e: any) => 
      e.status?.toLowerCase() === 'completed'
    ).length;
    const rejectedCount = coordinatorSites.filter((e: any) => 
      e.status?.toLowerCase() === 'rejected'
    ).length;

    return {
      new: newCount,
      permitsAttached: permitsAttachedCount,
      verified: verifiedCount,
      approved: approvedCount,
      completed: completedCount,
      rejected: rejectedCount
    };
  }, [coordinatorSites]);

  // Sync badge counts to state from fast counts (loaded separately for speed)
  useEffect(() => {
    setNewSitesCount(siteCounts.new);
    setPermitsAttachedCount(siteCounts.permitsAttached);
    setVerifiedSitesCount(siteCounts.verified);
    setApprovedSitesCount(siteCounts.approved);
    setCompletedSitesCount(siteCounts.completed);
    setRejectedSitesCount(siteCounts.rejected);
  }, [siteCounts]);

  // Reset search and pagination when tab changes
  useEffect(() => {
    setSearchQuery('');
    setCurrentPage(1);
    // Reset filters when tab changes
    setHubFilter('all');
    setStateFilter('all');
    setLocalityFilter('all');
    setActivityFilter('all');
    setMonitoringFilter('all');
    setSurveyToolFilter('all');
    // Reset expanded localities when tab changes
    setExpandedPermitsAttachedLocalities(new Set());
  }, [activeTab]);




  // Build locality data from coordinator sites
  useEffect(() => {
    if (!coordinatorSites || coordinatorSites.length === 0) {
      setLocalitiesData([]);
      setStatePermitRequiredCount(0);
      setLocalPermitRequiredCount(0);
      return;
    }

    // Group sites by state first, then by locality within each state
    const statesMap = new Map<string, any>();
    
    coordinatorSites.forEach((site: any) => {
      const stateKey = site.state;
      if (!statesMap.has(stateKey)) {
        statesMap.set(stateKey, {
          state: site.state,
          localities: new Map(),
          totalSites: 0,
          hasStatePermit: false,
          statePermitUploadedAt: null,
          statePermitVerified: false
        });
      }
      
      const stateData = statesMap.get(stateKey);
      const localityKey = site.locality;
      
      if (!stateData.localities.has(localityKey)) {
        stateData.localities.set(localityKey, {
          state: site.state,
          locality: site.locality,
          sites: [],
          hasPermit: false,
          permitId: null,
          permitUploadedAt: null
        });
      }
      
      stateData.localities.get(localityKey).sites.push(site);
      stateData.totalSites++;
    });

    // Build state/locality aggregates
    const statesArray = Array.from(statesMap.values()).map((stateData: any) => {
      const localitiesArray = Array.from(stateData.localities.values()).map((locality: any) => ({
        ...locality,
        hasPermit: false,
        permitId: null,
        permitUploadedAt: null
      }));

      // Check if any site has state permit flag or state permit not required
      let anySiteHasStatePermitFlag = false;
      try {
        const allSitesInState = localitiesArray.flatMap((loc: any) => loc.sites || []);
        anySiteHasStatePermitFlag = allSitesInState.some((s: any) => 
          s?.additional_data?.state_permit_attached === true || 
          s?.additional_data?.state_permit_not_required === true
        );
      } catch {}

      return {
        ...stateData,
        localities: localitiesArray,
        hasStatePermit: anySiteHasStatePermitFlag,
        statePermitUploadedAt: null,
        statePermitVerified: false
      };
    });

    // Update permit statuses by checking MMP context
    const enrichedStatesArray = statesArray.map((stateData: any) => {
      const firstLocality = stateData.localities[0];
      const mmpFileId = firstLocality?.sites?.[0]?.mmp_file_id;
      if (mmpFileId) {
        const mmpFile = contextMmpFiles.find(m => m.id === mmpFileId);
        if (mmpFile?.permits?.statePermits) {
          const statePermit = (mmpFile.permits.statePermits as any[]).find((sp: any) => sp.state === stateData.state);
          if (statePermit) {
            stateData.hasStatePermit = true;
            stateData.statePermitVerified = !!statePermit.verified;
            stateData.statePermitUploadedAt = statePermit.uploadedAt || null;
          }
        }
      }

      // Check locality permits
      const stateNameToId = new Map(hubStates.map((hs: any) => [hs.state_name, hs.state_id]));
      const localityKeyToId = new Map(localities.map((l: any) => [`${l.state_id}|${l.name}`, l.id]));
      const permitKeySet = new Set(permits.map((p: any) => `${p.stateId}|${p.localityId}`));

      stateData.localities = stateData.localities.map((locality: any) => {
        const resolvedStateId = stateNameToId.get(locality.state);
        const resolvedLocalityId = resolvedStateId ? localityKeyToId.get(`${resolvedStateId}|${locality.locality}`) : undefined;
        const hasPermit = resolvedStateId && resolvedLocalityId ? permitKeySet.has(`${resolvedStateId}|${resolvedLocalityId}`) : false;
        return {
          ...locality,
          hasPermit,
          permitId: null,
          permitUploadedAt: null
        };
      });

      return stateData;
    });

    setLocalitiesData(enrichedStatesArray);

    // Calculate subcategory counts for new sites tabs
    const statePermitRequired = enrichedStatesArray
      .filter((state: any) => !state.hasStatePermit)
      .reduce((total: number, state: any) => total + state.totalSites, 0);

    const localPermitRequired = enrichedStatesArray
      .filter((state: any) => state.hasStatePermit)
      .flatMap((state: any) => state.localities)
      .filter((locality: any) => !locality.hasPermit)
      .filter((locality: any) => {
        const validStatuses = ['pending', 'dispatched', 'assigned', 'inprogress', 'in_progress', 'new', 'forwarded'];
        return locality.sites.some((site: SiteVisit) => {
          const status = (site.status || '').toLowerCase().replace(/\s+/g, '_');
          return validStatuses.includes(status);
        });
      })
      .reduce((total: number, locality: any) => {
        const validStatuses = ['pending', 'dispatched', 'assigned', 'inprogress', 'in_progress', 'new', 'forwarded'];
        const pendingSites = locality.sites.filter((site: SiteVisit) => {
          const status = (site.status || '').toLowerCase().replace(/\s+/g, '_');
          return validStatuses.includes(status);
        });
        return total + pendingSites.length;
      }, 0);

    setStatePermitRequiredCount(statePermitRequired);
    setLocalPermitRequiredCount(localPermitRequired);
  }, [coordinatorSites, contextMmpFiles, hubStates, localities, permits]);

  const handleVerifySite = async (siteId: string, notes?: string) => {
    // Detect if running in Capacitor
    const isCapacitor = typeof (window as any).Capacitor !== 'undefined';
    
    try {
      const updateData: any = {
        status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
      };
      
      // Add verification notes if provided
      if (notes) {
        updateData.verification_notes = notes;
      }

      console.log(`[VERIFY] Starting verification for site ${siteId}${isCapacitor ? ' (Capacitor)' : ' (Web)'}`);
      
      const { error, data } = await supabase
        .from('mmp_site_entries')
        .update(updateData)
        .eq('id', siteId)
        .select();

      if (error) {
        console.error(`[VERIFY] Primary update failed:`, error);
        throw error;
      }
      
      console.log(`[VERIFY] Primary update successful, rows updated:`, data?.length || 0);
      
      try {
        const site = coordinatorSites.find(s => s.id === siteId);
        if (site?.mmp_file_id && site?.site_code) {
          // Get current site entry to check if cost exists
          const { data: currentEntry, error: selectError } = await supabase
            .from('mmp_site_entries')
            .select('cost, enumerator_fee, transport_fee, additional_data')
            .eq('mmp_file_id', site.mmp_file_id)
            .eq('site_code', site.site_code)
            .single();

          if (selectError) {
            console.error(`[VERIFY] Failed to fetch current entry:`, selectError);
            throw selectError;
          }

          const verifiedAt = new Date().toISOString();
          const verifiedBy = currentUser?.username || currentUser?.fullName || currentUser?.email || 'System';
          
          const mmpUpdateData: any = { 
            status: 'Verified',
            verified_at: verifiedAt,
            verified_by: verifiedBy
          };
          if (notes) {
            mmpUpdateData.verification_notes = notes;
          }
          
          // Do not persist default fees; leave fees empty if not set.
          const additionalData = currentEntry?.additional_data || {};
          
          // Also store verification info in additional_data for backward compatibility
          additionalData.verified_at = verifiedAt;
          additionalData.verified_by = verifiedBy;
          mmpUpdateData.additional_data = additionalData;
          
          // Check for errors in the second update
          const { error: secondUpdateError, data: secondUpdateData } = await supabase
            .from('mmp_site_entries')
            .update(mmpUpdateData)
            .eq('mmp_file_id', site.mmp_file_id)
            .eq('site_code', site.site_code)
            .select();

          if (secondUpdateError) {
            console.error(`[VERIFY] Second update failed:`, secondUpdateError);
            throw secondUpdateError;
          }
          
          console.log(`[VERIFY] Second update successful, rows updated:`, secondUpdateData?.length || 0);

          // Mark MMP as coordinator-verified when first site is verified
          // Get current MMP workflow
          const { data: mmpData, error: mmpError } = await supabase
            .from('mmp_files')
            .select('workflow, status')
            .eq('id', site.mmp_file_id)
            .single();

          if (mmpError) {
            console.error(`[VERIFY] Failed to fetch MMP data:`, mmpError);
            throw mmpError;
          }

          if (mmpData) {
            const workflow = (mmpData.workflow as any) || {};
            const isAlreadyVerified = workflow.coordinatorVerified === true;
            
            // Only update if not already marked as coordinator-verified
            if (!isAlreadyVerified) {
              const updatedWorkflow = {
                ...workflow,
                coordinatorVerified: true,
                coordinatorVerifiedAt: new Date().toISOString(),
                coordinatorVerifiedBy: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
                currentStage: workflow.currentStage === 'awaitingCoordinatorVerification' ? 'verified' : (workflow.currentStage || 'verified'),
                lastUpdated: new Date().toISOString()
              };

              // Update MMP workflow - keep status as 'pending' so it shows in "New Sites Verified by Coordinators"
              const updateSuccess = await updateMMP(site.mmp_file_id, {
                workflow: updatedWorkflow,
                status: mmpData.status === 'pending' ? 'pending' : 'pending' // Ensure it's pending
              });
              
              if (!updateSuccess) {
                console.error(`[VERIFY] updateMMP returned false for MMP ${site.mmp_file_id}`);
                // Don't throw here - the site verification itself succeeded, this is just workflow tracking
              } else {
                console.log(`[VERIFY] MMP workflow updated successfully`);
              }
            }
          }
        }
      } catch (syncErr) {
        console.error(`[VERIFY] Failed to sync mmp_site_entries on verify:`, syncErr);
        // Re-throw to be caught by outer catch block
        throw syncErr;
      }

      toast({
        title: 'Site Verified',
        description: 'The site has been marked as verified.',
      });

      // Trigger notification to supervisors, FOMs, admins, and super admins
      try {
        const site = coordinatorSites.find(s => s.id === siteId);
        if (site?.mmp_file_id) {
          // Fetch MMP name and hub_id for notification
          const { data: mmpInfo, error: mmpInfoError } = await supabase
            .from('mmp_files')
            .select('name, hub_id')
            .eq('id', site.mmp_file_id)
            .single();
          
          if (!mmpInfoError && mmpInfo) {
            const coordinatorName = currentUser?.fullName || currentUser?.username || currentUser?.email || 'Coordinator';
            await NotificationTriggerService.siteVerifiedByCoordinator(
              mmpInfo.hub_id,
              site.site_name,
              mmpInfo.name || 'MMP',
              coordinatorName,
              siteId
            );
            console.log(`[NOTIFICATION] Site verified notification sent for site: ${site.site_name}`);
          }
        }
      } catch (notifError) {
        console.warn('Failed to send site verified notification:', notifError);
      }

      // Check if all sites in the MMP are verified and update MMP status if so
      const site = coordinatorSites.find(s => s.id === siteId);
      if (site?.mmp_file_id) {
        await checkAndUpdateMMPStatus(site.mmp_file_id);
      }
      
      // Refresh both MMP files and coordinator sites to reflect the changes (single refresh after all updates)
      await refreshAll();
      
      // Badge counts will update automatically from coordinatorSites
      setActiveTab('verified');
      setVerifyDialogOpen(false);
      setVerificationNotes('');
      setSelectedSiteId(null);
    } catch (error: any) {
      console.error(`[VERIFY] Error verifying site ${siteId}:`, error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to verify site. Please try again.';
      
      if (error?.message) {
        if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your internet connection and try again.';
        } else if (error.message.includes('permission') || error.message.includes('policy')) {
          errorMessage = 'Permission denied. Please ensure you have the correct permissions.';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Request timed out. Please try again.';
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      }
      
      // Log additional context for debugging
      if (typeof (window as any).Capacitor !== 'undefined') {
        console.error(`[VERIFY] Capacitor environment detected. Error details:`, {
          error: error?.message || error,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
          siteId,
          userId: currentUser?.id
        });
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    }
  };

  const handleRejectSite = async (siteId: string, notes?: string) => {
    try {
      const updateData: any = {
        status: 'rejected',
        verified_at: new Date().toISOString(),
        verified_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
      };
      
      // Add verification notes if provided
      if (notes) {
        updateData.verification_notes = notes;
      }

      const { error } = await supabase
        .from('mmp_site_entries')
        .update(updateData)
        .eq('id', siteId);

      if (error) throw error;
      try {
        const site = coordinatorSites.find(s => s.id === siteId);
        if (site?.mmp_file_id && site?.site_code) {
          const mmpUpdateData: any = { status: 'Rejected' };
          if (notes) {
            mmpUpdateData.verification_notes = notes;
          }
          await supabase
            .from('mmp_site_entries')
            .update(mmpUpdateData)
            .eq('mmp_file_id', site.mmp_file_id)
            .eq('site_code', site.site_code);
        }
      } catch (syncErr) {
        console.warn('Failed to sync mmp_site_entries on reject:', syncErr);
      }

      toast({
        title: 'Site Rejected',
        description: 'The site has been marked as rejected.',
      });

      // Notify hub supervisor about site rejection
      try {
        const site = coordinatorSites.find(s => s.id === siteId);
        if (site?.hub_office) {
          const { data: hubData } = await supabase
            .from('hubs')
            .select('id')
            .eq('name', site.hub_office)
            .single();

          if (hubData?.id) {
            await NotificationTriggerService.siteOperationNotification(
              hubData.id,
              'rejected',
              site.site_name,
              {
                actorName: currentUser?.fullName || currentUser?.username || 'Coordinator',
                siteId: site.id,
                reason: notes
              }
            );
          }
        }
      } catch (supervisorErr) {
        console.warn('Failed to notify hub supervisor:', supervisorErr);
      }

      // Refresh both MMP files and coordinator sites to reflect the changes
      await refreshAll();
      // Badge counts will update automatically from coordinatorSites
      setRejectDialogOpen(false);
      setVerificationNotes('');
      setSelectedSiteId(null);
    } catch (error) {
      console.error('Error rejecting site:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject site. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Handle sending site back to FOM when coordinator cannot proceed without permit
  const handleSendBackToFOM = async (reason: string) => {
    console.log('handleSendBackToFOM called with reason:', reason);
    console.log('bulkVerificationMode:', bulkVerificationMode);
    console.log('bulkSitesForPermitVerification:', bulkSitesForPermitVerification);
    console.log('siteForPermitVerification:', siteForPermitVerification);
    console.log('stateForPermitVerification:', stateForPermitVerification);
    
    // Handle state-level verification
    if (stateForPermitVerification) {
      // Get all sites in this state from coordinatorSites
      const sitesToReturn = coordinatorSites.filter(site => 
        site.state === stateForPermitVerification.state
      );
      
      if (sitesToReturn.length === 0) {
        toast({
          title: 'Error',
          description: `No sites found for ${stateForPermitVerification.state}.`,
          variant: 'destructive'
        });
        return;
      }
      
      // Process return for all sites in state (same logic as below)
      try {
        const siteIds = sitesToReturn.map(s => s.id);
        
        // Update all sites' status to 'returned_to_fom'
        const { error } = await supabase
          .from('mmp_site_entries')
          .update({
            status: 'returned_to_fom',
            verification_notes: reason,
            verified_at: new Date().toISOString(),
            verified_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
          })
          .in('id', siteIds);

        if (error) throw error;

        // Try to send notification to FOM (find FOM for each unique MMP)
        const uniqueMmpIds = [...new Set(sitesToReturn.map(s => s.mmp_file_id))];
        for (const mmpFileId of uniqueMmpIds) {
          try {
            const { data: mmpData } = await supabase
              .from('mmp_files')
              .select('uploaded_by')
              .eq('id', mmpFileId)
              .single();

            if (mmpData?.uploaded_by) {
              const sitesForThisMmp = sitesToReturn.filter(s => s.mmp_file_id === mmpFileId);
              await supabase.from('notifications').insert({
                recipient_id: mmpData.uploaded_by,
                title_en: 'Sites Returned by Coordinator',
                title_ar: 'تم إرجاع المواقع من المنسق',
                message_en: sitesToReturn.length > 1 
                  ? `${sitesToReturn.length} sites in ${stateForPermitVerification.state} have been returned. Reason: ${reason}`
                  : `Site has been returned. Reason: ${reason}`,
                message_ar: sitesToReturn.length > 1 
                  ? `تم إرجاع ${sitesToReturn.length} مواقع في ${stateForPermitVerification.state}. السبب: ${reason}`
                  : `تم إرجاع الموقع. السبب: ${reason}`,
                event_type: 'approvals',
                status: 'pending',
                priority: 'high'
              });
            }
          } catch (notifErr) {
            console.warn('Failed to send notification to FOM:', notifErr);
          }
        }

        // Notify hub supervisor about sites being sent back to FOM
        const hubsNotified = new Set<string>();
        for (const site of sitesToReturn) {
          if (site.hub_office && !hubsNotified.has(site.hub_office)) {
            try {
              const { data: hubData } = await supabase
                .from('hubs')
                .select('id')
                .eq('name', site.hub_office)
                .single();

              if (hubData?.id) {
                const sitesInHub = sitesToReturn.filter(s => s.hub_office === site.hub_office);
                await NotificationTriggerService.siteReturnedToFOM(
                  hubData.id,
                  sitesInHub.length > 1 ? `${sitesInHub.length} sites in ${stateForPermitVerification.state}` : site.site_name,
                  sitesInHub.length,
                  reason,
                  currentUser?.fullName || currentUser?.username || 'Coordinator'
                );
                hubsNotified.add(site.hub_office);
              }
            } catch (supervisorErr) {
              console.warn('Failed to notify hub supervisor:', supervisorErr);
            }
          }
        }

        toast({
          title: 'Sites Returned to FOM',
          description: `${sitesToReturn.length} site(s) in ${stateForPermitVerification.state} have been sent back to FOM for action.`,
        });

        // Close dialogs and reload
        setPermitVerificationDialogOpen(false);
        setStateForPermitVerification(null);
        await refreshAll();
        return;
      } catch (error) {
        console.error('Error sending sites back to FOM:', error);
        toast({
          title: 'Error',
          description: 'Failed to send sites back to FOM. Please try again.',
          variant: 'destructive'
        });
        return;
      }
    }
    
    // Handle bulk mode or single site mode
    const sitesToReturn = bulkVerificationMode !== 'single' && bulkSitesForPermitVerification.length > 0
      ? bulkSitesForPermitVerification
      : siteForPermitVerification ? [siteForPermitVerification] : [];
    
    console.log('sitesToReturn:', sitesToReturn);
    
    if (sitesToReturn.length === 0) {
      console.error('No sites to return!');
      toast({
        title: 'Error',
        description: 'No sites selected to return.',
        variant: 'destructive'
      });
      return;
    }
    
    try {
      const siteIds = sitesToReturn.map(s => s.id);
      
      // Update all sites' status to 'returned_to_fom'
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'returned_to_fom',
          verification_notes: reason,
          verified_at: new Date().toISOString(),
          verified_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
        })
        .in('id', siteIds);

      if (error) throw error;

      // Try to send notification to FOM (find FOM for each unique MMP)
      const uniqueMmpIds = [...new Set(sitesToReturn.map(s => s.mmp_file_id))];
      for (const mmpFileId of uniqueMmpIds) {
        try {
          const { data: mmpData } = await supabase
            .from('mmp_files')
            .select('uploaded_by')
            .eq('id', mmpFileId)
            .single();

          if (mmpData?.uploaded_by) {
            const sitesForThisMmp = sitesToReturn.filter(s => s.mmp_file_id === mmpFileId);
            await supabase.from('notifications').insert({
              recipient_id: mmpData.uploaded_by,
              title_en: 'Sites Returned by Coordinator',
              title_ar: 'تم إرجاع المواقع من المنسق',
              message_en: sitesToReturn.length > 1 
                ? `${sitesToReturn.length} sites have been returned. Reason: ${reason}`
                : `Site ${sitesToReturn[0].site_name} has been returned. Reason: ${reason}`,
              message_ar: sitesToReturn.length > 1 
                ? `تم إرجاع ${sitesToReturn.length} مواقع. السبب: ${reason}`
                : `تم إرجاع الموقع ${sitesToReturn[0].site_name}. السبب: ${reason}`,
              event_type: 'approvals',
              status: 'pending',
              priority: 'high'
            });
          }
        } catch (notifErr) {
          console.warn('Failed to send notification to FOM:', notifErr);
        }
      }

      // Notify hub supervisor about sites being sent back to FOM
      const hubsNotified = new Set<string>();
      for (const site of sitesToReturn) {
        if (site.hub_office && !hubsNotified.has(site.hub_office)) {
          try {
            const { data: hubData } = await supabase
              .from('hubs')
              .select('id')
              .eq('name', site.hub_office)
              .single();

            if (hubData?.id) {
              const sitesInHub = sitesToReturn.filter(s => s.hub_office === site.hub_office);
              await NotificationTriggerService.siteReturnedToFOM(
                hubData.id,
                sitesInHub.length > 1 ? `${sitesInHub.length} sites` : site.site_name,
                sitesInHub.length,
                reason,
                currentUser?.fullName || currentUser?.username || 'Coordinator'
              );
              hubsNotified.add(site.hub_office);
            }
          } catch (supervisorErr) {
            console.warn('Failed to notify hub supervisor:', supervisorErr);
          }
        }
      }

      toast({
        title: 'Sites Returned to FOM',
        description: sitesToReturn.length > 1 
          ? `${sitesToReturn.length} sites have been sent back to FOM for action.`
          : 'The site has been sent back to FOM for action.',
      });

      // Close dialogs and reload
      setPermitVerificationDialogOpen(false);
      setSiteForPermitVerification(null);
      setStateForPermitVerification(null);
      setPendingVerificationData(null);
      setBulkSitesForPermitVerification([]);
      setBulkVerificationMode('single');
    } catch (error) {
      console.error('Error sending sites back to FOM:', error);
      toast({
        title: 'Error',
        description: 'Failed to send sites back to FOM. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Handle completion of permit verification questions
  const handlePermitVerificationComplete = async (decision: PermitDecision) => {
    // Handle state-level verification
    if (stateForPermitVerification) {
      // Get all sites in this state from coordinatorSites
      const sitesInState = coordinatorSites.filter(site => 
        site.state === stateForPermitVerification.state
      );
      
      if (sitesInState.length === 0) {
        toast({
          title: 'No Sites Found',
          description: `No sites found for ${stateForPermitVerification.state}.`,
          variant: 'destructive'
        });
        return;
      }

      // Process all sites in the state
      const verifiedBy = currentUser?.username || currentUser?.fullName || currentUser?.email || 'System';
      const verifiedAt = new Date().toISOString();
      
      const statePermitNotRequired = decision.statePermit.requirement === 'not_required' || 
        (decision.statePermit.requirement === 'required_dont_have_it' && decision.statePermit.canWorkWithout === 'yes');
      
      // Check if state permit was just uploaded (required_have_it + uploaded: true)
      // In this case, sites should NOT be verified yet - they need locality permits first
      const statePermitJustUploaded = decision.statePermit.requirement === 'required_have_it' && 
        decision.statePermit.uploaded === true;
      
      // Determine if sites should be verified now
      // Sites are verified if:
      // 1. They already have permits_attached status (both state and locality permits are done) - verify them
      // 2. State permit was just uploaded - don't verify yet, need locality permits first
      // 3. State permit not required - don't verify yet, still need to handle locality permits
      // IMPORTANT: Sites with 'permits_attached' status have BOTH permits and should be verified now
      const hasPermitsAttached = sitesInState.some(s => s.status?.toLowerCase() === 'permits_attached');
      const shouldVerifyNow = hasPermitsAttached || (!statePermitJustUploaded && !statePermitNotRequired);
      
      // Update all sites in the state
      for (const site of sitesInState) {
        const additionalData = {
          ...(site.additional_data || {}),
          permit_decision: decision,
          ...(statePermitNotRequired ? { state_permit_not_required: true } : {}),
          ...(statePermitJustUploaded ? { state_permit_attached: true } : {}),
        };

        // Determine if THIS specific site should be verified now
        // A site should be verified if:
        // 1. It already has 'permits_attached' status (both state and locality permits are done)
        // 2. OR state permit is not being uploaded for the first time AND is not marked as not required
        const siteHasPermitsAttached = site.status?.toLowerCase() === 'permits_attached';
        const shouldVerifyThisSite = siteHasPermitsAttached || (!statePermitJustUploaded && !statePermitNotRequired);
        
        const updateData: any = shouldVerifyThisSite ? {
          // Sites are being verified (both state and locality permits are done)
          status: 'verified',
          verified_at: verifiedAt,
          verified_by: verifiedBy,
          additional_data: additionalData,
        } : {
          // Only update additional_data - do NOT change status (still need locality permits)
          additional_data: additionalData,
        };

        const { error } = await supabase
          .from('mmp_site_entries')
          .update(updateData)
          .eq('id', site.id);

        if (error) {
          console.error(`Error updating site ${site.id}:`, error);
          continue;
        }

        // Update MMP workflow only if sites are being verified now
        // Don't update workflow if state permit was just uploaded (sites not verified yet)
        if (shouldVerifyNow) {
          try {
            const { data: mmpData } = await supabase
              .from('mmp_files')
              .select('workflow, status')
              .eq('id', site.mmp_file_id)
              .single();

            if (mmpData) {
              const workflow = (mmpData.workflow as any) || {};
              if (!workflow.coordinatorVerified) {
                const updatedWorkflow = {
                  ...workflow,
                  coordinatorVerified: true,
                  coordinatorVerifiedAt: verifiedAt,
                  coordinatorVerifiedBy: verifiedBy,
                  currentStage: workflow.currentStage === 'awaitingCoordinatorVerification' ? 'verified' : (workflow.currentStage || 'verified'),
                  lastUpdated: verifiedAt
                };
                await updateMMP(site.mmp_file_id, {
                  workflow: updatedWorkflow,
                  status: 'pending'
                });
              }
            }
          } catch (syncErr) {
            console.warn('Failed to sync MMP workflow:', syncErr);
          }
        }
      }

      // Show appropriate toast message based on what happened
      if (statePermitJustUploaded) {
        // State permit was just uploaded - sites move to locality permit tab
        toast({
          title: 'State Permit Uploaded',
          description: sitesInState.length > 1 
            ? `State permit uploaded. ${sitesInState.length} sites moved to Locality Permit Status. You can now upload locality permits.`
            : 'State permit uploaded. Site moved to Locality Permit Status. You can now upload locality permits.',
        });
      } else if (statePermitNotRequired) {
        // State permit not required - sites move to locality permit tab
        toast({
          title: 'State Permit Not Required',
          description: sitesInState.length > 1 
            ? `${sitesInState.length} sites in ${stateForPermitVerification.state} moved to Locality Permit Status.`
            : `Site in ${stateForPermitVerification.state} moved to Locality Permit Status.`,
        });
      } else {
        // Sites are being verified - move to verified tab
        toast({
          title: 'Sites Verified',
          description: `${sitesInState.length} sites in ${stateForPermitVerification.state} have been verified successfully.`,
        });
      }

      setPermitVerificationDialogOpen(false);
      setStateForPermitVerification(null);
      
      // Check if all sites in affected MMPs are verified and update MMP status
      if (shouldVerifyNow) {
        const mmpIds = new Set(sitesInState.map(s => s.mmp_file_id).filter(Boolean));
        for (const mmpId of mmpIds) {
          await checkAndUpdateMMPStatus(mmpId);
        }
      }
      
      await refreshAll();
      
      // Switch to appropriate tab
      if (statePermitJustUploaded || statePermitNotRequired) {
        // Move to locality permit tab to upload locality permits
        setNewSitesSubTab('local_required');
        setActiveTab('new');
      } else {
        // Sites are verified - move to verified tab
        setActiveTab('verified');
      }
      
      return;
    }

    // Handle bulk mode or single site mode
    const sitesToVerify = bulkVerificationMode !== 'single' && bulkSitesForPermitVerification.length > 0
      ? bulkSitesForPermitVerification
      : siteForPermitVerification ? [siteForPermitVerification] : [];
    
    if (sitesToVerify.length === 0) return;
    
    try {
      const verifiedBy = currentUser?.username || currentUser?.fullName || currentUser?.email || 'System';
      const verifiedAt = new Date().toISOString();
      
      // Check if state permit is not required or user can proceed without it
      const statePermitNotRequired = decision.statePermit.requirement === 'not_required' || 
        (decision.statePermit.requirement === 'required_dont_have_it' && decision.statePermit.canWorkWithout === 'yes');
      
      // Check if state permit was just uploaded (required_have_it + uploaded: true)
      // In this case, sites should NOT be verified yet - they need locality permits first
      const statePermitJustUploaded = decision.statePermit?.requirement === 'required_have_it' && 
        decision.statePermit?.uploaded === true;
      
      // Determine if sites should be verified now
      // Sites are verified if:
      // 1. They already have permits_attached status (both state and locality permits are done) - verify them
      // 2. State permit was just uploaded - don't verify yet, need locality permits first
      // 3. State permit not required - don't verify yet, still need to handle locality permits
      // IMPORTANT: Sites with 'permits_attached' status have BOTH permits and should be verified now
      const hasPermitsAttached = sitesToVerify.some(s => s.status?.toLowerCase() === 'permits_attached');
      const shouldVerifyNow = hasPermitsAttached || (!statePermitJustUploaded && !statePermitNotRequired);
      
      // Update all sites with permit decision
      for (const site of sitesToVerify) {
        const additionalData = {
          ...(site.additional_data || {}),
          permit_decision: decision,
          ...(pendingVerificationData?.additional_data || {}),
          ...(statePermitNotRequired ? { state_permit_not_required: true } : {}),
          ...(statePermitJustUploaded ? { state_permit_attached: true } : {}),
        };

        // Determine if THIS specific site should be verified now
        // A site should be verified if:
        // 1. It already has 'permits_attached' status (both state and locality permits are done)
        // 2. OR state permit is not being uploaded for the first time AND is not marked as not required
        const siteHasPermitsAttached = site.status?.toLowerCase() === 'permits_attached';
        const shouldVerifyThisSite = siteHasPermitsAttached || (!statePermitJustUploaded && !statePermitNotRequired);
        
        const updateData: any = shouldVerifyThisSite ? {
          // Sites are being verified (both state and locality permits are done)
          ...(pendingVerificationData || {}),
          status: 'verified',
          verified_at: verifiedAt,
          verified_by: verifiedBy,
          additional_data: additionalData,
        } : {
          // Only update additional_data - do NOT change status (still need locality permits)
          additional_data: additionalData,
        };

        const { error } = await supabase
          .from('mmp_site_entries')
          .update(updateData)
          .eq('id', site.id);

        if (error) throw error;

        // Update MMP workflow only if sites are being verified now
        // Don't update workflow if state permit was just uploaded (sites not verified yet)
        if (shouldVerifyNow) {
          try {
            const { data: mmpData } = await supabase
              .from('mmp_files')
              .select('workflow, status')
              .eq('id', site.mmp_file_id)
              .single();

            if (mmpData) {
              const workflow = (mmpData.workflow as any) || {};
              if (!workflow.coordinatorVerified) {
                const updatedWorkflow = {
                  ...workflow,
                  coordinatorVerified: true,
                  coordinatorVerifiedAt: verifiedAt,
                  coordinatorVerifiedBy: verifiedBy,
                  currentStage: workflow.currentStage === 'awaitingCoordinatorVerification' ? 'verified' : (workflow.currentStage || 'verified'),
                  lastUpdated: verifiedAt
                };
                await updateMMP(site.mmp_file_id, {
                  workflow: updatedWorkflow,
                  status: 'pending'
                });
              }
            }
          } catch (syncErr) {
            console.warn('Failed to sync MMP workflow:', syncErr);
          }
        }
      }

      // Notify hub supervisors only if sites are being verified now
      if (shouldVerifyNow) {
        try {
          const hubsNotified = new Set();
          for (const site of sitesToVerify) {
            if (site.hub_office && !hubsNotified.has(site.hub_office)) {
              const { data: hubData } = await supabase
                .from('hubs')
                .select('id')
                .eq('name', site.hub_office)
                .single();
              if (hubData?.id) {
                const sitesInHub = sitesToVerify.filter(s => s.hub_office === site.hub_office);
                await NotificationTriggerService.siteOperationNotification(
                  hubData.id,
                  'verified',
                  sitesInHub.length > 1 ? `${sitesInHub.length} sites` : site.site_name,
                  {
                    actorName: verifiedBy,
                    siteCount: sitesInHub.length
                  }
                );
                hubsNotified.add(site.hub_office);
              }
            }
          }
        } catch (notifyErr) {
          console.warn('Failed to notify supervisors about verification:', notifyErr);
        }
      }

      // Show appropriate toast message based on what happened
      if (statePermitJustUploaded) {
        // State permit was just uploaded - sites move to locality permit tab
        toast({
          title: 'State Permit Uploaded',
          description: sitesToVerify.length > 1 
            ? `State permit uploaded. ${sitesToVerify.length} sites moved to Locality Permit Status. You can now upload locality permits.`
            : 'State permit uploaded. Site moved to Locality Permit Status. You can now upload locality permits.',
        });
      } else if (statePermitNotRequired) {
        // State permit not required - sites move to locality permit tab
        toast({
          title: 'State Permit Not Required',
          description: sitesToVerify.length > 1 
            ? `${sitesToVerify.length} sites moved to Locality Permit Status.`
            : 'Site moved to Locality Permit Status.',
        });
      } else {
        // Sites are being verified (both state and locality permits are done)
        toast({
          title: sitesToVerify.length > 1 ? 'Sites Verified' : 'Site Verified',
          description: sitesToVerify.length > 1 
            ? `${sitesToVerify.length} sites have been verified successfully.`
            : 'The site has been verified successfully.',
        });
      }

      // Close dialogs and reload
      setPermitVerificationDialogOpen(false);
      setSiteForPermitVerification(null);
      setPendingVerificationData(null);
      setBulkSitesForPermitVerification([]);
      setBulkVerificationMode('single');
      setEditDialogOpen(false);
      setSelectedSiteForEdit(null);
      setSelectedSites(new Set());
      setBulkVerifyDialogOpen(false);
      
      // Check if all sites in affected MMPs are verified and update MMP status
      const mmpIds = new Set(sitesToVerify.map(s => s.mmp_file_id).filter(Boolean));
      for (const mmpId of mmpIds) {
        await checkAndUpdateMMPStatus(mmpId);
      }
      
      // Single refresh after all updates
      await refreshAll();
    } catch (error) {
      console.error('Error completing verification:', error);
      toast({
        title: 'Error',
        description: 'Failed to complete verification. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Function to start permit verification workflow (called when user clicks Verify on permits_attached site)
  const startPermitVerificationWorkflow = (site: SiteVisit, verificationData: any) => {
    setSiteForPermitVerification(site);
    setPendingVerificationData(verificationData);
    setPermitVerificationDialogOpen(true);
  };

  const handleVisitDateChange = async (siteId: string, date: Date | undefined) => {
    try {
      // Update local state
      setSiteVisitDates(prev => ({ ...prev, [siteId]: date }));

      // Update database
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          visit_date: date ? date.toISOString().split('T')[0] : null
        })
        .eq('id', siteId);

      if (error) throw error;

      toast({
        title: 'Visit Date Updated',
        description: 'The visit date has been saved successfully.',
      });
    } catch (error) {
      console.error('Error updating visit date:', error);
      toast({
        title: 'Error',
        description: 'Failed to update visit date. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Bulk actions handlers
  const handleBulkAssignVisitDate = async () => {
    if (!bulkVisitDate || selectedSites.size === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select a visit date and at least one site.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const siteIds = Array.from(selectedSites);

      // Use formatDateLocal to ensure local date is saved
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({ visit_date: formatDateLocal(new Date(bulkVisitDate)) })
        .in('id', siteIds);

      if (error) throw error;

      toast({
        title: 'Bulk Visit Date Assignment',
        description: `Visit date assigned to ${selectedSites.size} site(s) successfully.`,
      });

      // Clear selection and reload sites
      setSelectedSites(new Set());
      setBulkVisitDate('');
      setBulkAssignDateDialogOpen(false);
      await refreshAll();
    } catch (error) {
      console.error('Error bulk assigning visit dates:', error);
      toast({
        title: 'Error',
        description: 'Failed to assign visit dates. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleBulkVerifySites = async () => {
    if (selectedSites.size === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select at least one site to verify.',
        variant: 'destructive'
      });
      return;
    }

    // Get selected sites data
    const selectedSitesData = coordinatorSites.filter(site => selectedSites.has(site.id));
    
    // Check if any selected sites have permits_attached status - these need permit verification questions
    const permitsAttachedSites = selectedSitesData.filter(s => s.status?.toLowerCase() === 'permits_attached');
    
    if (permitsAttachedSites.length > 0) {
      // Open permit verification dialog for permits_attached sites
      // Use first site for state/locality info (typically bulk verify is same locality)
      const firstSite = permitsAttachedSites[0];
      setBulkSitesForPermitVerification(permitsAttachedSites);
      setBulkVerificationMode('bulk');
      setSiteForPermitVerification(firstSite);
      setPendingVerificationData({
        verification_notes: bulkVerificationNotes || undefined,
      });
      setBulkVerifyDialogOpen(false);
      setPermitVerificationDialogOpen(true);
      return;
    }

    // No permits_attached sites - proceed with direct verification
    try {
      const siteIds = Array.from(selectedSites);
      const updateData: any = {
        status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
      };

      if (bulkVerificationNotes) {
        updateData.verification_notes = bulkVerificationNotes;
      }

      const { error } = await supabase
        .from('mmp_site_entries')
        .update(updateData)
        .in('id', siteIds);

      if (error) throw error;

      // Also update MMP files for verified sites
      try {
        for (const site of selectedSitesData) {
          if (site?.mmp_file_id && site?.site_code) {
            const mmpUpdateData: any = { 
              status: 'Verified',
              verified_at: new Date().toISOString(),
              verified_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System'
            };
            if (bulkVerificationNotes) {
              mmpUpdateData.verification_notes = bulkVerificationNotes;
            }
            
            await supabase
              .from('mmp_site_entries')
              .update(mmpUpdateData)
              .eq('mmp_file_id', site.mmp_file_id)
              .eq('site_code', site.site_code);

            // Mark MMP as coordinator-verified when first site is verified
            const { data: mmpData, error: mmpError } = await supabase
              .from('mmp_files')
              .select('workflow, status')
              .eq('id', site.mmp_file_id)
              .single();

            if (!mmpError && mmpData) {
              const workflow = (mmpData.workflow as any) || {};
              const isAlreadyVerified = workflow.coordinatorVerified === true;
              
              if (!isAlreadyVerified) {
                const updatedWorkflow = {
                  ...workflow,
                  coordinatorVerified: true,
                  coordinatorVerifiedAt: new Date().toISOString(),
                  coordinatorVerifiedBy: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
                  currentStage: workflow.currentStage === 'awaitingCoordinatorVerification' ? 'verified' : (workflow.currentStage || 'verified'),
                  lastUpdated: new Date().toISOString()
                };
                await supabase
                  .from('mmp_files')
                  .update({
                    workflow: updatedWorkflow,
                    status: mmpData.status === 'pending' ? 'pending' : 'pending'
                  })
                  .eq('id', site.mmp_file_id);
              }
            }
          }
        }
      } catch (syncErr) {
        console.warn('Failed to sync mmp_site_entries on bulk verify:', syncErr);
      }

      toast({
        title: 'Bulk Verification Complete',
        description: `${selectedSites.size} site(s) have been verified successfully.`,
      });

      // Notify hub supervisors about verified sites
      try {
        const hubsNotified = new Set<string>();
        for (const site of selectedSitesData) {
          if (site.hub_office && !hubsNotified.has(site.hub_office)) {
            const { data: hubData } = await supabase
              .from('hubs')
              .select('id')
              .eq('name', site.hub_office)
              .single();
            if (hubData?.id) {
              const sitesInHub = selectedSitesData.filter(s => s.hub_office === site.hub_office);
              await NotificationTriggerService.siteOperationNotification(
                hubData.id,
                'verified',
                sitesInHub.length > 1 ? `${sitesInHub.length} sites` : site.site_name,
                {
                  actorName: currentUser?.username || currentUser?.fullName || 'Coordinator',
                  siteCount: sitesInHub.length
                }
              );
              hubsNotified.add(site.hub_office);
            }
          }
        }
      } catch (notifyErr) {
        console.warn('Failed to notify supervisors about verification:', notifyErr);
      }

      // Clear selection and reload sites
      setSelectedSites(new Set());
      setBulkVerificationNotes('');
      setBulkVerifyDialogOpen(false);
      
      // Check if all sites in affected MMPs are verified and update MMP status
      const mmpIds = new Set(selectedSitesData.map(s => s.mmp_file_id).filter(Boolean));
      for (const mmpId of mmpIds) {
        await checkAndUpdateMMPStatus(mmpId);
      }
      
      // Single refresh after all updates
      await refreshAll();
      
      // Badge counts will update automatically from coordinatorSites
      setActiveTab('approved');
    } catch (error) {
      console.error('Error bulk approving sites:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve sites. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleBulkLocalityVerify = async () => {
    if (!selectedLocalityForBulkVerify) {
      toast({ title: 'Validation Error', description: 'No locality selected.', variant: 'destructive' });
      return;
    }

    // Parse state and locality from localityKey
    const [stateName, localityName] = selectedLocalityForBulkVerify.localityKey.split('|');
    const hubOffice = selectedLocalityForBulkVerify.sites[0]?.hub_office;

    // Validate inputs based on DM presence
    if (hasBulkDMActivities) {
      if (!bulkExpectedStartDate || !bulkExpectedEndDate) {
        toast({ title: 'Expected period required', description: 'Please select the expected period (start and end dates) for DM sites.', variant: 'destructive' });
        return;
      }
      if (!bulkLocalityVisitDateObj) {
        toast({ title: 'Expected visit date required', description: 'Please select the expected visit date.', variant: 'destructive' });
        return;
      }
      const d0 = new Date(bulkExpectedStartDate);
      const d1 = new Date(bulkExpectedEndDate);
      const dv = new Date(bulkLocalityVisitDateObj);
      d0.setHours(0,0,0,0); d1.setHours(23,59,59,999); dv.setHours(12,0,0,0);
      if (dv < d0 || dv > d1) {
        toast({ title: 'Date out of range', description: 'Expected visit date must fall within the selected expected period.', variant: 'destructive' });
        return;
      }
    } else {
      if (!bulkLocalityVisitDateObj) {
        toast({ title: 'Expected visit date required', description: 'Please select the expected visit date.', variant: 'destructive' });
        return;
      }
    }

    try {
      const { sites: localitySites } = selectedLocalityForBulkVerify;
      const visitDateString = formatDateLocal(bulkLocalityVisitDateObj);
      const startStr = formatDateLocal(bulkExpectedStartDate);
      const endStr = formatDateLocal(bulkExpectedEndDate);
      const verifiedAt = new Date().toISOString();
      const verifiedBy = currentUser?.username || currentUser?.fullName || currentUser?.email || 'System';

      // Batch update all sites in parallel for speed
      const updatePromises = localitySites.map(async (site) => {
        const a = `${(site as any)?.main_activity || ''} ${(site as any)?.activity || ''}`.toUpperCase();
        const isDM = a.includes('GFA') || a.includes('CBT') || a.includes('EBSFP');
        const expected_visit = isDM
          ? { type: 'range', start_date: startStr, end_date: endStr, expected_date: visitDateString }
          : { type: 'single', expected_date: visitDateString };

        return supabase
          .from('mmp_site_entries')
          .update({
            status: 'verified',
            verified_at: verifiedAt,
            verified_by: verifiedBy,
            visit_date: visitDateString,
            additional_data: { ...((site as any)?.additional_data || {}), expected_visit }
          })
          .eq('id', site.id);
      });

      const results = await Promise.all(updatePromises);
      const firstError = results.find(r => r.error)?.error;
      if (firstError) throw firstError;

      // Mark MMP as coordinator-verified when first site is verified
      // Get current MMP workflow
      const { data: mmpData, error: mmpError } = await supabase
        .from('mmp_files')
        .select('workflow, status')
        .eq('id', localitySites[0]?.mmp_file_id)
        .single();

      if (!mmpError && mmpData) {
        const workflow = (mmpData.workflow as any) || {};
        const isAlreadyVerified = workflow.coordinatorVerified === true;
        
        // Only update if not already marked as coordinator-verified
        if (!isAlreadyVerified) {
          const updatedWorkflow = {
            ...workflow,
            coordinatorVerified: true,
            coordinatorVerifiedAt: new Date().toISOString(),
            coordinatorVerifiedBy: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
            currentStage: workflow.currentStage === 'awaitingCoordinatorVerification' ? 'verified' : (workflow.currentStage || 'verified'),
            lastUpdated: new Date().toISOString()
          };

          // Update MMP workflow - keep status as 'pending' so it shows in "New Sites Verified by Coordinators"
          await updateMMP(localitySites[0]?.mmp_file_id, {
            workflow: updatedWorkflow,
            status: mmpData.status === 'pending' ? 'pending' : 'pending' // Ensure it's pending
          });
        }
      }

      toast({
        title: 'Sites Verified',
        description: `All sites in ${localityName} have been verified.`,
      });

      // Notify hub supervisor about sites verification
      try {
        if (hubOffice) {
          const { data: hubData } = await supabase
            .from('hubs')
            .select('id')
            .eq('name', hubOffice)
            .single();
          if (hubData?.id) {
            await NotificationTriggerService.siteOperationNotification(
              hubData.id,
              'verified',
              `${selectedLocalityForBulkVerify.sites.length} sites in ${localityName}`,
              {
                actorName: currentUser?.username || currentUser?.fullName || 'Coordinator',
                siteCount: selectedLocalityForBulkVerify.sites.length
              }
            );
          }
        }
      } catch (notifyErr) {
        console.warn('Failed to notify supervisor about verification:', notifyErr);
      }

      // Close dialog and refresh data
      setBulkLocalityVerifyDialogOpen(false);
      setSelectedLocalityForBulkVerify(null);
      
      // Check if all sites in the MMP are verified and update MMP status
      const mmpId = localitySites[0]?.mmp_file_id;
      if (mmpId) {
        await checkAndUpdateMMPStatus(mmpId);
      }
      
      // Single refresh after all updates
      await refreshAll();
    } catch (error) {
      console.error('Error verifying locality sites:', error);
      toast({
        title: 'Error',
        description: 'Failed to verify sites. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handlePermitQuestionResponse = (hasPermit: boolean) => {
    setPermitQuestionDialogOpen(false);

    if (hasPermit) {
      // Show locality permit upload dialog
      setLocalityPermitUploadDialogOpen(true);
    } else {
      // Ask if work can proceed without the local permit
      setWorkWithoutPermitDialogOpen(true);
    }
  };

  const handleLocalityProceedWithoutPermit = async () => {
    setWorkWithoutPermitDialogOpen(false);
    if (!selectedLocalityForWorkflow) return;
    try {
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({ status: 'permits_attached' })
        .eq('state', selectedLocalityForWorkflow.state)
        .eq('locality', selectedLocalityForWorkflow.locality);

      if (error) {
        console.warn('Failed to update site statuses to permits_attached (no local permit):', error);
      }

      toast({
        title: 'Proceeding Without Local Permit',
        description: `Sites in ${selectedLocalityForWorkflow.locality} are now ready for verification.`,
      });

      // Refresh data and move to Permits Attached tab
      await refreshAll();
      setActiveTab('permits_attached');
    } catch (e) {
      console.warn('Error proceeding without local permit:', e);
    } finally {
      setSelectedLocalityForWorkflow(null);
    }
  };

  const handlePermitUploaded = async () => {
    await fetchPermits();
    
    // Update all sites in this locality to 'permits_attached' status
    if (selectedLocalityForWorkflow) {
      try {
        const { error } = await supabase
          .from('mmp_site_entries')
          .update({ status: 'permits_attached' })
          .eq('state', selectedLocalityForWorkflow.state)
          .eq('locality', selectedLocalityForWorkflow.locality);

        if (error) {
          console.warn('Failed to update site statuses to permits_attached:', error);
        }
      } catch (updateError) {
        console.warn('Error updating site statuses:', updateError);
      }
    }
    
    toast({
      title: 'Permit Uploaded',
      description: `Permit for ${selectedLocalityForWorkflow?.locality} has been uploaded successfully. Sites in this locality are now ready for verification.`,
    });
    // Navigate to "Permits Attached" tab since they now have full access
    setActiveTab('permits_attached');
    setSelectedLocalityForWorkflow(null);
    setExpandedStates(new Set()); // Clear expanded states
  };

  const handleSiteWithoutPermitResponse = async (proceedWithoutPermit: boolean, comments?: string) => {
    setSiteWithoutPermitDialogOpen(false);

    if (proceedWithoutPermit && selectedSiteForWithoutPermit) {
      // Update site status to 'permits_attached'
      try {
        const existingComments = selectedSiteForWithoutPermit.comments || '';
        const permitNote = 'No locality permit required';
        const userComments = comments ? `\n\nCoordinator Comments: ${comments}` : '';
        const updatedComments = existingComments 
          ? `${existingComments}\n\n${permitNote}${userComments}` 
          : `${permitNote}${userComments}`;

        const { error } = await supabase
          .from('mmp_site_entries')
          .update({ 
            status: 'permits_attached',
            comments: updatedComments
          })
          .eq('id', selectedSiteForWithoutPermit.id);

        if (error) throw error;

        toast({
          title: 'Site Status Updated',
          description: `${selectedSiteForWithoutPermit.site_name} has been moved to "Permits Attached" and is ready for verification.`,
        });

        // Reload sites and badge counts
        await refreshAll();
        // Badge counts will update automatically from coordinatorSites

        // Navigate to "Permits Attached" tab
        setActiveTab('permits_attached');
      } catch (error) {
        console.error('Error updating site status:', error);
        toast({
          title: 'Error',
          description: 'Failed to update site status. Please try again.',
          variant: 'destructive'
        });
      }
    }

    setSelectedSiteForWithoutPermit(null);
    setConfirmWithoutPermitDialogOpen(false);
    setWithoutPermitComments('');
  };

  const handleSiteSelection = (siteId: string) => {
    const newSelected = new Set(selectedSites);
    if (newSelected.has(siteId)) {
      newSelected.delete(siteId);
    } else {
      newSelected.add(siteId);
    }
    setSelectedSites(newSelected);
  };

  const renderSiteCard = (site: SiteVisit, showActions: boolean = true, isPreviewMode: boolean = false) => (
    <Card 
      key={site.id} 
      className={`overflow-hidden transition-shadow ${
        showActions || isPreviewMode
          ? 'hover:shadow-md cursor-pointer hover:bg-gray-50 active:scale-95' 
          : 'cursor-default'
      } ${
        selectedSites.has(site.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
      }`}
      onClick={showActions ? (e) => {
        // Don't open edit dialog if clicking on checkbox
        if ((e.target as HTMLInputElement).type === 'checkbox') return;
        setSelectedSiteForEdit(site);
        setEditDialogOpen(true);
      } : isPreviewMode ? (e) => {
        // Don't open preview dialog if clicking on checkbox
        if ((e.target as HTMLInputElement).type === 'checkbox') return;
        setSelectedSiteForPreview(site);
        setPreviewDialogOpen(true);
      } : undefined}
    >
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          {(activeTab === 'new' || activeTab === 'permits_attached') && !readOnlyMode && (
            <div className="pt-1 flex-shrink-0">
              <input
                type="checkbox"
                checked={selectedSites.has(site.id)}
                onChange={() => handleSiteSelection(site.id)}
                className="h-5 w-5 sm:h-4 sm:w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h3 className="font-semibold text-base sm:text-lg truncate pr-2">{site.site_name}</h3>
                  <Badge variant={
                    site.status === 'verified' ? 'default' :
                    site.status === 'approved' ? 'success' :
                    site.status === 'completed' ? 'success' :
                    site.status === 'rejected' ? 'destructive' :
                    'secondary'
                  } className="self-start sm:self-center text-xs px-2 py-1 shrink-0">
                    {site.status === 'assigned' ? 'New' : 
                     site.status === 'inProgress' ? 'In Progress' : 
                     site.status.charAt(0).toUpperCase() + site.status.slice(1)}
                  </Badge>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-muted-foreground">
                  <span className="truncate flex items-center gap-1">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    {site.state}, {site.locality}
                  </span>
                  <span className="text-xs sm:text-sm">Code: {site.site_code}</span>
                </div>
                {site.visit_date && (
                  <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Visit: {format(new Date(site.visit_date), 'MMM dd, yyyy')}
                  </div>
                )}
              </div>
            </div>
            
            {/* Mobile-friendly action buttons - larger touch targets */}
            {showActions && (
              <div className="flex flex-col gap-2 mt-4 sm:hidden">
                {/* Start Visit button - Uber style black pill for startable statuses */}
                {['dispatched', 'approved', 'assigned'].includes(site.status?.toLowerCase()) && (
                  <Button
                    size="sm"
                    onClick={async (e) => {
                      e.stopPropagation();
                      setIsStartingVisit(true);
                      try {
                        const success = await siteVisitContext.startSiteVisit(site.id);
                        if (success) {
                          toast({
                            title: 'Visit Started',
                            description: `Site visit for ${site.site_name} has begun.`,
                          });
                          navigate(`/site-visits/${site.id}`);
                        }
                      } catch (error) {
                        console.error('Error starting visit:', error);
                        toast({
                          title: 'Error',
                          description: 'Failed to start site visit. Please try again.',
                          variant: 'destructive',
                        });
                      } finally {
                        setIsStartingVisit(false);
                      }
                    }}
                    disabled={isStartingVisit}
                    className="w-full py-4 h-auto min-h-[52px] rounded-full bg-black dark:bg-white text-white dark:text-black font-bold text-base active:scale-95 hover:bg-black/90 dark:hover:bg-white/90"
                    data-testid={`button-start-visit-${site.id}`}
                    aria-label={`Start visit for ${site.site_name}`}
                  >
                    <Play className="h-5 w-5 mr-2" />
                    {isStartingVisit ? 'Starting...' : 'Start Visit'}
                  </Button>
                )}
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSiteForEdit(site);
                      setEditDialogOpen(true);
                    }}
                    className="flex-1 text-xs py-3 h-auto min-h-[44px] active:scale-95"
                    data-testid={`button-view-site-${site.id}`}
                    aria-label={`View details for ${site.site_name}`}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View
                  </Button>
                  {site.status?.toLowerCase() === 'permits_attached' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSiteForEdit(site);
                        setEditDialogOpen(true);
                      }}
                      className="flex-1 text-xs py-3 h-auto min-h-[44px] bg-black/5 dark:bg-white/5 border-black/20 dark:border-white/20 active:scale-95"
                      data-testid={`button-verify-site-${site.id}`}
                      aria-label={`Verify site ${site.site_name}`}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Verify
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderStateCard = (stateData: any) => {
    const isExpanded = expandedStates.has(stateData.state);

    // Get first site from first locality to get state, locality, and mmp_file_id
    const firstLocality = stateData.localities?.[0];
    const firstSite = firstLocality?.sites?.[0];

    const handleStateCardClick = () => {
      // Check if state permits are uploaded by FOM
      if (!stateData.hasStatePermit) {
        // Open permit verification questions for state
        if (firstSite) {
          setStateForPermitVerification({
            state: stateData.state,
            locality: firstSite.locality || firstLocality?.locality || '',
            mmpFileId: firstSite.mmp_file_id || ''
          });
          setPermitVerificationDialogOpen(true);
        }
        return;
      }
      
      // If state permits exist, expand to show localities
      setExpandedStates(prev => {
        const newSet = new Set(prev);
        if (newSet.has(stateData.state)) {
          newSet.delete(stateData.state);
        } else {
          newSet.add(stateData.state);
        }
        return newSet;
      });
    };

    return (
      <Card 
        key={stateData.state}
        className="overflow-hidden transition-shadow hover:shadow-md cursor-pointer"
        onClick={handleStateCardClick}
      >
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{stateData.state}</h3>
                  <p className="text-sm text-muted-foreground">{stateData.localities.length} localit{stateData.localities.length !== 1 ? 'ies' : 'y'}</p>
                  <p className="text-sm text-muted-foreground">{stateData.totalSites} site{stateData.totalSites !== 1 ? 's' : ''} assigned</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  {stateData.hasStatePermit ? (
                    <Badge
                      variant="default"
                      className={stateData.statePermitVerified ? 'bg-green-600' : 'bg-blue-600'}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {stateData.statePermitVerified ? 'State Permit Verified' : 'State Permit Uploaded'}
                    </Badge>
                  ) : (
                    <>
                      <Badge variant="destructive">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        State Permit Required
                      </Badge>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Open permit verification questions for state
                          if (firstSite) {
                            setStateForPermitVerification({
                              state: stateData.state,
                              locality: firstSite.locality || firstLocality?.locality || '',
                              mmpFileId: firstSite.mmp_file_id || ''
                            });
                            setPermitVerificationDialogOpen(true);
                          }
                        }}
                        data-testid={`button-upload-permits-${stateData.state}`}
                        className="w-full sm:w-auto min-h-[44px]"
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        Upload Permits
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Show localities when state is expanded */}
              {isExpanded && stateData.hasStatePermit && (
                <div className="mt-4">
                  <div className="text-sm text-muted-foreground mb-2">
                    Localities in this state:
                  </div>
                  <div className="space-y-2">
                    {stateData.localities.map((locality: any) => (
                      <div 
                        key={`${locality.state}-${locality.locality}`}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 min-h-[44px]"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent state card click
                          setSelectedLocalityForWorkflow(locality);
                          setPermitQuestionDialogOpen(true);
                        }}
                      >
                        <div className="flex-1 mb-2 sm:mb-0">
                          <span className="font-medium">{locality.locality}</span>
                          <span className="text-muted-foreground ml-2">({locality.sites.length} sites)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {locality.hasPermit ? (
                            <Badge variant="default" className="bg-green-600 text-xs">
                              <CheckCircle className="h-2 w-2 mr-1" />
                              Local Permit
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-2 w-2 mr-1" />
                              Local Permit Required
                            </Badge>
                          )}
                        </div>
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
  };

  const renderLocalityCard = (localityData: any) => {
    const localityKey = `${localityData.state}-${localityData.locality}`;
    const isExpanded = expandedLocalities.has(localityKey);

    return (
      <Card 
        key={localityKey}
        className="overflow-hidden transition-shadow hover:shadow-md"
      >
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{localityData.locality}</h3>
                  <p className="text-sm text-muted-foreground">{localityData.stateName}</p>
                  <p className="text-sm text-muted-foreground">{localityData.sites.length} site{localityData.sites.length !== 1 ? 's' : ''} assigned</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Local Permit Required
                  </Badge>
                </div>
              </div>
              
              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedLocalityForWorkflow(localityData);
                    setPermitQuestionDialogOpen(true);
                  }}
                  className="flex-1 min-h-[44px]"
                >
                  <FileCheck className="h-4 w-4 mr-2" />
                  Permit Status
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setExpandedLocalities(prev => {
                      const newSet = new Set(prev);
                      if (newSet.has(localityKey)) {
                        newSet.delete(localityKey);
                      } else {
                        newSet.add(localityKey);
                      }
                      return newSet;
                    });
                  }}
                  className="flex-1 min-h-[44px]"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
                  {isExpanded ? 'Hide Sites' : 'View Sites'}
                </Button>
              </div>
              
              {/* Show sites when locality is expanded */}
              {isExpanded && (
                <div className="mt-4">
                  <div className="text-sm text-muted-foreground mb-2">
                    Sites in this locality:
                  </div>
                  <div className="space-y-2">
                    {localityData.sites
                      .filter((site: SiteVisit) => {
                        // Filter by active tab status - only show sites that need verification
                        return site.status === 'Pending' || site.status === 'Dispatched' || 
                               site.status === 'assigned' || site.status === 'inProgress' || 
                               site.status === 'in_progress';
                      })
                      .map((site: SiteVisit) => (
                        <div 
                          key={site.id}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 min-h-[44px]"
                          onClick={() => {
                            setSelectedSiteForWithoutPermit(site);
                            setSiteWithoutPermitDialogOpen(true);
                          }}
                        >
                          <div className="flex-1 mb-2 sm:mb-0">
                            <span className="font-medium">{site.site_name}</span>
                            <span className="text-muted-foreground ml-2">({site.site_code})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              Needs Verification
                            </Badge>
                          </div>
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
  };

  const renderPermitsAttachedLocalityCard = (localityKey: string, localitySites: SiteVisit[]) => {
    const [state, locality] = localityKey.split('|');
    const isExpanded = expandedPermitsAttachedLocalities.has(localityKey);

    return (
      <Card 
        key={localityKey}
        className="overflow-hidden transition-shadow hover:shadow-md"
      >
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{locality}</h3>
                  <p className="text-sm text-muted-foreground">{state}</p>
                  <p className="text-sm text-muted-foreground">{localitySites.length} site{localitySites.length !== 1 ? 's' : ''} with permits attached</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Permits Attached
                  </Badge>
                </div>
              </div>
              
              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setExpandedPermitsAttachedLocalities(prev => {
                      const newSet = new Set(prev);
                      if (newSet.has(localityKey)) {
                        newSet.delete(localityKey);
                      } else {
                        newSet.add(localityKey);
                      }
                      return newSet;
                    });
                  }}
                  className="flex-1 min-h-[44px]"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
                  {isExpanded ? 'Hide Sites' : 'View Sites'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedLocalityForBulkVerify({ localityKey, sites: localitySites });
                    setBulkLocalityVerifyDialogOpen(true);
                  }}
                  className="flex-1 min-h-[44px] bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Verify All ({localitySites.length})
                </Button>
              </div>
              
              {/* Show sites when locality is expanded */}
              {isExpanded && (
                <div className="mt-4">
                  <div className="text-sm text-muted-foreground mb-2">
                    Sites in this locality:
                  </div>
                  <div className="space-y-2">
                    {localitySites.map((site: SiteVisit) => (
                      <div 
                        key={site.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 min-h-[44px]"
                        onClick={() => {
                          setSelectedSiteForEdit(site);
                          setEditDialogOpen(true);
                        }}
                      >
                        <div className="flex-1 mb-2 sm:mb-0">
                          <span className="font-medium">{site.site_name}</span>
                          <span className="text-muted-foreground ml-2">({site.site_code})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            Ready for Verification
                          </Badge>
                        </div>
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
  };

  if (contextLoading) {
    return (
      <div className="space-y-6 min-h-screen bg-slate-50 dark:bg-gray-900 py-4 sm:py-6 px-2 sm:px-4 md:px-8">
        {/* Skeleton Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-lg p-6 text-white shadow-lg animate-pulse">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-full h-14 w-14"></div>
            <div className="space-y-2">
              <div className="h-6 bg-white/20 rounded w-48"></div>
              <div className="h-4 bg-white/20 rounded w-64"></div>
            </div>
          </div>
        </div>
        {/* Skeleton Tabs */}
        <div className="flex gap-2 overflow-x-auto">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-10 w-24 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse"></div>
          ))}
        </div>
        {/* Skeleton Content */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white dark:bg-slate-800 rounded-lg shadow animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-h-screen bg-slate-50 dark:bg-gray-900 py-4 sm:py-6 px-2 sm:px-4 md:px-8">
      {/* Blue Gradient Header Section - matching MMP Management */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-lg p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-full">
              <Shield className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Site Verification</h1>
              <p className="text-blue-100 mt-1">
                Review and verify sites assigned to you
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate(-1)}
            className="bg-white text-blue-700 hover:bg-blue-50 shadow-md flex items-center gap-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1">
            <ListChecks className="h-4 w-4" />
            <span>Permit Verification</span>
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1">
            <FileCheck2 className="h-4 w-4" />
            <span>CP Confirmation</span>
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1">
            <BarChart3 className="h-4 w-4" />
            <span>Status Tracking</span>
          </div>
          <DataFreshnessBadge className="bg-white/10 rounded-full px-3 py-1" />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto mb-6">
          <TabsList className="inline-flex w-max bg-gradient-to-r from-slate-900/90 to-blue-900/90 border border-blue-500/40 backdrop-blur-xl p-1.5 min-h-[48px] rounded-xl shadow-lg">
            <TabsTrigger value="new" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[40px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap rounded-lg px-4 text-blue-100 hover:text-white transition-all">
              <Clock className="h-4 w-4" />
              <span>New Sites</span>
              <Badge className="bg-emerald-400/30 text-white border-0">{newSitesCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="permits_attached" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[40px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap rounded-lg px-4 text-blue-100 hover:text-white transition-all">
              <FileCheck className="h-4 w-4" />
              <span>CP Verification</span>
              <Badge className="bg-amber-400/30 text-white border-0">{permitsAttachedCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="verified" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[40px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap rounded-lg px-4 text-blue-100 hover:text-white transition-all">
              <CheckCircle className="h-4 w-4" />
              <span>Verified</span>
              <Badge className="bg-violet-400/30 text-white border-0">{verifiedSitesCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="approved" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-green-600 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[40px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap rounded-lg px-4 text-blue-100 hover:text-white transition-all">
              <CheckSquare className="h-4 w-4" />
              <span>Approved</span>
              <Badge className="bg-green-400/30 text-white border-0">{approvedSitesCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[40px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap rounded-lg px-4 text-blue-100 hover:text-white transition-all">
              <Play className="h-4 w-4" />
              <span>Completed</span>
              <Badge className="bg-cyan-400/30 text-white border-0">{completedSitesCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="rejected" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500 data-[state=active]:to-red-600 data-[state=active]:text-white data-[state=active]:shadow-md min-h-[40px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap rounded-lg px-4 text-blue-100 hover:text-white transition-all">
              <XCircle className="h-4 w-4" />
              <span>Rejected</span>
              <Badge className={`${rejectedSitesCount > 0 ? 'bg-red-400/50' : 'bg-red-400/30'} text-white border-0`}>{rejectedSitesCount}</Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="new" className="space-y-3 sm:space-y-4"> {/* Adjusted spacing */}
          <Tabs value={newSitesSubTab} onValueChange={setNewSitesSubTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="state_required" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800 data-[state=active]:shadow-sm">
                <AlertTriangle className="h-4 w-4" />
                State Permit
                <Badge variant="secondary" className="ml-2">
                  {statePermitRequiredCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="local_required" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800 data-[state=active]:shadow-sm">
                <MapPin className="h-4 w-4" />
                Locality Permit
                <Badge variant="secondary" className="ml-2">
                  {localPermitRequiredCount}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="state_required" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>States Requiring State Permits</CardTitle>
                    <div className="relative w-full sm:w-auto max-w-sm">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Search states..."
                        className="pl-8 w-full sm:w-[300px]"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    These states require state permits to be uploaded before you can access local permits.
                  </div>
                </CardHeader>
                <CardContent>
                  {isPermitsSectionLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-muted-foreground">Loading states...</p>
                    </div>
                  ) : (() => {
                    const stateRequiredStates = localitiesData.filter((state: any) => !state.hasStatePermit);
                    const filteredStates = stateRequiredStates.filter((state: any) => 
                      state.state.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
                    );
                    
                    return filteredStates.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p>{searchQuery ? 'No states match your search.' : 'All states have state permits uploaded.'}</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filteredStates.map(state => renderStateCard(state))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="local_required" className="space-y-3 sm:space-y-4">
              {(() => {
                const allLocalitiesFromStatePermits = localitiesData
                  .filter((state: any) => state.hasStatePermit)
                  .flatMap((state: any) => 
                    state.localities.map((locality: any) => ({
                      state: state.state,
                      locality: locality.locality,
                      siteCount: locality.sites?.length || 0,
                      sites: locality.sites || [],
                      hasPermit: locality.hasPermit || false,
                      mmpFileId: locality.sites?.[0]?.mmp_file_id || ''
                    }))
                  )
                  .filter((locality: any) => {
                    const validStatuses = ['pending', 'dispatched', 'assigned', 'inprogress', 'in_progress', 'new', 'forwarded'];
                    return locality.sites.some((site: SiteVisit) => {
                      const status = (site.status || '').toLowerCase().replace(/\s+/g, '_');
                      return validStatuses.includes(status);
                    });
                  });

                return (
                  <LocalityPermitManager
                    localities={allLocalitiesFromStatePermits}
                    onPermitUploaded={() => {
                      fetchPermits();
                      refreshSites();
                    }}
                    onSitesAdvanced={(count) => {
                      refreshSites();
                    }}
                    isLoading={isPermitsSectionLoading}
                  />
                );
              })()}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="permits_attached" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Sites with Permits Attached</CardTitle>
                <div className="relative w-full sm:w-auto max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search localities or sites..."
                    className="pl-8 w-full sm:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Click on a locality to view and verify sites. You can verify all sites in a locality at once or verify them individually.
              </div>
            </CardHeader>
            <CardContent>
              {Object.keys(sitesGroupedByLocality).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileCheck className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>{searchQuery ? 'No localities match your search.' : 'No sites with permits attached yet.'}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(sitesGroupedByLocality).map(([localityKey, localitySites]) => 
                    renderPermitsAttachedLocalityCard(localityKey, localitySites)
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verified" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Verified Sites</CardTitle>
                <div className="relative w-full sm:w-auto max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search sites..."
                    className="pl-8 w-full sm:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="hub-filter" className="text-sm font-medium">Hub:</Label>
                  <Select value={hubFilter} onValueChange={setHubFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Hubs</SelectItem>
                      {hubs.map((hub) => (
                        <SelectItem key={hub.id} value={hub.name}>
                          {hub.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="state-filter" className="text-sm font-medium">State:</Label>
                  <Select value={stateFilter} onValueChange={(value) => {
                    setStateFilter(value);
                    setLocalityFilter('all'); // Reset locality when state changes
                  }}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {hubStates
                        .filter(hs => {
                          if (hubFilter === 'all') return true;
                          const hub = hubs.find(h => h.id === hs.hub_id);
                          return hub?.name === hubFilter;
                        })
                        .map((state) => (
                          <SelectItem key={state.state_id} value={state.state_name}>
                            {state.state_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="locality-filter" className="text-sm font-medium">Locality:</Label>
                  <Select value={localityFilter} onValueChange={setLocalityFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Localities</SelectItem>
                      {localities
                        .filter(loc => {
                          if (stateFilter === 'all') return true;
                          const selectedState = hubStates.find(hs => hs.state_name === stateFilter);
                          if (!selectedState) return false;
                          if (hubFilter === 'all') return loc.state_id === selectedState.state_id;
                          const hub = hubs.find(h => h.id === selectedState.hub_id);
                          return loc.state_id === selectedState.state_id && hub?.name === hubFilter;
                        })
                        .map((locality) => (
                          <SelectItem key={locality.id} value={locality.name}>
                            {locality.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                {(activeTab === 'new' || activeTab === 'permits_attached') && !readOnlyMode && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="select-all-sites"
                      checked={filteredSites.length > 0 && selectedSites.size === filteredSites.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Select all filtered sites
                          const allSiteIds = new Set(filteredSites.map(site => site.id));
                          setSelectedSites(allSiteIds);
                        } else {
                          // Deselect all
                          setSelectedSites(new Set());
                        }
                      }}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <Label htmlFor="select-all-sites" className="text-sm font-medium">
                      Select All ({sitesByTab.length} sites)
                    </Label>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {sitesByTab.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>{searchQuery ? 'No sites match your search.' : 'No verified sites yet.'}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedSites.map(site => renderSiteCard(site, true))}
                  </div>
                  {totalPages > 1 && (
                    // FIX: Wrap both "Showing ..." and pagination controls in a parent <div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, sitesByTab.length)} of {sitesByTab.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="text-sm">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Approved Sites</CardTitle>
                <div className="relative w-full sm:w-auto max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search sites..."
                    className="pl-8 w-full sm:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {sitesByTab.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileCheck className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>{searchQuery ? 'No sites match your search.' : 'Approved sites will appear here.'}</p>
                  {!searchQuery && <p className="text-sm mt-2">This feature is coming soon.</p>}
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedSites.map(site => renderSiteCard(site, true))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, sitesByTab.length)} of {sitesByTab.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="text-sm">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Completed Sites</CardTitle>
                <div className="relative w-full sm:w-auto max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search sites..."
                    className="pl-8 w-full sm:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {sitesByTab.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>{searchQuery ? 'No sites match your search.' : 'Completed sites will appear here.'}</p>
                  {!searchQuery && <p className="text-sm mt-2">This feature is coming soon.</p>}
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedSites.map(site => renderSiteCard(site, false, true))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredSites.length)} of {filteredSites.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="text-sm">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Rejected Sites</CardTitle>
                <div className="relative w-full sm:w-auto max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search sites..."
                    className="pl-8 w-full sm:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Click on a site to view rejection details, add comments, and edit site information.
              </div>
            </CardHeader>
            <CardContent>
              {sitesByTab.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <XCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>{searchQuery ? 'No sites match your search.' : 'No rejected sites.'}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedSites.map(site => renderSiteCard(site, true))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, sitesByTab.length)} of {sitesByTab.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="text-sm">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Verify Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Site</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4">Are you sure you want to verify this site?</p>
            <div className="mt-4">
              <label htmlFor="verification-notes" className="text-sm font-medium mb-2 block">
                Verification Notes (Optional)
              </label>
              <Textarea
                id="verification-notes"
                placeholder="Add any notes about the verification..."
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                className="mt-1"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setVerifyDialogOpen(false);
              setVerificationNotes('');
              setSelectedSiteId(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedSiteId) {
                  handleVerifySite(selectedSiteId, verificationNotes);
                }
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirm Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Site</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4">Are you sure you want to reject this site?</p>
            <div className="mt-4">
              <label htmlFor="rejection-notes" className="text-sm font-medium mb-2 block">
                Rejection Notes (Optional)
              </label>
              <Textarea
                id="rejection-notes"
                placeholder="Add any notes about the rejection..."
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                className="mt-1"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setRejectDialogOpen(false);
              setVerificationNotes('');
              setSelectedSiteId(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedSiteId) {
                  handleRejectSite(selectedSiteId, verificationNotes);
                }
              }}
              variant="destructive"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verification Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Site Verification</DialogTitle>
            <p className="text-sm text-muted-foreground">Review site details and set the expected dates required for verification.</p>
          </DialogHeader>
          {selectedSiteForEdit && (
            <SiteEditForm
              site={selectedSiteForEdit}
              onSave={async (updatedSite, shouldVerify) => {
                try {
                  const updateData: any = {
                    site_name: updatedSite.site_name,
                    site_code: updatedSite.site_code,
                    state: updatedSite.state,
                    locality: updatedSite.locality,
                    hub_office: updatedSite.hub_office,
                    cp_name: updatedSite.cp_name,
                    activity_at_site: Array.isArray(updatedSite.activity_at_site) 
                      ? updatedSite.activity_at_site.join(', ') 
                      : updatedSite.activity_at_site,
                    monitoring_by: updatedSite.monitoring_by,
                    survey_tool: updatedSite.survey_tool,
                    use_market_diversion: updatedSite.use_market_diversion,
                    use_warehouse_monitoring: updatedSite.use_warehouse_monitoring,
                    visit_date: updatedSite.visit_date,
                    comments: updatedSite.comments,
                    additional_data: {
                      ...((selectedSiteForEdit as any)?.additional_data || {}),
                      ...((updatedSite as any)?.additional_data || {})
                    },
                  };

                  // Only set verification fields if shouldVerify is true
                  if (shouldVerify) {
                    // Always verify directly, do not open permit verification dialog for single-site edit
                    updateData.status = 'verified';
                    updateData.verified_at = new Date().toISOString();
                    updateData.verified_by = currentUser?.username || currentUser?.fullName || currentUser?.email || 'System';
                  }

                  const { error } = await supabase
                    .from('mmp_site_entries')
                    .update(updateData)
                    .eq('id', selectedSiteForEdit.id);

                  if (error) throw error;

                  // Also update the MMP file status if needed (only when verifying)
                  if (shouldVerify) {
                    try {
                      const site = selectedSiteForEdit;
                      if (site?.mmp_file_id && site?.site_code) {
                        const mmpUpdateData: any = { 
                          status: 'Verified',
                          verified_at: new Date().toISOString(),
                          verified_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System'
                        };
                        
                        await supabase
                          .from('mmp_site_entries')
                          .update(mmpUpdateData)
                          .eq('mmp_file_id', site.mmp_file_id)
                          .eq('site_code', site.site_code);

                        // Mark MMP as coordinator-verified when first site is verified
                        const { data: mmpData, error: mmpError } = await supabase
                          .from('mmp_files')
                          .select('workflow, status')
                          .eq('id', site.mmp_file_id)
                          .single();

                        if (!mmpError && mmpData) {
                          const workflow = (mmpData.workflow as any) || {};
                          const isAlreadyVerified = workflow.coordinatorVerified === true;
                          
                          if (!isAlreadyVerified) {
                            const updatedWorkflow = {
                              ...workflow,
                              coordinatorVerified: true,
                              coordinatorVerifiedAt: new Date().toISOString(),
                              coordinatorVerifiedBy: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
                              currentStage: workflow.currentStage === 'awaitingCoordinatorVerification' ? 'verified' : (workflow.currentStage || 'verified'),
                              lastUpdated: new Date().toISOString()
                            };
                            await supabase
                              .from('mmp_files')
                              .update({
                                workflow: updatedWorkflow,
                                status: mmpData.status === 'pending' ? 'pending' : 'pending'
                              })
                              .eq('id', site.mmp_file_id);
                          }
                        }
                      }
                    } catch (syncErr) {
                      console.warn('Failed to sync mmp_site_entries on verify:', syncErr);
                    }
                  }

                  toast({
                    title: shouldVerify ? 'Site Verified' : 'Site Updated',
                    description: shouldVerify 
                      ? 'Site details have been saved and the site has been marked as verified.' 
                      : 'Site details have been saved successfully.',
                  });

                  // Notify hub supervisor about site verification

                  if (shouldVerify && selectedSiteForEdit?.hub_office) {
                    try {
                      const { data: hubData } = await supabase
                        .from('hubs')
                        .select('id')
                        .eq('name', selectedSiteForEdit.hub_office)
                        .single();
                      if (hubData?.id) {
                        await NotificationTriggerService.siteOperationNotification(
                          hubData.id,
                          'verified',
                          selectedSiteForEdit.site_name,
                          {
                            actorName: currentUser?.username || currentUser?.fullName || 'Coordinator',
                            siteId: selectedSiteForEdit.id
                          }
                        );
                      }
                    } catch (notifyErr) {
                      console.warn('Failed to notify supervisor about verification:', notifyErr);
                    }
                  }

                  // Check if all sites in the MMP are verified and update MMP status
                  if (shouldVerify && selectedSiteForEdit?.mmp_file_id) {
                    await checkAndUpdateMMPStatus(selectedSiteForEdit.mmp_file_id);
                  }
                  
                  // Single refresh after all updates
                  await refreshAll();
                  
                  // Badge counts will update automatically from coordinatorSites

                  setEditDialogOpen(false);
                  setSelectedSiteForEdit(null);
                } catch (error) {
                  console.error('Error updating site:', error);
                  toast({
                    title: 'Error',
                    description: 'Failed to update site. Please try again.',
                    variant: 'destructive'
                  });
                }
              }}
              onCancel={() => {
                setEditDialogOpen(false);
                setSelectedSiteForEdit(null);
              }}
              hubs={hubs}
              states={states}
              localities={localities}
              hubStates={hubStates}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Permit Verification Questions Dialog */}
      <Dialog open={permitVerificationDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setPermitVerificationDialogOpen(false);
          setSiteForPermitVerification(null);
          setStateForPermitVerification(null);
          setPendingVerificationData(null);
          setBulkSitesForPermitVerification([]);
          setBulkVerificationMode('single');
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>State & Locality Permit Verification</DialogTitle>
            <DialogDescription>
              Please answer the following questions about permit requirements before completing verification.
            </DialogDescription>
            {bulkVerificationMode !== 'single' && bulkSitesForPermitVerification.length > 1 && siteForPermitVerification && (
              <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" />
                  <span>
                    This verification will apply to <strong>{bulkSitesForPermitVerification.length} sites</strong> in {siteForPermitVerification.locality}, {siteForPermitVerification.state}
                  </span>
                </p>
              </div>
            )}
            {stateForPermitVerification && (
              <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" />
                  <span>
                    Verifying permits for <strong>{stateForPermitVerification.state}</strong>
                  </span>
                </p>
              </div>
            )}
          </DialogHeader>
          {(siteForPermitVerification || stateForPermitVerification) && (
            <PermitVerificationQuestions
              state={siteForPermitVerification?.state || stateForPermitVerification?.state || ''}
              locality={siteForPermitVerification?.locality || stateForPermitVerification?.locality || ''}
              mmpFileId={siteForPermitVerification?.mmp_file_id || stateForPermitVerification?.mmpFileId || ''}
              onComplete={handlePermitVerificationComplete}
              onSendBackToFOM={handleSendBackToFOM}
              onCancel={() => {
                setPermitVerificationDialogOpen(false);
                setSiteForPermitVerification(null);
                setStateForPermitVerification(null);
                setPendingVerificationData(null);
                setBulkSitesForPermitVerification([]);
                setBulkVerificationMode('single');
              }}
              existingStatePermit={false}
              existingLocalityPermit={false}
              onMoveSitesToCategory={() => setNewSitesSubTab('local_required')}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Date Dialog */}
      <Dialog open={bulkAssignDateDialogOpen} onOpenChange={setBulkAssignDateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Visit Date to Selected Sites</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Assign a visit date to {selectedSites.size} selected site{selectedSites.size !== 1 ? 's' : ''}.
            </p>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="bulk-visit-date" className="text-sm font-medium">
                  Visit Date
                </Label>
                <Input
                  id="bulk-visit-date"
                  type="date"
                  value={bulkVisitDate}
                  onChange={(e) => setBulkVisitDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setBulkAssignDateDialogOpen(false);
              setBulkVisitDate('');
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkAssignVisitDate}
              disabled={!bulkVisitDate}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Assign Date to {selectedSites.size} Site{selectedSites.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Verify Dialog */}
      <Dialog open={bulkVerifyDialogOpen} onOpenChange={setBulkVerifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Selected Sites</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Mark {selectedSites.size} selected site{selectedSites.size !== 1 ? 's' : ''} as verified.
            </p>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="bulk-verification-notes" className="text-sm font-medium">
                  Verification Notes (Optional)
                </Label>
                <Textarea
                  id="bulk-verification-notes"
                  placeholder="Add notes about the verification..."
                  value={bulkVerificationNotes}
                  onChange={(e) => setBulkVerificationNotes(e.target.value)}
                  className="mt-1"
                  rows={4}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setBulkVerifyDialogOpen(false);
              setBulkVerificationNotes('');
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkVerifySites}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Verify {selectedSites.size} Site{selectedSites.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Locality Verify Dialog */}
      <Dialog open={bulkLocalityVerifyDialogOpen} onOpenChange={setBulkLocalityVerifyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verify All Sites in Locality</DialogTitle>
            <DialogDescription>
              Set expected date(s) and verify all {selectedLocalityForBulkVerify?.sites.length} site{selectedLocalityForBulkVerify?.sites.length !== 1 ? 's' : ''} in this locality.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              {hasBulkDMActivities ? (
                <>
                  <div>
                    <Label className="text-sm font-medium">
                      Expected Distribution Start <span className="text-red-500">*</span>
                    </Label>
                    <div className="mt-1">
                      <DatePicker
                        date={bulkExpectedStartDate}
                        onSelect={setBulkExpectedStartDate}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">
                      Expected Distribution End <span className="text-red-500">*</span>
                    </Label>
                    <div className="mt-1">
                      <DatePicker
                        date={bulkExpectedEndDate}
                        onSelect={setBulkExpectedEndDate}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">
                      Expected Visit Date <span className="text-red-500">*</span>
                    </Label>
                    <div className="mt-1">
                      <DatePicker
                        date={bulkLocalityVisitDateObj}
                        onSelect={setBulkLocalityVisitDateObj}
                        className="w-full"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Must be within the expected period above. Applied to all DM sites.
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <Label className="text-sm font-medium">
                    Expected Visit Date <span className="text-red-500">*</span>
                  </Label>
                  <div className="mt-1">
                    <DatePicker
                      date={bulkLocalityVisitDateObj}
                      onSelect={setBulkLocalityVisitDateObj}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setBulkLocalityVerifyDialogOpen(false);
              setSelectedLocalityForBulkVerify(null);
              setBulkLocalityVisitDate('');
              setBulkLocalityVisitDateObj(undefined);
              setBulkExpectedStartDate(undefined);
              setBulkExpectedEndDate(undefined);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkLocalityVerify}
              disabled={hasBulkDMActivities ? !(bulkExpectedStartDate && bulkExpectedEndDate && bulkLocalityVisitDateObj) : !bulkLocalityVisitDateObj}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Set Date & Verify {selectedLocalityForBulkVerify?.sites.length} Site{selectedLocalityForBulkVerify?.sites.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sequential Permit Upload Dialog (State first, then localities) */}
      {selectedStateForSequentialUpload && (
        <Dialog open={sequentialPermitDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setSequentialPermitDialogOpen(false);
            setSelectedStateForSequentialUpload(null);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
            <DialogHeader>
              <DialogTitle>Upload Permits - {selectedStateForSequentialUpload.state}</DialogTitle>
              <DialogDescription>
                Upload state permit first, then optionally upload locality permits
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <SequentialPermitUpload
                state={selectedStateForSequentialUpload.state}
                stateId={selectedStateForSequentialUpload.stateId}
                mmpFileId={selectedStateForSequentialUpload.mmpFileId}
                onComplete={async () => {
                  setSequentialPermitDialogOpen(false);
                  setSelectedStateForSequentialUpload(null);
                  await refreshAll();
                  toast({
                    title: "Permits uploaded",
                    description: `Permits for ${selectedStateForSequentialUpload.state} have been processed.`,
                  });
                }}
                onCancel={() => {
                  setSequentialPermitDialogOpen(false);
                  setSelectedStateForSequentialUpload(null);
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Site Without Permit Dialog */}
      <Dialog open={siteWithoutPermitDialogOpen} onOpenChange={setSiteWithoutPermitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proceed Without Local Permit</DialogTitle>
            <DialogDescription>
              Can you work on <strong>{selectedSiteForWithoutPermit?.site_name}</strong> without a local permit?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              If you can proceed without the local permit, this site will be moved to "Permits Attached" and allow immediate verification.
              If you cannot proceed without the permit, the site will remain in this locality and wait for the local permit to be uploaded.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSiteWithoutPermitDialogOpen(false);
                setSelectedSiteForWithoutPermit(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSiteWithoutPermitResponse(false)}
            >
              No, wait for permit
            </Button>
            <Button
              onClick={() => handleSiteWithoutPermitResponse(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Yes, proceed without permit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Without Permit Dialog */}
      <Dialog open={confirmWithoutPermitDialogOpen} onOpenChange={setConfirmWithoutPermitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm No Local Permit Required</DialogTitle>
            <DialogDescription>
              Are you sure you want to proceed without a local permit for <strong>{selectedSiteForWithoutPermit?.site_name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. The site will be marked as having no local permit required.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmWithoutPermitDialogOpen(false);
                setSelectedSiteForWithoutPermit(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleSiteWithoutPermitResponse(true)}
              className="bg-red-600 hover:bg-red-700"
            >
              Confirm & Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Site Preview Dialog for Completed Sites */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Site Details - {selectedSiteForPreview?.site_name}</DialogTitle>
            <DialogDescription>
              Read-only preview of site information
            </DialogDescription>
          </DialogHeader>
          {selectedSiteForPreview && (
            <div className="py-4 space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Site Name</Label>
                    <p className="text-sm text-muted-foreground">{selectedSiteForPreview.site_name}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Site Code</Label>
                    <p className="text-sm text-muted-foreground">{selectedSiteForPreview.site_code}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Locality</Label>
                    <p className="text-sm text-muted-foreground">{selectedSiteForPreview.locality}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">State</Label>
                    <p className="text-sm text-muted-foreground">{selectedSiteForPreview.state}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Hub Office</Label>
                    <p className="text-sm text-muted-foreground">{selectedSiteForPreview.hub_office}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">MMP File ID</Label>
                    <p className="text-sm text-muted-foreground">{selectedSiteForPreview.mmp_file_id}</p>
                  </div>
                </div>
              </div>

              {/* Status Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Status Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Current Status</Label>
                    <p className="text-sm text-muted-foreground">{selectedSiteForPreview.status}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Activity</Label>
                    <p className="text-sm text-muted-foreground">{selectedSiteForPreview.activity}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Main Activity</Label>
                    <p className="text-sm text-muted-foreground">{selectedSiteForPreview.main_activity}</p>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Important Dates</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Visit Date</Label>
                    <p className="text-sm text-muted-foreground">
                      {selectedSiteForPreview.visit_date ? format(new Date(selectedSiteForPreview.visit_date), 'PPP') : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Assigned Date</Label>
                    <p className="text-sm text-muted-foreground">
                      {selectedSiteForPreview.assigned_at ? format(new Date(selectedSiteForPreview.assigned_at), 'PPP') : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Verified Date</Label>
                    <p className="text-sm text-muted-foreground">
                      {selectedSiteForPreview.verified_at ? format(new Date(selectedSiteForPreview.verified_at), 'PPP') : 'Not verified'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Comments */}
              {selectedSiteForPreview.comments && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Comments</h3>
                  <p className="text-sm text-muted-foreground bg-gray-50 p-3 rounded-md">
                    {selectedSiteForPreview.comments}
                  </p>
                </div>
              )}

              {/* Verification Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Verification Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Verified By</Label>
                    <p className="text-sm text-muted-foreground">{selectedSiteForPreview.verified_by || 'Not verified'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Verification Notes</Label>
                    <p className="text-sm text-muted-foreground">{selectedSiteForPreview.verification_notes || 'No notes'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPreviewDialogOpen(false);
                setSelectedSiteForPreview(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permit Question Dialog - Ask if coordinator has the local permit */}
      <Dialog open={permitQuestionDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setPermitQuestionDialogOpen(false);
          setSelectedLocalityForWorkflow(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Local Permit Required</DialogTitle>
            <DialogDescription>
              Upload the local permit for <strong>{selectedLocalityForWorkflow?.locality}, {selectedLocalityForWorkflow?.stateName || selectedLocalityForWorkflow?.state}</strong> to verify all sites in this locality.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Do you have the local permit for this locality?
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setPermitQuestionDialogOpen(false);
                setSelectedLocalityForWorkflow(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="outline"
              onClick={() => handlePermitQuestionResponse(false)}
            >
              No, I don't have it
            </Button>
            <Button 
              onClick={() => handlePermitQuestionResponse(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Yes, I have it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Locality Permit Upload Dialog */}
      {selectedLocalityForWorkflow && (
        <Dialog open={localityPermitUploadDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setLocalityPermitUploadDialogOpen(false);
            setSelectedLocalityForWorkflow(null);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
            <DialogHeader>
              <DialogTitle>Upload Local Permit</DialogTitle>
              <DialogDescription>
                Upload the local permit for <strong>{selectedLocalityForWorkflow.locality}, {selectedLocalityForWorkflow.stateName || selectedLocalityForWorkflow.state}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {selectedLocalityForWorkflow.sites?.[0]?.mmp_file_id ? (
                <LocalityPermitUpload
                  state={selectedLocalityForWorkflow.stateName || selectedLocalityForWorkflow.state || ''}
                  locality={selectedLocalityForWorkflow.locality || ''}
                  mmpFileId={selectedLocalityForWorkflow.sites[0].mmp_file_id}
                  onPermitUploaded={handlePermitUploaded}
                  onCancel={() => {
                    setLocalityPermitUploadDialogOpen(false);
                    setSelectedLocalityForWorkflow(null);
                  }}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Unable to find MMP file ID for this locality.</p>
                  <p className="text-xs mt-2">Please ensure sites are properly assigned to this locality.</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Work Without Permit Dialog */}
      <Dialog open={workWithoutPermitDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setWorkWithoutPermitDialogOpen(false);
          setSelectedLocalityForWorkflow(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proceed Without Local Permit</DialogTitle>
            <DialogDescription>
              Can you continue to complete sites in <strong>{selectedLocalityForWorkflow?.locality}, {selectedLocalityForWorkflow?.stateName || selectedLocalityForWorkflow?.state}</strong> without a local permit?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              If you can proceed without the local permit, sites in this locality will be moved to "Permits Attached" and allow immediate verification.
              If you cannot proceed without the permit, the sites will remain in this locality and wait for the local permit to be uploaded.
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setWorkWithoutPermitDialogOpen(false);
                setSelectedLocalityForWorkflow(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                setWorkWithoutPermitDialogOpen(false);
                setSelectedLocalityForWorkflow(null);
              }}
            >
              No, I need the permit
            </Button>
            <Button 
              onClick={handleLocalityProceedWithoutPermit}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Yes, proceed without permit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Initial Yes/No Prompt for Locality Permits */}
      <Dialog open={localityPermitPromptOpen} onOpenChange={setLocalityPermitPromptOpen}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          {/* Header with icon */}
          <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Local Permit Check</h2>
                <p className="text-purple-100 text-sm">Before proceeding to CP Verification</p>
              </div>
            </div>
          </div>
          
          {/* Body content */}
          <div className="px-6 py-5 space-y-4">
            <p className="text-muted-foreground text-center">
              We need to know if any localities in this MMP require local permits for field operations.
            </p>
            
            {/* Question card */}
            <div className="bg-muted/50 rounded-lg p-5 text-center">
              <p className="text-lg font-medium">
                Do any localities require local permits?
              </p>
            </div>

            {/* Decision buttons - two clear options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Button 
                variant="outline"
                size="lg"
                onClick={async () => {
                  setLocalityPermitPromptOpen(false);
                  // Mark ALL localities as NOT requiring permits and advance to CP Verification
                  const allLocalities = localitiesData
                    .filter((state: any) => state.hasStatePermit)
                    .flatMap((state: any) => 
                      state.localities.map((locality: any) => ({
                        key: `${state.state}|${locality.locality}`,
                        sites: locality.sites || []
                      }))
                    );
                  
                  // Set all to not required
                  const requirements: Record<string, boolean> = {};
                  allLocalities.forEach(loc => {
                    requirements[loc.key] = false;
                  });
                  setLocalityPermitRequirements(requirements);
                  setTriageCompleted(true);
                  
                  // Advance all sites to permits_attached status
                  // Use case-insensitive matching for status
                  const validStatuses = ['pending', 'dispatched', 'assigned', 'inprogress', 'in_progress', 'new', 'forwarded'];
                  const sitesToAdvance = allLocalities.flatMap(loc => 
                    loc.sites.filter((site: SiteVisit) => {
                      const status = (site.status || '').toLowerCase().replace(/\s+/g, '_');
                      return validStatuses.includes(status);
                    })
                  );
                  
                  console.log('[LocalPermitCheck] All localities:', allLocalities.length);
                  console.log('[LocalPermitCheck] Sites to advance:', sitesToAdvance.length);
                  if (sitesToAdvance.length === 0 && allLocalities.length > 0) {
                    const allSites = allLocalities.flatMap(loc => loc.sites);
                    console.log('[LocalPermitCheck] All sites statuses:', allSites.map(s => s.status));
                  }
                  
                  if (sitesToAdvance.length > 0) {
                    try {
                      const updatePromises = sitesToAdvance.map(async (site: SiteVisit) => {
                        const existingData = (site as any).additional_data || {};
                        return supabase
                          .from('mmp_site_entries')
                          .update({ 
                            status: 'permits_attached',
                            additional_data: {
                              ...existingData,
                              locality_permit_not_required: true,
                              locality_permit_triage_date: new Date().toISOString()
                            }
                          })
                          .eq('id', site.id);
                      });
                      await Promise.all(updatePromises);
                      toast({
                        title: 'Sites Advanced',
                        description: `${sitesToAdvance.length} sites moved to CP Verification.`,
                      });
                      refreshSites();
                    } catch (err) {
                      console.error('Error advancing sites:', err);
                      toast({
                        title: 'Error',
                        description: 'Failed to advance sites to CP Verification.',
                        variant: 'destructive',
                      });
                    }
                  } else {
                    toast({
                      title: 'No Sites to Advance',
                      description: 'No pending sites found to advance to CP Verification.',
                    });
                  }
                }}
                className="h-auto py-4 flex-col gap-2 border-green-200 hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
                data-testid="button-no-permits-needed"
              >
                <CheckCircle className="h-6 w-6 text-green-600" />
                <span className="font-semibold">No Permits Needed</span>
                <span className="text-xs text-muted-foreground font-normal">Skip to CP Verification</span>
              </Button>
              
              <Button 
                size="lg"
                onClick={() => {
                  setLocalityPermitPromptOpen(false);
                  setLocalityTriageDialogOpen(true);
                }}
                className="h-auto py-4 flex-col gap-2 bg-purple-600 hover:bg-purple-700"
                data-testid="button-yes-select-localities"
              >
                <MapPin className="h-6 w-6" />
                <span className="font-semibold">Yes, Some Need Permits</span>
                <span className="text-xs text-purple-200 font-normal">Select which localities</span>
              </Button>
            </div>
          </div>

          {/* Footer with cancel */}
          <div className="border-t px-6 py-3 bg-muted/30">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setLocalityPermitPromptOpen(false)}
              className="w-full text-muted-foreground"
              data-testid="button-cancel-permit-prompt"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Locality Permit Requirement Triage Dialog */}
      <LocalityRequirementTriageDialog
        open={localityTriageDialogOpen}
        onOpenChange={setLocalityTriageDialogOpen}
        localities={(() => {
          // Get all localities from states that have state permits
          return localitiesData
            .filter((state: any) => state.hasStatePermit)
            .flatMap((state: any) => 
              state.localities.map((locality: any) => ({
                state: state.state,
                locality: locality.locality,
                siteCount: locality.sites?.length || 0,
                requiresPermit: localityPermitRequirements[`${state.state}|${locality.locality}`] ?? null
              }))
            )
            .filter((loc) => loc.siteCount > 0);
        })()}
        onComplete={async (requirements) => {
          setLocalityPermitRequirements(requirements);
          setTriageCompleted(true);
          setLocalityTriageDialogOpen(false);
          
          // Auto-advance localities that don't require permits to CP Verification
          const nonRequiredLocalities = Object.entries(requirements)
            .filter(([_, required]) => !required)
            .map(([key]) => key);
          
          if (nonRequiredLocalities.length > 0) {
            // Find sites in non-required localities and move them to permits_attached
            const sitesToAdvance: SiteVisit[] = [];
            
            // Use case-insensitive status matching
            const validStatuses = ['pending', 'dispatched', 'assigned', 'inprogress', 'in_progress', 'new', 'forwarded'];
            
            localitiesData
              .filter((state: any) => state.hasStatePermit)
              .forEach((state: any) => {
                state.localities.forEach((locality: any) => {
                  const key = `${state.state}|${locality.locality}`;
                  if (requirements[key] === false) {
                    locality.sites?.forEach((site: SiteVisit) => {
                      const status = (site.status || '').toLowerCase().replace(/\s+/g, '_');
                      if (validStatuses.includes(status)) {
                        sitesToAdvance.push(site);
                      }
                    });
                  }
                });
              });
            
            console.log('[Triage] Non-required localities:', nonRequiredLocalities);
            console.log('[Triage] Sites to advance:', sitesToAdvance.length);
            
            if (sitesToAdvance.length > 0) {
              try {
                // Update each site individually to preserve existing additional_data
                const updatePromises = sitesToAdvance.map(async (site) => {
                  const existingData = (site as any).additional_data || {};
                  const mergedData = {
                    ...existingData,
                    locality_permit_not_required: true,
                    locality_permit_triage_date: new Date().toISOString()
                  };
                  
                  return supabase
                    .from('mmp_site_entries')
                    .update({ 
                      status: 'permits_attached',
                      additional_data: mergedData
                    })
                    .eq('id', site.id);
                });
                
                const results = await Promise.all(updatePromises);
                const error = results.find(r => r.error)?.error;
                
                if (error) throw error;
                
                toast({
                  title: 'Sites Advanced',
                  description: `${sitesToAdvance.length} site(s) from ${nonRequiredLocalities.length} locality/localities moved to CP Verification (no locality permit required).`,
                });
                
                // Refresh data
                refreshSites();
              } catch (error) {
                console.error('Error advancing sites:', error);
                toast({
                  title: 'Error',
                  description: 'Failed to advance some sites. Please try again.',
                  variant: 'destructive'
                });
              }
            }
          }
          
          toast({
            title: 'Requirements Saved',
            description: `${Object.values(requirements).filter(v => v).length} locality/localities marked as requiring permits.`,
          });
        }}
        onCancel={() => setLocalityTriageDialogOpen(false)}
      />
    </div>
  );
};

export default CoordinatorSites;
