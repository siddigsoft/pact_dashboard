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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/toast';
import { useAppContext } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { sudanStates, getLocalitiesByState, getStateName, getLocalityName } from '@/data/sudanStates';
import { ManagedHub, SiteRegistry, ProjectScope, generateSiteCode } from '@/types/hub-operations';
import { 
  Building2, 
  MapPin, 
  Globe, 
  Users, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  ChevronRight, 
  Layers,
  Navigation,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Download,
  Upload,
  Link2,
  Unlink
} from 'lucide-react';

export default function HubOperations() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('hubs');
  const [loading, setLoading] = useState(false);
  
  const [hubs, setHubs] = useState<ManagedHub[]>([]);
  const [sites, setSites] = useState<SiteRegistry[]>([]);
  const [projectScopes, setProjectScopes] = useState<ProjectScope[]>([]);
  
  const [hubDialogOpen, setHubDialogOpen] = useState(false);
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [editingHub, setEditingHub] = useState<ManagedHub | null>(null);
  const [editingSite, setEditingSite] = useState<SiteRegistry | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState<string>('');
  const [filterHub, setFilterHub] = useState<string>('');
  const [filterLocality, setFilterLocality] = useState<string>('');
  
  const [newHub, setNewHub] = useState({
    name: '',
    description: '',
    states: [] as string[],
    coordinates: { latitude: 0, longitude: 0 }
  });
  
  const [newSite, setNewSite] = useState({
    site_name: '',
    state_id: '',
    locality_id: '',
    activity_type: 'TPM',
    gps_latitude: '',
    gps_longitude: ''
  });

  const canManage = currentUser?.role === 'superAdmin' || currentUser?.role === 'admin';

  useEffect(() => {
    loadHubs();
    loadSites();
    loadProjectScopes();
  }, []);

  const loadHubs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('hubs')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setHubs(data || []);
    } catch (err) {
      console.error('Error loading hubs:', err);
      const hubsFromLocal = getHubsFromLocalData();
      setHubs(hubsFromLocal);
    } finally {
      setLoading(false);
    }
  };

  const getHubsFromLocalData = (): ManagedHub[] => {
    const { hubs: localHubs } = require('@/data/sudanStates');
    return localHubs.map((hub: any) => ({
      id: hub.id,
      name: hub.name,
      description: `Hub covering ${hub.states.length} states`,
      states: hub.states,
      coordinates: hub.coordinates,
      created_at: new Date().toISOString(),
      created_by: 'system'
    }));
  };

  const loadSites = async () => {
    try {
      const { data, error } = await supabase
        .from('sites_registry')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        if (error.code === '42P01') {
          console.log('sites_registry table does not exist yet');
          setSites([]);
          return;
        }
        throw error;
      }
      setSites(data || []);
    } catch (err) {
      console.error('Error loading sites:', err);
      setSites([]);
    }
  };

  const loadProjectScopes = async () => {
    try {
      const { data, error } = await supabase
        .from('project_scopes')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        if (error.code === '42P01') {
          console.log('project_scopes table does not exist yet');
          setProjectScopes([]);
          return;
        }
        throw error;
      }
      setProjectScopes(data || []);
    } catch (err) {
      console.error('Error loading project scopes:', err);
      setProjectScopes([]);
    }
  };

  const handleCreateHub = async () => {
    if (!newHub.name.trim()) {
      toast({ title: 'Error', description: 'Hub name is required', variant: 'destructive' });
      return;
    }
    if (newHub.states.length === 0) {
      toast({ title: 'Error', description: 'Please select at least one state', variant: 'destructive' });
      return;
    }

    try {
      setLoading(true);
      const hubData = {
        id: `hub-${Date.now()}`,
        name: newHub.name,
        description: newHub.description,
        states: newHub.states,
        coordinates: newHub.coordinates,
        created_at: new Date().toISOString(),
        created_by: currentUser?.id || 'unknown'
      };

      const { error } = await supabase
        .from('hubs')
        .insert(hubData);

      if (error) {
        if (error.code === '42P01') {
          setHubs(prev => [...prev, hubData]);
          toast({ title: 'Success', description: 'Hub created (local mode)', variant: 'default' });
        } else {
          throw error;
        }
      } else {
        toast({ title: 'Success', description: 'Hub created successfully', variant: 'default' });
        loadHubs();
      }

      setNewHub({ name: '', description: '', states: [], coordinates: { latitude: 0, longitude: 0 } });
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
      const { error } = await supabase
        .from('hubs')
        .update({
          name: editingHub.name,
          description: editingHub.description,
          states: editingHub.states,
          coordinates: editingHub.coordinates,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingHub.id);

      if (error) {
        if (error.code === '42P01') {
          setHubs(prev => prev.map(h => h.id === editingHub.id ? editingHub : h));
          toast({ title: 'Success', description: 'Hub updated (local mode)', variant: 'default' });
        } else {
          throw error;
        }
      } else {
        toast({ title: 'Success', description: 'Hub updated successfully', variant: 'default' });
        loadHubs();
      }

      setEditingHub(null);
      setHubDialogOpen(false);
    } catch (err) {
      console.error('Error updating hub:', err);
      toast({ title: 'Error', description: 'Failed to update hub', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHub = async (hubId: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('hubs')
        .delete()
        .eq('id', hubId);

      if (error) {
        if (error.code === '42P01') {
          setHubs(prev => prev.filter(h => h.id !== hubId));
          toast({ title: 'Success', description: 'Hub deleted (local mode)', variant: 'default' });
        } else {
          throw error;
        }
      } else {
        toast({ title: 'Success', description: 'Hub deleted successfully', variant: 'default' });
        loadHubs();
      }
    } catch (err) {
      console.error('Error deleting hub:', err);
      toast({ title: 'Error', description: 'Failed to delete hub', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSite = async () => {
    if (!newSite.site_name.trim() || !newSite.state_id || !newSite.locality_id) {
      toast({ title: 'Error', description: 'Site name, state, and locality are required', variant: 'destructive' });
      return;
    }

    try {
      setLoading(true);
      const state = sudanStates.find(s => s.id === newSite.state_id);
      const locality = state?.localities.find(l => l.id === newSite.locality_id);
      
      const existingSitesCount = sites.filter(s => 
        s.state_id === newSite.state_id && 
        s.locality_id === newSite.locality_id
      ).length;

      const siteCode = generateSiteCode(
        state?.code || 'XX',
        locality?.name || 'Unknown',
        newSite.site_name,
        existingSitesCount + 1,
        newSite.activity_type
      );

      const matchingHub = hubs.find(h => h.states.includes(newSite.state_id));

      const siteData: SiteRegistry = {
        id: `site-${Date.now()}`,
        site_code: siteCode,
        site_name: newSite.site_name,
        state_id: newSite.state_id,
        state_name: state?.name || '',
        locality_id: newSite.locality_id,
        locality_name: locality?.name || '',
        hub_id: matchingHub?.id,
        hub_name: matchingHub?.name,
        gps_latitude: newSite.gps_latitude ? parseFloat(newSite.gps_latitude) : undefined,
        gps_longitude: newSite.gps_longitude ? parseFloat(newSite.gps_longitude) : undefined,
        activity_type: newSite.activity_type,
        status: 'registered',
        mmp_count: 0,
        created_at: new Date().toISOString(),
        created_by: currentUser?.id || 'unknown'
      };

      const { error } = await supabase
        .from('sites_registry')
        .insert(siteData);

      if (error) {
        if (error.code === '42P01') {
          setSites(prev => [siteData, ...prev]);
          toast({ title: 'Success', description: `Site registered with code: ${siteCode}`, variant: 'default' });
        } else {
          throw error;
        }
      } else {
        toast({ title: 'Success', description: `Site registered with code: ${siteCode}`, variant: 'default' });
        loadSites();
      }

      setNewSite({ site_name: '', state_id: '', locality_id: '', activity_type: 'TPM', gps_latitude: '', gps_longitude: '' });
      setSiteDialogOpen(false);
    } catch (err) {
      console.error('Error creating site:', err);
      toast({ title: 'Error', description: 'Failed to register site', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filteredSites = useMemo(() => {
    return sites.filter(site => {
      const matchesSearch = !searchTerm || 
        site.site_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        site.site_code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesState = !filterState || site.state_id === filterState;
      const matchesHub = !filterHub || site.hub_id === filterHub;
      const matchesLocality = !filterLocality || site.locality_id === filterLocality;
      return matchesSearch && matchesState && matchesHub && matchesLocality;
    });
  }, [sites, searchTerm, filterState, filterHub, filterLocality]);

  const getStatesByHub = (hubId: string) => {
    const hub = hubs.find(h => h.id === hubId);
    if (!hub) return [];
    return hub.states.map(stateId => sudanStates.find(s => s.id === stateId)).filter(Boolean);
  };

  const hubStats = useMemo(() => {
    return hubs.map(hub => ({
      ...hub,
      stateCount: hub.states.length,
      localityCount: hub.states.reduce((acc, stateId) => {
        const state = sudanStates.find(s => s.id === stateId);
        return acc + (state?.localities.length || 0);
      }, 0),
      siteCount: sites.filter(s => s.hub_id === hub.id).length
    }));
  }, [hubs, sites]);

  if (!canManage) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">
              Only Super Admins and Admins can access Hub & Field Operations management.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Building2 className="h-6 w-6" />
            Hub & Field Operations Structure
          </h1>
          <p className="text-muted-foreground">
            Manage geographical scope, hubs, states, localities, and site registry
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { loadHubs(); loadSites(); }}
            disabled={loading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-md">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{hubs.length}</p>
              <p className="text-sm text-muted-foreground">Hubs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-md">
              <MapPin className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{sudanStates.length}</p>
              <p className="text-sm text-muted-foreground">States</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-md">
              <Globe className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {sudanStates.reduce((acc, s) => acc + s.localities.length, 0)}
              </p>
              <p className="text-sm text-muted-foreground">Localities</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-md">
              <Navigation className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{sites.length}</p>
              <p className="text-sm text-muted-foreground">Registered Sites</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="hubs" data-testid="tab-hubs">
            <Building2 className="h-4 w-4 mr-2" />
            Hubs
          </TabsTrigger>
          <TabsTrigger value="states" data-testid="tab-states">
            <MapPin className="h-4 w-4 mr-2" />
            States & Localities
          </TabsTrigger>
          <TabsTrigger value="sites" data-testid="tab-sites">
            <Navigation className="h-4 w-4 mr-2" />
            Sites Registry
          </TabsTrigger>
          <TabsTrigger value="projects" data-testid="tab-projects">
            <Layers className="h-4 w-4 mr-2" />
            Project Scope
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hubs" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Hub Management</CardTitle>
                <CardDescription>
                  Create and manage hubs, assign states to each hub
                </CardDescription>
              </div>
              <Dialog open={hubDialogOpen} onOpenChange={setHubDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { setEditingHub(null); setNewHub({ name: '', description: '', states: [], coordinates: { latitude: 0, longitude: 0 } }); }} data-testid="button-add-hub">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Hub
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingHub ? 'Edit Hub' : 'Create New Hub'}</DialogTitle>
                    <DialogDescription>
                      {editingHub ? 'Update hub details and state assignments' : 'Create a new hub and assign states to it'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="hub-name">Hub Name *</Label>
                      <Input
                        id="hub-name"
                        value={editingHub?.name ?? newHub.name}
                        onChange={(e) => editingHub 
                          ? setEditingHub({ ...editingHub, name: e.target.value })
                          : setNewHub({ ...newHub, name: e.target.value })
                        }
                        placeholder="e.g., Kassala Hub"
                        data-testid="input-hub-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hub-description">Description</Label>
                      <Textarea
                        id="hub-description"
                        value={editingHub?.description ?? newHub.description}
                        onChange={(e) => editingHub 
                          ? setEditingHub({ ...editingHub, description: e.target.value })
                          : setNewHub({ ...newHub, description: e.target.value })
                        }
                        placeholder="Optional description"
                        data-testid="textarea-hub-description"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="hub-lat">Latitude</Label>
                        <Input
                          id="hub-lat"
                          type="number"
                          step="0.0001"
                          value={(editingHub?.coordinates?.latitude ?? newHub.coordinates.latitude) || ''}
                          onChange={(e) => {
                            const lat = parseFloat(e.target.value) || 0;
                            editingHub 
                              ? setEditingHub({ ...editingHub, coordinates: { ...editingHub.coordinates!, latitude: lat } })
                              : setNewHub({ ...newHub, coordinates: { ...newHub.coordinates, latitude: lat } });
                          }}
                          placeholder="15.5007"
                          data-testid="input-hub-latitude"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hub-lng">Longitude</Label>
                        <Input
                          id="hub-lng"
                          type="number"
                          step="0.0001"
                          value={(editingHub?.coordinates?.longitude ?? newHub.coordinates.longitude) || ''}
                          onChange={(e) => {
                            const lng = parseFloat(e.target.value) || 0;
                            editingHub 
                              ? setEditingHub({ ...editingHub, coordinates: { ...editingHub.coordinates!, longitude: lng } })
                              : setNewHub({ ...newHub, coordinates: { ...newHub.coordinates, longitude: lng } });
                          }}
                          placeholder="32.5599"
                          data-testid="input-hub-longitude"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Assign States *</Label>
                      <p className="text-sm text-muted-foreground">Select states to include in this hub</p>
                      <ScrollArea className="h-64 border rounded-md p-3">
                        <div className="space-y-2">
                          {sudanStates.map(state => {
                            const isSelected = (editingHub?.states ?? newHub.states).includes(state.id);
                            return (
                              <div 
                                key={state.id} 
                                className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover-elevate ${isSelected ? 'bg-primary/10' : ''}`}
                                onClick={() => {
                                  const currentStates = editingHub?.states ?? newHub.states;
                                  const updatedStates = isSelected
                                    ? currentStates.filter(s => s !== state.id)
                                    : [...currentStates, state.id];
                                  editingHub 
                                    ? setEditingHub({ ...editingHub, states: updatedStates })
                                    : setNewHub({ ...newHub, states: updatedStates });
                                }}
                              >
                                <Checkbox checked={isSelected} />
                                <div className="flex-1">
                                  <p className="font-medium">{state.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {state.code} - {state.localities.length} localities
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                      <p className="text-sm text-muted-foreground">
                        {(editingHub?.states ?? newHub.states).length} state(s) selected
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setHubDialogOpen(false)}>Cancel</Button>
                    <Button 
                      onClick={editingHub ? handleUpdateHub : handleCreateHub} 
                      disabled={loading}
                      data-testid="button-save-hub"
                    >
                      {loading ? 'Saving...' : (editingHub ? 'Update Hub' : 'Create Hub')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {hubStats.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No hubs created yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Create your first hub to start organizing states</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {hubStats.map(hub => (
                    <Card key={hub.id} className="hover-elevate">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-lg">{hub.name}</h3>
                            {hub.description && (
                              <p className="text-sm text-muted-foreground">{hub.description}</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              size="icon" 
                              variant="ghost"
                              onClick={() => { setEditingHub(hub); setHubDialogOpen(true); }}
                              data-testid={`button-edit-hub-${hub.id}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" data-testid={`button-delete-hub-${hub.id}`}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Hub?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will delete "{hub.name}" and unlink all associated states. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteHub(hub.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            <MapPin className="h-3 w-3 mr-1" />
                            {hub.stateCount} States
                          </Badge>
                          <Badge variant="outline">
                            <Globe className="h-3 w-3 mr-1" />
                            {hub.localityCount} Localities
                          </Badge>
                          <Badge variant="outline">
                            <Navigation className="h-3 w-3 mr-1" />
                            {hub.siteCount} Sites
                          </Badge>
                        </div>
                        {hub.coordinates && hub.coordinates.latitude !== 0 && (
                          <p className="text-xs text-muted-foreground">
                            Coords: {hub.coordinates.latitude.toFixed(4)}, {hub.coordinates.longitude.toFixed(4)}
                          </p>
                        )}
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value="states" className="border-none">
                            <AccordionTrigger className="text-sm py-2">View States</AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-1">
                                {hub.states.map(stateId => {
                                  const state = sudanStates.find(s => s.id === stateId);
                                  return state ? (
                                    <div key={stateId} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50">
                                      <span>{state.name}</span>
                                      <Badge variant="outline" className="text-xs">{state.localities.length} loc</Badge>
                                    </div>
                                  ) : null;
                                })}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="states" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>States & Localities Hierarchy</CardTitle>
              <CardDescription>
                View the complete geographical structure: States and their localities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {sudanStates.map(state => {
                  const hub = hubs.find(h => h.states.includes(state.id));
                  const stateSiteCount = sites.filter(s => s.state_id === state.id).length;
                  
                  return (
                    <AccordionItem key={state.id} value={state.id}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 flex-1">
                          <MapPin className="h-4 w-4 text-primary" />
                          <span className="font-medium">{state.name}</span>
                          <Badge variant="outline" className="ml-2">{state.code}</Badge>
                          {hub && (
                            <Badge variant="secondary" className="ml-2">
                              <Building2 className="h-3 w-3 mr-1" />
                              {hub.name}
                            </Badge>
                          )}
                          <div className="ml-auto flex items-center gap-2 mr-4">
                            <Badge variant="outline">
                              {state.localities.length} localities
                            </Badge>
                            <Badge variant="outline">
                              {stateSiteCount} sites
                            </Badge>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pl-8 space-y-2">
                          {state.localities.map(locality => {
                            const localitySiteCount = sites.filter(s => s.locality_id === locality.id).length;
                            return (
                              <div key={locality.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                                <div className="flex items-center gap-2">
                                  <Globe className="h-4 w-4 text-muted-foreground" />
                                  <span>{locality.name}</span>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  {localitySiteCount} site{localitySiteCount !== 1 ? 's' : ''}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sites" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Sites Registry</CardTitle>
                <CardDescription>
                  Master registry of all sites with unique IDs and GPS coordinates
                </CardDescription>
              </div>
              <Dialog open={siteDialogOpen} onOpenChange={setSiteDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-site">
                    <Plus className="h-4 w-4 mr-2" />
                    Register Site
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Register New Site</DialogTitle>
                    <DialogDescription>
                      Add a new site to the registry. A unique ID will be generated automatically.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="site-name">Site Name *</Label>
                      <Input
                        id="site-name"
                        value={newSite.site_name}
                        onChange={(e) => setNewSite({ ...newSite, site_name: e.target.value })}
                        placeholder="Enter site name"
                        data-testid="input-site-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>State *</Label>
                      <Select 
                        value={newSite.state_id} 
                        onValueChange={(v) => setNewSite({ ...newSite, state_id: v, locality_id: '' })}
                      >
                        <SelectTrigger data-testid="select-site-state">
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                          {sudanStates.map(state => (
                            <SelectItem key={state.id} value={state.id}>{state.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Locality *</Label>
                      <Select 
                        value={newSite.locality_id} 
                        onValueChange={(v) => setNewSite({ ...newSite, locality_id: v })}
                        disabled={!newSite.state_id}
                      >
                        <SelectTrigger data-testid="select-site-locality">
                          <SelectValue placeholder="Select locality" />
                        </SelectTrigger>
                        <SelectContent>
                          {getLocalitiesByState(newSite.state_id).map(locality => (
                            <SelectItem key={locality.id} value={locality.id}>{locality.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Activity Type</Label>
                      <Select 
                        value={newSite.activity_type} 
                        onValueChange={(v) => setNewSite({ ...newSite, activity_type: v })}
                      >
                        <SelectTrigger data-testid="select-activity-type">
                          <SelectValue placeholder="Select activity" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TPM">TPM (Third Party Monitoring)</SelectItem>
                          <SelectItem value="PDM">PDM (Post Distribution Monitoring)</SelectItem>
                          <SelectItem value="CFM">CFM (Community Feedback Mechanism)</SelectItem>
                          <SelectItem value="FCS">FCS (Food Consumption Score)</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="gps-lat">GPS Latitude (optional)</Label>
                        <Input
                          id="gps-lat"
                          type="number"
                          step="0.000001"
                          value={newSite.gps_latitude}
                          onChange={(e) => setNewSite({ ...newSite, gps_latitude: e.target.value })}
                          placeholder="15.5007"
                          data-testid="input-gps-latitude"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gps-lng">GPS Longitude (optional)</Label>
                        <Input
                          id="gps-lng"
                          type="number"
                          step="0.000001"
                          value={newSite.gps_longitude}
                          onChange={(e) => setNewSite({ ...newSite, gps_longitude: e.target.value })}
                          placeholder="32.5599"
                          data-testid="input-gps-longitude"
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSiteDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateSite} disabled={loading} data-testid="button-save-site">
                      {loading ? 'Registering...' : 'Register Site'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or code..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-sites"
                    />
                  </div>
                </div>
                <Select value={filterHub} onValueChange={setFilterHub}>
                  <SelectTrigger className="w-[180px]" data-testid="select-filter-hub">
                    <SelectValue placeholder="All Hubs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Hubs</SelectItem>
                    {hubs.map(hub => (
                      <SelectItem key={hub.id} value={hub.id}>{hub.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterState} onValueChange={(v) => { setFilterState(v); setFilterLocality(''); }}>
                  <SelectTrigger className="w-[180px]" data-testid="select-filter-state">
                    <SelectValue placeholder="All States" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All States</SelectItem>
                    {sudanStates.map(state => (
                      <SelectItem key={state.id} value={state.id}>{state.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filterState && (
                  <Select value={filterLocality} onValueChange={setFilterLocality}>
                    <SelectTrigger className="w-[180px]" data-testid="select-filter-locality">
                      <SelectValue placeholder="All Localities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Localities</SelectItem>
                      {getLocalitiesByState(filterState).map(locality => (
                        <SelectItem key={locality.id} value={locality.id}>{locality.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {filteredSites.length === 0 ? (
                <div className="text-center py-12">
                  <Navigation className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No sites registered yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sites will be automatically registered when MMPs are uploaded, or you can add them manually
                  </p>
                </div>
              ) : (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site Code</TableHead>
                        <TableHead>Site Name</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Locality</TableHead>
                        <TableHead>Hub</TableHead>
                        <TableHead>GPS</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>MMPs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSites.map(site => (
                        <TableRow key={site.id}>
                          <TableCell className="font-mono text-sm">{site.site_code}</TableCell>
                          <TableCell className="font-medium">{site.site_name}</TableCell>
                          <TableCell>{site.state_name}</TableCell>
                          <TableCell>{site.locality_name}</TableCell>
                          <TableCell>
                            {site.hub_name ? (
                              <Badge variant="secondary">{site.hub_name}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {site.gps_latitude && site.gps_longitude ? (
                              <Badge variant="outline" className="text-green-600">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Captured
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-orange-600">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={site.status === 'active' ? 'default' : 'secondary'}>
                              {site.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{site.mmp_count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Project Scope Management</CardTitle>
              <CardDescription>
                Link projects to their geographical scope (hubs, states, localities)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Project scope linking coming soon</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This feature will allow you to associate projects with specific hubs and states
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
