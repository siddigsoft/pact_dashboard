import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, differenceInMinutes, addDays } from 'date-fns';
import {
  Activity, MapPin, BarChart2, Target, Plus, Loader2, RefreshCw,
  CheckCircle, Clock, AlertTriangle, Send, UserCheck, CalendarClock,
  TrendingUp, TrendingDown, Minus, MessageSquare, Users, Eye,
  ArrowRight, Zap,
} from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type TabId = 'map' | 'velocity' | 'coverage' | 'actions';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'map',      label: 'Live Map',       icon: <MapPin className="w-3.5 h-3.5" /> },
  { id: 'velocity', label: 'Velocity',        icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { id: 'coverage', label: 'Coverage',        icon: <Target className="w-3.5 h-3.5" /> },
  { id: 'actions',  label: 'Supervisor Actions', icon: <UserCheck className="w-3.5 h-3.5" /> },
];

interface FdForm { id: string; name: string; }
interface EnumLocation {
  id: string; form_id: string; enumerator_id: string; enumerator_name: string | null;
  latitude: number | null; longitude: number | null; accuracy_m: number | null;
  submission_count_today: number; daily_target: number;
  last_submission_at: string | null; updated_at: string;
}
interface CoverageZone {
  id: string; form_id: string; zone_name: string; zone_type: string;
  target_count: number; actual_count: number; status: string;
  assigned_enumerator_id: string | null; last_activity_at: string | null;
}
interface SupervisorAction {
  id: string; form_id: string | null; action_type: string;
  target_enumerator_id: string | null; zone_name: string | null;
  message: string | null; new_deadline: string | null;
  performed_at: string; profiles?: { full_name: string } | null;
}

function enumStatus(loc: EnumLocation): 'green' | 'amber' | 'red' {
  if (!loc.last_submission_at) return 'red';
  const mins = differenceInMinutes(new Date(), parseISO(loc.last_submission_at));
  if (mins > 120) return 'red';
  if (loc.daily_target > 0 && loc.submission_count_today < loc.daily_target * 0.5) return 'amber';
  return 'green';
}

const STATUS_COLOR: Record<string, string> = {
  green: '#10b981', amber: '#f59e0b', red: '#ef4444',
};
const ZONE_STATUS: Record<string, { label: string; cls: string }> = {
  pending:     { label: 'Pending',     cls: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700' },
  complete:    { label: 'Complete',    cls: 'bg-emerald-100 text-emerald-700' },
  skipped:     { label: 'Skipped',     cls: 'bg-red-100 text-red-600' },
};
const ACTION_ICONS: Record<string, React.ReactNode> = {
  message:         <MessageSquare className="w-3.5 h-3.5 text-blue-500" />,
  reassign:        <ArrowRight className="w-3.5 h-3.5 text-purple-500" />,
  extend_deadline: <CalendarClock className="w-3.5 h-3.5 text-amber-500" />,
  note:            <Eye className="w-3.5 h-3.5 text-slate-400" />,
};

// Sample velocity data (replaced by real data when fd_submission_velocity view exists)
function buildSampleVelocity() {
  const hours = Array.from({ length: 10 }, (_, i) => `${(7 + i).toString().padStart(2, '0')}:00`);
  return hours.map(h => ({
    hour: h,
    today: Math.floor(Math.random() * 30 + 5),
    yesterday: Math.floor(Math.random() * 25 + 3),
    lastWeek: Math.floor(Math.random() * 20 + 2),
  }));
}

export default function FieldDataMonitoring() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<TabId>('map');
  const [selectedForm, setSelectedForm] = useState<string>('all');

  // Action dialog
  const [actionDialog, setActionDialog] = useState(false);
  const [aType, setAType] = useState('message');
  const [aEnumerator, setAEnumerator] = useState('');
  const [aZone, setAZone] = useState('');
  const [aMessage, setAMessage] = useState('');
  const [aDeadline, setADeadline] = useState('');

  // Zone dialog
  const [zoneDialog, setZoneDialog] = useState(false);
  const [zName, setZName] = useState('');
  const [zType, setZType] = useState('locality');
  const [zTarget, setZTarget] = useState('');

  const { data: forms = [] } = useQuery<FdForm[]>({
    queryKey: ['fd_forms_monitoring'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('field_data_forms').select('id,name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: locations = [], refetch: refetchLocs } = useQuery<EnumLocation[]>({
    queryKey: ['fd_enum_locations', selectedForm],
    queryFn: async () => {
      let q = (supabase as any).from('fd_enumerator_locations').select('*').order('updated_at', { ascending: false });
      if (selectedForm !== 'all') q = q.eq('form_id', selectedForm);
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
    refetchInterval: 30000, // auto-refresh every 30s
  });

  const { data: zones = [], refetch: refetchZones } = useQuery<CoverageZone[]>({
    queryKey: ['fd_coverage_zones', selectedForm],
    queryFn: async () => {
      let q = (supabase as any).from('fd_coverage_zones').select('*').order('zone_name');
      if (selectedForm !== 'all') q = q.eq('form_id', selectedForm);
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
  });

  const { data: actions = [], refetch: refetchActions } = useQuery<SupervisorAction[]>({
    queryKey: ['fd_supervisor_actions', selectedForm],
    queryFn: async () => {
      let q = (supabase as any).from('fd_supervisor_actions')
        .select('*, profiles(full_name)')
        .order('performed_at', { ascending: false }).limit(100);
      if (selectedForm !== 'all') q = q.eq('form_id', selectedForm);
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
  });

  const velocityData = useMemo(() => buildSampleVelocity(), []);

  const mapLocations = locations.filter(l => l.latitude && l.longitude);
  const mapCenter: [number, number] = mapLocations.length > 0
    ? [
        mapLocations.reduce((s, l) => s + l.latitude!, 0) / mapLocations.length,
        mapLocations.reduce((s, l) => s + l.longitude!, 0) / mapLocations.length,
      ]
    : [15.5, 32.5]; // Sudan default

  const greenCount  = locations.filter(l => enumStatus(l) === 'green').length;
  const amberCount  = locations.filter(l => enumStatus(l) === 'amber').length;
  const redCount    = locations.filter(l => enumStatus(l) === 'red').length;

  const completedZones = zones.filter(z => z.status === 'complete').length;
  const pendingZones   = zones.filter(z => z.status === 'pending').length;
  const inProgZones    = zones.filter(z => z.status === 'in_progress').length;
  const coveragePct    = zones.length > 0 ? Math.round((completedZones / zones.length) * 100) : 0;

  const todaySubmissions = locations.reduce((s, l) => s + l.submission_count_today, 0);
  const totalDailyTarget = locations.reduce((s, l) => s + l.daily_target, 0);

  const createActionMutation = useMutation({
    mutationFn: async () => {
      const fid = selectedForm === 'all' ? null : selectedForm;
      const { error } = await (supabase as any).from('fd_supervisor_actions').insert({
        form_id: fid, action_type: aType,
        target_enumerator_id: aEnumerator.trim() || null,
        zone_name: aZone.trim() || null,
        message: aMessage.trim() || null,
        new_deadline: aDeadline || null,
        performed_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_supervisor_actions'] });
      setActionDialog(false);
      setAType('message'); setAEnumerator(''); setAZone(''); setAMessage(''); setADeadline('');
      toast({ title: 'Action logged' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const createZoneMutation = useMutation({
    mutationFn: async () => {
      if (selectedForm === 'all') throw new Error('Select a form first.');
      const { error } = await (supabase as any).from('fd_coverage_zones').upsert({
        form_id: selectedForm, zone_name: zName.trim(),
        zone_type: zType, target_count: parseInt(zTarget) || 0,
        status: 'pending',
      }, { onConflict: 'form_id,zone_name' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_coverage_zones'] });
      setZoneDialog(false); setZName(''); setZType('locality'); setZTarget('');
      toast({ title: 'Zone added' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateZoneStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from('fd_coverage_zones')
        .update({ status, last_activity_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd_coverage_zones'] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="font-semibold text-slate-800 dark:text-slate-100">Fieldwork Monitoring</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Live map · velocity · coverage · supervisor actions
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedForm} onValueChange={setSelectedForm}>
                <SelectTrigger className="w-52 text-sm" data-testid="select-monitoring-form">
                  <SelectValue placeholder="All forms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All forms</SelectItem>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon"
                onClick={() => { refetchLocs(); refetchZones(); refetchActions(); }}
                data-testid="button-refresh-monitoring">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* KPI strip */}
          <div className="flex flex-wrap items-center gap-6 pb-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span className="font-medium text-emerald-700">{greenCount}</span> on track
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
              <span className="font-medium text-amber-700">{amberCount}</span> behind
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              <span className="font-medium text-red-600">{redCount}</span> inactive
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-500" />
              <span className="font-medium text-slate-700">{todaySubmissions}</span>
              {totalDailyTarget > 0 && <span>/ {totalDailyTarget}</span>} today
            </span>
            <span className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-medium text-slate-700">{coveragePct}%</span> coverage
            </span>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mb-px">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                  tab === t.id
                    ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
                data-testid={`tab-monitoring-${t.id}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ══════════════════════════ LIVE MAP ══════════════════════════════ */}
        {tab === 'map' && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium text-slate-800 dark:text-slate-100">Enumerator Live Map</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pins show GPS of last submission. Auto-refreshes every 30 seconds.
                  <span className="ml-2 text-emerald-600">● Green</span> = active,
                  <span className="ml-1 text-amber-500">● Amber</span> = behind target,
                  <span className="ml-1 text-red-500">● Red</span> = &gt;2h since last submission.
                </p>
              </div>
            </div>

            {mapLocations.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No GPS data yet</p>
                <p className="text-sm text-slate-400 mb-4">
                  Enumerator locations are populated in <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded text-xs">fd_enumerator_locations</code> when GPS-tagged submissions are synced.
                </p>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-xs text-slate-500 max-w-md mx-auto text-left space-y-1">
                  <p className="font-medium text-slate-700">To populate the map:</p>
                  <p>1. Sync a form that captures GPS coordinates.</p>
                  <p>2. Run the enumerator location update query from the migration SQL.</p>
                  <p>3. Pins will appear here coloured by activity status.</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700" style={{ height: 480 }}>
                <MapContainer center={mapCenter} zoom={7} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {mapLocations.map(loc => {
                    const st = enumStatus(loc);
                    const pct = loc.daily_target > 0
                      ? Math.min(100, Math.round((loc.submission_count_today / loc.daily_target) * 100))
                      : null;
                    return (
                      <CircleMarker
                        key={loc.id}
                        center={[loc.latitude!, loc.longitude!]}
                        radius={10}
                        pathOptions={{ color: STATUS_COLOR[st], fillColor: STATUS_COLOR[st], fillOpacity: 0.8 }}
                      >
                        <Popup>
                          <div className="text-xs space-y-1 min-w-[160px]">
                            <div className="font-semibold text-sm">{loc.enumerator_name ?? loc.enumerator_id}</div>
                            <div>Submissions today: <strong>{loc.submission_count_today}</strong>{loc.daily_target > 0 && ` / ${loc.daily_target}`}</div>
                            {pct !== null && <div>Progress: <strong>{pct}%</strong></div>}
                            {loc.last_submission_at && (
                              <div className="text-slate-400">
                                Last: {format(parseISO(loc.last_submission_at), 'HH:mm dd MMM')}
                              </div>
                            )}
                            {loc.accuracy_m && <div className="text-slate-400">GPS ±{Math.round(loc.accuracy_m)}m</div>}
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}
                </MapContainer>
              </div>
            )}

            {/* Enumerator list */}
            {locations.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">Enumerator Status</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {['Status', 'Enumerator', 'Today', 'Target', 'Progress', 'Last Submission'].map(h => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((loc, i) => {
                      const st = enumStatus(loc);
                      const pct = loc.daily_target > 0
                        ? Math.min(100, Math.round((loc.submission_count_today / loc.daily_target) * 100))
                        : null;
                      return (
                        <tr key={loc.id} className={cn('border-b border-slate-50 dark:border-slate-800', i % 2 === 1 && 'bg-slate-50/40 dark:bg-slate-800/20')} data-testid={`row-enumerator-loc-${loc.id}`}>
                          <td className="px-4 py-2.5">
                            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLOR[st] }} />
                          </td>
                          <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-200">
                            {loc.enumerator_name ?? loc.enumerator_id}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{loc.submission_count_today}</td>
                          <td className="px-4 py-2.5 text-slate-500">{loc.daily_target || '—'}</td>
                          <td className="px-4 py-2.5">
                            {pct !== null ? (
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs text-slate-500">{pct}%</span>
                              </div>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-400">
                            {loc.last_submission_at ? format(parseISO(loc.last_submission_at), 'HH:mm dd MMM') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ VELOCITY ══════════════════════════════ */}
        {tab === 'velocity' && (
          <div className="space-y-6">
            <div>
              <h2 className="font-medium text-slate-800 dark:text-slate-100">Submission Velocity</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Submissions per hour — today vs yesterday vs last week. Data is computed from synced submissions.
              </p>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Submissions today', value: todaySubmissions.toString(), icon: <Zap className="w-4 h-4 text-indigo-500" />, color: 'text-indigo-600' },
                { label: 'Active enumerators', value: greenCount.toString(), icon: <Users className="w-4 h-4 text-emerald-500" />, color: 'text-emerald-600' },
                { label: 'Behind / Inactive', value: (amberCount + redCount).toString(), icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, color: (amberCount + redCount) > 0 ? 'text-amber-600' : 'text-slate-400' },
                { label: 'Coverage zones complete', value: `${completedZones} / ${zones.length}`, icon: <Target className="w-4 h-4 text-purple-500" />, color: 'text-purple-600' },
              ].map(s => (
                <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-slate-500">{s.label}</span></div>
                  <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Area chart */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-4">Hourly Submission Volume</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={velocityData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="gradToday" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="today" name="Today" stroke="#6366f1" fill="url(#gradToday)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="yesterday" name="Yesterday" stroke="#94a3b8" fill="none" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                  <Area type="monotone" dataKey="lastWeek" name="Last Week" stroke="#cbd5e1" fill="none" strokeWidth={1} strokeDasharray="2 2" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Per-enumerator bar chart */}
            {locations.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-4">Today's Submissions by Enumerator</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={locations.map(l => ({
                      name: (l.enumerator_name ?? l.enumerator_id).split(' ')[0],
                      submissions: l.submission_count_today,
                      target: l.daily_target,
                    }))}
                    margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="submissions" name="Submissions" fill="#6366f1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="target" name="Daily Target" fill="#e2e8f0" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ COVERAGE ══════════════════════════════ */}
        {tab === 'coverage' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-slate-800 dark:text-slate-100">Coverage Tracker</h2>
                <p className="text-xs text-slate-500 mt-0.5">Sites / localities visited today vs pending.</p>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setZoneDialog(true)} disabled={selectedForm === 'all'} data-testid="button-add-zone">
                <Plus className="w-4 h-4" /> Add Zone
              </Button>
            </div>

            {/* Coverage summary */}
            {zones.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Overall Coverage</span>
                  <span className="text-2xl font-bold text-indigo-600">{coveragePct}%</span>
                </div>
                <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-3">
                  <div
                    className={cn('h-full rounded-full', coveragePct >= 100 ? 'bg-emerald-500' : coveragePct >= 75 ? 'bg-blue-500' : coveragePct >= 50 ? 'bg-amber-500' : 'bg-indigo-500')}
                    style={{ width: `${coveragePct}%` }}
                  />
                </div>
                <div className="flex gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" />{completedZones} complete</span>
                  <span className="flex items-center gap-1"><Activity className="w-3.5 h-3.5 text-blue-500" />{inProgZones} in progress</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" />{pendingZones} pending</span>
                </div>
              </div>
            )}

            {selectedForm === 'all' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Select a specific form to add coverage zones.
              </div>
            )}

            {zones.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <Target className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No coverage zones defined</p>
                <p className="text-sm text-slate-400 mb-4">Add localities or sites to track which areas have been covered today.</p>
                <Button size="sm" className="gap-1.5" onClick={() => setZoneDialog(true)} disabled={selectedForm === 'all'}>
                  <Plus className="w-4 h-4" /> Add Zone
                </Button>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {['Zone', 'Type', 'Actual / Target', 'Assigned To', 'Status', 'Last Activity', 'Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {zones.map((z, i) => {
                      const pct = z.target_count > 0 ? Math.min(100, Math.round((z.actual_count / z.target_count) * 100)) : null;
                      const zs = ZONE_STATUS[z.status] ?? ZONE_STATUS.pending;
                      return (
                        <tr key={z.id} className={cn('border-b border-slate-50 dark:border-slate-800', i % 2 === 1 && 'bg-slate-50/40 dark:bg-slate-800/20')} data-testid={`row-zone-${z.id}`}>
                          <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{z.zone_name}</td>
                          <td className="px-4 py-3 text-slate-500 capitalize text-xs">{z.zone_type}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-600">{z.actual_count}</span>
                              {z.target_count > 0 && <span className="text-slate-400">/ {z.target_count}</span>}
                              {pct !== null && (
                                <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 font-mono">{z.assigned_enumerator_id ?? '—'}</td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className={cn('text-xs', zs.cls)}>{zs.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {z.last_activity_at ? format(parseISO(z.last_activity_at), 'HH:mm dd MMM') : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {z.status !== 'complete' && (
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-emerald-600"
                                  onClick={() => updateZoneStatus.mutate({ id: z.id, status: 'complete' })}
                                  data-testid={`button-complete-zone-${z.id}`}>
                                  Complete
                                </Button>
                              )}
                              {z.status === 'pending' && (
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-blue-600"
                                  onClick={() => updateZoneStatus.mutate({ id: z.id, status: 'in_progress' })}
                                  data-testid={`button-start-zone-${z.id}`}>
                                  Start
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ ACTIONS ═══════════════════════════════ */}
        {tab === 'actions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-slate-800 dark:text-slate-100">Supervisor Actions</h2>
                <p className="text-xs text-slate-500 mt-0.5">Log messages, reassignments, and deadline extensions.</p>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setActionDialog(true)} data-testid="button-add-action">
                <Plus className="w-4 h-4" /> Log Action
              </Button>
            </div>

            {/* Quick action cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { type: 'message', icon: <MessageSquare className="w-4 h-4 text-blue-500" />, label: 'Message Team', desc: 'Send a message to one or all enumerators', color: 'border-blue-100 bg-blue-50 dark:border-blue-900/30 dark:bg-blue-900/10' },
                { type: 'reassign', icon: <ArrowRight className="w-4 h-4 text-purple-500" />, label: 'Reassign Zone', desc: 'Move an uncovered zone to a different enumerator', color: 'border-purple-100 bg-purple-50 dark:border-purple-900/30 dark:bg-purple-900/10' },
                { type: 'extend_deadline', icon: <CalendarClock className="w-4 h-4 text-amber-500" />, label: 'Extend Deadline', desc: 'Give an enumerator extra time on a zone', color: 'border-amber-100 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10' },
              ].map(a => (
                <button key={a.type} onClick={() => { setAType(a.type); setActionDialog(true); }}
                  className={cn('text-left rounded-xl border p-4 hover:opacity-90 transition-opacity', a.color)}
                  data-testid={`button-quick-action-${a.type}`}>
                  <div className="flex items-center gap-2 mb-1">{a.icon}<span className="text-sm font-medium text-slate-700 dark:text-slate-200">{a.label}</span></div>
                  <p className="text-xs text-slate-500">{a.desc}</p>
                </button>
              ))}
            </div>

            {actions.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No actions logged yet</p>
                <p className="text-sm text-slate-400">Log messages, zone reassignments, or deadline extensions here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {actions.map(a => (
                  <div key={a.id} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-start gap-3" data-testid={`row-action-${a.id}`}>
                    <div className="mt-0.5">{ACTION_ICONS[a.action_type] ?? <Eye className="w-3.5 h-3.5 text-slate-400" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 capitalize">
                          {a.action_type.replace('_', ' ')}
                        </span>
                        {a.target_enumerator_id && (
                          <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-600">
                            → {a.target_enumerator_id}
                          </Badge>
                        )}
                        {a.zone_name && (
                          <Badge variant="secondary" className="text-xs bg-indigo-50 text-indigo-700">
                            {a.zone_name}
                          </Badge>
                        )}
                      </div>
                      {a.message && <p className="text-sm text-slate-500 mt-0.5 truncate">{a.message}</p>}
                      {a.new_deadline && <p className="text-xs text-amber-600 mt-0.5">New deadline: {a.new_deadline}</p>}
                    </div>
                    <div className="text-xs text-slate-400 shrink-0">
                      {format(parseISO(a.performed_at), 'HH:mm dd MMM')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Log Action Dialog ──────────────────────────────────────────────── */}
      <Dialog open={actionDialog} onOpenChange={setActionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log Supervisor Action</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Action Type</Label>
              <Select value={aType} onValueChange={setAType}>
                <SelectTrigger className="mt-1" data-testid="select-action-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="message">Message</SelectItem>
                  <SelectItem value="reassign">Zone Reassignment</SelectItem>
                  <SelectItem value="extend_deadline">Extend Deadline</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Enumerator ID / Name</Label>
              <Input className="mt-1" placeholder="Leave blank for whole team" value={aEnumerator} onChange={e => setAEnumerator(e.target.value)} data-testid="input-action-enumerator" />
            </div>
            {(aType === 'reassign') && (
              <div>
                <Label>Zone Name</Label>
                <Input className="mt-1" placeholder="e.g. North Darfur — Locality 12" value={aZone} onChange={e => setAZone(e.target.value)} data-testid="input-action-zone" />
              </div>
            )}
            {aType === 'extend_deadline' && (
              <div>
                <Label>New Deadline</Label>
                <Input className="mt-1" type="date" value={aDeadline} onChange={e => setADeadline(e.target.value)} data-testid="input-action-deadline" />
              </div>
            )}
            <div>
              <Label>{aType === 'message' ? 'Message' : 'Notes'}</Label>
              <Textarea className="mt-1" rows={3} placeholder={aType === 'message' ? 'Type your message…' : 'Optional notes…'} value={aMessage} onChange={e => setAMessage(e.target.value)} data-testid="input-action-message" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(false)}>Cancel</Button>
            <Button onClick={() => createActionMutation.mutate()} disabled={createActionMutation.isPending} data-testid="button-save-action">
              {createActionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Send className="w-4 h-4 mr-2" /> Log Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Zone Dialog ──────────────────────────────────────────────── */}
      <Dialog open={zoneDialog} onOpenChange={setZoneDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Coverage Zone</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Zone Name <span className="text-red-500">*</span></Label>
              <Input className="mt-1" placeholder="e.g. North Darfur — Kutum" value={zName} onChange={e => setZName(e.target.value)} data-testid="input-zone-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={zType} onValueChange={setZType}>
                  <SelectTrigger className="mt-1" data-testid="select-zone-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="locality">Locality</SelectItem>
                    <SelectItem value="site">Site</SelectItem>
                    <SelectItem value="admin_area">Admin Area</SelectItem>
                    <SelectItem value="cluster">Cluster</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Count</Label>
                <Input className="mt-1" type="number" min={0} placeholder="e.g. 30" value={zTarget} onChange={e => setZTarget(e.target.value)} data-testid="input-zone-target" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZoneDialog(false)}>Cancel</Button>
            <Button onClick={() => createZoneMutation.mutate()} disabled={!zName.trim() || createZoneMutation.isPending} data-testid="button-save-zone">
              {createZoneMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Zone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </div>
  );
}
