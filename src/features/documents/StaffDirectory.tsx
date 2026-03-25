import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
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
  Shield, RefreshCw, LayoutGrid, List, ChevronRight,
  Smartphone, Monitor, Clock, AlertCircle, CheckCircle, XCircle,
  Hash, Globe, Activity, BarChart3, Copy, Download, FileSpreadsheet,
  FileText, FileDown, GitBranch, UserCheck, UserX,
  TrendingDown, Banknote, ChevronDown, ChevronUp, AlertTriangle
} from "lucide-react";
import { sudanStates, getLocalitiesByState } from "@/data/sudanStates";
import { useGlobalPresence } from "@/features/notifications/context/GlobalPresenceContext";
import { useToast } from "@/shared/hooks/use-toast";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { PageInfoBanner } from "@/components/financial/PageInfoBanner";
import {
  fetchDbHubsForStaffDirectory,
  fetchProfilesForStaffDirectory,
  fetchLatestUserActivityLogs,
  subscribeStaffDirectoryPresenceRealtime,
  fetchStaffFinanceMonthRows,
  fetchStaffFinanceDetailsForProfile,
} from "@/features/documents/repository/staffDirectoryRepository";
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
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', admin: 'Admin', country_director: 'Country Director',
  fom: 'FOM', supervisor: 'Supervisor', coordinator: 'Coordinator',
  data_team: 'Data Team', financial_auditor: 'Financial Auditor', enumerator: 'Enumerator',
};
const ROLE_COLORS: Record<string, string> = {
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
function maskAcc(n?: string) { if (!n) return '—'; return n.length <= 4 ? n : '•••• ' + n.slice(-4); }
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
      availability: p.availability, bank_account: p.bank_account,
      last_activity: p.last_activity, device_info: p.device_info,
      app_version: p.app_version, location_sharing: p.location_sharing,
    };
  });
}

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
  const ba       = profile.bank_account;
  const hasBank  = !!(ba?.accountNumber || ba?.accountName);

  const copy = (t: string, l: string) => { navigator.clipboard.writeText(t); toast({ title: `${l} copied` }); };

  /* ── Per-user financial data (with individual records) ── */
  const [finRequested, setFinRequested] = useState(false);
  const [finKey,       setFinKey]       = useState(0);
  const [finLoading, setFinLoading] = useState(false);
  const [advanceRows,    setAdvanceRows]    = useState<any[]>([]);
  const [costRows,       setCostRows]       = useState<any[]>([]);
  const [withdrawalRows, setWithdrawalRows] = useState<any[]>([]);
  const [mmpRows,        setMmpRows]        = useState<any[]>([]);
  const [finOpen, setFinOpen] = useState<'advances' | 'costs' | 'withdrawals' | 'mmp' | null>(null);

  useEffect(() => {
    if (!finRequested) return;
    const fetchUserFin = async () => {
      setFinLoading(true);
      try {
        const {
          advanceRows,
          costRows,
          withdrawalRows,
          mmpSiteEntriesRows,
          mmpFilesRows,
        } = await fetchStaffFinanceDetailsForProfile(profile.id);

        setAdvanceRows(advanceRows || []);
        setCostRows(costRows || []);
        setWithdrawalRows(withdrawalRows || []);

        /* ── Group mmp_site_entries by mmp_file_id ── */
        const entries: any[] = mmpSiteEntriesRows || [];
        const mmpFileIds = [...new Set(entries.map((e: any) => e.mmp_file_id).filter(Boolean))];

        if (mmpFileIds.length > 0) {
          const fileMap: Record<string, any> = {};
          (mmpFilesRows || []).forEach((f: any) => { fileMap[f.id] = f; });
        const grouped: Record<string, any> = {};
        entries.forEach((e: any) => {
          const fid = e.mmp_file_id;
          if (!fid) return;
          if (!grouped[fid]) {
            const f = fileMap[fid] || {};
            grouped[fid] = {
              mmpFileId: fid, mmpName: f.name || fid, mmpId: f.mmp_id || '',
              month: f.month, mmpStatus: f.status || '', siteCount: 0,
              totalCost: 0, enumFee: 0, transportFee: 0,
            };
          }
          grouped[fid].siteCount += 1;
          grouped[fid].totalCost    += Math.abs(Number(e.cost) || 0);
          grouped[fid].enumFee      += Math.abs(Number(e.enumerator_fee) || 0);
          grouped[fid].transportFee += Math.abs(Number(e.transport_fee) || 0);
        });
        setMmpRows(Object.values(grouped).sort((a, b) => b.totalCost - a.totalCost));
      } else {
        setMmpRows([]);
      }
      } finally {
        setFinLoading(false);
      }
    };
    fetchUserFin();
  }, [finRequested, finKey, profile.id]);

  const dpSummary = useMemo(() => ({
    total:     advanceRows.length,
    pending:   advanceRows.filter(r => ['pending','pending_supervisor','pending_admin'].includes(r.status)).length,
    approved:  advanceRows.filter(r => r.status === 'approved' || r.status === 'paid').length,
    rejected:  advanceRows.filter(r => r.status === 'rejected').length,
    amountSDG: Math.round(advanceRows.reduce((s, r) => s + Math.abs(Number(r.requested_amount) || 0), 0)),
  }), [advanceRows]);

  const ocSummary = useMemo(() => ({
    total:     costRows.length,
    pending:   costRows.filter(r => !r.tier2_status || !['approved','rejected'].includes(r.tier2_status)).length,
    approved:  costRows.filter(r => r.tier2_status === 'approved').length,
    rejected:  costRows.filter(r => r.tier2_status === 'rejected' || r.tier1_status === 'rejected').length,
    amountSDG: Math.round(costRows.reduce((s, r) => s + Math.abs(Number(r.amount_cents) || 0) / 100, 0)),
  }), [costRows]);

  const wrSummary = useMemo(() => ({
    total:       withdrawalRows.length,
    pending:     withdrawalRows.filter(r => r.status === 'pending').length,
    approved:    withdrawalRows.filter(r => r.status === 'approved').length,
    rejected:    withdrawalRows.filter(r => r.status === 'rejected').length,
    amountSDG:   Math.round(withdrawalRows.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)),
    confirmed:   withdrawalRows.filter(r => r.status === 'approved' && r.fund_receipt_confirmed).length,
    unconfirmed: withdrawalRows.filter(r => r.status === 'approved' && !r.fund_receipt_confirmed).length,
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
                    ['Account Name', ba?.accountName],
                    ['Account Number', ba?.accountNumber, true],
                    ['Bank Name', ba?.bankName],
                    ['Branch', ba?.branch],
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
                <button
                  type="button"
                  onClick={() => setFinKey(k => k + 1)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Reload financial data"
                >
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
                <Banknote className="h-3.5 w-3.5" />
                Load Financial Activity
              </button>
            ) : finLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <div className="space-y-2">

                {/* ── Transportation Advances ── */}
                <div className="rounded-lg border overflow-hidden">
                  {/* summary header — clickable to expand */}
                  <button
                    type="button"
                    onClick={() => setFinOpen(o => o === 'advances' ? null : 'advances')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-colors text-left"
                  >
                    <TrendingDown className="h-4 w-4 text-indigo-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">Transportation Advances</span>
                        <span className="text-[10px] text-muted-foreground">سلف النقل</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-foreground rounded px-1.5 py-0.5">{dpSummary.total} total</span>
                        {dpSummary.pending > 0  && <span className="text-[10px] bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded px-1.5 py-0.5">⏳ {dpSummary.pending} pending</span>}
                        {dpSummary.approved > 0 && <span className="text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 rounded px-1.5 py-0.5">✓ {dpSummary.approved} approved</span>}
                        {dpSummary.rejected > 0 && <span className="text-[10px] bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded px-1.5 py-0.5">✗ {dpSummary.rejected} rejected</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-indigo-700 dark:text-indigo-400">SDG {dpSummary.amountSDG.toLocaleString()}</p>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground ml-auto mt-0.5 transition-transform ${finOpen === 'advances' ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {/* expanded rows */}
                  {finOpen === 'advances' && (
                    <div className="divide-y divide-border max-h-56 overflow-y-auto">
                      {advanceRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No advance requests found</p>
                      ) : advanceRows.map(r => {
                        const isPending  = ['pending','pending_supervisor','pending_admin'].includes(r.status);
                        const isApproved = r.status === 'approved' || r.status === 'paid';
                        const isRejected = r.status === 'rejected';
                        return (
                          <div key={r.id} className="px-4 py-2.5 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isApproved ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : isPending ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : isRejected ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-muted text-muted-foreground'}`}>
                                  {r.status}
                                </span>
                                {r.hub_name && <span className="text-[10px] text-muted-foreground">{r.hub_name}</span>}
                                {r.site_name && <span className="text-[10px] text-muted-foreground">· {r.site_name}</span>}
                              </div>
                              {r.justification && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{r.justification}</p>}
                              <p className="text-[10px] text-muted-foreground mt-0.5">{r.requested_at ? format(parseISO(r.requested_at), 'dd MMM yyyy') : '—'}</p>
                            </div>
                            <p className="text-xs font-bold text-foreground shrink-0">SDG {Number(r.requested_amount || 0).toLocaleString()}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Cost Submissions ── */}
                <div className="rounded-lg border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setFinOpen(o => o === 'costs' ? null : 'costs')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors text-left"
                  >
                    <FileText className="h-4 w-4 text-orange-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">Cost Submissions</span>
                        <span className="text-[10px] text-muted-foreground">طلبات التكاليف</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-foreground rounded px-1.5 py-0.5">{ocSummary.total} total</span>
                        {ocSummary.pending > 0  && <span className="text-[10px] bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded px-1.5 py-0.5">⏳ {ocSummary.pending} pending</span>}
                        {ocSummary.approved > 0 && <span className="text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 rounded px-1.5 py-0.5">✓ {ocSummary.approved} approved</span>}
                        {ocSummary.rejected > 0 && <span className="text-[10px] bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded px-1.5 py-0.5">✗ {ocSummary.rejected} rejected</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-orange-700 dark:text-orange-400">SDG {ocSummary.amountSDG.toLocaleString()}</p>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground ml-auto mt-0.5 transition-transform ${finOpen === 'costs' ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {finOpen === 'costs' && (
                    <div className="divide-y divide-border max-h-56 overflow-y-auto">
                      {costRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No cost submissions found</p>
                      ) : costRows.map(r => {
                        const effStatus = r.tier2_status === 'approved' ? 'approved' : (r.tier2_status === 'rejected' || r.tier1_status === 'rejected') ? 'rejected' : r.tier1_status === 'approved' ? 'under review' : 'pending';
                        const isApproved = effStatus === 'approved';
                        const isRejected = effStatus === 'rejected';
                        return (
                          <div key={r.id} className="px-4 py-2.5 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isApproved ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : isRejected ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'}`}>
                                  {effStatus}
                                </span>
                                {r.expense_category && <span className="text-[10px] text-muted-foreground">{r.expense_category}</span>}
                              </div>
                              {r.description && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{r.description}</p>}
                              <p className="text-[10px] text-muted-foreground mt-0.5">{r.created_at ? format(parseISO(r.created_at), 'dd MMM yyyy') : '—'}</p>
                            </div>
                            <p className="text-xs font-bold text-foreground shrink-0">SDG {(Math.abs(Number(r.amount_cents) || 0) / 100).toLocaleString()}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Withdrawal Requests ── */}
                <div className="rounded-lg border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setFinOpen(o => o === 'withdrawals' ? null : 'withdrawals')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors text-left"
                  >
                    <Landmark className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">Withdrawal Requests</span>
                        <span className="text-[10px] text-muted-foreground">طلبات السحب</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-foreground rounded px-1.5 py-0.5">{wrSummary.total} total</span>
                        {wrSummary.pending > 0     && <span className="text-[10px] bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded px-1.5 py-0.5">⏳ {wrSummary.pending} pending</span>}
                        {wrSummary.approved > 0    && <span className="text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 rounded px-1.5 py-0.5">✓ {wrSummary.approved} approved</span>}
                        {wrSummary.unconfirmed > 0 && <span className="text-[10px] bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded px-1.5 py-0.5">⚠ {wrSummary.unconfirmed} unacknowledged</span>}
                        {wrSummary.confirmed > 0   && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded px-1.5 py-0.5">📄 {wrSummary.confirmed} receipt confirmed</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">SDG {wrSummary.amountSDG.toLocaleString()}</p>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground ml-auto mt-0.5 transition-transform ${finOpen === 'withdrawals' ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {finOpen === 'withdrawals' && (
                    <div className="divide-y divide-border max-h-64 overflow-y-auto">
                      {withdrawalRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No withdrawal requests found</p>
                      ) : withdrawalRows.map(r => {
                        const isApproved = r.status === 'approved';
                        const isRejected = r.status === 'rejected';
                        const confirmed  = isApproved && r.fund_receipt_confirmed;
                        return (
                          <div key={r.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isApproved ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : isRejected ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'}`}>
                                    {r.status}
                                  </span>
                                  {r.currency && <span className="text-[10px] text-muted-foreground">{r.currency}</span>}
                                </div>
                                {r.request_reason && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{r.request_reason}</p>}
                                <p className="text-[10px] text-muted-foreground mt-0.5">{r.created_at ? format(parseISO(r.created_at), 'dd MMM yyyy') : '—'}</p>
                              </div>
                              <p className="text-xs font-bold text-foreground shrink-0">SDG {Number(r.amount || 0).toLocaleString()}</p>
                            </div>
                            {/* Fund receipt confirmation row */}
                            {isApproved && (
                              <div className={`mt-2 flex items-start gap-2 rounded px-2 py-1.5 text-[10px] ${confirmed ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800' : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'}`}>
                                {confirmed ? (
                                  <>
                                    <CheckCircle className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                                    <div>
                                      <span className="font-semibold text-blue-700 dark:text-blue-400">Fund receipt confirmed</span>
                                      {r.fund_receipt_confirmed_at && <span className="text-blue-500 ml-1">· {format(parseISO(r.fund_receipt_confirmed_at), 'dd MMM yyyy')}</span>}
                                      {r.fund_receipt_notes && <p className="text-blue-500 mt-0.5 italic">"{r.fund_receipt_notes}"</p>}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                                    <div>
                                      <span className="font-semibold text-red-600 dark:text-red-400">Awaiting fund receipt acknowledgment</span>
                                      {r.admin_processed_at && <span className="text-red-400 ml-1">· disbursed {format(parseISO(r.admin_processed_at), 'dd MMM yyyy')}</span>}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── MMP Cost Summary ── */}
                <div className="rounded-lg border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setFinOpen(o => o === 'mmp' ? null : 'mmp')}
                    className="w-full flex items-center gap-3 px-4 py-4 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50 transition-colors text-left"
                  >
                    <MapPin className="h-5 w-5 text-violet-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-semibold text-foreground">MMP Site Costs</span>
                        <span className="text-xs text-muted-foreground">تكاليف مواقع خطة الرصد</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs bg-slate-200 dark:bg-slate-700 text-foreground rounded px-1.5 py-0.5">{mmpRows.length} MMP{mmpRows.length !== 1 ? 's' : ''}</span>
                        <span className="text-xs bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-400 rounded px-1.5 py-0.5">
                          {mmpRows.reduce((s, r) => s + r.siteCount, 0)} sites
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold text-violet-700 dark:text-violet-400">
                        SDG {Math.round(mmpRows.reduce((s, r) => s + r.totalCost, 0)).toLocaleString()}
                      </p>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground ml-auto mt-0.5 transition-transform ${finOpen === 'mmp' ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {finOpen === 'mmp' && (
                    <div className="divide-y divide-border max-h-96 overflow-y-auto">
                      {mmpRows.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No MMP site entries found</p>
                      ) : mmpRows.map(r => (
                        <div key={r.mmpFileId} className="px-4 py-4 hover:bg-muted/30 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-foreground">{r.mmpName}</span>
                                {r.mmpId && <span className="text-xs text-muted-foreground font-mono">{r.mmpId}</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {r.month && <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 rounded px-1.5 py-0.5">Month {r.month}</span>}
                                <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded px-1.5 py-0.5">{r.siteCount} sites</span>
                                {r.mmpStatus && <span className="text-xs text-muted-foreground capitalize">{r.mmpStatus.replace(/_/g, ' ')}</span>}
                              </div>
                              {(r.enumFee > 0 || r.transportFee > 0) && (
                                <div className="flex flex-wrap gap-4 mt-2">
                                  {r.enumFee > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      👤 <span className="font-medium">Enum:</span> SDG {Math.round(r.enumFee).toLocaleString()}
                                    </span>
                                  )}
                                  {r.transportFee > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      🚗 <span className="font-medium">Transport:</span> SDG {Math.round(r.transportFee).toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <p className="text-sm font-bold text-violet-700 dark:text-violet-400 shrink-0">
                              SDG {Math.round(r.totalCost).toLocaleString()}
                            </p>
                          </div>
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
function CapRow({ label, total, online, withBank, max }: { label: string; total: number; online: number; withBank: number; max: number }) {
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
          <span className={`inline-flex items-center gap-1 ${withBank < total ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
            <Landmark className="h-2.5 w-2.5" />{withBank}
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

/* ─── Financial Summary Card ─────────────────────────────── */
interface FinRow    { total: number; approved: number; amountSDG: number }
interface FinMonth  { current: FinRow; prev: FinRow }

function FinSummaryCard({
  title, titleAr, icon: Icon, data, accentBg, accentText, accentBorder, loading, awaitingAck,
}: {
  title: string; titleAr: string; icon: React.ElementType;
  data: FinMonth;
  accentBg: string; accentText: string; accentBorder: string;
  loading: boolean;
  awaitingAck?: number;
}) {
  const diff = data.current.amountSDG - data.prev.amountSDG;
  const up   = diff >= 0;
  return (
    <Card className="overflow-hidden">
      <div className={`h-1 ${accentBorder}`} />
      <CardContent className="pt-3 pb-4 px-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className={`rounded-md p-1.5 ${accentBg}`}>
            <Icon className={`h-3.5 w-3.5 ${accentText}`} />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground leading-tight">{title}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{titleAr}</p>
          </div>
          {!loading && diff !== 0 && (
            <span className={`ml-auto flex items-center gap-0.5 text-[10px] font-semibold ${up ? 'text-red-500' : 'text-green-600'}`}>
              {up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {up ? '+' : ''}{diff.toLocaleString()} SDG
            </span>
          )}
        </div>
        {/* This month / Last month columns */}
        {loading ? (
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-border">
            {/* This month */}
            <div className="pr-3 space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">This Month</p>
              <p className={`text-2xl font-bold leading-none ${accentText}`}>{data.current.total}</p>
              <p className="text-[10px] text-muted-foreground">
                <span className="font-semibold text-foreground">{data.current.approved}</span> approved
              </p>
              <p className="text-[10px] font-medium text-foreground">
                SDG {data.current.amountSDG.toLocaleString()}
              </p>
            </div>
            {/* Last month */}
            <div className="pl-3 space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Last Month</p>
              <p className="text-2xl font-bold leading-none text-muted-foreground">{data.prev.total}</p>
              <p className="text-[10px] text-muted-foreground">
                <span className="font-semibold">{data.prev.approved}</span> approved
              </p>
              <p className="text-[10px] font-medium text-muted-foreground">
                SDG {data.prev.amountSDG.toLocaleString()}
              </p>
            </div>
          </div>
        )}
        {/* Awaiting acknowledgment alert (only for Withdrawal Requests card) */}
        {!loading && awaitingAck !== undefined && awaitingAck > 0 && (
          <div className="flex items-center gap-1.5 rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-2.5 py-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              {awaitingAck} awaiting acknowledgment
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function StaffDirectory() {
  const { toast } = useToast();
  const { isUserOnline, isConnected, onlineUserIds } = useGlobalPresence();
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

  /* ── Financial summary state ── */
  const emptyFinRow = (): FinRow => ({ total: 0, approved: 0, amountSDG: 0 });
  const [finLoading, setFinLoading] = useState(true);
  const [awaitingAck, setAwaitingAck] = useState(0);
  const [finData, setFinData] = useState<{
    advances:    FinMonth;
    costs:       FinMonth;
    withdrawals: FinMonth;
  }>({
    advances:    { current: emptyFinRow(), prev: emptyFinRow() },
    costs:       { current: emptyFinRow(), prev: emptyFinRow() },
    withdrawals: { current: emptyFinRow(), prev: emptyFinRow() },
  });

  useEffect(() => {
    const fetchFin = async () => {
      setFinLoading(true);
      const now = new Date();
      const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const prevEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

      const {
        dpCur,
        dpPrv,
        ocCur,
        ocPrv,
        wtCur,
        wtPrv,
        awaitingAckCount,
      } = await fetchStaffFinanceMonthRows({
        thisStartIso: thisStart,
        prevStartIso: prevStart,
        prevEndIso: prevEnd,
      });

      const calcDp = (rows: any[]): FinRow => ({
        total:     rows.length,
        approved:  rows.filter(r => r.status === 'approved' || r.status === 'paid').length,
        amountSDG: Math.round(rows.reduce((s, r) => s + Math.abs(Number(r.requested_amount) || 0), 0)),
      });
      const calcOc = (rows: any[]): FinRow => ({
        total:     rows.length,
        approved:  rows.filter(r => r.tier2_status === 'approved').length,
        amountSDG: Math.round(rows.reduce((s, r) => s + Math.abs(Number(r.amount_cents) || 0) / 100, 0)),
      });
      const calcWt = (rows: any[]): FinRow => ({
        total:     rows.length,
        approved:  rows.length,
        amountSDG: Math.round(rows.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)),
      });

      setAwaitingAck(awaitingAckCount);
      setFinData({
        advances:    { current: calcDp(dpCur), prev: calcDp(dpPrv) },
        costs:       { current: calcOc(ocCur), prev: calcOc(ocPrv) },
        withdrawals: { current: calcWt(wtCur), prev: calcWt(wtPrv) },
      });
      setFinLoading(false);
    };
    fetchFin();
  }, []);

  /* Filters */
  const [search, setSearch]              = useState('');
  const [hubFilter, setHubFilter]        = useState('all');
  const [stateFilter, setStateFilter]    = useState('all');
  const [localityFilter, setLocalFilter] = useState('all');
  const [roleFilter, setRoleFilter]      = useState('all');
  const [statusFilter, setStatusFilter]  = useState('all');
  const [bankFilter, setBankFilter]      = useState('all');
  const [viewMode, setViewMode]          = useState<'cards' | 'table'>('cards');
  const [activeTab, setActiveTab]        = useState('directory');

  /* Derived filter options — states per hub require hub_states table join;
     for now, when a hub is selected we show all states (the hub→state mapping
     is stored in DB, not in the local sudanStates file's hub objects).         */
  const availableStates = sudanStates;

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
      const hubsData = await fetchDbHubsForStaffDirectory();
      if (hubsData?.length) setDbHubs(hubsData);

      const pData = await fetchProfilesForStaffDirectory();

      /* Latest activity per user — one batch query */
      const actData = await fetchLatestUserActivityLogs(500);

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
        return { ...p, bank_account: ba, last_activity, device_info, app_version, presence };
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
    const unsubscribe = subscribeStaffDirectoryPresenceRealtime((payload: any) => {
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
    });
    return () => unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enrichedProfiles.filter(p => {
      if (q && !p.full_name?.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q) &&
        !p.phone?.toLowerCase().includes(q) && !p.employee_id?.toLowerCase().includes(q)) return false;
      if (hubFilter !== 'all' && p.hub_id !== hubFilter) return false;
      if (stateFilter !== 'all' && p.state_id !== stateFilter) return false;
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
    total:       enrichedProfiles.length,
    online:      enrichedProfiles.filter(p => p.presence === 'online').length,
    busy:        enrichedProfiles.filter(p => p.presence === 'away').length,
    withBank:    enrichedProfiles.filter(p => !!(p.bank_account?.accountNumber || p.bank_account?.accountName)).length,
    missingBank: enrichedProfiles.filter(p => !(p.bank_account?.accountNumber || p.bank_account?.accountName)).length,
  }), [enrichedProfiles]);

  /* ── Capacity groups ── */
  const mkMap = (key: (p: StaffProfile) => string) => {
    const m: Record<string, { total: number; online: number; withBank: number }> = {};
    filtered.forEach(p => {
      const k = key(p);
      if (!m[k]) m[k] = { total: 0, online: 0, withBank: 0 };
      m[k].total++;
      if (p.presence === 'online') m[k].online++;
      if (p.bank_account?.accountNumber || p.bank_account?.accountName) m[k].withBank++;
    });
    return Object.entries(m)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => {
        if (a.name === 'Unassigned' || a.name === 'Unknown') return 1;
        if (b.name === 'Unassigned' || b.name === 'Unknown') return -1;
        return b.total - a.total;
      });
  };
  const capHub   = useMemo(() => mkMap(p => dbHubs.find(h => h.id === p.hub_id)?.name || 'Unassigned'), [filtered]);
  const capRole  = useMemo(() => mkMap(p => ROLE_LABELS[p.role || ''] || p.role || 'Unknown'), [filtered]);
  const capState = useMemo(() => mkMap(p => sudanStates.find(s => s.id === p.state_id)?.name || 'Unassigned'), [filtered]);

  const clearFilters = () => { setSearch(''); setHubFilter('all'); setStateFilter('all'); setLocalFilter('all'); setRoleFilter('all'); setStatusFilter('all'); setBankFilter('all'); };
  const hasFilters = !!(search || hubFilter !== 'all' || stateFilter !== 'all' || localityFilter !== 'all' || roleFilter !== 'all' || statusFilter !== 'all' || bankFilter !== 'all');

  const exportLabel = useMemo(() => {
    const parts: string[] = [];
    if (hubFilter !== 'all') parts.push(dbHubs.find(h => h.id === hubFilter)?.name || '');
    if (stateFilter !== 'all') parts.push(sudanStates.find(s => s.id === stateFilter)?.name || '');
    if (roleFilter !== 'all') parts.push(ROLE_LABELS[roleFilter] || roleFilter);
    if (statusFilter !== 'all') parts.push(statusFilter);
    if (bankFilter === 'has') parts.push('With Bank Account');
    if (bankFilter === 'missing') parts.push('Missing Bank Account');
    if (search) parts.push(`"${search}"`);
    return parts.filter(Boolean).join(', ');
  }, [hubFilter, stateFilter, roleFilter, statusFilter, bankFilter, search]);

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
    const hasBank = !!(p.bank_account?.accountNumber || p.bank_account?.accountName);
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

            {/* Role + status row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <RoleBadge role={p.role} />
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

            {/* Divider */}
            <Separator />

            {/* Bank + last active footer */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs">
                  <Landmark className="h-3 w-3 text-muted-foreground shrink-0" />
                  {hasBank
                    ? <span className="font-mono text-foreground">{maskAcc(p.bank_account?.accountNumber)}</span>
                    : <span className="text-red-500 font-medium">No account</span>}
                </div>
                {hasBank
                  ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
              </div>
              {/* Device info row — "last seen" already shown above in status */}
              {p.device_info && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {(p.device_info.includes('Android') || p.device_info.includes('iPhone') || p.device_info.toLowerCase().includes('mobile'))
                    ? <Smartphone className="h-3 w-3 shrink-0" />
                    : <Monitor className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{p.device_info}</span>
                </div>
              )}
            </div>
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
            {Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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

        {/* Bank */}
        <Select value={bankFilter} onValueChange={setBankFilter}>
          <SelectTrigger className="h-8 w-[125px] text-xs" data-testid="select-bank">
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            <SelectItem value="has">Has Account</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
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
              Profiles · Bank accounts · Online presence · Capacity overview
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
        <PageInfoBanner
          title="Staff Directory"
          description="View all staff profiles across field operations. The Directory tab shows live online status and device info. Bank Accounts shows full payment details (both web and mobile entries). Capacity shows headcount breakdown by Hub, State, and Role. Online Now shows who is currently active."
          descriptionAr="عرض جميع ملفات تعريف الموظفين عبر العمليات الميدانية. يعرض حساباتهم البنكية وحالتهم الإلكترونية ومعلومات الجهاز وتفاصيل التحصيل."
        />

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
            label="With Bank Account"
            value={stats.withBank}
            icon={UserCheck}
            accent={{ border: 'bg-blue-500', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-blue-600 dark:text-blue-400', numColor: 'text-blue-700 dark:text-blue-400' }}
            onClick={() => { setBankFilter('has'); setActiveTab('bank_accounts'); }}
          />
          <StatCard
            label="Missing Account"
            value={stats.missingBank}
            icon={UserX}
            accent={{ border: 'bg-red-500', iconBg: 'bg-red-100 dark:bg-red-900/40', iconColor: 'text-red-600 dark:text-red-400', numColor: 'text-red-700 dark:text-red-400' }}
            onClick={() => { setBankFilter('missing'); setActiveTab('bank_accounts'); }}
          />
        </div>

        {/* ── Financial Summary ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Financial Overview</h2>
            <span className="text-xs text-muted-foreground">— ملخص مالي</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FinSummaryCard
              title="Transportation Advances"
              titleAr="سلف النقل"
              icon={TrendingDown}
              data={finData.advances}
              accentBorder="bg-indigo-500"
              accentBg="bg-indigo-100 dark:bg-indigo-900/40"
              accentText="text-indigo-600 dark:text-indigo-400"
              loading={finLoading}
            />
            <FinSummaryCard
              title="Cost Submissions"
              titleAr="طلبات التكاليف"
              icon={FileText}
              data={finData.costs}
              accentBorder="bg-orange-500"
              accentBg="bg-orange-100 dark:bg-orange-900/40"
              accentText="text-orange-600 dark:text-orange-400"
              loading={finLoading}
            />
            <FinSummaryCard
              title="Withdrawal Requests"
              titleAr="طلبات السحب"
              icon={Banknote}
              data={finData.withdrawals}
              accentBorder="bg-emerald-500"
              accentBg="bg-emerald-100 dark:bg-emerald-900/40"
              accentText="text-emerald-600 dark:text-emerald-400"
              loading={finLoading}
              awaitingAck={awaitingAck}
            />
          </div>
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
              <TabsTrigger value="bank_accounts" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-md text-xs h-8 px-3">
                <Landmark className="h-3.5 w-3.5" />Bank Accounts
                {!loading && stats.missingBank > 0 && (
                  <span className="ml-0.5 rounded-full bg-red-500 text-white px-1.5 py-0 text-[10px] font-bold">
                    {stats.missingBank}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="capacity" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-md text-xs h-8 px-3">
                <BarChart3 className="h-3.5 w-3.5" />Capacity
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
                        <TableHead>Bank Account</TableHead>
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
                        const hasBank = !!(p.bank_account?.accountNumber || p.bank_account?.accountName);
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
                            <TableCell>
                              {hasBank
                                ? <span className="text-xs font-mono font-medium">{maskAcc(p.bank_account?.accountNumber)}</span>
                                : <span className="text-xs text-red-500 font-medium">Missing</span>}
                            </TableCell>
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

          {/* ── Bank Accounts tab ── */}
          <TabsContent value="bank_accounts" className="mt-0 space-y-3">
            {/* Alert banner */}
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
                    <p className="text-xs text-red-600/70 dark:text-red-400/70">Payments cannot be processed for these members</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 shrink-0" onClick={() => setBankFilter('missing')}>
                  View Missing
                </Button>
              </div>
            )}

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Bank Account Registry
                </p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-semibold">
                    <CheckCircle className="h-3 w-3" />{filtered.filter(p => p.bank_account?.accountNumber || p.bank_account?.accountName).length} registered
                  </span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="flex items-center gap-1 text-red-500 font-semibold">
                    <XCircle className="h-3 w-3" />{filtered.filter(p => !(p.bank_account?.accountNumber || p.bank_account?.accountName)).length} missing
                  </span>
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
                        <TableRow key={i}>
                          {Array(8).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                        </TableRow>
                      ))
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No profiles match your filters</TableCell>
                      </TableRow>
                    ) : filtered.map(p => {
                      const hub   = dbHubs.find(h => h.id === p.hub_id);
                      const state = sudanStates.find(s => s.id === p.state_id);
                      const hasBank = !!(p.bank_account?.accountNumber || p.bank_account?.accountName);
                      return (
                        <TableRow
                          key={p.id}
                          className="cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
                          onClick={() => setSelected(p)}
                          data-testid={`row-bank-${p.id}`}
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
                      <span className="flex items-center gap-1"><Landmark className="h-2.5 w-2.5 text-blue-500" />Banked</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-3 space-y-3 max-h-72 overflow-y-auto">
                    {loading ? (
                      Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                    ) : data.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No data</p>
                    ) : data.map(r => (
                      <CapRow key={r.name} label={r.name} total={r.total} online={r.online} withBank={r.withBank} max={data[0].total} />
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
        </Tabs>
      </div>

      {/* Profile detail modal */}
      {selected && <ProfileDetail profile={selected} onClose={() => setSelected(null)} dbHubs={dbHubs} />}
    </div>
  );
}
