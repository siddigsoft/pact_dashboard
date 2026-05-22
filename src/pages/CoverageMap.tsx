import { useEffect, useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, MapPin, CheckCircle2, XCircle, Clock, AlertTriangle, Filter, Search, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface SiteRecord {
  id: string;
  name: string;
  locality: string | null;
  hub_name: string | null;
  latitude: number | null;
  longitude: number | null;
  visit_status: 'visited' | 'unvisited' | 'overdue' | 'postponed' | 'no_gps';
  visit_date: string | null;
  visit_id: string | null;
  cycle_name: string | null;
  data_collector: string | null;
}

interface Hub { id: string; name: string }
interface Cycle { id: string; name: string }

const STATUS_CFG = {
  visited:   { label: 'Visited',   color: '#22c55e', ringColor: 'text-green-600',  bg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  unvisited: { label: 'Unvisited', color: '#ef4444', ringColor: 'text-red-600',    bg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  overdue:   { label: 'Overdue',   color: '#f59e0b', ringColor: 'text-amber-600',  bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  postponed: { label: 'Postponed', color: '#8b5cf6', ringColor: 'text-purple-600', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  no_gps:    { label: 'No GPS',    color: '#94a3b8', ringColor: 'text-slate-500',  bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300' },
};

function FitBounds({ sites }: { sites: SiteRecord[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = sites.filter(s => s.latitude && s.longitude).map(s => [s.latitude!, s.longitude!] as [number, number]);
    if (pts.length > 0) {
      try { map.fitBounds(pts, { padding: [40, 40], maxZoom: 10 }); } catch { /* ignore */ }
    }
  }, [sites, map]);
  return null;
}

export default function CoverageMap() {
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const canAccess = hasAnyRole(['super_admin', 'admin', 'Admin', 'supervisor', 'fom', 'FOM', 'coordinator', 'country_director']);

  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [cycleId, setCycleId] = useState('all');
  const [hubId, setHubId] = useState('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SiteRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hubRes, cycleRes] = await Promise.all([
        supabase.from('hubs').select('id, name').order('name'),
        supabase.from('mmp_files').select('id, name').order('created_at', { ascending: false }).limit(20),
      ]);
      setHubs((hubRes.data ?? []) as Hub[]);
      setCycles((cycleRes.data ?? []) as Cycle[]);

      let siteQ = supabase
        .from('master_sites')
        .select(`
          id, name, locality, latitude, longitude,
          hubs!hub_id(name)
        `)
        .limit(2000);
      if (hubId !== 'all') siteQ = siteQ.eq('hub_id', hubId);
      const { data: sitesRaw, error: sErr } = await siteQ;
      if (sErr) throw sErr;

      let visitQ = supabase
        .from('site_visits')
        .select('id, site_id, status, visit_date, mmp_file_id, profiles!data_collector_id(full_name)')
        .order('visit_date', { ascending: false })
        .limit(5000);
      if (cycleId !== 'all') visitQ = visitQ.eq('mmp_file_id', cycleId);
      const { data: visitsRaw } = await visitQ;

      const visitMap: Record<string, typeof visitsRaw extends (infer T)[] | null ? T : never> = {};
      for (const v of visitsRaw ?? []) {
        if (!visitMap[v.site_id as string]) visitMap[v.site_id as string] = v as any;
      }

      const now = new Date();
      const result: SiteRecord[] = (sitesRaw ?? []).map((s: any) => {
        const visit = visitMap[s.id];
        let status: SiteRecord['visit_status'] = 'unvisited';
        if (!s.latitude || !s.longitude) status = 'no_gps';
        else if (visit) {
          if (visit.status === 'completed') status = 'visited';
          else if (visit.status === 'postponed') status = 'postponed';
          else {
            const visitDate = visit.visit_date ? new Date(visit.visit_date) : null;
            status = visitDate && visitDate < now ? 'overdue' : 'unvisited';
          }
        }
        return {
          id: s.id,
          name: s.name,
          locality: s.locality ?? null,
          hub_name: s.hubs?.name ?? null,
          latitude: s.latitude,
          longitude: s.longitude,
          visit_status: status,
          visit_date: visit?.visit_date ?? null,
          visit_id: visit?.id ?? null,
          cycle_name: null,
          data_collector: (visit as any)?.profiles?.full_name ?? null,
        };
      });
      setSites(result);
    } catch (err: unknown) {
      toast({ title: 'Load error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [hubId, cycleId, toast]);

  useEffect(() => { void load(); }, [load]);

  const handleRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = useMemo(() => {
    let r = sites;
    if (statusFilter !== 'all') r = r.filter(s => s.visit_status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(s => s.name.toLowerCase().includes(q) || (s.locality ?? '').toLowerCase().includes(q));
    }
    return r;
  }, [sites, statusFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { visited: 0, unvisited: 0, overdue: 0, postponed: 0, no_gps: 0 };
    for (const s of sites) c[s.visit_status]++;
    return c;
  }, [sites]);

  const coveragePct = sites.length ? Math.round((counts.visited / sites.length) * 100) : 0;

  const mappable = filtered.filter(s => s.latitude && s.longitude);

  if (!canAccess) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground">Access denied.</p>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-background flex items-center gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">MMP Coverage Map</h1>
          <Badge variant="outline" className="text-xs">{sites.length} sites</Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <Select value={cycleId} onValueChange={setCycleId}>
            <SelectTrigger className="h-8 w-44 text-xs" data-testid="select-cycle">
              <SelectValue placeholder="All Cycles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cycles</SelectItem>
              {cycles.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={hubId} onValueChange={setHubId}>
            <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-hub">
              <SelectValue placeholder="All Hubs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Hubs</SelectItem>
              {hubs.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-status-filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search site…"
              className="h-8 pl-7 w-40 text-xs"
              data-testid="input-search-site"
            />
          </div>

          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={handleRefresh} disabled={refreshing} data-testid="button-refresh-map">
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-6 gap-0 border-b shrink-0">
        <div className="px-4 py-2 border-r text-center">
          <p className="text-[11px] text-muted-foreground">Coverage</p>
          <p className="text-lg font-bold text-green-600">{coveragePct}%</p>
        </div>
        {Object.entries(STATUS_CFG).map(([k, v]) => (
          <div
            key={k}
            className={cn('px-3 py-2 border-r text-center cursor-pointer transition-colors hover:bg-muted/50', statusFilter === k && 'bg-muted')}
            onClick={() => setStatusFilter(statusFilter === k ? 'all' : k)}
          >
            <p className="text-[11px] text-muted-foreground">{v.label}</p>
            <p className="text-lg font-bold">{counts[k]}</p>
          </div>
        ))}
      </div>

      {/* Map + side panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <MapContainer
              center={[15.5, 32.5]}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <FitBounds sites={mappable} />
              {mappable.map(site => (
                <CircleMarker
                  key={site.id}
                  center={[site.latitude!, site.longitude!]}
                  radius={selected?.id === site.id ? 10 : 7}
                  pathOptions={{
                    fillColor: STATUS_CFG[site.visit_status].color,
                    color: selected?.id === site.id ? '#1e40af' : STATUS_CFG[site.visit_status].color,
                    weight: selected?.id === site.id ? 3 : 1.5,
                    fillOpacity: 0.85,
                  }}
                  eventHandlers={{ click: () => setSelected(site) }}
                >
                  <Popup>
                    <div className="text-sm min-w-[160px]">
                      <p className="font-semibold mb-1">{site.name}</p>
                      {site.locality && <p className="text-xs text-muted-foreground">{site.locality}</p>}
                      {site.hub_name && <p className="text-xs text-muted-foreground">Hub: {site.hub_name}</p>}
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ background: STATUS_CFG[site.visit_status].color + '25', color: STATUS_CFG[site.visit_status].color }}>
                        {STATUS_CFG[site.visit_status].label}
                      </span>
                      {site.visit_date && <p className="text-xs mt-1">Visited: {format(new Date(site.visit_date), 'MMM d, yyyy')}</p>}
                      {site.data_collector && <p className="text-xs">By: {site.data_collector}</p>}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          )}
        </div>

        {/* Side list */}
        <div className="w-72 border-l flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 border-b flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{filtered.length} sites</span>
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map(site => (
              <div
                key={site.id}
                className={cn(
                  'px-3 py-2.5 border-b cursor-pointer hover:bg-muted/50 transition-colors',
                  selected?.id === site.id && 'bg-primary/5 border-l-2 border-l-primary'
                )}
                onClick={() => setSelected(site)}
                data-testid={`row-site-${site.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{site.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{site.locality ?? site.hub_name ?? '—'}</p>
                  </div>
                  <Badge className={cn('text-[10px] px-1.5 shrink-0', STATUS_CFG[site.visit_status].bg)}>
                    {STATUS_CFG[site.visit_status].label}
                  </Badge>
                </div>
                {site.visit_date && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{format(new Date(site.visit_date), 'MMM d, yyyy')}</p>
                )}
                {!site.latitude && (
                  <p className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />No GPS coordinates
                  </p>
                )}
              </div>
            ))}
            {filtered.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Activity className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No sites match filters</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
