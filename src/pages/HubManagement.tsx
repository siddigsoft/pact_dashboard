import { useState, useEffect, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/toast';
import { useAppContext } from '@/context/AppContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { supabase } from '@/integrations/supabase/client';
import { sudanStates, getLocalitiesByState, hubs as defaultHubs } from '@/data/sudanStates';
import { 
  Building2, 
  MapPin, 
  Globe, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  Link2,
  Unlink,
  ChevronRight,
  Save,
  X,
  RefreshCw,
  Map,
  Users
} from 'lucide-react';

interface ManagedHub {
  id: string;
  name: string;
  description?: string;
  states: string[];
  coordinates?: { latitude: number; longitude: number };
  created_at?: string;
  created_by?: string;
}

interface HubState {
  id: string;
  hub_id: string;
  state_id: string;
  state_name: string;
  state_code: string;
}

export default function HubManagement() {
  const { currentUser } = useAppContext();
  const { isSuperAdmin } = useSuperAdmin();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('hubs');
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
  const [hubs, setHubs] = useState<ManagedHub[]>([]);
  const [hubStates, setHubStates] = useState<HubState[]>([]);
  
  const [hubDialogOpen, setHubDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  
  const [editingHub, setEditingHub] = useState<ManagedHub | null>(null);
  const [selectedHubForLinking, setSelectedHubForLinking] = useState<ManagedHub | null>(null);
  const [selectedStatesForLinking, setSelectedStatesForLinking] = useState<string[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [stateSearchTerm, setStateSearchTerm] = useState('');
  const [localitySearchTerm, setLocalitySearchTerm] = useState('');
  const [selectedStateForLocalities, setSelectedStateForLocalities] = useState<string>('');
  
  const [newHub, setNewHub] = useState({
    name: '',
    description: '',
    states: [] as string[]
  });

  const userRole = currentUser?.role?.toLowerCase() || '';
  const canManage = isSuperAdmin || userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Data load timeout')), 10000)
      );
      
      await Promise.race([
        Promise.allSettled([loadHubs(), loadHubStates()]),
        timeoutPromise
      ]);
    } catch (err) {
      console.error('Error loading data:', err);
      toast({ 
        title: 'Warning', 
        description: 'Some data may not have loaded. Try refreshing.', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
    }
  };

  const loadHubs = async () => {
    try {
      const { data: hubsData, error: hubsError } = await supabase
        .from('hubs')
        .select('*')
        .order('name');
      
      if (hubsError) throw hubsError;
      
      const { data: hubStatesData } = await supabase
        .from('hub_states')
        .select('*');
      
      const hubsWithStates = (hubsData || []).map(hub => ({
        ...hub,
        states: (hubStatesData || [])
          .filter(hs => hs.hub_id === hub.id)
          .map(hs => hs.state_id)
      }));

      setHubs(hubsWithStates);
    } catch (err) {
      console.error('Error loading hubs from database, using fallback:', err);
      const hubsFromLocal = defaultHubs.map((hub: any) => ({
        id: hub.id,
        name: hub.name,
        description: `Hub covering ${hub.states.length} states`,
        states: hub.states,
        coordinates: hub.coordinates,
        created_at: new Date().toISOString(),
        created_by: 'system'
      }));
      setHubs(hubsFromLocal);
    }
  };

  const loadHubStates = async () => {
    try {
      const { data, error } = await supabase
        .from('hub_states')
        .select('*');
      
      if (error) throw error;
      setHubStates(data || []);
    } catch (err) {
      console.error('Error loading hub states:', err);
      setHubStates([]);
    }
  };

  const calculateHubCoordinates = (stateIds: string[]) => {
    const stateCoords: Record<string, { lat: number; lng: number }> = {
      'khartoum': { lat: 15.5007, lng: 32.5599 },
      'gezira': { lat: 14.4, lng: 33.5 },
      'red-sea': { lat: 19.6, lng: 37.2 },
      'kassala': { lat: 15.45, lng: 36.4 },
      'gedaref': { lat: 14.0, lng: 35.4 },
      'white-nile': { lat: 13.2, lng: 32.5 },
      'blue-nile': { lat: 11.8, lng: 34.2 },
      'sennar': { lat: 13.5, lng: 33.6 },
      'north-kordofan': { lat: 13.9, lng: 30.8 },
      'south-kordofan': { lat: 11.2, lng: 29.9 },
      'west-kordofan': { lat: 12.7, lng: 29.2 },
      'north-darfur': { lat: 15.6, lng: 24.9 },
      'south-darfur': { lat: 11.7, lng: 24.9 },
      'west-darfur': { lat: 12.9, lng: 22.5 },
      'east-darfur': { lat: 11.5, lng: 26.1 },
      'central-darfur': { lat: 12.9, lng: 23.5 },
      'river-nile': { lat: 18.5, lng: 33.9 },
      'northern': { lat: 19.6, lng: 30.4 },
    };
    
    if (stateIds.length === 0) return { latitude: 15.5, longitude: 32.5 };
    
    const coords = stateIds
      .map(id => stateCoords[id])
      .filter(Boolean);
    
    if (coords.length === 0) return { latitude: 15.5, longitude: 32.5 };
    
    const avgLat = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
    const avgLng = coords.reduce((sum, c) => sum + c.lng, 0) / coords.length;
    
    return { latitude: avgLat, longitude: avgLng };
  };

  const handleCreateHub = async () => {
    if (!newHub.name.trim()) {
      toast({ title: 'Error', description: 'Hub name is required', variant: 'destructive' });
      return;
    }

    try {
      setLoading(true);
      const hubId = `hub-${Date.now()}`;
      const coordinates = calculateHubCoordinates(newHub.states);
      
      const hubData = {
        id: hubId,
        name: newHub.name,
        description: newHub.description,
        coordinates: coordinates,
        created_by: currentUser?.id || 'unknown'
      };

      const { error: hubError } = await supabase.from('hubs').insert(hubData);
      if (hubError) throw hubError;

      if (newHub.states.length > 0) {
        const hubStatesData = newHub.states.map(stateId => {
          const state = sudanStates.find(s => s.id === stateId);
          return {
            hub_id: hubId,
            state_id: stateId,
            state_name: state?.name || stateId,
            state_code: state?.code || ''
          };
        });

        const { error: statesError } = await supabase.from('hub_states').insert(hubStatesData);
        if (statesError) throw statesError;
      }

      toast({ title: 'Success', description: 'Hub created successfully' });
      loadData();

      setNewHub({ name: '', description: '', states: [] });
      setHubDialogOpen(false);
    } catch (err) {
      console.error('Error creating hub:', err);
      toast({ title: 'Error', description: 'Failed to create hub', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateHub = async () => {
    if (!editingHub) return;

    try {
      setLoading(true);
      const coordinates = calculateHubCoordinates(editingHub.states);
      
      const { error: hubError } = await supabase
        .from('hubs')
        .update({
          name: editingHub.name,
          description: editingHub.description,
          coordinates: coordinates
        })
        .eq('id', editingHub.id);

      if (hubError) throw hubError;

      await supabase.from('hub_states').delete().eq('hub_id', editingHub.id);

      if (editingHub.states.length > 0) {
        const hubStatesData = editingHub.states.map(stateId => {
          const state = sudanStates.find(s => s.id === stateId);
          return {
            hub_id: editingHub.id,
            state_id: stateId,
            state_name: state?.name || stateId,
            state_code: state?.code || ''
          };
        });

        const { error: statesError } = await supabase.from('hub_states').insert(hubStatesData);
        if (statesError) throw statesError;
      }

      toast({ title: 'Success', description: 'Hub updated successfully' });
      loadData();

      setEditingHub(null);
      setHubDialogOpen(false);
    } catch (err) {
      console.error('Error updating hub:', err);
      toast({ title: 'Error', description: 'Failed to update hub', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHub = async () => {
    if (!deleteTarget) return;

    try {
      setLoading(true);
      
      await supabase.from('hub_states').delete().eq('hub_id', deleteTarget.id);
      
      const { error } = await supabase.from('hubs').delete().eq('id', deleteTarget.id);

      if (error) throw error;
      
      toast({ title: 'Success', description: 'Hub deleted successfully' });
      loadData();
    } catch (err) {
      console.error('Error deleting hub:', err);
      toast({ title: 'Error', description: 'Failed to delete hub', variant: 'destructive' });
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const handleLinkStates = async () => {
    if (!selectedHubForLinking) return;

    try {
      setLoading(true);

      await supabase.from('hub_states').delete().eq('hub_id', selectedHubForLinking.id);

      if (selectedStatesForLinking.length > 0) {
        const hubStatesData = selectedStatesForLinking.map(stateId => {
          const state = sudanStates.find(s => s.id === stateId);
          return {
            hub_id: selectedHubForLinking.id,
            state_id: stateId,
            state_name: state?.name || stateId,
            state_code: state?.code || ''
          };
        });

        const { error } = await supabase.from('hub_states').insert(hubStatesData);
        if (error) throw error;
      }

      const coordinates = calculateHubCoordinates(selectedStatesForLinking);
      await supabase
        .from('hubs')
        .update({ coordinates })
        .eq('id', selectedHubForLinking.id);

      toast({ title: 'Success', description: 'States linked successfully' });
      loadData();

      setLinkDialogOpen(false);
      setSelectedHubForLinking(null);
      setSelectedStatesForLinking([]);
    } catch (err) {
      console.error('Error linking states:', err);
      toast({ title: 'Error', description: 'Failed to link states', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openLinkDialog = (hub: ManagedHub) => {
    setSelectedHubForLinking(hub);
    setSelectedStatesForLinking(hub.states || []);
    setLinkDialogOpen(true);
  };

  const filteredHubs = useMemo(() => {
    return hubs.filter(hub => 
      hub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      hub.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [hubs, searchTerm]);

  const filteredStates = useMemo(() => {
    return sudanStates.filter(state =>
      state.name.toLowerCase().includes(stateSearchTerm.toLowerCase()) ||
      state.code.toLowerCase().includes(stateSearchTerm.toLowerCase())
    );
  }, [stateSearchTerm]);

  const filteredLocalities = useMemo(() => {
    if (!selectedStateForLocalities) return [];
    const localities = getLocalitiesByState(selectedStateForLocalities);
    return localities.filter(locality =>
      locality.name.toLowerCase().includes(localitySearchTerm.toLowerCase())
    );
  }, [selectedStateForLocalities, localitySearchTerm]);

  const getHubForState = (stateId: string): ManagedHub | undefined => {
    return hubs.find(hub => hub.states.includes(stateId));
  };

  const getStateCount = () => sudanStates.length;
  const getLocalityCount = () => sudanStates.reduce((sum, state) => sum + state.localities.length, 0);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Hub Management</h1>
          <p className="text-muted-foreground">Manage hubs, states, and localities</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={loadData}
            disabled={loading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {canManage && (
            <Button onClick={() => { setEditingHub(null); setHubDialogOpen(true); }} data-testid="button-create-hub">
              <Plus className="h-4 w-4 mr-2" />
              Create Hub
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hubs</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-hubs">{hubs.length}</div>
            <p className="text-xs text-muted-foreground">Active hub offices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total States</CardTitle>
            <Map className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-states">{getStateCount()}</div>
            <p className="text-xs text-muted-foreground">Sudan administrative states</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Localities</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-localities">{getLocalityCount()}</div>
            <p className="text-xs text-muted-foreground">Across all states</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="hubs" data-testid="tab-hubs">
            <Building2 className="h-4 w-4 mr-2" />
            Hubs
          </TabsTrigger>
          <TabsTrigger value="states" data-testid="tab-states">
            <Map className="h-4 w-4 mr-2" />
            States
          </TabsTrigger>
          <TabsTrigger value="localities" data-testid="tab-localities">
            <MapPin className="h-4 w-4 mr-2" />
            Localities
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hubs" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search hubs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-hubs"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hub Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Linked States</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : filteredHubs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No hubs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredHubs.map((hub) => (
                      <TableRow key={hub.id} data-testid={`row-hub-${hub.id}`}>
                        <TableCell className="font-medium">{hub.name}</TableCell>
                        <TableCell className="text-muted-foreground">{hub.description || '-'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {hub.states.length === 0 ? (
                              <span className="text-muted-foreground text-sm">No states linked</span>
                            ) : (
                              hub.states.slice(0, 3).map(stateId => {
                                const state = sudanStates.find(s => s.id === stateId);
                                return (
                                  <Badge key={stateId} variant="secondary" className="text-xs">
                                    {state?.name || stateId}
                                  </Badge>
                                );
                              })
                            )}
                            {hub.states.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{hub.states.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openLinkDialog(hub)}
                              title="Link States"
                              data-testid={`button-link-${hub.id}`}
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                            {canManage && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => { setEditingHub(hub); setHubDialogOpen(true); }}
                                  title="Edit Hub"
                                  data-testid={`button-edit-${hub.id}`}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => { setDeleteTarget({ id: hub.id, name: hub.name }); setDeleteDialogOpen(true); }}
                                  title="Delete Hub"
                                  data-testid={`button-delete-${hub.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="states" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search states..."
                value={stateSearchTerm}
                onChange={(e) => setStateSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-states"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Localities</TableHead>
                    <TableHead>Linked Hub</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStates.map((state) => {
                    const linkedHub = getHubForState(state.id);
                    return (
                      <TableRow key={state.id} data-testid={`row-state-${state.id}`}>
                        <TableCell className="font-medium">{state.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{state.code}</Badge>
                        </TableCell>
                        <TableCell>{state.localities.length} localities</TableCell>
                        <TableCell>
                          {linkedHub ? (
                            <Badge variant="secondary">
                              <Building2 className="h-3 w-3 mr-1" />
                              {linkedHub.name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">Not linked</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="localities" className="space-y-4">
          <Card>
            <CardHeader className="space-y-4">
              <CardTitle className="text-lg">Browse Localities</CardTitle>
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="state-selector" className="text-sm font-medium">Select State</Label>
                  <Select value={selectedStateForLocalities} onValueChange={setSelectedStateForLocalities}>
                    <SelectTrigger id="state-selector" className="w-full md:w-[320px]" data-testid="select-state-for-localities">
                      <SelectValue placeholder="Choose a state to view localities" />
                    </SelectTrigger>
                    <SelectContent>
                      {sudanStates.map(state => (
                        <SelectItem key={state.id} value={state.id}>
                          {state.name} ({state.localities.length} localities)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {selectedStateForLocalities && (
                  <div className="space-y-2">
                    <Label htmlFor="locality-search" className="text-sm font-medium">Search Localities</Label>
                    <div className="relative w-full md:w-[400px]">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="locality-search"
                        placeholder="Type to search localities..."
                        value={localitySearchTerm}
                        onChange={(e) => setLocalitySearchTerm(e.target.value)}
                        className="pl-10 w-full text-base"
                        data-testid="input-search-localities"
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>

          {!selectedStateForLocalities ? (
            <CardContent className="py-12 text-center text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a state above to view its localities</p>
            </CardContent>
          ) : (
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Locality Name</TableHead>
                    <TableHead>Arabic Name</TableHead>
                    <TableHead>ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLocalities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        No localities found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLocalities.map((locality) => (
                      <TableRow key={locality.id} data-testid={`row-locality-${locality.id}`}>
                        <TableCell className="font-medium">{locality.name}</TableCell>
                        <TableCell className="text-muted-foreground">{locality.nameAr || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{locality.id}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={hubDialogOpen} onOpenChange={setHubDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingHub ? 'Edit Hub' : 'Create New Hub'}</DialogTitle>
            <DialogDescription>
              {editingHub ? 'Update hub information and linked states.' : 'Create a new hub and link it to states.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hub-name">Hub Name *</Label>
              <Input
                id="hub-name"
                placeholder="Enter hub name"
                value={editingHub?.name || newHub.name}
                onChange={(e) => editingHub 
                  ? setEditingHub({ ...editingHub, name: e.target.value })
                  : setNewHub({ ...newHub, name: e.target.value })
                }
                data-testid="input-hub-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="hub-description">Description</Label>
              <Textarea
                id="hub-description"
                placeholder="Enter hub description"
                value={editingHub?.description || newHub.description}
                onChange={(e) => editingHub 
                  ? setEditingHub({ ...editingHub, description: e.target.value })
                  : setNewHub({ ...newHub, description: e.target.value })
                }
                data-testid="input-hub-description"
              />
            </div>

            <div className="space-y-2">
              <Label>Link States</Label>
              <ScrollArea className="h-[200px] border rounded-md p-3">
                <div className="space-y-2">
                  {sudanStates.map(state => {
                    const isChecked = editingHub 
                      ? editingHub.states.includes(state.id)
                      : newHub.states.includes(state.id);
                    return (
                      <div key={state.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`state-${state.id}`}
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            if (editingHub) {
                              setEditingHub({
                                ...editingHub,
                                states: checked 
                                  ? [...editingHub.states, state.id]
                                  : editingHub.states.filter(s => s !== state.id)
                              });
                            } else {
                              setNewHub({
                                ...newHub,
                                states: checked 
                                  ? [...newHub.states, state.id]
                                  : newHub.states.filter(s => s !== state.id)
                              });
                            }
                          }}
                          data-testid={`checkbox-state-${state.id}`}
                        />
                        <Label htmlFor={`state-${state.id}`} className="text-sm font-normal cursor-pointer">
                          {state.name} ({state.code})
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setHubDialogOpen(false); setEditingHub(null); }}>
              Cancel
            </Button>
            <Button 
              onClick={editingHub ? handleUpdateHub : handleCreateHub}
              disabled={loading}
              data-testid="button-save-hub"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {editingHub ? 'Update Hub' : 'Create Hub'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link States to {selectedHubForLinking?.name}</DialogTitle>
            <DialogDescription>
              Select the states that should be managed by this hub.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[300px] border rounded-md p-3">
            <div className="space-y-2">
              {sudanStates.map(state => {
                const isChecked = selectedStatesForLinking.includes(state.id);
                const otherHub = hubs.find(h => h.id !== selectedHubForLinking?.id && h.states.includes(state.id));
                return (
                  <div key={state.id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`link-state-${state.id}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          setSelectedStatesForLinking(
                            checked 
                              ? [...selectedStatesForLinking, state.id]
                              : selectedStatesForLinking.filter(s => s !== state.id)
                          );
                        }}
                        data-testid={`checkbox-link-state-${state.id}`}
                      />
                      <Label htmlFor={`link-state-${state.id}`} className="text-sm font-normal cursor-pointer">
                        {state.name} ({state.code})
                      </Label>
                    </div>
                    {otherHub && (
                      <Badge variant="outline" className="text-xs">
                        Currently: {otherHub.name}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleLinkStates}
              disabled={loading}
              data-testid="button-save-links"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
              Save Links
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Hub</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This will also remove all state links. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteHub} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
