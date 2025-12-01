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
import { CheckCircle, Clock, FileCheck, XCircle, ArrowLeft, Eye, Edit, Search, ChevronLeft, ChevronRight, Calendar, CheckSquare, MapPin, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';
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
  const [visitDate, setVisitDate] = React.useState<Date | undefined>(
    site.visit_date ? new Date(site.visit_date) : undefined
  );
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
            className="bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Verify Site
          </Button>
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
              className="bg-green-600 hover:bg-green-700"
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
  const [bulkVisitDate, setBulkVisitDate] = useState<string>('');
  const [bulkVerificationNotes, setBulkVerificationNotes] = useState('');
  
  // Filter states
  const [hubFilter, setHubFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
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

  // Permit workflow state
  const [permitQuestionDialogOpen, setPermitQuestionDialogOpen] = useState(false);
  const [workWithoutPermitDialogOpen, setWorkWithoutPermitDialogOpen] = useState(false);
  const [selectedLocalityForWorkflow, setSelectedLocalityForWorkflow] = useState<any>(null);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());
  const [expandedLocalities, setExpandedLocalities] = useState<Set<string>>(new Set());

  // State permit workflow state
  const [statePermitQuestionDialogOpen, setStatePermitQuestionDialogOpen] = useState(false);
  const [selectedStateForWorkflow, setSelectedStateForWorkflow] = useState<any>(null);

  // Locality permit upload dialog state
  const [localityPermitUploadDialogOpen, setLocalityPermitUploadDialogOpen] = useState(false);

  // Individual site verification without permit dialog state
  const [siteWithoutPermitDialogOpen, setSiteWithoutPermitDialogOpen] = useState(false);
  const [selectedSiteForWithoutPermit, setSelectedSiteForWithoutPermit] = useState<SiteVisit | null>(null);

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

  // Load badge counts for all tabs (always loaded)
  useEffect(() => {
    if (!currentUser?.id) return;
    
    const loadBadgeCounts = async () => {
      try {
        const userId = currentUser.id;
        
        // Load all counts in parallel using database count queries
        // Note: assigned_to is now stored in additional_data.assigned_to for mmp_site_entries
        // We need to load entries and filter in memory since we can't query JSONB fields directly with count
        const { data: allEntries, error: entriesError } = await supabase
          .from('mmp_site_entries')
          .select('id, status, additional_data');
        
        if (entriesError) throw entriesError;
        
        // Filter entries by assigned_to in additional_data
        const userEntries = (allEntries || []).filter((entry: any) => {
          const ad = entry.additional_data || {};
          return ad.assigned_to === userId;
        });
        
        const newCount = { count: userEntries.filter((e: any) => 
          e.status === 'Pending' || e.status === 'Dispatched' || e.status === 'assigned' || e.status === 'inProgress' || e.status === 'in_progress'
        ).length };
        const permitsAttachedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'permits_attached'
        ).length };
        const verifiedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'verified'
        ).length };
        const approvedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'approved'
        ).length };
        const completedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'completed'
        ).length };
        const rejectedCount = { count: userEntries.filter((e: any) => 
          e.status?.toLowerCase() === 'rejected'
        ).length };

        setNewSitesCount(newCount.count || 0);
        setPermitsAttachedCount(permitsAttachedCount.count || 0);
        setVerifiedSitesCount(verifiedCount.count || 0);
        setApprovedSitesCount(approvedCount.count || 0);
        setCompletedSitesCount(completedCount.count || 0);
        setRejectedSitesCount(rejectedCount.count || 0);
      } catch (error) {
        console.error('Error loading badge counts:', error);
      }
    };

    loadBadgeCounts();
  }, [currentUser?.id]);

  // Load sites for active tab only
  useEffect(() => {
    loadSites();
    // Reset search and pagination when tab changes
    setSearchQuery('');
    setCurrentPage(1);
    // Reset filters when tab changes
    setHubFilter('all');
    setStateFilter('all');
    setActivityFilter('all');
    setMonitoringFilter('all');
    setSurveyToolFilter('all');
  }, [currentUser, activeTab, permits, hubStates, localities]);

  const loadSites = async () => {
    if (!currentUser?.id) return;
    
    setLoading(true);
    try {
      // Load all mmp_site_entries and filter by assigned_to in additional_data
      const { data: allEntries, error } = await supabase
        .from('mmp_site_entries')
        .select('*')
        .limit(1000); // Limit for performance

      if (error) throw error;
      
      // Filter entries assigned to current user and transform to SiteVisit format
      let filtered = (allEntries || []).filter((entry: any) => {
        const ad = entry.additional_data || {};
        return ad.assigned_to === currentUser.id;
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

      // Check permit status for each locality within states
      const statesArray = await Promise.all(Array.from(statesMap.values()).map(async (stateData: any) => {
        // Check state permit status for this state
        let statePermitVerified = false;
        let statePermitUploadedAt = null;
        
        // Get MMP file ID from the first site in this state
        const mmpFileId = stateData.localities.values().next().value?.sites?.[0]?.mmp_file_id;
        
        if (mmpFileId) {
          // Check if state permit is uploaded and verified for this specific state
          try {
            const { data: mmpData, error } = await supabase
              .from('mmp_files')
              .select('permits_data')
              .eq('id', mmpFileId)
              .single();
              
            if (!error && mmpData?.permits_data) {
              const permitsData = mmpData.permits_data as any;
              // Check if this specific state's permit is verified
              if (permitsData.statePermits) {
                const statePermit = permitsData.statePermits.find((sp: any) => 
                  sp.state === stateData.state && sp.verified === true
                );
                if (statePermit) {
                  statePermitVerified = true;
                  statePermitUploadedAt = statePermit.uploadedAt;
                }
              }
            }
          } catch (err) {
            console.warn('Failed to check state permit for state:', stateData.state, err);
          }
        }

        // Convert localities map to array and check local permits
        const localitiesArray = Array.from(stateData.localities.values()).map((locality: any) => {
          // Resolve stateId from state name
          const resolvedStateId = hubStates.find(hs => hs.state_name === locality.state)?.state_id;
          // Resolve localityId from locality name + stateId
          const resolvedLocalityId = resolvedStateId
            ? localities.find(l => l.name === locality.locality && l.state_id === resolvedStateId)?.id
            : undefined;

          const permit = resolvedStateId && resolvedLocalityId
            ? permits.find(p => p.stateId === resolvedStateId && p.localityId === resolvedLocalityId)
            : undefined;

          return {
            ...locality,
            hasPermit: !!permit,
            permitId: permit?.id || null,
            permitUploadedAt: permit?.uploadedAt || null
          };
        });

        return {
          ...stateData,
          localities: localitiesArray,
          hasStatePermit: statePermitVerified,
          statePermitUploadedAt: statePermitUploadedAt,
          statePermitVerified: statePermitVerified
        };
      }));

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
        // Load entries and filter by assigned_to in additional_data
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
        // Load entries and filter by assigned_to in additional_data
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

  const handleSiteWithoutPermitResponse = async (proceedWithoutPermit: boolean) => {
    setSiteWithoutPermitDialogOpen(false);

    if (proceedWithoutPermit && selectedSiteForWithoutPermit) {
      // Update site status to 'permits_attached'
      try {
        const { error } = await supabase
          .from('mmp_site_entries')
          .update({ status: 'permits_attached' })
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
    } else if (!proceedWithoutPermit && selectedSiteForWithoutPermit) {
      // Just open the edit dialog as normal
      setSelectedSiteForEdit(selectedSiteForWithoutPermit);
      setEditDialogOpen(true);
    }

    setSelectedSiteForWithoutPermit(null);
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

  // Filter sites by search query and filters (client-side filtering)
  const filteredSites = useMemo(() => {
    let filtered = sites;

    // Apply search query filter
    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(site => 
        site.site_name?.toLowerCase().includes(q) ||
        site.site_code?.toLowerCase().includes(q) ||
        site.state?.toLowerCase().includes(q) ||
        site.locality?.toLowerCase().includes(q) ||
        site.activity?.toLowerCase().includes(q) ||
        site.main_activity?.toLowerCase().includes(q) ||
        site.hub_office?.toLowerCase().includes(q)
      );
    }

    // Apply category filters
    if (hubFilter !== 'all') {
      filtered = filtered.filter(site => site.hub_office === hubFilter);
    }

    if (stateFilter !== 'all') {
      filtered = filtered.filter(site => site.state === stateFilter);
    }

    if (activityFilter !== 'all') {
      filtered = filtered.filter(site => 
        site.activity_at_site?.includes(activityFilter) || 
        site.activity === activityFilter ||
        site.main_activity === activityFilter
      );
    }

    if (monitoringFilter !== 'all') {
      filtered = filtered.filter(site => site.monitoring_by === monitoringFilter);
    }

    if (surveyToolFilter !== 'all') {
      filtered = filtered.filter(site => site.survey_tool === surveyToolFilter);
    }

    return filtered;
  }, [sites, debouncedSearchQuery, hubFilter, stateFilter, activityFilter, monitoringFilter, surveyToolFilter]);

  // Paginate filtered results
  const paginatedSites = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredSites.slice(startIndex, endIndex);
  }, [filteredSites, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredSites.length / itemsPerPage);

  const renderSiteCard = (site: SiteVisit, showActions: boolean = true) => (
    <Card 
      key={site.id} 
      className={`overflow-hidden transition-shadow ${
        showActions 
          ? 'hover:shadow-md cursor-pointer hover:bg-gray-50' 
          : 'cursor-default'
      } ${
        selectedSites.has(site.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
      }`}
      onClick={showActions ? (e) => {
        // Don't open edit dialog if clicking on checkbox
        if ((e.target as HTMLInputElement).type === 'checkbox') return;
        setSelectedSiteForEdit(site);
        setEditDialogOpen(true);
      } : undefined}
    >
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          {activeTab === 'new' && !readOnlyMode && (
            <div className="pt-1">
              <input
                type="checkbox"
                checked={selectedSites.has(site.id)}
                onChange={() => handleSiteSelection(site.id)}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{site.site_name}</h3>
                <p className="text-sm text-muted-foreground">Code: {site.site_code}</p>
                <p className="text-sm text-muted-foreground">{site.state}, {site.locality}</p>
              </div>
              <Badge variant={
                site.status === 'verified' ? 'default' :
                site.status === 'approved' ? 'success' :
                site.status === 'completed' ? 'success' :
                site.status === 'rejected' ? 'destructive' :
                'secondary'
              }>
                {site.status === 'assigned' ? 'New' : 
                 site.status === 'inProgress' ? 'In Progress' : 
                 site.status.charAt(0).toUpperCase() + site.status.slice(1)}
              </Badge>
            </div>
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
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      State Permit Verified
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
        <TabsList className="grid w-full grid-cols-6 gap-2">
          <TabsTrigger value="new" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <span>New Sites</span>
            <Badge variant="secondary">{newSitesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="permits_attached" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <span>Permits Attached</span>
            <Badge variant="secondary">{permitsAttachedCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="verified" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <span>Verified</span>
            <Badge variant="secondary">{verifiedSitesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <span>Approved</span>
            <Badge variant="secondary">{approvedSitesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <span>Completed</span>
            <Badge variant="secondary">{completedSitesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <span>Rejected</span>
            <Badge variant="secondary">{rejectedSitesCount}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
          <Tabs value={newSitesSubTab} onValueChange={setNewSitesSubTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="state_required" className="flex items-center justify-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                State Permit Required
              </TabsTrigger>
              <TabsTrigger value="local_required" className="flex items-center justify-center gap-2">
                <MapPin className="h-4 w-4" />
                Local Permit Required
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
                    These states require state permits to be uploaded by the FOM before you can access local permits.
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
                      .filter((locality: any) => !locality.hasPermit); // Only show localities without local permits
                    
                    const filteredLocalities = localRequiredLocalities.filter((locality: any) => 
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
                  <p>{searchQuery ? 'No sites match your search.' : 'No sites with permits attached yet.'}</p>
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
                    {paginatedSites.map(site => renderSiteCard(site, false))}
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
                    {paginatedSites.map(site => renderSiteCard(site, false))}
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
                    {paginatedSites.map(site => renderSiteCard(site, false))}
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
                    {paginatedSites.map(site => renderSiteCard(site, false))}
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
            <div className="py-4">
              <StatePermitUpload
                state={selectedStateForWorkflow.state}
                mmpFileId={selectedStateForWorkflow.sites?.[0]?.mmp_file_id}
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
            <div className="py-4">
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
              onClick={() => handleSiteWithoutPermitResponse(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Yes, proceed without permit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default CoordinatorSites;
