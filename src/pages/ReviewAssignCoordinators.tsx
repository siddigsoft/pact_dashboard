import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { sudanStates } from '@/data/sudanStates';

const ReviewAssignCoordinators: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getMmpById } = useMMP();
  const { users, currentUser } = useAppContext();

  const [mmpFile, setMmpFile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [assignmentMap, setAssignmentMap] = useState({} as Record<string, string>);
  const [selectedSites, setSelectedSites] = useState({} as Record<string, Set<string>>);
  const [batchLoading, setBatchLoading] = useState({} as Record<string, boolean>);
  const [batchForwarded, setBatchForwarded] = useState({} as Record<string, boolean>);
  const [expandedGroups, setExpandedGroups] = useState({} as Record<string, boolean>);

  useEffect(() => {
    if (id) {
      const mmp = getMmpById(id);
      if (mmp) {
        setMmpFile(mmp);
        setLoading(false);
      } else {
        toast({
          title: "MMP Not Found",
          description: "The requested MMP file could not be found.",
          variant: "destructive"
        });
        navigate('/mmp');
      }
    }
  }, [id, getMmpById, navigate, toast]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading MMP file...</p>
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
  let entries: any[] = Array.isArray(mmpFile?.siteEntries) && mmpFile.siteEntries.length > 0 ? mmpFile.siteEntries : [];
  const stateNameToId = new Map<string, string>();
  // Add both full name and name without "State" suffix for better matching
  for (const s of sudanStates) {
    const normalizedName = s.name.toLowerCase();
    stateNameToId.set(normalizedName, s.id);
    // Also add without "State" suffix (e.g., "Northern" matches "Northern State")
    if (normalizedName.endsWith(' state')) {
      stateNameToId.set(normalizedName.replace(/\s+state$/, ''), s.id);
    }
  }
  const localitiesByState = new Map<string, Map<string, string>>();
  for (const s of sudanStates) {
    const map = new Map<string, string>();
    s.localities.forEach(l => map.set(l.name.toLowerCase(), l.id));
    localitiesByState.set(s.id, map);
  }
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

  // All coordinators in the system
  const allCoordinators = users.filter(u => u.role === 'coordinator');

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
        
        // Update the mmp_site_entry in the database (assign to coordinator, keep status as Pending)
        const { data, error } = await supabase
          .from('mmp_site_entries')
          .update({
            status: 'Pending',
            dispatched_by: currentUser?.id || null,
            dispatched_at: new Date().toISOString(),
            additional_data: {
              ...existingAdditionalData,
              assigned_to: coordinatorId,
              assigned_by: currentUser?.id || null,
              assigned_at: new Date().toISOString(),
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
      await supabase.from('notifications').insert([
        {
          user_id: coordinatorId,
          title: 'Sites forwarded for CP verification',
          message: `${mmpFile?.name || 'MMP'}: ${siteIds.length} site(s) have been forwarded for your CP review`,
          type: 'info',
          link: `/coordinator/sites`,
          related_entity_id: mmpId,
          related_entity_type: 'mmpFile',
        }
      ]);

      toast({ title: 'Batch Forwarded', description: `Sites were forwarded to ${allCoordinators.find(c => c.id === coordinatorId)?.fullName || 'Coordinator'}.`, variant: 'default' });
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
            Review the MMP sites and assign them to coordinators for verification. Sites are grouped by state and locality for efficient assignment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Object.entries(groupMap).length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No site groups found for this MMP.
              </div>
            ) : (
              Object.entries(groupMap).map(([groupKey, groupSites]) => {
                const [stateId, localityId] = groupKey.split('|');
                const isUnassigned = stateId === 'unassigned';
                const recommended = isUnassigned ? null : getRecommendedCoordinator(stateId, localityId);
                const selectedId = assignmentMap[groupKey] || recommended?.id || '';
                // Initialize selectedSites for this group if not set
                if (!selectedSites[groupKey]) {
                  setSelectedSites(s => ({ ...s, [groupKey]: new Set(groupSites.map((site: any) => site.id)) }));
                }
                return (
                  <div key={groupKey} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center mb-3 font-medium cursor-pointer select-none" onClick={() => setExpandedGroups(g => ({ ...g, [groupKey]: !g[groupKey] }))}>
                      {expandedGroups[groupKey] ? <ChevronDown className="w-4 h-4 mr-2" /> : <ChevronRight className="w-4 h-4 mr-2" />}
                      {groupSites.length} site(s) in <span className="text-blue-700 ml-1">
                        {isUnassigned ? 'Unassigned Locations' : `${sudanStates.find(s => s.id === stateId)?.name || stateId}`}
                      </span>
                      {!isUnassigned && localityId && (
                        <span> / <span className="text-green-700">{sudanStates.find(s => s.id === stateId)?.localities.find(l => l.id === localityId)?.name || localityId}</span></span>
                      )}
                    </div>
                    <div className="mb-3 text-sm text-muted-foreground">
                      Recommended: {recommended ? `${recommended.fullName || recommended.name || recommended.email}` : 'None'}
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <Select value={selectedId} onValueChange={val => setAssignmentMap(a => ({ ...a, [groupKey]: val }))}>
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
                      <Button
                        size="sm"
                        onClick={() => handleForwardBatch(groupKey)}
                        disabled={batchLoading[groupKey] || batchForwarded[groupKey] || !assignmentMap[groupKey] || !(selectedSites[groupKey]?.size > 0)}
                        variant={batchForwarded[groupKey] ? 'secondary' : 'default'}
                      >
                        {batchForwarded[groupKey]
                          ? 'Forwarded'
                          : batchLoading[groupKey]
                            ? 'Forwarding...'
                            : 'Forward Selected'}
                      </Button>
                    </div>
                    {expandedGroups[groupKey] && (
                      <div className="mt-3">
                        <div className="font-medium text-sm mb-2">Select sites to forward:</div>
                        <div className="max-h-40 overflow-y-auto border rounded p-3 bg-white">
                          <div className="space-y-2">
                            {groupSites.map((site: any) => (
                              <label key={site.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
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
                            ))}
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
    </div>
  );
};

export default ReviewAssignCoordinators;