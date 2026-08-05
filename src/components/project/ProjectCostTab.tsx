import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  DollarSign, Clock, CheckCircle, XCircle, ExternalLink,
  Filter, TrendingUp, Receipt, AlertTriangle, Download,
  Loader2, FileText, BookOpen, RefreshCw, ChevronDown,
  ChevronUp, CreditCard, Wallet, BarChart2, Plus,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { exportToExcel } from '@/utils/report-export';

/* ─── Props ─────────────────────────────────────────────────────────────── */
interface ProjectCostTabProps {
  projectId: string;
  projectName: string;
  budgetTotalCents?: number | null;
  currency?: string;
}

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface OperationalCost {
  id: string;
  expense_category: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  expense_date: string | null;
  vendor: string | null;
  submitted_by: string;
  submitted_at: string | null;
  status: string;
  tier1_status: string | null;
  tier2_status: string | null;
  paid_at: string | null;
  reconciled_at: string | null;
  reconciled_amount_cents: number | null;
  created_at: string;
}

interface AdvanceRow {
  id: string;
  status: string;
  requested_by: string;
  site_name: string | null;
  requested_amount: number;
  approved_amount: number | null;
  total_paid_amount: number;
  justification: string | null;
  created_at: string;
}

interface PreFundRow {
  id: string;
  name: string;
  source: string | null;
  amount: number;
  currency: string;
  available_balance: number;
  committed_amount: number;
  paid_amount: number;
  status: string;
  project_id: string | null;
  matching_scope: string;
  created_at: string;
}

interface GLLine {
  id: string;
  line_no: number;
  debit_credit: 'DR' | 'CR';
  functional_amount: number;
  description: string | null;
  posting_date: string;
  entry_no: number;
  account_code: string;
  account_name: string;
}

/* ─── Constants ─────────────────────────────────────────────────────────── */
const EXPENSE_LABELS: Record<string, string> = {
  permits: 'Permits',
  incentives: 'Incentives',
  communications: 'Communications',
  training: 'Training',
  general_transport: 'General Transportation',
  equipment: 'Equipment & Supplies',
  printing: 'Printing & Materials',
  meetings: 'Meetings & Events',
  other: 'Other',
};

// Maps budget category_allocations keys → expense_category keys (best-effort)
const BUDGET_CAT_TO_EXPENSE: Record<string, string> = {
  // New standardised keys
  personnel_labor_fees: 'other',
  transportation_logistics: 'general_transport',
  equipment_supplies: 'equipment',
  field_operations_activities: 'meetings',
  internet_communication: 'communications',
  permits_taxes_legal: 'permits',
  management_overhead: 'other',
  contingency_reserve: 'other',
  // Legacy keys (kept for existing saved budgets)
  transportation_and_visit_fees: 'general_transport',
  permit_fee: 'permits',
  internet_and_communication_fees: 'communications',
  training: 'training',
  incentives: 'incentives',
  equipment: 'equipment',
  printing: 'printing',
  meetings: 'meetings',
  other: 'other',
};

// Human labels for budget category keys
const BUDGET_CAT_LABELS: Record<string, string> = {
  // New standardised keys
  personnel_labor_fees: 'Personnel & Labor Fees',
  transportation_logistics: 'Transportation & Logistics',
  equipment_supplies: 'Equipment & Supplies',
  field_operations_activities: 'Field Operations & Activities',
  internet_communication: 'Internet & Communication',
  permits_taxes_legal: 'Permits, Taxes & Legal Fees',
  management_overhead: 'Management & Overhead',
  contingency_reserve: 'Contingency / Reserve',
  // Legacy keys (kept for existing saved budgets)
  transportation_and_visit_fees: 'Transportation & Visit Fees',
  permit_fee: 'Permit Fees',
  internet_and_communication_fees: 'Internet & Communications',
  training: 'Training',
  incentives: 'Incentives',
  equipment: 'Equipment & Supplies',
  printing: 'Printing & Materials',
  meetings: 'Meetings & Events',
  other: 'Other',
  site_visits: 'Site Visits',
  transportation: 'Transportation',
  allowances: 'Allowances',
  supplies: 'Supplies',
  overhead: 'Overhead',
  field_operations: 'Field Operations',
  miscellaneous: 'Miscellaneous',
};

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  under_review: { label: 'Under Review', variant: 'outline' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  paid: { label: 'Paid', variant: 'default' },
  reconciled: { label: 'Reconciled', variant: 'default' },
};

const ADV_STATUS: Record<string, { label: string; cls: string }> = {
  pending:           { label: 'Pending',        cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  supervisor_review: { label: 'Supervisor',     cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  approved:          { label: 'Approved',       cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  partially_paid:    { label: 'Partial',        cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  fully_paid:        { label: 'Fully Paid',     cls: 'bg-green-100 text-green-700 border-green-200' },
  rejected:          { label: 'Rejected',       cls: 'bg-red-100 text-red-700 border-red-200' },
};

const PF_STATUS: Record<string, { label: string; cls: string }> = {
  draft:            { label: 'Draft',           cls: 'bg-slate-100 text-slate-600' },
  pending_approval: { label: 'Awaiting Approval', cls: 'bg-amber-100 text-amber-700' },
  awaiting_receipt: { label: 'Awaiting Receipt', cls: 'bg-sky-100 text-sky-700' },
  active:           { label: 'Active',          cls: 'bg-emerald-100 text-emerald-700' },
  low_balance:      { label: 'Low Balance',     cls: 'bg-orange-100 text-orange-700' },
  paused:           { label: 'Paused',          cls: 'bg-violet-100 text-violet-700' },
  closed:           { label: 'Closed',          cls: 'bg-slate-100 text-slate-500' },
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function getDerivedStatus(oc: OperationalCost): string {
  if (oc.reconciled_at) return 'reconciled';
  if (oc.paid_at) return 'paid';
  if (oc.tier2_status === 'approved') return 'approved';
  if (oc.tier2_status === 'rejected' || oc.tier1_status === 'rejected') return 'rejected';
  if (oc.tier1_status === 'approved') return 'under_review';
  return 'pending';
}

const fmt = (cents: number, cur = 'SDG') =>
  `${cur} ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

const fmtAmt = (amount: number, cur = 'SDG') =>
  `${cur} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

const safeDate = (s: string | null) => {
  if (!s) return '-';
  try { const d = parseISO(s); return isValid(d) ? format(d, 'dd MMM yyyy') : '-'; }
  catch { return '-'; }
};

/* ─── GL Bridge (Phase 5 enhanced) ──────────────────────────────────────── */
function GLBridgeSection({ projectId, projectName, costIds, advanceIds }: {
  projectId: string;
  projectName: string;
  costIds: string[];
  advanceIds: string[];
}) {
  const [glLines, setGlLines] = useState<GLLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchGL = async () => {
    setLoading(true);
    try {
      const allSourceIds = [
        projectId,
        ...costIds.slice(0, 80),
        ...advanceIds.slice(0, 20),
      ];

      const results = await Promise.allSettled([
        // By source_id (project, cost submissions, advances)
        supabase
          .from('acct_journal_entries')
          .select('id, entry_no, posting_date, description_en, source_type, status, acct_journal_lines(id, line_no, debit_credit, functional_amount, description, account_id, acct_accounts(code, name_en))')
          .in('source_id', allSourceIds.slice(0, 100))
          .in('status', ['posted', 'draft'])
          .order('posting_date', { ascending: false })
          .limit(300),
        // Phase 5: by project_id on journal lines (graceful — column may not exist yet)
        supabase
          .from('acct_journal_lines' as any)
          .select('id, line_no, debit_credit, functional_amount, description, posting_date, entry_no: acct_journal_entries(entry_no, posting_date, status), account_id, acct_accounts(code, name_en)')
          .eq('project_id' as any, projectId)
          .limit(200),
      ]);

      const seen = new Set<string>();
      const lines: GLLine[] = [];

      // Process result 0: journal entries by source_id
      if (results[0].status === 'fulfilled') {
        for (const je of ((results[0].value as any).data ?? []) as any[]) {
          for (const l of (je.acct_journal_lines ?? []) as any[]) {
            if (seen.has(l.id)) continue;
            seen.add(l.id);
            lines.push({
              id: l.id, line_no: l.line_no,
              debit_credit: l.debit_credit,
              functional_amount: Number(l.functional_amount ?? 0),
              description: l.description,
              posting_date: je.posting_date,
              entry_no: je.entry_no,
              account_code: l.acct_accounts?.code ?? '—',
              account_name: l.acct_accounts?.name_en ?? '—',
            });
          }
        }
      }

      // Process result 1: lines tagged with project_id (Phase 5 analytic dimension)
      if (results[1].status === 'fulfilled') {
        for (const l of ((results[1].value as any).data ?? []) as any[]) {
          if (seen.has(l.id)) continue;
          seen.add(l.id);
          const je = Array.isArray(l.acct_journal_entries) ? l.acct_journal_entries[0] : l.acct_journal_entries;
          if (je?.status && !['posted', 'draft'].includes(je.status)) continue;
          lines.push({
            id: l.id, line_no: l.line_no,
            debit_credit: l.debit_credit,
            functional_amount: Number(l.functional_amount ?? 0),
            description: l.description,
            posting_date: je?.posting_date ?? l.posting_date ?? '',
            entry_no: je?.entry_no ?? 0,
            account_code: l.acct_accounts?.code ?? '—',
            account_name: l.acct_accounts?.name_en ?? '—',
          });
        }
      }

      lines.sort((a, b) => b.posting_date.localeCompare(a.posting_date) || a.entry_no - b.entry_no);
      setGlLines(lines);
    } catch { /* GL tables may not exist in all environments */ }
    setLoading(false);
    setLoaded(true);
  };

  const totalDR = glLines.filter(l => l.debit_credit === 'DR').reduce((s, l) => s + l.functional_amount, 0);
  const totalCR = glLines.filter(l => l.debit_credit === 'CR').reduce((s, l) => s + l.functional_amount, 0);

  return (
    <Card data-testid="card-gl-bridge">
      <CardHeader className="p-4 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-indigo-500" />
            GL Journal Activity
          </CardTitle>
          <Button size="sm" variant="outline" onClick={fetchGL} disabled={loading} className="h-7 text-xs" data-testid="button-load-gl">
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            {loaded ? 'Refresh' : 'Load GL'}
          </Button>
        </div>
        {!loaded && (
          <p className="text-xs text-muted-foreground mt-1">
            Shows GL journal lines linked to this project, its cost submissions, and advances.
          </p>
        )}
      </CardHeader>
      {loaded && (
        <CardContent className="p-4 pt-0 space-y-3">
          {glLines.length === 0 ? (
            <div className="text-center text-muted-foreground text-xs py-6 border border-dashed rounded-lg">
              No GL journal entries found linked to this project. GL Bridge entries are created when costs or advances are posted through the Journals module.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border p-2.5">
                  <div className="text-muted-foreground">Total Debits</div>
                  <div className="font-bold text-sm mt-0.5 text-indigo-700 dark:text-indigo-400">
                    {totalDR.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="rounded-md border p-2.5">
                  <div className="text-muted-foreground">Total Credits</div>
                  <div className="font-bold text-sm mt-0.5 text-slate-700 dark:text-slate-300">
                    {totalCR.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">JE #</th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Account</th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Description</th>
                      <th className="text-right px-3 py-1.5 font-medium text-muted-foreground w-16">DR/CR</th>
                      <th className="text-right px-3 py-1.5 font-medium text-muted-foreground w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {glLines.map((l, i) => (
                      <tr key={l.id} className={`border-b ${i % 2 !== 0 ? 'bg-muted/10' : ''}`} data-testid={`row-gl-${l.id}`}>
                        <td className="px-3 py-1.5 whitespace-nowrap">{l.posting_date}</td>
                        <td className="px-3 py-1.5 font-mono">#{l.entry_no}</td>
                        <td className="px-3 py-1.5 max-w-[120px] truncate font-mono">{l.account_code}</td>
                        <td className="px-3 py-1.5 text-muted-foreground max-w-[160px] truncate">{l.description ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right">
                          <Badge variant="outline" className={`text-[10px] ${l.debit_credit === 'DR' ? 'text-indigo-700 border-indigo-300' : 'text-slate-600 border-slate-300'}`}>
                            {l.debit_credit}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {l.functional_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function ProjectCostTab({ projectId, projectName, budgetTotalCents, currency = 'SDG' }: ProjectCostTabProps) {
  const navigate = useNavigate();
  const { users } = useUser();

  // ── Operational costs
  const [costs, setCosts] = useState<OperationalCost[]>([]);
  const [costsLoading, setCostsLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // ── Advances (down-payment requests for this project)
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [advancesLoading, setAdvancesLoading] = useState(true);
  const [advancesOpen, setAdvancesOpen] = useState(true);

  // ── Pre-funding linked to this project
  const [preFunds, setPreFunds] = useState<PreFundRow[]>([]);
  const [preFundsLoading, setPreFundsLoading] = useState(true);
  const [preFundsOpen, setPreFundsOpen] = useState(true);

  // ── Budget category breakdown (Phase 4)
  const [budgetCatAlloc, setBudgetCatAlloc] = useState<Record<string, number>>({});

  /* ─── Fetch operational costs ─────────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    setCostsLoading(true);
    supabase
      .from('operational_cost_submissions')
      .select('id, expense_category, amount_cents, currency, description, expense_date, vendor, submitted_by, submitted_at, status, tier1_status, tier2_status, paid_at, reconciled_at, reconciled_amount_cents, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (alive) setCosts((data as OperationalCost[]) || []);
      })
      .finally(() => { if (alive) setCostsLoading(false); });
    return () => { alive = false; };
  }, [projectId]);

  /* ─── Fetch advances (down-payment requests) ──────────────────────────── */
  useEffect(() => {
    let alive = true;
    setAdvancesLoading(true);
    supabase
      .from('down_payment_requests')
      .select('id, status, requested_by, site_name, requested_amount, approved_amount, total_paid_amount, justification, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (alive) setAdvances((data as AdvanceRow[]) || []);
      })
      .finally(() => { if (alive) setAdvancesLoading(false); });
    return () => { alive = false; };
  }, [projectId]);

  /* ─── Fetch pre-funding linked to this project ────────────────────────── */
  useEffect(() => {
    let alive = true;
    setPreFundsLoading(true);
    supabase
      .from('pre_fund_requests')
      .select('id, name, source, amount, currency, available_balance, committed_amount, paid_amount, status, project_id, matching_scope, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (alive) setPreFunds((data as PreFundRow[]) || []);
      })
      .finally(() => { if (alive) setPreFundsLoading(false); });
    return () => { alive = false; };
  }, [projectId]);

  /* ─── Fetch budget category allocations ───────────────────────────────── */
  useEffect(() => {
    supabase
      .from('project_budgets')
      .select('category_allocations')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.category_allocations && typeof data.category_allocations === 'object') {
          setBudgetCatAlloc(data.category_allocations as Record<string, number>);
        }
      });
  }, [projectId]);

  /* ─── Derived stats ───────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const totalSubmitted = costs.reduce((s, c) => s + c.amount_cents, 0);
    const approvedSet = costs.filter(c => ['approved', 'paid', 'reconciled'].includes(getDerivedStatus(c)));
    const totalApproved = approvedSet.reduce((s, c) => s + c.amount_cents, 0);
    const totalPaid = costs.filter(c => ['paid', 'reconciled'].includes(getDerivedStatus(c))).reduce((s, c) => s + c.amount_cents, 0);
    const pendingCount = costs.filter(c => ['pending', 'under_review'].includes(getDerivedStatus(c))).length;
    const rejectedCount = costs.filter(c => getDerivedStatus(c) === 'rejected').length;
    const byCategory: Record<string, number> = {};
    costs.forEach(c => {
      const cat = c.expense_category || 'other';
      byCategory[cat] = (byCategory[cat] || 0) + c.amount_cents;
    });
    return { totalSubmitted, totalApproved, totalPaid, pendingCount, rejectedCount, byCategory, totalCount: costs.length };
  }, [costs]);

  /* ─── Phase 1: Accurate budget utilization (ops + advances + pre-fund) ── */
  const utilization = useMemo(() => {
    if (!budgetTotalCents || budgetTotalCents <= 0) return null;

    // Operational costs: approved+paid+reconciled
    const opsCents = stats.totalApproved;

    // Advances: fully paid (amounts stored as raw numbers, not cents)
    const advCents = advances
      .filter(a => ['fully_paid', 'partially_paid'].includes(a.status))
      .reduce((s, a) => s + (a.total_paid_amount || 0) * 100, 0);

    // Pre-funding disbursed (paid_amount in fund's currency; only include same currency)
    const pfCents = preFunds
      .filter(f => f.currency === currency)
      .reduce((s, f) => s + (f.paid_amount || 0) * 100, 0);

    const totalSpentCents = opsCents + advCents + pfCents;
    const pct = Math.min(100, (totalSpentCents / budgetTotalCents) * 100);
    return {
      pct,
      totalSpentCents,
      opsCents,
      advCents,
      pfCents,
      remainingCents: Math.max(0, budgetTotalCents - totalSpentCents),
    };
  }, [budgetTotalCents, stats.totalApproved, advances, preFunds, currency]);

  /* ─── Phase 4: Budget vs Actuals by category ─────────────────────────── */
  const categoryBreakdown = useMemo(() => {
    const catKeys = Object.keys(budgetCatAlloc).filter(k => (budgetCatAlloc[k] || 0) > 0);
    if (!catKeys.length) return [];

    return catKeys.map(budgetKey => {
      const budgetedCents = (budgetCatAlloc[budgetKey] || 0) * 100; // budget stored as currency units
      const expKey = BUDGET_CAT_TO_EXPENSE[budgetKey];
      const spentCents = expKey ? (stats.byCategory[expKey] || 0) : 0;
      const remainingCents = Math.max(0, budgetedCents - spentCents);
      const pct = budgetedCents > 0 ? Math.min(100, (spentCents / budgetedCents) * 100) : 0;
      return {
        key: budgetKey,
        label: BUDGET_CAT_LABELS[budgetKey] || budgetKey.replace(/_/g, ' '),
        budgetedCents,
        spentCents,
        remainingCents,
        pct,
      };
    }).sort((a, b) => b.spentCents - a.spentCents);
  }, [budgetCatAlloc, stats.byCategory]);

  /* ─── Helpers ─────────────────────────────────────────────────────────── */
  const getUserName = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return u?.name || u?.email || userId.slice(0, 8);
  };

  const filteredCosts = useMemo(() =>
    costs.filter(c => {
      if (categoryFilter !== 'all' && c.expense_category !== categoryFilter) return false;
      if (statusFilter !== 'all' && getDerivedStatus(c) !== statusFilter) return false;
      return true;
    }),
  [costs, categoryFilter, statusFilter]);

  const exportData = () => {
    exportToExcel(
      filteredCosts.map(c => ({
        Date: safeDate(c.expense_date || c.submitted_at),
        Category: EXPENSE_LABELS[c.expense_category] || c.expense_category,
        Description: c.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || '-',
        Vendor: c.vendor || '-',
        [`Amount (${currency})`]: (c.amount_cents / 100).toFixed(2),
        Status: STATUS_CONFIG[getDerivedStatus(c)]?.label || getDerivedStatus(c),
        'Submitted By': getUserName(c.submitted_by),
      })),
      'Project Costs',
      `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_costs.xlsx`,
    );
  };

  const loading = costsLoading;

  if (loading) {
    return (
      <div className="space-y-4 mt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="stat-total-submitted">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Total Submitted</span>
            </div>
            <p className="text-lg font-bold">{fmt(stats.totalSubmitted, currency)}</p>
            <p className="text-xs text-muted-foreground">{stats.totalCount} submissions</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-total-approved">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Approved</span>
            </div>
            <p className="text-lg font-bold text-green-600">{fmt(stats.totalApproved, currency)}</p>
            <p className="text-xs text-muted-foreground">{stats.pendingCount} pending</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-total-paid">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Paid Out</span>
            </div>
            <p className="text-lg font-bold text-emerald-600">{fmt(stats.totalPaid, currency)}</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-rejected">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Rejected</span>
            </div>
            <p className="text-lg font-bold text-red-600">{stats.rejectedCount}</p>
            <p className="text-xs text-muted-foreground">submissions</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Phase 1: Accurate Budget Utilization ────────────────────────── */}
      {budgetTotalCents && budgetTotalCents > 0 && (
        <Card data-testid="card-budget-utilization">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Budget Utilization</span>
              </div>
              <span className="text-sm font-bold">{utilization ? `${utilization.pct.toFixed(1)}%` : '0.0%'}</span>
            </div>
            <Progress
              value={utilization?.pct ?? 0}
              className={`h-3 ${(utilization?.pct ?? 0) > 90 ? '[&>*]:bg-red-500' : (utilization?.pct ?? 0) > 70 ? '[&>*]:bg-amber-500' : '[&>*]:bg-green-500'}`}
            />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>Total Spent: {fmt(utilization?.totalSpentCents ?? 0, currency)}</span>
              <span>Budget: {fmt(budgetTotalCents, currency)}</span>
            </div>
            {/* Breakdown sub-line */}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground border-t pt-2">
              <span className="flex items-center gap-1">
                <Receipt className="h-3 w-3 text-blue-400" />
                Operational: {fmt(utilization?.opsCents ?? 0, currency)}
              </span>
              {(utilization?.advCents ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <CreditCard className="h-3 w-3 text-indigo-400" />
                  Advances: {fmt(utilization!.advCents, currency)}
                </span>
              )}
              {(utilization?.pfCents ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Wallet className="h-3 w-3 text-emerald-400" />
                  Pre-Funding: {fmt(utilization!.pfCents, currency)}
                </span>
              )}
              <span className="ml-auto font-medium text-foreground">
                Remaining: {fmt(utilization?.remainingCents ?? budgetTotalCents, currency)}
              </span>
            </div>
            {(utilization?.pct ?? 0) > 90 && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Budget utilization is above 90% — review before approving more costs</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Phase 4: Budget vs Actuals by Category ──────────────────────── */}
      {categoryBreakdown.length > 0 && (
        <Card data-testid="card-budget-vs-actuals">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-indigo-500" />
              Budget vs Actuals by Category
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            {categoryBreakdown.map(row => (
              <div key={row.key} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{row.label}</span>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>Spent: <span className={`font-medium ${row.pct > 90 ? 'text-red-600' : row.pct > 70 ? 'text-amber-600' : 'text-foreground'}`}>{fmt(row.spentCents, currency)}</span></span>
                    <span>of {fmt(row.budgetedCents, currency)}</span>
                  </div>
                </div>
                <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${row.pct > 90 ? 'bg-red-500' : row.pct > 70 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{row.pct.toFixed(1)}% used</span>
                  <span>Remaining: {fmt(row.remainingCents, currency)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Spending by Category (from actual submissions) ───────────────── */}
      {Object.keys(stats.byCategory).length > 0 && (
        <Card data-testid="card-category-breakdown">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm font-semibold">Spending by Category</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="space-y-2">
              {Object.entries(stats.byCategory)
                .sort(([,a], [,b]) => b - a)
                .map(([cat, amount]) => (
                  <div key={cat} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{EXPENSE_LABELS[cat] || cat}</span>
                    <span className="font-mono font-medium">{fmt(amount, currency)}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Operational Cost Submissions ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(EXPENSE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={exportData} data-testid="button-export-costs">
          <Download className="h-4 w-4 mr-1.5" />
          Export
        </Button>
        <Button size="sm" onClick={() => navigate(`/cost-submission?project_id=${projectId}`)} data-testid="button-go-cost-submission">
          <ExternalLink className="h-4 w-4 mr-1.5" />
          Cost Submissions
        </Button>
      </div>

      {filteredCosts.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg border-border">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-muted mb-4">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">No cost submissions</h3>
          <p className="text-muted-foreground mt-1 max-w-md mx-auto">
            {costs.length === 0
              ? 'No operational costs have been submitted for this project yet'
              : 'No submissions match the current filters'}
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Submitted By</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCosts.map(cost => {
                    const status = getDerivedStatus(cost);
                    const cfg = STATUS_CONFIG[status] || { label: status, variant: 'outline' as const };
                    return (
                      <TableRow key={cost.id} data-testid={`row-cost-${cost.id}`}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {safeDate(cost.expense_date || cost.submitted_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {EXPENSE_LABELS[cost.expense_category] || cost.expense_category}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">
                          {cost.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || '-'}
                        </TableCell>
                        <TableCell className="text-sm">{getUserName(cost.submitted_by)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {fmt(cost.amount_cents, cost.currency || currency)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Phase 2: Advances & Down-Payments ───────────────────────────── */}
      <Card data-testid="card-advances">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-indigo-500" />
              Advances & Down-Payments
              {advances.length > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5">{advances.length}</Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => navigate(`/down-payment-approval?project_id=${projectId}`)}
                data-testid="button-go-advances"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                View All / Add New
              </Button>
              <button onClick={() => setAdvancesOpen(o => !o)} className="text-muted-foreground hover:text-foreground">
                {advancesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </CardHeader>
        {advancesOpen && (
          <CardContent className="p-4 pt-0">
            {advancesLoading ? (
              <div className="space-y-2">
                {[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : advances.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
                No advances or down-payments linked to this project.
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => navigate(`/down-payment-approval?project_id=${projectId}`)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Request Advance
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Summary row */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: 'Total Requested', val: advances.reduce((s, a) => s + a.requested_amount, 0) },
                    { label: 'Total Paid', val: advances.reduce((s, a) => s + a.total_paid_amount, 0) },
                    { label: 'Pending/Approved', val: advances.filter(a => ['pending','supervisor_review','approved'].includes(a.status)).reduce((s, a) => s + a.requested_amount, 0) },
                  ].map(kpi => (
                    <div key={kpi.label} className="rounded-md border p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                      <p className="text-sm font-bold mt-0.5">{fmtAmt(kpi.val, currency)}</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Requested By</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Site / Purpose</th>
                        <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Requested</th>
                        <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Paid</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advances.map((a, i) => {
                        const sc = ADV_STATUS[a.status] ?? { label: a.status, cls: 'bg-slate-100 text-slate-600' };
                        return (
                          <tr key={a.id} className={`border-b ${i % 2 !== 0 ? 'bg-muted/10' : ''}`} data-testid={`row-advance-${a.id}`}>
                            <td className="px-3 py-1.5 whitespace-nowrap">{safeDate(a.created_at)}</td>
                            <td className="px-3 py-1.5">{getUserName(a.requested_by)}</td>
                            <td className="px-3 py-1.5 max-w-[140px] truncate text-muted-foreground">
                              {a.site_name || a.justification?.slice(0, 40) || '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtAmt(a.requested_amount, currency)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{fmtAmt(a.total_paid_amount, currency)}</td>
                            <td className="px-3 py-1.5">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${sc.cls}`}>
                                {sc.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Phase 3: Pre-Funding (Donor Advances) ───────────────────────── */}
      <Card data-testid="card-prefunding">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-500" />
              Pre-Funding (Donor Advances)
              {preFunds.length > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5">{preFunds.length}</Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => navigate(`/pre-funding?tab=registry&project_id=${projectId}`)}
                data-testid="button-go-prefunding"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                View / Manage
              </Button>
              <button onClick={() => setPreFundsOpen(o => !o)} className="text-muted-foreground hover:text-foreground">
                {preFundsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </CardHeader>
        {preFundsOpen && (
          <CardContent className="p-4 pt-0">
            {preFundsLoading ? (
              <div className="space-y-2">
                {[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : preFunds.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
                No pre-funding linked to this project.
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => navigate(`/pre-funding?tab=registry&project_id=${projectId}`)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Link Pre-Funding
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Pre-fund summary */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: 'Total Committed', val: preFunds.reduce((s, f) => s + f.amount, 0), cur: preFunds[0]?.currency ?? currency },
                    { label: 'Disbursed', val: preFunds.reduce((s, f) => s + f.paid_amount, 0), cur: preFunds[0]?.currency ?? currency },
                    { label: 'Available Balance', val: preFunds.reduce((s, f) => s + f.available_balance, 0), cur: preFunds[0]?.currency ?? currency },
                  ].map(kpi => (
                    <div key={kpi.label} className="rounded-md border p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                      <p className="text-sm font-bold mt-0.5">{fmtAmt(kpi.val, kpi.cur)}</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Fund Name</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Source / Donor</th>
                        <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Total</th>
                        <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Disbursed</th>
                        <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Balance</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preFunds.map((f, i) => {
                        const sc = PF_STATUS[f.status] ?? { label: f.status, cls: 'bg-slate-100 text-slate-600' };
                        return (
                          <tr key={f.id} className={`border-b ${i % 2 !== 0 ? 'bg-muted/10' : ''}`} data-testid={`row-prefund-${f.id}`}>
                            <td className="px-3 py-1.5 font-medium max-w-[140px] truncate">{f.name}</td>
                            <td className="px-3 py-1.5 text-muted-foreground max-w-[120px] truncate">{f.source || '—'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtAmt(f.amount, f.currency)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{fmtAmt(f.paid_amount, f.currency)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                              {fmtAmt(f.available_balance, f.currency)}
                            </td>
                            <td className="px-3 py-1.5">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${sc.cls}`}>
                                {sc.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Phase 5: GL Bridge (enhanced with advances + project_id dim) ── */}
      <GLBridgeSection
        projectId={projectId}
        projectName={projectName}
        costIds={costs.map(c => c.id)}
        advanceIds={advances.map(a => a.id)}
      />
    </div>
  );
}
