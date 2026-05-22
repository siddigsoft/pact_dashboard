import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  Download, FileSpreadsheet, Wand2,
  User, CalendarDays, CreditCard, History, DollarSign, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sudanStates, getLocalitiesByState } from "@/data/sudanStates";
import { useGlobalPresence } from "@/context/presence/GlobalPresenceContext";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/user/UserContext";
import { useAuthorization } from "@/hooks/use-authorization";
import { usePageManageOverride } from "@/hooks/usePageManageOverride";
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

interface SalaryConfigSummary {
  user_id: string; base_salary: number; currency: string;
  allowances: Array<{ name: string; amount: number; type: 'fixed' | 'percent' }>;
  deductions: Array<{ name: string; amount: number; type: 'fixed' | 'percent' }>;
}
interface RetainerConfigSummary {
  user_id: string; classification_level: string | null; role_scope: string | null;
  amount_cents: number; currency: string;
}
function fmtMoney(amount: number, currency = 'SDG') {
  return `${currency} ${Math.round(amount).toLocaleString()}`;
}
function computeGross(cfg: SalaryConfigSummary | undefined): number {
  if (!cfg) return 0;
  let g = cfg.base_salary;
  (cfg.allowances ?? []).forEach((a: any) => { g += a.type === 'percent' ? cfg.base_salary * a.amount / 100 : (Number(a.amount) || 0); });
  return g;
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
  contract_start_date: string | null;
  contract_end_date: string | null;
  employment_type: string | null;
  is_employee: boolean;
}

/* ── Profile completeness helpers ───────────────────────── */
function completenessItems(p: EmployeeProfile): { label: string; ok: boolean }[] {
  return [
    { label: 'Role assigned',        ok: !!p.role },
    { label: 'Department assigned',  ok: !!p.department_id },
    { label: 'Bank account',         ok: !!(p.bank_account?.accountNumber || p.bank_account?.accountName) },
    { label: 'Contract type',        ok: !!p.contract_type },
    { label: 'Contract start date',  ok: !!p.contract_start_date },
    { label: 'Contract end date',    ok: !!p.contract_end_date },
    { label: 'Hub assigned',         ok: !!p.hub_id },
    { label: 'Phone number',         ok: !!p.phone },
  ];
}
function getCompleteness(p: EmployeeProfile): number {
  const items = completenessItems(p);
  return Math.round((items.filter(i => i.ok).length / items.length) * 100);
}

/* ── Contract expiry helpers ─────────────────────────────── */
function daysUntilExpiry(endDate: string | null): number | null {
  if (!endDate) return null;
  try {
    const ms = new Date(endDate).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  } catch { return null; }
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

function ExpiryBadge({ endDate }: { endDate: string | null }) {
  const days = daysUntilExpiry(endDate);
  if (days === null) return <span className="text-xs text-muted-foreground">—</span>;
  if (days <= 0)  return <span className="inline-flex items-center rounded-full border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-400">Expired</span>;
  if (days <= 30) return <span className="inline-flex items-center rounded-full border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-400">{days}d left</span>;
  if (days <= 60) return <span className="inline-flex items-center rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">{days}d left</span>;
  if (days <= 90) return <span className="inline-flex items-center rounded-full border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-0.5 text-[10px] font-bold text-yellow-700 dark:text-yellow-400">{days}d left</span>;
  try { return <span className="text-xs text-muted-foreground">{format(new Date(endDate!), 'dd MMM yy')}</span>; } catch { return <span className="text-xs text-muted-foreground">—</span>; }
}

function ClassificationBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-xs text-muted-foreground italic">Not set</span>;
  const COLORS: Record<string, string> = {
    A: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800',
    B: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800',
    C: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-800',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${COLORS[level.toUpperCase()] ?? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>
      Level {level}
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
  profile, onClose, dbHubs, departments, onUpdate, onEmploymentChange, onRoleDeptChange, canEdit,
  salaryConfig, retainerConfig, lastRetainerPayment,
}: {
  profile: EmployeeProfile;
  onClose: () => void;
  dbHubs: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  onUpdate: (id: string, type: ContractType) => void;
  onEmploymentChange: (id: string, updates: { is_employee: boolean; employee_id: string | null }) => void;
  onRoleDeptChange: (id: string, updates: { role?: string | null; department_id?: string | null }) => void;
  canEdit: boolean;
  salaryConfig?: SalaryConfigSummary;
  retainerConfig?: RetainerConfigSummary;
  lastRetainerPayment?: string;
}) {
  const { toast } = useToast();
  const hub      = dbHubs.find(h => h.id === profile.hub_id);
  const state    = sudanStates.find(s => s.id === profile.state_id);
  const av       = avBadge(profile.presence);
  const ba       = profile.bank_account;
  const hasBank  = !!(ba?.accountNumber || ba?.accountName);

  /* ── Inline role & department edit ── */
  const [editingRoleDept, setEditingRoleDept] = useState(false);
  const [roleDraft, setRoleDraft]             = useState(profile.role || '');
  const [deptDraft, setDeptDraft]             = useState(profile.department_id || '');
  const [savingRoleDept, setSavingRoleDept]   = useState(false);

  const saveRoleDept = async () => {
    setSavingRoleDept(true);
    const updates: Record<string, unknown> = {
      role: roleDraft || null,
      department_id: deptDraft || null,
    };
    const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id);
    if (error) {
      toast({ title: 'Failed to update role/department', description: error.message, variant: 'destructive' });
    } else {
      onRoleDeptChange(profile.id, { role: roleDraft || null, department_id: deptDraft || null });
      setEditingRoleDept(false);
      toast({ title: 'Role & Department updated', description: profile.full_name || '' });
    }
    setSavingRoleDept(false);
  };

  /* ── Employment registration (admin-only) ── */
  const [empIdDraft, setEmpIdDraft]         = useState(profile.employee_id || '');
  const [savingEmp, setSavingEmp]           = useState(false);
  const [generatingId, setGeneratingId]     = useState(false);

  const generateEmpId = async () => {
    setGeneratingId(true);
    const { data, error } = await supabase.rpc('generate_next_employee_id');
    if (!error && data) setEmpIdDraft(data as string);
    setGeneratingId(false);
  };

  useEffect(() => {
    if (!profile.is_employee && !profile.employee_id) {
      generateEmpId();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

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

  /* ── Inline contract dates edit ── */
  const [editingDates, setEditingDates]       = useState(false);
  const [startDraft, setStartDraft]           = useState(profile.contract_start_date?.slice(0, 10) || '');
  const [endDraft, setEndDraft]               = useState(profile.contract_end_date?.slice(0, 10) || '');
  const [savingDates, setSavingDates]         = useState(false);

  const saveDates = async () => {
    setSavingDates(true);
    const { error } = await supabase.from('profiles').update({
      contract_start_date: startDraft || null,
      contract_end_date:   endDraft   || null,
    }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Failed to update contract dates', description: error.message, variant: 'destructive' });
    } else {
      onRoleDeptChange(profile.id, {});
      setEditingDates(false);
      toast({ title: 'Contract dates updated', description: profile.full_name || '' });
    }
    setSavingDates(false);
  };

  const expiryDays  = daysUntilExpiry(profile.contract_end_date);
  const expiryAlert = expiryDays !== null && expiryDays <= 90
    ? expiryDays <= 0    ? { label: 'Expired',          cls: 'text-red-700 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' }
    : expiryDays <= 30   ? { label: `${expiryDays}d left`, cls: 'text-red-700 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' }
    : expiryDays <= 60   ? { label: `${expiryDays}d left`, cls: 'text-amber-700 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' }
    : { label: `${expiryDays}d left`,  cls: 'text-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' }
    : null;

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

  /* ── 360 Drawer tabs ── */
  const [drawerTab, setDrawerTab] = useState<'overview' | 'compensation' | 'leave' | 'advances' | 'contract'>('overview');

  /* ── Leave data (loaded on demand) ── */
  const [leaveEnt, setLeaveEnt]     = useState<any[] | null>(null);
  const [leaveReqs, setLeaveReqs]   = useState<any[] | null>(null);
  const [leaveLoading, setLeaveLoading] = useState(false);

  useEffect(() => {
    if (drawerTab !== 'leave' || leaveEnt !== null || leaveLoading) return;
    const go = async () => {
      setLeaveLoading(true);
      const yr = new Date().getFullYear();
      const [eRes, rRes] = await Promise.all([
        supabase.from('leave_entitlements').select('*').eq('user_id', profile.id).eq('year', yr),
        supabase.from('leave_requests')
          .select('id,leave_type,start_date,end_date,status,reason,duration_days')
          .eq('user_id', profile.id).order('start_date', { ascending: false }).limit(30),
      ]);
      setLeaveEnt(eRes.data ?? []);
      setLeaveReqs(rRes.data ?? []);
      setLeaveLoading(false);
    };
    go();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerTab]);

  /* ── Salary advances data (loaded on demand) ── */
  const [salAdv, setSalAdv]         = useState<any[] | null>(null);
  const [salAdvLoading, setSalAdvLoading] = useState(false);

  useEffect(() => {
    if (drawerTab !== 'advances' || salAdv !== null || salAdvLoading) return;
    const go = async () => {
      setSalAdvLoading(true);
      const { data } = await supabase.from('hr_salary_advances')
        .select('id,amount,currency,status,issued_at,reason,recovered_amount')
        .eq('user_id', profile.id).order('issued_at', { ascending: false });
      setSalAdv(data ?? []);
      setSalAdvLoading(false);
    };
    go();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerTab]);

  const DRAWER_TABS = [
    { id: 'overview'     as const, label: 'Overview',     Icon: User        },
    { id: 'compensation' as const, label: 'Compensation', Icon: DollarSign  },
    { id: 'leave'        as const, label: 'Leave',        Icon: CalendarDays},
    { id: 'advances'     as const, label: 'Advances',     Icon: CreditCard  },
    { id: 'contract'     as const, label: 'History',      Icon: History     },
  ];

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col overflow-hidden gap-0">
        {/* ── Gradient header with avatar + tab strip ── */}
        <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-6 pt-5 pb-0 shrink-0">
          <SheetHeader className="mb-3">
            <div className="flex items-start gap-4 pr-8">
              <Avatar name={profile.full_name} size="lg" availability={profile.presence} />
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-white text-lg font-bold leading-tight truncate">
                  {profile.full_name || 'Unknown'}
                </SheetTitle>
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
          </SheetHeader>

          {/* Tab strip pinned inside header */}
          <div className="flex gap-0 overflow-x-auto scrollbar-hide -mb-px">
            {DRAWER_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setDrawerTab(id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 transition-all',
                  drawerTab === id
                    ? 'border-white text-white'
                    : 'border-transparent text-blue-200/60 hover:text-blue-100 hover:border-blue-300/40',
                )}
              >
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

        {/* ═══ OVERVIEW TAB ═══ */}
        {drawerTab === 'overview' && (
        <div className="divide-y divide-border">
          {/* ── Role & Department — always visible ── */}
          <div className="px-6 py-4 bg-[#0F2041]/5 dark:bg-[#1D3461]/10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#1D3461] dark:text-blue-300 flex items-center gap-1.5">
                <Shield className="h-3 w-3" />Role & Department
              </p>
              {canEdit && !editingRoleDept && (
                <button
                  type="button"
                  onClick={() => { setRoleDraft(profile.role || ''); setDeptDraft(profile.department_id || ''); setEditingRoleDept(true); }}
                  className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground border rounded-md px-2 py-1 hover:bg-muted transition-colors"
                  data-testid="button-edit-role-dept"
                >
                  <Pencil className="h-3 w-3" />Edit
                </button>
              )}
            </div>
            {editingRoleDept ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">System Role</p>
                    <select
                      value={roleDraft}
                      onChange={e => setRoleDraft(e.target.value)}
                      className="w-full text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-[#1D3461]"
                      data-testid="select-role-draft"
                    >
                      <option value="">— No Role —</option>
                      {ROLE_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">Department</p>
                    <select
                      value={deptDraft}
                      onChange={e => setDeptDraft(e.target.value)}
                      className="w-full text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-[#1D3461]"
                      data-testid="select-dept-draft"
                    >
                      <option value="">— No Department —</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={saveRoleDept}
                    disabled={savingRoleDept}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold bg-[#0F2041] text-white rounded-md px-2 py-1.5 hover:bg-[#1D3461] disabled:opacity-60 transition-colors"
                    data-testid="button-save-role-dept"
                  >
                    {savingRoleDept ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    {savingRoleDept ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingRoleDept(false)}
                    disabled={savingRoleDept}
                    className="flex items-center justify-center gap-1 text-[10px] font-semibold border rounded-md px-2 py-1.5 hover:bg-muted transition-colors disabled:opacity-60"
                    data-testid="button-cancel-role-dept"
                  >
                    <XCircle className="h-3 w-3" />Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[#1D3461]/20 bg-white dark:bg-[#0F2041]/30 p-3">
                  <p className="text-[10px] text-muted-foreground mb-1.5 font-medium flex items-center gap-1">
                    <Shield className="h-3 w-3" />System Role
                  </p>
                  <RoleBadge role={profile.role} />
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {ROLE_LABELS[profile.role || ''] || profile.role || 'Not assigned'}
                  </p>
                </div>
                <div className="rounded-lg border border-[#1D3461]/20 bg-white dark:bg-[#0F2041]/30 p-3">
                  <p className="text-[10px] text-muted-foreground mb-1.5 font-medium flex items-center gap-1">
                    <Building2 className="h-3 w-3" />Department
                  </p>
                  {(() => {
                    const dept = departments.find(d => d.id === profile.department_id);
                    return dept ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                        <Building2 className="h-3 w-3" />{dept.name}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">Not assigned</span>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

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
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-muted-foreground">Employee ID</p>
                    <button
                      type="button"
                      onClick={generateEmpId}
                      disabled={generatingId || savingEmp}
                      title="Auto-generate next PACT ID"
                      className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-40 transition-colors"
                      data-testid="button-generate-employee-id"
                    >
                      {generatingId ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      Auto-generate
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={empIdDraft}
                      onChange={e => setEmpIdDraft(e.target.value)}
                      placeholder="PACT-0001"
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

          {/* ── Contract Dates ── */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3 w-3" />Contract Period
              </p>
              <div className="flex items-center gap-2">
                {expiryAlert && (
                  <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${expiryAlert.cls}`}>
                    <AlertCircle className="h-3 w-3" />{expiryAlert.label}
                  </span>
                )}
                {canEdit && !editingDates && (
                  <button type="button" onClick={() => setEditingDates(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors rounded p-0.5 hover:bg-muted"
                    title="Edit contract dates">
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            {editingDates ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Start Date</p>
                    <input type="date" value={startDraft} onChange={e => setStartDraft(e.target.value)}
                      className="w-full text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      data-testid="input-contract-start" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">End Date</p>
                    <input type="date" value={endDraft} onChange={e => setEndDraft(e.target.value)}
                      className="w-full text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      data-testid="input-contract-end" />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={saveDates} disabled={savingDates}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold bg-[#0F2041] text-white rounded-md px-2 py-1.5 hover:bg-[#1D3461] disabled:opacity-60 transition-colors"
                    data-testid="button-save-dates">
                    {savingDates ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    {savingDates ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setEditingDates(false)} disabled={savingDates}
                    className="flex items-center justify-center gap-1 text-[10px] font-semibold border rounded-md px-2 py-1.5 hover:bg-muted transition-colors disabled:opacity-60">
                    <XCircle className="h-3 w-3" />Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['Start Date', profile.contract_start_date ? format(new Date(profile.contract_start_date), 'dd MMM yyyy') : '—'],
                  ['End Date',   profile.contract_end_date   ? format(new Date(profile.contract_end_date),   'dd MMM yyyy') : '—'],
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label} className="rounded-md bg-muted/50 p-2.5">
                    <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                    <p className={`text-sm font-medium ${val === '—' ? 'text-muted-foreground' : ''}`}>{val}</p>
                  </div>
                ))}
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
                  <p className="text-xs text-red-600/70 dark:text-red-400/70">Payments cannot be processed for this employee.</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Compensation ── */}
          {(!profile.contract_type || profile.contract_type === 'salary' || profile.contract_type === 'both') && (
            <div className="px-6 py-4 border-t">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                <Banknote className="h-3 w-3" />Salary Compensation
              </p>
              {salaryConfig ? (
                <div className="rounded-md border bg-gradient-to-br from-blue-50/60 to-transparent dark:from-blue-950/20 dark:to-transparent p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Base Salary</p>
                      <p className="font-bold text-base text-[#0F2041] dark:text-blue-300">{fmtMoney(salaryConfig.base_salary, salaryConfig.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Gross Monthly</p>
                      <p className="font-bold text-base text-emerald-700 dark:text-emerald-400">{fmtMoney(computeGross(salaryConfig), salaryConfig.currency)}</p>
                    </div>
                  </div>
                  {(salaryConfig.allowances ?? []).length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1.5">Allowances</p>
                      <div className="space-y-1">
                        {(salaryConfig.allowances ?? []).map((a: any, i: number) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{a.name}</span>
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">
                              {a.type === 'percent' ? `+${a.amount}%` : `+${fmtMoney(a.amount, salaryConfig.currency)}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(salaryConfig.deductions ?? []).length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1.5">Deductions</p>
                      <div className="space-y-1">
                        {(salaryConfig.deductions ?? []).map((d: any, i: number) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{d.name}</span>
                            <span className="font-medium text-red-600 dark:text-red-400">
                              {d.type === 'percent' ? `-${d.amount}%` : `-${fmtMoney(d.amount, salaryConfig.currency)}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No salary configured</p>
                    <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Configure in Payroll Admin → Employee Salaries.</p>
                  </div>
                </div>
              )}
            </div>
          )}
          {(profile.contract_type === 'retainer' || profile.contract_type === 'both') && (
            <div className="px-6 py-4 border-t">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                <FileDown className="h-3 w-3" />Retainer / Field Team
              </p>
              {retainerConfig ? (
                <div className="rounded-md border bg-gradient-to-br from-violet-50/60 to-transparent dark:from-violet-950/20 dark:to-transparent p-4">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Classification</p>
                      <ClassificationBadge level={retainerConfig.classification_level} />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Monthly Retainer</p>
                      <p className="font-bold text-base text-violet-700 dark:text-violet-300">{fmtMoney(retainerConfig.amount_cents / 100, retainerConfig.currency)}</p>
                    </div>
                    {retainerConfig.role_scope && (
                      <div className="col-span-2">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Scope</p>
                        <p className="text-sm font-medium">{retainerConfig.role_scope}</p>
                      </div>
                    )}
                    {lastRetainerPayment && (
                      <div className="col-span-2">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Last Payment</p>
                        <p className="text-sm font-medium">{format(new Date(lastRetainerPayment), 'dd MMM yyyy')}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No retainer configured</p>
                    <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Configure in Retainer Management → Eligible Users.</p>
                  </div>
                </div>
              )}
            </div>
          )}

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
        )} {/* end overview tab */}

        {/* ═══ COMPENSATION TAB ═══ */}
        {drawerTab === 'compensation' && (
          <div className="p-6 space-y-5">
            {/* Profile completeness */}
            {(() => {
              const pct = getCompleteness(profile);
              return (
                <div className="rounded-xl border bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-900 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Profile Completeness</p>
                    <span className={`text-sm font-bold ${pct === 100 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    {completenessItems(profile).map(item => (
                      <div key={item.label} className="flex items-center gap-1.5 text-xs">
                        {item.ok
                          ? <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                          : <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
                        <span className={item.ok ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Salary */}
            {(!profile.contract_type || profile.contract_type === 'salary' || profile.contract_type === 'both') && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Banknote className="h-3 w-3" />Salary Compensation
                </p>
                {salaryConfig ? (
                  <div className="rounded-xl border bg-gradient-to-br from-blue-50/60 to-transparent dark:from-blue-950/20 dark:to-transparent p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Base Salary</p>
                        <p className="font-bold text-lg text-[#0F2041] dark:text-blue-300">{fmtMoney(salaryConfig.base_salary, salaryConfig.currency)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Gross Monthly</p>
                        <p className="font-bold text-lg text-emerald-700 dark:text-emerald-400">{fmtMoney(computeGross(salaryConfig), salaryConfig.currency)}</p>
                      </div>
                    </div>
                    {(salaryConfig.allowances ?? []).length > 0 && (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-2">Allowances</p>
                        <div className="space-y-1.5">
                          {(salaryConfig.allowances ?? []).map((a: any, i: number) => (
                            <div key={i} className="flex justify-between text-xs rounded bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5">
                              <span className="text-muted-foreground">{a.name}</span>
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {a.type === 'percent' ? `+${a.amount}%` : `+${fmtMoney(a.amount, salaryConfig.currency)}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(salaryConfig.deductions ?? []).length > 0 && (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-2">Deductions</p>
                        <div className="space-y-1.5">
                          {(salaryConfig.deductions ?? []).map((d: any, i: number) => (
                            <div key={i} className="flex justify-between text-xs rounded bg-red-50 dark:bg-red-900/20 px-3 py-1.5">
                              <span className="text-muted-foreground">{d.name}</span>
                              <span className="font-semibold text-red-600 dark:text-red-400">
                                {d.type === 'percent' ? `-${d.amount}%` : `-${fmtMoney(d.amount, salaryConfig.currency)}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="border-t pt-3 flex justify-between text-sm font-bold">
                      <span>Net Estimated</span>
                      <span className="text-blue-700 dark:text-blue-300">
                        {fmtMoney(
                          computeGross(salaryConfig) - (salaryConfig.deductions ?? []).reduce((s: number, d: any) =>
                            s + (d.type === 'percent' ? salaryConfig.base_salary * d.amount / 100 : Number(d.amount) || 0), 0),
                          salaryConfig.currency,
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-4">
                    <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">No salary configured</p>
                      <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-0.5">Configure in Payroll Admin → Employee Salaries.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Retainer */}
            {(profile.contract_type === 'retainer' || profile.contract_type === 'both') && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                  <FileDown className="h-3 w-3" />Retainer / Field Team
                </p>
                {retainerConfig ? (
                  <div className="rounded-xl border bg-gradient-to-br from-violet-50/60 to-transparent dark:from-violet-950/20 dark:to-transparent p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Classification</p>
                        <ClassificationBadge level={retainerConfig.classification_level} />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Monthly Retainer</p>
                        <p className="font-bold text-lg text-violet-700 dark:text-violet-300">{fmtMoney(retainerConfig.amount_cents / 100, retainerConfig.currency)}</p>
                      </div>
                      {retainerConfig.role_scope && (
                        <div className="col-span-2">
                          <p className="text-[10px] text-muted-foreground mb-0.5">Scope</p>
                          <p className="text-sm font-medium">{retainerConfig.role_scope}</p>
                        </div>
                      )}
                      {lastRetainerPayment && (
                        <div className="col-span-2">
                          <p className="text-[10px] text-muted-foreground mb-0.5">Last Payment</p>
                          <p className="text-sm font-semibold">{format(new Date(lastRetainerPayment), 'dd MMM yyyy')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-4">
                    <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">No retainer configured</p>
                      <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-0.5">Configure in Retainer Management → Eligible Users.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!profile.contract_type && (
              <div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-5 text-center">
                <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mx-auto" />
                <p className="text-sm text-muted-foreground">No contract type set. Assign one in the Overview tab first.</p>
              </div>
            )}

            {/* Link to full profile */}
            <a
              href={`/users/${profile.id}`}
              className="flex items-center justify-center gap-2 text-xs font-semibold text-[#0F2041] dark:text-blue-400 border border-[#0F2041]/30 dark:border-blue-800 rounded-lg py-3 hover:bg-[#0F2041]/5 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />View Full Profile in User Management
            </a>
          </div>
        )}

        {/* ═══ LEAVE TAB ═══ */}
        {drawerTab === 'leave' && (
          <div className="p-6 space-y-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Leave Balance — {new Date().getFullYear()}</p>
            {leaveLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            ) : (
              <>
                {/* Entitlement grid */}
                {leaveEnt && leaveEnt.length > 0 ? (
                  <div className="rounded-xl border overflow-hidden">
                    <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-y sm:divide-y-0">
                      {([
                        ['Annual',    leaveEnt[0]?.annual_days    ?? 0],
                        ['Sick',      leaveEnt[0]?.sick_days      ?? 0],
                        ['Emergency', leaveEnt[0]?.emergency_days ?? 0],
                        ['Maternity', leaveEnt[0]?.maternity_days ?? 0],
                        ['Paternity', leaveEnt[0]?.paternity_days ?? 0],
                        ['Unpaid',    leaveEnt[0]?.unpaid_days    ?? 0],
                      ] as [string, number][]).map(([label, days]) => (
                        <div key={label} className="p-3 text-center bg-muted/20">
                          <p className="text-lg font-bold">{days}</p>
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-center">
                    <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                    <p className="text-sm text-muted-foreground">No leave entitlements for {new Date().getFullYear()}.</p>
                    <p className="text-xs text-muted-foreground mt-1">Set them up in HR Hub → HR Tools → Leave Entitlements.</p>
                  </div>
                )}

                {/* Leave requests */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Leave Requests</p>
                  {!leaveReqs || leaveReqs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No leave requests found.</p>
                  ) : (
                    <div className="space-y-2">
                      {leaveReqs.map((r: any) => (
                        <div key={r.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold capitalize">{(r.leave_type ?? '').replace(/_/g, ' ')}</span>
                              <span className={cn(
                                'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                                r.status === 'approved' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                                  : r.status === 'pending' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                                  : 'bg-red-100 dark:bg-red-900/40 text-red-600',
                              )}>
                                {r.status}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {r.start_date ? format(new Date(r.start_date), 'dd MMM yy') : '—'}
                              {r.end_date && r.end_date !== r.start_date ? ` – ${format(new Date(r.end_date), 'dd MMM yy')}` : ''}
                            </p>
                          </div>
                          <span className="text-sm font-bold shrink-0 ml-3">{r.duration_days ?? 1}d</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ ADVANCES TAB ═══ */}
        {drawerTab === 'advances' && (
          <div className="p-6 space-y-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Salary Advances</p>
            {salAdvLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : !salAdv || salAdv.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">No salary advances on record.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary row */}
                {(() => {
                  const total = salAdv.reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
                  const recovered = salAdv.reduce((s: number, a: any) => s + Number(a.recovered_amount || 0), 0);
                  const outstanding = Math.max(0, total - recovered);
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Total Issued',  value: `SDG ${Math.round(total).toLocaleString()}`,       color: 'text-foreground'   },
                        { label: 'Recovered',     value: `SDG ${Math.round(recovered).toLocaleString()}`,   color: 'text-emerald-600'  },
                        { label: 'Outstanding',   value: `SDG ${Math.round(outstanding).toLocaleString()}`, color: outstanding > 0 ? 'text-red-600' : 'text-emerald-600' },
                      ].map(k => (
                        <div key={k.label} className="rounded-xl border bg-muted/30 p-3 text-center">
                          <p className="text-[10px] text-muted-foreground">{k.label}</p>
                          <p className={`text-sm font-bold ${k.color}`}>{k.value}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Individual advances */}
                <div className="space-y-3">
                  {salAdv.map((a: any) => {
                    const amount = Number(a.amount || 0);
                    const recovered = Number(a.recovered_amount || 0);
                    const pct = amount > 0 ? Math.min(100, Math.round(recovered / amount * 100)) : 0;
                    const done = pct >= 100;
                    return (
                      <div key={a.id} className="rounded-xl border p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold">SDG {Math.round(amount).toLocaleString()}</p>
                            {a.reason && <p className="text-[10px] text-muted-foreground mt-0.5">{a.reason}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', done ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400')}>
                              {done ? 'Fully Recovered' : a.status ?? 'Active'}
                            </span>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{a.issued_at ? format(new Date(a.issued_at), 'dd MMM yyyy') : '—'}</p>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                            <span>Recovery progress</span><span>{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ CONTRACT HISTORY TAB ═══ */}
        {drawerTab === 'contract' && (
          <div className="p-6 space-y-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Contract Information</p>

            {/* Current contract */}
            <div className="rounded-xl border overflow-hidden">
              <div className="bg-[#0F2041]/5 dark:bg-[#1D3461]/10 px-4 py-3 border-b">
                <p className="text-xs font-bold text-[#1D3461] dark:text-blue-300">Current Contract</p>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Contract Type</p>
                    <ContractBadge type={profile.contract_type} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Employee ID</p>
                    <p className="text-sm font-mono font-semibold">{profile.employee_id || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Start Date</p>
                    <p className="text-sm font-semibold">{profile.contract_start_date ? format(new Date(profile.contract_start_date), 'dd MMM yyyy') : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">End Date</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold">{profile.contract_end_date ? format(new Date(profile.contract_end_date), 'dd MMM yyyy') : '—'}</p>
                      {profile.contract_end_date && <ExpiryBadge endDate={profile.contract_end_date} />}
                    </div>
                  </div>
                </div>
                {profile.contract_start_date && profile.contract_end_date && (() => {
                  const months = Math.round((new Date(profile.contract_end_date).getTime() - new Date(profile.contract_start_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
                  return (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Duration</p>
                      <p className="text-sm font-medium">{months > 0 ? `${months} months` : 'Less than a month'}</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Setup checklist */}
            <div className="rounded-xl border p-4">
              <p className="text-xs font-bold text-muted-foreground mb-3">Profile Setup Checklist</p>
              <div className="space-y-2.5">
                {completenessItems(profile).map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={cn('w-5 h-5 rounded-full flex items-center justify-center shrink-0', item.ok ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-muted')}>
                      {item.ok
                        ? <CheckCircle className="h-3 w-3 text-emerald-600" />
                        : <XCircle className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <span className={cn('text-xs', item.ok ? 'text-foreground font-medium' : 'text-muted-foreground')}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Account metadata */}
            <div className="rounded-xl border p-4">
              <p className="text-xs font-bold text-muted-foreground mb-3">Account Information</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-[10px] text-muted-foreground">Registered</p><p className="font-medium">{profile.created_at ? format(parseISO(profile.created_at), 'dd MMM yyyy') : '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Last Updated</p><p className="font-medium">{profile.updated_at ? format(parseISO(profile.updated_at), 'dd MMM yyyy') : '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Employment Type</p><p className="font-medium capitalize">{profile.employment_type?.replace(/-/g, ' ') || '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Profile ID</p><p className="font-mono text-xs">{profile.id.slice(0, 12)}…</p></div>
              </div>
            </div>

            {/* Full profile link */}
            <a
              href={`/users/${profile.id}`}
              className="flex items-center justify-center gap-2 text-xs font-semibold text-[#0F2041] dark:text-blue-400 border border-[#0F2041]/30 dark:border-blue-800 rounded-xl py-3 hover:bg-[#0F2041]/5 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />Open Full Profile
            </a>
          </div>
        )}

        </div>{/* end scrollable body */}
      </SheetContent>
    </Sheet>
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

/* ─── Bulk Role + Department Dialog ─────────────────────── */
function BulkRoleDeptDialog({
  count, roles, departments, onConfirm, onClose, saving,
}: { count: number; roles: string[]; departments: { id: string; name: string }[]; onConfirm: (role: string | null, deptId: string | null) => void; onClose: () => void; saving: boolean }) {
  const [roleDraft, setRoleDraft]   = useState<string>('__keep__');
  const [deptDraft, setDeptDraft]   = useState<string>('__keep__');
  const canApply = roleDraft !== '__keep__' || deptDraft !== '__keep__';
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Bulk Assign Role & Department
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {count} employee{count !== 1 ? 's' : ''} will be updated
            </p>
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-0.5">Applies to all currently-filtered employees</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Set role to:</p>
              <select value={roleDraft} onChange={e => setRoleDraft(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="__keep__">— Keep existing role —</option>
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Set department to:</p>
              <select value={deptDraft} onChange={e => setDeptDraft(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="__keep__">— Keep existing department —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          {!canApply && (
            <p className="text-xs text-muted-foreground text-center">Select at least one field to update</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1 bg-[#0F2041] hover:bg-[#1D3461] text-white"
              onClick={() => onConfirm(roleDraft === '__keep__' ? null : roleDraft, deptDraft === '__keep__' ? null : deptDraft)}
              disabled={saving || !canApply}
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

  const { hasAnyRole, isSuperAdmin } = useAuthorization();
  const roleCanEdit = isSuperAdmin() || hasAnyRole(['admin', 'fom', 'financialAdmin', 'hrManager', 'hr']);
  const overrideCanEdit = usePageManageOverride('employees', roleCanEdit);
  const canEdit = roleCanEdit || overrideCanEdit;

  const [profiles, setProfiles]               = useState<EmployeeProfile[]>([]);
  const [salaryConfigMap, setSalaryConfigMap]     = useState<Record<string, SalaryConfigSummary>>({});
  const [retainerConfigMap, setRetainerConfigMap] = useState<Record<string, RetainerConfigSummary>>({});
  const [lastRetainerMap, setLastRetainerMap]     = useState<Record<string, string>>({});
  const [dbHubs, setDbHubs]     = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<EmployeeProfile | null>(null);

  /* ── Bulk contract assign ── */
  const [showBulkDialog, setShowBulkDialog]     = useState(false);
  const [bulkSaving, setBulkSaving]             = useState(false);
  const [bulkRoleSaving, setBulkRoleSaving]     = useState(false);

  const handleUpdate = useCallback((id: string, newType: ContractType) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, contract_type: newType } : p));
    setSelected(prev => prev?.id === id ? { ...prev, contract_type: newType } : prev);
  }, []);

  const handleEmploymentChange = useCallback((id: string, updates: { is_employee: boolean; employee_id: string | null }) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    setSelected(prev => prev?.id === id ? { ...prev, ...updates } : prev);
  }, []);

  const handleRoleDeptChange = useCallback((id: string, updates: { role?: string | null; department_id?: string | null }) => {
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

  const handleBulkRoleDept = async (role: string | null, deptId: string | null) => {
    setBulkRoleSaving(true);
    const ids = filtered.map(p => p.id);
    const updates: Record<string, unknown> = {};
    if (role)   updates.role          = role;
    if (deptId) updates.department_id = deptId;
    const { error } = await (supabase as any).from('profiles').update(updates).in('id', ids);
    if (error) {
      toast({ title: 'Bulk update failed', description: error.message, variant: 'destructive' });
    } else {
      setProfiles(prev => prev.map(p => ids.includes(p.id) ? { ...p, ...updates } : p));
      setSelected(prev => prev && ids.includes(prev.id) ? { ...prev, ...updates } : prev);
      const parts = [role && `Role → ${role}`, deptId && `Dept set`].filter(Boolean).join(', ');
      toast({ title: `${ids.length} employee${ids.length !== 1 ? 's' : ''} updated`, description: parts });
      setShowBulkRoleDialog(false);
    }
    setBulkRoleSaving(false);
  };

  /* ── Active tab — declared here so the financial useEffect can reference it ── */
  const [activeTab, setActiveTab]   = useState('staff');

  /* ── Financial summary state — lazy: only fetched when tab is first opened ── */
  const emptyFinRow = (): FinRow => ({ total: 0, approved: 0, amountSDG: 0 });
  const [finLoading, setFinLoading] = useState(false);
  const [awaitingAck, setAwaitingAck] = useState(0);
  const [finData, setFinData] = useState<{ advances: FinMonth; costs: FinMonth; withdrawals: FinMonth }>({
    advances:    { current: emptyFinRow(), prev: emptyFinRow() },
    costs:       { current: emptyFinRow(), prev: emptyFinRow() },
    withdrawals: { current: emptyFinRow(), prev: emptyFinRow() },
  });
  const finFetched = useRef(false);

  useEffect(() => {
    if (activeTab !== 'financial' || finFetched.current) return;
    finFetched.current = true;
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
  }, [activeTab]);

  /* Departments */
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  /* Filters */
  const [search, setSearch]               = useState('');
  const [hubFilter, setHubFilter]         = useState('all');
  const [stateFilter, setStateFilter]     = useState('all');
  const [localityFilter, setLocalFilter]  = useState('all');
  const [roleFilter, setRoleFilter]       = useState('all');
  const [bankFilter, setBankFilter]           = useState('all');
  const [contractFilter, setContractFilter]   = useState('all');
  const [completenessFilter, setCompletenessFilter] = useState<'all' | 'incomplete' | 'complete'>('all');
  const [showBulkRoleDialog, setShowBulkRoleDialog] = useState(false);
  const [deptFilter, setDeptFilter]       = useState('all');
  const [showUnregistered, setShowUnregistered] = useState(false);
  const [viewMode, setViewMode]           = useState<'cards' | 'table'>('table');

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
          .select('id, full_name, email, phone, role, employee_id, is_employee, hub_id, state_id, locality_id, availability, status, updated_at, created_at, bank_account, last_activity, device_info, app_version, department_id, contract_type, contract_start_date, contract_end_date, employment_type')
          .order('full_name'),
      ]);
      if (hubsRes.data?.length) setDbHubs(hubsRes.data);
      if (deptsRes.data?.length) setDepartments(deptsRes.data);

      if (pRes.data) {
        setProfiles(pRes.data
          .filter((p: any) => {
            const r = (p.role || '').toLowerCase().replace(/[\s_-]/g, '');
            return r !== 'coordinator' && r !== 'datacollector';
          })
          .map((p: any) => {
            let raw = p.bank_account;
            if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
            const ba = normalizeBA(raw);
            const last_activity = p.last_activity || (p.device_info ? p.updated_at : null);
            const device_info   = p.device_info || null;
            const app_version   = p.app_version || null;
            const presence      = isUserOnline(p.id) ? 'online' : presenceFromActivity(last_activity, p.updated_at);
            return { ...p, bank_account: ba, last_activity, device_info, app_version, presence, is_employee: !!p.is_employee };
          }));

      // ── Compensation data (non-blocking, fire-and-forget) ──
      Promise.all([
        (supabase as any).from('employee_salary_config').select('user_id, base_salary, currency, allowances, deductions'),
        (supabase as any).from('current_user_classifications').select('user_id, classification_level, role_scope, amount_cents, currency').eq('is_active', true),
        (supabase as any).from('wallet_transactions').select('user_id, created_at').filter('metadata->>type', 'eq', 'retainer').order('created_at', { ascending: false }).limit(500),
      ]).then(([salaryRes, retainerRes, lastPayRes]: any[]) => {
        if (salaryRes.data) {
          const m: Record<string, SalaryConfigSummary> = {};
          salaryRes.data.forEach((s: any) => { m[s.user_id] = s; });
          setSalaryConfigMap(m);
        }
        if (retainerRes.data) {
          const m: Record<string, RetainerConfigSummary> = {};
          retainerRes.data.forEach((r: any) => { m[r.user_id] = r; });
          setRetainerConfigMap(m);
        }
        if (lastPayRes.data) {
          const m: Record<string, string> = {};
          lastPayRes.data.forEach((t: any) => { if (!m[t.user_id]) m[t.user_id] = t.created_at; });
          setLastRetainerMap(m);
        }
      }).catch(() => {/* non-critical */});
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

  /* ── Completeness map — computed once per enriched change, looked up everywhere ── */
  const completenessMap = useMemo(() => {
    const m = new Map<string, { pct: number; missing: string[] }>();
    enriched.forEach(p => {
      const items = completenessItems(p);
      const ok    = items.filter(i => i.ok).length;
      m.set(p.id, {
        pct:     Math.round((ok / items.length) * 100),
        missing: items.filter(i => !i.ok).map(i => i.label),
      });
    });
    return m;
  }, [enriched]);

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
      if (completenessFilter !== 'all') {
        const pct = completenessMap.get(p.id)?.pct ?? 0;
        if (completenessFilter === 'incomplete' && pct >= 100) return false;
        if (completenessFilter === 'complete'   && pct <  100) return false;
      }
      if (deptFilter !== 'all' && p.department_id !== deptFilter) return false;
      return true;
    });
  }, [enriched, completenessMap, search, hubFilter, stateFilter, localityFilter, roleFilter, bankFilter, contractFilter, completenessFilter, deptFilter, showUnregistered]);

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
    expiredContracts: registeredEmployees.filter(p => { const d = daysUntilExpiry(p.contract_end_date); return d !== null && d <= 0; }).length,
    expiringContracts: registeredEmployees.filter(p => { const d = daysUntilExpiry(p.contract_end_date); return d !== null && d > 0 && d <= 30; }).length,
    incompleteProfiles: registeredEmployees.filter(p => (completenessMap.get(p.id)?.pct ?? 0) < 100).length,
  }), [registeredEmployees, completenessMap]);

  /* ── Per-tab filtered lists ── */
  const staffFiltered = useMemo(
    () => filtered.filter(p => !p.contract_type || p.contract_type === 'salary' || p.contract_type === 'both'),
    [filtered]
  );
  const fieldTeamFiltered = useMemo(
    () => filtered.filter(p => p.contract_type === 'retainer' || p.contract_type === 'both'),
    [filtered]
  );

  /* ── Workforce cost summary ── */
  const workforceCost = useMemo(() => {
    let salaryTotal = 0; let retainerTotal = 0;
    registeredEmployees.forEach(p => {
      if (!p.contract_type || p.contract_type === 'salary' || p.contract_type === 'both') {
        salaryTotal += computeGross(salaryConfigMap[p.id]);
      }
      if (p.contract_type === 'retainer' || p.contract_type === 'both') {
        const rc = retainerConfigMap[p.id];
        if (rc) retainerTotal += rc.amount_cents / 100;
      }
    });
    return { salaryTotal, retainerTotal, combined: salaryTotal + retainerTotal };
  }, [registeredEmployees, salaryConfigMap, retainerConfigMap]);

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
    setRoleFilter('all'); setBankFilter('all'); setContractFilter('all'); setDeptFilter('all'); setCompletenessFilter('all');
  };
  const hasFilters = !!(search || hubFilter !== 'all' || stateFilter !== 'all' || localityFilter !== 'all' || roleFilter !== 'all' || bankFilter !== 'all' || contractFilter !== 'all' || deptFilter !== 'all' || completenessFilter !== 'all');

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
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkDialog(true)}
                className="h-8 text-xs gap-1.5 border-dashed"
                data-testid="button-bulk-contract"
              >
                <Pencil className="h-3 w-3" />
                Bulk Contract
                {filtered.length < enriched.length && <span className="font-bold text-[#0F2041]">({filtered.length})</span>}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkRoleDialog(true)}
                className="h-8 text-xs gap-1.5 border-dashed"
                data-testid="button-bulk-role-dept"
              >
                <Users className="h-3 w-3" />
                Bulk Role/Dept
                {filtered.length < enriched.length && <span className="font-bold text-[#0F2041]">({filtered.length})</span>}
              </Button>
            </>
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
          description="Your full workforce registry, split into two tracks. Staff tab shows salary employees with their base salary, gross pay, and payroll account — sourced live from Payroll Admin. Field Team tab shows retainer-based field workers with classification level, monthly retainer amount, and last payment date — sourced live from Retainer Management. Both tabs share the same filters. Click any row to open the employee detail panel, which includes a Compensation section showing the full salary breakdown or retainer configuration. The workforce cost cards at the top show your live monthly salary commitment, retainer commitment, and combined cost. Bank Accounts tab shows the full account registry for payment processing. Financial Overview shows monthly activity across transportation advances, cost submissions, and withdrawal requests."
          descriptionAr="سجل القوى العاملة الكامل، مقسم إلى مسارين: الموظفون (براتب) وفريق الميدان (مكافأة). انقر على أي صف لعرض تفاصيل الموظف وقسم التعويضات. بطاقات التكلفة أعلاه تعرض الالتزامات الشهرية الحية."
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

        {/* ── Workforce Cost Summary ── */}
        {!loading && workforceCost.combined > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="overflow-hidden">
              <div className="h-1 bg-blue-500" />
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground">Monthly Salary Commitment</p>
                  <Banknote className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-2xl font-extrabold text-blue-700 dark:text-blue-400">{fmtMoney(workforceCost.salaryTotal)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{stats.salary + stats.both} salary staff</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <div className="h-1 bg-violet-500" />
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground">Monthly Retainer Commitment</p>
                  <FileDown className="h-4 w-4 text-violet-500" />
                </div>
                <p className="text-2xl font-extrabold text-violet-700 dark:text-violet-400">{fmtMoney(workforceCost.retainerTotal)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{stats.retainer + stats.both} field team members</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <div className="h-1 bg-teal-500" />
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground">Combined Monthly Cost</p>
                  <Layers className="h-4 w-4 text-teal-500" />
                </div>
                <p className="text-2xl font-extrabold text-teal-700 dark:text-teal-400">{fmtMoney(workforceCost.combined)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{stats.total} total registered</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Contract Expiry / Completeness Alerts Banner ── */}
        {!loading && (stats.expiredContracts > 0 || stats.expiringContracts > 0 || stats.incompleteProfiles > 0) && (
          <div className="flex flex-wrap gap-2 px-1 pb-1">
            {stats.expiredContracts > 0 && (
              <button
                type="button"
                onClick={() => { setCompletenessFilter('all'); }}
                className="flex items-center gap-1.5 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                data-testid="banner-expired-contracts"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="font-bold">{stats.expiredContracts}</span> expired contract{stats.expiredContracts !== 1 ? 's' : ''}
              </button>
            )}
            {stats.expiringContracts > 0 && (
              <button
                type="button"
                onClick={() => { setCompletenessFilter('all'); }}
                className="flex items-center gap-1.5 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                data-testid="banner-expiring-contracts"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="font-bold">{stats.expiringContracts}</span> contract{stats.expiringContracts !== 1 ? 's' : ''} expiring within 30 days
              </button>
            )}
            {stats.incompleteProfiles > 0 && (
              <button
                type="button"
                onClick={() => setCompletenessFilter('incomplete')}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  completenessFilter === 'incomplete'
                    ? 'border-orange-400 bg-orange-500 text-white'
                    : 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                }`}
                data-testid="banner-incomplete-profiles"
              >
                <UserX className="h-3.5 w-3.5" />
                <span className="font-bold">{stats.incompleteProfiles}</span> incomplete profile{stats.incompleteProfiles !== 1 ? 's' : ''}
                {completenessFilter === 'incomplete' && <XCircle className="h-3 w-3 ml-1" />}
              </button>
            )}
          </div>
        )}

        {/* ── Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1 p-1 bg-muted/60 border rounded-lg">
            <TabsTrigger value="staff" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-md text-xs h-8 px-3">
              <Briefcase className="h-3.5 w-3.5" />Staff
              {!loading && <span className="ml-0.5 rounded-full bg-current/10 px-1.5 py-0 text-[10px] font-bold data-[state=active]:bg-white/20">{staffFiltered.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="field_team" className="gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white rounded-md text-xs h-8 px-3">
              <Users className="h-3.5 w-3.5" />Field Team
              {!loading && <span className="ml-0.5 rounded-full bg-current/10 px-1.5 py-0 text-[10px] font-bold data-[state=active]:bg-white/20">{fieldTeamFiltered.length}</span>}
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

          {/* ── Staff tab (salary / both) ── */}
          <TabsContent value="staff" className="mt-0">
            {loading ? (
              <Card className="overflow-hidden"><div className="space-y-2 p-4">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div></Card>
            ) : staffFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-3">
                <div className="rounded-full bg-blue-50 dark:bg-blue-950/30 p-4"><Briefcase className="h-8 w-8 text-blue-400" /></div>
                {registeredEmployees.length === 0 ? (
                  <>
                    <p className="text-sm font-medium">No employees registered yet</p>
                    <p className="text-xs text-center max-w-xs">Open any user profile and click <span className="font-semibold text-emerald-600">Register as Employee</span> to add them here.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">No salary staff match your filters</p>
                    <p className="text-xs text-muted-foreground">Staff have contract type "Salary" or "Salary + Retainer".</p>
                  </>
                )}
              </div>
            ) : viewMode === 'cards' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {staffFiltered.map(p => {
                  const hub = dbHubs.find(h => h.id === p.hub_id);
                  const hasBank = !!(p.bank_account?.accountNumber || p.bank_account?.accountName);
                  const sc = salaryConfigMap[p.id];
                  return (
                    <Card key={p.id} className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 border hover:border-blue-200 dark:hover:border-blue-800 overflow-hidden"
                      onClick={() => setSelected(p)} data-testid={`card-staff-${p.id}`}>
                      <CardContent className="p-0">
                        <div className={`h-1 w-full ${p.presence === 'online' ? 'bg-green-500' : p.presence === 'away' ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                        <div className="p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <Avatar name={p.full_name} size="md" availability={p.presence} />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">{p.full_name || 'Unknown'}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
                              <RoleBadge role={p.role} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="rounded bg-blue-50 dark:bg-blue-950/30 px-2 py-1.5">
                              <p className="text-[10px] text-muted-foreground">Base Salary</p>
                              <p className="text-xs font-bold text-blue-700 dark:text-blue-400 truncate">{sc ? fmtMoney(sc.base_salary, sc.currency) : '—'}</p>
                            </div>
                            <div className="rounded bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1.5">
                              <p className="text-[10px] text-muted-foreground">Gross</p>
                              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 truncate">{sc ? fmtMoney(computeGross(sc), sc.currency) : '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t text-xs">
                            <div className="flex items-center gap-1.5"><Landmark className="h-3 w-3 text-muted-foreground" />{hasBank ? <span className="font-mono text-[10px]">{maskAcc(p.bank_account?.accountNumber)}</span> : <span className="text-red-500 font-medium">No account</span>}</div>
                            {hub && <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{hub.name}</span>}
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
                        <TableHead>Base Salary</TableHead>
                        <TableHead>Gross</TableHead>
                        <TableHead>Hub</TableHead>
                        <TableHead>Payroll Account</TableHead>
                        <TableHead>Contract</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Profile</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffFiltered.map(p => {
                        const hub = dbHubs.find(h => h.id === p.hub_id);
                        const hasBank = !!(p.bank_account?.accountNumber || p.bank_account?.accountName);
                        const av = avBadge(p.presence);
                        const sc = salaryConfigMap[p.id];
                        return (
                          <TableRow key={p.id} className="cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
                            onClick={() => setSelected(p)} data-testid={`row-staff-${p.id}`}>
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
                              {sc ? <span className="text-sm font-bold text-blue-700 dark:text-blue-400">{fmtMoney(sc.base_salary, sc.currency)}</span>
                                  : <span className="text-xs text-amber-600 italic">Not configured</span>}
                            </TableCell>
                            <TableCell>
                              {sc ? <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{fmtMoney(computeGross(sc), sc.currency)}</span>
                                  : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                            <TableCell className="text-xs">{hub?.name || '—'}</TableCell>
                            <TableCell>
                              {hasBank ? <span className="text-xs font-mono font-medium">{maskAcc(p.bank_account?.accountNumber)}</span>
                                       : <span className="text-xs text-red-500 font-medium">Missing</span>}
                            </TableCell>
                            <TableCell><InlineContractCell profile={p} onUpdate={handleUpdate} canEdit={canEdit} /></TableCell>
                            <TableCell><ExpiryBadge endDate={p.contract_end_date} /></TableCell>
                            <TableCell>
                              {(() => {
                                const { pct = 0, missing = [] } = completenessMap.get(p.id) ?? {};
                                const color = pct === 100 ? 'text-green-600 dark:text-green-400' : pct >= 75 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
                                return (
                                  <div className="flex items-center gap-1.5" title={missing.length ? `Missing: ${missing.join(', ')}` : 'Complete'}>
                                    <div className="w-6 h-6 shrink-0">
                                      <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
                                        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted-foreground/20" />
                                        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" className={color} strokeDasharray={`${pct * 0.565} 56.5`} strokeLinecap="round" />
                                      </svg>
                                    </div>
                                    <span className={`text-[11px] font-semibold ${color}`}>{pct}%</span>
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${av.dot}`} />
                                <span className={`text-xs font-medium ${av.labelColor}`}>{av.label}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <button type="button" onClick={e => { e.stopPropagation(); setSelected(p); }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0F2041] dark:text-blue-400 border border-[#0F2041]/20 dark:border-blue-800 rounded-md px-2.5 py-1 hover:bg-[#0F2041] hover:text-white dark:hover:bg-blue-900/40 transition-colors"
                                data-testid={`button-manage-staff-${p.id}`}>
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

          {/* ── Field Team tab (retainer / both) ── */}
          <TabsContent value="field_team" className="mt-0">
            {loading ? (
              <Card className="overflow-hidden"><div className="space-y-2 p-4">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div></Card>
            ) : fieldTeamFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-3">
                <div className="rounded-full bg-violet-50 dark:bg-violet-950/30 p-4"><Users className="h-8 w-8 text-violet-400" /></div>
                <p className="text-sm font-medium">No field team members match your filters</p>
                <p className="text-xs text-muted-foreground text-center max-w-xs">Field team members have contract type "Retainer-Only" or "Salary + Retainer".</p>
              </div>
            ) : viewMode === 'cards' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {fieldTeamFiltered.map(p => {
                  const hub = dbHubs.find(h => h.id === p.hub_id);
                  const hasBank = !!(p.bank_account?.accountNumber || p.bank_account?.accountName);
                  const rc = retainerConfigMap[p.id];
                  const lastPay = lastRetainerMap[p.id];
                  return (
                    <Card key={p.id} className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 border hover:border-violet-200 dark:hover:border-violet-800 overflow-hidden"
                      onClick={() => setSelected(p)} data-testid={`card-field-${p.id}`}>
                      <CardContent className="p-0">
                        <div className={`h-1 w-full ${p.presence === 'online' ? 'bg-green-500' : p.presence === 'away' ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                        <div className="p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <Avatar name={p.full_name} size="md" availability={p.presence} />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">{p.full_name || 'Unknown'}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap"><RoleBadge role={p.role} />{rc && <ClassificationBadge level={rc.classification_level} />}</div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="rounded bg-violet-50 dark:bg-violet-950/30 px-2 py-1.5">
                              <p className="text-[10px] text-muted-foreground">Retainer / mo</p>
                              <p className="text-xs font-bold text-violet-700 dark:text-violet-400 truncate">{rc ? fmtMoney(rc.amount_cents / 100, rc.currency) : '—'}</p>
                            </div>
                            <div className="rounded bg-slate-50 dark:bg-slate-800/50 px-2 py-1.5">
                              <p className="text-[10px] text-muted-foreground">Last Payment</p>
                              <p className="text-xs font-medium truncate">{lastPay ? format(new Date(lastPay), 'dd MMM yy') : '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t text-xs">
                            <div className="flex items-center gap-1.5"><Landmark className="h-3 w-3 text-muted-foreground" />{hasBank ? <span className="font-mono text-[10px]">{maskAcc(p.bank_account?.accountNumber)}</span> : <span className="text-amber-500 font-medium">No cash-out account</span>}</div>
                            {hub && <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{hub.name}</span>}
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
                        <TableHead>Classification</TableHead>
                        <TableHead>Retainer / Month</TableHead>
                        <TableHead>Last Payment</TableHead>
                        <TableHead>Cash-out Account</TableHead>
                        <TableHead>Contract</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fieldTeamFiltered.map(p => {
                        const hasBank = !!(p.bank_account?.accountNumber || p.bank_account?.accountName);
                        const av = avBadge(p.presence);
                        const rc = retainerConfigMap[p.id];
                        const lastPay = lastRetainerMap[p.id];
                        return (
                          <TableRow key={p.id} className="cursor-pointer hover:bg-violet-50/50 dark:hover:bg-violet-950/20"
                            onClick={() => setSelected(p)} data-testid={`row-field-${p.id}`}>
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
                            <TableCell><ClassificationBadge level={rc?.classification_level ?? null} /></TableCell>
                            <TableCell>
                              {rc ? <span className="text-sm font-bold text-violet-700 dark:text-violet-400">{fmtMoney(rc.amount_cents / 100, rc.currency)}</span>
                                  : <span className="text-xs text-amber-600 italic">Not configured</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {lastPay ? format(new Date(lastPay), 'dd MMM yyyy') : '—'}
                            </TableCell>
                            <TableCell>
                              {hasBank
                                ? <div className="flex flex-col gap-0"><span className="text-xs font-mono font-medium">{maskAcc(p.bank_account?.accountNumber)}</span><span className="text-[10px] text-muted-foreground">Cash-out</span></div>
                                : <span className="text-xs text-amber-600 italic">Not registered</span>}
                            </TableCell>
                            <TableCell><InlineContractCell profile={p} onUpdate={handleUpdate} canEdit={canEdit} /></TableCell>
                            <TableCell><ExpiryBadge endDate={p.contract_end_date} /></TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${av.dot}`} />
                                <span className={`text-xs font-medium ${av.labelColor}`}>{av.label}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <button type="button" onClick={e => { e.stopPropagation(); setSelected(p); }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-400 border border-violet-300 dark:border-violet-700 rounded-md px-2.5 py-1 hover:bg-violet-600 hover:text-white dark:hover:bg-violet-900/40 transition-colors"
                                data-testid={`button-manage-field-${p.id}`}>
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
        <EmployeeDetail
          profile={selected}
          onClose={() => setSelected(null)}
          dbHubs={dbHubs}
          departments={departments}
          onUpdate={handleUpdate}
          onEmploymentChange={handleEmploymentChange}
          onRoleDeptChange={handleRoleDeptChange}
          canEdit={canEdit}
          salaryConfig={salaryConfigMap[selected.id]}
          retainerConfig={retainerConfigMap[selected.id]}
          lastRetainerPayment={lastRetainerMap[selected.id]}
        />
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

      {/* ── Bulk Role & Dept Dialog ── */}
      {showBulkRoleDialog && (
        <BulkRoleDeptDialog
          count={filtered.length}
          roles={ROLE_OPTIONS.map(([k]) => k)}
          departments={departments}
          onConfirm={handleBulkRoleDept}
          onClose={() => setShowBulkRoleDialog(false)}
          saving={bulkRoleSaving}
        />
      )}
    </div>
  );
}
