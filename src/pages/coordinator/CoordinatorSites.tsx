import React, { useState, useEffect, useMemo } from 'react';
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
import { CheckCircle, Clock, FileCheck, XCircle, ArrowLeft, Eye, Edit, Search, ChevronLeft, ChevronRight, Calendar, CheckSquare, MapPin, AlertTriangle, ChevronUp, ChevronDown, Play } from 'lucide-react';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { format } from 'date-fns';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCoordinatorLocalityPermits } from '@/hooks/use-coordinator-permits';
import { LocalityPermitUpload } from '@/components/LocalityPermitUpload';
import { StatePermitUpload } from '@/components/StatePermitUpload';
import { LocalityPermitStatus } from '@/types/coordinator-permits';

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

interface Hub {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
}

interface State {
  id: string;
  name: string;
  code: string;
}

interface Locality {
  id: string;
  name: string;
  state_id: string;
}

interface SiteVisit {
  id: string;
  site_name: string;
  site_code: string;
  status: string;
  state: string;
  locality: string;
  activity: string;
  main_activity: string;
  visit_date: string;
  assigned_at: string;
  comments: string;
  mmp_file_id: string;
  hub_office: string;
  cp_name?: string;
  activity_at_site?: string[];
  monitoring_by?: string;
  survey_tool?: string;
  use_market_diversion?: boolean;
  use_warehouse_monitoring?: boolean;
  verified_at?: string;
  verified_by?: string;
  verification_notes?: string;
  additional_data?: any;
}

interface SiteEditFormProps {
  site: SiteVisit;
  onSave: (site: SiteVisit, shouldVerify: boolean) => void;
  onCancel: () => void;
  hubs: Hub[];
  states: State[];
  localities: Locality[];
  hubStates?: { hub_id: string; state_id: string; state_name: string; state_code: string; }[];
}

const SiteEditForm: React.FC<SiteEditFormProps> = ({ site, onSave, onCancel, hubs, states, localities, hubStates = [] }) => {
  const { toast } = useToast();
  const [formData, setFormData] = React.useState<SiteVisit>({
    ...site,
    activity_at_site: Array.isArray(site.activity_at_site) ? site.activity_at_site : 
                     (site.activity_at_site ? [site.activity_at_site] : [])
  });
  const [visitDate, setVisitDate] = React.useState<Date | undefined>(undefined);
  const [customValues, setCustomValues] = React.useState({
    survey_tool: ''
  });

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="site_name">Site Name</Label>
          <Input
            id="site_name"
            value={formData.site_name}
            onChange={(e) => setFormData({ ...formData, site_name: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="site_code">Site Code</Label>
          <Input
            id="site_code"
            value={formData.site_code}
            onChange={(e) => setFormData({ ...formData, site_code: e.target.value })}
            required
          />
        </div>
        <div className="md:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="hub_office">Hub Office</Label>
              <div className="space-y-2">
                <Select
                  value={formData.hub_office}
                  onValueChange={(value) => {
                    // Clear state and locality when hub changes
                    setFormData({ ...formData, hub_office: value, state: '', locality: '' });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select hub office" />
                  </SelectTrigger>
                  <SelectContent>
                    {hubs.map((hub) => (
                      <SelectItem key={hub.id} value={hub.name}>
                        {hub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.hub_office && (
              <div>
                <Label htmlFor="state">State</Label>
                <Select
                  value={formData.state}
                  onValueChange={(value) => setFormData({ ...formData, state: value, locality: '' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {hubStateOptions.map((state) => (
                      <SelectItem key={state.state_id} value={state.state_name}>
                        {state.state_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {formData.state && (
              <div>
                <Label htmlFor="locality">Locality</Label>
                <Select
                  value={formData.locality}
                  onValueChange={(value) => setFormData({ ...formData, locality: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select locality" />
                  </SelectTrigger>
                  <SelectContent>
                    {localityOptions.map((locality) => (
                      <SelectItem key={locality.id} value={locality.name}>
                        {locality.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="cp_name">CP Name</Label>
          <Input
            id="cp_name"
            value={formData.cp_name || ''}
            onChange={(e) => setFormData({ ...formData, cp_name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="activity_at_site">Activity at Site</Label>
          <div className="space-y-2">
            {ACTIVITY_OPTIONS.map((activity) => (
              <div key={activity} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={`activity-${activity}`}
                  checked={formData.activity_at_site?.includes(activity) || false}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setFormData(prev => ({
                      ...prev,
                      activity_at_site: isChecked
                        ? [...(prev.activity_at_site || []), activity]
                        : (prev.activity_at_site || []).filter(a => a !== activity)
                    }));
                  }}
                />
                <Label htmlFor={`activity-${activity}`} className="text-sm font-normal">
                  {activity}
                </Label>
              </div>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="monitoring_by">Monitoring By</Label>
          <Select
            value={formData.monitoring_by || ''}
            onValueChange={(value) => setFormData({ ...formData, monitoring_by: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select monitoring organization" />
            </SelectTrigger>
            <SelectContent>
              {MONITORING_BY_OPTIONS.map((org) => (
                <SelectItem key={org} value={org}>
                  {org}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="survey_tool">Survey Tool</Label>
          <div className="space-y-2">
            <Select
              value={isCustomValue('survey_tool', formData.survey_tool || '') ? 'Other' : (formData.survey_tool || '')}
              onValueChange={(value) => {
                if (value === 'Other') {
                  setCustomValues(prev => ({ ...prev, survey_tool: formData.survey_tool || '' }));
                }
                setFormData({ ...formData, survey_tool: value });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select survey tool" />
              </SelectTrigger>
              <SelectContent>
                {SURVEY_TOOL_OPTIONS.map((tool) => (
                  <SelectItem key={tool} value={tool}>
                    {tool}
                  </SelectItem>
                ))}
                <SelectItem value="Other">Other (Custom)</SelectItem>
              </SelectContent>
            </Select>
            {formData.survey_tool === 'Other' && (
              <Input
                placeholder="Enter custom survey tool"
                value={customValues.survey_tool}
                onChange={(e) => setCustomValues(prev => ({ ...prev, survey_tool: e.target.value }))}
              />
            )}
          </div>
        </div>
        <div>
          <Label>Visit Date <span className="text-red-500">*</span></Label>
          <DatePicker
            date={visitDate}
            onSelect={setVisitDate}
            className="w-full"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="comments">Comments</Label>
          <Textarea
            id="comments"
            value={formData.comments}
            onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
            rows={3}
          />
        </div>
      </div>

      <DialogFooter>
        {site.status?.toLowerCase() === 'permits_attached' ? (
          // For sites with permits attached, only show Verify button
          <Button 
            type="button"
            onClick={() => {
              // Validate that visit date is required
              if (!visitDate) {
                toast({
                  title: 'Validation Error',
                  description: 'Visit date is required. Please select a visit date before verifying.',
                  variant: 'destructive'
                });
                return;
              }
              const updatedSite = {
                ...formData,
                visit_date: visitDate ? visitDate.toISOString().split('T')[0] : null,
                // Use custom values if "Other" was selected
                hub_office: formData.hub_office,
                monitoring_by: formData.monitoring_by,
                survey_tool: formData.survey_tool === 'Other' ? customValues.survey_tool : formData.survey_tool,
              };
              onSave(updatedSite, true);
            }}
            disabled={!visitDate}
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
                  visit_date: visitDate ? visitDate.toISOString().split('T')[0] : null,
                  // Use custom values if "Other" was selected
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
                // Validate that visit date is required
                if (!visitDate) {
                  toast({
                    title: 'Validation Error',
                    description: 'Visit date is required. Please select a visit date before re-verifying.',
                    variant: 'destructive'
                  });
                  return;
                }
                const updatedSite = {
                  ...formData,
                  visit_date: visitDate ? visitDate.toISOString().split('T')[0] : null,
                  // Use custom values if "Other" was selected
                  hub_office: formData.hub_office,
                  monitoring_by: formData.monitoring_by,
                  survey_tool: formData.survey_tool === 'Other' ? customValues.survey_tool : formData.survey_tool,
                };
                onSave(updatedSite, true);
              }}
              disabled={!visitDate}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Re-verify Site
            </Button>
          </>
        ) : (
          // For other sites, show both Save and Verify buttons
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
                  visit_date: visitDate ? visitDate.toISOString().split('T')[0] : null,
                  // Use custom values if "Other" was selected
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
                // Validate that visit date is required
                if (!visitDate) {
                  toast({
                    title: 'Validation Error',
                    description: 'Visit date is required. Please select a visit date before verifying.',
                    variant: 'destructive'
                  });
                  return;
                }
                const updatedSite = {
                  ...formData,
                  visit_date: visitDate ? visitDate.toISOString().split('T')[0] : null,
                  // Use custom values if "Other" was selected
                  hub_office: formData.hub_office,
                  monitoring_by: formData.monitoring_by,
                  survey_tool: formData.survey_tool === 'Other' ? customValues.survey_tool : formData.survey_tool,
                };
                onSave(updatedSite, true);
              }}
              disabled={!visitDate}
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

interface SiteVisit {
  id: string;
  site_name: string;
  site_code: string;
  status: string;
  state: string;
  locality: string;
  activity: string;
  main_activity: string;
  visit_date: string;
  assigned_at: string;
  comments: string;
  mmp_file_id: string;
  hub_office: string;
  verified_at?: string;
  verified_by?: string;
  verification_notes?: string;
  additional_data?: any;
}

const CoordinatorSites: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const { updateMMP } = useMMP();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const siteVisitContext = useSiteVisitContext();
  const [isStartingVisit, setIsStartingVisit] = useState(false);
  const { permits, loading: permitsLoading, uploadPermit, fetchPermits } = useCoordinatorLocalityPermits();
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteVisit[]>([]);
  const [localitiesData, setLocalitiesData] = useState<any[]>([]);
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

  // Individual site verification without permit dialog state
  const [siteWithoutPermitDialogOpen, setSiteWithoutPermitDialogOpen] = useState(false);
  const [selectedSiteForWithoutPermit, setSelectedSiteForWithoutPermit] = useState<SiteVisit | null>(null);

  // Confirmation dialog for proceeding without permit
  const [confirmWithoutPermitDialogOpen, setConfirmWithoutPermitDialogOpen] = useState(false);
  const [withoutPermitComments, setWithoutPermitComments] = useState('');

  // Preview dialog for completed sites
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedSiteForPreview, setSelectedSiteForPreview] = useState<SiteVisit | null>(null);

  // Sub-tab state for new sites categorization
  const [newSitesSubTab, setNewSitesSubTab] = useState('state_required');

  // Database data for location dropdowns
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [hubStates, setHubStates] = useState<{ hub_id: string; state_id: string; state_name: string; state_code: string; }[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Memoize filtered sites to avoid recalculation on every render
  const filteredSites = useMemo(() => {
    if (!sites) return [];
    
    let result = sites;
    
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
  }, [sites, debouncedSearchQuery, hubFilter, stateFilter, localityFilter, activityFilter, monitoringFilter, surveyToolFilter]);

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

  // Fetch location data from database
  useEffect(() => {
    const fetchLocationData = async () => {
      try {
        setLoadingLocations(true);
        
        // Fetch hubs
        const { data: hubsData, error: hubsError } = await supabase
          .from('hubs')
          .select('id, name, description, is_active')
          .eq('is_active', true)
          .order('name');
        
        if (hubsError) throw hubsError;
        setHubs(hubsData || []);
        
        // Fetch hub_states for hub-state relationships
        const { data: hubStatesData, error: hubStatesError } = await supabase
          .from('hub_states')
          .select('hub_id, state_id, state_name, state_code')
          .order('state_name');
        
        if (hubStatesError) throw hubStatesError;
        setHubStates(hubStatesData || []);
        
        // Fetch localities from sites_registry table (distinct localities)
        const { data: localitiesData, error: localitiesError } = await supabase
          .from('sites_registry')
          .select('locality_id, locality_name, state_id')
          .order('locality_name');
        
        if (localitiesError) throw localitiesError;
        
        // Convert to Locality interface format and remove duplicates
        const uniqueLocalities: Locality[] = [];
        const seen = new Set<string>();
        
        (localitiesData || []).forEach(loc => {
          const key = `${loc.locality_id}-${loc.state_id}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueLocalities.push({
              id: loc.locality_id,
              name: loc.locality_name,
              state_id: loc.state_id
            });
          }
        });
        
        setLocalities(uniqueLocalities);
        
      } catch (error) {
        console.error('Error fetching location data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load location data. Please refresh the page.',
          variant: 'destructive'
        });
      } finally {
        setLoadingLocations(false);
      }
    };

    fetchLocationData();
  }, [toast]);

  // Load badge counts for all tabs (always loaded) - filtered by project membership
  useEffect(() => {
    if (!currentUser?.id) return;
    
    const loadBadgeCounts = async () => {
      // Non-admin users with no project assignments should see nothing
      if (!isAdminOrSuperUser && userProjectIds.length === 0) {
        updateBadgeCounts([]);
        return;
      }
      
      try {
        const userId = currentUser.id;
        
        // Fetch entries with mmp_file join to get project_id for filtering
        const { data: userEntries, error: entriesError } = await supabase
          .from('mmp_site_entries')
          .select(`
            id, status,
            mmp_file:mmp_files!mmp_file_id(project_id)
          `)
          .eq('forwarded_to_user_id', userId)
          .limit(5000);
        
        if (entriesError) {
          console.warn('RLS or filter error, falling back to full fetch:', entriesError);
          // Fallback: fetch all and filter client-side
          const { data: allEntries } = await supabase
            .from('mmp_site_entries')
            .select(`
              id, status, forwarded_to_user_id,
              mmp_file:mmp_files!mmp_file_id(project_id)
            `)
            .limit(5000);
          
          let filtered = (allEntries || []).filter((entry: any) => {
            return entry.forwarded_to_user_id === userId;
          });
          
          // Apply project filter for non-admin users (userProjectIds.length > 0 is guaranteed here)
          if (!isAdminOrSuperUser) {
            filtered = filtered.filter((entry: any) => {
              const projectId = entry.mmp_file?.project_id;
              return projectId && userProjectIds.includes(projectId);
            });
          }
          
          updateBadgeCounts(filtered);
          return;
        }
        
        // Apply project filter for non-admin users (userProjectIds.length > 0 is guaranteed here)
        let filtered = userEntries || [];
        if (!isAdminOrSuperUser) {
          filtered = filtered.filter((entry: any) => {
            const projectId = entry.mmp_file?.project_id;
            return projectId && userProjectIds.includes(projectId);
          });
        }
        
        updateBadgeCounts(filtered);
      } catch (error) {
        console.error('Error loading badge counts:', error);
      }
    };

    const updateBadgeCounts = (entries: any[]) => {
      const newCount = entries.filter((e: any) => 
        e.status === 'Pending' || e.status === 'Dispatched' || e.status === 'assigned' || e.status === 'inProgress' || e.status === 'in_progress'
      ).length;
      const permitsAttachedCount = entries.filter((e: any) => 
        e.status?.toLowerCase() === 'permits_attached'
      ).length;
      const verifiedCount = entries.filter((e: any) => 
        e.status?.toLowerCase() === 'verified'
      ).length;
      const approvedCount = entries.filter((e: any) => 
        e.status?.toLowerCase() === 'approved'
      ).length;
      const completedCount = entries.filter((e: any) => 
        e.status?.toLowerCase() === 'completed'
      ).length;
      const rejectedCount = entries.filter((e: any) => 
        e.status?.toLowerCase() === 'rejected'
      ).length;

      setNewSitesCount(newCount);
      setPermitsAttachedCount(permitsAttachedCount);
      setVerifiedSitesCount(verifiedCount);
      setApprovedSitesCount(approvedCount);
      setCompletedSitesCount(completedCount);
      setRejectedSitesCount(rejectedCount);
    };

    loadBadgeCounts();
  }, [currentUser?.id, userProjectIds, isAdminOrSuperUser]);

  // Load sites for active tab only - filtered by project membership
  useEffect(() => {
    loadSites();
    // Reset search and pagination when tab changes
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
  }, [currentUser?.id, activeTab, userProjectIds, isAdminOrSuperUser]);

  const loadSites = async () => {
    if (!currentUser?.id) return;
    
    // Non-admin users with no project assignments should see nothing
    if (!isAdminOrSuperUser && userProjectIds.length === 0) {
      setSites([]);
      setLocalitiesData([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      // Load forwarded entries with mmp_file join to get project_id for filtering
      const { data: allEntries, error } = await supabase
        .from('mmp_site_entries')
        .select(`
          id, site_name, site_code, status, state, locality, activity_at_site, main_activity, visit_date, comments, mmp_file_id, hub_office, verified_at, verified_by, verification_notes, additional_data, created_at, forwarded_to_user_id,
          mmp_file:mmp_files!mmp_file_id(project_id)
        `)
        .eq('forwarded_to_user_id', currentUser.id)
        .limit(5000);

      if (error) {
        console.warn('Filter error, falling back to full fetch:', error);
        // Fallback: fetch all and filter client-side
        const { data: fallbackEntries, error: fallbackError } = await supabase
          .from('mmp_site_entries')
          .select(`
            id, site_name, site_code, status, state, locality, activity_at_site, main_activity, visit_date, comments, mmp_file_id, hub_office, verified_at, verified_by, verification_notes, additional_data, created_at, forwarded_to_user_id,
            mmp_file:mmp_files!mmp_file_id(project_id)
          `)
          .limit(5000);
        
        if (fallbackError) throw fallbackError;
        
        // Continue with fallback data
        processEntries(fallbackEntries || [], currentUser.id);
        return;
      }
      
      processEntries(allEntries || [], currentUser.id);
    } catch (error) {
      console.error('Error loading sites:', error);
      toast({
        title: 'Error',
        description: 'Failed to load sites. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const processEntries = async (allEntries: any[], userId: string) => {
    try {
      
      // Filter entries forwarded to current user and by project membership for non-admins
      // Note: userProjectIds.length > 0 is guaranteed here because loadSites returns early if empty
      let filtered = (allEntries || []).filter((entry: any) => {
        const isForwardedToUser = entry.forwarded_to_user_id === userId;
        
        // For non-admins, also check project membership
        if (!isAdminOrSuperUser) {
          const projectId = entry.mmp_file?.project_id;
          return isForwardedToUser && projectId && userProjectIds.includes(projectId);
        }
        
        return isForwardedToUser;
      }).map((entry: any) => {
        // Clear visit_date for unverified sites in the "new" tab
        const isUnverified = entry.status === 'Pending' || entry.status === 'Dispatched' || entry.status === 'assigned' || entry.status === 'inProgress' || entry.status === 'in_progress';
        const visitDate = isUnverified ? null : entry.visit_date;
        
        return {
          id: entry.id,
          site_name: entry.site_name,
          site_code: entry.site_code,
          status: entry.status,
          state: entry.state,
          locality: entry.locality,
          activity: entry.activity_at_site || entry.main_activity,
          main_activity: entry.main_activity,
          activity_at_site: entry.activity_at_site 
            ? entry.activity_at_site.split(', ').filter(a => a.trim() !== '') 
            : [],
          visit_date: visitDate,
          assigned_at: entry.additional_data?.assigned_at || entry.created_at,
          comments: entry.comments,
          mmp_file_id: entry.mmp_file_id,
          hub_office: entry.hub_office,
          verified_at: entry.verified_at,
          verified_by: entry.verified_by,
          verification_notes: entry.verification_notes,
          additional_data: entry.additional_data
        };
      });

      // Group sites by state first, then by locality within each state
      const statesMap = new Map<string, any>();
      
      filtered.forEach((site: any) => {
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

      // Build state/locality aggregates quickly without blocking on mmp_files
      const statesArray = Array.from(statesMap.values()).map((stateData: any) => {
        const localitiesArray = Array.from(stateData.localities.values()).map((locality: any) => ({
          ...locality,
          hasPermit: false,
          permitId: null,
          permitUploadedAt: null
        }));

        // Consider site-level flag added when forwarding with state permit
        let anySiteHasStatePermitFlag = false;
        try {
          const allSitesInState = localitiesArray.flatMap((loc: any) => loc.sites || []);
          anySiteHasStatePermitFlag = allSitesInState.some((s: any) => s?.additional_data?.state_permit_attached === true);
        } catch {}

        return {
          ...stateData,
          localities: localitiesArray,
          hasStatePermit: anySiteHasStatePermitFlag,
          statePermitUploadedAt: null,
          statePermitVerified: false
        };
      });

      // Flatten sites from all states and localities (they will be filtered by the workflow)
      let allSites: SiteVisit[] = [];
      statesArray.forEach(stateData => {
        stateData.localities.forEach((locality: any) => {
          allSites = allSites.concat(locality.sites);
        });
      });

      // Filter by status based on active tab
      switch (activeTab) {
        case 'new':
          allSites = allSites.filter((e: any) => 
            e.status === 'Pending' || e.status === 'Dispatched' || e.status === 'assigned' || e.status === 'inProgress' || e.status === 'in_progress'
          );
          break;
        case 'permits_attached':
          allSites = allSites.filter((e: any) => 
            e.status?.toLowerCase() === 'permits_attached'
          );
          break;
        case 'verified':
          allSites = allSites.filter((e: any) => 
            e.status?.toLowerCase() === 'verified'
          );
          break;
        case 'approved':
          allSites = allSites.filter((e: any) => 
            e.status?.toLowerCase() === 'approved'
          );
          break;
        case 'completed':
          allSites = allSites.filter((e: any) => 
            e.status?.toLowerCase() === 'completed'
          );
          break;
        case 'rejected':
          allSites = allSites.filter((e: any) => 
            e.status?.toLowerCase() === 'rejected'
          );
          break;
      }

      // Sort by assigned_at
      allSites.sort((a: any, b: any) => {
        const aAt = a.assigned_at || a.created_at;
        const bAt = b.assigned_at || b.created_at;
        return new Date(bAt).getTime() - new Date(aAt).getTime();
      });

      setSites(allSites);
      setLocalitiesData(statesArray); // Store states data instead of localities
      setCurrentPage(1); // Reset pagination when tab changes
      
      // Calculate subcategory counts for new sites tabs
      const statePermitRequiredCount = statesArray
        .filter((state: any) => !state.hasStatePermit)
        .reduce((total: number, state: any) => total + state.totalSites, 0);
      
      const localPermitRequiredCount = statesArray
        .filter((state: any) => state.hasStatePermit)
        .flatMap((state: any) => state.localities)
        .filter((locality: any) => !locality.hasPermit)
        .filter((locality: any) => {
          // Only count localities that have pending sites
          return locality.sites.some((site: SiteVisit) => 
            site.status === 'Pending' || site.status === 'Dispatched' || 
            site.status === 'assigned' || site.status === 'inProgress' || 
            site.status === 'in_progress'
          );
        })
        .reduce((total: number, locality: any) => {
          // Only count sites that are in pending/new status
          const pendingSites = locality.sites.filter((site: SiteVisit) => 
            site.status === 'Pending' || site.status === 'Dispatched' || 
            site.status === 'assigned' || site.status === 'inProgress' || 
            site.status === 'in_progress'
          );
          return total + pendingSites.length;
        }, 0);
      
      setStatePermitRequiredCount(statePermitRequiredCount);
      setLocalPermitRequiredCount(localPermitRequiredCount);
      
      // Initialize visit dates state
      const visitDates: { [key: string]: Date | undefined } = {};
      allSites.forEach((site: any) => {
        if (site.visit_date) {
          visitDates[site.id] = new Date(site.visit_date);
        }
      });
      setSiteVisitDates(visitDates);
    } catch (error) {
      console.error('Error loading sites:', error);
      toast({
        title: 'Error',
        description: 'Failed to load sites. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Rebuild locality/permit aggregates without refetching sites to avoid
  // re-triggering the main loading spinner. Runs when metadata changes.
  const rebuildLocalityData = async () => {
    try {
      if (!sites || sites.length === 0) {
        setLocalitiesData([]);
        setStatePermitRequiredCount(0);
        setLocalPermitRequiredCount(0);
        return;
      }

      const statesMap = new Map<string, any>();
      sites.forEach((site: any) => {
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

      const uniqueMmpIds = Array.from(new Set(
        sites.map((s: any) => s.mmp_file_id).filter(Boolean)
      ));

      let mmpFilesMap = new Map<string, any>();
      if (uniqueMmpIds.length > 0) {
        const { data: mmpFilesData } = await supabase
          .from('mmp_files')
          .select('id, permits')
          .in('id', uniqueMmpIds);
        mmpFilesMap = new Map((mmpFilesData || []).map((m: any) => [m.id, m]));
      }

      const stateNameToId = new Map(hubStates.map((hs: any) => [hs.state_name, hs.state_id]));
      const localityKeyToId = new Map(localities.map((l: any) => [`${l.state_id}|${l.name}`, l.id]));
      const permitKeySet = new Set(permits.map((p: any) => `${p.stateId}|${p.localityId}`));

      const statesArray = Array.from(statesMap.values()).map((stateData: any) => {
        let statePermitVerified = false;
        let statePermitUploaded = false;
        let statePermitUploadedAt: any = null;

        const firstLocality = stateData.localities.values().next().value;
        const mmpFileId = firstLocality?.sites?.[0]?.mmp_file_id;
        if (mmpFileId && mmpFilesMap.has(mmpFileId)) {
          try {
            const mmpData = mmpFilesMap.get(mmpFileId);
            if (mmpData?.permits?.statePermits) {
              const sp = (mmpData.permits.statePermits as any[]).find((x: any) => x.state === stateData.state);
              if (sp) {
                statePermitUploaded = true;
                statePermitVerified = !!sp.verified;
                statePermitUploadedAt = sp.uploadedAt || null;
              }
            }
          } catch {}
        }

        const localitiesArray = Array.from(stateData.localities.values()).map((locality: any) => {
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

        let anySiteHasStatePermitFlag = false;
        try {
          const allSitesInState = localitiesArray.flatMap((loc: any) => loc.sites || []);
          anySiteHasStatePermitFlag = allSitesInState.some((s: any) => s?.additional_data?.state_permit_attached === true);
        } catch {}

        const hasStatePermit = statePermitUploaded || anySiteHasStatePermitFlag;

        return {
          ...stateData,
          localities: localitiesArray,
          hasStatePermit,
          statePermitUploadedAt,
          statePermitVerified
        };
      });

      // Subcategory counts
      const statePermitRequired = statesArray
        .filter((state: any) => !state.hasStatePermit)
        .reduce((total: number, state: any) => total + state.totalSites, 0);

      const localPermitRequired = statesArray
        .filter((state: any) => state.hasStatePermit)
        .flatMap((state: any) => state.localities)
        .filter((locality: any) => !locality.hasPermit)
        .filter((locality: any) => {
          return locality.sites.some((site: any) => 
            site.status === 'Pending' || site.status === 'Dispatched' || 
            site.status === 'assigned' || site.status === 'inProgress' || 
            site.status === 'in_progress'
          );
        })
        .reduce((total: number, locality: any) => {
          const pendingSites = locality.sites.filter((site: any) => 
            site.status === 'Pending' || site.status === 'Dispatched' || 
            site.status === 'assigned' || site.status === 'inProgress' || 
            site.status === 'in_progress'
          );
          return total + pendingSites.length;
        }, 0);

      setLocalitiesData(statesArray);
      setStatePermitRequiredCount(statePermitRequired);
      setLocalPermitRequiredCount(localPermitRequired);
    } catch {}
  };

  useEffect(() => {
    // Only recompute aggregates when metadata changes; do not refetch sites
    rebuildLocalityData();
  }, [sites, permits, hubStates, localities]);

  useEffect(() => {
    let debounceId: number | null = null;
    const scheduleReload = () => {
      if (debounceId) window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        loadSites();
        debounceId = null;
      }, 1000); // Increased debounce to 1s to reduce rapid reloads
    };

    const channel = supabase
      .channel('coordinator_sites_live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mmp_site_entries' },
        (payload) => {
          // Only reload if change is relevant to current user
          if ((payload.new as any)?.forwarded_to_user_id === currentUser?.id ||
              (payload.old as any)?.forwarded_to_user_id === currentUser?.id) {
            scheduleReload();
          }
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
      if (debounceId) window.clearTimeout(debounceId);
    };
  }, [currentUser?.id]);

  const handleVerifySite = async (siteId: string, notes?: string) => {
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

      const { error } = await supabase
        .from('mmp_site_entries')
        .update(updateData)
        .eq('id', siteId);

      if (error) throw error;
      try {
        const site = sites.find(s => s.id === siteId);
        if (site?.mmp_file_id && site?.site_code) {
          // Get current site entry to check if cost exists
          const { data: currentEntry } = await supabase
            .from('mmp_site_entries')
            .select('cost, enumerator_fee, transport_fee, additional_data')
            .eq('mmp_file_id', site.mmp_file_id)
            .eq('site_code', site.site_code)
            .single();

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
          
          await supabase
            .from('mmp_site_entries')
            .update(mmpUpdateData)
            .eq('mmp_file_id', site.mmp_file_id)
            .eq('site_code', site.site_code);

          // Mark MMP as coordinator-verified when first site is verified
          // Get current MMP workflow
          const { data: mmpData, error: mmpError } = await supabase
            .from('mmp_files')
            .select('workflow, status')
            .eq('id', site.mmp_file_id)
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
              await updateMMP(site.mmp_file_id, {
                workflow: updatedWorkflow,
                status: mmpData.status === 'pending' ? 'pending' : 'pending' // Ensure it's pending
              });
            }
          }
        }
      } catch (syncErr) {
        console.warn('Failed to sync mmp_site_entries on verify:', syncErr);
      }

      toast({
        title: 'Site Verified',
        description: 'The site has been marked as verified.',
      });

      // Reload sites and badge counts
      loadSites();
      // Reload badge counts
      if (currentUser?.id) {
        const userId = currentUser.id;
        // Load entries forwarded to current user
        const { data: allEntries } = await supabase
          .from('mmp_site_entries')
          .select('id, status, forwarded_to_user_id');
        
        const userEntries = (allEntries || []).filter((entry: any) => {
          return entry.forwarded_to_user_id === userId;
        });
        
        const newCount = { count: userEntries.filter((e: any) => 
          e.status === 'Pending' || e.status === 'Dispatched' || e.status === 'assigned' || e.status === 'inProgress' || e.status === 'in_progress'
        ).length };
        const verifiedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'verified'
        ).length };
        
        setNewSitesCount(newCount.count || 0);
        setVerifiedSitesCount(verifiedCount.count || 0);
      }
      setActiveTab('verified');
      setVerifyDialogOpen(false);
      setVerificationNotes('');
      setSelectedSiteId(null);
    } catch (error) {
      console.error('Error verifying site:', error);
      toast({
        title: 'Error',
        description: 'Failed to verify site. Please try again.',
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
        const site = sites.find(s => s.id === siteId);
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

      // Reload sites and badge counts
      loadSites();
      // Reload badge counts
      if (currentUser?.id) {
        const userId = currentUser.id;
        // Load entries forwarded to current user
        const { data: allEntries } = await supabase
          .from('mmp_site_entries')
          .select('id, status, forwarded_to_user_id');
        
        const userEntries = (allEntries || []).filter((entry: any) => {
          return entry.forwarded_to_user_id === userId;
        });
        
        const newCount = { count: userEntries.filter((e: any) => 
          e.status === 'Pending' || e.status === 'Dispatched' || e.status === 'assigned' || e.status === 'inProgress' || e.status === 'in_progress'
        ).length };
        const rejectedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'rejected'
        ).length };
        
        setNewSitesCount(newCount.count || 0);
        setRejectedSitesCount(rejectedCount.count || 0);
      }
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

      const { error } = await supabase
        .from('mmp_site_entries')
        .update({ visit_date: bulkVisitDate })
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
      loadSites();
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
        const selectedSitesData = sites.filter(site => selectedSites.has(site.id));
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

      // Clear selection and reload sites
      setSelectedSites(new Set());
      setBulkVerificationNotes('');
      setBulkVerifyDialogOpen(false);
      loadSites();
      
      // Reload badge counts
      if (currentUser?.id) {
        const userId = currentUser.id;
        const { data: allEntries } = await supabase
          .from('mmp_site_entries')
          .select('id, status, additional_data');
        
        const userEntries = (allEntries || []).filter((entry: any) => {
          const ad = entry.additional_data || {};
          return ad.assigned_to === userId;
        });
        
        const newCount = { count: userEntries.filter((e: any) => 
          e.status === 'Pending' || e.status === 'Dispatched' || e.status === 'assigned' || e.status === 'inProgress' || e.status === 'in_progress'
        ).length };
        const verifiedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'verified'
        ).length };
        
        setNewSitesCount(newCount.count || 0);
        setVerifiedSitesCount(verifiedCount.count || 0);
      }
      
      setActiveTab('verified');
    } catch (error) {
      console.error('Error bulk verifying sites:', error);
      toast({
        title: 'Error',
        description: 'Failed to verify sites. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleBulkApproveSites = async () => {
    if (selectedSites.size === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select at least one site to approve.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const siteIds = Array.from(selectedSites);
      const updateData: any = {
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
      };

      if (bulkApprovalNotes) {
        updateData.approval_notes = bulkApprovalNotes;
      }

      const { error } = await supabase
        .from('mmp_site_entries')
        .update(updateData)
        .in('id', siteIds);

      if (error) throw error;

      // Also update MMP files for approved sites
      try {
        const selectedSitesData = sites.filter(site => selectedSites.has(site.id));
        for (const site of selectedSitesData) {
          if (site?.mmp_file_id && site?.site_code) {
            const mmpUpdateData: any = { 
              status: 'Approved',
              approved_at: new Date().toISOString(),
              approved_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System'
            };
            if (bulkApprovalNotes) {
              mmpUpdateData.approval_notes = bulkApprovalNotes;
            }
            
            await supabase
              .from('mmp_site_entries')
              .update(mmpUpdateData)
              .eq('mmp_file_id', site.mmp_file_id)
              .eq('site_code', site.site_code);
          }
        }
      } catch (syncErr) {
        console.warn('Failed to sync mmp_site_entries on bulk approve:', syncErr);
      }

      toast({
        title: 'Bulk Approval Complete',
        description: `${selectedSites.size} site(s) have been approved successfully.`,
      });

      // Clear selection and reload sites
      setSelectedSites(new Set());
      setBulkApprovalNotes('');
      setBulkApproveDialogOpen(false);
      loadSites();
      
      // Reload badge counts
      if (currentUser?.id) {
        const userId = currentUser.id;
        const { data: allEntries } = await supabase
          .from('mmp_site_entries')
          .select('id, status, additional_data');
        
        const userEntries = (allEntries || []).filter((entry: any) => {
          const ad = entry.additional_data || {};
          return ad.assigned_to === userId;
        });
        
        const verifiedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'verified'
        ).length };
        const approvedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'approved'
        ).length };
        
        setVerifiedSitesCount(verifiedCount.count || 0);
        setApprovedSitesCount(approvedCount.count || 0);
      }
      
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
    if (!selectedLocalityForBulkVerify || !bulkLocalityVisitDateObj) {
      toast({
        title: 'Validation Error',
        description: 'Please select a visit date.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const { sites: localitySites } = selectedLocalityForBulkVerify;
      const visitDateString = bulkLocalityVisitDateObj.toISOString().split('T')[0];
      
      // First, update visit dates for all sites in the locality
      const siteIds = localitySites.map(site => site.id);
      const { error: dateError } = await supabase
        .from('mmp_site_entries')
        .update({ visit_date: visitDateString })
        .in('id', siteIds);

      if (dateError) throw dateError;

      // Then verify all sites
      const updateData: any = {
        status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
      };

      const { error: verifyError } = await supabase
        .from('mmp_site_entries')
        .update(updateData)
        .in('id', siteIds);

      if (verifyError) throw verifyError;

      // Also update MMP files for verified sites
      try {
        for (const site of localitySites) {
          if (site?.mmp_file_id && site?.site_code) {
            const mmpUpdateData: any = { 
              status: 'Verified',
              visit_date: visitDateString,
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
        }
      } catch (syncErr) {
        console.warn('Failed to sync mmp_site_entries on bulk verify:', syncErr);
      }

      toast({
        title: 'Bulk Verification Complete',
        description: `Visit date set and ${localitySites.length} site(s) in this locality have been verified successfully.`,
      });

      // Clear state and reload sites
      setBulkLocalityVerifyDialogOpen(false);
      setSelectedLocalityForBulkVerify(null);
      setBulkLocalityVisitDate('');
      setBulkLocalityVisitDateObj(undefined);
      loadSites();
      
      // Reload badge counts
      if (currentUser?.id) {
        const userId = currentUser.id;
        const { data: allEntries } = await supabase
          .from('mmp_site_entries')
          .select('id, status, additional_data');
        
        const userEntries = (allEntries || []).filter((entry: any) => {
          const ad = entry.additional_data || {};
          return ad.assigned_to === userId;
        });
        
        const permitsAttachedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'permits_attached'
        ).length };
        const verifiedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'verified'
        ).length };
        
        setPermitsAttachedCount(permitsAttachedCount.count || 0);
        setVerifiedSitesCount(verifiedCount.count || 0);
      }
      
      setActiveTab('verified');
    } catch (error) {
      console.error('Error bulk verifying locality sites:', error);
      toast({
        title: 'Error',
        description: 'Failed to verify sites. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleBulkVerifyLocalitySites = async (localitySites: SiteVisit[], notes?: string) => {
    if (localitySites.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'No sites found in this locality.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const siteIds = localitySites.map(site => site.id);
      const updateData: any = {
        status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
      };

      if (notes) {
        updateData.verification_notes = notes;
      }

      const { error } = await supabase
        .from('mmp_site_entries')
        .update(updateData)
        .in('id', siteIds);

      if (error) throw error;

      // Also update MMP files for verified sites
      try {
        for (const site of localitySites) {
          if (site?.mmp_file_id && site?.site_code) {
            const mmpUpdateData: any = { 
              status: 'Verified',
              verified_at: new Date().toISOString(),
              verified_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System'
            };
            if (notes) {
              mmpUpdateData.verification_notes = notes;
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
        description: `${localitySites.length} site(s) in this locality have been verified successfully.`,
      });

      // Reload sites and badge counts
      loadSites();
      
      // Reload badge counts
      if (currentUser?.id) {
        const userId = currentUser.id;
        const { data: allEntries } = await supabase
          .from('mmp_site_entries')
          .select('id, status, additional_data');
        
        const userEntries = (allEntries || []).filter((entry: any) => {
          const ad = entry.additional_data || {};
          return ad.assigned_to === userId;
        });
        
        const permitsAttachedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'permits_attached'
        ).length };
        const verifiedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'verified'
        ).length };
        
        setPermitsAttachedCount(permitsAttachedCount.count || 0);
        setVerifiedSitesCount(verifiedCount.count || 0);
      }
      
      setActiveTab('verified');
    } catch (error) {
      console.error('Error bulk verifying locality sites:', error);
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
      // No permit - just go back, no access
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
        loadSites();
        // Reload badge counts
        if (currentUser?.id) {
          const userId = currentUser.id;
          const { data: allEntries } = await supabase
            .from('mmp_site_entries')
            .select('id, status, additional_data');
          
          const userEntries = (allEntries || []).filter((entry: any) => {
            const ad = entry.additional_data || {};
            return ad.assigned_to === userId;
          });
          
          const permitsAttachedCount = { count: userEntries.filter((e: any) => 
            e.status?.toLowerCase() === 'permits_attached'
          ).length };
          
          setPermitsAttachedCount(permitsAttachedCount.count || 0);
        }

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
                {['dispatched', 'verified', 'approved', 'assigned'].includes(site.status?.toLowerCase()) && (
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
                        setSelectedSiteId(site.id);
                        setVerifyDialogOpen(true);
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

    return (
      <Card 
        key={stateData.state}
        className="overflow-hidden transition-shadow hover:shadow-md cursor-pointer"
        onClick={() => {
          // Check if state permits are uploaded by FOM
          if (!stateData.hasStatePermit) {
            setSelectedStateForWorkflow(stateData);
            setStatePermitQuestionDialogOpen(true);
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
        }}
      >
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{stateData.state}</h3>
                  <p className="text-sm text-muted-foreground">{stateData.localities.length} localit{stateData.localities.length !== 1 ? 'ies' : 'y'}</p>
                  <p className="text-sm text-muted-foreground">{stateData.totalSites} site{stateData.totalSites !== 1 ? 's' : ''} assigned</p>
                </div>
                <div className="flex items-center gap-2">
                  {stateData.hasStatePermit ? (
                    <Badge
                      variant="default"
                      className={stateData.statePermitVerified ? 'bg-green-600' : 'bg-blue-600'}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {stateData.statePermitVerified ? 'State Permit Verified' : 'State Permit Uploaded'}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      State Permit Required
                    </Badge>
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
                        className="flex items-center justify-between p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent state card click
                          setSelectedLocalityForWorkflow(locality);
                          setPermitQuestionDialogOpen(true);
                        }}
                      >
                        <div>
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

  const renderPermitsAttachedLocalityCard = (localityKey: string, localitySites: SiteVisit[]) => {
    const isExpanded = expandedPermitsAttachedLocalities.has(localityKey);
    const [state, locality] = localityKey.split('-');
    
    return (
      <Card 
        key={localityKey}
        className="overflow-hidden transition-shadow hover:shadow-md cursor-pointer"
      >
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{locality}</h3>
                  <p className="text-sm text-muted-foreground">{state}</p>
                  <p className="text-sm text-muted-foreground">{localitySites.length} site{localitySites.length !== 1 ? 's' : ''} with permits attached</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-green-600">
                    <FileCheck className="h-3 w-3 mr-1" />
                    Permits Attached
                  </Badge>
                </div>
              </div>
              
              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
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
                  className="flex items-center gap-2"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {isExpanded ? 'Hide Sites' : 'View Sites'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedLocalityForBulkVerify({ localityKey, sites: localitySites });
                    setBulkLocalityVerifyDialogOpen(true);
                  }}
                  className="flex items-center gap-2 bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                >
                  <CheckCircle className="h-4 w-4" />
                  Verify All Sites
                </Button>
              </div>
              
              {/* Show sites when locality is expanded */}
              {isExpanded && (
                <div className="mt-4">
                  <div className="text-sm text-muted-foreground mb-2">
                    Sites in this locality:
                  </div>
                  <div className="space-y-2">
                    {localitySites.map((site) => (
                      <div 
                        key={site.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSiteForEdit(site);
                          setEditDialogOpen(true);
                        }}
                      >
                        <div>
                          <span className="font-medium">{site.site_name}</span>
                          <span className="text-muted-foreground ml-2">({site.site_code})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {site.comments?.includes('No locality permit required') 
                              ? 'No Local Permit Required & Attached - Ready for Verification' 
                              : 'Ready for Verification'}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSiteId(site.id);
                              setVerifyDialogOpen(true);
                            }}
                            className="text-xs h-7 px-2"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Verify
                          </Button>
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
              <div className="flex items-center justify-between">
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
              <div className="flex items-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedLocalityForWorkflow(localityData);
                    setPermitQuestionDialogOpen(true);
                  }}
                  className="flex items-center gap-2"
                >
                  <FileCheck className="h-4 w-4" />
                  Upload Permit
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
                  className="flex items-center gap-2"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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
                          className="flex items-center justify-between p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            setSelectedSiteForWithoutPermit(site);
                            setSiteWithoutPermitDialogOpen(true);
                          }}
                        >
                          <div>
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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading sites...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between bg-blue-600 text-white p-5 rounded-2xl shadow">
        <div>
          <h1 className="text-3xl font-bold">Site Verification</h1>
          <p className="mt-1 text-blue-100/90">Review and verify sites assigned to you</p>
        </div>
        <Button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 bg-white text-blue-600 hover:bg-white/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 gap-1 h-auto p-1">
          <TabsTrigger value="new" className="flex flex-col items-center justify-center gap-1 rounded-md py-2 px-1 sm:px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-xs sm:text-sm">
            <span>New</span>
            <Badge variant="secondary" className="text-xs">{newSitesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="permits_attached" className="flex flex-col items-center justify-center gap-1 rounded-md py-2 px-1 sm:px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-xs sm:text-sm">
            <span>Permits</span>
            <Badge variant="secondary" className="text-xs">{permitsAttachedCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="verified" className="flex flex-col items-center justify-center gap-1 rounded-md py-2 px-1 sm:px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-xs sm:text-sm">
            <span>Verified</span>
            <Badge variant="secondary" className="text-xs">{verifiedSitesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex flex-col items-center justify-center gap-1 rounded-md py-2 px-1 sm:px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-xs sm:text-sm">
            <span>Approved</span>
            <Badge variant="secondary" className="text-xs">{approvedSitesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex flex-col items-center justify-center gap-1 rounded-md py-2 px-1 sm:px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-xs sm:text-sm">
            <span>Completed</span>
            <Badge variant="secondary" className="text-xs">{completedSitesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rejected" className={`flex flex-col items-center justify-center gap-1 rounded-md py-2 px-1 sm:px-3 ${rejectedSitesCount > 0 ? 'bg-red-200 hover:bg-red-300 data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-sm' : 'bg-red-100 hover:bg-red-200 data-[state=active]:bg-red-100 data-[state=active]:text-red-800 data-[state=active]:shadow-sm'} text-xs sm:text-sm`}>
            <span>Rejected</span>
            <Badge variant="secondary" className="text-xs">{rejectedSitesCount}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
          <Tabs value={newSitesSubTab} onValueChange={setNewSitesSubTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="state_required" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800 data-[state=active]:shadow-sm">
                <AlertTriangle className="h-4 w-4" />
                State Permit Required
                <Badge variant="secondary" className="ml-2">
                  {statePermitRequiredCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="local_required" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800 data-[state=active]:shadow-sm">
                <MapPin className="h-4 w-4" />
                Local Permit Required
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
                  {loading || permitsLoading ? (
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

            <TabsContent value="local_required" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Localities Requiring Local Permits</CardTitle>
                    <div className="relative w-full sm:w-auto max-w-sm">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Search localities..."
                        className="pl-8 w-full sm:w-[300px]"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    These localities have verified state permits. You can now upload local permits for these localities.
                  </div>
                </CardHeader>
                <CardContent>
                  {loading || permitsLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-muted-foreground">Loading localities...</p>
                    </div>
                  ) : (() => {
        // Get all localities from states that have state permits
        const localRequiredLocalities = localitiesData
          .filter((state: any) => state.hasStatePermit)
          .flatMap((state: any) => 
            state.localities.map((locality: any) => ({
              ...locality,
              stateName: state.state
            }))
          )
          .filter((locality: any) => !locality.hasPermit) // Only show localities without local permits
          .filter((locality: any) => {
            // Only show localities that have pending sites
            return locality.sites.some((site: SiteVisit) => 
              site.status === 'Pending' || site.status === 'Dispatched' || 
              site.status === 'assigned' || site.status === 'inProgress' || 
              site.status === 'in_progress'
            );
          });                    const filteredLocalities = localRequiredLocalities.filter((locality: any) => 
                      locality.locality.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
                      locality.stateName.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
                    );
                    
                    return filteredLocalities.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p>{searchQuery ? 'No localities match your search.' : 'No localities available for local permit upload.'}</p>
                        <p className="text-sm mt-2">State permits must be uploaded first, and localities without local permits will appear here.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filteredLocalities.map(locality => renderLocalityCard(locality))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
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
                      Select All ({filteredSites.length} sites)
                    </Label>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {filteredSites.length === 0 ? (
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
              {filteredSites.length === 0 ? (
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
              {filteredSites.length === 0 ? (
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
              {filteredSites.length === 0 ? (
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

      {/* Edit Site Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Site Details</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Review and edit site information. Changes will be saved automatically.
            </p>
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
                  };

                  // Only set verification fields if shouldVerify is true
                  if (shouldVerify) {
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

                  // Reload sites and badge counts
                  loadSites();
                  // Reload badge counts
                  if (currentUser?.id) {
                    const userId = currentUser.id;
                    const { data: allEntries } = await supabase
                      .from('mmp_site_entries')
                      .select('id, status, additional_data');
                    
                    const userEntries = (allEntries || []).filter((entry: any) => {
                      const ad = entry.additional_data || {};
                      return ad.assigned_to === userId;
                    });
                    
                    const newCount = { count: userEntries.filter((e: any) => 
                      e.status === 'Pending' || e.status === 'Dispatched' || e.status === 'assigned' || e.status === 'inProgress' || e.status === 'in_progress'
                    ).length };
                    const verifiedCount = { count: userEntries.filter((e: any) => 
                      e.status?.toLowerCase() === 'verified'
                    ).length };
                    
                    setNewSitesCount(newCount.count || 0);
                    setVerifiedSitesCount(verifiedCount.count || 0);
                  }

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
            <p className="text-sm text-muted-foreground">
              Set visit date and verify all {selectedLocalityForBulkVerify?.sites.length} site{selectedLocalityForBulkVerify?.sites.length !== 1 ? 's' : ''} in this locality.
            </p>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">
                  Visit Date <span className="text-red-500">*</span>
                </Label>
                <div className="mt-1">
                  <DatePicker
                    date={bulkLocalityVisitDateObj}
                    onSelect={setBulkLocalityVisitDateObj}
                    className="w-full"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  This visit date will be applied to all sites in the locality before verification.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setBulkLocalityVerifyDialogOpen(false);
              setSelectedLocalityForBulkVerify(null);
              setBulkLocalityVisitDate('');
              setBulkLocalityVisitDateObj(undefined);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkLocalityVerify}
              disabled={!bulkLocalityVisitDateObj}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Set Date & Verify {selectedLocalityForBulkVerify?.sites.length} Site{selectedLocalityForBulkVerify?.sites.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Approve Dialog */}
      <Dialog open={bulkApproveDialogOpen} onOpenChange={setBulkApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Selected Sites</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Mark {selectedSites.size} selected site{selectedSites.size !== 1 ? 's' : ''} as approved.
            </p>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="bulk-approval-notes" className="text-sm font-medium">
                  Approval Notes (Optional)
                </Label>
                <Textarea
                  id="bulk-approval-notes"
                  placeholder="Add notes about the approval..."
                  value={bulkApprovalNotes}
                  onChange={(e) => setBulkApprovalNotes(e.target.value)}
                  className="mt-1"
                  rows={4}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setBulkApproveDialogOpen(false);
              setBulkApprovalNotes('');
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkApproveSites}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve {selectedSites.size} Site{selectedSites.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permit Question Dialog */}
      <Dialog open={permitQuestionDialogOpen} onOpenChange={setPermitQuestionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Local Permit Required</DialogTitle>
            <DialogDescription>
              Do you have the local permit for <strong>{selectedLocalityForWorkflow?.locality}, {selectedLocalityForWorkflow?.state}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Local permits are required to work on sites in this locality. If you have the permit, you can upload it now and access the sites.
              If not, you cannot access sites in this locality.
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => handlePermitQuestionResponse(false)}
            >
              No, I don't have the permit
            </Button>
            <Button 
              onClick={() => handlePermitQuestionResponse(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Yes, I have the permit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* State Permit Question Dialog */}
      <Dialog open={statePermitQuestionDialogOpen} onOpenChange={setStatePermitQuestionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>State Permit Required</DialogTitle>
            <DialogDescription>
              State permits for <strong>{selectedStateForWorkflow?.state}</strong> have not been uploaded by the FOM.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              State permits are required before you can access local permits. You need to upload the state permit first.
              Do you have the state permit for this state?
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setStatePermitQuestionDialogOpen(false);
                setSelectedStateForWorkflow(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                setStatePermitQuestionDialogOpen(false);
                // Show state permit upload dialog
                if (selectedStateForWorkflow) {
                  const stateKey = selectedStateForWorkflow.state;
                  setExpandedStates(prev => new Set([...prev, stateKey]));
                }
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Yes, upload state permit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* State Permit Upload Dialog */}
      {selectedStateForWorkflow && (
        <Dialog open={expandedStates.has(selectedStateForWorkflow.state)} onOpenChange={() => {}}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Upload State Permit</DialogTitle>
              <DialogDescription>
                Upload the state permit for <strong>{selectedStateForWorkflow.state}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 max-h-96 overflow-y-auto">
              <StatePermitUpload
                state={selectedStateForWorkflow.state}
                mmpFileId={selectedStateForWorkflow.localities?.[0]?.sites?.[0]?.mmp_file_id}
                userType="coordinator"
                onPermitUploaded={() => {
                  // After state permit is uploaded, reload sites data to update state categorization
                  loadSites();
                  
                  // Switch to local permit required tab since state permit is now uploaded
                  setNewSitesSubTab('local_required');
                  
                  // After state permit is uploaded, redirect to local permit upload
                  setExpandedStates(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(selectedStateForWorkflow.state);
                    return newSet;
                  });
                  
                  // Now show the local permit question dialog
                  setSelectedLocalityForWorkflow(selectedStateForWorkflow);
                  setPermitQuestionDialogOpen(true);
                  setSelectedStateForWorkflow(null);
                }}
              />
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setSelectedStateForWorkflow(null);
                  setExpandedStates(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(selectedStateForWorkflow.state);
                    return newSet;
                  });
                }}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Locality Permit Upload Dialog */}
      {selectedLocalityForWorkflow && (
        <Dialog open={localityPermitUploadDialogOpen} onOpenChange={setLocalityPermitUploadDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Upload Local Permit</DialogTitle>
              <DialogDescription>
                Upload the local permit for <strong>{selectedLocalityForWorkflow.locality}, {selectedLocalityForWorkflow.state}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 max-h-96 overflow-y-auto">
              <LocalityPermitUpload
                state={selectedLocalityForWorkflow.state}
                locality={selectedLocalityForWorkflow.locality}
                mmpFileId={selectedLocalityForWorkflow.sites?.[0]?.mmp_file_id}
                onPermitUploaded={handlePermitUploaded}
              />
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setLocalityPermitUploadDialogOpen(false);
                  setSelectedLocalityForWorkflow(null);
                }}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Site Without Permit Dialog */}
      <Dialog open={siteWithoutPermitDialogOpen} onOpenChange={setSiteWithoutPermitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proceed Without Local Permit</DialogTitle>
            <DialogDescription>
              Can you continue to complete <strong>{selectedSiteForWithoutPermit?.site_name}</strong> without a local permit?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              If you can proceed without the local permit, this site will be moved to "Permits Attached" and you can verify it immediately.
              If you cannot proceed without the permit, the site will remain in this locality and wait for the local permit to be uploaded.
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => handleSiteWithoutPermitResponse(false)}
            >
              No, wait for permit
            </Button>
            <Button 
              onClick={() => {
                setSiteWithoutPermitDialogOpen(false);
                setConfirmWithoutPermitDialogOpen(true);
              }}
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
            <p className="text-sm text-muted-foreground mb-4">
              This action will move the site to "Permits Attached" status and allow immediate verification.
              Please provide any additional comments explaining why no local permit is required.
            </p>
            <div>
              <Label htmlFor="without-permit-comments" className="text-sm font-medium">
                Comments (Optional)
              </Label>
              <Textarea
                id="without-permit-comments"
                placeholder="Explain why no local permit is required..."
                value={withoutPermitComments}
                onChange={(e) => setWithoutPermitComments(e.target.value)}
                className="mt-1"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setConfirmWithoutPermitDialogOpen(false);
                setWithoutPermitComments('');
                setSelectedSiteForWithoutPermit(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => handleSiteWithoutPermitResponse(true, withoutPermitComments)}
              className="bg-blue-600 hover:bg-blue-700"
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
      </Dialog>    </div>
  );
};

export default CoordinatorSites;
