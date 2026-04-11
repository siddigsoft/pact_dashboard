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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users, Search, Building2, MapPin,
  RefreshCw, ChevronRight, Pencil, Check,
  Smartphone, Monitor, Clock, AlertCircle, CheckCircle, XCircle,
  Hash, Activity, Copy,
  FileText, FileDown, GitBranch, UserX,
  TrendingDown, Banknote, ChevronDown, ChevronUp, AlertTriangle,
  Landmark, LayoutGrid, List, Shield, Layers, Briefcase,
  Download, FileSpreadsheet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sudanStates, getLocalitiesByState } from "@/data/sudanStates";
import { useGlobalPresence } from "@/context/presence/GlobalPresenceContext";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/user/UserContext";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { PageInfoBanner } from "@/components/financial/PageInfoBanner";
import {
  exportStaffToExcel, exportStaffToPDF, exportStaffToCSV, type ExportProfile,
} from "@/utils/staffDirectoryExport";

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
  contract_type: 'salary' | 'retainer' | 'both' | null;
  is_employee: boolean;
}

type ContractType = 'salary' | 'retainer' | 'both';
const CONTRACT_CONFIG: Record<ContractType, { label: string; labelAr: string; color: string; dot: string }> = {
  salary:   { label: 'Salary',             labelAr: 'موظف براتب',       color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border-blue-200 dark:border-blue-800',     dot: 'bg-blue-500'   },
  retainer: { label: 'Retainer-Only',      labelAr: 'مكافأة فقط',       color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200 border-violet-200 dark:border-violet-800', dot: 'bg-violet-500' },
  both:     { label: 'Salary + Retainer',  labelAr: 'راتب ومكافأة',    color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200 border-teal-200 dark:border-teal-800',     dot: 'bg-teal-500'   },
};
function ContractBadge({ type }: { type: string | null }) {
  const cfg = CONTRACT_CONFIG[(type as ContractType) ?? 'salary'] ?? CONTRACT_CONFIG.salary;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
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
  profile, onClose, dbHubs, onUpdate, onEmploymentChange, canEdit,
}: {
  profile: EmployeeProfile;
  onClose: () => void;
  dbHubs: { id: string; name: string }[];
  onUpdate: (id: string, type: ContractType) => void;
  onEmploymentChange: (id: string, updates: { is_employee: boolean; employee_id: string | null }) => void;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const hub      = dbHubs.find(h => h.id === profile.hub_id);
  const state    = sudanStates.find(s => s.id === profile.state_id);
  const av       = avBadge(profile.presence);
  const ba       = profile.bank_account;
  const hasBank  = !!(ba?.accountNumber || ba?.accountName);

  /* ── Employment registration (admin-only) ── */
  const [empIdDraft, setEmpIdDraft]         = useState(profile.employee_id || '');
  const [savingEmp, setSavingEmp]           = useState(false);

  const saveEmployment = async (markAsEmployee: boolean) => {
    setSavingEmp(true);
    const updates: Record<string, unknown> = { is_employee: markAsEmployee };
    if (markAsEmployee) updates.employee_id = empIdDraft.trim() || null;
    const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id);
    if (error) {
      toast({ title: 'Failed to update employment', description: error.message, variant: 'destructive' });
    } else {
      onEmploymentChange(profile.id, { is_employee: markAsEmployee, employee_id: markAsEmployee ? (empIdDraft.trim() || null) : profile.employee_id });
      toast({ title: markAsEmployee ? 'Registered as employee' : 'Removed from employees', description: profile.full_name || '' });
    }
    setSavingEmp(false);
  };

  /* ── Inline contract edit ── */
  const [editingContract, setEditingContract] = useState(false);
  const [contractDraft, setContractDraft]     = useState<string>(profile.contract_type || 'salary');
  const [savingContract, setSavingContract]   = useState(false);

  const saveContract = async () => {
    setSavingContract(true);
    const { error } = await supabase.from('profiles').update({ contract_type: contractDraft }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Failed to update contract type', description: error.message, variant: 'destructive' });
    } else {
      onUpdate(profile.id, contractDraft as ContractType);
      setEditingContract(false);
      toast({ title: 'Contract type updated', description: `${profile.full_name} → ${CONTRACT_CONFIG[contractDraft as ContractType]?.label}` });
    }
    setSavingContract(false);
  };

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
                  <ContractBadge type={profile.contract_type} />
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
          {/* ── Employment (Admin Only) ── */}
          {canEdit && (
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3" />Employment
                  <span className="text-[9px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 rounded px-1.5 py-0.5">Admin Only</span>
                </p>
                {profile.is_employee ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle className="h-3 w-3" />Registered Employee
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3 w-3" />Not yet registered
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="flex-1">
                  <p className="text-[10px] text-muted-foreground mb-1">Employee ID</p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={empIdDraft}
                      onChange={e => setEmpIdDraft(e.target.value)}
                      placeholder="e.g. EMP-001"
                      className="flex-1 text-xs border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                      data-testid="input-employee-id"
                    />
                    <button
                      type="button"
                      disabled={savingEmp || empIdDraft === (profile.employee_id || '')}
                      onClick={() => saveEmployment(profile.is_employee)}
                      className="flex items-center gap-1 text-[10px] font-semibold bg-[#0F2041] text-white rounded-md px-2.5 py-1.5 hover:bg-[#1D3461] disabled:opacity-40 transition-colors"
                      data-testid="button-save-employee-id"
                    >
                      {savingEmp ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Save
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {profile.is_employee ? (
                  <button
                    type="button"
                    disabled={savingEmp}
                    onClick={() => saveEmployment(false)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-red-200 text-red-600 dark:text-red-400 dark:border-red-800 rounded-md px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                    data-testid="button-remove-employee"
                  >
                    {savingEmp ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                    Remove from Employees
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={savingEmp}
                    onClick={() => saveEmployment(true)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold bg-emerald-600 text-white rounded-md px-3 py-2 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    data-testid="button-register-employee"
                  >
                    {savingEmp ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    Register as Employee
                  </button>
                )}
                <a
                  href={`/users/${profile.id}`}
                  className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-[#0F2041] dark:hover:text-blue-400 border border-border rounded-md px-2.5 py-2 hover:bg-muted/50 transition-colors whitespace-nowrap"
                  data-testid="link-user-management"
                >
                  <ChevronRight className="h-3 w-3" />Full Profile
                </a>
              </div>
            </div>
          )}

          {/* ── Hub / Location / Contract ── */}
          <div className="px-6 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />Assignment & Contract
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-muted/50 p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-muted-foreground">Contract Type</p>
                  {canEdit && !editingContract && (
                    <button
                      type="button"
                      onClick={() => { setContractDraft(profile.contract_type || 'salary'); setEditingContract(true); }}
                      className="text-muted-foreground hover:text-foreground transition-colors rounded p-0.5 hover:bg-muted"
                      title="Edit contract type"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {editingContract ? (
                  <div className="space-y-2">
                    <select
                      value={contractDraft}
                      onChange={e => setContractDraft(e.target.value)}
                      className="w-full text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="salary">Salary — موظف براتب</option>
                      <option value="retainer">Retainer-Only — مكافأة فقط</option>
                      <option value="both">Salary + Retainer — راتب ومكافأة</option>
                    </select>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={saveContract}
                        disabled={savingContract}
                        className="flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold bg-[#0F2041] text-white rounded-md px-2 py-1.5 hover:bg-[#1D3461] disabled:opacity-60 transition-colors"
                      >
                        {savingContract ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        {savingContract ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingContract(false); setContractDraft(profile.contract_type || 'salary'); }}
                        disabled={savingContract}
                        className="flex items-center justify-center gap-1 text-[10px] font-semibold border rounded-md px-2 py-1.5 hover:bg-muted transition-colors disabled:opacity-60"
                      >
                        <XCircle className="h-3 w-3" />Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <ContractBadge type={profile.contract_type} />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {CONTRACT_CONFIG[(profile.contract_type || 'salary') as ContractType]?.labelAr}
                    </p>
                  </>
                )}
              </div>
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

/* ─── Inline Contract Cell (table row edit) ──────────────── */
function InlineContractCell({
  profile, onUpdate, canEdit,
}: { profile: EmployeeProfile; onUpdate: (id: string, type: ContractType) => void; canEdit: boolean }) {
  const { toast } = useToast();
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState<string>(profile.contract_type || 'salary');
  const [saving, setSaving]     = useState(false);

  const save = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ contract_type: draft }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Update failed', variant: 'destructive' });
    } else {
      onUpdate(profile.id, draft as ContractType);
      setEditing(false);
      toast({ title: 'Contract type updated', description: CONTRACT_CONFIG[draft as ContractType]?.label });
    }
    setSaving(false);
  };

  if (!canEdit) return <ContractBadge type={profile.contract_type} />;

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5 group">
        <ContractBadge type={profile.contract_type} />
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setDraft(profile.contract_type || 'salary'); setEditing(true); }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all p-0.5 rounded hover:bg-muted"
          title="Edit contract type"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <select
        value={draft}
        onChange={e => setDraft(e.target.value)}
        className="text-xs border rounded-md px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        autoFocus
        onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setDraft(profile.contract_type || 'salary'); } }}
      >
        <option value="salary">Salary</option>
        <option value="retainer">Retainer-Only</option>
        <option value="both">Both</option>
      </select>
      <button type="button" onClick={save} disabled={saving}
        className="text-green-600 hover:text-green-700 disabled:opacity-50 p-0.5 rounded hover:bg-green-50 dark:hover:bg-green-950/30">
        {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button type="button" onClick={e => { e.stopPropagation(); setEditing(false); setDraft(profile.contract_type || 'salary'); }}
        className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors">
        <XCircle className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ─── Bulk Contract Dialog ───────────────────────────────── */
function BulkContractDialog({
  count, onConfirm, onClose, saving,
}: { count: number; onConfirm: (type: string) => void; onClose: () => void; saving: boolean }) {
  const [selectedType, setSelectedType] = useState<string>('retainer');
  const cfg = CONTRACT_CONFIG[selectedType as ContractType];
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-muted-foreground" />
            Bulk Assign Contract Type
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {count} employee{count !== 1 ? 's' : ''} will be updated
            </p>
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-0.5">
              This applies to all currently-filtered employees
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Set contract type to:</p>
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="salary">Salary — موظف براتب</option>
              <option value="retainer">Retainer-Only — مكافأة فقط</option>
              <option value="both">Salary + Retainer — راتب ومكافأة</option>
            </select>
            {cfg && (
              <div className="flex items-center gap-2 pt-1">
                <ContractBadge type={selectedType} />
                <span className="text-xs text-muted-foreground">{cfg.labelAr}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1 bg-[#0F2041] hover:bg-[#1D3461] text-white"
              onClick={() => onConfirm(selectedType)}
              disabled={saving}
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? 'Updating…' : `Apply to ${count} employee${count !== 1 ? 's' : ''}`}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
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

/* ── Employee Export Menu (top-level so hooks work correctly) ── */
function EmployeeExportMenu({
  filtered, dbHubs, activeTab,
}: {
  filtered: EmployeeProfile[];
  dbHubs: { id: string; name: string }[];
  activeTab: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const toExportProfiles = (): ExportProfile[] =>
    filtered.map(p => {
      const hub = dbHubs.find(h => h.id === p.hub_id);
      const st  = sudanStates.find(s => s.id === p.state_id);
      return {
        id: p.id, full_name: p.full_name, email: p.email, phone: p.phone,
        role: p.role, employee_id: p.employee_id,
        hub_name: hub?.name || '', state_name: st?.name || '', locality_name: '',
        availability: p.presence, contract_type: p.contract_type,
        bank_account: p.bank_account, last_activity: p.last_activity,
        device_info: p.device_info, app_version: p.app_version, location_sharing: null,
      };
    });

  const exp = async (type: 'excel' | 'pdf' | 'csv') => {
    if (!filtered.length) { toast({ title: 'No data to export', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const ep    = toExportProfiles();
      const label = `Employees${activeTab !== 'roster' ? ` – ${activeTab}` : ''}`;
      const pdfTab: 'directory' | 'bank_accounts' = activeTab === 'bank_accounts' ? 'bank_accounts' : 'directory';
      if (type === 'excel') await exportStaffToExcel(ep, label);
      else if (type === 'pdf') exportStaffToPDF(ep, pdfTab, label);
      else exportStaffToCSV(ep, pdfTab);
      toast({ title: 'Export ready', description: `${filtered.length} records exported.` });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy || !filtered.length}
          className="gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
          data-testid="button-export-menu">
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

  const canEdit = !!(currentUser?.role && ['super_admin', 'admin', 'country_director', 'fom', 'financial_auditor'].includes(currentUser.role));

  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [dbHubs, setDbHubs]     = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<EmployeeProfile | null>(null);

  /* ── Bulk contract assign ── */
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkSaving, setBulkSaving]         = useState(false);

  const handleUpdate = useCallback((id: string, newType: ContractType) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, contract_type: newType } : p));
    setSelected(prev => prev?.id === id ? { ...prev, contract_type: newType } : prev);
  }, []);

  const handleEmploymentChange = useCallback((id: string, updates: { is_employee: boolean; employee_id: string | null }) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    setSelected(prev => prev?.id === id ? { ...prev, ...updates } : prev);
  }, []);

  const handleBulkAssign = async (type: string) => {
    setBulkSaving(true);
    const ids = filtered.map(p => p.id);
    const { error } = await (supabase as any).from('profiles').update({ contract_type: type }).in('id', ids);
    if (error) {
      toast({ title: 'Bulk update failed', description: error.message, variant: 'destructive' });
    } else {
      setProfiles(prev => prev.map(p => ids.includes(p.id) ? { ...p, contract_type: type as ContractType } : p));
      setSelected(prev => prev && ids.includes(prev.id) ? { ...prev, contract_type: type as ContractType } : prev);
      toast({ title: `${ids.length} employee${ids.length !== 1 ? 's' : ''} updated`, description: `Contract type → ${CONTRACT_CONFIG[type as ContractType]?.label}` });
      setShowBulkDialog(false);
    }
    setBulkSaving(false);
  };

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

  /* Departments */
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  /* Filters */
  const [search, setSearch]               = useState('');
  const [hubFilter, setHubFilter]         = useState('all');
  const [stateFilter, setStateFilter]     = useState('all');
  const [localityFilter, setLocalFilter]  = useState('all');
  const [roleFilter, setRoleFilter]       = useState('all');
  const [bankFilter, setBankFilter]       = useState('all');
  const [contractFilter, setContractFilter] = useState('all');
  const [deptFilter, setDeptFilter]       = useState('all');
  const [showUnregistered, setShowUnregistered] = useState(false);
  const [viewMode, setViewMode]           = useState<'cards' | 'table'>('table');
  const [activeTab, setActiveTab]   = useState('roster');

  /* Derived geo lists */
  const availableLocalities = useMemo(
    () => stateFilter === 'all' ? [] : getLocalitiesByState(stateFilter),
    [stateFilter]
  );

  /* ── Data loading ── */
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [hubsRes, deptsRes, pRes] = await Promise.all([
        (supabase as any).from('hubs').select('id, name').order('name'),
        (supabase as any).from('departments').select('id, name').order('name'),
        (supabase as any)
          .from('profiles')
          .select('id, full_name, email, phone, role, employee_id, is_employee, hub_id, state_id, locality_id, availability, status, updated_at, created_at, bank_account, last_activity, device_info, app_version, department_id, contract_type')
          .order('full_name'),
      ]);
      if (hubsRes.data?.length) setDbHubs(hubsRes.data);
      if (deptsRes.data?.length) setDepartments(deptsRes.data);

      if (pRes.data) {
        setProfiles(pRes.data.map((p: any) => {
          let raw = p.bank_account;
          if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
          const ba = normalizeBA(raw);
          const last_activity = p.last_activity || (p.device_info ? p.updated_at : null);
          const device_info   = p.device_info || null;
          const app_version   = p.app_version || null;
          const presence      = isUserOnline(p.id) ? 'online' : presenceFromActivity(last_activity, p.updated_at);
          return { ...p, bank_account: ba, last_activity, device_info, app_version, presence, is_employee: !!p.is_employee };
        }));
      }
    } catch (err: any) {
      toast({ title: 'Failed to load employees', description: err?.message, variant: 'destructive' });
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  /* ── Real-time: update profiles when any row changes ── */
  useEffect(() => {
    const ch = (supabase as any)
      .channel('employees-profiles-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload: any) => {
        const rec = payload.new as any;
        if (!rec?.id) return;
        let raw = rec.bank_account;
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
        const ba = normalizeBA(raw);
        const last_activity = rec.last_activity || (rec.device_info ? rec.updated_at : null);
        const presence = presenceFromActivity(last_activity, rec.updated_at);
        setProfiles(prev => {
          const exists = prev.findIndex(p => p.id === rec.id);
          const updated = { ...rec, bank_account: ba, last_activity, device_info: rec.device_info || null, app_version: rec.app_version || null, presence, is_employee: !!rec.is_employee };
          if (exists >= 0) return prev.map(p => p.id === rec.id ? updated : p);
          return [...prev, updated].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
        });
      })
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, []);

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
      // Employment gate: only show profiles marked as employees by an admin (is_employee = true)
      if (!showUnregistered && !p.is_employee) return false;
      if (q && !p.full_name?.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q) && !p.employee_id?.toLowerCase().includes(q)) return false;
      if (hubFilter !== 'all' && p.hub_id !== hubFilter) return false;
      if (stateFilter !== 'all' && p.state_id !== stateFilter) return false;
      if (localityFilter !== 'all' && p.locality_id !== localityFilter) return false;
      if (roleFilter !== 'all' && p.role !== roleFilter) return false;
      if (bankFilter === 'has'     && !(p.bank_account?.accountNumber || p.bank_account?.accountName)) return false;
      if (bankFilter === 'missing' &&  (p.bank_account?.accountNumber || p.bank_account?.accountName)) return false;
      if (contractFilter !== 'all' && (p.contract_type || 'salary') !== contractFilter) return false;
      if (deptFilter !== 'all' && p.department_id !== deptFilter) return false;
      return true;
    });
  }, [enriched, search, hubFilter, stateFilter, localityFilter, roleFilter, bankFilter, contractFilter, deptFilter, showUnregistered]);

  const unregisteredCount = useMemo(
    () => enriched.filter(p => !p.is_employee).length,
    [enriched]
  );

  /* Stats — computed over registered employees only */
  const registeredEmployees = useMemo(
    () => enriched.filter(p => p.is_employee),
    [enriched]
  );
  const stats = useMemo(() => ({
    total:       registeredEmployees.length,
    salary:      registeredEmployees.filter(p => !p.contract_type || p.contract_type === 'salary').length,
    retainer:    registeredEmployees.filter(p => p.contract_type === 'retainer').length,
    both:        registeredEmployees.filter(p => p.contract_type === 'both').length,
    withBank:    registeredEmployees.filter(p => !!(p.bank_account?.accountNumber || p.bank_account?.accountName)).length,
    missingBank: registeredEmployees.filter(p => !(p.bank_account?.accountNumber || p.bank_account?.accountName)).length,
  }), [registeredEmployees]);

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

  const clearFilters = () => {
    setSearch(''); setHubFilter('all'); setStateFilter('all'); setLocalFilter('all');
    setRoleFilter('all'); setBankFilter('all'); setContractFilter('all'); setDeptFilter('all');
  };
  const hasFilters = !!(search || hubFilter !== 'all' || stateFilter !== 'all' || localityFilter !== 'all' || roleFilter !== 'all' || bankFilter !== 'all' || contractFilter !== 'all' || deptFilter !== 'all');

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
        <Select value={hubFilter} onValueChange={v => { setHubFilter(v); }}>
          <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-hub">
            <SelectValue placeholder="All Hubs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hubs</SelectItem>
            {dbHubs.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={v => { setStateFilter(v); setLocalFilter('all'); }}>
          <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-state">
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {sudanStates.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={localityFilter} onValueChange={setLocalFilter} disabled={stateFilter === 'all'}>
          <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-locality">
            <SelectValue placeholder={stateFilter === 'all' ? 'Pick state first' : 'All Localities'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Localities</SelectItem>
            {availableLocalities.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-role">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLE_OPTIONS.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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
        <Select value={contractFilter} onValueChange={setContractFilter}>
          <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="select-contract">
            <SelectValue placeholder="All Contracts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contracts</SelectItem>
            <SelectItem value="salary">Salary</SelectItem>
            <SelectItem value="retainer">Retainer-Only</SelectItem>
            <SelectItem value="both">Salary + Retainer</SelectItem>
          </SelectContent>
        </Select>
        {departments.length > 0 && (
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="select-dept">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs gap-1 text-muted-foreground" data-testid="button-clear-filters">
            <XCircle className="h-3.5 w-3.5" />Clear
          </Button>
        )}
        {canEdit && unregisteredCount > 0 && (
          <button
            type="button"
            onClick={() => setShowUnregistered(v => !v)}
            data-testid="toggle-show-unregistered"
            className={`h-8 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              showUnregistered
                ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300'
                : 'bg-background border-dashed text-muted-foreground hover:text-foreground hover:border-solid'
            }`}
          >
            <Users className="h-3 w-3" />
            {showUnregistered ? `Showing all (${unregisteredCount} not registered)` : `+${unregisteredCount} profiles not registered`}
          </button>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {hasFilters && (
            <Badge variant="secondary" className="text-xs font-medium">{filtered.length} of {enriched.length}</Badge>
          )}
          {canEdit && !loading && filtered.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkDialog(true)}
              className="h-8 text-xs gap-1.5 border-dashed"
              data-testid="button-bulk-contract"
            >
              <Pencil className="h-3 w-3" />
              Bulk Assign
              {filtered.length < enriched.length && <span className="font-bold text-[#0F2041]">({filtered.length})</span>}
            </Button>
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
          <div className="flex items-center gap-2">
            <EmployeeExportMenu filtered={filtered} dbHubs={dbHubs} activeTab={activeTab} />
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
        <PageInfoBanner
          title="Employees"
          description="Manage employment details including bank accounts and financial records. The Roster tab shows all employees with bank account status. Bank Accounts shows the full account registry. Financial Overview shows monthly activity across transportation advances, cost submissions, and withdrawal requests."
          descriptionAr="إدارة تفاصيل التوظيف بما في ذلك الحسابات البنكية والسجلات المالية. يعرض قسم القائمة جميع الموظفين مع حالة الحساب البنكي. الحسابات البنكية تعرض سجل الحسابات الكامل."
        />

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total Employees" value={stats.total} icon={Users}
            accent={{ border: 'bg-[#1D3461]', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-[#1D3461] dark:text-blue-300', numColor: 'text-[#0F2041] dark:text-blue-300' }} />
          <StatCard label="Salary Staff" value={stats.salary} icon={Banknote}
            accent={{ border: 'bg-blue-500', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-blue-600 dark:text-blue-400', numColor: 'text-blue-700 dark:text-blue-400' }}
            onClick={() => { setContractFilter('salary'); }} />
          <StatCard label="Retainer-Only" value={stats.retainer} icon={FileDown}
            accent={{ border: 'bg-violet-500', iconBg: 'bg-violet-100 dark:bg-violet-900/40', iconColor: 'text-violet-600 dark:text-violet-400', numColor: 'text-violet-700 dark:text-violet-400' }}
            onClick={() => { setContractFilter('retainer'); }} />
          <StatCard label="Both (Salary+Retainer)" value={stats.both} icon={Layers}
            accent={{ border: 'bg-teal-500', iconBg: 'bg-teal-100 dark:bg-teal-900/40', iconColor: 'text-teal-600 dark:text-teal-400', numColor: 'text-teal-700 dark:text-teal-400' }}
            onClick={() => { setContractFilter('both'); }} />
          <StatCard label="Missing Bank Account" value={stats.missingBank} icon={UserX}
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
                {!showUnregistered && registeredEmployees.length === 0 ? (
                  <>
                    <p className="text-sm font-medium">No employees registered yet</p>
                    <p className="text-xs text-center max-w-xs">Open any user profile and click <span className="font-semibold text-emerald-600">Register as Employee</span> to add them here.</p>
                    {canEdit && unregisteredCount > 0 && (
                      <button type="button" onClick={() => setShowUnregistered(true)} className="text-xs font-semibold text-[#0F2041] underline underline-offset-2">
                        Browse {unregisteredCount} system profiles →
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-sm font-medium">No employees match your filters</p>
                )}
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
                            <ContractBadge type={p.contract_type} />
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
                        <TableHead>Contract</TableHead>
                        <TableHead>Hub</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Bank Account</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Active</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
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
                            <TableCell><InlineContractCell profile={p} onUpdate={handleUpdate} canEdit={canEdit} /></TableCell>
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
                            <TableCell className="text-right">
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setSelected(p); }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0F2041] dark:text-blue-400 border border-[#0F2041]/20 dark:border-blue-800 rounded-md px-2.5 py-1 hover:bg-[#0F2041] hover:text-white dark:hover:bg-blue-900/40 transition-colors"
                                data-testid={`button-manage-${p.id}`}
                              >
                                <Pencil className="h-3 w-3" />Manage
                              </button>
                            </TableCell>
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
                      <TableHead>Contract</TableHead>
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
                        <TableRow key={i}>{Array(9).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                      ))
                    ) : filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No employees match your filters</TableCell></TableRow>
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
                          <TableCell><InlineContractCell profile={p} onUpdate={handleUpdate} canEdit={canEdit} /></TableCell>
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
        <EmployeeDetail profile={selected} onClose={() => setSelected(null)} dbHubs={dbHubs} onUpdate={handleUpdate} onEmploymentChange={handleEmploymentChange} canEdit={canEdit} />
      )}

      {/* ── Bulk Contract Dialog ── */}
      {showBulkDialog && (
        <BulkContractDialog
          count={filtered.length}
          onConfirm={handleBulkAssign}
          onClose={() => setShowBulkDialog(false)}
          saving={bulkSaving}
        />
      )}
    </div>
  );
}
