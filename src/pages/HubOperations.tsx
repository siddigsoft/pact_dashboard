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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/toast';
import { useAppContext } from '@/context/AppContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { supabase } from '@/integrations/supabase/client';
import { sudanStates, getLocalitiesByState, hubs as defaultHubs, getTotalLocalityCount } from '@/data/sudanStates';
import { sudanStateBoundaries } from '@/data/sudanGeoJSON';
import { ManagedHub, SiteRegistry, ProjectScope, generateSiteCode } from '@/types/hub-operations';
import StateMapCard, { getStateCoords, getStateColor } from '@/components/hub-operations/StateMapCard';
import HubCard from '@/components/hub-operations/HubCard';
import SiteCard from '@/components/hub-operations/SiteCard';
import LeafletMapContainer from '@/components/map/LeafletMapContainer';
import SudanMapView from '@/components/hub-operations/SudanMapView';
import SiteDetailDialog from '@/components/mmp/SiteDetailDialog';
import { MapContainer, TileLayer, Circle, Marker, Popup, GeoJSON, useMap
} from 'react-leaflet';
import L from 'leaflet';

function FitBoundsToGeoJSON({ geoJson }: { geoJson: any }) {
  const map = useMap();
  
  if (geoJson && geoJson.geometry && geoJson.geometry.coordinates) {
    const allCoords: number[][] = [];
    
    if (geoJson.geometry.type === 'Polygon') {
      geoJson.geometry.coordinates.forEach((ring: number[][]) => {
        ring.forEach((coord: number[]) => allCoords.push(coord));
      });
    } else if (geoJson.geometry.type === 'MultiPolygon') {
      geoJson.geometry.coordinates.forEach((polygon: number[][][]) => {
        polygon.forEach((ring: number[][]) => {
          ring.forEach((coord: number[]) => allCoords.push(coord));
        });
      });
    }
    
    if (allCoords.length > 0) {
      const lats = allCoords.map((c: number[]) => c[1]);
      const lngs = allCoords.map((c: number[]) => c[0]);
      const bounds: [[number, number], [number, number]] = [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)]
      ];
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }
  
  return null;
}
import { 
  Building2, 
  MapPin, 
  Globe, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  Layers,
  Navigation,
  RefreshCw,
  Download,
  Upload,
  AlertCircle,
  Sparkles,
  Map,
  Filter,
  Grid3X3,
  List,
  Eye
} from 'lucide-react';

export default function HubOperations() {
  const { currentUser } = useAppContext();
  const { isSuperAdmin } = useSuperAdmin();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid');
  
  const [hubs, setHubs] = useState<ManagedHub[]>([]);
  const [sites, setSites] = useState<SiteRegistry[]>([]);
  const [projectScopes, setProjectScopes] = useState<ProjectScope[]>([]);
  
  const [hubDialogOpen, setHubDialogOpen] = useState(false);
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [stateDetailOpen, setStateDetailOpen] = useState(false);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'hub' | 'site'; id: string; name: string } | null>(null);
  const [hubDetailOpen, setHubDetailOpen] = useState(false);
  const [selectedHub, setSelectedHub] = useState<ManagedHub | null>(null);
  const [siteDetailOpen, setSiteDetailOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<SiteRegistry | null>(null);
  
  const [editingHub, setEditingHub] = useState<ManagedHub | null>(null);
  const [editingSite, setEditingSite] = useState<SiteRegistry | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState<string>('');
  const [filterHub, setFilterHub] = useState<string>('');
  const [filterActivityType, setFilterActivityType] = useState<string>('');
  const [siteSourceFilter, setSiteSourceFilter] = useState<'all' | 'registry' | 'mmp' | 'with_gps'>('all');
  
  const [newHub, setNewHub] = useState({
    name: '',
    description: '',
    states: [] as string[]
  });
  
  const [newSite, setNewSite] = useState({
    site_name: '',
    state_id: '',
    locality_id: '',
    activity_type: 'TPM',
    gps_latitude: '',
    gps_longitude: ''
  });

  const userRole = currentUser?.role?.toLowerCase() || '';
  const canManage = isSuperAdmin || userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Use Promise.allSettled to prevent one failure from blocking others
      // Add a 15-second timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Data load timeout')), 15000)
      );
      
      await Promise.race([
        Promise.allSettled([loadHubs(), loadSites(), loadProjectScopes()]),
        timeoutPromise
      ]);
    } catch (err) {
      console.error('Error loading Hub Operations data:', err);
      toast({ 
        title: 'Warning', 
        description: 'Some data may not have loaded. Please refresh the page.', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  const loadHubs = async () => {
    try {
      const { data: hubsData, error: hubsError } = await supabase
        .from('hubs')
        .select('*')
        .order('name');
      
      if (hubsError) throw hubsError;

      const { data: hubStatesData, error: statesError } = await supabase
        .from('hub_states')
        .select('*');
      
      if (statesError && statesError.code !== '42P01') throw statesError;

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

  const loadSites = async () => {
    try {
      // Load sites from sites_registry (master registry)
      const { data: registrySites, error: registryError } = await supabase
        .from('sites_registry')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (registryError && registryError.code !== '42P01') {
        console.error('Error loading registry sites:', registryError);
      }

      // Load unique sites from MMP entries (sites uploaded via MMP)
      // Try with registry_site_id first, fallback to basic query if column doesn't exist
      let mmpSites: any[] | null = null;
      
      const { data: mmpSitesWithRegistry, error: mmpErrorWithRegistry } = await supabase
        .from('mmp_site_entries')
        .select('id, site_code, site_name, state, locality, hub_office, registry_site_id, created_at')
        .order('created_at', { ascending: false });
      
      if (mmpErrorWithRegistry && mmpErrorWithRegistry.code === '42703') {
        // Column doesn't exist, try without registry_site_id
        const { data: mmpSitesBasic, error: mmpErrorBasic } = await supabase
          .from('mmp_site_entries')
          .select('id, site_code, site_name, state, locality, hub_office, created_at')
          .order('created_at', { ascending: false });
        
        if (mmpErrorBasic && mmpErrorBasic.code !== '42P01') {
          console.error('Error loading MMP sites:', mmpErrorBasic);
        }
        mmpSites = mmpSitesBasic;
      } else {
        if (mmpErrorWithRegistry && mmpErrorWithRegistry.code !== '42P01') {
          console.error('Error loading MMP sites:', mmpErrorWithRegistry);
        }
        mmpSites = mmpSitesWithRegistry;
      }

      // Combine sites: registry sites + unique MMP sites not in registry
      const combinedSites: SiteRegistry[] = [];
      const seenSiteKeys = new Set<string>();

      // Add registry sites first (they are the canonical source)
      for (const site of (registrySites || [])) {
        const siteKey = `${site.site_code || ''}-${site.site_name}-${site.state_name}-${site.locality_name}`.toLowerCase();
        seenSiteKeys.add(siteKey);
        combinedSites.push({
          ...site,
          source: 'registry' as const
        });
      }

      // Add MMP sites that don't have a registry entry yet
      for (const mmpSite of (mmpSites || [])) {
        // Skip if already linked to registry
        if (mmpSite.registry_site_id) {
          continue;
        }
        
        const siteKey = `${mmpSite.site_code || ''}-${mmpSite.site_name}-${mmpSite.state}-${mmpSite.locality}`.toLowerCase();
        if (seenSiteKeys.has(siteKey)) {
          continue; // Already have this site from registry or earlier MMP entry
        }
        seenSiteKeys.add(siteKey);

        // Convert MMP site to SiteRegistry format
        combinedSites.push({
          id: mmpSite.id,
          site_code: mmpSite.site_code || generateSiteCode(mmpSite.state || '', mmpSite.locality || '', mmpSite.site_name || '', 1, 'TPM'),
          site_name: mmpSite.site_name || '',
          state_id: mmpSite.state?.toLowerCase().replace(/\s+/g, '-') || '',
          state_name: mmpSite.state || '',
          locality_id: mmpSite.locality?.toLowerCase().replace(/\s+/g, '-') || '',
          locality_name: mmpSite.locality || '',
          hub_id: '',
          hub_name: mmpSite.hub_office || '',
          gps_latitude: null,
          gps_longitude: null,
          activity_type: 'TPM',
          status: 'active',
          mmp_count: 1,
          created_at: mmpSite.created_at || new Date().toISOString(),
          updated_at: mmpSite.created_at || new Date().toISOString(),
          created_by: '',
          source: 'mmp' as const
        });
      }

      console.log(`Loaded ${combinedSites.length} sites (${registrySites?.length || 0} from registry, ${combinedSites.length - (registrySites?.length || 0)} from MMP)`);
      setSites(combinedSites);
      localStorage.removeItem('pact_sites_local');
    } catch (err) {
      console.error('Error loading sites from database:', err);
      setSites([]);
    }
  };

  const loadProjectScopes = async () => {
    try {
      const { data, error } = await supabase
        .from('project_scopes')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error && error.code !== '42P01') throw error;
      setProjectScopes(data || []);
    } catch (err) {
      console.error('Error loading project scopes:', err);
      setProjectScopes([]);
    }
  };

  const fetchMmpEntryDataForSite = async (site: SiteRegistry): Promise<any> => {
    try {
      let mmpEntry = null;
      
      if (site.id) {
        const { data: entryById, error: byIdError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .eq('registry_site_id', site.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (!byIdError && entryById) {
          mmpEntry = entryById;
        }
      }
      
      if (!mmpEntry && site.site_code) {
        const { data: entryByCode, error: byCodeError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .eq('site_code', site.site_code)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (!byCodeError && entryByCode) {
          mmpEntry = entryByCode;
        }
      }
      
      if (!mmpEntry && site.site_name && site.state_name) {
        const { data: entryByName, error: byNameError } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .ilike('site_name', site.site_name)
          .ilike('state', site.state_name)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (!byNameError && entryByName) {
          mmpEntry = entryByName;
        }
      }
      
      if (mmpEntry) {
        return {
          ...site,
          hub_office: mmpEntry.hub_office,
          hubOffice: mmpEntry.hub_office,
          cp_name: mmpEntry.cp_name,
          cpName: mmpEntry.cp_name,
          activity_at_site: mmpEntry.activity_at_site,
          siteActivity: mmpEntry.activity_at_site,
          survey_tool: mmpEntry.survey_tool,
          surveyTool: mmpEntry.survey_tool,
          monitoring_by: mmpEntry.monitoring_by,
          monitoringBy: mmpEntry.monitoring_by,
          main_activity: mmpEntry.main_activity,
          mainActivity: mmpEntry.main_activity,
          visit_date: mmpEntry.visit_date,
          visitDate: mmpEntry.visit_date,
          visit_type: mmpEntry.visit_type,
          visitType: mmpEntry.visit_type,
          use_market_diversion: mmpEntry.use_market_diversion,
          useMarketDiversion: mmpEntry.use_market_diversion,
          use_warehouse_monitoring: mmpEntry.use_warehouse_monitoring,
          useWarehouseMonitoring: mmpEntry.use_warehouse_monitoring,
          comments: mmpEntry.comments,
          status: mmpEntry.status,
          additional_data: mmpEntry.additional_data,
          additionalData: mmpEntry.additional_data,
          mmp_entry_id: mmpEntry.id,
        };
      }
      
      return site;
    } catch (err) {
      console.error('Error fetching MMP entry data for site:', err);
      return site;
    }
  };

  const handleViewSiteDetails = async (site: SiteRegistry) => {
    const enrichedSite = await fetchMmpEntryDataForSite(site);
    setSelectedSite(enrichedSite);
    setSiteDetailOpen(true);
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
    if (newHub.states.length === 0) {
      toast({ title: 'Error', description: 'Please select at least one state', variant: 'destructive' });
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

      toast({ title: 'Success', description: 'Hub created successfully', variant: 'default' });
      loadHubs();

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

      toast({ title: 'Success', description: 'Hub updated successfully', variant: 'default' });
      loadHubs();

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
    if (!deleteTarget || deleteTarget.type !== 'hub') return;

    try {
      setLoading(true);
      const { error } = await supabase.from('hubs').delete().eq('id', deleteTarget.id);

      if (error && error.code === '42P01') {
        const filteredHubs = hubs.filter(h => h.id !== deleteTarget.id);
        setHubs(filteredHubs);
        localStorage.setItem('pact_hubs_local', JSON.stringify(filteredHubs));
        toast({ title: 'Success', description: 'Hub deleted successfully', variant: 'default' });
      } else if (error) {
        throw error;
      } else {
        toast({ title: 'Success', description: 'Hub deleted successfully', variant: 'default' });
        loadHubs();
      }
    } catch (err) {
      console.error('Error deleting hub:', err);
      toast({ title: 'Error', description: 'Failed to delete hub', variant: 'destructive' });
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
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
        s.state_id === newSite.state_id && s.locality_id === newSite.locality_id
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

      const { error } = await supabase.from('sites_registry').insert(siteData);

      if (error && error.code === '42P01') {
        const newSites = [siteData, ...sites];
        setSites(newSites);
        localStorage.setItem('pact_sites_local', JSON.stringify(newSites));
        toast({ title: 'Success', description: `Site registered: ${siteCode}`, variant: 'default' });
      } else if (error) {
        throw error;
      } else {
        toast({ title: 'Success', description: `Site registered: ${siteCode}`, variant: 'default' });
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

  const handleDeleteSite = async () => {
    if (!deleteTarget || deleteTarget.type !== 'site') return;

    try {
      setLoading(true);
      const { error } = await supabase.from('sites_registry').delete().eq('id', deleteTarget.id);

      if (error && error.code === '42P01') {
        const filteredSites = sites.filter(s => s.id !== deleteTarget.id);
        setSites(filteredSites);
        localStorage.setItem('pact_sites_local', JSON.stringify(filteredSites));
        toast({ title: 'Success', description: 'Site deleted successfully', variant: 'default' });
      } else if (error) {
        throw error;
      } else {
        toast({ title: 'Success', description: 'Site deleted successfully', variant: 'default' });
        loadSites();
      }
    } catch (err) {
      console.error('Error deleting site:', err);
      toast({ title: 'Error', description: 'Failed to delete site', variant: 'destructive' });
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const filteredSites = useMemo(() => {
    return sites.filter(site => {
      const matchesSearch = !searchTerm || 
        site.site_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        site.site_code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesState = !filterState || site.state_id === filterState;
      const matchesHub = !filterHub || site.hub_id === filterHub;
      const matchesActivity = !filterActivityType || site.activity_type === filterActivityType;
      
      let matchesSourceFilter = true;
      if (siteSourceFilter === 'registry') {
        matchesSourceFilter = site.source === 'registry';
      } else if (siteSourceFilter === 'mmp') {
        matchesSourceFilter = site.source === 'mmp';
      } else if (siteSourceFilter === 'with_gps') {
        matchesSourceFilter = !!(site.gps_latitude && site.gps_longitude);
      }
      
      return matchesSearch && matchesState && matchesHub && matchesActivity && matchesSourceFilter;
    });
  }, [sites, searchTerm, filterState, filterHub, filterActivityType, siteSourceFilter]);

  const stats = useMemo(() => ({
    totalHubs: hubs.length,
    totalStates: sudanStates.length,
    totalLocalities: getTotalLocalityCount(),
    totalSites: sites.length,
    activeSites: sites.filter(s => s.status === 'active').length,
  }), [hubs, sites]);

  const getHubForState = (stateId: string) => {
    return hubs.find(h => h.states.includes(stateId));
  };

  const getSiteCountForState = (stateId: string) => {
    return sites.filter(s => s.state_id === stateId).length;
  };

  const mapLocations = useMemo(() => {
    return sites
      .filter(s => s.gps_latitude && s.gps_longitude)
      .map(s => ({
        id: s.id,
        name: s.site_name,
        latitude: s.gps_latitude!,
        longitude: s.gps_longitude!,
        type: 'site' as const,
        status: s.status,
      }));
  }, [sites]);

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
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2" data-testid="text-page-title">
            <Building2 className="h-8 w-8 text-primary" />
            Hub & Field Operations
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage geographical scope, hubs, states, localities, and site registry
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={loadData}
            disabled={loading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
          
          <Dialog open={hubDialogOpen} onOpenChange={setHubDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => { setEditingHub(null); setNewHub({ name: '', description: '', states: [] }); }} data-testid="button-add-hub">
                <Plus className="mr-2 h-4 w-4" />
                Add Hub
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
                <div className="space-y-2">
                  <Label>Assign States *</Label>
                  <p className="text-sm text-muted-foreground">Select states to include in this hub. States already assigned to other hubs are disabled.</p>
                  <ScrollArea className="h-64 border rounded-md p-3">
                    <div className="space-y-2">
                      {sudanStates.map(state => {
                        const isSelected = (editingHub?.states ?? newHub.states).includes(state.id);
                        const assignedHub = hubs.find(h => 
                          h.id !== editingHub?.id && h.states.includes(state.id)
                        );
                        const isDisabled = !!assignedHub;
                        
                        return (
                          <div 
                            key={state.id} 
                            className={`flex items-center space-x-2 p-2 rounded ${
                              isDisabled 
                                ? 'opacity-50 cursor-not-allowed bg-muted' 
                                : `cursor-pointer hover:bg-accent ${isSelected ? 'bg-primary/10' : ''}`
                            }`}
                            onClick={() => {
                              if (isDisabled) return;
                              const currentStates = editingHub?.states ?? newHub.states;
                              const updatedStates = isSelected
                                ? currentStates.filter(s => s !== state.id)
                                : [...currentStates, state.id];
                              editingHub 
                                ? setEditingHub({ ...editingHub, states: updatedStates })
                                : setNewHub({ ...newHub, states: updatedStates });
                            }}
                          >
                            <Checkbox checked={isSelected} disabled={isDisabled} />
                            <div className="flex-1">
                              <p className="font-medium">{state.name}</p>
                              {isDisabled ? (
                                <p className="text-xs text-destructive">Assigned to: {assignedHub?.name}</p>
                              ) : (
                                <p className="text-xs text-muted-foreground">{state.localities.length} localities</p>
                              )}
                            </div>
                            <Badge variant={isDisabled ? "secondary" : "outline"}>{state.code}</Badge>
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
                <Button onClick={editingHub ? handleUpdateHub : handleCreateHub} disabled={loading}>
                  {editingHub ? 'Update Hub' : 'Create Hub'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={siteDialogOpen} onOpenChange={setSiteDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => setNewSite({ site_name: '', state_id: '', locality_id: '', activity_type: 'TPM', gps_latitude: '', gps_longitude: '' })} data-testid="button-add-site">
                <Navigation className="mr-2 h-4 w-4" />
                Register Site
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Register New Site</DialogTitle>
                <DialogDescription>
                  Add a new site to the registry with a unique site code
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Site Name *</Label>
                  <Input
                    value={newSite.site_name}
                    onChange={(e) => setNewSite({ ...newSite, site_name: e.target.value })}
                    placeholder="Enter site name"
                    data-testid="input-site-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>State *</Label>
                    <Select value={newSite.state_id} onValueChange={(val) => setNewSite({ ...newSite, state_id: val, locality_id: '' })}>
                      <SelectTrigger data-testid="select-site-state">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {sudanStates.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Locality *</Label>
                    <Select 
                      value={newSite.locality_id} 
                      onValueChange={(val) => setNewSite({ ...newSite, locality_id: val })}
                      disabled={!newSite.state_id}
                    >
                      <SelectTrigger data-testid="select-site-locality">
                        <SelectValue placeholder="Select locality" />
                      </SelectTrigger>
                      <SelectContent>
                        {getLocalitiesByState(newSite.state_id).map(l => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Activity Type</Label>
                  <Select value={newSite.activity_type} onValueChange={(val) => setNewSite({ ...newSite, activity_type: val })}>
                    <SelectTrigger data-testid="select-activity-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TPM">TPM - Third Party Monitoring</SelectItem>
                      <SelectItem value="PDM">PDM - Post Distribution Monitoring</SelectItem>
                      <SelectItem value="CFM">CFM - Complaint Feedback Mechanism</SelectItem>
                      <SelectItem value="FCS">FCS - Food Consumption Score</SelectItem>
                      <SelectItem value="OTHER">OTHER</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>GPS Latitude</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={newSite.gps_latitude}
                      onChange={(e) => setNewSite({ ...newSite, gps_latitude: e.target.value })}
                      placeholder="15.5007"
                      data-testid="input-site-latitude"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>GPS Longitude</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={newSite.gps_longitude}
                      onChange={(e) => setNewSite({ ...newSite, gps_longitude: e.target.value })}
                      placeholder="32.5599"
                      data-testid="input-site-longitude"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSiteDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateSite} disabled={loading}>Register Site</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards - Users Management Style */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card 
          className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-blue-500 to-blue-700 text-white border-0"
          onClick={() => setActiveTab('hubs')}
          data-testid="card-total-hubs"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Total Hubs
            </CardTitle>
            <Building2 className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.totalHubs}</div>
            <p className="text-xs text-white/80 mt-1">
              Click to manage hubs
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-green-500 to-emerald-700 text-white border-0"
          onClick={() => setActiveTab('states')}
          data-testid="card-total-states"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              States
            </CardTitle>
            <MapPin className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.totalStates}</div>
            <p className="text-xs text-white/80 mt-1">
              Sudan admin level 1
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-purple-500 to-purple-700 text-white border-0"
          onClick={() => setActiveTab('states')}
          data-testid="card-total-localities"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Localities
            </CardTitle>
            <Globe className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.totalLocalities}</div>
            <p className="text-xs text-white/80 mt-1">
              Admin level 2
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-orange-500 to-red-600 text-white border-0"
          onClick={() => setActiveTab('sites')}
          data-testid="card-total-sites"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Registered Sites
            </CardTitle>
            <Navigation className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.totalSites}</div>
            <p className="text-xs text-white/80 mt-1">
              {stats.activeSites} active
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-cyan-500 to-teal-700 text-white border-0"
          onClick={() => setActiveTab('projects')}
          data-testid="card-project-scopes"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Project Scopes
            </CardTitle>
            <Layers className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{projectScopes.length}</div>
            <p className="text-xs text-white/80 mt-1">
              Linked projects
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-4">
          <TabsList className="grid w-full md:w-auto grid-cols-4 lg:inline-grid">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Map className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="hubs" data-testid="tab-hubs">
              <Building2 className="h-4 w-4 mr-2" />
              Hubs
            </TabsTrigger>
            <TabsTrigger value="states" data-testid="tab-states">
              <MapPin className="h-4 w-4 mr-2" />
              States
            </TabsTrigger>
            <TabsTrigger value="sites" data-testid="tab-sites">
              <Navigation className="h-4 w-4 mr-2" />
              Sites
              {sites.length > 0 && (
                <Badge variant="secondary" className="ml-2">{sites.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {activeTab === 'sites' && (
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sites..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-sites"
                />
              </div>
              <Select value={filterState || "all"} onValueChange={(val) => setFilterState(val === "all" ? "" : val)}>
                <SelectTrigger className="w-[150px]" data-testid="select-filter-state">
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {sudanStates.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode('grid')}
                  data-testid="button-view-grid"
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode('list')}
                  data-testid="button-view-list"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'map' ? 'secondary' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode('map')}
                  data-testid="button-view-map"
                >
                  <Map className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Overview Tab - Full Map */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="h-5 w-5" />
                Sudan Operations Map
              </CardTitle>
              <CardDescription>
                Interactive map showing all 18 states with their boundaries, hub assignments, and registered sites
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SudanMapView
                hubs={hubs}
                sites={sites}
                selectedStateId={selectedState}
                selectedHubId={filterHub || null}
                onStateClick={(stateId) => {
                  setSelectedState(stateId);
                  setActiveTab('states');
                }}
                onHubClick={(hubId) => {
                  setFilterHub(hubId);
                  setActiveTab('hubs');
                }}
                showHubLabels={true}
                showStateLabels={true}
                height="550px"
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hubs.slice(0, 6).map(hub => (
              <HubCard
                key={hub.id}
                hub={hub}
                sites={sites}
                canManage={canManage}
                onEdit={() => {
                  setEditingHub(hub);
                  setHubDialogOpen(true);
                }}
                onDelete={() => {
                  setDeleteTarget({ type: 'hub', id: hub.id, name: hub.name });
                  setDeleteDialogOpen(true);
                }}
                onViewDetails={() => {
                  setSelectedHub(hub);
                  setHubDetailOpen(true);
                }}
              />
            ))}
          </div>
        </TabsContent>

        {/* Hubs Tab */}
        <TabsContent value="hubs" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hubs.map(hub => (
              <HubCard
                key={hub.id}
                hub={hub}
                sites={sites}
                canManage={canManage}
                onEdit={() => {
                  setEditingHub(hub);
                  setHubDialogOpen(true);
                }}
                onDelete={() => {
                  setDeleteTarget({ type: 'hub', id: hub.id, name: hub.name });
                  setDeleteDialogOpen(true);
                }}
                onViewDetails={() => {
                  setSelectedHub(hub);
                  setHubDetailOpen(true);
                }}
              />
            ))}
          </div>
          
          {hubs.length === 0 && (
            <Card className="p-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Hubs Created</h3>
              <p className="text-muted-foreground mb-4">
                Create your first hub to start organizing states and sites
              </p>
              <Button onClick={() => setHubDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Hub
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* States Tab - State Map Cards */}
        <TabsContent value="states" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sudanStates.map(state => {
              const hub = getHubForState(state.id);
              const siteCount = getSiteCountForState(state.id);
              const coords = getStateCoords(state.id);
              
              return (
                <StateMapCard
                  key={state.id}
                  stateId={state.id}
                  stateName={state.name}
                  stateCode={state.code}
                  localities={state.localities}
                  siteCount={siteCount}
                  hubName={hub?.name}
                  coordinates={coords}
                  isSelected={selectedState === state.id}
                  onViewDetails={() => {
                    setSelectedState(state.id);
                    setStateDetailOpen(true);
                  }}
                />
              );
            })}
          </div>
        </TabsContent>

        {/* Sites Tab */}
        <TabsContent value="sites" className="space-y-4">
          {/* Sites Summary - Clickable Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card 
              className={`p-4 cursor-pointer transition-all hover-elevate ${siteSourceFilter === 'all' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSiteSourceFilter('all')}
              data-testid="card-total-sites"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Navigation className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Sites</p>
                  <p className="text-2xl font-bold">{sites.length}</p>
                </div>
              </div>
            </Card>
            <Card 
              className={`p-4 cursor-pointer transition-all hover-elevate ${siteSourceFilter === 'registry' ? 'ring-2 ring-green-500' : ''}`}
              onClick={() => setSiteSourceFilter(siteSourceFilter === 'registry' ? 'all' : 'registry')}
              data-testid="card-registry-sites"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Layers className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Registry</p>
                  <p className="text-2xl font-bold">{sites.filter(s => s.source === 'registry').length}</p>
                </div>
              </div>
            </Card>
            <Card 
              className={`p-4 cursor-pointer transition-all hover-elevate ${siteSourceFilter === 'mmp' ? 'ring-2 ring-amber-500' : ''}`}
              onClick={() => setSiteSourceFilter(siteSourceFilter === 'mmp' ? 'all' : 'mmp')}
              data-testid="card-mmp-sites"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Upload className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">From MMP</p>
                  <p className="text-2xl font-bold">{sites.filter(s => s.source === 'mmp').length}</p>
                </div>
              </div>
            </Card>
            <Card 
              className={`p-4 cursor-pointer transition-all hover-elevate ${siteSourceFilter === 'with_gps' ? 'ring-2 ring-blue-500' : ''}`}
              onClick={() => setSiteSourceFilter(siteSourceFilter === 'with_gps' ? 'all' : 'with_gps')}
              data-testid="card-gps-sites"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <MapPin className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">With GPS</p>
                  <p className="text-2xl font-bold">{sites.filter(s => s.gps_latitude && s.gps_longitude).length}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Active Filter Indicator */}
          {siteSourceFilter !== 'all' && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Filter className="h-3 w-3" />
                Showing: {siteSourceFilter === 'registry' ? 'Registry Sites' : siteSourceFilter === 'mmp' ? 'MMP Sites' : 'Sites with GPS'}
                ({filteredSites.length} sites)
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSiteSourceFilter('all')}
                data-testid="button-clear-filter"
              >
                Clear Filter
              </Button>
            </div>
          )}

          {viewMode === 'map' && (
            <Card>
              <CardContent className="p-0">
                <div className="h-[400px] rounded-lg overflow-hidden">
                  <LeafletMapContainer
                    locations={mapLocations}
                    height="400px"
                    defaultCenter={[15.5, 32.5]}
                    defaultZoom={5}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredSites.map(site => (
                <SiteCard
                  key={site.id}
                  site={site}
                  canManage={canManage}
                  onEdit={() => {
                    setEditingSite(site);
                    setSiteDialogOpen(true);
                  }}
                  onDelete={() => {
                    setDeleteTarget({ type: 'site', id: site.id, name: site.site_name });
                    setDeleteDialogOpen(true);
                  }}
                  onViewDetails={() => handleViewSiteDetails(site)}
                />
              ))}
            </div>
          )}

          {viewMode === 'list' && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Site Code</th>
                        <th className="text-left p-3 font-medium">Name</th>
                        <th className="text-left p-3 font-medium">State</th>
                        <th className="text-left p-3 font-medium">Locality</th>
                        <th className="text-left p-3 font-medium">Type</th>
                        <th className="text-left p-3 font-medium">Source</th>
                        <th className="text-left p-3 font-medium">GPS</th>
                        <th className="text-left p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSites.map(site => (
                        <tr key={site.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-mono text-sm">{site.site_code}</td>
                          <td className="p-3">{site.site_name}</td>
                          <td className="p-3">{site.state_name}</td>
                          <td className="p-3">{site.locality_name}</td>
                          <td className="p-3">
                            <Badge variant="outline">{site.activity_type}</Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant={site.source === 'registry' ? 'default' : 'secondary'}>
                              {site.source === 'registry' ? 'Registry' : 'MMP'}
                            </Badge>
                          </td>
                          <td className="p-3">
                            {site.gps_latitude && site.gps_longitude ? (
                              <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                <MapPin className="h-3 w-3 mr-1" />
                                Yes
                              </Badge>
                            ) : (
                              <Badge variant="secondary">No</Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                onClick={() => handleViewSiteDetails(site)}
                                data-testid={`button-view-site-${site.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {canManage && (
                                <>
                                  <Button size="icon" variant="ghost" onClick={() => {
                                    setEditingSite(site);
                                    setSiteDialogOpen(true);
                                  }}>
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => {
                                    setDeleteTarget({ type: 'site', id: site.id, name: site.site_name });
                                    setDeleteDialogOpen(true);
                                  }}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {filteredSites.length === 0 && (
            <Card className="p-12 text-center">
              <Navigation className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Sites Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm || filterState ? 'No sites match your filters' : 'Register your first site to get started'}
              </p>
              {!searchTerm && !filterState && (
                <Button onClick={() => setSiteDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Register Site
                </Button>
              )}
            </Card>
          )}
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects" className="space-y-4">
          <Card className="p-12 text-center">
            <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Project Scope Linking</h3>
            <p className="text-muted-foreground mb-4">
              Link projects to hubs and geographical areas. This feature integrates with the Projects page.
            </p>
            <Badge variant="outline">Coming Soon</Badge>
          </Card>
        </TabsContent>
      </Tabs>

      {/* State Detail Dialog */}
      <Dialog open={stateDetailOpen} onOpenChange={setStateDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedState && (() => {
            const state = sudanStates.find(s => s.id === selectedState);
            if (!state) return null;
            const hub = getHubForState(state.id);
            const stateSites = sites.filter(s => s.state_id === state.id);
            
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: getStateColor(state.id) }}
                    />
                    {state.name}
                    <Badge variant="outline">{state.code}</Badge>
                  </DialogTitle>
                  <DialogDescription>
                    {hub ? `Part of ${hub.name}` : 'Not assigned to any hub'}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  {/* State Map View */}
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Map className="h-4 w-4" />
                      State Location
                    </h4>
                    <div className="h-56 rounded-lg overflow-hidden border">
                      {(() => {
                        const stateCoords = getStateCoords(state.id);
                        const stateColor = getStateColor(state.id);
                        const stateGeoJSON = sudanStateBoundaries.features.find(
                          (f: any) => f.properties.id === state.id
                        );
                        const sitesWithGps = stateSites.filter(s => s.gps_latitude && s.gps_longitude);
                        
                        return (
                          <MapContainer
                            center={stateCoords}
                            zoom={7}
                            style={{ height: '100%', width: '100%' }}
                            scrollWheelZoom={true}
                          >
                            <TileLayer
                              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            />
                            {stateGeoJSON && (
                              <>
                                <FitBoundsToGeoJSON geoJson={stateGeoJSON} />
                                <GeoJSON
                                  data={stateGeoJSON as any}
                                  style={{
                                    color: stateColor,
                                    fillColor: stateColor,
                                    fillOpacity: 0.2,
                                    weight: 3,
                                  }}
                                />
                              </>
                            )}
                            <Circle
                              center={stateCoords}
                              radius={15000}
                              pathOptions={{
                                color: stateColor,
                                fillColor: stateColor,
                                fillOpacity: 0.4,
                                weight: 2,
                              }}
                            />
                            <Marker 
                              position={stateCoords}
                              icon={L.divIcon({
                                className: 'custom-state-center-marker',
                                html: `<div style="background-color: ${stateColor}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
                                iconSize: [20, 20],
                                iconAnchor: [10, 10],
                              })}
                            >
                              <Popup>
                                <div className="text-center">
                                  <strong>{state.name}</strong>
                                  <br />
                                  <span className="text-sm text-muted-foreground">State Capital</span>
                                </div>
                              </Popup>
                            </Marker>
                            {sitesWithGps.map(site => (
                              <Marker
                                key={site.id}
                                position={[site.gps_latitude!, site.gps_longitude!]}
                                icon={L.divIcon({
                                  className: 'custom-site-marker',
                                  html: `<div style="background-color: #10B981; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.3);"></div>`,
                                  iconSize: [12, 12],
                                  iconAnchor: [6, 6],
                                })}
                              >
                                <Popup>
                                  <div>
                                    <strong>{site.site_name}</strong>
                                    <br />
                                    <span className="text-sm">{site.locality_name}</span>
                                  </div>
                                </Popup>
                              </Marker>
                            ))}
                          </MapContainer>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      State boundaries shown - {stateSites.filter(s => s.gps_latitude && s.gps_longitude).length} registered sites with GPS displayed
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{state.localities.length}</p>
                      <p className="text-sm text-muted-foreground">Localities</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{stateSites.length}</p>
                      <p className="text-sm text-muted-foreground">Sites</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{stateSites.filter(s => s.status === 'active').length}</p>
                      <p className="text-sm text-muted-foreground">Active</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Localities ({state.localities.length})</h4>
                    <ScrollArea className="h-48 border rounded-md p-3">
                      <div className="grid grid-cols-2 gap-2">
                        {state.localities.map(loc => (
                          <div key={loc.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded text-sm">
                            <Globe className="h-3 w-3 text-muted-foreground" />
                            <span className="flex-1 truncate">{loc.name}</span>
                            {loc.nameAr && (
                              <span className="text-xs text-muted-foreground">{loc.nameAr}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  
                  {stateSites.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">Registered Sites ({stateSites.length})</h4>
                      <ScrollArea className="h-32 border rounded-md p-3">
                        <div className="space-y-2">
                          {stateSites.map(site => (
                            <div key={site.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                              <div className="flex items-center gap-2">
                                <Navigation className="h-3 w-3 text-muted-foreground" />
                                <span>{site.site_name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">{site.activity_type}</Badge>
                                <Badge variant={site.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                                  {site.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Hub Detail Dialog */}
      <Dialog open={hubDetailOpen} onOpenChange={setHubDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedHub && (() => {
            const hubSites = sites.filter(s => s.hub_id === selectedHub.id);
            const hubStates = selectedHub.states.map(stateId => 
              sudanStates.find(s => s.id === stateId)
            ).filter(Boolean);
            const totalLocalities = hubStates.reduce((acc, state) => 
              acc + (state?.localities.length || 0), 0
            );
            
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    {selectedHub.name}
                  </DialogTitle>
                  <DialogDescription>
                    {selectedHub.description || `Covering ${selectedHub.states.length} states`}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{selectedHub.states.length}</p>
                      <p className="text-sm text-muted-foreground">States</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{totalLocalities}</p>
                      <p className="text-sm text-muted-foreground">Localities</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{hubSites.length}</p>
                      <p className="text-sm text-muted-foreground">Sites</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Assigned States ({selectedHub.states.length})</h4>
                    <ScrollArea className="h-64 border rounded-md">
                      <Accordion type="multiple" className="w-full">
                        {hubStates.map(state => state && (
                          <AccordionItem key={state.id} value={state.id} className="border-b last:border-b-0">
                            <AccordionTrigger className="px-3 py-2 hover:no-underline" data-testid={`accordion-state-${state.id}`}>
                              <div className="flex items-center justify-between w-full pr-2">
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-3 h-3 rounded-full flex-shrink-0" 
                                    style={{ backgroundColor: getStateColor(state.id) }}
                                  />
                                  <span className="font-medium">{state.name}</span>
                                  <Badge variant="outline" className="text-xs">{state.code}</Badge>
                                </div>
                                <Badge variant="secondary" className="text-xs ml-2">
                                  {state.localities.length} localities
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-3 pb-3">
                              <div className="bg-muted/30 rounded-md p-2">
                                <ScrollArea className="h-40">
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {state.localities.map(locality => (
                                      <div 
                                        key={locality.id} 
                                        className="flex items-center gap-1.5 p-1.5 bg-background/60 rounded text-xs"
                                        data-testid={`locality-${locality.id}`}
                                      >
                                        <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                        <span className="truncate flex-1">{locality.name}</span>
                                        {locality.nameAr && (
                                          <span className="text-muted-foreground text-[10px] truncate max-w-[60px]">
                                            {locality.nameAr}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </ScrollArea>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </ScrollArea>
                  </div>
                  
                  {hubSites.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">Registered Sites ({hubSites.length})</h4>
                      <ScrollArea className="h-32 border rounded-md p-3">
                        <div className="space-y-2">
                          {hubSites.map(site => (
                            <div key={site.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                              <div className="flex items-center gap-2">
                                <Navigation className="h-3 w-3 text-muted-foreground" />
                                <span>{site.site_name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">{site.activity_type}</Badge>
                                <Badge variant={site.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                                  {site.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === 'hub' ? 'Hub' : 'Site'}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={deleteTarget?.type === 'hub' ? handleDeleteHub : handleDeleteSite}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Site Detail Dialog */}
      <SiteDetailDialog
        open={siteDetailOpen}
        onOpenChange={setSiteDetailOpen}
        site={selectedSite}
        editable={canManage}
        onUpdateSite={async (updatedSite) => {
          try {
            if (selectedSite?.source === 'registry') {
              const { error } = await supabase
                .from('sites_registry')
                .update({
                  site_name: updatedSite.site_name || updatedSite.siteName,
                  state_name: updatedSite.state || updatedSite.state_name,
                  locality_name: updatedSite.locality || updatedSite.locality_name,
                  gps_latitude: updatedSite.gps_latitude,
                  gps_longitude: updatedSite.gps_longitude,
                  updated_at: new Date().toISOString()
                })
                .eq('id', selectedSite.id);
              
              if (error) throw error;
            }
            await loadSites();
            toast({ title: 'Site Updated', description: 'Site details have been saved.' });
            return true;
          } catch (err) {
            console.error('Error updating site:', err);
            toast({ title: 'Error', description: 'Failed to update site.', variant: 'destructive' });
            return false;
          }
        }}
      />
    </div>
  );
}
