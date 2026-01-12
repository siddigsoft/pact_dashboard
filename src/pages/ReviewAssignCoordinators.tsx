import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight, ArrowLeft, Eye, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { StatePermitUpload } from '@/components/StatePermitUpload';
import {
  fetchHubs,
  fetchHubStates,
  fetchStates,
  fetchLocalities,
  fetchForwardedSiteEntries,
  forwardSitesToCoordinator,
  insertNotifications
} from '@/services/mmpActions';
import { EmailNotificationService } from '@/services/email-notification.service';
import { normalizeStateId, normalizeLocalityId } from '@/utils/siteNormalization';

const ReviewAssignCoordinators: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getMmpById, refreshMMPFiles, fetchSiteEntriesForMMP } = useMMP();
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
  const [statePermitSiteIds, setStatePermitSiteIds] = useState<Set<string>>(new Set());
  const [selectedSiteForView, setSelectedSiteForView] = useState<any>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // State permit attachment state - per group
  const [attachStatePermitMap, setAttachStatePermitMap] = useState<Record<string, boolean>>({});
  const [statePermitDialogOpen, setStatePermitDialogOpen] = useState(false);
  const [statePermitDialogGroup, setStatePermitDialogGroup] = useState<string>('');

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
  const [withStatePermitOnly, setWithStatePermitOnly] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    
    const loadData = async () => {
      try {
        // Step 1: Get MMP file
        const mmp = getMmpById(id);
        if (!mmp) {
          console.log('[ReviewAssignCoordinators] MMP not found in context, might still be loading');
          toast({
            title: "MMP Not Found",
            description: "The requested MMP file could not be found.",
            variant: "destructive"
          });
          setLoading(false);
          setLoadingForwardedStates(false);
          setLoadingLocations(false);
          navigate('/mmp');
          return;
        }

        // Step 1.5: Fetch site entries on demand (they're not loaded with initial MMP list for performance)
        let mmpWithEntries = mmp;
        if (!mmp.siteEntries || mmp.siteEntries.length === 0) {
          console.log('[ReviewAssignCoordinators] Site entries not loaded, fetching on demand...');
          try {
            const entries = await fetchSiteEntriesForMMP(id);
            mmpWithEntries = { ...mmp, siteEntries: entries };
            console.log(`[ReviewAssignCoordinators] Loaded ${entries.length} site entries`);
          } catch (err) {
            console.error('Failed to fetch site entries:', err);
            toast({
              title: "Warning",
              description: "Could not load site entries. Please refresh the page.",
              variant: "destructive"
            });
          }
        }

        setMmpFile(mmpWithEntries);
        
        // Step 2: Load forwarded sites from database BEFORE rendering
        // This prevents errors and ensures correct state from the start
        setLoadingForwardedStates(true);
        try {
          const siteEntries = await fetchForwardedSiteEntries(id);
          
          // Find sites that have been forwarded
          // Check both new forwarded_at column and legacy dispatched_at/additional_data
          const forwarded = new Set<string>();
          const statePermitIds = new Set<string>();
          siteEntries.forEach((entry: any) => {
            const hasForwardedAt = !!entry.forwarded_at;
            const hasDispatchedAt = !!entry.dispatched_at;
            const hasAssignedTo = !!(entry.additional_data?.assigned_to);
            const hasStatePermit = !!(entry.additional_data?.state_permit_attached);
            
            // Site is forwarded if any of these conditions are true
            if (hasForwardedAt || hasDispatchedAt || hasAssignedTo) {
              forwarded.add(entry.id);
            }
            if (hasStatePermit) {
              statePermitIds.add(entry.id);
            }
          });
          
          setForwardedSiteIds(forwarded);
          setStatePermitSiteIds(statePermitIds);
          console.log(`Loaded ${forwarded.size} forwarded site(s) out of ${siteEntries?.length || 0} total`);
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
          const [hubsData, hubStatesData, statesData, localitiesData] = await Promise.all([
            fetchHubs(),
            fetchHubStates(),
            fetchStates(),
            fetchLocalities()
          ]);
          
          setHubs(hubsData);
          setHubStates(hubStatesData);
          setStates(statesData);
          setLocalities(localitiesData);
          
          console.log(`Loaded ${hubsData.length} hubs, ${hubStatesData.length} hub-state relationships, ${statesData.length} states, ${localitiesData.length} localities`);
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
  }, [id, navigate, toast]);

  // Convert Set to sorted array for stable dependency comparison
  const forwardedSiteIdsArray = useMemo(() => {
    return Array.from(forwardedSiteIds).sort();
  }, [forwardedSiteIds]);

  // Create stable dependency values to prevent unnecessary re-runs
  const forwardedIdsKey = useMemo(() => {
    return forwardedSiteIdsArray.join(',');
  }, [forwardedSiteIdsArray]);
  const statesLength = states.length;
  const localitiesLength = localities.length;
  const mmpFileId = mmpFile?.id;
  const entriesLength = mmpFile?.siteEntries?.length || 0;

  // Track initialization to prevent unnecessary re-runs
  const initializationKeyRef = useRef<string>('');

  // Initialize selectedSites for groups that don't have selections yet
  // This must be in useEffect, not during render
  useEffect(() => {
    if (loading || loadingForwardedStates || loadingLocations || !mmpFile) return;
    
    // Compute entries from mmpFile (same as in render)
    const entries: any[] = Array.isArray(mmpFile?.siteEntries) && mmpFile.siteEntries.length > 0 
      ? mmpFile.siteEntries
      : [];
    
    if (!entries.length) return;
    
    // Create a stable key to track if we've already initialized for this exact state
    const initializationKey = `${mmpFileId}-${forwardedIdsKey}-${statesLength}-${localitiesLength}-${entriesLength}`;
    
    // Skip if we've already initialized for this exact state
    if (initializationKeyRef.current === initializationKey && Object.keys(selectedSites).length > 0) {
      return;
    }
    
    // Recompute groupMap using normalized state/locality IDs
    // This ensures variations like "River Nile", "River Nile State", "river nile" all map to the same group
    const groupMap: Record<string, any[]> = {};
    entries.forEach((e: any) => {
      const rawState = String(e.state || '').trim();
      const rawLocality = String(e.locality || '').trim();
      
      // Use comprehensive normalization that handles aliases
      const stateId = normalizeStateId(rawState);
      const localityId = stateId ? normalizeLocalityId(rawLocality, stateId) : null;
      
      // Create group key using normalized IDs
      const key = stateId ? `${stateId}|${localityId || ''}` : 'unassigned|unassigned';
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(e);
    });
    
    // Create a Set from the array for efficient lookups
    const forwardedSet = new Set(forwardedSiteIdsArray);
    
    // Use functional update to avoid stale closure issues
    setSelectedSites(prevSelectedSites => {
      const newSelectedSites: Record<string, Set<string>> = { ...prevSelectedSites };
      let hasChanges = false;
      
      Object.entries(groupMap).forEach(([groupKey, groupSites]) => {
        // Only initialize if not already set and has unforwarded sites
        if (!newSelectedSites[groupKey]) {
          const unforwardedSites = groupSites.filter((site: any) => !forwardedSet.has(site.id));
          if (unforwardedSites.length > 0) {
            newSelectedSites[groupKey] = new Set(unforwardedSites.map((site: any) => site.id));
            hasChanges = true;
          }
        }
      });
      
      // Only update if there are actual changes
      if (hasChanges) {
        initializationKeyRef.current = initializationKey;
        return newSelectedSites;
      }
      
      // Update key even if no changes to prevent re-running
      if (initializationKeyRef.current !== initializationKey) {
        initializationKeyRef.current = initializationKey;
      }
      
      return prevSelectedSites; // Return previous state if no changes
    });
    // Note: We intentionally don't include states/localities/mmpFile in deps
    // because we only want to re-run when the stable values change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forwardedIdsKey, statesLength, localitiesLength, entriesLength, loading, loadingForwardedStates, loadingLocations, mmpFileId]);

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

  // Create group map from entries using normalized state/locality IDs
  // This ensures variations like "River Nile", "River Nile State", "river nile" all map to the same group
  const groupMap: Record<string, any[]> = {};
  entries.forEach((e: any) => {
    const rawState = String(e.state || '').trim();
    const rawLocality = String(e.locality || '').trim();
    
    // Use comprehensive normalization that handles aliases
    const stateId = normalizeStateId(rawState);
    const localityId = stateId ? normalizeLocalityId(rawLocality, stateId) : null;
    
    // Create group key using normalized IDs
    const key = stateId ? `${stateId}|${localityId || ''}` : 'unassigned|unassigned';
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(e);
  });

  // Filter groups based on selected filters
  const filteredGroupMap = Object.entries(groupMap).reduce((acc, [groupKey, groupSites]) => {
    const [stateId, localityId] = groupKey.split('|');
    
    // If no filters selected, show all
    // Note: apply state-permit filter after basic filters
    if (!selectedHub && !selectedState && !selectedLocality) {
      let matchesAll = true;
      if (withStatePermitOnly) {
        const groupHasStatePermit = (attachStatePermitMap[groupKey] === true) || groupSites.some((s: any) => statePermitSiteIds.has(s.id));
        if (!groupHasStatePermit) matchesAll = false;
      }
      if (matchesAll) acc[groupKey] = groupSites;
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
    
    if (matches && withStatePermitOnly) {
      const groupHasStatePermit = (attachStatePermitMap[groupKey] === true) || groupSites.some((s: any) => statePermitSiteIds.has(s.id));
      if (!groupHasStatePermit) matches = false;
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
      const [stateId] = groupKey.split('|');
      if (!coordinatorId || siteIds.length === 0) {
        toast({ title: 'Select sites and coordinator', description: 'Please select at least one site and a coordinator.', variant: 'destructive' });
        setBatchLoading(b => ({ ...b, [groupKey]: false }));
        return;
      }

      // Use service helper to forward sites
      await forwardSitesToCoordinator({
        siteEntryIds: siteIds,
        coordinatorId,
        supervisorId,
        currentUserId: currentUser?.id,
        stateId,
        attachStatePermit: attachStatePermitMap[groupKey],
        mmpName: mmpFile?.name,
        mmpId
      });

      // Show success toast immediately after forwarding
      toast({ title: 'Batch Forwarded', description: `Sites were forwarded to ${allCoordinators.find(c => c.id === coordinatorId)?.fullName || 'Coordinator'}${attachStatePermitMap[groupKey] ? ' with state permit attached' : ''}${supervisorId ? ` and notified ${allSupervisors.find(s => s.id === supervisorId)?.fullName || 'Supervisor'}` : ''}.`, variant: 'default' });

      // Attempt to send notifications (don't fail the whole operation if this fails)
      try {
        const notifications: any[] = [
          {
            recipient_id: coordinatorId,
            title_en: 'Sites forwarded for CP verification',
            title_ar: 'تم إرسال المواقع للتحقق من CP',
            message_en: `${mmpFile?.name || 'MMP'}: ${siteIds.length} site(s) have been forwarded for your CP review${attachStatePermitMap[groupKey] ? ' (State permit attached)' : ''}`,
            message_ar: `${mmpFile?.name || 'خطة المراقبة الشهرية'}: تم إرسال ${siteIds.length} موقع(ات) لمراجعة CP الخاصة بك${attachStatePermitMap[groupKey] ? ' (تم إرفاق تصريح الولاية)' : ''}`,
            event_type: 'assignments',
            entity_id: mmpId,
            entity_type: 'mmpFile',
            action_url: `/coordinator/sites`,
            priority: 'normal',
            status: 'pending',
          }
        ];

        // Send notification to supervisor if selected
        if (supervisorId) {
          notifications.push({
            recipient_id: supervisorId,
            title_en: 'Sites assigned to coordinator for verification',
            title_ar: 'تم تعيين مواقع للمنسق للتحقق',
            message_en: `${mmpFile?.name || 'MMP'}: ${siteIds.length} site(s) have been assigned to ${allCoordinators.find(c => c.id === coordinatorId)?.fullName || 'Coordinator'} for CP verification${attachStatePermitMap[groupKey] ? ' (State permit attached)' : ''}`,
            message_ar: `${mmpFile?.name || 'خطة المراقبة الشهرية'}: تم تعيين ${siteIds.length} موقع(ات) إلى ${allCoordinators.find(c => c.id === coordinatorId)?.fullName || 'المنسق'} للتحقق من CP${attachStatePermitMap[groupKey] ? ' (تم إرفاق تصريح الولاية)' : ''}`,
            event_type: 'assignments',
            entity_id: mmpId,
            entity_type: 'mmpFile',
            action_url: `/supervisor/sites`,
            priority: 'normal',
            status: 'pending',
          });
        }

        await insertNotifications(notifications);
      } catch (notifErr) {
        console.warn('Failed to send notifications:', notifErr);
        // Optionally, you could show a separate toast for notification failure here if needed
      }

      // Send email notification to coordinator
      try {
        const coordinator = allCoordinators.find(c => c.id === coordinatorId);
        if (coordinator?.email) {
          // Get site names from the site entries
          const allSiteEntries = mmpFile?.siteEntries || [];
          const siteNames = allSiteEntries
            .filter((site: any) => siteIds.includes(site.id))
            .map((site: any) => site.siteName || site.siteCode || `Site ${site.id}`);
          
          // Get location info
          const stateName = states.find(s => s.id === stateId)?.name || '';
          const [_, localityId] = groupKey.split('|');
          const localityName = localityId && localityId !== 'unassigned' ? localities.find(l => l.id === localityId)?.name : '';
          const locationInfo = `${stateName}${localityName ? ` - ${localityName}` : ''}`;
          
          // Get forwarder name
          const forwarderName = currentUser?.fullName || currentUser?.name || currentUser?.email || 'Field Operations Manager';
          
          console.log(`[EMAIL] Sending sites forwarded email to coordinator: ${coordinator.email}`);
          const emailResult = await EmailNotificationService.sendSitesForwardedToCoordinator(
            coordinator.email,
            coordinator.fullName || coordinator.name || 'Coordinator',
            siteNames.length > 0 ? siteNames : [`${siteIds.length} site(s)`],
            mmpFile?.name || 'MMP',
            forwarderName,
            locationInfo,
            mmpId
          );
          
          if (emailResult.success) {
            console.log(`[EMAIL] Successfully sent to coordinator: ${coordinator.email}`);
          } else {
            console.error(`[EMAIL] Failed to send to coordinator ${coordinator.email}:`, emailResult.error);
          }
        }
      } catch (emailErr) {
        console.error('Failed to send email notification to coordinator:', emailErr);
        // Don't fail the whole operation if email fails
      }

      // Send email notification to supervisor if selected
      if (supervisorId) {
        try {
          const supervisor = allSupervisors.find(s => s.id === supervisorId);
          if (supervisor?.email) {
            // Get site names from the site entries
            const allSiteEntries = mmpFile?.siteEntries || [];
            const siteNames = allSiteEntries
              .filter((site: any) => siteIds.includes(site.id))
              .map((site: any) => site.siteName || site.siteCode || `Site ${site.id}`);
            
            // Get coordinator name
            const coordinatorName = allCoordinators.find(c => c.id === coordinatorId)?.fullName || 
                                   allCoordinators.find(c => c.id === coordinatorId)?.name || 
                                   'Coordinator';
            
            // Get location info
            const stateName = states.find(s => s.id === stateId)?.name || '';
            const [_, localityId] = groupKey.split('|');
            const localityName = localityId && localityId !== 'unassigned' ? localities.find(l => l.id === localityId)?.name : '';
            const locationInfo = `${stateName}${localityName ? ` - ${localityName}` : ''}`;
            
            // Get forwarder name
            const forwarderName = currentUser?.fullName || currentUser?.name || currentUser?.email || 'Field Operations Manager';
            
            const titleEn = `Sites Assigned to Coordinator for Verification`;
            const titleAr = `تم تعيين مواقع للمنسق للتحقق`;
            
            const messageEn = `${mmpFile?.name || 'MMP'}: ${siteIds.length} site(s) have been assigned to ${coordinatorName} for CP verification${attachStatePermitMap[groupKey] ? ' (State permit attached)' : ''}. Location: ${locationInfo}`;
            const messageAr = `${mmpFile?.name || 'خطة المراقبة الشهرية'}: تم تعيين ${siteIds.length} موقع(ات) إلى ${coordinatorName} للتحقق من CP${attachStatePermitMap[groupKey] ? ' (تم إرفاق تصريح الولاية)' : ''}. الموقع: ${locationInfo}`;
            
            console.log(`[EMAIL] Sending sites assigned notification email to supervisor: ${supervisor.email}`);
            const emailResult = await EmailNotificationService.sendNotification(
              supervisor.email,
              supervisor.fullName || supervisor.name || 'Supervisor',
              {
                title: titleEn,
                titleAr: titleAr,
                message: messageEn,
                messageAr: messageAr,
                type: 'info',
                actionUrl: `/supervisor/sites`,
                actionLabel: 'View Sites',
                details: [
                  { label: 'MMP', value: mmpFile?.name || 'MMP' },
                  { label: 'Sites', value: `${siteIds.length} site(s)` },
                  { label: 'Coordinator', value: coordinatorName },
                  { label: 'Location', value: locationInfo },
                  { label: 'Assigned By', value: forwarderName }
                ],
                recipientRole: { en: 'Supervisor', ar: 'المشرف' }
              }
            );
            
            if (emailResult.success) {
              console.log(`[EMAIL] Successfully sent to supervisor: ${supervisor.email}`);
            } else {
              console.error(`[EMAIL] Failed to send to supervisor ${supervisor.email}:`, emailResult.error);
            }
          }
        } catch (emailErr) {
          console.error('Failed to send email notification to supervisor:', emailErr);
          // Don't fail the whole operation if email fails
        }
      }
      
      // Removed: await refreshMMPFiles(); // To prevent page reload on hosted app

      // Batch all state updates together to prevent multiple re-renders
      // Use functional updates to ensure we're working with the latest state
      setForwardedSiteIds(prev => {
        const newForwarded = new Set(prev);
        siteIds.forEach(id => newForwarded.add(id));
        return newForwarded;
      });
      
      // Batch these updates together - React 18 will automatically batch them
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
          onClick={() => navigate('/mmp')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to MMP Management
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
                    setWithStatePermitOnly(false);
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

          {/* Filter chips */}
          <div className="mb-4 flex items-center gap-2">
            <Button
              variant={withStatePermitOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setWithStatePermitOnly(prev => !prev)}
              className={withStatePermitOnly ? 'bg-blue-600 text-white' : ''}
            >
              Federal Permit Attached
            </Button>
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
                const selectedId = assignmentMap[groupKey] || '';  // Removed: recommended?.id || ''
                
                // Separate forwarded and unforwarded sites
                const forwardedSites = groupSites.filter((site: any) => forwardedSiteIds.has(site.id));
                const unforwardedSites = groupSites.filter((site: any) => !forwardedSiteIds.has(site.id));
                const hasUnforwardedSites = unforwardedSites.length > 0;
                const hasForwardedSites = forwardedSites.length > 0;
                
                return (
                  <div key={groupKey} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center mb-3 font-medium cursor-pointer select-none" onClick={() => setExpandedGroups(g => ({ ...g, [groupKey]: !g[groupKey] }))}>
                      {expandedGroups[groupKey] ? <ChevronDown className="w-4 h-4 mr-2" /> : <ChevronRight className="w-4 h-4 mr-2" />}
                      {groupSites.length} site(s) in <span className="text-blue-700 ml-1">
                        {isUnassigned ? 'Unassigned State' : `${states.find(s => s.id === stateId)?.name || stateId}`}
                      </span>
                      {!isUnassigned && (
                        <span className="text-muted-foreground mx-1">/</span>
                      )}
                      {!isUnassigned && (
                        <span className={localityId ? "text-green-700" : "text-orange-500 italic"}>
                          {localityId ? (localities.find(l => l.id === localityId)?.name || localityId) : 'No locality'}
                        </span>
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
                          Recommended: {recommended ? (
                            <span className="text-green-700 font-medium">{recommended.fullName || recommended.name || recommended.email}</span>
                          ) : (
                            <span className="text-orange-500 italic">No coordinator assigned to this state</span>
                          )}
                        </div>
                        <div className="flex flex-col gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <Select 
                              value={selectedId} 
                              onValueChange={val => {
                                setAssignmentMap(a => ({ ...a, [groupKey]: val }));
                                // Auto-select supervisor for the hub that has the coordinator's state
                                const coord = allCoordinators.find(c => c.id === val);
                                if (coord) {
                                  const hubForState = hubStates.find(hs => hs.state_id === coord.stateId);
                                  if (hubForState) {
                                    const supervisorForHub = allSupervisors.find(s => s.hubId === hubForState.hub_id);
                                    if (supervisorForHub) {
                                      setSupervisorMap(s => ({ ...s, [groupKey]: supervisorForHub.id }));
                                    }
                                  }
                                }
                              }}
                            >
                              <SelectTrigger className="max-w-md">
                                <SelectValue placeholder="Select coordinator..." />
                              </SelectTrigger>
                              <SelectContent>
                                {/* Filter coordinators to only those in the same state as the group */}
                                {allCoordinators.filter(c => c.stateId === stateId).map(c => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.fullName || c.name || c.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {/* Filter supervisors by the hub that contains the group's state */}
                            {(() => {
                              const hubForGroupState = hubStates.find(hs => hs.state_id === stateId);
                              const hubId = hubForGroupState?.hub_id;
                              return (
                                <Select 
                                  value={supervisorMap[groupKey] || ''} 
                                  onValueChange={val => setSupervisorMap(s => ({ ...s, [groupKey]: val }))}
                                >
                                  <SelectTrigger className="max-w-md">
                                    <SelectValue placeholder="Select supervisor (optional - for notifications only)..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allSupervisors.filter(s => s.hubId === hubId).map(s => (
                                      <SelectItem key={s.id} value={s.id}>
                                        {s.fullName || s.name || s.email}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            })()}
                          </div>
                          
                          {/* State Permit Attachment Option */}
                          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <Checkbox
                              id={`attach-state-permit-${groupKey}`}
                              checked={attachStatePermitMap[groupKey] || false}
                              onCheckedChange={(checked) => setAttachStatePermitMap(prev => ({ ...prev, [groupKey]: checked as boolean }))}
                            />
                            <div className="flex-1">
                              <Label 
                                htmlFor={`attach-state-permit-${groupKey}`}
                                className="text-sm font-medium text-blue-900 cursor-pointer"
                              >
                                Attach State Permit
                              </Label>
                              <p className="text-xs text-blue-700 mt-1">
                                Upload a state permit for {isUnassigned ? 'unassigned sites' : (states.find(s => s.id === stateId)?.name || stateId)} before forwarding sites to coordinators
                              </p>
                            </div>
                            {attachStatePermitMap[groupKey] && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setStatePermitDialogGroup(groupKey);
                                  setStatePermitDialogOpen(true);
                                }}
                                className="border-blue-300 text-blue-700 hover:bg-blue-100"
                              >
                                Upload Permit
                              </Button>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleForwardBatch(groupKey)}
                            disabled={batchLoading[groupKey] || !assignmentMap[groupKey] || !(selectedSites[groupKey]?.size > 0)}
                            variant="default"
                          >
                            {batchLoading[groupKey]
                              ? 'Forwarding...'
                              : attachStatePermitMap[groupKey] 
                                ? 'Forward with State Permit'
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

      {/* State Permit Upload Dialog */}
      <Dialog open={statePermitDialogOpen} onOpenChange={setStatePermitDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload State Permit</DialogTitle>
            <DialogDescription>
              Upload a state permit that will be attached to the MMP file before forwarding sites to coordinators.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-96 overflow-y-auto">
            <StatePermitUpload
              state={states.find(s => s.id === statePermitDialogGroup.split('|')[0])?.name || 'Unknown State'}
              mmpFileId={mmpFile?.id}
              userType="fom"
              onPermitUploaded={() => {
                setStatePermitDialogOpen(false);
                setStatePermitDialogGroup('');
                toast({
                  title: "State permit uploaded",
                  description: "The state permit has been uploaded and will be attached when forwarding sites.",
                });
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setStatePermitDialogOpen(false);
              setStatePermitDialogGroup('');
            }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReviewAssignCoordinators;