import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users, Wifi, WifiOff, Search, Filter, Building2, MapPin, CreditCard,
  Phone, Mail, Shield, RefreshCw, LayoutGrid, List, ChevronRight,
  Smartphone, Monitor, Clock, AlertCircle, CheckCircle, XCircle,
  User, Hash, Landmark, GitBranch, Globe, Activity, BarChart3, Copy
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { hubs, sudanStates, getLocalitiesByState, getStatesInHub } from "@/data/sudanStates";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/user/UserContext";
import { format, parseISO, formatDistanceToNow } from "date-fns";

/* ─── Types ─────────────────────────────────────────────── */
interface BankAccount {
  accountName?: string;
  accountNumber?: string;
  branch?: string;
  bankName?: string;
}

interface StaffProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  employee_id: string | null;
  hub_id: string | null;
  state_id: string | null;
  locality_id: string | null;
  availability: string | null;
  status: string | null;
  location: any | null;
  location_sharing: boolean | null;
  avatar_url: string | null;
  updated_at: string;
  created_at: string;
  bank_account: BankAccount | null;
  last_activity?: string | null;
  device_info?: string | null;
  app_version?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', admin: 'Admin', country_director: 'Country Director',
  fom: 'FOM', supervisor: 'Supervisor', coordinator: 'Coordinator',
  data_team: 'Data Team', financial_auditor: 'Financial Auditor', enumerator: 'Enumerator',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
  admin: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200',
  country_director: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  fom: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200',
  supervisor: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200',
  coordinator: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
  data_team: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  financial_auditor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200',
  enumerator: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
};

function availabilityBadge(av: string | null) {
  if (av === 'online') return { color: 'bg-green-500', label: 'Online', text: 'text-green-700 dark:text-green-400' };
  if (av === 'busy') return { color: 'bg-amber-500', label: 'Busy', text: 'text-amber-700 dark:text-amber-400' };
  return { color: 'bg-slate-400', label: 'Offline', text: 'text-slate-500' };
}

function maskAccount(num?: string) {
  if (!num) return '—';
  if (num.length <= 4) return num;
  return '•••• ' + num.slice(-4);
}

function initials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

/* ─── Profile Detail Modal ───────────────────────────────── */
function ProfileDetailModal({ profile, open, onClose }: { profile: StaffProfile | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  if (!profile) return null;

  const hub = hubs.find(h => h.id === profile.hub_id);
  const state = sudanStates.find(s => s.id === profile.state_id);
  const locality = state?.localities?.find((l: any) => l.id === profile.locality_id);
  const av = availabilityBadge(profile.availability);
  const ba = profile.bank_account;
  const hasBank = !!(ba?.accountNumber || ba?.accountName);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied`, description: text });
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto p-0">
        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-6 py-5">
          <DialogHeader>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold shrink-0">
                {initials(profile.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-white text-lg font-bold leading-tight">
                  {profile.full_name || 'Unknown'}
                </DialogTitle>
                <p className="text-white/70 text-xs mt-0.5">{profile.email}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${ROLE_COLORS[profile.role || ''] || 'bg-slate-100 text-slate-700'}`}>
                    {ROLE_LABELS[profile.role || ''] || profile.role || 'Unknown'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-white/20 text-white">
                    <span className={`w-1.5 h-1.5 rounded-full ${av.color}`} />
                    {av.label}
                  </span>
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Contact */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Contact Information</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Phone</p>
                <p className="text-sm font-medium">{profile.phone || '—'}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Employee ID</p>
                <p className="text-sm font-mono font-medium">{profile.employee_id || '—'}</p>
              </div>
            </div>
          </section>

          <Separator />

          {/* Location */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Assignment Location</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Building2 className="h-3 w-3" />Hub</p>
                <p className="text-sm font-semibold">{hub?.name || '—'}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" />State</p>
                <p className="text-sm font-semibold">{state?.name || '—'}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" />Locality</p>
                <p className="text-sm font-semibold">{(locality as any)?.name || '—'}</p>
              </div>
            </div>
            {profile.location && profile.location_sharing && (
              <div className="mt-2 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 px-3 py-2 flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                <span>GPS sharing active · {typeof profile.location === 'object' && profile.location.lat ? `${profile.location.lat?.toFixed(4)}, ${profile.location.lng?.toFixed(4)}` : 'Location available'}</span>
              </div>
            )}
          </section>

          <Separator />

          {/* Bank Account */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Landmark className="h-3 w-3" />
              Bank Account Details
              {hasBank
                ? <CheckCircle className="h-3 w-3 text-green-600" />
                : <XCircle className="h-3 w-3 text-red-500" />}
            </p>
            {hasBank ? (
              <div className="rounded-xl border-2 border-[#0F2041]/20 bg-gradient-to-br from-[#0F2041]/5 to-transparent p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Account Name</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold">{ba?.accountName || '—'}</p>
                      {ba?.accountName && (
                        <button onClick={() => copyText(ba.accountName!, 'Account Name')} className="text-muted-foreground hover:text-foreground transition-colors">
                          <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Account Number</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-mono font-bold">{ba?.accountNumber || '—'}</p>
                      {ba?.accountNumber && (
                        <button onClick={() => copyText(ba.accountNumber!, 'Account Number')} className="text-muted-foreground hover:text-foreground transition-colors">
                          <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Bank Name</p>
                    <p className="text-sm font-semibold">{ba?.bankName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Branch</p>
                    <p className="text-sm font-semibold">{ba?.branch || '—'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                No bank account registered — payments cannot be processed.
              </div>
            )}
          </section>

          <Separator />

          {/* Device & Activity */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              Activity & Device
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Clock className="h-3 w-3" />Last Active</p>
                <p className="text-xs font-medium">
                  {profile.last_activity
                    ? formatDistanceToNow(parseISO(profile.last_activity), { addSuffix: true })
                    : profile.updated_at
                      ? formatDistanceToNow(parseISO(profile.updated_at), { addSuffix: true })
                      : '—'}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Smartphone className="h-3 w-3" />Device</p>
                <p className="text-xs font-medium truncate">{profile.device_info || 'Unknown'}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><GitBranch className="h-3 w-3" />App Version</p>
                <p className="text-xs font-mono font-medium">{profile.app_version || 'Unknown'}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Hash className="h-3 w-3" />Profile ID</p>
                <p className="text-[10px] font-mono text-muted-foreground truncate">{profile.id}</p>
              </div>
            </div>
          </section>

          <Separator />

          {/* Timestamps */}
          <section className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Profile Created</span>
              <span>{profile.created_at ? format(parseISO(profile.created_at), 'dd MMM yyyy') : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Last Updated</span>
              <span>{profile.updated_at ? format(parseISO(profile.updated_at), 'dd MMM yyyy HH:mm') : '—'}</span>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */
export default function StaffDirectory() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<StaffProfile | null>(null);

  /* Filters */
  const [search, setSearch] = useState('');
  const [hubFilter, setHubFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [localityFilter, setLocalityFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // all | online | offline | busy
  const [bankFilter, setBankFilter] = useState('all'); // all | has | missing
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [activeTab, setActiveTab] = useState('directory');

  /* ── Derived filter options ── */
  const availableStates = useMemo(() => {
    if (hubFilter === 'all') return sudanStates;
    return getStatesInHub(hubFilter);
  }, [hubFilter]);

  const availableLocalities = useMemo(() => {
    if (stateFilter === 'all') return [];
    return getLocalitiesByState(stateFilter);
  }, [stateFilter]);

  /* ── Load profiles ── */
  const loadProfiles = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, employee_id, hub_id, state_id, locality_id, availability, status, location, location_sharing, avatar_url, updated_at, created_at')
        .order('full_name');

      if (error) throw error;

      /* Fetch bank_account separately since it may be in metadata */
      const profileIds = (data || []).map(p => p.id);

      /* Try fetching extended data with bank_account from auth.users metadata or profiles extra */
      const enriched: StaffProfile[] = await Promise.all((data || []).map(async (p) => {
        let bank_account: BankAccount | null = null;
        let last_activity: string | null = null;
        let device_info: string | null = null;
        let app_version: string | null = null;

        /* Fetch bank account from profiles extended query */
        try {
          const { data: extData } = await supabase
            .from('profiles' as any)
            .select('bank_account')
            .eq('id', p.id)
            .single();
          if (extData && (extData as any).bank_account) {
            const ba = (extData as any).bank_account;
            bank_account = typeof ba === 'string' ? JSON.parse(ba) : ba;
          }
        } catch {}

        /* Fetch latest activity log for last_activity and device_info */
        try {
          const { data: actData } = await supabase
            .from('user_activity_logs' as any)
            .select('created_at, metadata')
            .eq('user_id', p.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (actData) {
            last_activity = (actData as any).created_at;
            const meta = (actData as any).metadata;
            if (meta?.deviceInfo?.userAgent) {
              const ua = meta.deviceInfo.userAgent as string;
              if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
                device_info = ua.includes('Android') ? 'Android Mobile' : ua.includes('iPhone') ? 'iPhone' : 'Mobile';
              } else {
                device_info = 'Desktop';
              }
              const appVer = meta?.appVersion || meta?.app_version;
              if (appVer) app_version = String(appVer);
            }
          }
        } catch {}

        return { ...p, bank_account, last_activity, device_info, app_version };
      }));

      setProfiles(enriched);
    } catch (err: any) {
      toast({ title: 'Error loading profiles', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadProfiles(); }, []);

  /* ── Filtered profiles ── */
  const filtered = useMemo(() => {
    return profiles.filter(p => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !p.full_name?.toLowerCase().includes(q) &&
          !p.email?.toLowerCase().includes(q) &&
          !p.phone?.toLowerCase().includes(q) &&
          !p.employee_id?.toLowerCase().includes(q)
        ) return false;
      }
      if (hubFilter !== 'all' && p.hub_id !== hubFilter) return false;
      if (stateFilter !== 'all' && p.state_id !== stateFilter) return false;
      if (localityFilter !== 'all' && p.locality_id !== localityFilter) return false;
      if (roleFilter !== 'all' && p.role !== roleFilter) return false;
      if (statusFilter === 'online' && p.availability !== 'online') return false;
      if (statusFilter === 'offline' && p.availability !== null && p.availability !== 'offline') return false;
      if (statusFilter === 'busy' && p.availability !== 'busy') return false;
      if (bankFilter === 'has' && !p.bank_account?.accountNumber) return false;
      if (bankFilter === 'missing' && p.bank_account?.accountNumber) return false;
      return true;
    });
  }, [profiles, search, hubFilter, stateFilter, localityFilter, roleFilter, statusFilter, bankFilter]);

  /* ── Summary stats ── */
  const stats = useMemo(() => ({
    total: profiles.length,
    online: profiles.filter(p => p.availability === 'online').length,
    busy: profiles.filter(p => p.availability === 'busy').length,
    withBank: profiles.filter(p => !!p.bank_account?.accountNumber).length,
    missingBank: profiles.filter(p => !p.bank_account?.accountNumber).length,
  }), [profiles]);

  /* ── Capacity breakdown ── */
  const capacityByHub = useMemo(() => {
    const map: Record<string, { name: string; total: number; online: number; withBank: number }> = {};
    profiles.forEach(p => {
      const hub = hubs.find(h => h.id === p.hub_id);
      const key = p.hub_id || 'unassigned';
      if (!map[key]) map[key] = { name: hub?.name || 'Unassigned', total: 0, online: 0, withBank: 0 };
      map[key].total++;
      if (p.availability === 'online') map[key].online++;
      if (p.bank_account?.accountNumber) map[key].withBank++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [profiles]);

  const capacityByRole = useMemo(() => {
    const map: Record<string, { name: string; total: number; online: number; withBank: number }> = {};
    profiles.forEach(p => {
      const key = p.role || 'unknown';
      if (!map[key]) map[key] = { name: ROLE_LABELS[key] || key, total: 0, online: 0, withBank: 0 };
      map[key].total++;
      if (p.availability === 'online') map[key].online++;
      if (p.bank_account?.accountNumber) map[key].withBank++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [profiles]);

  const capacityByState = useMemo(() => {
    const map: Record<string, { name: string; total: number; online: number; withBank: number }> = {};
    profiles.forEach(p => {
      const state = sudanStates.find(s => s.id === p.state_id);
      const key = p.state_id || 'unassigned';
      if (!map[key]) map[key] = { name: state?.name || 'Unassigned', total: 0, online: 0, withBank: 0 };
      map[key].total++;
      if (p.availability === 'online') map[key].online++;
      if (p.bank_account?.accountNumber) map[key].withBank++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [profiles]);

  const clearFilters = () => {
    setSearch(''); setHubFilter('all'); setStateFilter('all');
    setLocalityFilter('all'); setRoleFilter('all');
    setStatusFilter('all'); setBankFilter('all');
  };

  const hasActiveFilters = search || hubFilter !== 'all' || stateFilter !== 'all' ||
    localityFilter !== 'all' || roleFilter !== 'all' || statusFilter !== 'all' || bankFilter !== 'all';

  /* ── Profile Card ── */
  const ProfileCard = ({ p }: { p: StaffProfile }) => {
    const hub = hubs.find(h => h.id === p.hub_id);
    const state = sudanStates.find(s => s.id === p.state_id);
    const av = availabilityBadge(p.availability);
    const hasBank = !!p.bank_account?.accountNumber;
    return (
      <Card
        className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all border hover:border-[#0F2041]/30 group"
        onClick={() => setSelectedProfile(p)}
        data-testid={`card-profile-${p.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Avatar + online dot */}
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0F2041]/20 to-[#1D3461]/10 flex items-center justify-center text-[#0F2041] dark:text-blue-300 font-bold text-sm">
                {initials(p.full_name)}
              </div>
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${av.color}`} title={av.label} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <p className="font-semibold text-sm text-foreground truncate group-hover:text-[#0F2041] dark:group-hover:text-blue-300 transition-colors">
                  {p.full_name || 'Unknown'}
                </p>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>

              {/* Role */}
              <span className={`inline-flex mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_COLORS[p.role || ''] || 'bg-slate-100 text-slate-700'}`}>
                {ROLE_LABELS[p.role || ''] || p.role || 'No role'}
              </span>
            </div>
          </div>

          <Separator className="my-2.5" />

          {/* Location */}
          <div className="space-y-1">
            {hub && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="font-medium text-foreground">{hub.name}</span>
              </div>
            )}
            {state && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                {state.name}
              </div>
            )}
          </div>

          <Separator className="my-2.5" />

          {/* Bank account */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px]">
              <Landmark className="h-3 w-3 text-muted-foreground shrink-0" />
              {hasBank ? (
                <span className="font-mono text-foreground">{maskAccount(p.bank_account?.accountNumber)}</span>
              ) : (
                <span className="text-red-500 font-medium">No account</span>
              )}
            </div>
            {hasBank
              ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              : <XCircle className="h-3.5 w-3.5 text-red-400" />}
          </div>

          {/* Last active */}
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            {p.last_activity || p.updated_at
              ? formatDistanceToNow(parseISO(p.last_activity || p.updated_at), { addSuffix: true })
              : 'Unknown'}
            {p.device_info && (
              <>
                <span className="text-muted-foreground/40">·</span>
                {p.device_info.includes('Mobile') || p.device_info.includes('Android') || p.device_info.includes('iPhone')
                  ? <Smartphone className="h-3 w-3" />
                  : <Monitor className="h-3 w-3" />}
                <span>{p.device_info}</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  /* ── Capacity Row ── */
  const CapacityRow = ({ label, total, online, withBank, max }: any) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium truncate max-w-[55%]">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground">{total} staff</span>
          <span className="text-green-600 font-semibold">{online} online</span>
          <span className={`font-semibold ${withBank < total ? 'text-amber-600' : 'text-blue-600'}`}>{withBank} banked</span>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-[#0F2041] to-[#1D3461] rounded-full transition-all" style={{ width: `${(total / max) * 100}%` }} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-5">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-[#0F2041]" />
            Staff Directory
            <span className="text-sm font-normal text-muted-foreground mr-1">/ دليل الموظفين</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All staff profiles, account details, online presence, and capacity overview
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadProfiles(true)}
          disabled={refreshing}
          data-testid="button-refresh-profiles"
          className="gap-1.5 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Staff', value: stats.total, icon: Users, color: 'text-[#0F2041]', bg: 'bg-[#0F2041]/8' },
          { label: 'Online Now', value: stats.online, icon: Wifi, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30' },
          { label: 'Busy', value: stats.busy, icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'With Bank Account', value: stats.withBank, icon: Landmark, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Missing Account', value: stats.missingBank, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border">
            <CardContent className={`pt-3 pb-3 px-4 ${bg} rounded-lg`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{loading ? '—' : value}</p>
                </div>
                <Icon className={`h-6 w-6 ${color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Main Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 border rounded-xl p-1">
          <TabsTrigger value="directory" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-lg">
            <LayoutGrid className="h-3.5 w-3.5" />
            Directory
            <span className="ml-1 bg-white/20 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{filtered.length}</span>
          </TabsTrigger>
          <TabsTrigger value="bank_accounts" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-lg">
            <Landmark className="h-3.5 w-3.5" />
            Bank Accounts
          </TabsTrigger>
          <TabsTrigger value="capacity" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-lg">
            <BarChart3 className="h-3.5 w-3.5" />
            Capacity
          </TabsTrigger>
          <TabsTrigger value="online" className="gap-1.5 data-[state=active]:bg-green-600 data-[state=active]:text-white rounded-lg">
            <Wifi className="h-3.5 w-3.5" />
            Online Now
            {stats.online > 0 && <span className="ml-1 bg-white/25 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{stats.online}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ── Filter Bar (shared across tabs) ── */}
        <div className="mt-4 rounded-xl border bg-slate-50 dark:bg-slate-900/50 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search name, email, employee ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-staff-search"
              />
            </div>
            <Select value={hubFilter} onValueChange={v => { setHubFilter(v); setStateFilter('all'); setLocalityFilter('all'); }}>
              <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="select-hub-filter"><SelectValue placeholder="All Hubs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Hubs</SelectItem>
                {hubs.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stateFilter} onValueChange={v => { setStateFilter(v); setLocalityFilter('all'); }}>
              <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="select-state-filter"><SelectValue placeholder="All States" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {availableStates.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={localityFilter} onValueChange={setLocalityFilter} disabled={stateFilter === 'all'}>
              <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="select-locality-filter"><SelectValue placeholder={stateFilter === 'all' ? 'Select State First' : 'All Localities'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Localities</SelectItem>
                {availableLocalities.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-role-filter"><SelectValue placeholder="All Roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[120px] text-xs" data-testid="select-status-filter"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
            <Select value={bankFilter} onValueChange={setBankFilter}>
              <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-bank-filter"><SelectValue placeholder="All Accounts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                <SelectItem value="has">Has Bank Account</SelectItem>
                <SelectItem value="missing">Missing Account</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs gap-1 text-muted-foreground">
                <XCircle className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
            <div className="ml-auto flex gap-1">
              <Button variant={viewMode === 'cards' ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode('cards')} data-testid="button-view-cards">
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button variant={viewMode === 'table' ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode('table')} data-testid="button-view-table">
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {hasActiveFilters && (
            <p className="text-xs text-muted-foreground">
              Showing <strong className="text-foreground">{filtered.length}</strong> of {profiles.length} profiles
            </p>
          )}
        </div>

        {/* ── Directory Tab ── */}
        <TabsContent value="directory">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-4">
              {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-12 text-center text-muted-foreground space-y-2">
              <Users className="h-10 w-10 mx-auto opacity-30" />
              <p className="font-medium">No profiles match your filters</p>
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-4">
              {filtered.map(p => <ProfileCard key={p.id} p={p} />)}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-900">
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Hub</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Bank Account</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(p => {
                      const hub = hubs.find(h => h.id === p.hub_id);
                      const state = sudanStates.find(s => s.id === p.state_id);
                      const av = availabilityBadge(p.availability);
                      const hasBank = !!p.bank_account?.accountNumber;
                      return (
                        <TableRow key={p.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900" onClick={() => setSelectedProfile(p)}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <div className="w-7 h-7 rounded-full bg-[#0F2041]/10 flex items-center justify-center text-[10px] font-bold text-[#0F2041] dark:text-blue-300">{initials(p.full_name)}</div>
                                <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white dark:border-slate-900 ${av.color}`} />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{p.full_name || '—'}</p>
                                <p className="text-[10px] text-muted-foreground">{p.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell><Badge className={`text-[10px] ${ROLE_COLORS[p.role || ''] || ''}`}>{ROLE_LABELS[p.role || ''] || p.role || '—'}</Badge></TableCell>
                          <TableCell><span className={`text-xs font-semibold ${av.text}`}>{av.label}</span></TableCell>
                          <TableCell className="text-xs">{hub?.name || '—'}</TableCell>
                          <TableCell className="text-xs">{state?.name || '—'}</TableCell>
                          <TableCell>
                            {hasBank
                              ? <span className="text-xs font-mono">{maskAccount(p.bank_account?.accountNumber)}</span>
                              : <span className="text-xs text-red-500 font-medium">Missing</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.last_activity || p.updated_at ? formatDistanceToNow(parseISO(p.last_activity || p.updated_at), { addSuffix: true }) : '—'}
                          </TableCell>
                          <TableCell className="text-xs">{p.device_info || '—'}</TableCell>
                          <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Bank Accounts Tab ── */}
        <TabsContent value="bank_accounts">
          <div className="mt-4 space-y-3">
            {/* Missing accounts alert */}
            {stats.missingBank > 0 && (
              <div className="rounded-xl border-2 border-red-200 bg-red-50 dark:bg-red-950/20 px-5 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-red-800 dark:text-red-300">{stats.missingBank} staff member{stats.missingBank !== 1 ? 's' : ''} missing bank account</p>
                    <p className="text-xs text-red-600/80">Payments cannot be processed for these members.</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100 shrink-0"
                  onClick={() => setBankFilter('missing')}>View Missing</Button>
              </div>
            )}

            <div className="rounded-xl border overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-900 px-4 py-2.5 border-b flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Bank Account Registry · {filtered.length} profiles
                </p>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span className="text-green-600 font-semibold">{filtered.filter(p => p.bank_account?.accountNumber).length} registered</span>
                  <span>·</span>
                  <span className="text-red-500 font-semibold">{filtered.filter(p => !p.bank_account?.accountNumber).length} missing</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50 dark:bg-slate-900/50">
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Hub / State</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Account Number</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(p => {
                      const hub = hubs.find(h => h.id === p.hub_id);
                      const state = sudanStates.find(s => s.id === p.state_id);
                      const hasBank = !!p.bank_account?.accountNumber;
                      return (
                        <TableRow key={p.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900" onClick={() => setSelectedProfile(p)}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-[#0F2041]/10 flex items-center justify-center text-[10px] font-bold text-[#0F2041] dark:text-blue-300">{initials(p.full_name)}</div>
                              <div>
                                <p className="text-sm font-medium">{p.full_name || '—'}</p>
                                <p className="text-[10px] text-muted-foreground">{p.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell><Badge className={`text-[10px] ${ROLE_COLORS[p.role || ''] || ''}`}>{ROLE_LABELS[p.role || ''] || p.role || '—'}</Badge></TableCell>
                          <TableCell className="text-xs">{[hub?.name, state?.name].filter(Boolean).join(' / ') || '—'}</TableCell>
                          <TableCell className="text-sm font-medium">{p.bank_account?.accountName || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="font-mono text-sm font-bold">{p.bank_account?.accountNumber || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm">{p.bank_account?.bankName || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm">{p.bank_account?.branch || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell>
                            {hasBank
                              ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400"><CheckCircle className="h-3 w-3" />Registered</span>
                              : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600"><XCircle className="h-3 w-3" />Missing</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Capacity Tab ── */}
        <TabsContent value="capacity">
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* By Hub */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5"><Building2 className="h-4 w-4" />By Hub</CardTitle>
                <CardDescription className="text-xs">Staff capacity per hub office</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {capacityByHub.map(r => (
                  <CapacityRow key={r.name} label={r.name} total={r.total} online={r.online} withBank={r.withBank} max={Math.max(...capacityByHub.map(x => x.total))} />
                ))}
              </CardContent>
            </Card>

            {/* By State */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5"><MapPin className="h-4 w-4" />By State</CardTitle>
                <CardDescription className="text-xs">Staff capacity per state</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-h-80 overflow-y-auto">
                {capacityByState.map(r => (
                  <CapacityRow key={r.name} label={r.name} total={r.total} online={r.online} withBank={r.withBank} max={Math.max(...capacityByState.map(x => x.total))} />
                ))}
              </CardContent>
            </Card>

            {/* By Role */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5"><Shield className="h-4 w-4" />By Role</CardTitle>
                <CardDescription className="text-xs">Staff count per role</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {capacityByRole.map(r => (
                  <CapacityRow key={r.name} label={r.name} total={r.total} online={r.online} withBank={r.withBank} max={Math.max(...capacityByRole.map(x => x.total))} />
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Online Now Tab ── */}
        <TabsContent value="online">
          <div className="mt-4">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-40" />)}
              </div>
            ) : profiles.filter(p => p.availability === 'online').length === 0 ? (
              <div className="text-center py-16 text-muted-foreground space-y-2">
                <WifiOff className="h-10 w-10 mx-auto opacity-30" />
                <p className="font-medium">No staff currently online</p>
              </div>
            ) : (
              <>
                <div className="mb-3 text-sm text-muted-foreground">
                  <span className="font-bold text-green-600">{profiles.filter(p => p.availability === 'online').length}</span> staff online right now
                  {profiles.filter(p => p.availability === 'busy').length > 0 && (
                    <> · <span className="font-bold text-amber-600">{profiles.filter(p => p.availability === 'busy').length}</span> busy</>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {profiles
                    .filter(p => p.availability === 'online' || p.availability === 'busy')
                    .sort((a, b) => (a.availability === 'online' ? -1 : 1))
                    .map(p => <ProfileCard key={p.id} p={p} />)}
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Profile Detail Modal ── */}
      <ProfileDetailModal
        profile={selectedProfile}
        open={!!selectedProfile}
        onClose={() => setSelectedProfile(null)}
      />
    </div>
  );
}
