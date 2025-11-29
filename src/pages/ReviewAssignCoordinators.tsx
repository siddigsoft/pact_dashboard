import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight, ArrowLeft, Eye, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';

const ReviewAssignCoordinators: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getMmpById } = useMMP();
  const { users, currentUser } = useAppContext();

  const [mmpFile, setMmpFile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingForwardedStates, setLoadingForwardedStates] = useState(true);
  const [assignmentMap, setAssignmentMap] = useState({} as Record<string, string>);
  const [supervisorMap, setSupervisorMap] = useState({} as Record<string, string>);
  const [selectedSites, setSelectedSites] = useState({} as Record<string, Set<string>>);
  const [batchLoading, setBatchLoading] = useState({} as Record<string, boolean>);
  const [batchForwarded, setBatchForwarded] = useState({} as Record<string, boolean>);
  const [expandedGroups, setExpandedGroups] = useState({} as Record<string, boolean>);
  const [forwardedSiteIds, setForwardedSiteIds] = useState<Set<string>>(new Set());
  const [selectedSiteForView, setSelectedSiteForView] = useState<any>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Database data for location dropdowns
  const [localities, setLocalities] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [hubs, setHubs] = useState<any[]>([]);
  const [hubStates, setHubStates] = useState<any[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);

  // Filtering state
  const [selectedHub, setSelectedHub] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedLocality, setSelectedLocality] = useState<string>('');

  useEffect(() => {
    if (!id) return;
    
    const loadData = async () => {
      try {
        // Step 1: Get MMP file
        const mmp = getMmpById(id);
        if (!mmp) {
          toast({
            title: "MMP Not Found",
            description: "The requested MMP file could not be found.",
            variant: "destructive"
          });
          navigate('/mmp');
          return;
        }

        setMmpFile(mmp);
        
        // Step 2: Load forwarded sites from database BEFORE rendering
        // This prevents errors and ensures correct state from the start
        setLoadingForwardedStates(true);
        try {
          const { data: siteEntries, error } = await supabase
            .from('mmp_site_entries')
            .select('id, forwarded_at, forwarded_by_user_id, forwarded_to_user_id, dispatched_at, additional_data')
            .eq('mmp_file_id', id);
          
          if (error) {
            console.error('Error loading forwarded sites:', error);
            toast({
              title: "Warning",
              description: "Could not load forwarded site states. Some sites may appear incorrectly.",
              variant: "destructive"
            });
            // Continue with empty set rather than blocking
            setForwardedSiteIds(new Set());
          } else {
            // Find sites that have been forwarded
            // Check both new forwarded_at column and legacy dispatched_at/additional_data
            const forwarded = new Set<string>();
            (siteEntries || []).forEach((entry: any) => {
              const hasForwardedAt = !!entry.forwarded_at;
              const hasDispatchedAt = !!entry.dispatched_at;
              const hasAssignedTo = !!(entry.additional_data?.assigned_to);
              
              // Site is forwarded if any of these conditions are true
              if (hasForwardedAt || hasDispatchedAt || hasAssignedTo) {
                forwarded.add(entry.id);
              }
            });
            
            setForwardedSiteIds(forwarded);
            console.log(`Loaded ${forwarded.size} forwarded site(s) out of ${siteEntries?.length || 0} total`);
          }
        } catch (err) {
          console.error('Failed to load forwarded sites:', err);
          toast({
            title: "Warning",
            description: "Could not load forwarded site states. Please refresh the page.",
            variant: "destructive"
          });
          setForwardedSiteIds(new Set());
        } finally {
          setLoadingForwardedStates(false);
        }

        // Step 3: Load hubs, states and localities from database
        setLoadingLocations(true);
        try {
          // Fetch hubs
          const { data: hubsData, error: hubsError } = await supabase
            .from('hubs')
            .select('id, name, description, is_active')
            .eq('is_active', true)
            .order('name');
          
          if (hubsError) {
            console.error('Error loading hubs:', hubsError);
            setHubs([]);
          } else {
            setHubs(hubsData || []);
            console.log(`Loaded ${hubsData?.length || 0} hubs`);
          }

          // Fetch hub_states for hub-state relationships
          const { data: hubStatesData, error: hubStatesError } = await supabase
            .from('hub_states')
            .select('hub_id, state_id, state_name, state_code')
            .order('state_name');
          
          if (hubStatesError) {
            console.error('Error loading hub_states:', hubStatesError);
            setHubStates([]);
          } else {
            setHubStates(hubStatesData || []);
            console.log(`Loaded ${hubStatesData?.length || 0} hub-state relationships`);
          }

          // Fetch states from hub_states table
          const { data: statesData, error: statesError } = await supabase
            .from('hub_states')
            .select('state_id, state_name, state_code')
            .order('state_name');
          
          if (statesError) {
            console.error('Error loading states:', statesError);
            setStates([]);
          } else {
            // Convert to State interface format and remove duplicates
            const uniqueStates: any[] = [];
            const seenStates = new Set<string>();
            
            (statesData || []).forEach(state => {
              if (!seenStates.has(state.state_id)) {
                seenStates.add(state.state_id);
                uniqueStates.push({
                  id: state.state_id,
                  name: state.state_name,
                  code: state.state_code
                });
              }
            });
            
            setStates(uniqueStates);
            console.log(`Loaded ${uniqueStates.length} unique states`);
          }

          // Fetch localities from sites_registry table
          const { data: localitiesData, error: localitiesError } = await supabase
            .from('sites_registry')
            .select('locality_id, locality_name, state_id')
            .order('locality_name');
          
          if (localitiesError) {
            console.error('Error loading localities:', localitiesError);
            setLocalities([]);
          } else {
            // Convert to format and remove duplicates
            const uniqueLocalities: any[] = [];
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
            console.log(`Loaded ${uniqueLocalities.length} unique localities`);
          }
        } catch (err) {
          console.error('Failed to load location data:', err);
          toast({
            title: "Warning",
            description: "Could not load location data. Please refresh the page.",
            variant: "destructive"
          });
          setHubs([]);
          setHubStates([]);
          setStates([]);
          setLocalities([]);
        } finally {
          setLoadingLocations(false);
        }
      } catch (err) {
        console.error('Failed to load MMP data:', err);
        toast({
          title: "Error",
          description: "Failed to load MMP data. Please try again.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, getMmpById, navigate, toast]);

  if (loading || loadingForwardedStates || loadingLocations) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">
            {loadingForwardedStates ? 'Checking forwarded site states...' : 'Loading MMP file...'}
          </p>
        </div>
      </div>
    );
  }

  if (!mmpFile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">MMP File Not Found</h1>
          <p className="text-gray-600 mb-6">The requested MMP file could not be found.</p>
          <Button onClick={() => navigate('/mmp')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to MMP Files
          </Button>
        </div>
      </div>
    );
  }

  // Prepare site groups and coordinators
  // Show all sites (including forwarded ones) but mark them as forwarded
  let entries: any[] = Array.isArray(mmpFile?.siteEntries) && mmpFile.siteEntries.length > 0 
    ? mmpFile.siteEntries
    : [];

  // Create state name to ID mapping from database data
  const stateNameToId = new Map<string, string>();
  states.forEach(state => {
    const normalizedName = state.name.toLowerCase();
    stateNameToId.set(normalizedName, state.id);
    // Also add without "State" suffix for better matching
    if (normalizedName.endsWith(' state')) {
      stateNameToId.set(normalizedName.replace(/\s+state$/, ''), state.id);
    }
  });

  // Create localities by state mapping from database data
  const localitiesByState = new Map<string, Map<string, string>>();
  states.forEach(state => {
    const map = new Map<string, string>();
    localities
      .filter(loc => loc.state_id === state.id)
      .forEach(loc => map.set(loc.name.toLowerCase(), loc.id));
    localitiesByState.set(state.id, map);
  });

  // Get filtered states for selected hub
  const selectedHubObj = hubs.find(h => h.id === selectedHub);
  const hubStateOptions = selectedHubObj ? hubStates.filter(hs => hs.hub_id === selectedHubObj.id) : [];
  
  // Get localities for selected state
  const selectedStateObj = hubStateOptions.find(s => s.state_id === selectedState);
  const localityOptions = selectedStateObj ? localities.filter(loc => loc.state_id === selectedStateObj.state_id) : [];

  // Create group map from entries
  const groupMap: Record<string, any[]> = {};
  entries.forEach((e: any) => {
    const sName = String(e.state || '').trim().toLowerCase();
    const stateId = stateNameToId.get(sName);
    const locName = String(e.locality || '').trim().toLowerCase();
    const locMap = stateId ? localitiesByState.get(stateId) : null;
    const localityId = locName && locMap ? (locMap.get(locName) || '') : '';
    const key = stateId ? `${stateId}|${localityId}` : 'unassigned|unassigned';
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(e);
  });

  // Filter groups based on selected filters
  const filteredGroupMap = Object.entries(groupMap).reduce((acc, [groupKey, groupSites]) => {
    const [stateId, localityId] = groupKey.split('|');
    
    // If no filters selected, show all
    if (!selectedHub && !selectedState && !selectedLocality) {
      acc[groupKey] = groupSites;
      return acc;
    }
    
    // Check if this group matches the selected filters
    let matches = true;
    
    if (selectedHub) {
      // Check if this state belongs to the selected hub
      const stateBelongsToHub = hubStates.some(hs => hs.hub_id === selectedHub && hs.state_id === stateId);
      if (!stateBelongsToHub) matches = false;
    }
    
    if (matches && selectedState) {
      if (stateId !== selectedState) matches = false;
    }
    
    if (matches && selectedLocality) {
      if (localityId !== selectedLocality) matches = false;
    }
    
    if (matches) {
      acc[groupKey] = groupSites;
    }
    
    return acc;
  }, {} as Record<string, any[]>);

  // All coordinators in the system
  const allCoordinators = users.filter(u => u.role === 'coordinator');

  // All supervisors in the system
  const allSupervisors = users.filter(u => u.role === 'supervisor');

  // Helper to get recommended coordinator for a group
  function getRecommendedCoordinator(stateId: string, localityId: string) {
    return allCoordinators.find(c => c.stateId === stateId && (c.localityId === localityId || !localityId));
  }

  // Forward a single batch (group) to the selected coordinator
  const handleForwardBatch = async (groupKey: string) => {
    setBatchLoading(b => ({ ...b, [groupKey]: true }));
    try {
      const mmpId = mmpFile?.id || mmpFile?.mmpId;
      const coordinatorId = assignmentMap[groupKey];
      const supervisorId = supervisorMap[groupKey];
      const siteIds = Array.from(selectedSites[groupKey] || []);
      if (!coordinatorId || siteIds.length === 0) {
        toast({ title: 'Select sites and coordinator', description: 'Please select at least one site and a coordinator.', variant: 'destructive' });
        setBatchLoading(b => ({ ...b, [groupKey]: false }));
        return;
      }

      // Get the site entries for the selected sites
      const selectedSiteEntries = groupMap[groupKey]?.filter((site: any) => siteIds.includes(site.id)) || [];

      // Update mmp_site_entries to assign to coordinator (keep status as Pending)
      const updatePromises = selectedSiteEntries.map(async (siteEntry: any) => {
        const existingAdditionalData = siteEntry.additional_data || {};
        const forwardedAt = new Date().toISOString();
        
        // Update the mmp_site_entry in the database (assign to coordinator, keep status as Pending)
        const { data, error } = await supabase
          .from('mmp_site_entries')
          .update({
            status: 'Pending',
            // New proper foreign key columns
            forwarded_by_user_id: currentUser?.id || null,
            forwarded_to_user_id: coordinatorId,
            forwarded_at: forwardedAt,
            // Keep legacy fields for backward compatibility
            dispatched_by: currentUser?.id || null,
            dispatched_at: forwardedAt,
            additional_data: {
              ...existingAdditionalData,
              assigned_to: coordinatorId,
              assigned_by: currentUser?.id || null,
              assigned_at: forwardedAt,
              supervisor_id: supervisorId || null,
              notes: `Forwarded from MMP ${mmpFile?.name || mmpFile?.mmpId} for CP verification`,
            }
          })
          .eq('id', siteEntry.id)
          .select()
          .single();

        if (error) {
          console.error('Error updating site entry:', error);
          throw error;
        }

        return data;
      });

      // Wait for all site entries to be updated
      await Promise.all(updatePromises);

      // Send notification to coordinator
      const notifications = [
        {
          user_id: coordinatorId,
          title: 'Sites forwarded for CP verification',
          message: `${mmpFile?.name || 'MMP'}: ${siteIds.length} site(s) have been forwarded for your CP review`,
          type: 'info',
          link: `/coordinator/sites`,
          related_entity_id: mmpId,
          related_entity_type: 'mmpFile',
        }
      ];

      // Send notification to supervisor if selected
      if (supervisorId) {
        notifications.push({
          user_id: supervisorId,
          title: 'Sites assigned to coordinator for verification',
          message: `${mmpFile?.name || 'MMP'}: ${siteIds.length} site(s) have been assigned to ${allCoordinators.find(c => c.id === coordinatorId)?.fullName || 'Coordinator'} for CP verification`,
          type: 'info',
          link: `/supervisor/sites`,
          related_entity_id: mmpId,
          related_entity_type: 'mmpFile',
        });
      }

      await supabase.from('notifications').insert(notifications);

      toast({ title: 'Batch Forwarded', description: `Sites were forwarded to ${allCoordinators.find(c => c.id === coordinatorId)?.fullName || 'Coordinator'}${supervisorId ? ` and notified ${allSupervisors.find(s => s.id === supervisorId)?.fullName || 'Supervisor'}` : ''}.`, variant: 'default' });
      
      // Mark sites as forwarded to prevent re-forwarding
      const newForwarded = new Set(forwardedSiteIds);
      siteIds.forEach(id => newForwarded.add(id));
      setForwardedSiteIds(newForwarded);
      
      setBatchLoading(b => ({ ...b, [groupKey]: false }));
      setBatchForwarded(f => ({ ...f, [groupKey]: true }));
      setSelectedSites(s => ({ ...s, [groupKey]: new Set() }));
    } catch (e) {
      console.warn('Batch forward failed:', e);
      toast({ title: 'Forwarding failed', description: 'Could not forward to coordinator. Please try again.', variant: 'destructive' });
      setBatchLoading(b => ({ ...b, [groupKey]: false }));
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button
          variant="outline"
          onClick={() => navigate(`/mmp/${mmpFile.id}`)}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to MMP Details
        </Button>
      </div>

      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Review & Assign Coordinators</CardTitle>
          <CardDescription>
            Review the MMP sites and assign them to coordinators for verification. Optionally assign supervisors to receive notifications. Sites are grouped by state and locality for efficient assignment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forwardedSiteIds.size > 0 && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>{forwardedSiteIds.size}</strong> site(s) have already been forwarded and are excluded from this list.
              </p>
            </div>
          )}

          {/* Location Filters */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium mb-3">Filter Sites by Location</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="hub-filter">Hub Office</Label>
                <Select
                  value={selectedHub}
                  onValueChange={(value) => {
                    setSelectedHub(value);
                    setSelectedState(''); // Clear dependent filters
                    setSelectedLocality('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All hubs" />
                  </SelectTrigger>
                  <SelectContent>
                    {hubs.map((hub) => (
                      <SelectItem key={hub.id} value={hub.id}>
                        {hub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedHub && (
                <div>
                  <Label htmlFor="state-filter">State</Label>
                  <Select
                    value={selectedState}
                    onValueChange={(value) => {
                      setSelectedState(value);
                      setSelectedLocality(''); // Clear dependent filter
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All states" />
                    </SelectTrigger>
                    <SelectContent>
                      {hubStateOptions.map((state) => (
                        <SelectItem key={state.state_id} value={state.state_id}>
                          {state.state_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {selectedState && (
                <div>
                  <Label htmlFor="locality-filter">Locality</Label>
                  <Select
                    value={selectedLocality}
                    onValueChange={setSelectedLocality}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All localities" />
                    </SelectTrigger>
                    <SelectContent>
                      {localityOptions.map((locality) => (
                        <SelectItem key={locality.id} value={locality.id}>
                          {locality.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            
            {(selectedHub || selectedState || selectedLocality) && (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedHub('');
                    setSelectedState('');
                    setSelectedLocality('');
                  }}
                >
                  Clear Filters
                </Button>
                <span className="text-sm text-muted-foreground">
                  Showing {Object.keys(filteredGroupMap).length} of {Object.keys(groupMap).length} site groups
                </span>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {Object.entries(filteredGroupMap).length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {Object.keys(groupMap).length === 0 ? (
                  forwardedSiteIds.size > 0 
                    ? 'All sites have been forwarded. No remaining sites to assign.'
                    : 'No site groups found for this MMP.'
                ) : (
                  'No sites match the selected filters.'
                )}
              </div>
            ) : (
              Object.entries(filteredGroupMap).map(([groupKey, groupSites]) => {
                const [stateId, localityId] = groupKey.split('|');
                const isUnassigned = stateId === 'unassigned';
                const recommended = isUnassigned ? null : getRecommendedCoordinator(stateId, localityId);
                const selectedId = assignmentMap[groupKey] || recommended?.id || '';
                
                // Separate forwarded and unforwarded sites
                const forwardedSites = groupSites.filter((site: any) => forwardedSiteIds.has(site.id));
                const unforwardedSites = groupSites.filter((site: any) => !forwardedSiteIds.has(site.id));
                const hasUnforwardedSites = unforwardedSites.length > 0;
                const hasForwardedSites = forwardedSites.length > 0;
                
                // Initialize selectedSites for this group if not set (only for unforwarded sites)
                if (!selectedSites[groupKey] && hasUnforwardedSites) {
                  setSelectedSites(s => ({ ...s, [groupKey]: new Set(unforwardedSites.map((site: any) => site.id)) }));
                }
                
                return (
                  <div key={groupKey} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center mb-3 font-medium cursor-pointer select-none" onClick={() => setExpandedGroups(g => ({ ...g, [groupKey]: !g[groupKey] }))}>
                      {expandedGroups[groupKey] ? <ChevronDown className="w-4 h-4 mr-2" /> : <ChevronRight className="w-4 h-4 mr-2" />}
                      {groupSites.length} site(s) in <span className="text-blue-700 ml-1">
                        {isUnassigned ? 'Unassigned Locations' : `${states.find(s => s.id === stateId)?.name || stateId}`}
                      </span>
                      {!isUnassigned && localityId && (
                        <span> / <span className="text-green-700">{localities.find(l => l.id === localityId)?.name || localityId}</span></span>
                      )}
                      {hasForwardedSites && (
                        <span className="ml-2 text-sm text-green-700 font-normal">
                          ({forwardedSites.length} forwarded, {unforwardedSites.length} available)
                        </span>
                      )}
                    </div>
                    {hasForwardedSites && !hasUnforwardedSites && (
                      <div className="mb-3 text-sm text-green-700 font-medium">
                        ✓ All sites in this group have been forwarded
                      </div>
                    )}
                    {hasUnforwardedSites && (
                      <>
                        <div className="mb-3 text-sm text-muted-foreground">
                          Recommended: {recommended ? `${recommended.fullName || recommended.name || recommended.email}` : 'None'}
                        </div>
                        <div className="flex flex-col gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <Select 
                              value={selectedId} 
                              onValueChange={val => setAssignmentMap(a => ({ ...a, [groupKey]: val }))}
                            >
                              <SelectTrigger className="max-w-md">
                                <SelectValue placeholder="Select coordinator..." />
                              </SelectTrigger>
                              <SelectContent>
                                {allCoordinators.map(c => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.fullName || c.name || c.email}
                                    {recommended?.id === c.id ? ' (Recommended)' : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select 
                              value={supervisorMap[groupKey] || ''} 
                              onValueChange={val => setSupervisorMap(s => ({ ...s, [groupKey]: val }))}
                            >
                              <SelectTrigger className="max-w-md">
                                <SelectValue placeholder="Select supervisor (optional - for notifications only)..." />
                              </SelectTrigger>
                              <SelectContent>
                                {allSupervisors.map(s => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.fullName || s.name || s.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleForwardBatch(groupKey)}
                            disabled={batchLoading[groupKey] || !assignmentMap[groupKey] || !(selectedSites[groupKey]?.size > 0)}
                            variant="default"
                          >
                            {batchLoading[groupKey]
                              ? 'Forwarding...'
                              : 'Forward Selected'}
                          </Button>
                        </div>
                      </>
                    )}
                    {expandedGroups[groupKey] && (
                      <div className="mt-3">
                        <div className="font-medium text-sm mb-2">Select sites to forward:</div>
                        <div className="max-h-40 overflow-y-auto border rounded p-3 bg-white">
                          <div className="space-y-2">
                            {/* Show unforwarded sites first */}
                            {unforwardedSites.map((site: any) => (
                              <div 
                                key={site.id} 
                                className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded"
                              >
                                <label className="flex items-center gap-2 cursor-pointer flex-1">
                                  <Checkbox
                                    checked={selectedSites[groupKey]?.has(site.id) || false}
                                    onCheckedChange={checked => {
                                      setSelectedSites(s => {
                                        const set = new Set(s[groupKey] || []);
                                        if (checked) set.add(site.id); else set.delete(site.id);
                                        return { ...s, [groupKey]: set };
                                      });
                                    }}
                                  />
                                  <span className="text-sm">{site.siteName || site.name || site.id}</span>
                                </label>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedSiteForView(site);
                                      setViewDialogOpen(true);
                                    }}
                                    title="View Details"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/site-visits/${site.id}/edit`);
                                    }}
                                    title="Edit"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {/* Show forwarded sites below, visually distinct */}
                            {forwardedSites.length > 0 && (
                              <>
                                {unforwardedSites.length > 0 && (
                                  <div className="border-t my-2 pt-2">
                                    <div className="text-xs text-muted-foreground mb-1 font-medium">Already Forwarded:</div>
                                  </div>
                                )}
                                {forwardedSites.map((site: any) => (
                                  <div 
                                    key={site.id} 
                                    className="flex items-center gap-2 p-1 rounded opacity-60"
                                  >
                                    <label className="flex items-center gap-2 cursor-not-allowed flex-1">
                                      <Checkbox
                                        checked={false}
                                        disabled={true}
                                      />
                                      <span className="text-sm">
                                        {site.siteName || site.name || site.id}
                                        <span className="ml-2 text-green-600 text-xs font-medium">✓ Forwarded</span>
                                      </span>
                                    </label>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedSiteForView(site);
                                          setViewDialogOpen(true);
                                        }}
                                        title="View Details"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/site-visits/${site.id}/edit`);
                                        }}
                                        title="Edit"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Site Detail View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Site Details</DialogTitle>
            <DialogDescription>
              View details for {selectedSiteForView?.siteName || selectedSiteForView?.name || 'site'}
            </DialogDescription>
          </DialogHeader>
          {selectedSiteForView && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Site Name</Label>
                  <p className="font-medium">{selectedSiteForView.siteName || selectedSiteForView.name || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Site Code</Label>
                  <p className="font-medium">{selectedSiteForView.siteCode || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">State</Label>
                  <p className="font-medium">{selectedSiteForView.state || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Locality</Label>
                  <p className="font-medium">{selectedSiteForView.locality || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Hub Office</Label>
                  <p className="font-medium">{selectedSiteForView.hubOffice || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">CP Name</Label>
                  <p className="font-medium">{selectedSiteForView.cpName || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Visit Type</Label>
                  <p className="font-medium">{selectedSiteForView.visitType || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Visit Date</Label>
                  <p className="font-medium">{selectedSiteForView.visitDate || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Main Activity</Label>
                  <p className="font-medium">{selectedSiteForView.mainActivity || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Activity at Site</Label>
                  <p className="font-medium">{selectedSiteForView.activityAtSite || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <p className="font-medium">{selectedSiteForView.status || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Monitoring By</Label>
                  <p className="font-medium">{selectedSiteForView.monitoringBy || 'N/A'}</p>
                </div>
              </div>
              {selectedSiteForView.comments && (
                <div>
                  <Label className="text-xs text-muted-foreground">Comments</Label>
                  <p className="text-sm mt-1">{selectedSiteForView.comments}</p>
                </div>
              )}
              {selectedSiteForView.verificationNotes && (
                <div>
                  <Label className="text-xs text-muted-foreground">Verification Notes</Label>
                  <p className="text-sm mt-1">{selectedSiteForView.verificationNotes}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setViewDialogOpen(false);
                    navigate(`/site-visits/${selectedSiteForView.id}/edit`);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Site
                </Button>
                <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReviewAssignCoordinators;