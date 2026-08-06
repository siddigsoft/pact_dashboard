/**
 * ProjectBudgetTab — Comprehensive budget management inside the project detail page.
 * Features: KPI cards, approval workflow, category utilization bars, Budget vs Actuals chart,
 * spending-rate forecast, pre-fund integration, donor fund tags, Excel export.
 */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  CheckCircle2, Clock, AlertTriangle, TrendingDown, Wallet, DollarSign,
  FileDown, FileText, Send, ThumbsUp, Loader2, RefreshCw, Zap, ClipboardList,
} from 'lucide-react';
import { format, differenceInDays, addDays } from 'date-fns';
import { exportFormattedExcel } from '@/utils/formattedExcelExport';
import { exportBudgetPDF } from '@/utils/budgetPdfExport';
import { dispatchNotification } from '@/lib/notify';
import type { ProjectBudget } from '@/types/budget';
import type { Project, ProjectTeamMember } from '@/types/project';
import { calcMemberTotalCost, totalPaidFromInstallments } from '@/types/project';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface OpsCost {
  id: string;
  expense_category: string;
  amount_cents: number;
  currency: string;
  status: string;
  tier1_status?: string;
  tier2_status?: string;
  expense_date: string;
  description?: string;
}
interface Advance {
  id: string;
  status: string;
  total_paid_amount: number;
  requested_amount: number;
  site_name?: string;
  created_at: string;
}
interface PreFundRow {
  id: string;
  name: string;
  amount: number;
  currency: string;
  available_balance: number;
  committed_amount: number;
  paid_amount: number;
  status: string;
  created_at: string;
}

/* ─── Category helpers ───────────────────────────────────────────────── */
/** Maps ops-cost expense_category values → canonical project_budgets category keys */
const EXPENSE_TO_BUDGET: Record<string, string> = {
  // transportation
  transport: 'transportation_logistics',
  transportation: 'transportation_logistics',
  vehicle: 'transportation_logistics',
  site_visits: 'transportation_logistics',
  // permits / legal
  permit: 'permits_taxes_legal',
  permits: 'permits_taxes_legal',
  locality_permit: 'permits_taxes_legal',
  permit_fee: 'permits_taxes_legal',
  // internet / comms
  internet: 'internet_communication',
  communication: 'internet_communication',
  communications: 'internet_communication',
  internet_and_communication_fees: 'internet_communication',
  // field ops
  accommodation: 'field_operations_activities',
  hotel: 'field_operations_activities',
  meals: 'field_operations_activities',
  food: 'field_operations_activities',
  per_diem: 'field_operations_activities',
  training: 'field_operations_activities',
  meetings: 'field_operations_activities',
  catering: 'field_operations_activities',
  // equipment / supplies
  equipment: 'equipment_supplies',
  supplies: 'equipment_supplies',
  supply: 'equipment_supplies',
  materials: 'equipment_supplies',
  printing: 'equipment_supplies',
  // personnel / labor
  professional_fees: 'personnel_labor_fees',
  consultancy: 'personnel_labor_fees',
  consultant: 'personnel_labor_fees',
  labor: 'personnel_labor_fees',
  personnel: 'personnel_labor_fees',
  enumerator_fees: 'personnel_labor_fees',
  supervisor_fees: 'personnel_labor_fees',
  facilitator_fees: 'personnel_labor_fees',
  evaluation_team_fees: 'personnel_labor_fees',
  // overhead
  overhead: 'management_overhead',
  management: 'management_overhead',
  // contingency
  miscellaneous: 'contingency_reserve',
  other: 'contingency_reserve',
};

/** Human-readable labels for every canonical + legacy category key */
const CATEGORY_LABELS: Record<string, string> = {
  // canonical keys (project_budgets.category_allocations standard set)
  personnel_labor_fees:          'Personnel & Labor Fees',
  transportation_logistics:      'Transportation & Logistics',
  equipment_supplies:            'Equipment & Supplies',
  field_operations_activities:   'Field Operations & Activities',
  internet_communication:        'Internet & Communication',
  permits_taxes_legal:           'Permits, Taxes & Legal',
  management_overhead:           'Management & Overhead',
  contingency_reserve:           'Contingency / Reserve',
  // legacy keys kept for backward compat
  professional_fees:             'Personnel & Labor Fees',
  transportation_and_visit_fees: 'Transportation & Visits',
  permit_fee:                    'Permit Fees',
  internet_and_communication_fees: 'Internet & Comms',
  accommodation:                 'Accommodation',
  meals:                         'Meals',
  equipment:                     'Equipment',
  training:                      'Training',
  supplies:                      'Supplies',
  other:                         'Other',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft:     { label: 'Draft',     color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: Clock },
  submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: Send },
  approved:  { label: 'Approved',  color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: CheckCircle2 },
  active:    { label: 'Active',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: Zap },
  exceeded:  { label: 'Exceeded',  color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: AlertTriangle },
  closed:    { label: 'Closed',    color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', icon: CheckCircle2 },
};

/* ─── Props ──────────────────────────────────────────────────────────── */
interface ProjectBudgetTabProps {
  project: Project;
  projectBudget: ProjectBudget;
  /** From project.budget JSONB (set at creation) */
  budgetSummary: { total: number; currency: string; allocated: number; remaining: number; expenseCurrency?: string } | null;
  onRefresh: () => void;
  onEditBudget: () => void;
  currentUserId?: string;
  isAdmin?: boolean;
  projectManagerId?: string;
  /** Team composition from projects.team.teamComposition — used to include professional fees in budget */
  teamComposition?: ProjectTeamMember[];
}

/* ─── Component ──────────────────────────────────────────────────────── */
export function ProjectBudgetTab({
  project,
  projectBudget,
  budgetSummary,
  onRefresh,
  onEditBudget,
  currentUserId,
  isAdmin,
  projectManagerId,
  teamComposition = [],
}: ProjectBudgetTabProps) {
  const currency = budgetSummary?.currency || 'SDG';
  const fmt = (cents: number) =>
    `${currency} ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  /* ── Data fetching ── */
  const [opsCosts, setOpsCosts] = useState<OpsCost[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [preFunds, setPreFunds] = useState<PreFundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // OBR (Operational Budget Requests) linked to this project
  interface OBRSummaryRow { id: string; title: string; period_label: string; status: string; total_amount: number; currency: string; submitted_at: string | null }
  const [obrRequests, setObrRequests] = useState<OBRSummaryRow[]>([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const [opsRes, advRes, pfRes, obrRes] = await Promise.all([
        supabase.from('operational_cost_submissions')
          .select('id,expense_category,amount_cents,currency,status,tier1_status,tier2_status,expense_date,description')
          .eq('project_id', project.id),
        supabase.from('down_payment_requests')
          .select('id,status,total_paid_amount,requested_amount,site_name,created_at')
          .eq('project_id', project.id),
        supabase.from('pre_fund_requests')
          .select('id,name,amount,currency,available_balance,committed_amount,paid_amount,status,created_at')
          .eq('project_id', project.id),
        supabase.from('operational_budget_requests' as any)
          .select('id,title,period_label,status,total_amount,currency,submitted_at')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false }),
      ]);
      if (!alive) return;
      setOpsCosts(opsRes.data ?? []);
      setAdvances(advRes.data ?? []);
      setPreFunds(pfRes.data ?? []);
      setObrRequests((obrRes.data ?? []) as OBRSummaryRow[]);
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [project.id]);

  // Realtime: refresh OBRs when any budget request for this project changes
  useEffect(() => {
    const ch = supabase.channel(`pbt_obr_${project.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operational_budget_requests', filter: `project_id=eq.${project.id}` }, () => {
        supabase.from('operational_budget_requests' as any)
          .select('id,title,period_label,status,total_amount,currency,submitted_at')
          .eq('project_id', project.id).order('created_at', { ascending: false })
          .then(({ data }) => setObrRequests((data ?? []) as OBRSummaryRow[]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [project.id]);

  /* ── Spending calculations ── */
  const projectBudgetForFees = budgetSummary?.total || project.budget?.total || 0;

  const { totalSpentCents, opsCents, advCents, pfCents, teamFeePaidCents } = useMemo(() => {
    const opsCents = opsCosts
      .filter(c => {
        const s = (c.tier2_status || c.tier1_status || c.status || '').toLowerCase();
        return ['approved', 'paid', 'reconciled', 'tier2_approved'].some(x => s.includes(x));
      })
      .reduce((s, c) => s + (c.amount_cents || 0), 0);
    const advCents = advances
      .filter(a => ['fully_paid', 'partially_paid'].includes(a.status))
      .reduce((s, a) => s + Math.round((a.total_paid_amount || 0) * 100), 0);
    const pfCents = preFunds
      .reduce((s, p) => s + Math.round((p.paid_amount || 0) * 100), 0);

    // Team composition professional fees (paid portion only)
    const teamFeePaidCents = teamComposition.reduce((sum, member) => {
      if (!member.feeType) return sum;
      const memberTotal = calcMemberTotalCost(member, projectBudgetForFees);
      if (memberTotal <= 0) return sum;
      const memberTotalCents = Math.round(memberTotal * 100);
      const status = member.paymentStatus || 'unpaid';
      if (status === 'paid') return sum + memberTotalCents;
      if (status === 'partially_paid') {
        const paidAmt = totalPaidFromInstallments(member.installments || []) || (member.amountPaid || 0);
        return sum + Math.round(paidAmt * 100);
      }
      return sum;
    }, 0);

    return { totalSpentCents: opsCents + advCents + pfCents + teamFeePaidCents, opsCents, advCents, pfCents, teamFeePaidCents };
  }, [opsCosts, advances, preFunds, teamComposition, projectBudgetForFees]);

  const totalBudgetCents = projectBudget.totalBudgetCents;
  const remainingCents = Math.max(totalBudgetCents - totalSpentCents, 0);
  const utilizationPct = totalBudgetCents > 0 ? (totalSpentCents / totalBudgetCents) * 100 : 0;

  const committedCents = preFunds
    .filter(p => ['active', 'awaiting_receipt'].includes(p.status))
    .reduce((s, p) => s + Math.round((p.committed_amount || 0) * 100), 0);

  /* ── Category breakdown ── */
  const categoryBreakdown = useMemo(() => {
    // Start with a mutable copy of stored allocations, normalising legacy keys
    const LEGACY_TO_CANONICAL: Record<string, string> = {
      professional_fees: 'personnel_labor_fees',
      personnel_fees: 'personnel_labor_fees',
      transportation_and_visit_fees: 'transportation_logistics',
      permit_fee: 'permits_taxes_legal',
      internet_and_communication_fees: 'internet_communication',
      accommodation: 'field_operations_activities',
      meals: 'field_operations_activities',
      equipment: 'equipment_supplies',
      supplies: 'equipment_supplies',
      training: 'field_operations_activities',
      other: 'contingency_reserve',
    };
    const allocs: Record<string, number> = {};
    Object.entries(projectBudget.categoryAllocations || {}).forEach(([k, v]) => {
      const canonical = LEGACY_TO_CANONICAL[k] ?? k;
      if (typeof v === 'number' && v > 0) allocs[canonical] = (allocs[canonical] || 0) + v;
    });

    // Inject team fee totals into personnel_labor_fees allocation when not already covered
    const teamFeeTotalCents = teamComposition.reduce((sum, member) => {
      if (!member.feeType) return sum;
      return sum + Math.round(calcMemberTotalCost(member, projectBudgetForFees) * 100);
    }, 0);
    if (teamFeeTotalCents > 0) {
      // Use the larger of the explicit allocation or the sum of team fees
      allocs['personnel_labor_fees'] = Math.max(allocs['personnel_labor_fees'] || 0, teamFeeTotalCents);
    }

    // Actuals from operational cost submissions (approved / paid)
    const actuals: Record<string, number> = {};
    opsCosts.forEach(c => {
      const raw = (c.expense_category || '').toLowerCase();
      const budgetKey = EXPENSE_TO_BUDGET[raw] || LEGACY_TO_CANONICAL[raw] || raw;
      if (budgetKey) actuals[budgetKey] = (actuals[budgetKey] || 0) + (c.amount_cents || 0);
    });

    // Add paid team fees to actuals under personnel_labor_fees
    if (teamFeePaidCents > 0) {
      actuals['personnel_labor_fees'] = (actuals['personnel_labor_fees'] || 0) + teamFeePaidCents;
    }

    const cats = new Set([...Object.keys(allocs), ...Object.keys(actuals)]);
    return Array.from(cats).map(cat => {
      const budgeted = allocs[cat] || 0;
      const spent = actuals[cat] || 0;
      const pct = budgeted > 0 ? Math.min((spent / budgeted) * 100, 100) : 0;
      return { cat, label: CATEGORY_LABELS[cat] || cat, budgeted, spent, pct };
    }).filter(r => r.budgeted > 0 || r.spent > 0).sort((a, b) => b.budgeted - a.budgeted);
  }, [projectBudget.categoryAllocations, opsCosts, teamComposition, projectBudgetForFees, teamFeePaidCents]);

  /* ── Spending rate forecast ── */
  const forecast = useMemo(() => {
    const startDate = project.startDate ? new Date(project.startDate) : new Date(projectBudget.createdAt || Date.now());
    const now = new Date();
    const daysElapsed = Math.max(differenceInDays(now, startDate), 1);
    const burnRatePerDay = totalSpentCents / daysElapsed;
    if (burnRatePerDay < 1) return null;
    const daysToRunOut = remainingCents / burnRatePerDay;
    const forecastDate = addDays(now, daysToRunOut);
    return {
      burnRatePerDay,
      daysToRunOut: Math.round(daysToRunOut),
      forecastDate,
      onTrack: project.endDate ? forecastDate <= new Date(project.endDate) : true,
    };
  }, [totalSpentCents, remainingCents, project.startDate, project.endDate, projectBudget.createdAt]);

  /* ── Approval actions ── */
  const handleSubmitForApproval = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from('project_budgets')
        .update({ status: 'submitted', updated_at: new Date().toISOString() })
        .eq('id', projectBudget.id);
      if (error) throw error;
      if (isAdmin && currentUserId) {
        await dispatchNotification({
          event: 'budget_submitted_for_approval',
          recipientIds: [currentUserId],
          titleEn: 'Budget Submitted for Approval',
          titleAr: 'تم تقديم الميزانية للاعتماد',
          messageEn: `Budget for "${project.name}" has been submitted for approval.`,
          messageAr: `تم تقديم ميزانية "${project.name}" للاعتماد.`,
          entityType: 'project_budget',
          entityId: projectBudget.id,
          sendEmail: true,
        });
      }
      onRefresh();
    } catch (e) {
      console.error('Submit for approval error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveBudget = async () => {
    setApproving(true);
    try {
      const { error } = await supabase.from('project_budgets')
        .update({
          status: 'approved',
          approved_by: currentUserId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectBudget.id);
      if (error) throw error;
      if (projectManagerId) {
        await dispatchNotification({
          event: 'budget_approved',
          recipientIds: [projectManagerId],
          titleEn: 'Budget Approved',
          titleAr: 'تمت الموافقة على الميزانية',
          messageEn: `The budget for project "${project.name}" has been approved.`,
          messageAr: `تمت الموافقة على ميزانية مشروع "${project.name}".`,
          entityType: 'project_budget',
          entityId: projectBudget.id,
          sendEmail: true,
        });
      }
      onRefresh();
    } catch (e) {
      console.error('Approve budget error:', e);
    } finally {
      setApproving(false);
    }
  };

  /* ── PDF export ── */
  const handleExportPDF = () => {
    exportBudgetPDF({
      projectName:      project.name,
      projectCode:      project.id?.slice(0, 8).toUpperCase(),
      budgetStatus:     projectBudget.status,
      budgetPeriod:     projectBudget.budgetPeriod || 'project_lifetime',
      fiscalYear:       projectBudget.fiscalYear,
      currency,
      expenseCurrency:  budgetSummary?.expenseCurrency,
      totalBudgetCents,
      totalSpentCents,
      opsCents,
      advCents,
      pfCents,
      categoryBreakdown,
      forecast,
    });
  };

  /* ── Excel export ── */
  const handleExport = () => {
    exportFormattedExcel({
      reportTitle:   `PACT Command Center — ${project.name} Project Budget`,
      subtitleLine:  `Status: ${projectBudget.status?.toUpperCase()} | Period: ${projectBudget.budgetPeriod?.replace('_', ' ')} | Currency: ${currency} | Generated: ${format(new Date(), 'MMMM d, yyyy')}`,
      metaLine:      `Total Budget: ${currency} ${(totalBudgetCents / 100).toLocaleString()} | Spent: ${currency} ${(totalSpentCents / 100).toLocaleString()} | Remaining: ${currency} ${(remainingCents / 100).toLocaleString()} | Utilization: ${utilizationPct.toFixed(1)}%`,
      filenamePrefix: `${project.name.replace(/\s+/g, '_')}_Budget`,
      mainSheet: {
        sheetName: 'Category Breakdown',
        headers:   ['Category', `Budgeted (${currency})`, `Spent (${currency})`, `Remaining (${currency})`, 'Utilization %'],
        rows: categoryBreakdown.map(r => [
          r.label,
          r.budgeted / 100,
          r.spent / 100,
          (r.budgeted - r.spent) / 100,
          r.pct.toFixed(1) + '%',
        ]),
        totalsRow: [
          'TOTAL',
          totalBudgetCents / 100,
          totalSpentCents / 100,
          remainingCents / 100,
          utilizationPct.toFixed(1) + '%',
        ],
        colWidths: [28, 20, 20, 20, 16],
      },
      summarySheet: {
        title: `${project.name} — Budget Summary`,
        rows: [
          ['Metric', 'Value'],
          ['Project', project.name],
          ['Budget Status', projectBudget.status],
          ['Budget Period', projectBudget.budgetPeriod?.replace('_', ' ')],
          ['Fiscal Year', projectBudget.fiscalYear ? `FY ${projectBudget.fiscalYear}` : '—'],
          ['Currency', currency],
          ['', ''],
          ['Total Budget', `${currency} ${(totalBudgetCents / 100).toLocaleString()}`],
          ['Total Spent', `${currency} ${(totalSpentCents / 100).toLocaleString()}`],
          ['Remaining', `${currency} ${(remainingCents / 100).toLocaleString()}`],
          ['Utilization', `${utilizationPct.toFixed(1)}%`],
          ['', ''],
          ['Spending Source', `${currency} Amount`],
          ['Operational Costs', `${currency} ${(opsCents / 100).toLocaleString()}`],
          ['Advances / Down-payments', `${currency} ${(advCents / 100).toLocaleString()}`],
          ['Pre-fund Disbursements', `${currency} ${(pfCents / 100).toLocaleString()}`],
        ],
        colWidths: [30, 24],
      },
      breakdownSheets: preFunds.length > 0 ? [{
        title:     `${project.name} — Pre-Fund Requests`,
        sheetName: 'Pre-Fund Requests',
        headers:   ['Name', `Amount (${currency})`, `Paid (${currency})`, `Committed (${currency})`, `Available (${currency})`, 'Status'],
        rows: preFunds.map(p => [p.name, p.amount, p.paid_amount, p.committed_amount, p.available_balance, p.status]),
        colWidths: [32, 18, 18, 18, 18, 16],
      }] : [],
    });
  };

  /* ── Status badge ── */
  const statusCfg = STATUS_CONFIG[projectBudget.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusCfg.icon;

  const chartData = categoryBreakdown.map(r => ({
    name: r.label.length > 14 ? r.label.slice(0, 13) + '…' : r.label,
    Budgeted: Math.round(r.budgeted / 100),
    Spent: Math.round(r.spent / 100),
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header row ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg.color}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {statusCfg.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {projectBudget.budgetPeriod?.replace('_', ' ')}
            {projectBudget.fiscalYear ? ` · FY ${projectBudget.fiscalYear}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Approval workflow — only privileged roles can UPDATE project_budgets */}
          {projectBudget.status === 'draft' && isAdmin && (
            <Button size="sm" variant="outline" onClick={handleSubmitForApproval} disabled={submitting} data-testid="button-submit-approval">
              {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Submit for Approval
            </Button>
          )}
          {projectBudget.status === 'submitted' && isAdmin && (
            <Button size="sm" onClick={handleApproveBudget} disabled={approving} className="bg-green-600 hover:bg-green-700 text-white" data-testid="button-approve-budget">
              {approving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />}
              Approve Budget
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onEditBudget} data-testid="button-edit-budget-tab">
            Edit Budget
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportPDF} data-testid="button-export-budget-pdf">
            <FileText className="h-3.5 w-3.5 mr-1.5" /> Export PDF
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport} data-testid="button-export-budget">
            <FileDown className="h-3.5 w-3.5 mr-1.5" /> Export Excel
          </Button>
          <Button size="sm" variant="ghost" onClick={onRefresh} data-testid="button-refresh-budget">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Budget</p>
            <p className="text-lg font-bold">{fmt(totalBudgetCents)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{currency} · {projectBudget.budgetPeriod?.replace('_', ' ')}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Spent</p>
            <p className={`text-lg font-bold ${utilizationPct >= 100 ? 'text-red-600' : utilizationPct >= 80 ? 'text-amber-600' : 'text-foreground'}`}>
              {fmt(totalSpentCents)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{utilizationPct.toFixed(1)}% utilised</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Remaining</p>
            <p className={`text-lg font-bold ${remainingCents <= 0 ? 'text-red-600' : 'text-green-600 dark:text-green-400'}`}>
              {fmt(remainingCents)}
            </p>
            <Progress value={Math.min(utilizationPct, 100)} className="h-1.5 mt-2" />
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Pre-fund Committed</p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{fmt(committedCents)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{preFunds.length} active fund{preFunds.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Spending breakdown mini-row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        {[
          { label: 'Operational Costs', cents: opsCents, color: 'text-purple-600 dark:text-purple-400' },
          { label: 'Advances / Down-payments', cents: advCents, color: 'text-orange-600 dark:text-orange-400' },
          { label: 'Pre-fund Disbursed', cents: pfCents, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Team Fees (Paid)', cents: teamFeePaidCents, color: 'text-emerald-600 dark:text-emerald-400' },
        ].map(({ label, cents, color }) => (
          <div key={label} className="rounded-lg border border-border/50 px-3 py-2.5 bg-muted/30">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={`font-semibold mt-0.5 ${color}`}>{fmt(cents)}</p>
          </div>
        ))}
      </div>

      {/* ── Category bars + Pre-fund list ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Category utilization */}
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Budget by Category</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {categoryBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No category allocations defined.</p>
            ) : (
              categoryBreakdown.map(r => (
                <div key={r.cat}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{r.label}</span>
                    <span className={`text-xs font-semibold ${r.pct >= 100 ? 'text-red-500' : r.pct >= 80 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      {fmt(r.spent)} / {fmt(r.budgeted)}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(r.pct, 100)}
                    className={`h-2 ${r.pct >= 100 ? '[&>div]:bg-red-500' : r.pct >= 80 ? '[&>div]:bg-amber-500' : ''}`}
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{r.pct.toFixed(1)}% used</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Pre-fund requests */}
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-blue-500" />
              Pre-fund Requests
              {preFunds.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{preFunds.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {preFunds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pre-fund requests linked to this project.</p>
            ) : (
              <div className="space-y-2.5">
                {preFunds.map(pf => {
                  const pfStatus = pf.status;
                  const paid = Math.round(pf.paid_amount * 100);
                  const total = Math.round(pf.amount * 100);
                  const pct = total > 0 ? (paid / total) * 100 : 0;
                  return (
                    <div key={pf.id} className="rounded-md border border-border/50 px-3 py-2.5 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate">{pf.name}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0 ml-2">
                          {pfStatus}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                        <span>Total: <strong>{pf.currency} {pf.amount.toLocaleString()}</strong></span>
                        <span>Paid: <strong className="text-blue-600 dark:text-blue-400">{pf.currency} {pf.paid_amount.toLocaleString()}</strong></span>
                        <span>Balance: <strong className="text-green-600 dark:text-green-400">{pf.currency} {pf.available_balance.toLocaleString()}</strong></span>
                      </div>
                      <Progress value={Math.min(pct, 100)} className="h-1.5 mt-1.5" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Budget vs Actuals chart ── */}
      {chartData.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Budget vs Actuals by Category ({currency})</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                <Tooltip formatter={(v: number) => `${currency} ${v.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Budgeted" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Spent" fill="#f97316" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Spending rate forecast ── */}
      {forecast && (
        <Card className={`border ${forecast.onTrack ? 'border-green-200 dark:border-green-800 bg-green-50/40 dark:bg-green-950/20' : 'border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20'}`}>
          <CardContent className="px-4 py-3 flex flex-wrap items-center gap-4">
            <TrendingDown className={`h-5 w-5 shrink-0 ${forecast.onTrack ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${forecast.onTrack ? 'text-green-800 dark:text-green-300' : 'text-amber-800 dark:text-amber-300'}`}>
                {forecast.onTrack ? 'Budget on track' : 'Budget may run out before project end'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Burn rate: {fmt(Math.round(forecast.burnRatePerDay))} / day ·
                Estimated run-out: <strong>{format(forecast.forecastDate, 'dd MMM yyyy')}</strong>
                {forecast.daysToRunOut > 0 ? ` (${forecast.daysToRunOut} days)` : ' (overrun)'}
                {project.endDate && (
                  <> · Project end: {format(new Date(project.endDate), 'dd MMM yyyy')}</>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Operational Budget Requests (OBR) linked to this project ── */}
      {(() => {
        const obrApprovedCents  = obrRequests.filter(r => r.status === 'approved').reduce((s, r) => s + (r.total_amount || 0), 0) * 100;
        const obrPendingCents   = obrRequests.filter(r => r.status === 'submitted').reduce((s, r) => s + (r.total_amount || 0), 0) * 100;
        const STATUS_OBR: Record<string, { label: string; color: string }> = {
          draft:     { label: 'Draft',     color: 'bg-slate-100 text-slate-600' },
          submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-700' },
          approved:  { label: 'Approved',  color: 'bg-emerald-100 text-emerald-700' },
          rejected:  { label: 'Rejected',  color: 'bg-red-100 text-red-700' },
          cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500' },
        };
        return (
          <Card className="border-border/60">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4 text-[#0F2041] dark:text-blue-400" />
                Budget Requests (OBR)
                {obrRequests.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{obrRequests.length}</Badge>
                )}
                <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                  <a href="/budget-requests" className="underline hover:text-foreground">Manage →</a>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {/* Totals summary */}
              {obrRequests.length > 0 && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 px-3 py-2">
                    <div className="text-muted-foreground">Approved OBRs</div>
                    <div className="font-bold text-emerald-700 dark:text-emerald-400">
                      {currency} {(obrApprovedCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div className="rounded border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 px-3 py-2">
                    <div className="text-muted-foreground">Pending OBRs</div>
                    <div className="font-bold text-blue-700 dark:text-blue-400">
                      {currency} {(obrPendingCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
              )}
              {obrRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No budget requests linked to this project yet.{' '}
                  <a href="/budget-requests" className="underline text-primary">Create one →</a>
                </p>
              ) : (
                <div className="space-y-2">
                  {obrRequests.map(r => {
                    const sc = STATUS_OBR[r.status] ?? STATUS_OBR.draft;
                    return (
                      <div key={r.id} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 bg-muted/20">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium truncate">{r.title}</span>
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${sc.color}`}>
                              {sc.label}
                            </span>
                          </div>
                          {r.period_label && <div className="text-[10px] text-muted-foreground mt-0.5">{r.period_label}</div>}
                        </div>
                        <div className="text-xs font-semibold text-right shrink-0 ml-2">
                          {r.currency} {(r.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Budget notes ── */}
      {projectBudget.budgetNotes && (
        <div className="rounded-md border border-border/50 px-4 py-3 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Budget Notes</p>
          <p className="text-sm">{projectBudget.budgetNotes}</p>
        </div>
      )}
    </div>
  );
}
