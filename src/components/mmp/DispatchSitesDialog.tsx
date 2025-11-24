import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

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

export const DispatchSitesDialog: React.FC<DispatchSitesDialogProps> = ({
  open,
  onOpenChange,
  siteEntries,
  dispatchType,
  onDispatched
}) => {
  const [loading, setLoading] = useState(false);
  const [collectors, setCollectors] = useState<DataCollector[]>([]);
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedLocality, setSelectedLocality] = useState<string>('');
  const [selectedCollector, setSelectedCollector] = useState<string>('');
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
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
          .order('full_name', { ascending: true });

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
      filtered = filtered.filter(c => c.state_id === selectedState);
    } else if (dispatchType === 'locality' && selectedLocality) {
      filtered = filtered.filter(c => c.locality_id === selectedLocality);
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

  const handleDispatch = async () => {
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

    setLoading(true);
    try {
      const selectedSiteObjects = filteredSiteEntries.filter(s => selectedSites.has(s.id));
      const targetCollectors = dispatchType === 'individual' 
        ? [selectedCollector]
        : filteredCollectors.map(c => c.id);

      if (targetCollectors.length === 0) {
        toast({
          title: 'No collectors found',
          description: `No data collectors found for the selected ${dispatchType === 'state' ? 'state' : 'locality'}.`,
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }

      // Get current user for assigned_by
      const { data: { user: authUserForAssign } } = await supabase.auth.getUser();
      const assignedBy = authUserForAssign?.id;

      // Prepare notifications for collectors
      const notificationRows: any[] = [];

      for (const siteEntry of selectedSiteObjects) {
        const additionalData = siteEntry.additional_data || {};
        const enumeratorFee = siteEntry.enumerator_fee || additionalData.enumerator_fee || 20;
        const transportFee = siteEntry.transport_fee || additionalData.transport_fee || 10;
        const totalCost = siteEntry.cost || (enumeratorFee + transportFee);

        // Send notification to all target collectors
        for (const collectorId of targetCollectors) {
          notificationRows.push({
            user_id: collectorId,
            title: dispatchType === 'individual' ? 'Site Visit Assigned' : 'New Site Visit Available',
            message: `Site "${siteEntry.site_name || siteEntry.siteName}" ${dispatchType === 'individual' ? 'has been assigned to you' : 'is available'}. Fee: ${totalCost} SDG (Enumerator: ${enumeratorFee} SDG, Transport: ${transportFee} SDG)`,
            type: 'info',
            link: `/mmp?entry=${siteEntry.id}`,
            related_entity_id: siteEntry.id,
            related_entity_type: 'mmpFile'
          });
        }
      }

      // Send all notifications
      if (notificationRows.length > 0) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert(notificationRows);

        if (notifError) {
          console.error('Error creating notifications:', notifError);
          // Don't throw, notifications are not critical
        }
      }

      // Mark site entries as dispatched in mmp_site_entries
      const siteEntryIds = Array.from(selectedSites);
      const dispatchedAt = new Date().toISOString();
      
      // Get current user for dispatched_by
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const currentUserProfile = authUser ? await supabase
        .from('profiles')
        .select('full_name, username, email')
        .eq('id', authUser.id)
        .single() : null;
      
      const dispatchedBy = currentUserProfile?.data?.full_name || 
                          currentUserProfile?.data?.username || 
                          currentUserProfile?.data?.email || 
                          'System';
      
      // Update each entry individually to set status and new columns
      for (const entryId of siteEntryIds) {
        // Get current entry to check status and preserve additional_data
        const { data: currentEntry } = await supabase
          .from('mmp_site_entries')
          .select('status, additional_data')
          .eq('id', entryId)
          .single();
        
        // Only dispatch sites that are in "Approved and Costed" status
        const currentStatus = currentEntry?.status?.toLowerCase() || '';
        if (currentStatus !== 'approved and costed') {
          console.warn(`Skipping entry ${entryId} with status "${currentEntry?.status}" - only "Approved and Costed" sites can be dispatched`);
          continue;
        }
        
        const additionalData = currentEntry?.additional_data || {};
        // Also store in additional_data for backward compatibility
        additionalData.dispatched_at = dispatchedAt;
        additionalData.dispatched_by = dispatchedBy;
        additionalData.dispatched_from_status = currentEntry?.status; // Track previous status
        
        const { error: entryUpdateError } = await supabase
          .from('mmp_site_entries')
          .update({ 
            status: 'Dispatched',
            dispatched_at: dispatchedAt,
            dispatched_by: dispatchedBy,
            additional_data: additionalData // Keep for backward compatibility
          })
          .eq('id', entryId);
        
        if (entryUpdateError) {
          console.error(`Error updating site entry ${entryId}:`, entryUpdateError);
        }
      }

      toast({
        title: 'Sites Dispatched',
        description: `Successfully dispatched ${selectedSites.size} site(s) to ${targetCollectors.length} data collector(s).`,
        variant: 'default'
      });

      onDispatched?.();
      onOpenChange(false);
      setSelectedSites(new Set());
      setSelectedState('');
      setSelectedLocality('');
      setSelectedCollector('');
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Dispatch Sites {dispatchType === 'state' ? 'by State' : dispatchType === 'locality' ? 'by Locality' : 'to Data Collector'}
          </DialogTitle>
          <DialogDescription>
            {dispatchType === 'state' && 'Select a state to dispatch sites to all data collectors in that state.'}
            {dispatchType === 'locality' && 'Select a locality to dispatch sites. All data collectors in that locality will see these sites and can claim them.'}
            {dispatchType === 'individual' && 'Select a data collector to dispatch sites directly to them.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {dispatchType === 'state' && (
            <div className="space-y-2">
              <Label>Select State</Label>
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger>
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
                <p className="text-sm text-muted-foreground">
                  {filteredCollectors.length} data collector(s) found in {selectedState}
                </p>
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
                  <SelectTrigger>
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
                  <p className="text-sm text-muted-foreground">
                    {filteredCollectors.length} data collector(s) found in {selectedLocality}
                  </p>
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
              />
              <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-2">
                {filteredCollectors.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data collectors found</p>
                ) : (
                  filteredCollectors.map(collector => (
                    <div
                      key={collector.id}
                      className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-muted ${
                        selectedCollector === collector.id ? 'bg-muted' : ''
                      }`}
                      onClick={() => setSelectedCollector(collector.id)}
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
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {selectedSites.size === filteredSiteEntries.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-2">
              {filteredSiteEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {selectedState || selectedLocality ? 'No sites found for the selected criteria' : 'No sites available'}
                </p>
              ) : (
                filteredSiteEntries.map(site => {
                  const additionalData = site.additional_data || {};
                  const enumeratorFee = additionalData.enumerator_fee || 20;
                  const transportFee = additionalData.transport_fee || 10;
                  const totalCost = site.cost || (enumeratorFee + transportFee);
                  
                  return (
                    <div
                      key={site.id}
                      className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-muted ${
                        selectedSites.has(site.id) ? 'bg-muted' : ''
                      }`}
                      onClick={() => toggleSite(site.id)}
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
                          {` | Fee: ${totalCost} SDG`}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {selectedSites.size > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedSites.size} site(s) selected
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleDispatch} disabled={loading || selectedSites.size === 0}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Dispatching...
              </>
            ) : (
              `Dispatch ${selectedSites.size} Site(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

