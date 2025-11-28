import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, DollarSign, AlertCircle, ArrowRight, ArrowLeft, Copy, Users, MapPin } from 'lucide-react';
import { sudanStates } from '@/data/sudanStates';
import { fetchAllRegistrySites, matchSiteToRegistry, RegistryLinkage } from '@/utils/sitesRegistryMatcher';

interface DispatchSitesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteEntries: any[];
  dispatchType: 'state' | 'locality' | 'individual';
  onDispatched?: () => void;
}

interface DataCollector {
  id: string;
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
  hub_id?: string | null;
  state_id?: string | null;
  locality_id?: string | null;
}

interface SiteCosts {
  siteId: string;
  siteName: string;
  transportation: number;
  accommodation: number;
  mealAllowance: number;
  otherCosts: number;
  calculationNotes: string;
}

export const DispatchSitesDialog: React.FC<DispatchSitesDialogProps> = ({
  open,
  onOpenChange,
  siteEntries,
  dispatchType,
  onDispatched
}) => {
  const [step, setStep] = useState<'select' | 'costs'>('select');
  const [loading, setLoading] = useState(false);
  const [collectors, setCollectors] = useState<DataCollector[]>([]);
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedLocality, setSelectedLocality] = useState<string>('');
  const [selectedCollector, setSelectedCollector] = useState<string>('');
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [siteCosts, setSiteCosts] = useState<Map<string, SiteCosts>>(new Map());
  const [search, setSearch] = useState('');
  const [bulkCost, setBulkCost] = useState({
    transportation: 0,
    accommodation: 0,
    mealAllowance: 0,
    otherCosts: 0,
    calculationNotes: ''
  });
  const { toast } = useToast();

  // Load data collectors
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadCollectors = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, username, email, hub_id, state_id, locality_id')
          .or('role.eq.dataCollector,role.eq.datacollector')
          .order('full_name', { ascending: true});

        if (!cancelled) {
          if (error) {
            console.error('Failed to load data collectors', error);
            setCollectors([]);
          } else {
            setCollectors(data as any[] as DataCollector[]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading collectors:', err);
          setCollectors([]);
        }
      }
    };
    loadCollectors();
    return () => { cancelled = true; };
  }, [open]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep('select');
      setSelectedSites(new Set());
      setSiteCosts(new Map());
      setSelectedState('');
      setSelectedLocality('');
      setSelectedCollector('');
      setSearch('');
      setBulkCost({
        transportation: 0,
        accommodation: 0,
        mealAllowance: 0,
        otherCosts: 0,
        calculationNotes: ''
      });
    }
  }, [open]);

  // Get unique states and localities from site entries
  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    siteEntries.forEach(entry => {
      const state = entry.state || entry.state_name;
      if (state && state.trim() !== '') {
        states.add(state.trim());
      }
    });
    return Array.from(states).filter(s => s && s.trim() !== '').sort();
  }, [siteEntries]);

  const uniqueLocalities = useMemo(() => {
    const localities = new Set<string>();
    siteEntries.forEach(entry => {
      const locality = entry.locality || entry.locality_name;
      if (locality && locality.trim() !== '' && (!selectedState || entry.state === selectedState)) {
        localities.add(locality.trim());
      }
    });
    return Array.from(localities).filter(loc => loc && loc.trim() !== '').sort();
  }, [siteEntries, selectedState]);

  // Filter collectors based on dispatch type
  const filteredCollectors = useMemo(() => {
    let filtered = collectors;
    
    if (dispatchType === 'state' && selectedState) {
      // Convert state name to state ID for matching
      const stateId = sudanStates.find(s => s.name.toLowerCase() === selectedState.toLowerCase())?.id;
      if (stateId) {
        filtered = filtered.filter(c => c.state_id === stateId);
      } else {
        // Fallback: try direct match in case selectedState is already an ID
        filtered = filtered.filter(c => c.state_id === selectedState);
      }
    } else if (dispatchType === 'locality' && selectedLocality) {
      // Convert locality name to locality ID for matching
      // Need to find the state first to get the correct locality
      let localityId: string | undefined;
      for (const state of sudanStates) {
        const locality = state.localities.find(l => l.name.toLowerCase() === selectedLocality.toLowerCase());
        if (locality) {
          localityId = locality.id;
          break;
        }
      }
      if (localityId) {
        filtered = filtered.filter(c => c.locality_id === localityId);
      } else {
        // Fallback: try direct match in case selectedLocality is already an ID
        filtered = filtered.filter(c => c.locality_id === selectedLocality);
      }
    }
    
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(c =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.username || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      );
    }
    
    return filtered;
  }, [collectors, dispatchType, selectedState, selectedLocality, search]);

  // Filter site entries based on selection
  const filteredSiteEntries = useMemo(() => {
    if (dispatchType === 'state' && selectedState) {
      return siteEntries.filter(entry => {
        const state = entry.state || entry.state_name;
        return state && state.trim() === selectedState;
      });
    } else if (dispatchType === 'locality' && selectedLocality) {
      return siteEntries.filter(entry => {
        const locality = entry.locality || entry.locality_name;
        return locality && locality.trim() === selectedLocality;
      });
    }
    return siteEntries;
  }, [siteEntries, dispatchType, selectedState, selectedLocality]);

  // Select all sites
  const handleSelectAll = () => {
    if (selectedSites.size === filteredSiteEntries.length) {
      setSelectedSites(new Set());
    } else {
      setSelectedSites(new Set(filteredSiteEntries.map(s => s.id)));
    }
  };

  const toggleSite = (id: string) => {
    setSelectedSites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleProceedToCosts = () => {
    if (selectedSites.size === 0) {
      toast({
        title: 'No sites selected',
        description: 'Please select at least one site to dispatch.',
        variant: 'destructive'
      });
      return;
    }

    if (dispatchType === 'individual' && !selectedCollector) {
      toast({
        title: 'No collector selected',
        description: 'Please select a data collector.',
        variant: 'destructive'
      });
      return;
    }

    if (dispatchType === 'state' && !selectedState) {
      toast({
        title: 'No state selected',
        description: 'Please select a state.',
        variant: 'destructive'
      });
      return;
    }

    if (dispatchType === 'locality' && !selectedLocality) {
      toast({
        title: 'No locality selected',
        description: 'Please select a locality.',
        variant: 'destructive'
      });
      return;
    }

    // Initialize cost data for selected sites if not already set
    const newCosts = new Map(siteCosts);
    const selectedSiteObjects = filteredSiteEntries.filter(s => selectedSites.has(s.id));
    
    selectedSiteObjects.forEach(site => {
      if (!newCosts.has(site.id)) {
        const additionalData = site.additional_data || {};
        newCosts.set(site.id, {
          siteId: site.id,
          siteName: site.site_name || site.siteName || 'Unknown Site',
          transportation: additionalData.transport_fee || 0,
          accommodation: 0,
          mealAllowance: 0,
          otherCosts: 0,
          calculationNotes: '',
        });
      }
    });

    setSiteCosts(newCosts);
    setStep('costs');
  };

  const updateSiteCost = (siteId: string, field: keyof SiteCosts, value: any) => {
    setSiteCosts(prev => {
      const newCosts = new Map(prev);
      const existingCost = newCosts.get(siteId);
      if (existingCost) {
        newCosts.set(siteId, { ...existingCost, [field]: value });
      }
      return newCosts;
    });
  };

  const applyBulkCostToAll = () => {
    if (bulkCost.transportation <= 0) {
      toast({
        title: 'Transportation cost required',
        description: 'Please enter a transportation cost before applying to all sites.',
        variant: 'destructive'
      });
      return;
    }

    setSiteCosts(prev => {
      const newCosts = new Map(prev);
      Array.from(selectedSites).forEach(siteId => {
        const existingCost = newCosts.get(siteId);
        if (existingCost) {
          newCosts.set(siteId, {
            ...existingCost,
            transportation: bulkCost.transportation,
            accommodation: bulkCost.accommodation,
            mealAllowance: bulkCost.mealAllowance,
            otherCosts: bulkCost.otherCosts,
            calculationNotes: bulkCost.calculationNotes || existingCost.calculationNotes
          });
        }
      });
      return newCosts;
    });

    toast({
      title: 'Costs applied',
      description: `Applied uniform costs to ${selectedSites.size} site(s).`,
      variant: 'default'
    });
  };

  const handleDispatch = async () => {
    console.log('🚀 Starting dispatch process...');
    console.log('📍 Dispatch type:', dispatchType);
    console.log('📍 Selected sites count:', selectedSites.size);
    console.log('📍 Filtered site entries:', filteredSiteEntries.length);
    
    // Validate that all selected sites have transportation costs entered
    const selectedSiteObjects = filteredSiteEntries.filter(s => selectedSites.has(s.id));
    console.log('📍 Selected site objects:', selectedSiteObjects.length);
    
    const missingTransportation = selectedSiteObjects.filter(site => {
      const costs = siteCosts.get(site.id);
      return !costs || costs.transportation <= 0;
    });

    if (missingTransportation.length > 0) {
      console.warn('❌ Missing transportation costs for:', missingTransportation.map(s => s.site_name || s.siteName));
      toast({
        title: 'Missing Transportation Costs',
        description: `Transportation cost is required for all sites. ${missingTransportation.length} site(s) missing transportation costs.`,
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const targetCollectors = dispatchType === 'individual' 
        ? [selectedCollector]
        : filteredCollectors.map(c => c.id);

      // For individual dispatch, we need a specific collector
      if (dispatchType === 'individual' && targetCollectors.length === 0) {
        toast({
          title: 'No collector selected',
          description: 'Please select a data collector to assign the sites to.',
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }
      
      // For state/locality dispatch, we can proceed even without collectors
      // Sites will be available for claiming when collectors are added later
      const noCollectorsWarning = (dispatchType === 'state' || dispatchType === 'locality') && targetCollectors.length === 0;

      // Get current user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const assignedBy = authUser?.id;

      // Step 0: Fetch Sites Registry to get GPS coordinates
      console.log('📍 Fetching Sites Registry for GPS coordinates...');
      const registrySites = await fetchAllRegistrySites();
      console.log(`📍 Found ${registrySites.length} sites in registry`);

      // Step 1: Store TRANSPORT costs only in mmp_site_entries
      // IMPORTANT: Enumerator fee is NOT set at dispatch - it's calculated at claim time
      // based on the claiming data collector's classification level (A, B, or C)
      for (const siteEntry of selectedSiteObjects) {
        const costs = siteCosts.get(siteEntry.id);
        if (costs) {
          // Transport budget = transportation + accommodation + meal per diem + other logistics
          const transportBudget = costs.transportation + costs.accommodation + costs.mealAllowance + costs.otherCosts;
          
          // Look up GPS coordinates from Sites Registry with enhanced matching
          // Only update registry_linkage if a match is found; preserve existing data if no match
          const existingRegistryLinkage = siteEntry.additional_data?.registry_linkage || null;
          const existingRegistryGps = siteEntry.additional_data?.registry_gps || null;
          
          const registryMatch = matchSiteToRegistry(
            {
              id: siteEntry.id,
              siteCode: siteEntry.site_code,
              siteName: siteEntry.site_name || siteEntry.siteName,
              state: siteEntry.state || siteEntry.state_name,
              locality: siteEntry.locality || siteEntry.locality_name,
            },
            registrySites,
            {
              userId: assignedBy || 'system',
              sourceWorkflow: 'dispatch',
            }
          );
          
          // Build enhanced registry_linkage - update if auto-accepted, otherwise preserve existing
          let registryLinkage: RegistryLinkage | null = existingRegistryLinkage;
          let registryGps: any = existingRegistryGps;
          
          if (registryMatch.autoAccepted && registryMatch.matchedRegistry) {
            // Auto-accepted match (>90% confidence) - update both structures
            registryLinkage = registryMatch.registryLinkage;
            registryGps = {
              latitude: registryMatch.gpsCoordinates?.latitude || null,
              longitude: registryMatch.gpsCoordinates?.longitude || null,
              accuracy_meters: registryMatch.gpsCoordinates?.accuracy_meters,
              source: 'sites_registry',
              site_id: registryMatch.matchedRegistry.id,
              site_code: registryMatch.matchedRegistry.site_code,
              match_type: registryMatch.matchType,
              match_confidence: registryMatch.matchConfidence,
              matched_at: registryMatch.registryLinkage.audit.matched_at,
            };
          } else if (registryMatch.requiresReview && !existingRegistryLinkage) {
            // New match requiring review - store for later manual selection
            registryLinkage = registryMatch.registryLinkage;
          }
          
          // Update mmp_site_entries with transport costs only (enumerator_fee remains null)
          const { error: costError } = await supabase
            .from('mmp_site_entries')
            .update({
              transport_fee: transportBudget,
              // NOTE: enumerator_fee is NOT set here - it will be calculated at claim time
              // based on the collector's classification (Level A, B, or C)
              additional_data: {
                ...(siteEntry.additional_data || {}),
                ...(registryLinkage ? { registry_linkage: registryLinkage } : {}),
                ...(registryGps ? { registry_gps: registryGps } : {}),
                dispatch_costs: {
                  transportation_cost: costs.transportation,
                  accommodation_cost: costs.accommodation,
                  meal_per_diem: costs.mealAllowance,
                  other_logistics: costs.otherCosts,
                  transport_budget_total: transportBudget,
                  enumerator_fee_status: 'pending_claim',
                  cost_status: 'transport_only',
                  calculated_by: assignedBy,
                  calculated_at: new Date().toISOString(),
                  calculation_notes: costs.calculationNotes || `Transport budget set at dispatch. Enumerator fee will be calculated at claim time based on collector classification.`,
                }
              }
            })
            .eq('id', siteEntry.id);

          if (costError) {
            console.error('Failed to save cost record:', costError);
            toast({
              title: 'Cost Save Failed',
              description: `Failed to save costs for ${costs.siteName}. Please try again.`,
              variant: 'destructive'
            });
            setLoading(false);
            return;
          }
        }
      }

      // Step 2: Prepare notifications for collectors AND all team members in same state/locality
      const notificationRows: any[] = [];
      
      // Get all team members (coordinators, supervisors, admins) in the same state/locality
      const siteStates = new Set<string>();
      const siteLocalities = new Set<string>();
      
      selectedSiteObjects.forEach(entry => {
        const state = entry.state || entry.state_name;
        const locality = entry.locality || entry.locality_name;
        if (state) siteStates.add(state.trim());
        if (locality) siteLocalities.add(locality.trim());
      });

      // Convert state/locality names to IDs for matching
      const stateIds = new Set<string>();
      const localityIds = new Set<string>();
      
      for (const stateName of siteStates) {
        const stateData = sudanStates.find(s => s.name.toLowerCase() === stateName.toLowerCase());
        if (stateData) {
          stateIds.add(stateData.id);
          // Also get locality IDs for this state
          for (const localityName of siteLocalities) {
            const localityData = stateData.localities.find(l => l.name.toLowerCase() === localityName.toLowerCase());
            if (localityData) {
              localityIds.add(localityData.id);
            }
          }
        }
      }

      // Fetch all team members in the same state/locality (coordinators, supervisors, admins, enumerators)
      let teamMembersQuery = supabase
        .from('profiles')
        .select('id, full_name, role, state_id, locality_id')
        .in('role', ['coordinator', 'supervisor', 'admin', 'enumerator', 'dataCollector', 'datacollector']);
      
      // Filter by state or locality if we have them
      if (stateIds.size > 0) {
        teamMembersQuery = teamMembersQuery.in('state_id', Array.from(stateIds));
      }
      
      const { data: teamMembers } = await teamMembersQuery;
      const allTeamMemberIds = new Set<string>(teamMembers?.map(m => m.id) || []);
      
      // Add target collectors to the set
      targetCollectors.forEach(id => allTeamMemberIds.add(id));

      for (const siteEntry of selectedSiteObjects) {
        const costs = siteCosts.get(siteEntry.id);
        // Transport budget only - enumerator fee is calculated at claim time
        const transportBudget = costs 
          ? costs.transportation + costs.accommodation + costs.mealAllowance + costs.otherCosts
          : 0;
        
        const siteName = costs?.siteName || siteEntry.site_name || 'Unknown';
        const siteState = siteEntry.state || siteEntry.state_name || '';
        const siteLocality = siteEntry.locality || siteEntry.locality_name || '';

        // Notify all team members in the same region
        for (const memberId of allTeamMemberIds) {
          const isDirectAssignment = dispatchType === 'individual' && targetCollectors.includes(memberId);
          
          notificationRows.push({
            user_id: memberId,
            title: isDirectAssignment ? 'Site Visit Assigned to You' : 'New Site Dispatched in Your Area',
            message: isDirectAssignment 
              ? `Site "${siteName}" has been assigned to you. Transport Budget: ${transportBudget} SDG. Your fee will be calculated based on your classification when you claim.`
              : `Site "${siteName}" in ${siteLocality ? siteLocality + ', ' : ''}${siteState} has been dispatched. Transport Budget: ${transportBudget} SDG`,
            type: isDirectAssignment ? 'info' : 'success',
            link: `/mmp?entry=${siteEntry.id}`,
            related_entity_id: siteEntry.id,
            related_entity_type: 'mmpFile'
          });
        }
      }

      // Send notifications (deduplicate by user_id + related_entity_id to avoid duplicate notifications)
      const uniqueNotifications = new Map<string, any>();
      for (const notif of notificationRows) {
        const key = `${notif.user_id}-${notif.related_entity_id}`;
        if (!uniqueNotifications.has(key)) {
          uniqueNotifications.set(key, notif);
        }
      }
      
      const finalNotifications = Array.from(uniqueNotifications.values());
      if (finalNotifications.length > 0) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert(finalNotifications);

        if (notifError) {
          console.error('Error creating notifications:', notifError);
        }
      }

      // Step 3: Mark site entries as dispatched
      console.log('📍 Step 3: Marking site entries as dispatched...');
      const dispatchedAt = new Date().toISOString();
      const currentUserProfile = authUser ? await supabase
        .from('profiles')
        .select('full_name, username, email')
        .eq('id', authUser.id)
        .single() : null;
      
      const dispatchedBy = currentUserProfile?.data?.full_name || 
                          currentUserProfile?.data?.username || 
                          currentUserProfile?.data?.email || 
                          'System';
      
      console.log('📍 Dispatched by:', dispatchedBy);
      console.log('📍 Processing', selectedSites.size, 'entries...');
      
      let successCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      
      // Update each entry individually to set status and new columns
      for (const entryId of Array.from(selectedSites)) {
        // Get current entry to check status and preserve additional_data
        const { data: currentEntry, error: fetchError } = await supabase
          .from('mmp_site_entries')
          .select('status, additional_data, site_name')
          .eq('id', entryId)
          .single();
        
        if (fetchError) {
          console.error(`❌ Error fetching entry ${entryId}:`, fetchError);
          errorCount++;
          continue;
        }
        
        console.log(`📍 Entry ${entryId}: status="${currentEntry?.status}", site="${currentEntry?.site_name}"`);
        
        // Only dispatch sites that are in "Approved and Costed" status
        const currentStatus = currentEntry?.status?.toLowerCase() || '';
        if (currentStatus !== 'approved and costed') {
          console.warn(`⚠️ Skipping entry ${entryId} with status "${currentEntry?.status}" - only "Approved and Costed" sites can be dispatched`);
          skippedCount++;
          continue;
        }
        
        const additionalData = currentEntry?.additional_data || {};
        additionalData.dispatched_at = dispatchedAt;
        additionalData.dispatched_by = dispatchedBy;
        additionalData.dispatched_from_status = currentEntry?.status; // Track previous status
        
        // Set different status based on dispatch type
        // - "Dispatched" for state/locality bulk dispatch (available sites - can be claimed by any collector in the area)
        // - "Assigned" for individual dispatch (smart assigned - directly assigned to specific collector)
        const newStatus = dispatchType === 'individual' ? 'Assigned' : 'Dispatched';
        
        const updateData: any = {
          status: newStatus,
          dispatched_at: dispatchedAt,
          dispatched_by: dispatchedBy,
          additional_data: additionalData // Keep for backward compatibility
        };
        
        // For individual dispatch, assign directly to the specific collector
        if (dispatchType === 'individual' && selectedCollector) {
          updateData.accepted_by = selectedCollector;
          updateData.accepted_at = dispatchedAt;
          additionalData.assigned_to = selectedCollector;
          additionalData.assigned_at = dispatchedAt;
          additionalData.assigned_by = dispatchedBy;
          updateData.additional_data = additionalData;
        }
        // For bulk dispatch (state/locality), accepted_by remains null until collector claims it
        
        const { error: entryUpdateError } = await supabase
          .from('mmp_site_entries')
          .update(updateData)
          .eq('id', entryId);
        
        if (entryUpdateError) {
          console.error(`❌ Error updating site entry ${entryId}:`, entryUpdateError);
          errorCount++;
        } else {
          console.log(`✅ Successfully dispatched entry ${entryId}`);
          successCount++;
        }
      }

      console.log(`📊 Dispatch summary: ${successCount} success, ${skippedCount} skipped, ${errorCount} errors`);
      
      if (successCount === 0 && skippedCount > 0) {
        toast({
          title: 'No Sites Dispatched',
          description: `${skippedCount} site(s) were skipped because they are not in "Approved and Costed" status.`,
          variant: 'destructive'
        });
        return;
      }
      
      if (errorCount > 0) {
        toast({
          title: 'Partial Dispatch',
          description: `Dispatched ${successCount} site(s), but ${errorCount} failed. Check console for details.`,
          variant: 'destructive'
        });
      } else if (noCollectorsWarning) {
        toast({
          title: 'Sites Dispatched - No Collectors Yet',
          description: `Successfully dispatched ${successCount} site(s). No data collectors are currently registered in this ${dispatchType === 'state' ? 'state' : 'locality'}. Sites will be available for claiming when collectors are added.`,
          variant: 'default'
        });
      } else {
        toast({
          title: 'Sites Dispatched',
          description: `Successfully dispatched ${successCount} site(s) with calculated costs to ${targetCollectors.length} data collector(s).${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`,
          variant: 'default'
        });
      }

      onDispatched?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error dispatching sites:', error);
      toast({
        title: 'Dispatch Failed',
        description: error.message || 'Failed to dispatch sites. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-dispatch-sites">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'select' && `Dispatch Sites ${dispatchType === 'state' ? 'by State' : dispatchType === 'locality' ? 'by Locality' : 'to Data Collector'}`}
            {step === 'costs' && (
              <>
                <DollarSign className="h-5 w-5 text-primary" />
                Calculate Costs Before Dispatch
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && (
              <>
                {dispatchType === 'state' && 'Select a state to dispatch sites to all data collectors in that state.'}
                {dispatchType === 'locality' && 'Select a locality to dispatch sites. All data collectors in that locality will see these sites and can claim them.'}
                {dispatchType === 'individual' && 'Select a data collector to dispatch sites directly to them.'}
              </>
            )}
            {step === 'costs' && 'Enter transportation costs (required) and optional other costs for each site before dispatch.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-4 py-4">
            {dispatchType === 'state' && (
              <div className="space-y-2">
                <Label>Select State</Label>
                <Select value={selectedState} onValueChange={setSelectedState}>
                  <SelectTrigger data-testid="select-state">
                    <SelectValue placeholder="Select a state" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueStates.length > 0 ? (
                      uniqueStates.map(state => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-states" disabled>No states found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {selectedState && (
                  filteredCollectors.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {filteredCollectors.length} data collector(s) found in {selectedState}
                    </p>
                  ) : (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md">
                      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">No data collectors in {selectedState}</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          You can still dispatch sites. They will be available for claiming when collectors are registered in this state.
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {dispatchType === 'locality' && (
              <>
                <div className="space-y-2">
                  <Label>Select State (optional)</Label>
                  <Select value={selectedState || '__ALL__'} onValueChange={(v) => setSelectedState(v === '__ALL__' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All states" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ALL__">All states</SelectItem>
                      {uniqueStates.map(state => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Select Locality</Label>
                  <Select value={selectedLocality} onValueChange={setSelectedLocality}>
                    <SelectTrigger data-testid="select-locality">
                      <SelectValue placeholder="Select a locality" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueLocalities.length > 0 ? (
                        uniqueLocalities.map(locality => (
                          <SelectItem key={locality} value={locality}>{locality}</SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-localities" disabled>No localities found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {selectedLocality && (
                    filteredCollectors.length > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {filteredCollectors.length} data collector(s) found in {selectedLocality}
                      </p>
                    ) : (
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">No data collectors in {selectedLocality}</p>
                          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                            You can still dispatch sites. They will be available for claiming when collectors are registered in this locality.
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </>
            )}

            {dispatchType === 'individual' && (
              <div className="space-y-2">
                <Label>Search Data Collector</Label>
                <Input
                  placeholder="Search by name, username, or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search-collector"
                />
                <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-2">
                  {filteredCollectors.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No data collectors found</p>
                  ) : (
                    filteredCollectors.map(collector => (
                      <div
                        key={collector.id}
                        className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover-elevate ${
                          selectedCollector === collector.id ? 'bg-muted' : ''
                        }`}
                        onClick={() => setSelectedCollector(collector.id)}
                        data-testid={`collector-${collector.id}`}
                      >
                        <Checkbox
                          checked={selectedCollector === collector.id}
                          onCheckedChange={() => setSelectedCollector(collector.id)}
                        />
                        <div className="flex-1">
                          <p className="font-medium">{collector.full_name || collector.username || collector.email}</p>
                          <p className="text-sm text-muted-foreground">
                            {collector.state_id && `State: ${collector.state_id}`}
                            {collector.locality_id && ` | Locality: ${collector.locality_id}`}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Select Sites to Dispatch</Label>
                <Button variant="outline" size="sm" onClick={handleSelectAll} data-testid="button-select-all">
                  {selectedSites.size === filteredSiteEntries.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-2">
                {filteredSiteEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {selectedState || selectedLocality ? 'No sites found for the selected criteria' : 'No sites available'}
                  </p>
                ) : (
                  filteredSiteEntries.map(site => (
                    <div
                      key={site.id}
                      className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover-elevate ${
                        selectedSites.has(site.id) ? 'bg-muted' : ''
                      }`}
                      onClick={() => toggleSite(site.id)}
                      data-testid={`site-${site.id}`}
                    >
                      <Checkbox
                        checked={selectedSites.has(site.id)}
                        onCheckedChange={() => toggleSite(site.id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{site.site_name || site.siteName || 'Unknown Site'}</p>
                        <p className="text-sm text-muted-foreground">
                          {site.locality && `Locality: ${site.locality}`}
                          {site.state && ` | State: ${site.state}`}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {selectedSites.size > 0 && (
                <p className="text-sm text-muted-foreground">
                  {selectedSites.size} site(s) selected
                </p>
              )}
            </div>
          </div>
        )}

        {step === 'costs' && (
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-4 rounded-md">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800 dark:text-blue-200">Admin-Only Cost Calculation</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Transportation cost is required for all sites. Other costs are optional. These costs will be saved before dispatch and used as the budget for down-payment requests.
                  </p>
                </div>
              </div>
            </div>

            <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Copy className="h-5 w-5 text-primary" />
                  <h4 className="font-semibold text-primary">Apply Same Cost to All Sites</h4>
                  <Badge variant="secondary" className="ml-auto">{selectedSites.size} sites</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enter costs once and apply to all {selectedSites.size} selected sites for bulk dispatch.
                </p>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="bulk-transportation" className="text-xs">Transportation (SDG) *</Label>
                    <Input
                      id="bulk-transportation"
                      type="number"
                      value={bulkCost.transportation || ''}
                      onChange={(e) => setBulkCost(prev => ({ ...prev, transportation: parseFloat(e.target.value) || 0 }))}
                      placeholder="Enter amount"
                      data-testid="input-bulk-transportation"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bulk-accommodation" className="text-xs">Accommodation (SDG)</Label>
                    <Input
                      id="bulk-accommodation"
                      type="number"
                      value={bulkCost.accommodation || ''}
                      onChange={(e) => setBulkCost(prev => ({ ...prev, accommodation: parseFloat(e.target.value) || 0 }))}
                      placeholder="Optional"
                      data-testid="input-bulk-accommodation"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bulk-meal" className="text-xs">Meal Allowance (SDG)</Label>
                    <Input
                      id="bulk-meal"
                      type="number"
                      value={bulkCost.mealAllowance || ''}
                      onChange={(e) => setBulkCost(prev => ({ ...prev, mealAllowance: parseFloat(e.target.value) || 0 }))}
                      placeholder="Optional"
                      data-testid="input-bulk-meal"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bulk-other" className="text-xs">Other Costs (SDG)</Label>
                    <Input
                      id="bulk-other"
                      type="number"
                      value={bulkCost.otherCosts || ''}
                      onChange={(e) => setBulkCost(prev => ({ ...prev, otherCosts: parseFloat(e.target.value) || 0 }))}
                      placeholder="Optional"
                      data-testid="input-bulk-other"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="bulk-notes" className="text-xs">Calculation Notes (Optional)</Label>
                  <Textarea
                    id="bulk-notes"
                    value={bulkCost.calculationNotes}
                    onChange={(e) => setBulkCost(prev => ({ ...prev, calculationNotes: e.target.value }))}
                    placeholder="Notes to apply to all sites..."
                    rows={2}
                    data-testid="textarea-bulk-notes"
                  />
                </div>
                
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Transport Budget per site: </span>
                    <span className="font-bold text-primary">
                      {(bulkCost.transportation + bulkCost.accommodation + bulkCost.mealAllowance + bulkCost.otherCosts).toFixed(2)} SDG
                    </span>
                  </div>
                  <Button onClick={applyBulkCostToAll} variant="default" data-testid="button-apply-bulk">
                    <Copy className="mr-2 h-4 w-4" />
                    Apply to All Sites
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
              <CardContent className="p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Note:</strong> Data Collector Fee will be calculated automatically when a collector claims the site, 
                  based on their classification level (A, B, or C). The total payout = Transport Budget + Collector Fee.
                </p>
              </CardContent>
            </Card>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>All team members in the same state/locality will be notified when sites are dispatched.</span>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {Array.from(selectedSites).map(siteId => {
                const site = filteredSiteEntries.find(s => s.id === siteId);
                const costs = siteCosts.get(siteId);
                if (!site || !costs) return null;

                const transportBudget = costs.transportation + costs.accommodation + costs.mealAllowance + costs.otherCosts;

                return (
                  <Card key={siteId} className="hover-elevate">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{costs.siteName}</h4>
                          <p className="text-sm text-muted-foreground">
                            {site.locality && `${site.locality}, `}{site.state}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="text-lg font-bold">
                            {transportBudget.toFixed(2)} SDG
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">Transport Budget</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor={`transportation-${siteId}`} className="text-xs">
                            Transportation (SDG) *
                          </Label>
                          <Input
                            id={`transportation-${siteId}`}
                            type="number"
                            value={costs.transportation}
                            onChange={(e) => updateSiteCost(siteId, 'transportation', parseFloat(e.target.value) || 0)}
                            placeholder="Required"
                            data-testid={`input-transportation-${siteId}`}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`accommodation-${siteId}`} className="text-xs">
                            Accommodation (SDG)
                          </Label>
                          <Input
                            id={`accommodation-${siteId}`}
                            type="number"
                            value={costs.accommodation}
                            onChange={(e) => updateSiteCost(siteId, 'accommodation', parseFloat(e.target.value) || 0)}
                            placeholder="Optional"
                            data-testid={`input-accommodation-${siteId}`}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`meal-${siteId}`} className="text-xs">
                            Meal Allowance (SDG)
                          </Label>
                          <Input
                            id={`meal-${siteId}`}
                            type="number"
                            value={costs.mealAllowance}
                            onChange={(e) => updateSiteCost(siteId, 'mealAllowance', parseFloat(e.target.value) || 0)}
                            placeholder="Optional"
                            data-testid={`input-meal-${siteId}`}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`other-${siteId}`} className="text-xs">
                            Other Costs (SDG)
                          </Label>
                          <Input
                            id={`other-${siteId}`}
                            type="number"
                            value={costs.otherCosts}
                            onChange={(e) => updateSiteCost(siteId, 'otherCosts', parseFloat(e.target.value) || 0)}
                            placeholder="Optional"
                            data-testid={`input-other-${siteId}`}
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor={`notes-${siteId}`} className="text-xs">
                          Calculation Notes (Optional)
                        </Label>
                        <Textarea
                          id={`notes-${siteId}`}
                          value={costs.calculationNotes}
                          onChange={(e) => updateSiteCost(siteId, 'calculationNotes', e.target.value)}
                          placeholder="Explain how these costs were calculated..."
                          rows={2}
                          data-testid={`textarea-notes-${siteId}`}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'costs' && (
            <Button variant="outline" onClick={() => setStep('select')} disabled={loading} data-testid="button-back">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} data-testid="button-cancel">
            Cancel
          </Button>
          {step === 'select' && (
            <Button onClick={handleProceedToCosts} disabled={selectedSites.size === 0} data-testid="button-proceed">
              Proceed to Costs
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          {step === 'costs' && (
            <Button onClick={handleDispatch} disabled={loading} data-testid="button-dispatch">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Dispatching...
                </>
              ) : (
                `Dispatch ${selectedSites.size} Site(s)`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
