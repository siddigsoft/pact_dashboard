import { useState, useEffect, useMemo, useCallback } from "react";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users, Wifi, WifiOff, Search, Building2, MapPin, Landmark,
  Phone, Mail, Shield, RefreshCw, LayoutGrid, List, ChevronRight,
  Smartphone, Monitor, Clock, AlertCircle, CheckCircle, XCircle,
  Hash, Globe, Activity, BarChart3, Copy, Download, FileSpreadsheet,
  FileText, FileDown, GitBranch
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { hubs, sudanStates, getLocalitiesByState, getStatesInHub } from "@/data/sudanStates";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import {
  exportStaffToExcel, exportStaffToPDF, exportStaffToCSV, type ExportProfile,
} from "@/utils/staffDirectoryExport";

/* ─── Types ─────────────────────────────────────────────── */
interface BankAccount { accountName?: string; accountNumber?: string; branch?: string; bankName?: string; }

/**
 * Normalize bank account — handles both web (camelCase) and mobile (snake_case) stored formats:
 * Web:    { accountName, accountNumber, branch, bankName }
 * Mobile: { account_name, account_number, bank_name, branch_code }
 */
function normalizeBA(raw: any): BankAccount | null {
  if (!raw) return null;
  const ba: BankAccount = {
    accountName:   raw.accountName   || raw.account_name   || undefined,
    accountNumber: raw.accountNumber || raw.account_number || undefined,
    bankName:      raw.bankName      || raw.bank_name      || undefined,
    branch:        raw.branch        || raw.branch_code    || undefined,
  };
  /* Only return if at least one field has data */
  return (ba.accountName || ba.accountNumber || ba.bankName || ba.branch) ? ba : null;
}

interface StaffProfile {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  role: string | null; employee_id: string | null; hub_id: string | null;
  state_id: string | null; locality_id: string | null; availability: string | null;
  status: string | null; location: any; location_sharing: boolean | null;
  updated_at: string; created_at: string; bank_account: BankAccount | null;
  last_activity: string | null; device_info: string | null; app_version: string | null;
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

function avBadge(av: string | null) {
  if (av === 'online') return { dot: 'bg-green-500', text: 'text-green-700 dark:text-green-400', label: 'Online' };
  if (av === 'busy')   return { dot: 'bg-amber-500',  text: 'text-amber-700 dark:text-amber-400',  label: 'Busy'   };
  return { dot: 'bg-slate-400', text: 'text-slate-500', label: 'Offline' };
}
function maskAcc(n?: string) { if (!n) return '—'; return n.length <= 4 ? n : '•••• ' + n.slice(-4); }
function initials(name: string | null) { if (!name) return '?'; return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); }
function lastActive(d: string | null, fallback?: string): string {
  const s = d || fallback; if (!s) return 'Unknown';
  try { return formatDistanceToNow(parseISO(s), { addSuffix: true }); } catch { return s; }
}

/* ─── Build ExportProfile array ─────────────────────────── */
function toExportProfiles(profiles: StaffProfile[]): ExportProfile[] {
  return profiles.map(p => {
    const hub      = hubs.find(h => h.id === p.hub_id);
    const state    = sudanStates.find(s => s.id === p.state_id);
    const locality = state?.localities?.find((l: any) => l.id === p.locality_id);
    return {
      id: p.id, full_name: p.full_name, email: p.email, phone: p.phone,
      role: p.role, employee_id: p.employee_id,
      hub_name:      hub?.name      || 'Unassigned',
      state_name:    state?.name    || 'Unassigned',
      locality_name: (locality as any)?.name || '—',
      availability: p.availability, bank_account: p.bank_account,
      last_activity: p.last_activity, device_info: p.device_info,
      app_version: p.app_version, location_sharing: p.location_sharing,
    };
  });
}

/* ─── Profile Detail Modal ───────────────────────────────── */
function ProfileDetail({ profile, onClose }: { profile: StaffProfile; onClose: () => void }) {
  const { toast } = useToast();
  const hub      = hubs.find(h => h.id === profile.hub_id);
  const state    = sudanStates.find(s => s.id === profile.state_id);
  const locality = state?.localities?.find((l: any) => l.id === profile.locality_id);
  const av       = avBadge(profile.availability);
  const ba       = profile.bank_account;
  const hasBank  = !!(ba?.accountNumber);

  const copy = (t: string, l: string) => { navigator.clipboard.writeText(t); toast({ title: `${l} copied`, description: t }); };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-6 py-5">
          <DialogHeader>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold shrink-0">
                {initials(profile.full_name)}
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-white text-lg font-bold leading-tight">{profile.full_name || 'Unknown'}</DialogTitle>
                <p className="text-white/70 text-xs mt-0.5">{profile.email}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${ROLE_COLORS[profile.role || ''] || 'bg-slate-100 text-slate-700'}`}>
                    {ROLE_LABELS[profile.role || ''] || profile.role || 'Unknown'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-white/20 text-white">
                    <span className={`w-1.5 h-1.5 rounded-full ${av.dot}`} />{av.label}
                  </span>
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Contact */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-[10px] text-muted-foreground">Phone</p><p className="text-sm font-medium">{profile.phone || '—'}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Employee ID</p><p className="text-sm font-mono font-medium">{profile.employee_id || '—'}</p></div>
            </div>
          </section>
          <Separator />

          {/* Location */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Assignment</p>
            <div className="grid grid-cols-3 gap-2">
              {[['Hub', hub?.name], ['State', state?.name], ['Locality', (locality as any)?.name]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-slate-50 dark:bg-slate-900 p-2.5">
                  <p className="text-[10px] text-muted-foreground mb-0.5">{l}</p>
                  <p className="text-sm font-semibold">{v || '—'}</p>
                </div>
              ))}
            </div>
            {profile.location && profile.location_sharing && (
              <div className="mt-2 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 px-3 py-2 flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                GPS sharing active {profile.location?.lat ? `· ${profile.location.lat?.toFixed(4)}, ${profile.location.lng?.toFixed(4)}` : ''}
              </div>
            )}
          </section>
          <Separator />

          {/* Bank Account */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Landmark className="h-3 w-3" />Bank Account
              {hasBank ? <CheckCircle className="h-3 w-3 text-green-600" /> : <XCircle className="h-3 w-3 text-red-500" />}
            </p>
            {hasBank ? (
              <div className="rounded-xl border-2 border-[#0F2041]/20 bg-gradient-to-br from-[#0F2041]/5 to-transparent p-4 grid grid-cols-2 gap-3">
                {[
                  ['Account Name', ba?.accountName],
                  ['Account Number', ba?.accountNumber, true],
                  ['Bank Name', ba?.bankName],
                  ['Branch', ba?.branch],
                ].map(([label, val, mono]) => (
                  <div key={label as string}>
                    <p className="text-[10px] text-muted-foreground mb-0.5">{label as string}</p>
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-${mono ? 'mono font-bold' : 'semibold'}`}>{val as string || '—'}</p>
                      {val && <button onClick={() => copy(val as string, label as string)} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />No bank account — payments cannot be processed.
              </div>
            )}
          </section>
          <Separator />

          {/* Activity */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Activity className="h-3 w-3" />Activity & Device
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                [<Clock className="h-3 w-3" />, 'Last Active', lastActive(profile.last_activity, profile.updated_at)],
                [<Smartphone className="h-3 w-3" />, 'Device', profile.device_info || 'Unknown'],
                [<GitBranch className="h-3 w-3" />, 'App Version', profile.app_version || 'Unknown'],
                [<Hash className="h-3 w-3" />, 'Profile ID', profile.id.slice(0, 8) + '…'],
              ].map(([icon, label, val]) => (
                <div key={label as string} className="rounded-lg bg-slate-50 dark:bg-slate-900 p-2.5">
                  <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">{icon as any}{label as string}</p>
                  <p className="text-xs font-medium truncate">{val as string}</p>
                </div>
              ))}
            </div>
          </section>
          <Separator />
          <section className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between"><span>Created</span><span>{profile.created_at ? format(parseISO(profile.created_at), 'dd MMM yyyy') : '—'}</span></div>
            <div className="flex justify-between"><span>Last Updated</span><span>{profile.updated_at ? format(parseISO(profile.updated_at), 'dd MMM yyyy HH:mm') : '—'}</span></div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Export Dropdown ────────────────────────────────────── */
function ExportMenu({ profiles, tab, label }: { profiles: StaffProfile[]; tab: string; label: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const exp = useCallback(async (type: 'excel' | 'pdf' | 'csv') => {
    if (!profiles.length) { toast({ title: 'No data to export', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const ep = toExportProfiles(profiles);
      const pdfTab = tab === 'bank_accounts' ? 'bank_accounts' : tab === 'capacity' ? 'capacity' : 'directory';
      if (type === 'excel') await exportStaffToExcel(ep, label);
      else if (type === 'pdf') exportStaffToPDF(ep, pdfTab, label);
      else exportStaffToCSV(ep, pdfTab);
      toast({ title: 'Export ready', description: `${profiles.length} records exported.` });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  }, [profiles, tab, label, toast]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy} className="gap-1.5 border-[#0F2041]/30 text-[#0F2041] dark:text-blue-300 hover:bg-[#0F2041]/5" data-testid="button-export-menu">
          <Download className="h-3.5 w-3.5" />
          {busy ? 'Exporting…' : 'Export'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => exp('excel')} data-testid="menu-export-excel" className="gap-2">
          <FileSpreadsheet className="h-4 w-4 text-green-700" />
          <span>Export to Excel</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exp('pdf')} data-testid="menu-export-pdf" className="gap-2">
          <FileText className="h-4 w-4 text-red-600" />
          <span>Export to PDF</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => exp('csv')} data-testid="menu-export-csv" className="gap-2">
          <FileDown className="h-4 w-4 text-blue-600" />
          <span>Export to CSV</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Capacity Row ───────────────────────────────────────── */
function CapRow({ label, total, online, withBank, max }: any) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium truncate max-w-[50%]">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground">{total}</span>
          <span className="text-green-600 font-semibold">{online} online</span>
          <span className={`font-semibold ${withBank < total ? 'text-amber-600' : 'text-blue-600'}`}>{withBank} banked</span>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-[#0F2041] to-[#1D3461] rounded-full transition-all"
          style={{ width: max > 0 ? `${(total / max) * 100}%` : '0%' }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function StaffDirectory() {
  const { toast } = useToast();
  const [profiles, setProfiles]           = useState<StaffProfile[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [selected, setSelected]           = useState<StaffProfile | null>(null);
  const [search, setSearch]               = useState('');
  const [hubFilter, setHubFilter]         = useState('all');
  const [stateFilter, setStateFilter]     = useState('all');
  const [localityFilter, setLocalFilter]  = useState('all');
  const [roleFilter, setRoleFilter]       = useState('all');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [bankFilter, setBankFilter]       = useState('all');
  const [viewMode, setViewMode]           = useState<'cards' | 'table'>('cards');
  const [activeTab, setActiveTab]         = useState('directory');

  /* ── Derived filter options ── */
  const availableStates = useMemo(() =>
    hubFilter === 'all' ? sudanStates : getStatesInHub(hubFilter), [hubFilter]);

  const availableLocalities = useMemo(() =>
    stateFilter === 'all' ? [] : getLocalitiesByState(stateFilter), [stateFilter]);

  /* ── FAST batch data load ─────────────────────────────── */
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      /* 1 — All profiles including bank_account JSON (one query) */
      const { data: pData, error: pErr } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, email, phone, role, employee_id, hub_id, state_id, locality_id, availability, status, location, location_sharing, updated_at, created_at, bank_account')
        .order('full_name');
      if (pErr) throw pErr;

      /* 2 — Latest activity per user (one batch query, limit 500) */
      const { data: actData } = await (supabase as any)
        .from('user_activity_logs')
        .select('user_id, created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(500);

      /* Build activity map: user_id → latest record */
      const actMap: Record<string, { created_at: string; metadata: any }> = {};
      (actData || []).forEach((a: any) => {
        if (!actMap[a.user_id]) actMap[a.user_id] = a;
      });

      /* 3 — Merge */
      const merged: StaffProfile[] = (pData || []).map((p: any) => {
        const act = actMap[p.id];
        /* Normalize bank account — handles both web (camelCase) and mobile (snake_case) keys */
        let raw = p.bank_account;
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
        const ba: BankAccount | null = normalizeBA(raw);
        let device_info: string | null = null;
        let app_version: string | null = null;
        if (act?.metadata?.deviceInfo?.userAgent) {
          const ua = act.metadata.deviceInfo.userAgent as string;
          device_info = ua.includes('Android') ? 'Android' : ua.includes('iPhone') ? 'iPhone' : ua.includes('Mobile') ? 'Mobile' : 'Desktop';
        }
        if (act?.metadata?.appVersion || act?.metadata?.app_version) {
          app_version = String(act.metadata.appVersion || act.metadata.app_version);
        }
        return {
          ...p,
          bank_account: ba,
          last_activity: act?.created_at || null,
          device_info,
          app_version,
        };
      });

      setProfiles(merged);
    } catch (err: any) {
      toast({ title: 'Error loading staff', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  /* ── Filters ─────────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return profiles.filter(p => {
      if (q && !p.full_name?.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q) &&
          !p.phone?.toLowerCase().includes(q) && !p.employee_id?.toLowerCase().includes(q)) return false;
      if (hubFilter !== 'all' && p.hub_id !== hubFilter) return false;
      if (stateFilter !== 'all' && p.state_id !== stateFilter) return false;
      if (localityFilter !== 'all' && p.locality_id !== localityFilter) return false;
      if (roleFilter !== 'all' && p.role !== roleFilter) return false;
      if (statusFilter === 'online' && p.availability !== 'online') return false;
      if (statusFilter === 'busy'   && p.availability !== 'busy')   return false;
      if (statusFilter === 'offline' && p.availability === 'online') return false;
      if (bankFilter === 'has'     && !p.bank_account?.accountNumber) return false;
      if (bankFilter === 'missing' && p.bank_account?.accountNumber) return false;
      return true;
    });
  }, [profiles, search, hubFilter, stateFilter, localityFilter, roleFilter, statusFilter, bankFilter]);

  /* ── Stats ─────────────────────────────────────────── */
  const stats = useMemo(() => ({
    total:       profiles.length,
    online:      profiles.filter(p => p.availability === 'online').length,
    busy:        profiles.filter(p => p.availability === 'busy').length,
    withBank:    profiles.filter(p => !!p.bank_account?.accountNumber).length,
    missingBank: profiles.filter(p => !p.bank_account?.accountNumber).length,
  }), [profiles]);

  /* ── Capacity maps ─────────────────────────────────── */
  const mkMap = (key: (p: StaffProfile) => string) => {
    const m: Record<string, { total: number; online: number; withBank: number }> = {};
    filtered.forEach(p => {
      const k = key(p);
      if (!m[k]) m[k] = { total: 0, online: 0, withBank: 0 };
      m[k].total++;
      if (p.availability === 'online') m[k].online++;
      if (p.bank_account?.accountNumber) m[k].withBank++;
    });
    return Object.entries(m).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  };
  const capHub   = useMemo(() => mkMap(p => hubs.find(h => h.id === p.hub_id)?.name || 'Unassigned'), [filtered]);
  const capRole  = useMemo(() => mkMap(p => ROLE_LABELS[p.role || ''] || p.role || 'Unknown'), [filtered]);
  const capState = useMemo(() => mkMap(p => sudanStates.find(s => s.id === p.state_id)?.name || 'Unassigned'), [filtered]);

  const clearFilters = () => { setSearch(''); setHubFilter('all'); setStateFilter('all'); setLocalFilter('all'); setRoleFilter('all'); setStatusFilter('all'); setBankFilter('all'); };
  const hasFilters = !!(search || hubFilter !== 'all' || stateFilter !== 'all' || localityFilter !== 'all' || roleFilter !== 'all' || statusFilter !== 'all' || bankFilter !== 'all');

  /* ── Filter label for export ── */
  const exportLabel = useMemo(() => {
    const parts = [];
    if (hubFilter !== 'all') parts.push(hubs.find(h => h.id === hubFilter)?.name);
    if (stateFilter !== 'all') parts.push(sudanStates.find(s => s.id === stateFilter)?.name);
    if (roleFilter !== 'all') parts.push(ROLE_LABELS[roleFilter] || roleFilter);
    if (statusFilter !== 'all') parts.push(statusFilter);
    if (bankFilter !== 'all') parts.push(bankFilter === 'has' ? 'With Bank' : 'Missing Bank');
    if (search) parts.push(`"${search}"`);
    return parts.filter(Boolean).join(', ');
  }, [hubFilter, stateFilter, roleFilter, statusFilter, bankFilter, search]);

  /* ── Profile Card ─────────────────────────────────── */
  const ProfileCard = ({ p }: { p: StaffProfile }) => {
    const hub   = hubs.find(h => h.id === p.hub_id);
    const state = sudanStates.find(s => s.id === p.state_id);
    const av    = avBadge(p.availability);
    const hasBank = !!p.bank_account?.accountNumber;
    return (
      <Card
        className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all border hover:border-[#0F2041]/30 group"
        onClick={() => setSelected(p)}
        data-testid={`card-profile-${p.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0F2041]/20 to-[#1D3461]/10 flex items-center justify-center font-bold text-sm text-[#0F2041] dark:text-blue-300">
                {initials(p.full_name)}
              </div>
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${av.dot}`} title={av.label} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <p className="font-semibold text-sm truncate group-hover:text-[#0F2041] dark:group-hover:text-blue-300 transition-colors">{p.full_name || 'Unknown'}</p>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>
              <span className={`inline-flex mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_COLORS[p.role || ''] || 'bg-slate-100 text-slate-700'}`}>
                {ROLE_LABELS[p.role || ''] || p.role || 'No role'}
              </span>
            </div>
          </div>
          <Separator className="my-2.5" />
          <div className="space-y-1">
            {hub   && <div className="flex items-center gap-1.5 text-[11px]"><Building2 className="h-3 w-3 text-muted-foreground shrink-0" /><span className="font-medium">{hub.name}</span></div>}
            {state && <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{state.name}</div>}
          </div>
          <Separator className="my-2.5" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px]">
              <Landmark className="h-3 w-3 text-muted-foreground shrink-0" />
              {hasBank ? <span className="font-mono">{maskAcc(p.bank_account?.accountNumber)}</span> : <span className="text-red-500 font-medium">No account</span>}
            </div>
            {hasBank ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            {lastActive(p.last_activity, p.updated_at)}
            {p.device_info && (
              <><span className="opacity-40">·</span>
              {p.device_info.includes('Android') || p.device_info.includes('iPhone') ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
              <span>{p.device_info}</span></>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  /* ── Filter bar (shared) ──────────────────────────── */
  const FilterBar = (
    <div className="rounded-xl border bg-slate-50 dark:bg-slate-900/50 p-3 space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search name, email, employee ID…" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm" data-testid="input-staff-search" />
        </div>
        <Select value={hubFilter} onValueChange={v => { setHubFilter(v); setStateFilter('all'); setLocalFilter('all'); }}>
          <SelectTrigger className="h-8 w-[135px] text-xs" data-testid="select-hub"><SelectValue placeholder="All Hubs" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Hubs</SelectItem>{hubs.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={v => { setStateFilter(v); setLocalFilter('all'); }}>
          <SelectTrigger className="h-8 w-[135px] text-xs" data-testid="select-state"><SelectValue placeholder="All States" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All States</SelectItem>{availableStates.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={localityFilter} onValueChange={setLocalFilter} disabled={stateFilter === 'all'}>
          <SelectTrigger className="h-8 w-[135px] text-xs" data-testid="select-locality"><SelectValue placeholder={stateFilter === 'all' ? 'Select State' : 'All Localities'} /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Localities</SelectItem>{availableLocalities.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-8 w-[125px] text-xs" data-testid="select-role"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Roles</SelectItem>{Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[115px] text-xs" data-testid="select-status"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="busy">Busy</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
        <Select value={bankFilter} onValueChange={setBankFilter}>
          <SelectTrigger className="h-8 w-[125px] text-xs" data-testid="select-bank"><SelectValue placeholder="All Accounts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            <SelectItem value="has">Has Account</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs gap-1 text-muted-foreground" data-testid="button-clear-filters">
            <XCircle className="h-3.5 w-3.5" />Clear
          </Button>
        )}
        <div className="flex gap-1 ml-auto">
          <Button variant={viewMode === 'cards' ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode('cards')} data-testid="button-view-cards"><LayoutGrid className="h-3.5 w-3.5" /></Button>
          <Button variant={viewMode === 'table' ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode('table')} data-testid="button-view-table"><List className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {hasFilters && (
        <p className="text-xs text-muted-foreground">Showing <strong className="text-foreground">{filtered.length}</strong> of {profiles.length} profiles</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-[#0F2041]" />
            Staff Directory
            <span className="text-sm font-normal text-muted-foreground">/ دليل الموظفين</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Profiles, bank accounts, online presence, and capacity overview</p>
        </div>
        <div className="flex gap-2">
          <ExportMenu profiles={filtered} tab={activeTab} label={exportLabel} />
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing} data-testid="button-refresh" className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Staff',       value: stats.total,       icon: Users,        color: 'text-[#0F2041]', bg: 'bg-[#0F2041]/5'                       },
          { label: 'Online Now',        value: stats.online,      icon: Wifi,         color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30'      },
          { label: 'Busy',             value: stats.busy,        icon: Activity,     color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30'      },
          { label: 'With Bank Account', value: stats.withBank,    icon: Landmark,     color: 'text-blue-600',  bg: 'bg-blue-50 dark:bg-blue-950/30'        },
          { label: 'Missing Account',   value: stats.missingBank, icon: AlertCircle,  color: 'text-red-600',   bg: 'bg-red-50 dark:bg-red-950/30'          },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border">
            <CardContent className={`pt-3 pb-3 px-4 ${bg} rounded-lg`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{loading ? '—' : value}</p>
                </div>
                <Icon className={`h-5 w-5 ${color} opacity-50`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList className="bg-slate-100 dark:bg-slate-800 border rounded-xl p-1">
            <TabsTrigger value="directory" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-lg text-xs">
              <LayoutGrid className="h-3.5 w-3.5" />Directory
              <span className="bg-white/20 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{filtered.length}</span>
            </TabsTrigger>
            <TabsTrigger value="bank_accounts" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-lg text-xs">
              <Landmark className="h-3.5 w-3.5" />Bank Accounts
              {stats.missingBank > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{stats.missingBank}</span>}
            </TabsTrigger>
            <TabsTrigger value="capacity" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-lg text-xs">
              <BarChart3 className="h-3.5 w-3.5" />Capacity
            </TabsTrigger>
            <TabsTrigger value="online" className="gap-1.5 data-[state=active]:bg-green-700 data-[state=active]:text-white rounded-lg text-xs">
              <Wifi className="h-3.5 w-3.5" />Online Now
              {stats.online > 0 && <span className="bg-green-500 data-[state=active]:bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{stats.online}</span>}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Shared filter bar */}
        <div className="mt-3">{FilterBar}</div>

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
                      <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead>
                      <TableHead>Hub</TableHead><TableHead>State</TableHead><TableHead>Bank Account</TableHead>
                      <TableHead>Last Active</TableHead><TableHead>Device</TableHead><TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(p => {
                      const hub   = hubs.find(h => h.id === p.hub_id);
                      const state = sudanStates.find(s => s.id === p.state_id);
                      const av    = avBadge(p.availability);
                      const hasBank = !!p.bank_account?.accountNumber;
                      return (
                        <TableRow key={p.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900" onClick={() => setSelected(p)}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <div className="w-7 h-7 rounded-full bg-[#0F2041]/10 flex items-center justify-center text-[10px] font-bold text-[#0F2041]">{initials(p.full_name)}</div>
                                <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white dark:border-slate-900 ${av.dot}`} />
                              </div>
                              <div><p className="text-sm font-medium">{p.full_name || '—'}</p><p className="text-[10px] text-muted-foreground">{p.email}</p></div>
                            </div>
                          </TableCell>
                          <TableCell><Badge className={`text-[10px] ${ROLE_COLORS[p.role || ''] || ''}`}>{ROLE_LABELS[p.role || ''] || p.role || '—'}</Badge></TableCell>
                          <TableCell><span className={`text-xs font-semibold ${av.text}`}>{av.label}</span></TableCell>
                          <TableCell className="text-xs">{hub?.name || '—'}</TableCell>
                          <TableCell className="text-xs">{state?.name || '—'}</TableCell>
                          <TableCell>
                            {hasBank
                              ? <span className="text-xs font-mono">{maskAcc(p.bank_account?.accountNumber)}</span>
                              : <span className="text-xs text-red-500 font-medium">Missing</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{lastActive(p.last_activity, p.updated_at)}</TableCell>
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
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bank Account Registry · {filtered.length} profiles</p>
                <div className="flex gap-2 text-xs">
                  <span className="text-green-600 font-semibold">{filtered.filter(p => p.bank_account?.accountNumber).length} registered</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-red-500 font-semibold">{filtered.filter(p => !p.bank_account?.accountNumber).length} missing</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead>Staff Member</TableHead><TableHead>Role</TableHead><TableHead>Hub / State</TableHead>
                      <TableHead>Account Name</TableHead><TableHead>Account Number</TableHead>
                      <TableHead>Bank</TableHead><TableHead>Branch</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(p => {
                      const hub   = hubs.find(h => h.id === p.hub_id);
                      const state = sudanStates.find(s => s.id === p.state_id);
                      const hasBank = !!p.bank_account?.accountNumber;
                      return (
                        <TableRow key={p.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900" onClick={() => setSelected(p)}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-[#0F2041]/10 flex items-center justify-center text-[10px] font-bold text-[#0F2041]">{initials(p.full_name)}</div>
                              <div><p className="text-sm font-medium">{p.full_name || '—'}</p><p className="text-[10px] text-muted-foreground">{p.email}</p></div>
                            </div>
                          </TableCell>
                          <TableCell><Badge className={`text-[10px] ${ROLE_COLORS[p.role || ''] || ''}`}>{ROLE_LABELS[p.role || ''] || p.role || '—'}</Badge></TableCell>
                          <TableCell className="text-xs">{[hub?.name, state?.name].filter(Boolean).join(' / ') || '—'}</TableCell>
                          <TableCell className="text-sm font-medium">{p.bank_account?.accountName || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="font-mono text-sm font-bold">{p.bank_account?.accountNumber || <span className="text-muted-foreground font-normal">—</span>}</TableCell>
                          <TableCell className="text-sm">{p.bank_account?.bankName || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm">{p.bank_account?.branch || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell>
                            {hasBank
                              ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700"><CheckCircle className="h-3 w-3" />Registered</span>
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
            {([
              { title: 'By Hub',   icon: Building2, data: capHub   },
              { title: 'By State', icon: MapPin,    data: capState },
              { title: 'By Role',  icon: Shield,    data: capRole  },
            ] as const).map(({ title, icon: Icon, data }) => (
              <Card key={title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5"><Icon className="h-4 w-4" />{title}</CardTitle>
                  <CardDescription className="text-xs">Staff capacity breakdown</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 max-h-72 overflow-y-auto">
                  {data.length === 0
                    ? <p className="text-xs text-muted-foreground text-center py-4">No data</p>
                    : data.map(r => <CapRow key={r.name} label={r.name} total={r.total} online={r.online} withBank={r.withBank} max={data[0].total} />)}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Online Now Tab ── */}
        <TabsContent value="online">
          <div className="mt-4">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-40" />)}
              </div>
            ) : profiles.filter(p => p.availability === 'online' || p.availability === 'busy').length === 0 ? (
              <div className="text-center py-16 text-muted-foreground space-y-2">
                <WifiOff className="h-10 w-10 mx-auto opacity-30" />
                <p className="font-medium">No staff currently online</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  <span className="font-bold text-green-600">{profiles.filter(p => p.availability === 'online').length}</span> online
                  {profiles.filter(p => p.availability === 'busy').length > 0 && <> · <span className="font-bold text-amber-600">{profiles.filter(p => p.availability === 'busy').length}</span> busy</>}
                </p>
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

      {/* Profile Detail Modal */}
      {selected && <ProfileDetail profile={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
