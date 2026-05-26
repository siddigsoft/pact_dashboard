import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
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
  Users, Wifi, WifiOff, Search, Building2, MapPin,
  Shield, RefreshCw, LayoutGrid, List, ChevronRight,
  Smartphone, Monitor, Clock, AlertCircle, CheckCircle, XCircle,
  Hash, Globe, Activity, BarChart3, Copy, Download, FileSpreadsheet,
  FileText, FileDown, GitBranch, Landmark, UserX,
  Banknote, TrendingDown, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sudanStates, getLocalitiesByState, hubs as sudanHubs } from "@/data/sudanStates";
import { useGlobalPresence } from "@/context/presence/GlobalPresenceContext";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/user/UserContext";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { PageInfoBanner } from "@/components/financial/PageInfoBanner";
import {
  exportStaffToExcel, exportStaffToPDF, exportStaffToCSV, type ExportProfile,
} from "@/utils/staffDirectoryExport";

/* ─── Types ─────────────────────────────────────────────── */
interface BankAccount { accountName?: string; accountNumber?: string; branch?: string; bankName?: string; }

/**
 * Normalizes bank account — handles both:
 * Web (camelCase):   { accountName, accountNumber, branch, bankName }
 * Mobile (snake_case): { account_name, account_number, bank_name, branch_code }
 */
function normalizeBA(raw: any): BankAccount | null {
  if (!raw) return null;
  const ba: BankAccount = {
    accountName:   raw.accountName   || raw.account_name   || undefined,
    accountNumber: raw.accountNumber || raw.account_number || undefined,
    bankName:      raw.bankName      || raw.bank_name      || undefined,
    branch:        raw.branch        || raw.branch_code    || undefined,
  };
  return (ba.accountName || ba.accountNumber || ba.bankName || ba.branch) ? ba : null;
}

interface StaffProfile {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  role: string | null; employee_id: string | null; hub_id: string | null;
  state_id: string | null; locality_id: string | null; availability: string | null;
  /** Computed from last_activity — NOT from the static `availability` DB column */
  presence: 'online' | 'away' | 'offline';
  status: string | null; location: any; location_sharing: boolean | null;
  updated_at: string; created_at: string; bank_account: BankAccount | null;
  last_activity: string | null; device_info: string | null; app_version: string | null;
  department_id: string | null; department_name?: string | null;
  contract_type: 'salary' | 'retainer' | 'both' | null;
}

const ROLE_LABELS: Record<string, string> = {
  /* ── PascalCase (actual DB values) ── */
  SuperAdmin: 'Super Admin', Admin: 'Admin', Coordinator: 'Coordinator',
  DataCollector: 'Data Collector', DataTeam: 'Data Team', Supervisor: 'Supervisor',
  'Field Operation Manager (FOM)': 'Field Operation Manager', Reviewer: 'Reviewer',
  employee: 'Employee',
  /* ── Legacy snake_case (kept for safety) ── */
  super_admin: 'Super Admin', admin: 'Admin', country_director: 'Country Director',
  fom: 'FOM', supervisor: 'Supervisor', coordinator: 'Coordinator',
  data_team: 'Data Team', financial_auditor: 'Financial Auditor', enumerator: 'Enumerator',
};
/* Canonical order for dropdown (PascalCase DB values only) */
const ROLE_OPTIONS: [string, string][] = [
  ['SuperAdmin', 'Super Admin'], ['Admin', 'Admin'], ['Coordinator', 'Coordinator'],
  ['DataCollector', 'Data Collector'], ['DataTeam', 'Data Team'], ['Supervisor', 'Supervisor'],
  ['Field Operation Manager (FOM)', 'Field Operation Manager'], ['Reviewer', 'Reviewer'],
];
const ROLE_COLORS: Record<string, string> = {
  /* ── PascalCase ── */
  SuperAdmin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 border-purple-200 dark:border-purple-800',
  Admin: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800',
  Coordinator: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
  DataCollector: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  DataTeam: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200 dark:border-amber-800',
  Supervisor: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200 border-teal-200 dark:border-teal-800',
  'Field Operation Manager (FOM)': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200 border-cyan-200 dark:border-cyan-800',
  Reviewer: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200 border-orange-200 dark:border-orange-800',
  employee: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  /* ── Legacy snake_case ── */
  super_admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 border-purple-200 dark:border-purple-800',
  admin: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800',
  country_director: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  fom: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200 border-cyan-200 dark:border-cyan-800',
  supervisor: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200 border-teal-200 dark:border-teal-800',
  coordinator: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
  data_team: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200 dark:border-amber-800',
  financial_auditor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200 border-orange-200 dark:border-orange-800',
  enumerator: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
};

/**
 * Derive real presence from the last_activity timestamp.
 * - online : last activity within 5 minutes  → truly connected right now
 * - away   : last activity within 30 minutes → recently active
 * - offline: everything else
 *
 * The `availability` column in the database is a static field that never
 * auto-resets, so we intentionally ignore it for presence display.
 */
function presenceFromActivity(lastActivityIso: string | null, updatedAt?: string): 'online' | 'away' | 'offline' {
  const ts = lastActivityIso || updatedAt;
  if (!ts) return 'offline';
  try {
    const mins = (Date.now() - parseISO(ts).getTime()) / 60_000;
    // Mobile heartbeat runs every 3 min — use 6 min window so users appear
    // "online" even if their last ping was just before the heartbeat fired.
    if (mins < 6) return 'online';
    if (mins < 60) return 'away';
    return 'offline';
  } catch { return 'offline'; }
}

function avBadge(presence: 'online' | 'away' | 'offline') {
  if (presence === 'online') return { dot: 'bg-green-500', label: 'Online', labelColor: 'text-green-700 dark:text-green-400', ring: 'ring-green-400' };
  if (presence === 'away')   return { dot: 'bg-amber-500',  label: 'Away',   labelColor: 'text-amber-700 dark:text-amber-400',  ring: 'ring-amber-400'  };
  return { dot: 'bg-slate-300 dark:bg-slate-600', label: 'Offline', labelColor: 'text-slate-500 dark:text-slate-400', ring: 'ring-slate-300' };
}
function initials(name: string | null) { if (!name) return '?'; return name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase(); }
function lastActive(d: string | null, fallback?: string): string {
  const s = d || fallback; if (!s) return 'Unknown';
  try { return formatDistanceToNow(parseISO(s), { addSuffix: true }); } catch { return '—'; }
}

/* ─── Build ExportProfile array ─────────────────────────── */
function toExportProfiles(profiles: StaffProfile[], hubList: { id: string; name: string }[]): ExportProfile[] {
  return profiles.map(p => {
    const hub      = hubList.find(h => h.id === p.hub_id);
    const state    = sudanStates.find(s => s.id === p.state_id);
    const locality = state?.localities?.find((l: any) => l.id === p.locality_id);
    return {
      id: p.id, full_name: p.full_name, email: p.email, phone: p.phone,
      role: p.role, employee_id: p.employee_id,
      hub_name: hub?.name || 'Unassigned',
      state_name: state?.name || 'Unassigned',
      locality_name: (locality as any)?.name || '—',
      availability: p.availability, contract_type: p.contract_type ?? null,
      bank_account: p.bank_account,
      last_activity: p.last_activity, device_info: p.device_info,
      app_version: p.app_version, location_sharing: p.location_sharing,
    };
  });
}

function maskAcc(n?: string) { if (!n) return '—'; return n.length <= 4 ? n : '•••• ' + n.slice(-4); }

/* ─── Avatar ──────────────────────────────────────────────── */
function Avatar({ name, size = 'md', availability }: { name: string | null; size?: 'sm' | 'md' | 'lg'; availability?: 'online' | 'away' | 'offline' | null }) {
  const presence: 'online' | 'away' | 'offline' = (availability === 'online' || availability === 'away') ? availability : 'offline';
  const av = avBadge(presence);
  const sz = size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'lg' ? 'w-14 h-14 text-xl' : 'w-10 h-10 text-sm';
  const dotSz = size === 'sm' ? 'w-2 h-2' : size === 'lg' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5';
  return (
    <div className="relative inline-flex shrink-0">
      <div className={`${sz} rounded-full bg-gradient-to-br from-[#0F2041] to-[#2563EB] flex items-center justify-center font-bold text-white`}>
        {initials(name)}
      </div>
      {availability !== undefined && (
        <span className={`absolute bottom-0 right-0 ${dotSz} rounded-full border-2 border-white dark:border-slate-900 ${av.dot}`} />
      )}
    </div>
  );
}

/* ─── Role Badge ──────────────────────────────────────────── */
function RoleBadge({ role }: { role: string | null }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_COLORS[role || ''] || 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>
      {ROLE_LABELS[role || ''] || role || 'No role'}
    </span>
  );
}

/* ─── Profile Detail Modal ───────────────────────────────── */
function ProfileDetail({
  profile, onClose, dbHubs,
}: {
  profile: StaffProfile;
  onClose: () => void;
  dbHubs: { id: string; name: string }[];
}) {
  const { toast } = useToast();
  const hub      = dbHubs.find(h => h.id === profile.hub_id);
  const state    = sudanStates.find(s => s.id === profile.state_id);
  const locality = state?.localities?.find((l: any) => l.id === profile.locality_id);
  const av       = avBadge(profile.presence);

  const copy = (t: string, l: string) => { navigator.clipboard.writeText(t); toast({ title: `${l} copied` }); };

  /* ── Financial Activity ── */
  const [finRequested, setFinRequested] = useState(false);
  const [finKey,       setFinKey]       = useState(0);
  const [finLoading,   setFinLoading]   = useState(false);
  const [advanceRows,  setAdvanceRows]  = useState<any[]>([]);
  const [costRows,     setCostRows]     = useState<any[]>([]);
  const [withdrawalRows, setWithdrawalRows] = useState<any[]>([]);
  const [finOpen, setFinOpen] = useState<'advances' | 'costs' | 'withdrawals' | null>(null);

  useEffect(() => {
    if (!finRequested) return;
    const load = async () => {
      setFinLoading(true);
      const [dpRes, ocRes, wrRes] = await Promise.all([
        supabase.from('down_payment_requests')
          .select('id,status,requested_amount,requested_at,justification,hub_name,site_name,metadata')
          .eq('requested_by', profile.id).order('requested_at', { ascending: false }).limit(50),
        supabase.from('operational_cost_submissions')
          .select('id,tier1_status,tier2_status,amount_cents,expense_category,description,created_at')
          .eq('submitted_by', profile.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('withdrawal_requests')
          .select('id,status,amount,currency,request_reason,fund_receipt_confirmed,created_at')
          .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50),
      ]);
      setAdvanceRows(dpRes.data || []);
      setCostRows(ocRes.data || []);
      setWithdrawalRows(wrRes.data || []);
      setFinLoading(false);
    };
    load();
  }, [finRequested, finKey, profile.id]);

  const dpSummary = useMemo(() => ({
    total:     advanceRows.length,
    pending:   advanceRows.filter(r => ['pending','pending_supervisor','pending_admin'].includes(r.status)).length,
    approved:  advanceRows.filter(r => r.status === 'approved' || r.status === 'paid').length,
    amountSDG: Math.round(advanceRows.reduce((s, r) => s + Math.abs(Number(r.requested_amount) || 0), 0)),
  }), [advanceRows]);

  const ocSummary = useMemo(() => ({
    total:     costRows.length,
    approved:  costRows.filter(r => r.tier2_status === 'approved').length,
    amountSDG: Math.round(costRows.reduce((s, r) => s + Math.abs(Number(r.amount_cents) || 0) / 100, 0)),
  }), [costRows]);

  const wrSummary = useMemo(() => ({
    total:     withdrawalRows.length,
    approved:  withdrawalRows.filter(r => r.status === 'approved').length,
    amountSDG: Math.round(withdrawalRows.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)),
  }), [withdrawalRows]);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl w-full max-h-[92vh] overflow-y-auto p-0 gap-0">
        {/* ── Branded header ── */}
        <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-6 py-6 rounded-t-lg">
          <DialogHeader>
            <div className="flex items-center gap-4">
              <Avatar name={profile.full_name} size="lg" availability={profile.presence} />
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-white text-lg font-bold leading-tight truncate">
                  {profile.full_name || 'Unknown'}
                </DialogTitle>
                <div className="flex items-center gap-1.5 mt-0.5 group/email">
                  <p className="text-white/60 text-xs truncate">{profile.email}</p>
                  <button
                    type="button"
                    onClick={() => copy(profile.email, 'Email')}
                    className="opacity-0 group-hover/email:opacity-100 text-white/40 hover:text-white/80 transition-all shrink-0"
                    title="Copy email"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  <RoleBadge role={profile.role} />
                  <span className={`inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${av.dot} ${profile.presence === 'online' ? 'animate-pulse' : ''}`} />
                    {profile.presence === 'online'
                      ? 'Online now'
                      : `Last seen ${lastActive(profile.last_activity, profile.updated_at)}`}
                  </span>
                  {profile.employee_id && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/80">
                      ID: {profile.employee_id}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="divide-y divide-border">
          {/* ── Assignment Location ── */}
          <div className="px-6 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />Assignment Location
            </p>
            {(hub?.name || state?.name || (locality as any)?.name) ? (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Hub',      value: hub?.name,             icon: Building2 },
                  { label: 'State',    value: state?.name,           icon: MapPin    },
                  { label: 'Locality', value: (locality as any)?.name, icon: MapPin  },
                ].map(({ label, value, icon: Icon }) => value ? (
                  <div key={label} className="rounded-md bg-muted/50 p-2.5">
                    <div className="flex items-center gap-1 mb-1">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                    </div>
                    <p className="text-xs font-semibold text-foreground truncate">{value}</p>
                  </div>
                ) : null)}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No location assignment — may be a system-level role</p>
            )}

            {/* ── GPS Location ── */}
            {profile.location_sharing ? (
              <div className="mt-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 overflow-hidden">
                {/* GPS header row */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-green-200/50 dark:border-green-800/50">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400 flex-1">
                    GPS Sharing Active — موقع مباشر
                  </span>
                  <Globe className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                </div>
                {profile.location?.lat ? (
                  <div className="px-3 py-2.5 space-y-2">
                    {/* Coordinates */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-md bg-white dark:bg-green-950/60 border border-green-200 dark:border-green-700 px-3 py-2">
                        <p className="text-[10px] text-green-600 dark:text-green-500 mb-0.5">Coordinates / الإحداثيات</p>
                        <p className="font-mono text-xs font-bold text-green-800 dark:text-green-300">
                          {Number(profile.location.lat).toFixed(6)}, {Number(profile.location.lng).toFixed(6)}
                        </p>
                        {profile.location.accuracy != null && (
                          <p className="text-[10px] text-green-500 dark:text-green-600 mt-0.5">
                            ±{Math.round(profile.location.accuracy)}m accuracy
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => copy(`${profile.location!.lat}, ${profile.location!.lng}`, 'Coordinates')}
                        className="p-2 rounded-md border border-green-200 dark:border-green-700 bg-white dark:bg-green-950/60 hover:bg-green-100 dark:hover:bg-green-900/50 text-green-600 transition-colors"
                        title="Copy coordinates"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Last captured timestamp */}
                    {profile.location.captured_at && (
                      <p className="text-[10px] text-green-600 dark:text-green-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                        Updated {formatDistanceToNow(parseISO(profile.location.captured_at), { addSuffix: true })}
                      </p>
                    )}
                    {/* View on Map button */}
                    <a
                      href={`https://www.google.com/maps?q=${profile.location.lat},${profile.location.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 transition-colors"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      View on Map / عرض على الخريطة
                    </a>
                  </div>
                ) : (
                  <div className="px-3 py-2.5 text-xs text-green-700 dark:text-green-400">
                    GPS sharing enabled — waiting for first location ping
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-muted/40 px-3 py-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">GPS sharing off</span>
              </div>
            )}
          </div>

          {/* ── Bank Account ── */}
          {(() => {
            const ba      = profile.bank_account;
            const hasBank = !!(ba?.accountNumber || ba?.accountName);
            return (
              <div className="px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <Landmark className="h-3 w-3" />Bank Account
                  </p>
                  {hasBank
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400"><CheckCircle className="h-3 w-3" />Registered</span>
                    : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600"><XCircle className="h-3 w-3" />Missing</span>}
                </div>
                {hasBank ? (
                  <div className="rounded-md border bg-gradient-to-br from-slate-50 to-slate-50/0 dark:from-slate-900 dark:to-slate-900/0 p-4">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {([
                        ['Account Name',   ba?.accountName],
                        ['Account Number', ba?.accountNumber, true],
                        ['Bank Name',      ba?.bankName],
                        ['Branch',         ba?.branch],
                      ] as [string, string | undefined, boolean?][]).map(([label, val, mono]) => (
                        <div key={label}>
                          <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                          <div className="flex items-center gap-1.5 group">
                            <p className={`text-sm ${mono ? 'font-mono font-bold text-[#0F2041] dark:text-blue-300' : 'font-medium'} truncate`}>
                              {val || <span className="text-muted-foreground font-normal text-xs">—</span>}
                            </p>
                            {val && (
                              <button
                                type="button"
                                onClick={() => copy(val, label)}
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">No bank account registered</p>
                      <p className="text-xs text-red-600/70 dark:text-red-400/70">Payments cannot be processed for this staff member.</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Activity & Device ── */}
          <div className="px-6 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <Activity className="h-3 w-3" />Activity & Device
            </p>
            <div className="grid grid-cols-2 gap-2">
              {([
                [Clock,    'Last Active',  lastActive(profile.last_activity, profile.updated_at)],
                [profile.device_info?.toLowerCase().includes('android') || profile.device_info?.toLowerCase().includes('iphone')
                  ? Smartphone : Monitor,  'Device',      profile.device_info || '—'],
                [GitBranch, 'App Version', profile.app_version || '—'],
                [Hash,      'Profile ID',  profile.id.slice(0, 8) + '…'],
              ] as [any, string, string][]).map(([Icon, label, val]) => (
                <div key={label} className="rounded-md bg-muted/50 p-2.5">
                  <div className="flex items-center gap-1 mb-1">
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                  <p className="text-xs font-medium truncate">{val}</p>
                </div>
              ))}
            </div>
            {/* Phone (shown here if not in header) */}
            {profile.phone && (
              <div className="mt-2 flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <Smartphone className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono font-medium">{profile.phone}</span>
                </div>
                <button
                  type="button"
                  onClick={() => copy(profile.phone!, 'Phone')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {/* ── Financial Activity ── */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Banknote className="h-3 w-3" />Financial Activity — النشاط المالي
              </p>
              {finRequested && !finLoading && (
                <button type="button" onClick={() => setFinKey(k => k + 1)} className="text-muted-foreground hover:text-foreground transition-colors" title="Reload">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {!finRequested ? (
              <button
                type="button"
                onClick={() => setFinRequested(true)}
                className="w-full rounded-lg border border-dashed border-muted-foreground/30 py-4 text-xs text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/50 transition-colors flex items-center justify-center gap-2"
              >
                <Banknote className="h-3.5 w-3.5" />Load Financial Activity
              </button>
            ) : finLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <div className="space-y-2">
                {/* Transportation Advances */}
                <div className="rounded-lg border overflow-hidden">
                  <button type="button" onClick={() => setFinOpen(o => o === 'advances' ? null : 'advances')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-colors text-left">
                    <TrendingDown className="h-4 w-4 text-indigo-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="text-sm font-semibold">Transportation Advances</span><span className="text-[10px] text-muted-foreground">سلف النقل</span></div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-700 rounded px-1.5 py-0.5">{dpSummary.total} total</span>
                        {dpSummary.pending > 0 && <span className="text-[10px] bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded px-1.5 py-0.5">⏳ {dpSummary.pending} pending</span>}
                        {dpSummary.approved > 0 && <span className="text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 rounded px-1.5 py-0.5">✓ {dpSummary.approved} approved</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-indigo-700 dark:text-indigo-400">SDG {dpSummary.amountSDG.toLocaleString()}</p>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground ml-auto mt-0.5 transition-transform ${finOpen === 'advances' ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {finOpen === 'advances' && (
                    <div className="divide-y divide-border max-h-48 overflow-y-auto">
                      {advanceRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No advance requests found</p>
                      ) : advanceRows.map(r => {
                        const mmpName = r.metadata?.mmp_name || r.hub_name || '—';
                        const statusColor = r.status === 'approved' || r.status === 'paid' || r.status === 'fully_paid'
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                          : ['pending','pending_supervisor','pending_admin'].includes(r.status)
                          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                          : r.status === 'partially_paid'
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                          : 'bg-red-100 dark:bg-red-900/40 text-red-600';
                        return (
                        <div key={r.id} className="px-4 py-2.5 flex items-start justify-between gap-3 hover:bg-muted/30">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground truncate">{mmpName}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusColor}`}>{r.status.replace(/_/g, ' ')}</span>
                              {r.site_name && <span className="text-[10px] text-muted-foreground truncate">{r.site_name}</span>}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{r.requested_at ? format(parseISO(r.requested_at), 'dd MMM yyyy') : '—'}</p>
                          </div>
                          <p className="text-xs font-bold shrink-0">SDG {Number(r.requested_amount || 0).toLocaleString()}</p>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Cost Submissions */}
                <div className="rounded-lg border overflow-hidden">
                  <button type="button" onClick={() => setFinOpen(o => o === 'costs' ? null : 'costs')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors text-left">
                    <FileText className="h-4 w-4 text-orange-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="text-sm font-semibold">Cost Submissions</span><span className="text-[10px] text-muted-foreground">طلبات التكاليف</span></div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-700 rounded px-1.5 py-0.5">{ocSummary.total} total</span>
                        {ocSummary.approved > 0 && <span className="text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 rounded px-1.5 py-0.5">✓ {ocSummary.approved} approved</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-orange-700 dark:text-orange-400">SDG {ocSummary.amountSDG.toLocaleString()}</p>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground ml-auto mt-0.5 transition-transform ${finOpen === 'costs' ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {finOpen === 'costs' && (
                    <div className="divide-y divide-border max-h-48 overflow-y-auto">
                      {costRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No cost submissions found</p>
                      ) : costRows.map(r => (
                        <div key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/30">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{r.expense_category || r.description || '—'}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{r.created_at ? format(parseISO(r.created_at), 'dd MMM yyyy') : '—'}</p>
                          </div>
                          <p className="text-xs font-bold shrink-0">SDG {Math.round(Math.abs(Number(r.amount_cents || 0)) / 100).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Withdrawal Requests */}
                <div className="rounded-lg border overflow-hidden">
                  <button type="button" onClick={() => setFinOpen(o => o === 'withdrawals' ? null : 'withdrawals')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors text-left">
                    <Landmark className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="text-sm font-semibold">Withdrawal Requests</span><span className="text-[10px] text-muted-foreground">طلبات السحب</span></div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-700 rounded px-1.5 py-0.5">{wrSummary.total} total</span>
                        {wrSummary.approved > 0 && <span className="text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 rounded px-1.5 py-0.5">✓ {wrSummary.approved} approved</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">SDG {wrSummary.amountSDG.toLocaleString()}</p>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground ml-auto mt-0.5 transition-transform ${finOpen === 'withdrawals' ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {finOpen === 'withdrawals' && (
                    <div className="divide-y divide-border max-h-48 overflow-y-auto">
                      {withdrawalRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No withdrawal requests found</p>
                      ) : withdrawalRows.map(r => (
                        <div key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/30">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.status === 'approved' ? 'bg-green-100 dark:bg-green-900/40 text-green-700' : r.status === 'pending' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700' : 'bg-red-100 dark:bg-red-900/40 text-red-600'}`}>{r.status}</span>
                              {r.fund_receipt_confirmed && <span className="text-[10px] text-green-600 dark:text-green-400">✓ Confirmed</span>}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{r.created_at ? format(parseISO(r.created_at), 'dd MMM yyyy') : '—'}</p>
                          </div>
                          <p className="text-xs font-bold shrink-0">SDG {Number(r.amount || 0).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Timestamps ── */}
          <div className="px-6 py-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Joined {profile.created_at ? format(parseISO(profile.created_at), 'dd MMM yyyy') : '—'}</span>
              <span>Updated {profile.updated_at ? format(parseISO(profile.updated_at), 'dd MMM yyyy') : '—'}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Export Dropdown ────────────────────────────────────── */
function ExportMenu({
  profiles, tab, label, dbHubs,
}: {
  profiles: StaffProfile[];
  tab: string;
  label: string;
  dbHubs: { id: string; name: string }[];
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const exp = useCallback(async (type: 'excel' | 'pdf' | 'csv') => {
    if (!profiles.length) { toast({ title: 'No data to export', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const ep = toExportProfiles(profiles, dbHubs);
      const pdfTab = tab === 'capacity' ? 'capacity' : 'directory';
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
        <Button variant="outline" size="sm" disabled={busy || !profiles.length} className="gap-1.5" data-testid="button-export-menu">
          <Download className="h-3.5 w-3.5" />
          {busy ? 'Exporting…' : 'Export'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => exp('excel')} className="gap-2 cursor-pointer" data-testid="menu-export-excel">
          <FileSpreadsheet className="h-4 w-4 text-green-700" />Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exp('pdf')} className="gap-2 cursor-pointer" data-testid="menu-export-pdf">
          <FileText className="h-4 w-4 text-red-600" />PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => exp('csv')} className="gap-2 cursor-pointer" data-testid="menu-export-csv">
          <FileDown className="h-4 w-4 text-blue-600" />CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Capacity Bar Row ───────────────────────────────────── */
function CapRow({ label, total, online, max }: { label: string; total: number; online: number; max: number }) {
  const pct = max > 0 ? Math.round((total / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-foreground truncate max-w-[45%]" title={label}>{label}</span>
        <div className="flex items-center gap-2.5 shrink-0 text-muted-foreground">
          <span className="font-semibold text-foreground">{total}</span>
          <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
            <Wifi className="h-2.5 w-2.5" />{online}
          </span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#0F2041] to-[#2563EB] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function StaffDirectory() {
  const { toast } = useToast();
  const { currentUser } = useUser();
  const { isUserOnline, isConnected, onlineUserIds } = useGlobalPresence();
  const _roleNorm = (currentUser?.role ?? "").toLowerCase().replace(/[_\s]/g, "");
  const canAccessDepts = _roleNorm === "admin" || _roleNorm === "superadmin";
  const [profiles, setProfiles]          = useState<StaffProfile[]>([]);
  const [dbHubs, setDbHubs]              = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]            = useState(true);
  const [refreshing, setRefreshing]      = useState(false);
  const [selected, setSelected]          = useState<StaffProfile | null>(null);

  /* Scroll to top when this page mounts — the MainLayout content area retains
     scroll position between page navigations, which can hide the blue header. */
  const pageTopRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    let el = pageTopRef.current?.parentElement;
    while (el) {
      const ov = window.getComputedStyle(el).overflowY;
      if (ov === 'auto' || ov === 'scroll') { el.scrollTop = 0; break; }
      el = el.parentElement;
    }
  }, []);

  /* Filters */
  const [search, setSearch]              = useState('');
  const [hubFilter, setHubFilter]        = useState('all');
  const [stateFilter, setStateFilter]    = useState('all');
  const [localityFilter, setLocalFilter] = useState('all');
  const [roleFilter, setRoleFilter]      = useState('all');
  const [statusFilter, setStatusFilter]  = useState('all');
  const [viewMode, setViewMode]          = useState<'cards' | 'table'>('cards');
  const [activeTab, setActiveTab]        = useState('directory');
  const [bankFilter, setBankFilter]      = useState<'all' | 'has' | 'missing'>('all');

  /* Derived filter options */
  const availableStates = sudanStates;

  // Hub-state coverage map: DB hub UUID → Set<stateId>
  // dbHubs has UUIDs as IDs; match to local sudanHubs by name to get the states array.
  // Matching strategy (in order):
  //   1. Exact name match (case-insensitive)
  //   2. Core-word match — strip " hub" suffix then compare (handles "Kassala" == "Kassala Hub")
  //   3. Gedaref/Gedarif spelling normalisation — treat both as 'gedarif'
  const hubStateSet = useMemo(() => {
    const normalise = (s: string) =>
      s.toLowerCase().trim()
       .replace(/gedaref/g, 'gedarif')  // unify spelling variants
       .replace(/gadarif|gadaref|qadarif/g, 'gedarif');
    const stripHub = (s: string) => s.replace(/\s*hub\s*$/i, '').trim();

    const m = new Map<string, Set<string>>();
    dbHubs.forEach(dbHub => {
      const norm = normalise(dbHub.name);
      // 1. Exact match after normalisation
      let local = sudanHubs.find(lh => normalise(lh.name) === norm);
      // 2. Core-word match (remove " hub" suffix from both sides)
      if (!local) {
        const core = stripHub(norm);
        local = sudanHubs.find(lh => stripHub(normalise(lh.name)) === core);
      }
      // 3. State-name match — DB hub name is just the state name (e.g. "Gedarif")
      if (!local) {
        const core = stripHub(norm);
        local = sudanHubs.find(lh => lh.states.some(sid => sid.replace(/-/g, ' ') === core));
      }
      if (local) m.set(dbHub.id, new Set(local.states));
    });
    return m;
  }, [dbHubs]);

  // Normalise state IDs so spelling variants ("gedaref" / "gedarif" / "gadarif")
  // are treated as identical during filtering.
  const normaliseStateId = (id: string | null) =>
    (id ?? '').toLowerCase()
      .replace(/gedaref/g, 'gedarif')
      .replace(/gadarif|gadaref|qadarif/g, 'gedarif');

  // Returns true if the profile matches the selected state, including the
  // fallback where state_id is null but the profile's hub covers that state.
  const profileMatchesState = useCallback((p: { state_id: string | null; hub_id: string | null }, stateId: string) => {
    // Direct match (with spelling normalisation)
    if (normaliseStateId(p.state_id) === normaliseStateId(stateId)) return true;
    // Hub fallback: if state_id is unset, check whether the profile's hub covers this state
    if (!p.state_id && p.hub_id) return hubStateSet.get(p.hub_id)?.has(stateId) ?? false;
    return false;
  }, [hubStateSet]);

  const availableLocalities = useMemo(() =>
    stateFilter === 'all' ? [] : getLocalitiesByState(stateFilter), [stateFilter]);

  /**
   * Merge DB profiles with LIVE WebSocket presence from GlobalPresenceContext.
   * `isUserOnline(id)` returns true only when a WebSocket connection is open
   * right now for that user — it auto-updates on join/leave events.
   * "Away" is the fallback for recently active (< 60 min) but not connected.
   */
  const enrichedProfiles = useMemo<StaffProfile[]>(() =>
    profiles.map(p => ({
      ...p,
      presence: isUserOnline(p.id)
        ? 'online'
        : presenceFromActivity(p.last_activity, p.updated_at),
    })),
  // onlineUserIds array reference changes every time the Set changes → correct dep
  [profiles, onlineUserIds]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Fast batch data load ── */
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      /* Load hubs from DB (same source as Hub Management page) */
      const { data: hubsData } = await (supabase as any)
        .from('hubs')
        .select('id, name')
        .order('name');
      if (hubsData?.length) setDbHubs(hubsData);

      const { data: deptsData } = await supabase
        .from('departments')
        .select('id, name');
      const deptMap: Record<string, string> = {};
      (deptsData || []).forEach((d) => { deptMap[d.id] = d.name; });

      const { data: pData, error: pErr } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, email, phone, role, employee_id, hub_id, state_id, locality_id, availability, status, location, location_sharing, updated_at, created_at, bank_account, last_activity, device_info, app_version, department_id, contract_type')
        .order('full_name');
      if (pErr) throw pErr;

      /* Latest activity per user — one batch query */
      const { data: actData } = await (supabase as any)
        .from('user_activity_logs')
        .select('user_id, created_at, metadata, device_info')
        .order('created_at', { ascending: false })
        .limit(500);

      const actMap: Record<string, { created_at: string; metadata: any }> = {};
      (actData || []).forEach((a: any) => { if (!actMap[a.user_id]) actMap[a.user_id] = a; });

      const merged: StaffProfile[] = (pData || []).map((p: any) => {
        const act = actMap[p.id];
        let raw = p.bank_account;
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
        const ba = normalizeBA(raw);

        /* ── Device info: prefer profiles.device_info (written by Flutter heartbeat),
           fall back to user_activity_logs.device_info (JSONB col), then metadata ── */
        let device_info: string | null = p.device_info || null;
        if (!device_info) {
          // act.device_info is a JSONB object {userAgent, isMobile, ...}
          const ua: string =
            act?.device_info?.userAgent ||
            act?.metadata?.deviceInfo?.userAgent ||
            act?.metadata?.device_info?.userAgent || '';
          if (ua) {
            if (ua.includes('Android') || ua.toLowerCase().includes('flutter')) device_info = 'Android';
            else if (ua.includes('iPhone') || ua.includes('iPad'))               device_info = 'iOS';
            else if (ua.includes('Mobile'))                                       device_info = 'Mobile';
            else if (ua)                                                          device_info = 'Desktop';
          }
        }

        /* ── App version: prefer profiles.app_version (Flutter), then metadata ── */
        let app_version: string | null = p.app_version || null;
        if (!app_version) {
          const mv = act?.metadata?.appVersion || act?.metadata?.app_version;
          if (mv) app_version = String(mv);
        }

        /* ── Last activity: prefer profiles.last_activity (web + mobile heartbeat),
           then activity log timestamp — take whichever is more recent ── */
        const profileTs = p.last_activity || null;
        const actTs     = act?.created_at  || null;
        const last_activity = (profileTs && actTs)
          ? (new Date(profileTs) > new Date(actTs) ? profileTs : actTs)
          : (profileTs || actTs);

        const presence = presenceFromActivity(last_activity, p.updated_at);
        return { ...p, bank_account: ba, last_activity, device_info, app_version, presence, department_name: p.department_id ? (deptMap[p.department_id] || null) : null };
      });

      setProfiles(merged);
    } catch (err: any) {
      toast({ title: 'Error loading staff', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); setRefreshing(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  /* ── Realtime: patch last_activity in-place when any profile updates ──
     This fires every time a mobile user writes their heartbeat to profiles.last_activity
     so the dashboard shows them as "online" without requiring a manual refresh. */
  useEffect(() => {
    const ch = (supabase as any)
      .channel('staff-directory-presence')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
      }, (payload: any) => {
        const updated = payload.new;
        if (!updated?.id) return;
        setProfiles(prev => prev.map(p =>
          p.id === updated.id
            ? { ...p,
                location:         updated.location          ?? p.location,
                location_sharing: updated.location_sharing  ?? p.location_sharing,
                ...(updated.last_activity ? { last_activity: updated.last_activity } : {}),
                ...(updated.device_info   ? { device_info:   updated.device_info   } : {}),
                ...(updated.app_version   ? { app_version:   updated.app_version   } : {}),
              }
            : p
        ));
      })
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enrichedProfiles.filter(p => {
      if (q && !p.full_name?.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q) &&
        !p.phone?.toLowerCase().includes(q) && !p.employee_id?.toLowerCase().includes(q)) return false;
      if (hubFilter !== 'all' && p.hub_id !== hubFilter) return false;
      if (stateFilter !== 'all' && !profileMatchesState(p, stateFilter)) return false;
      if (localityFilter !== 'all' && p.locality_id !== localityFilter) return false;
      if (roleFilter !== 'all' && p.role !== roleFilter) return false;
      if (statusFilter === 'online'  && p.presence !== 'online')  return false;
      if (statusFilter === 'away'    && p.presence !== 'away')    return false;
      if (statusFilter === 'offline' && p.presence !== 'offline') return false;
      if (bankFilter === 'has'     && !(p.bank_account?.accountNumber || p.bank_account?.accountName)) return false;
      if (bankFilter === 'missing' &&  (p.bank_account?.accountNumber || p.bank_account?.accountName)) return false;
      return true;
    });
  }, [enrichedProfiles, search, hubFilter, stateFilter, localityFilter, roleFilter, statusFilter, bankFilter]);

  /* ── Summary stats — always over enrichedProfiles so online count is live ── */
  const stats = useMemo(() => ({
    total:        enrichedProfiles.length,
    online:       enrichedProfiles.filter(p => p.presence === 'online').length,
    busy:         enrichedProfiles.filter(p => p.presence === 'away').length,
    withHub:      enrichedProfiles.filter(p => !!p.hub_id).length,
    withLocation: enrichedProfiles.filter(p => !!p.location_sharing).length,
    withBank:     enrichedProfiles.filter(p => !!(p.bank_account?.accountNumber || p.bank_account?.accountName)).length,
    missingBank:  enrichedProfiles.filter(p => !(p.bank_account?.accountNumber || p.bank_account?.accountName)).length,
  }), [enrichedProfiles]);

  /* ── Capacity base — hub/state/role/search filters only, ignores
     presence (statusFilter) and bank filter so headcount is always complete ── */
  const capacityBase = useMemo(() => {
    const q = search.toLowerCase();
    return enrichedProfiles.filter(p => {
      if (q && !p.full_name?.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q) &&
        !p.phone?.toLowerCase().includes(q) && !p.employee_id?.toLowerCase().includes(q)) return false;
      if (hubFilter !== 'all'      && p.hub_id      !== hubFilter)      return false;
      if (stateFilter !== 'all'    && !profileMatchesState(p, stateFilter))    return false;
      if (localityFilter !== 'all' && p.locality_id !== localityFilter) return false;
      if (roleFilter !== 'all'     && p.role        !== roleFilter)     return false;
      return true;
    });
  }, [enrichedProfiles, search, hubFilter, stateFilter, localityFilter, roleFilter]);

  /* ── Capacity groups ── */
  const mkMap = (src: StaffProfile[], key: (p: StaffProfile) => string) => {
    const m: Record<string, { total: number; online: number }> = {};
    src.forEach(p => {
      const k = key(p);
      if (!m[k]) m[k] = { total: 0, online: 0 };
      m[k].total++;
      if (p.presence === 'online') m[k].online++;
    });
    return Object.entries(m)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => {
        if (a.name === 'Unassigned' || a.name === 'Unknown') return 1;
        if (b.name === 'Unassigned' || b.name === 'Unknown') return -1;
        return b.total - a.total;
      });
  };
  const capHub   = useMemo(() => mkMap(capacityBase, p => dbHubs.find(h => h.id === p.hub_id)?.name || 'Unassigned'), [capacityBase]);
  const capRole  = useMemo(() => mkMap(capacityBase, p => ROLE_LABELS[p.role || ''] || p.role || 'Unknown'), [capacityBase]);
  const capState = useMemo(() => mkMap(capacityBase, p => sudanStates.find(s => s.id === p.state_id)?.name || 'Unassigned'), [capacityBase]);

  const clearFilters = () => { setSearch(''); setHubFilter('all'); setStateFilter('all'); setLocalFilter('all'); setRoleFilter('all'); setStatusFilter('all'); };
  const hasFilters = !!(search || hubFilter !== 'all' || stateFilter !== 'all' || localityFilter !== 'all' || roleFilter !== 'all' || statusFilter !== 'all');

  const exportLabel = useMemo(() => {
    const parts: string[] = [];
    if (hubFilter !== 'all') parts.push(dbHubs.find(h => h.id === hubFilter)?.name || '');
    if (stateFilter !== 'all') parts.push(sudanStates.find(s => s.id === stateFilter)?.name || '');
    if (roleFilter !== 'all') parts.push(ROLE_LABELS[roleFilter] || roleFilter);
    if (statusFilter !== 'all') parts.push(statusFilter);
    if (search) parts.push(`"${search}"`);
    return parts.filter(Boolean).join(', ');
  }, [hubFilter, stateFilter, roleFilter, statusFilter, search]);

  /* ── Stat card ── */
  /**
   * Stat card — prominent design with a coloured top strip, icon circle, and
   * large number.  `accent` drives all colour: border, icon bg, number text.
   * Mirrors the card style used on Down Payment Approval and similar pages.
   */
  const StatCard = ({
    label, value, icon: Icon, accent, onClick,
  }: {
    label: string; value: number | string; icon: any;
    accent: { border: string; iconBg: string; iconColor: string; numColor: string };
    onClick?: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all duration-150
        hover:shadow-md hover:-translate-y-0.5 active:translate-y-0
        ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      data-testid={`stat-${String(label).toLowerCase().replace(/\s+/g, '-')}`}
    >
      {/* Coloured top accent bar */}
      <div className={`h-1 w-full ${accent.border}`} />
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground leading-tight truncate">{label}</p>
          <p className={`text-2xl font-extrabold tracking-tight mt-0.5 ${accent.numColor}`}>
            {loading ? <span className="text-muted-foreground/40">—</span> : value}
          </p>
        </div>
        <div className={`shrink-0 rounded-xl p-2.5 ${accent.iconBg}`}>
          <Icon className={`h-5 w-5 ${accent.iconColor}`} />
        </div>
      </div>
    </button>
  );

  /* ── Profile card ── */
  const ProfileCard = ({ p }: { p: StaffProfile }) => {
    const hub   = dbHubs.find(h => h.id === p.hub_id);
    const state = sudanStates.find(s => s.id === p.state_id);
    const av    = avBadge(p.presence);
    return (
      <Card
        className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 border hover:border-blue-200 dark:hover:border-blue-800 group overflow-hidden"
        onClick={() => setSelected(p)}
        data-testid={`card-profile-${p.id}`}
      >
        <CardContent className="p-0">
          {/* Card top bar — availability color strip */}
          <div className={`h-1 w-full ${p.presence === 'online' ? 'bg-green-500' : p.presence === 'away' ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`} />

          <div className="p-4 space-y-3">
            {/* Header row */}
            <div className="flex items-start gap-3">
              <Avatar name={p.full_name} size="md" availability={p.presence} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className="font-semibold text-sm text-foreground truncate group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                    {p.full_name || 'Unknown'}
                  </p>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 invisible group-hover:visible" />
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
              </div>
            </div>

            {/* Department badge */}
            {p.department_name && (
              <div className="flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5 w-fit">
                <Building2 className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate max-w-[120px]">{p.department_name}</span>
              </div>
            )}

            {/* Role + status row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <RoleBadge role={p.role} />
              {p.contract_type === 'retainer' && (
                <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800">
                  Retainer
                </span>
              )}
              {p.contract_type === 'both' && (
                <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800">
                  Salary+Retainer
                </span>
              )}
              {/* WhatsApp-style inline status dot + label */}
              <span className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  p.presence === 'online' ? 'bg-green-500 animate-pulse' :
                  p.presence === 'away'   ? 'bg-amber-400' : 'bg-slate-300 dark:bg-slate-600'
                }`} />
                <span className={`text-[10px] font-semibold ${av.labelColor}`}>
                  {p.presence === 'online' ? 'Online now' :
                   p.presence === 'away'   ? `Last seen ${lastActive(p.last_activity, p.updated_at)}` :
                                            `Last seen ${lastActive(p.last_activity, p.updated_at)}`}
                </span>
              </span>
            </div>

            {/* Location */}
            {(hub || state) && (
              <div className="space-y-0.5">
                {hub && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="font-medium text-foreground">{hub.name}</span>
                  </div>
                )}
                {state && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span>{state.name}</span>
                  </div>
                )}
              </div>
            )}

            {/* Device info footer */}
            {p.device_info && (
              <>
                <Separator />
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {(p.device_info.includes('Android') || p.device_info.includes('iPhone') || p.device_info.toLowerCase().includes('mobile'))
                    ? <Smartphone className="h-3 w-3 shrink-0" />
                    : <Monitor className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{p.device_info}</span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  /* ── Empty state ── */
  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-3">
      <div className="rounded-full bg-muted p-4">
        <Users className="h-8 w-8 opacity-40" />
      </div>
      <p className="font-medium text-sm">{message}</p>
      {hasFilters && (
        <Button variant="outline" size="sm" onClick={clearFilters}>Clear all filters</Button>
      )}
    </div>
  );

  /* ── Shared filter bar ── */
  const FilterBar = (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search name, email, employee ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
            data-testid="input-staff-search"
          />
        </div>

        {/* Hub */}
        <Select value={hubFilter} onValueChange={v => { setHubFilter(v); setStateFilter('all'); setLocalFilter('all'); }}>
          <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-hub">
            <SelectValue placeholder="All Hubs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hubs</SelectItem>
            {dbHubs.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* State */}
        <Select value={stateFilter} onValueChange={v => { setStateFilter(v); setLocalFilter('all'); }}>
          <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-state">
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {availableStates.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Locality */}
        <Select value={localityFilter} onValueChange={setLocalFilter} disabled={stateFilter === 'all'}>
          <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-locality">
            <SelectValue placeholder={stateFilter === 'all' ? 'Select state' : 'All Localities'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Localities</SelectItem>
            {availableLocalities.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Role */}
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-8 w-[120px] text-xs" data-testid="select-role">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLE_OPTIONS.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Status */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[110px] text-xs" data-testid="select-status">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="online">Online now</SelectItem>
            <SelectItem value="away">Away (60 min)</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>

        {/* Clear */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs gap-1 text-muted-foreground" data-testid="button-clear-filters">
            <XCircle className="h-3.5 w-3.5" />Clear
          </Button>
        )}

        {/* Right side: count badge + view toggle */}
        <div className="flex items-center gap-1.5 ml-auto">
          {hasFilters && (
            <Badge variant="secondary" className="text-xs font-medium">
              {filtered.length} of {enrichedProfiles.length}
            </Badge>
          )}
          <div className="flex border rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-2 py-1.5 transition-colors ${viewMode === 'cards' ? 'bg-[#0F2041] text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
              data-testid="button-view-cards"
              title="Card view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2 py-1.5 transition-colors ${viewMode === 'table' ? 'bg-[#0F2041] text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
              data-testid="button-view-table"
              title="Table view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div ref={pageTopRef} className="min-h-screen bg-background">
      {/* ── Page Header Banner ── */}
      <div className="bg-gradient-to-r from-[#0F2041] via-[#1a3260] to-[#1D3461] px-6 py-6 md:py-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="rounded-lg bg-white/10 p-2">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white leading-tight">Staff Directory</h1>
                <p className="text-white/50 text-sm">دليل الموظفين</p>
              </div>
            </div>
            <p className="text-white/60 text-xs mt-2 max-w-lg">
              Field team profiles · Online presence · Capacity overview
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ExportMenu profiles={filtered} tab={activeTab} label={exportLabel} dbHubs={dbHubs} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(true)}
              disabled={refreshing}
              className="gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 space-y-5">
        {/* ── Info Banner ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <PageInfoBanner
            title="Staff Directory"
            description="View field team profiles across all operations. Directory tab shows live online status and device info. Capacity shows headcount breakdown by Hub, State, and Role. Bank Accounts shows the full account registry with registered/missing status. Online Now shows who is currently active."
            descriptionAr="عرض ملفات تعريف الفريق الميداني عبر جميع العمليات. يعرض الحضور المباشر ومعلومات الجهاز وتوزيع القدرات والحسابات البنكية."
          />
          {canAccessDepts && (
            <Link
              to="/departments"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline whitespace-nowrap"
              data-testid="link-departments"
            >
              <Building2 className="h-3.5 w-3.5" />
              View Departments
            </Link>
          )}
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Total Staff"
            value={stats.total}
            icon={Users}
            accent={{ border: 'bg-[#1D3461]', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-[#1D3461] dark:text-blue-300', numColor: 'text-[#0F2041] dark:text-blue-300' }}
          />
          <StatCard
            label="Online Now"
            value={stats.online}
            icon={Wifi}
            accent={{ border: 'bg-green-500', iconBg: 'bg-green-100 dark:bg-green-900/40', iconColor: 'text-green-600 dark:text-green-400', numColor: 'text-green-700 dark:text-green-400' }}
            onClick={() => setActiveTab('online')}
          />
          <StatCard
            label="Away (< 60 min)"
            value={stats.busy}
            icon={Activity}
            accent={{ border: 'bg-amber-400', iconBg: 'bg-amber-100 dark:bg-amber-900/40', iconColor: 'text-amber-600 dark:text-amber-400', numColor: 'text-amber-700 dark:text-amber-400' }}
            onClick={() => { setStatusFilter('away'); setActiveTab('directory'); }}
          />
          <StatCard
            label="Assigned to Hub"
            value={stats.withHub}
            icon={Building2}
            accent={{ border: 'bg-blue-500', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-blue-600 dark:text-blue-400', numColor: 'text-blue-700 dark:text-blue-400' }}
            onClick={() => setActiveTab('capacity')}
          />
          <StatCard
            label="Location Active"
            value={stats.withLocation}
            icon={MapPin}
            accent={{ border: 'bg-teal-500', iconBg: 'bg-teal-100 dark:bg-teal-900/40', iconColor: 'text-teal-600 dark:text-teal-400', numColor: 'text-teal-700 dark:text-teal-400' }}
          />
          <StatCard
            label="Missing Bank Account"
            value={stats.missingBank}
            icon={UserX}
            accent={{ border: 'bg-red-500', iconBg: 'bg-red-100 dark:bg-red-900/40', iconColor: 'text-red-600 dark:text-red-400', numColor: 'text-red-700 dark:text-red-400' }}
            onClick={() => { setBankFilter('missing'); setActiveTab('bank_accounts'); }}
          />
        </div>

        {/* ── Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <TabsList className="flex-wrap h-auto gap-1 p-1 bg-muted/60 border rounded-lg">
              <TabsTrigger value="directory" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-md text-xs h-8 px-3">
                <LayoutGrid className="h-3.5 w-3.5" />Directory
                {!loading && (
                  <span className="ml-0.5 rounded-full bg-current/10 px-1.5 py-0 text-[10px] font-bold data-[state=active]:bg-white/20">
                    {filtered.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="capacity" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-md text-xs h-8 px-3">
                <BarChart3 className="h-3.5 w-3.5" />Capacity
              </TabsTrigger>
              <TabsTrigger value="bank_accounts" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-md text-xs h-8 px-3">
                <Landmark className="h-3.5 w-3.5" />Bank Accounts
                {!loading && stats.missingBank > 0 && (
                  <span className="ml-0.5 rounded-full bg-red-500 text-white px-1.5 py-0 text-[10px] font-bold">{stats.missingBank}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="online" className="gap-1.5 data-[state=active]:bg-green-700 data-[state=active]:text-white rounded-md text-xs h-8 px-3">
                <Wifi className="h-3.5 w-3.5" />Online Now
                {!loading && stats.online > 0 && (
                  <span className="ml-0.5 rounded-full bg-green-500 data-[state=inactive]:bg-green-500 text-white px-1.5 py-0 text-[10px] font-bold">
                    {stats.online}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Shared filter bar */}
          {FilterBar}

          {/* ── Directory tab ── */}
          <TabsContent value="directory" className="mt-0">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-52 w-full rounded-lg" />)}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState message="No profiles match your filters" />
            ) : viewMode === 'cards' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map(p => <ProfileCard key={p.id} p={p} />)}
              </div>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-[200px]">Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Hub</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Last Active</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(p => {
                        const hub   = dbHubs.find(h => h.id === p.hub_id);
                        const state = sudanStates.find(s => s.id === p.state_id);
                        const av    = avBadge(p.presence);
                        return (
                          <TableRow
                            key={p.id}
                            className="cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
                            onClick={() => setSelected(p)}
                            data-testid={`row-profile-${p.id}`}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <Avatar name={p.full_name} size="sm" availability={p.presence} />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{p.full_name || '—'}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell><RoleBadge role={p.role} /></TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${av.dot}`} />
                                <span className={`text-xs font-medium ${av.labelColor}`}>{av.label}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">{hub?.name || '—'}</TableCell>
                            <TableCell className="text-xs">{state?.name || '—'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{lastActive(p.last_activity, p.updated_at)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{p.device_info || '—'}</TableCell>
                            <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ── Capacity tab ── */}
          <TabsContent value="capacity" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {([
                { title: 'By Hub',   icon: Building2, data: capHub,   desc: 'Headcount per hub office' },
                { title: 'By State', icon: MapPin,    data: capState, desc: 'Headcount per state' },
                { title: 'By Role',  icon: Shield,    data: capRole,  desc: 'Headcount per role' },
              ] as const).map(({ title, icon: Icon, data, desc }) => (
                <Card key={title}>
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />{title}
                    </CardTitle>
                    <CardDescription className="text-xs">{desc}</CardDescription>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
                      <span className="flex items-center gap-1"><Wifi className="h-2.5 w-2.5 text-green-500" />Online</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-3 space-y-3 max-h-72 overflow-y-auto">
                    {loading ? (
                      Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                    ) : data.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No data</p>
                    ) : data.map(r => (
                      <CapRow key={r.name} label={r.name} total={r.total} online={r.online} max={data[0].total} />
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── Online Now tab ── */}
          <TabsContent value="online" className="mt-0">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-52" />)}
              </div>
            ) : enrichedProfiles.filter(p => p.presence === 'online' || p.presence === 'away').length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-3">
                <div className="rounded-full bg-muted p-4">
                  <WifiOff className="h-8 w-8 opacity-40" />
                </div>
                <p className="font-medium text-sm">No staff currently connected</p>
                <p className="text-xs">Online means a live WebSocket connection is open right now</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Real-time connection indicator */}
                <div className="flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-3 py-2 text-xs">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
                  <span className="text-green-700 dark:text-green-400 font-medium">
                    {isConnected ? 'Live WebSocket connected — updates instantly' : 'Connecting to presence channel…'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-green-700 dark:text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    {enrichedProfiles.filter(p => p.presence === 'online').length} online now
                  </span>
                  {enrichedProfiles.filter(p => p.presence === 'away').length > 0 && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {enrichedProfiles.filter(p => p.presence === 'away').length} away (&lt;60 min)
                      </span>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {enrichedProfiles
                    .filter(p => p.presence === 'online' || p.presence === 'away')
                    .sort((a, b) => (a.presence === 'online' ? -1 : 1))
                    .map(p => <ProfileCard key={p.id} p={p} />)}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Bank Accounts tab ── */}
          <TabsContent value="bank_accounts" className="mt-0 space-y-3">
            {stats.missingBank > 0 && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-red-100 dark:bg-red-900/50 p-1.5">
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                      {stats.missingBank} staff member{stats.missingBank !== 1 ? 's' : ''} missing bank account
                    </p>
                    <p className="text-xs text-red-600/70 dark:text-red-400/70">Payments cannot be processed for these staff members</p>
                  </div>
                </div>
                <Button size="sm" variant="outline"
                  className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 shrink-0"
                  onClick={() => setBankFilter('missing')}
                  data-testid="button-view-missing-bank">
                  View Missing
                </Button>
              </div>
            )}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bank Account Registry</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-semibold">
                    <CheckCircle className="h-3 w-3" />{stats.withBank} registered
                  </span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="flex items-center gap-1 text-red-500 font-semibold">
                    <XCircle className="h-3 w-3" />{stats.missingBank} missing
                  </span>
                  {bankFilter !== 'all' && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <button onClick={() => setBankFilter('all')} className="text-primary underline text-xs" data-testid="button-clear-bank-filter">Clear filter</button>
                    </>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
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
                    {loading ? (
                      Array(5).fill(0).map((_, i) => (
                        <TableRow key={i}>{Array(8).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                      ))
                    ) : filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No staff match your filters</TableCell></TableRow>
                    ) : filtered.map(p => {
                      const hub   = dbHubs.find(h => h.id === p.hub_id);
                      const state = sudanStates.find(s => s.id === p.state_id);
                      const hasBank = !!(p.bank_account?.accountNumber || p.bank_account?.accountName);
                      return (
                        <TableRow key={p.id} className="cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
                          onClick={() => setSelected(p)} data-testid={`row-bank-${p.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={p.full_name} size="sm" availability={p.presence} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{p.full_name || '—'}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell><RoleBadge role={p.role} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{[hub?.name, state?.name].filter(Boolean).join(' / ') || '—'}</TableCell>
                          <TableCell className="text-sm font-medium">{p.bank_account?.accountName || <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                          <TableCell>
                            {p.bank_account?.accountNumber
                              ? <span className="text-sm font-mono font-bold text-[#0F2041] dark:text-blue-300">{p.bank_account.accountNumber}</span>
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-sm">{p.bank_account?.bankName || <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                          <TableCell className="text-sm">{p.bank_account?.branch || <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                          <TableCell>
                            {hasBank
                              ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400"><CheckCircle className="h-3 w-3" />Registered</span>
                              : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400"><XCircle className="h-3 w-3" />Missing</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Profile detail modal */}
      {selected && <ProfileDetail profile={selected} onClose={() => setSelected(null)} dbHubs={dbHubs} />}
    </div>
  );
}
