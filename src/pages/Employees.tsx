import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users, Wifi, Search, Building2, MapPin,
  RefreshCw, ChevronRight,
  Smartphone, Monitor, Clock, AlertCircle, CheckCircle, XCircle,
  Hash, Globe, Activity, Copy, Download, FileSpreadsheet,
  FileText, FileDown, GitBranch, UserCheck, UserX,
  TrendingDown, Banknote, ChevronDown, ChevronUp, AlertTriangle,
  Landmark, LayoutGrid, List, Shield,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sudanStates } from "@/data/sudanStates";
import { useGlobalPresence } from "@/context/presence/GlobalPresenceContext";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/user/UserContext";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { PageInfoBanner } from "@/components/financial/PageInfoBanner";

/* ─── Types ────────────────────────────────────────────────── */
interface BankAccount {
  accountName?: string; accountNumber?: string; branch?: string; bankName?: string;
}
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

interface EmployeeProfile {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  role: string | null; employee_id: string | null; hub_id: string | null;
  state_id: string | null; locality_id: string | null; availability: string | null;
  presence: 'online' | 'away' | 'offline';
  status: string | null; updated_at: string; created_at: string;
  bank_account: BankAccount | null;
  last_activity: string | null; device_info: string | null; app_version: string | null;
  department_id: string | null;
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

function presenceFromActivity(lastActivityIso: string | null, updatedAt?: string): 'online' | 'away' | 'offline' {
  const ts = lastActivityIso || updatedAt;
  if (!ts) return 'offline';
  try {
    const mins = (Date.now() - parseISO(ts).getTime()) / 60_000;
    if (mins < 6) return 'online';
    if (mins < 60) return 'away';
    return 'offline';
  } catch { return 'offline'; }
}

function avBadge(presence: 'online' | 'away' | 'offline') {
  if (presence === 'online') return { dot: 'bg-green-500', label: 'Online', labelColor: 'text-green-700 dark:text-green-400' };
  if (presence === 'away')   return { dot: 'bg-amber-500',  label: 'Away',   labelColor: 'text-amber-700 dark:text-amber-400'  };
  return { dot: 'bg-slate-300 dark:bg-slate-600', label: 'Offline', labelColor: 'text-slate-500 dark:text-slate-400' };
}

function maskAcc(n?: string) { if (!n) return '—'; return n.length <= 4 ? n : '•••• ' + n.slice(-4); }
function initials(name: string | null) { if (!name) return '?'; return name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase(); }
function lastActive(d: string | null, fallback?: string): string {
  const s = d || fallback; if (!s) return 'Unknown';
  try { return formatDistanceToNow(parseISO(s), { addSuffix: true }); } catch { return '—'; }
}

/* ─── Avatar ─────────────────────────────────────────────── */
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

/* ─── Role Badge ─────────────────────────────────────────── */
function RoleBadge({ role }: { role: string | null }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_COLORS[role || ''] || 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>
      {ROLE_LABELS[role || ''] || role || 'No role'}
    </span>
  );
}

/* ─── Employee Detail Modal ──────────────────────────────── */
function EmployeeDetail({
  profile, onClose, dbHubs,
}: {
  profile: EmployeeProfile;
  onClose: () => void;
  dbHubs: { id: string; name: string }[];
}) {
  const { toast } = useToast();
  const hub      = dbHubs.find(h => h.id === profile.hub_id);
  const state    = sudanStates.find(s => s.id === profile.state_id);
  const av       = avBadge(profile.presence);
  const ba       = profile.bank_account;
  const hasBank  = !!(ba?.accountNumber || ba?.accountName);

  const copy = (t: string, l: string) => { navigator.clipboard.writeText(t); toast({ title: `${l} copied` }); };

  /* ── Per-user financial data ── */
  const [finRequested, setFinRequested] = useState(false);
  const [finKey, setFinKey] = useState(0);
  const [finLoading, setFinLoading] = useState(false);
  const [advanceRows, setAdvanceRows] = useState<any[]>([]);
  const [costRows, setCostRows] = useState<any[]>([]);
  const [withdrawalRows, setWithdrawalRows] = useState<any[]>([]);
  const [finOpen, setFinOpen] = useState<'advances' | 'costs' | 'withdrawals' | null>(null);

  useEffect(() => {
    if (!finRequested) return;
    const fetch = async () => {
      setFinLoading(true);
      const [dpRes, ocRes, wrRes] = await Promise.all([
        supabase.from('down_payment_requests')
          .select('id,status,requested_amount,requested_at,justification,hub_name,site_name')
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
    fetch();
  }, [finRequested, finKey, profile.id]);

  const dpSummary = useMemo(() => ({
    total: advanceRows.length,
    pending: advanceRows.filter(r => ['pending','pending_supervisor','pending_admin'].includes(r.status)).length,
    approved: advanceRows.filter(r => r.status === 'approved' || r.status === 'paid').length,
    amountSDG: Math.round(advanceRows.reduce((s, r) => s + Math.abs(Number(r.requested_amount) || 0), 0)),
  }), [advanceRows]);

  const ocSummary = useMemo(() => ({
    total: costRows.length,
    approved: costRows.filter(r => r.tier2_status === 'approved').length,
    amountSDG: Math.round(costRows.reduce((s, r) => s + Math.abs(Number(r.amount_cents) || 0) / 100, 0)),
  }), [costRows]);

  const wrSummary = useMemo(() => ({
    total: withdrawalRows.length,
    approved: withdrawalRows.filter(r => r.status === 'approved').length,
    amountSDG: Math.round(withdrawalRows.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)),
  }), [withdrawalRows]);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl w-full max-h-[92vh] overflow-y-auto p-0 gap-0">
        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-6 py-6 rounded-t-lg">
          <DialogHeader>
            <div className="flex items-center gap-4">
              <Avatar name={profile.full_name} size="lg" availability={profile.presence} />
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-white text-lg font-bold leading-tight truncate">
                  {profile.full_name || 'Unknown'}
                </DialogTitle>
                <p className="text-white/60 text-xs truncate mt-0.5">{profile.email}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <RoleBadge role={profile.role} />
                  {profile.employee_id && (
                    <span className="text-[10px] font-mono bg-white/10 text-white/80 px-1.5 py-0.5 rounded">
                      {profile.employee_id}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${av.labelColor}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${av.dot}`} />
                    {av.label}
                  </span>
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="divide-y divide-border">
          {/* ── Hub / Location ── */}
          <div className="px-6 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />Assignment
            </p>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['Hub', hub?.name || '—'],
                ['State', state?.name || '—'],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} className="rounded-md bg-muted/50 p-2.5">
                  <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                  <p className="text-sm font-medium">{val}</p>
                </div>
              ))}
            </div>
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
                  <p className="text-xs text-red-600/70 dark:text-red-400/70">Payments cannot be processed for this employee.</p>
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
                [Clock, 'Last Active', lastActive(profile.last_activity, profile.updated_at)],
                [profile.device_info?.toLowerCase().includes('android') || profile.device_info?.toLowerCase().includes('iphone')
                  ? Smartphone : Monitor, 'Device', profile.device_info || '—'],
                [GitBranch, 'App Version', profile.app_version || '—'],
                [Hash, 'Profile ID', profile.id.slice(0, 8) + '…'],
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
                      ) : advanceRows.map(r => (
                        <div key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/30">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.status === 'approved' || r.status === 'paid' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : ['pending','pending_supervisor','pending_admin'].includes(r.status) ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : 'bg-red-100 dark:bg-red-900/40 text-red-600'}`}>{r.status}</span>
                              {r.site_name && <span className="text-[10px] text-muted-foreground truncate">{r.site_name}</span>}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{r.requested_at ? format(parseISO(r.requested_at), 'dd MMM yyyy') : '—'}</p>
                          </div>
                          <p className="text-xs font-bold shrink-0">SDG {Number(r.requested_amount || 0).toLocaleString()}</p>
                        </div>
                      ))}
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

/* ─── Financial Summary Card ─────────────────────────────── */
interface FinRow { total: number; approved: number; amountSDG: number }
interface FinMonth { current: FinRow; prev: FinRow }

function FinSummaryCard({ title, titleAr, icon: Icon, data, accentBg, accentText, accentBorder, loading, awaitingAck }: {
  title: string; titleAr: string; icon: React.ElementType;
  data: FinMonth; accentBg: string; accentText: string; accentBorder: string;
  loading: boolean; awaitingAck?: number;
}) {
  const diff = data.current.amountSDG - data.prev.amountSDG;
  const up   = diff >= 0;
  return (
    <Card className="overflow-hidden">
      <div className={`h-1 ${accentBorder}`} />
      <CardContent className="pt-3 pb-4 px-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className={`rounded-md p-1.5 ${accentBg}`}><Icon className={`h-3.5 w-3.5 ${accentText}`} /></div>
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
        {loading ? (
          <div className="grid grid-cols-2 gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="pr-3 space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">This Month</p>
              <p className={`text-2xl font-bold leading-none ${accentText}`}>{data.current.total}</p>
              <p className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">{data.current.approved}</span> approved</p>
              <p className="text-[10px] font-medium text-foreground">SDG {data.current.amountSDG.toLocaleString()}</p>
            </div>
            <div className="pl-3 space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Last Month</p>
              <p className="text-2xl font-bold leading-none text-muted-foreground">{data.prev.total}</p>
              <p className="text-[10px] text-muted-foreground"><span className="font-semibold">{data.prev.approved}</span> approved</p>
              <p className="text-[10px] font-medium text-muted-foreground">SDG {data.prev.amountSDG.toLocaleString()}</p>
            </div>
          </div>
        )}
        {!loading && awaitingAck !== undefined && awaitingAck > 0 && (
          <div className="flex items-center gap-1.5 rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-2.5 py-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">{awaitingAck} awaiting acknowledgment</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function Employees() {
  const { toast } = useToast();
  const { currentUser } = useUser();
  const { isUserOnline, onlineUserIds } = useGlobalPresence();
  const pageTopRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    let el = pageTopRef.current?.parentElement;
    while (el) {
      const ov = window.getComputedStyle(el).overflowY;
      if (ov === 'auto' || ov === 'scroll') { el.scrollTop = 0; break; }
      el = el.parentElement;
    }
  }, []);

  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [dbHubs, setDbHubs]     = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<EmployeeProfile | null>(null);

  /* ── Financial summary state ── */
  const emptyFinRow = (): FinRow => ({ total: 0, approved: 0, amountSDG: 0 });
  const [finLoading, setFinLoading] = useState(true);
  const [awaitingAck, setAwaitingAck] = useState(0);
  const [finData, setFinData] = useState<{ advances: FinMonth; costs: FinMonth; withdrawals: FinMonth }>({
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
      const [dpCur, dpPrv, ocCur, ocPrv, wtCur, wtPrv, ackRes] = await Promise.all([
        supabase.from('down_payment_requests').select('requested_amount,status').gte('created_at', thisStart),
        supabase.from('down_payment_requests').select('requested_amount,status').gte('created_at', prevStart).lte('created_at', prevEnd),
        supabase.from('operational_cost_submissions').select('amount_cents,tier2_status').gte('created_at', thisStart),
        supabase.from('operational_cost_submissions').select('amount_cents,tier2_status').gte('created_at', prevStart).lte('created_at', prevEnd),
        supabase.from('wallet_transactions').select('amount,type,transaction_type').gte('created_at', thisStart).or('type.eq.withdrawal,type.eq.debit,transaction_type.eq.withdrawal'),
        supabase.from('wallet_transactions').select('amount,type,transaction_type').gte('created_at', prevStart).lte('created_at', prevEnd).or('type.eq.withdrawal,type.eq.debit,transaction_type.eq.withdrawal'),
        supabase.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved').neq('fund_receipt_confirmed', true),
      ]);
      const calcDp = (rows: any[]): FinRow => ({ total: rows.length, approved: rows.filter(r => r.status === 'approved' || r.status === 'paid').length, amountSDG: Math.round(rows.reduce((s, r) => s + Math.abs(Number(r.requested_amount) || 0), 0)) });
      const calcOc = (rows: any[]): FinRow => ({ total: rows.length, approved: rows.filter(r => r.tier2_status === 'approved').length, amountSDG: Math.round(rows.reduce((s, r) => s + Math.abs(Number(r.amount_cents) || 0) / 100, 0)) });
      const calcWt = (rows: any[]): FinRow => ({ total: rows.length, approved: rows.length, amountSDG: Math.round(rows.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)) });
      setAwaitingAck(ackRes.count ?? 0);
      setFinData({ advances: { current: calcDp(dpCur.data || []), prev: calcDp(dpPrv.data || []) }, costs: { current: calcOc(ocCur.data || []), prev: calcOc(ocPrv.data || []) }, withdrawals: { current: calcWt(wtCur.data || []), prev: calcWt(wtPrv.data || []) } });
      setFinLoading(false);
    };
    fetchFin();
  }, []);

  /* Filters */
  const [search, setSearch]         = useState('');
  const [hubFilter, setHubFilter]   = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [bankFilter, setBankFilter] = useState('all');
  const [viewMode, setViewMode]     = useState<'cards' | 'table'>('table');
  const [activeTab, setActiveTab]   = useState('roster');

  /* ── Data loading ── */
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data: hubsData } = await (supabase as any).from('hubs').select('id, name').order('name');
      if (hubsData?.length) setDbHubs(hubsData);

      const { data: pData } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, email, phone, role, employee_id, hub_id, state_id, locality_id, availability, status, updated_at, created_at, bank_account, last_activity, device_info, app_version, department_id')
        .order('full_name');

      if (pData) {
        setProfiles(pData.map((p: any) => {
          let raw = p.bank_account;
          if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
          const ba = normalizeBA(raw);
          const last_activity = p.last_activity || (p.device_info ? p.updated_at : null);
          const device_info   = p.device_info || null;
          const app_version   = p.app_version || null;
          const presence      = isUserOnline(p.id) ? 'online' : presenceFromActivity(last_activity, p.updated_at);
          return { ...p, bank_account: ba, last_activity, device_info, app_version, presence };
        }));
      }
    } catch (err: any) {
      toast({ title: 'Failed to load employees', description: err?.message, variant: 'destructive' });
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  /* Enrich with live presence */
  const enriched = useMemo<EmployeeProfile[]>(() =>
    profiles.map(p => ({
      ...p,
      presence: isUserOnline(p.id) ? 'online' : presenceFromActivity(p.last_activity, p.updated_at),
    })),
  [profiles, onlineUserIds]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Filtered list */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched.filter(p => {
      if (q && !p.full_name?.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q) && !p.employee_id?.toLowerCase().includes(q)) return false;
      if (hubFilter !== 'all' && p.hub_id !== hubFilter) return false;
      if (roleFilter !== 'all' && p.role !== roleFilter) return false;
      if (bankFilter === 'has'     && !(p.bank_account?.accountNumber || p.bank_account?.accountName)) return false;
      if (bankFilter === 'missing' &&  (p.bank_account?.accountNumber || p.bank_account?.accountName)) return false;
      return true;
    });
  }, [enriched, search, hubFilter, roleFilter, bankFilter]);

  /* Stats */
  const stats = useMemo(() => ({
    total:       enriched.length,
    online:      enriched.filter(p => p.presence === 'online').length,
    withBank:    enriched.filter(p => !!(p.bank_account?.accountNumber || p.bank_account?.accountName)).length,
    missingBank: enriched.filter(p => !(p.bank_account?.accountNumber || p.bank_account?.accountName)).length,
  }), [enriched]);

  /* ── Stat Card ── */
  function StatCard({ label, value, icon: Icon, accent, onClick }: {
    label: string; value: number; icon: any;
    accent: { border: string; iconBg: string; iconColor: string; numColor: string };
    onClick?: () => void;
  }) {
    return (
      <button type="button" onClick={onClick} className={`group relative overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
        data-testid={`stat-${String(label).toLowerCase().replace(/\s+/g, '-')}`}>
        <div className={`h-1 w-full ${accent.border}`} />
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground leading-tight truncate">{label}</p>
            <p className={`text-2xl font-extrabold tracking-tight mt-0.5 ${accent.numColor}`}>{loading ? <span className="text-muted-foreground/40">—</span> : value}</p>
          </div>
          <div className={`shrink-0 rounded-xl p-2.5 ${accent.iconBg}`}><Icon className={`h-5 w-5 ${accent.iconColor}`} /></div>
        </div>
      </button>
    );
  }

  const clearFilters = () => { setSearch(''); setHubFilter('all'); setRoleFilter('all'); setBankFilter('all'); };
  const hasFilters = !!(search || hubFilter !== 'all' || roleFilter !== 'all' || bankFilter !== 'all');

  /* ── Filter Bar ── */
  const FilterBar = (
    <Card className="border-0 shadow-none bg-muted/30 p-0">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search employees…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
            data-testid="input-search"
          />
        </div>
        <Select value={hubFilter} onValueChange={setHubFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-hub">
            <SelectValue placeholder="All Hubs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hubs</SelectItem>
            {dbHubs.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-role">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={bankFilter} onValueChange={setBankFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-bank">
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            <SelectItem value="has">Has Account</SelectItem>
            <SelectItem value="missing">Missing Account</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs gap-1 text-muted-foreground" data-testid="button-clear-filters">
            <XCircle className="h-3.5 w-3.5" />Clear
          </Button>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {hasFilters && (
            <Badge variant="secondary" className="text-xs font-medium">{filtered.length} of {enriched.length}</Badge>
          )}
          <div className="flex border rounded-md overflow-hidden">
            <button type="button" onClick={() => setViewMode('table')}
              className={`px-2 py-1.5 transition-colors ${viewMode === 'table' ? 'bg-[#0F2041] text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
              data-testid="button-view-table" title="Table view"><List className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setViewMode('cards')}
              className={`px-2 py-1.5 transition-colors ${viewMode === 'cards' ? 'bg-[#0F2041] text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
              data-testid="button-view-cards" title="Card view"><LayoutGrid className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div ref={pageTopRef} className="min-h-screen bg-background">
      {/* ── Page Header ── */}
      <div className="bg-gradient-to-r from-[#0F2041] via-[#1a3260] to-[#1D3461] px-6 py-6 md:py-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="rounded-lg bg-white/10 p-2">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white leading-tight">Employees</h1>
                <p className="text-white/50 text-sm">الموظفون</p>
              </div>
            </div>
            <p className="text-white/60 text-xs mt-2 max-w-lg">
              Employment details · Bank accounts · Financial records
            </p>
          </div>
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

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 space-y-5">
        <PageInfoBanner
          title="Employees"
          description="Manage employment details including bank accounts and financial records. The Roster tab shows all employees with bank account status. Bank Accounts shows the full account registry. Financial Overview shows monthly activity across transportation advances, cost submissions, and withdrawal requests."
          descriptionAr="إدارة تفاصيل التوظيف بما في ذلك الحسابات البنكية والسجلات المالية. يعرض قسم القائمة جميع الموظفين مع حالة الحساب البنكي. الحسابات البنكية تعرض سجل الحسابات الكامل."
        />

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Employees" value={stats.total} icon={Users}
            accent={{ border: 'bg-[#1D3461]', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-[#1D3461] dark:text-blue-300', numColor: 'text-[#0F2041] dark:text-blue-300' }} />
          <StatCard label="Online Now" value={stats.online} icon={Wifi}
            accent={{ border: 'bg-green-500', iconBg: 'bg-green-100 dark:bg-green-900/40', iconColor: 'text-green-600 dark:text-green-400', numColor: 'text-green-700 dark:text-green-400' }} />
          <StatCard label="With Bank Account" value={stats.withBank} icon={UserCheck}
            accent={{ border: 'bg-blue-500', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-blue-600 dark:text-blue-400', numColor: 'text-blue-700 dark:text-blue-400' }}
            onClick={() => { setBankFilter('has'); setActiveTab('bank_accounts'); }} />
          <StatCard label="Missing Account" value={stats.missingBank} icon={UserX}
            accent={{ border: 'bg-red-500', iconBg: 'bg-red-100 dark:bg-red-900/40', iconColor: 'text-red-600 dark:text-red-400', numColor: 'text-red-700 dark:text-red-400' }}
            onClick={() => { setBankFilter('missing'); setActiveTab('bank_accounts'); }} />
        </div>

        {/* ── Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1 p-1 bg-muted/60 border rounded-lg">
            <TabsTrigger value="roster" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-md text-xs h-8 px-3">
              <Shield className="h-3.5 w-3.5" />Employee Roster
              {!loading && <span className="ml-0.5 rounded-full bg-current/10 px-1.5 py-0 text-[10px] font-bold data-[state=active]:bg-white/20">{filtered.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="bank_accounts" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-md text-xs h-8 px-3">
              <Landmark className="h-3.5 w-3.5" />Bank Accounts
              {!loading && stats.missingBank > 0 && (
                <span className="ml-0.5 rounded-full bg-red-500 text-white px-1.5 py-0 text-[10px] font-bold">{stats.missingBank}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="financial" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-md text-xs h-8 px-3">
              <TrendingDown className="h-3.5 w-3.5" />Financial Overview
            </TabsTrigger>
          </TabsList>

          {/* ── Shared Filter Bar ── */}
          {FilterBar}

          {/* ── Roster tab ── */}
          <TabsContent value="roster" className="mt-0">
            {loading ? (
              viewMode === 'cards' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-40" />)}
                </div>
              ) : (
                <Card className="overflow-hidden">
                  <div className="space-y-2 p-4">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                </Card>
              )
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-3">
                <div className="rounded-full bg-muted p-4"><Users className="h-8 w-8" /></div>
                <p className="text-sm font-medium">No employees match your filters</p>
              </div>
            ) : viewMode === 'cards' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map(p => {
                  const hub   = dbHubs.find(h => h.id === p.hub_id);
                  const state = sudanStates.find(s => s.id === p.state_id);
                  const hasBank = !!(p.bank_account?.accountNumber || p.bank_account?.accountName);
                  return (
                    <Card key={p.id} className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 border hover:border-blue-200 dark:hover:border-blue-800 overflow-hidden"
                      onClick={() => setSelected(p)} data-testid={`card-employee-${p.id}`}>
                      <CardContent className="p-0">
                        <div className={`h-1 w-full ${p.presence === 'online' ? 'bg-green-500' : p.presence === 'away' ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                        <div className="p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <Avatar name={p.full_name} size="md" availability={p.presence} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <p className="font-semibold text-sm text-foreground truncate">{p.full_name || 'Unknown'}</p>
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <RoleBadge role={p.role} />
                          </div>
                          {(hub || state) && (
                            <div className="space-y-0.5">
                              {hub && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="h-3 w-3 shrink-0" /><span className="font-medium text-foreground">{hub.name}</span></div>}
                              {state && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" /><span>{state.name}</span></div>}
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-1 border-t">
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
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-[200px]">Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Hub</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Bank Account</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Active</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(p => {
                        const hub   = dbHubs.find(h => h.id === p.hub_id);
                        const state = sudanStates.find(s => s.id === p.state_id);
                        const hasBank = !!(p.bank_account?.accountNumber || p.bank_account?.accountName);
                        const av    = avBadge(p.presence);
                        return (
                          <TableRow key={p.id} className="cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
                            onClick={() => setSelected(p)} data-testid={`row-employee-${p.id}`}>
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
                            <TableCell className="text-xs">{hub?.name || '—'}</TableCell>
                            <TableCell className="text-xs">{state?.name || '—'}</TableCell>
                            <TableCell>
                              {hasBank
                                ? <span className="text-xs font-mono font-medium">{maskAcc(p.bank_account?.accountNumber)}</span>
                                : <span className="text-xs text-red-500 font-medium">Missing</span>}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${av.dot}`} />
                                <span className={`text-xs font-medium ${av.labelColor}`}>{av.label}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{lastActive(p.last_activity, p.updated_at)}</TableCell>
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
            {stats.missingBank > 0 && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-red-100 dark:bg-red-900/50 p-1.5">
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                      {stats.missingBank} employee{stats.missingBank !== 1 ? 's' : ''} missing bank account
                    </p>
                    <p className="text-xs text-red-600/70 dark:text-red-400/70">Payments cannot be processed for these employees</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 shrink-0" onClick={() => setBankFilter('missing')}>
                  View Missing
                </Button>
              </div>
            )}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bank Account Registry</p>
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
                      <TableHead>Employee</TableHead>
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
                      <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No employees match your filters</TableCell></TableRow>
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

          {/* ── Financial Overview tab ── */}
          <TabsContent value="financial" className="mt-0">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Financial Overview</h2>
                <span className="text-xs text-muted-foreground">— ملخص مالي</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FinSummaryCard title="Transportation Advances" titleAr="سلف النقل" icon={TrendingDown}
                  data={finData.advances} accentBorder="bg-indigo-500" accentBg="bg-indigo-100 dark:bg-indigo-900/40" accentText="text-indigo-600 dark:text-indigo-400" loading={finLoading} />
                <FinSummaryCard title="Cost Submissions" titleAr="طلبات التكاليف" icon={FileText}
                  data={finData.costs} accentBorder="bg-orange-500" accentBg="bg-orange-100 dark:bg-orange-900/40" accentText="text-orange-600 dark:text-orange-400" loading={finLoading} />
                <FinSummaryCard title="Withdrawal Requests" titleAr="طلبات السحب" icon={Banknote}
                  data={finData.withdrawals} accentBorder="bg-emerald-500" accentBg="bg-emerald-100 dark:bg-emerald-900/40" accentText="text-emerald-600 dark:text-emerald-400" loading={finLoading} awaitingAck={awaitingAck} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Employee Detail Modal ── */}
      {selected && (
        <EmployeeDetail profile={selected} onClose={() => setSelected(null)} dbHubs={dbHubs} />
      )}
    </div>
  );
}
