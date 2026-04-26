import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  format, parseISO, isValid, differenceInDays, addDays,
  startOfToday, isBefore, isAfter,
} from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend, LineChart, Line, AreaChart, Area,
} from 'recharts';
import {
  Briefcase, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  Loader2, RefreshCw, ChevronRight, Flag, DollarSign, Users,
  BarChart2, ArrowUpDown, Search, ExternalLink, ChevronDown, ChevronUp,
  Circle, Target, Activity, Zap, Calendar, ShieldAlert, Package,
  Handshake, FileText, CreditCard, UserCheck, Building2, ArrowRight,
  Receipt, TrendingDown, Star, MapPin, Globe, Siren, BadgeDollarSign,
  Wallet, FileWarning, Timer, ClipboardList, AlertCircle, CheckSquare,
  LayoutDashboard, FolderPlus, Download, Filter,
  Layers, BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { normaliseProjectType } from '@/types/project';
import { getProjectFlow } from '@/config/projectFlows';
import { useAuthorization } from '@/hooks/use-authorization';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDurationFromMs, medianMs } from '@/utils/duration';
import { isTerminalCompletionRawStatus } from '@/utils/siteCompletionStatus';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string; name: string; project_code: string; project_type: string;
  status: string; start_date: string | null; end_date: string | null;
  current_flow_stage: string | null; team: { projectManager?: string } | null;
  client_type: string | null; client_name: string | null;
  budget: { total?: number; currency?: string; totalBudgetCents?: number; spentBudgetCents?: number } | null;
  archived: boolean | null;
  partner_id: string | null;
  crm_opportunity_id: string | null;
}
interface BudgetRow { project_id: string; total_budget_cents: number; allocated_budget_cents: number; spent_budget_cents: number; remaining_budget_cents: number; }
interface MilestoneRow { id: string; project_id: string; title: string; status: string; due_date: string | null; updated_at: string | null; }
interface FlowLogRow { project_id: string; advanced_at: string; }
interface MmpRow { id: string; status: string; entries: number | null; processed_entries: number | null; hub: string | null; month: number | null; }
interface SiteEntryRow { id: string; status: string; mmp_file_id: string; hub_office: string | null; dispatched_at: string | null; completed_at: string | null; updated_at: string | null; }
interface CostSubRow { id: string; status: string; total_cost_cents: number | null; }
interface DownPayRow { id: string; status: string; requested_amount: number | null; supervisor_status: string | null; admin_status: string | null; }
interface OpCostRow { id: string; status: string; amount_cents: number | null; tier1_status: string | null; tier2_status: string | null; }
interface ProfileRow { id: string; full_name: string | null; role: string | null; employment_type: string | null; status: string | null; department_id: string | null; contract_end_date: string | null; }
interface DeptRow { id: string; name: string; manager_user_id: string | null; parent_department_id: string | null; }
interface LeaveRow { id: string; user_id: string; leave_type: string; start_date: string; end_date: string | null; status: string; }
interface IncidentRow { id: string; title: string; severity: string; status: string; date_reported: string | null; }
interface EquipRow { id: string; name: string; category: string | null; status: string; location: string | null; }
interface CrmPartnerRow { id: string; name: string; type: string | null; status: string | null; }
interface CrmOpptyRow { id: string; title: string; value_usd: number | null; stage: string; expected_close_date: string | null; }
interface PayrollRunRow { id: string; status: string; period_start: string | null; period_end: string | null; total_gross_cents: number | null; created_at: string; }
interface TaskRow { id: string; title: string; status: string; priority: string | null; due_date: string | null; assigned_to: string | null; assigned_to_name: string | null; user_id: string | null; department_id: string | null; updated_at: string | null; created_at: string; }
interface ProjectFieldTaskRow { id: string; project_id: string; title: string; status: string; priority: string | null; assigned_to: string | null; due_date: string | null; created_at: string; updated_at: string | null; }
interface TimesheetRow { id: string; user_id: string; week_start: string; status: string; total_hours: number | null; }
interface SubscriptionRow { id: string; name: string; status: string; monthly_cost_cents: number | null; renewal_date: string | null; }

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

const STALL_DAYS = 14;
const BRAND = '#0F2041';
const BRAND2 = '#1D3461';

const SITE_VERIFIED_STATUSES = new Set(['verified', 'approved', 'approved and costed', 'costed', 'dispatched', 'completed']);
const SITE_IN_PROGRESS_STATUSES = new Set(['in_progress', 'inprogress', 'accepted', 'forwarded', 'forwarded_to_fom', 'forwarded_to_coordinator', 'forwarded_to_coordinators']);
const SITE_RETURNED_STATUSES = new Set(['returned_to_fom', 'returned', 'recalled', 'sent_back', 'sent_back_to_fom']);
const SITE_REJECTED_STATUSES = new Set(['rejected']);
const SITE_PENDING_STATUSES = new Set(['pending', 'assigned', 'open', 'available', 'unassigned', 'scheduled', 'visit_scheduled']);

type SiteStatusBucket = 'verified' | 'inProgress' | 'returned' | 'rejected' | 'pending' | 'other';
function classifySiteEntryStatus(raw: string | null | undefined): SiteStatusBucket {
  const s = (raw ?? '').toString().toLowerCase().trim();
  if (!s) return 'pending';
  if (SITE_VERIFIED_STATUSES.has(s)) return 'verified';
  if (SITE_IN_PROGRESS_STATUSES.has(s)) return 'inProgress';
  if (SITE_RETURNED_STATUSES.has(s)) return 'returned';
  if (SITE_REJECTED_STATUSES.has(s)) return 'rejected';
  if (SITE_PENDING_STATUSES.has(s)) return 'pending';
  return 'other';
}

const ROLE_CANONICAL_LABELS: Record<string, string> = {
  datacollector: 'Data Collector',
  data_collector: 'Data Collector',
  data_team: 'Data Team',
  superadmin: 'Super Admin',
  super_admin: 'Super Admin',
  fom: 'FOM',
};
function normalizeRoleKey(raw: string | null | undefined): string {
  return (raw ?? '').toString().toLowerCase().replace(/[\s\-]+/g, '_').replace(/__+/g, '_').trim();
}
function prettyRoleLabel(key: string): string {
  if (ROLE_CANONICAL_LABELS[key]) return ROLE_CANONICAL_LABELS[key];
  const collapsed = key.replace(/_/g, ' ').trim();
  return collapsed.replace(/\b\w/g, c => c.toUpperCase());
}

const TYPE_LABELS: Record<string, string> = {
  tpm: 'TPM', baseline_survey: 'Baseline Survey', endline_survey: 'Endline Survey',
  assessment: 'Assessment', evaluation: 'Evaluation', research: 'Research',
  capacity_building: 'Capacity Building', compliance: 'Compliance',
  infrastructure: 'Infrastructure', other: 'Other',
};
const STATUS_CFG: Record<string, { label: string; dot: string; badge: string }> = {
  active:    { label: 'Active',    dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  draft:     { label: 'Draft',     dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600' },
  onHold:    { label: 'On Hold',   dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', dot: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700' },
  cancelled: { label: 'Cancelled', dot: 'bg-red-500',     badge: 'bg-red-100 text-red-700' },
};
type HealthSignal = 'on-track' | 'at-risk' | 'stalled' | 'completed' | 'draft';
const HEALTH_CFG: Record<HealthSignal, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  'on-track':  { label: 'On Track',  bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  'at-risk':   { label: 'At Risk',   bg: 'bg-amber-100 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300',   icon: <AlertTriangle className="h-3 w-3" /> },
  'stalled':   { label: 'Stalled',   bg: 'bg-red-100 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300',       icon: <Clock className="h-3 w-3" /> },
  'completed': { label: 'Closed',    bg: 'bg-slate-100 dark:bg-slate-800',         text: 'text-slate-500',                       icon: <Circle className="h-3 w-3" /> },
  'draft':     { label: 'Draft',     bg: 'bg-slate-100 dark:bg-slate-800',         text: 'text-slate-500',                       icon: <Circle className="h-3 w-3" /> },
};
const SEVERITY_CFG: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-700' },
  high:     { bg: 'bg-orange-100', text: 'text-orange-700' },
  medium:   { bg: 'bg-amber-100', text: 'text-amber-700' },
  low:      { bg: 'bg-blue-100', text: 'text-blue-700' },
};
const CRM_STAGE_CFG: Record<string, { label: string; color: string }> = {
  prospect:    { label: 'Prospect',    color: '#94a3b8' },
  proposal:    { label: 'Proposal',    color: '#60a5fa' },
  negotiation: { label: 'Negotiation', color: '#f59e0b' },
  won:         { label: 'Won',         color: '#34d399' },
  lost:        { label: 'Lost',        color: '#f87171' },
};

function safeDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  try { const d = parseISO(s); return isValid(d) ? d : null; } catch { return null; }
}
function fmtDate(s: string | null | undefined) { const d = safeDate(s); return d ? format(d, 'dd MMM yyyy') : '—'; }
function fmtMoney(cents: number, currency = 'SDG'): string {
  if (cents >= 1_000_000_000) return `${currency} ${(cents / 1_000_000_000).toFixed(1)}B`;
  if (cents >= 1_000_000) return `${currency} ${(cents / 1_000_000).toFixed(1)}M`;
  if (cents >= 1_000) return `${currency} ${(cents / 1_000).toFixed(0)}K`;
  return `${currency} ${cents.toFixed(0)}`;
}
function fmtUSD(v: number | null | undefined): string {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function getBudget(p: ProjectRow, budgetMap: Record<string, BudgetRow>): { total: number; spent: number } {
  const db = budgetMap[p.id];
  if (db) return { total: db.total_budget_cents ?? 0, spent: db.spent_budget_cents ?? 0 };
  const jb = p.budget;
  if (jb?.totalBudgetCents != null) return { total: jb.totalBudgetCents, spent: jb.spentBudgetCents ?? 0 };
  if (jb?.total != null) return { total: jb.total * 100, spent: 0 };
  return { total: 0, spent: 0 };
}
function getHealth(p: ProjectRow, lastAdvanced: Record<string, string>): HealthSignal {
  if (p.status === 'completed' || p.status === 'cancelled') return 'completed';
  if (p.status === 'draft') return 'draft';
  const last = lastAdvanced[p.id];
  if (last) { const d = safeDate(last); if (d && differenceInDays(new Date(), d) > STALL_DAYS) return 'stalled'; }
  if (p.end_date) { const end = safeDate(p.end_date); if (end && isBefore(end, new Date())) return 'at-risk'; }
  return 'on-track';
}

// RAG (Red/Amber/Green) status per spec:
// Timeline: Red = past end date, Amber = within 2 weeks of end, Green = on track
// Budget: Red = >20% over budget, Amber = 10-20% over, Green = under 10% over
// Stall: Red = 14+ days no activity
type RAGStatus = 'red' | 'amber' | 'green' | 'grey';
interface RAGResult {
  overall: RAGStatus;
  timeline: RAGStatus;
  budget: RAGStatus;
  stall: RAGStatus;
  isStalled: boolean;
  daysOverdue: number;
  budgetVariancePct: number;
}
function getRAGStatus(p: ProjectRow, budgetMap: Record<string, BudgetRow>, lastAdvanced: Record<string, string>): RAGResult {
  if (p.status === 'completed' || p.status === 'cancelled') {
    return { overall: 'grey', timeline: 'grey', budget: 'grey', stall: 'grey', isStalled: false, daysOverdue: 0, budgetVariancePct: 0 };
  }
  const today = new Date();
  // Timeline
  let timeline: RAGStatus = 'green';
  let daysOverdue = 0;
  if (p.end_date) {
    const end = safeDate(p.end_date);
    if (end) {
      if (isBefore(end, today)) {
        daysOverdue = differenceInDays(today, end);
        timeline = 'red';
      } else if (differenceInDays(end, today) <= 14) {
        timeline = 'amber';
      }
    }
  }
  // Budget
  let budget: RAGStatus = 'green';
  let budgetVariancePct = 0;
  const db = budgetMap[p.id];
  if (db && db.total_budget_cents > 0) {
    const variance = ((db.spent_budget_cents - db.total_budget_cents) / db.total_budget_cents) * 100;
    budgetVariancePct = variance;
    if (variance > 20) budget = 'red';
    else if (variance > 10) budget = 'amber';
  }
  // Stall
  let stall: RAGStatus = 'green';
  let isStalled = false;
  const last = lastAdvanced[p.id];
  if (last) {
    const d = safeDate(last);
    if (d && differenceInDays(today, d) >= STALL_DAYS) {
      stall = 'red';
      isStalled = true;
    }
  }
  // Overall = worst
  const rank = (s: RAGStatus) => s === 'red' ? 3 : s === 'amber' ? 2 : s === 'green' ? 1 : 0;
  const worst = [timeline, budget, stall].reduce((a, b) => rank(a) >= rank(b) ? a : b);
  return { overall: worst, timeline, budget, stall, isStalled, daysOverdue, budgetVariancePct };
}
function getFlowProgress(p: ProjectRow): { current: number; total: number; stageName: string } {
  const flow = getProjectFlow(normaliseProjectType(p.project_type));
  const stages = flow.stages;
  if (!stages.length) return { current: 0, total: 0, stageName: '—' };
  const idx = p.current_flow_stage ? stages.findIndex(s => s.id === p.current_flow_stage) : -1;
  return { current: idx >= 0 ? idx + 1 : 0, total: stages.length, stageName: idx >= 0 ? (stages[idx]?.label ?? '—') : 'Not started' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const [
    { data: projectsRaw },
    { data: budgetsRaw },
    { data: milestonesRaw },
    { data: flowLogRaw },
    { data: mmpRaw },
    { data: siteEntriesRaw },
    { data: costSubsRaw },
    { data: downPaysRaw },
    { data: opCostsRaw },
    { data: profilesRaw },
    { data: deptsRaw },
    { data: leavesRaw },
    { data: incidentsRaw },
    { data: equipRaw },
    { data: crmPartnersRaw },
    { data: crmOpptysRaw },
    { data: payrollRunsRaw },
    { data: tasksRaw },
    { data: timesheetsRaw },
    { data: subscriptionsRaw },
    { data: projectFieldTasksRaw },
  ] = await Promise.all([
    supabase.rpc('get_projects_for_analytics'),
    supabase.from('project_budgets').select('project_id, total_budget_cents, allocated_budget_cents, spent_budget_cents, remaining_budget_cents'),
    supabase.from('project_milestones').select('id, project_id, title, status, due_date, updated_at').order('due_date', { ascending: true }),
    supabase.from('project_flow_log').select('project_id, advanced_at').order('advanced_at', { ascending: false }),
    supabase.from('mmp_files').select('id, status, entries, processed_entries, hub, month').order('created_at', { ascending: false }),
    supabase.from('mmp_site_entries').select('id, status, mmp_file_id, hub_office, dispatched_at, completed_at, updated_at'),
    supabase.from('site_visit_cost_submissions').select('id, status, total_cost_cents').limit(5000),
    supabase.from('down_payment_requests').select('id, status, requested_amount, supervisor_status, admin_status').limit(5000),
    supabase.from('operational_cost_submissions').select('id, status, amount_cents, tier1_status, tier2_status').limit(5000),
    supabase.from('profiles').select('id, full_name, role, employment_type, status, department_id, contract_end_date').limit(300),
    supabase.from('departments').select('id, name, manager_user_id, parent_department_id'),
    supabase.from('leave_requests').select('id, user_id, leave_type, start_date, end_date, status').limit(200),
    supabase.from('incident_reports').select('id, title, severity, status, date_reported').order('date_reported', { ascending: false }).limit(100),
    supabase.from('equipment').select('id, name, category, status, location').limit(200),
    supabase.from('crm_partners').select('id, name, type, status'),
    supabase.from('crm_opportunities').select('id, title, value_usd, stage, expected_close_date').order('expected_close_date', { ascending: true }),
    supabase.from('payroll_runs').select('id, status, period_start, period_end, total_gross_cents, created_at').order('created_at', { ascending: false }).limit(6),
    supabase.from('personal_tasks').select('id, title, status, priority, due_date, assigned_to, assigned_to_name, user_id, department_id, updated_at, created_at').limit(1000),
    supabase.from('timesheets').select('id, user_id, week_start, status, total_hours').order('week_start', { ascending: false }).limit(500),
    supabase.from('organizational_subscriptions').select('id, name, status, monthly_cost_cents, renewal_date').limit(200),
    supabase.from('project_field_tasks').select('id, project_id, title, status, priority, assigned_to, due_date, created_at, updated_at').limit(500),
  ]);

  const latestAdvanced: Record<string, string> = {};
  for (const row of (flowLogRaw ?? []) as FlowLogRow[]) {
    if (!latestAdvanced[row.project_id]) latestAdvanced[row.project_id] = row.advanced_at;
  }

  return {
    projects: (projectsRaw ?? []) as ProjectRow[],
    budgets: (budgetsRaw ?? []) as BudgetRow[],
    milestones: (milestonesRaw ?? []) as MilestoneRow[],
    latestAdvanced,
    mmps: (mmpRaw ?? []) as MmpRow[],
    siteEntries: (siteEntriesRaw ?? []) as SiteEntryRow[],
    costSubs: (costSubsRaw ?? []) as CostSubRow[],
    downPays: (downPaysRaw ?? []) as DownPayRow[],
    opCosts: (opCostsRaw ?? []) as OpCostRow[],
    profiles: (profilesRaw ?? []) as ProfileRow[],
    depts: (deptsRaw ?? []) as DeptRow[],
    leaves: (leavesRaw ?? []) as LeaveRow[],
    incidents: (incidentsRaw ?? []) as IncidentRow[],
    equip: (equipRaw ?? []) as EquipRow[],
    crmPartners: (crmPartnersRaw ?? []) as CrmPartnerRow[],
    crmOpptys: (crmOpptysRaw ?? []) as CrmOpptyRow[],
    payrollRuns: (payrollRunsRaw ?? []) as PayrollRunRow[],
    tasks: (tasksRaw ?? []) as TaskRow[],
    timesheets: (timesheetsRaw ?? []) as TimesheetRow[],
    subscriptions: (subscriptionsRaw ?? []) as SubscriptionRow[],
    projectFieldTasks: (projectFieldTasksRaw ?? []) as ProjectFieldTaskRow[],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small reusable widgets
// ─────────────────────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, icon: Icon, color, urgent, onClick, actionLabel }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; urgent?: boolean;
  onClick?: () => void; actionLabel?: string;
}) {
  const inner = (
    <div className={cn(
      'bg-white/10 rounded-xl p-3 border border-white/10 flex flex-col h-full',
      urgent && 'border-red-400/50 bg-red-900/20',
      onClick && 'cursor-pointer hover:bg-white/20 transition-colors group',
    )}>
      <div className={cn('text-2xl font-bold leading-none', color, urgent && 'text-red-300')}>{value}</div>
      <div className="text-white/80 text-[11px] font-medium mt-1 flex items-center gap-1">
        <Icon className="h-3 w-3 flex-shrink-0" />{label}
      </div>
      {sub && <div className="text-blue-300/60 text-[10px] mt-0.5">{sub}</div>}
      {onClick && (
        <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1 text-[10px] font-semibold text-white/50 group-hover:text-white/80 transition-colors">
          <ChevronRight className="h-2.5 w-2.5" />
          {actionLabel ?? 'View details'}
        </div>
      )}
    </div>
  );
  return onClick ? <button type="button" onClick={onClick} className="text-left w-full h-full">{inner}</button> : inner;
}

function SectionCard({ icon: Icon, title, action, actionLabel, children, noPad }: {
  icon: React.ElementType; title: string; action?: () => void; actionLabel?: string;
  children: React.ReactNode; noPad?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/20">
        <div className="h-7 w-7 rounded-lg bg-[#1D3461]/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-3.5 w-3.5 text-[#1D3461]" />
        </div>
        <span className="text-sm font-bold flex-1">{title}</span>
        {action && (
          <button onClick={action} className="text-[11px] text-[#1D3461] hover:underline flex items-center gap-1 flex-shrink-0">
            {actionLabel ?? 'View all'}<ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className={noPad ? '' : 'p-4'}>{children}</div>
    </div>
  );
}

function ApprovalBadge({ count, label, urgent }: { count: number; label: string; urgent?: boolean }) {
  if (count === 0) return null;
  return (
    <div className={cn('flex items-center justify-between py-2 px-3 rounded-xl border', urgent ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800/40' : 'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800/40')}>
      <span className={cn('text-xs font-medium', urgent ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300')}>{label}</span>
      <span className={cn('text-sm font-bold px-2 py-0.5 rounded-lg', urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>{count}</span>
    </div>
  );
}

function StatRow({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className={cn('text-sm font-bold', color ?? 'text-foreground')}>{value}</span>
        {sub && <span className="text-[10px] text-muted-foreground ml-1.5">{sub}</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone Timeline Component
// ─────────────────────────────────────────────────────────────────────────────

const GANTT_HEALTH_COLOR: Record<string, string> = {
  'on-track': '#22c55e',
  'at-risk':  '#f59e0b',
  'stalled':  '#ef4444',
  completed:  '#94a3b8',
  draft:      '#cbd5e1',
};

interface EnrichedProject {
  id: string; name: string; project_code: string;
  start_date: string | null; end_date: string | null;
  health: HealthSignal; status: string;
}

function MilestoneTimeline({
  milestones, projects, onNavigate,
}: {
  milestones: MilestoneRow[];
  projects: EnrichedProject[];
  onNavigate: (projectId: string) => void;
}) {
  const today = startOfToday();

  // Build per-project rows: one bar per active project, with milestone markers on it
  const rows = useMemo(() => {
    const active = projects.filter(p =>
      p.status !== 'archived' && p.status !== 'cancelled' && (p.start_date || p.end_date)
    ).slice(0, 15);

    return active.map(p => {
      const start  = safeDate(p.start_date);
      const end    = safeDate(p.end_date);
      const pMilestones = milestones
        .filter(m => m.project_id === p.id && m.due_date)
        .map(m => {
          const due = safeDate(m.due_date)!;
          const isCompleted = m.status === 'completed';
          const isOverdue  = isBefore(due, today) && !isCompleted;
          // actualDate: when a completed milestone was actually done (updated_at proxy)
          const actualDate = isCompleted && m.updated_at ? safeDate(m.updated_at) : null;
          return { ...m, due, isOverdue, isCompleted, actualDate };
        });
      return { project: p, start, end, milestones: pMilestones };
    }).filter(r => r.start || r.end);
  }, [projects, milestones, today]);

  if (!rows.length) return null;

  // Global date span across all project start/end dates + milestone dates
  const allDates: Date[] = [today];
  rows.forEach(r => {
    if (r.start) allDates.push(r.start);
    if (r.end)   allDates.push(r.end);
    r.milestones.forEach(m => allDates.push(m.due));
  });
  const minDate = allDates.reduce((a, b) => isBefore(a, b) ? a : b);
  const maxDate = allDates.reduce((a, b) => isAfter(a, b)  ? a : b);
  const spanDays = Math.max(differenceInDays(maxDate, minDate) + 1, 30);

  const toPct = (d: Date) =>
    Math.max(0, Math.min(100, (differenceInDays(d, minDate) / spanDays) * 100));
  const todayPct = toPct(today);

  return (
    <SectionCard icon={Flag} title="Project Timeline" noPad>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 600 }} className="p-4 space-y-2">
          {/* Header ruler */}
          <div className="flex gap-2 mb-3 pl-[176px] pr-14">
            <div className="flex-1 flex justify-between text-[9px] text-muted-foreground select-none">
              <span>{format(minDate, 'dd MMM yy')}</span>
              <span className="font-semibold text-[#1D3461]">Today ({format(today, 'dd MMM')})</span>
              <span>{format(maxDate, 'dd MMM yy')}</span>
            </div>
          </div>

          {/* One row per project */}
          {rows.map(({ project: p, start, end, milestones: ms }) => {
            const barLeft  = start ? toPct(start) : 0;
            const barRight = end   ? 100 - toPct(end) : 0;
            const barWidth = Math.max(1, 100 - barLeft - barRight);
            const barColor = GANTT_HEALTH_COLOR[p.health] ?? '#1D3461';
            const isCompleted = p.status === 'completed';
            return (
              <div key={p.id} className="flex items-center gap-2">
                {/* Project label */}
                <button
                  onClick={() => onNavigate(p.id)}
                  className="w-[172px] flex-shrink-0 text-right pr-2 hover:underline"
                  title={p.name}
                >
                  <p className="text-[10px] font-semibold text-foreground truncate">{p.name}</p>
                  <p className="text-[9px] text-muted-foreground">{p.project_code}</p>
                </button>

                {/* Gantt track */}
                <div className="flex-1 relative h-7 bg-muted/20 rounded">
                  {/* Today line */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-[#1D3461]/50 z-20 pointer-events-none"
                    style={{ left: `${todayPct}%` }}
                  />
                  {/* Project bar */}
                  <div
                    className="absolute top-1.5 bottom-1.5 rounded transition-all"
                    style={{
                      left:  `${barLeft}%`,
                      width: `${barWidth}%`,
                      backgroundColor: isCompleted ? '#94a3b8' : barColor,
                      opacity: 0.35,
                    }}
                    title={`${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}`}
                  />
                  {/* Milestone markers on the bar: planned (diamond) + actual (dot) */}
                  {ms.map(m => {
                    const plannedPct = toPct(m.due);
                    const mColor = m.isCompleted ? '#94a3b8' : m.isOverdue ? '#ef4444' : differenceInDays(m.due, today) <= 7 ? '#f59e0b' : barColor;
                    const actualPct = m.actualDate ? toPct(m.actualDate) : null;
                    const isEarly  = actualPct != null && actualPct < plannedPct;
                    const isLate   = actualPct != null && actualPct > plannedPct + 1;
                    return (
                      <div key={m.id}>
                        {/* Planned due date — hollow diamond */}
                        <div
                          className="absolute top-0 bottom-0 flex items-center z-10"
                          style={{ left: `${plannedPct}%` }}
                          title={`Planned: ${fmtDate(m.due_date)} — ${m.title}`}
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-sm rotate-45 border-2 border-white"
                            style={{ backgroundColor: mColor, marginLeft: '-5px' }}
                          />
                        </div>
                        {/* Actual completion date — solid green circle (only for completed) */}
                        {actualPct != null && (
                          <div
                            className="absolute top-0 bottom-0 flex items-center z-10"
                            style={{ left: `${actualPct}%` }}
                            title={`Actual: ${fmtDate(m.updated_at)} — ${isLate ? 'late' : isEarly ? 'early' : 'on time'}`}
                          >
                            <div
                              className="w-2 h-2 rounded-full border border-white"
                              style={{ backgroundColor: isLate ? '#ef4444' : '#22c55e', marginLeft: '-4px' }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Health badge */}
                <span className="text-[9px] font-bold w-12 text-right flex-shrink-0" style={{ color: isCompleted ? '#94a3b8' : barColor }}>
                  {p.health.replace('-', ' ')}
                </span>
              </div>
            );
          })}

          {/* Legend */}
          <div className="flex items-center gap-4 pt-2 pl-[176px] flex-wrap">
            {[['on-track','#22c55e'],['at-risk','#f59e0b'],['stalled','#ef4444'],['completed','#94a3b8']].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-sm inline-block rotate-45" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
            <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span className="inline-block w-2.5 h-2.5 rounded-sm rotate-45 border-2 border-white bg-[#ef4444]" />
              planned milestone
            </span>
            <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-full bg-[#22c55e]" />
              actual (completed)
            </span>
            <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-full bg-[#ef4444]" />
              actual (late)
            </span>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function PortfolioDashboard() {
  const navigate = useNavigate();
  const { hasAnyRole, isSuperAdmin } = useAuthorization();
  const canFinance = hasAnyRole(['super_admin', 'admin', 'finance', 'fom', 'financial_admin']);

  // Access control: only Country Director, Super Admin, Admin, PM can access executive view
  const canAccessExecutive = isSuperAdmin() || hasAnyRole([
    'super_admin', 'superAdmin', 'admin', 'Admin', 'country_director', 'countryDirector',
    'projectManager', 'project_manager',
  ]);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['portfolio_csuite'],
    queryFn: async () => {
      const result = await fetchAll();
      setLastUpdated(new Date());
      setSecondsAgo(0);
      return result;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!lastUpdated) return;
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 5000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  const defaultTab = (isSuperAdmin() || hasAnyRole([
    'super_admin', 'superAdmin', 'Admin', 'admin', 'CEO', 'COO', 'CTO',
    'country_director', 'countryDirector',
  ])) ? 'executive' : 'overview';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState('all');
  const [projectSort, setProjectSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'health', dir: 'asc' });

  // Global filters for executive view
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterProjectType, setFilterProjectType] = useState('all');
  const [filterClient, setFilterClient] = useState('all');


  const d = data;
  const projects = d?.projects ?? [];
  const milestones = d?.milestones ?? [];
  const latestAdvanced = d?.latestAdvanced ?? {};

  const budgetMap = useMemo(() => {
    const m: Record<string, BudgetRow> = {};
    (d?.budgets ?? []).forEach(b => { m[b.project_id] = b; });
    return m;
  }, [d?.budgets]);

  // Enriched projects
  const enriched = useMemo(() => projects
    .filter(p => !p.archived)
    .map(p => {
      const budget = getBudget(p, budgetMap);
      const burnPct = budget.total > 0 ? Math.round((budget.spent / budget.total) * 100) : 0;
      const flow = getFlowProgress(p);
      const health = getHealth(p, latestAdvanced);
      const rag = getRAGStatus(p, budgetMap, latestAdvanced);
      const overdueMilestones = milestones.filter(m =>
        m.project_id === p.id && m.status !== 'completed' && m.due_date && isBefore(parseISO(m.due_date), new Date())
      ).length;
      const nextMilestone = milestones.find(m =>
        m.project_id === p.id && m.status !== 'completed' && m.due_date && isAfter(parseISO(m.due_date), new Date())
      );
      return { ...p, budget, burnPct, flow, health, rag, overdueMilestones, nextMilestone };
    }), [projects, budgetMap, milestones, latestAdvanced]);

  // ── Executive View: Filtered dataset ─────────────────────────────────────

  // All unique client names for filter dropdown
  const clientOptions = useMemo(() => {
    const names = new Set<string>();
    projects.forEach(p => { if (p.client_name) names.add(p.client_name); });
    return Array.from(names).sort();
  }, [projects]);

  // Apply global executive filters
  const execFiltered = useMemo(() => {
    return enriched.filter(p => {
      if (filterProjectType !== 'all' && normaliseProjectType(p.project_type) !== filterProjectType) return false;
      if (filterClient !== 'all' && p.client_name !== filterClient) return false;
      if (filterDateFrom) {
        const start = safeDate(p.start_date);
        if (start && isBefore(start, safeDate(filterDateFrom)!)) return false;
      }
      if (filterDateTo) {
        const end = safeDate(p.end_date);
        if (end && isAfter(end, safeDate(filterDateTo)!)) return false;
      }
      return true;
    });
  }, [enriched, filterProjectType, filterClient, filterDateFrom, filterDateTo]);

  // ── Business Pipeline ────────────────────────────────────────────────────
  const businessPipeline = useMemo(() => {
    const opptys = d?.crmOpptys ?? [];
    const prospectVal = opptys.filter(o => o.stage === 'prospect').reduce((s, o) => s + (o.value_usd ?? 0), 0);
    const proposalVal = opptys.filter(o => o.stage === 'proposal').reduce((s, o) => s + (o.value_usd ?? 0), 0);
    const negotiationVal = opptys.filter(o => o.stage === 'negotiation').reduce((s, o) => s + (o.value_usd ?? 0), 0);
    const wonVal = opptys.filter(o => o.stage === 'won').reduce((s, o) => s + (o.value_usd ?? 0), 0);
    const activeProjectVal = execFiltered
      .filter(p => p.status === 'active')
      .reduce((s, p) => s + (p.budget.total / 100), 0);
    const completedProjectVal = execFiltered
      .filter(p => p.status === 'completed')
      .reduce((s, p) => s + (p.budget.total / 100), 0);
    const funnelData = [
      { name: 'Prospect', value: prospectVal, count: opptys.filter(o => o.stage === 'prospect').length, fill: '#94a3b8' },
      { name: 'Proposal', value: proposalVal, count: opptys.filter(o => o.stage === 'proposal').length, fill: '#60a5fa' },
      { name: 'Negotiation', value: negotiationVal, count: opptys.filter(o => o.stage === 'negotiation').length, fill: '#f59e0b' },
      { name: 'Won', value: wonVal, count: opptys.filter(o => o.stage === 'won').length, fill: '#34d399' },
    ].filter(s => s.value > 0 || s.count > 0);
    const stageBarData = [
      { stage: 'Prospect', value: prospectVal, count: opptys.filter(o => o.stage === 'prospect').length, fill: '#94a3b8' },
      { stage: 'Proposal', value: proposalVal, count: opptys.filter(o => o.stage === 'proposal').length, fill: '#60a5fa' },
      { stage: 'Negotiation', value: negotiationVal, count: opptys.filter(o => o.stage === 'negotiation').length, fill: '#f59e0b' },
      { stage: 'Won (CRM)', value: wonVal, count: opptys.filter(o => o.stage === 'won').length, fill: '#34d399' },
      { stage: 'Active Projects', value: activeProjectVal, count: execFiltered.filter(p => p.status === 'active').length, fill: '#1D3461' },
      { stage: 'Completed', value: completedProjectVal, count: execFiltered.filter(p => p.status === 'completed').length, fill: '#a78bfa' },
    ];
    const totalPipelineValue = opptys.filter(o => !['won','lost'].includes(o.stage)).reduce((s,o)=>s+(o.value_usd??0),0);
    return { funnelData, stageBarData, prospectVal, proposalVal, negotiationVal, wonVal, activeProjectVal, completedProjectVal, totalPipelineValue, topOpptys: opptys.filter(o => !['won','lost'].includes(o.stage)).sort((a,b)=>(b.value_usd??0)-(a.value_usd??0)).slice(0,5) };
  }, [d, execFiltered]);

  // ── Delivery Health ──────────────────────────────────────────────────────
  const deliveryHealth = useMemo(() => {
    const today = new Date();
    const active = execFiltered.filter(p => p.status === 'active' || p.status === 'onHold');
    const ragCounts = { red: 0, amber: 0, green: 0, grey: 0 };
    active.forEach(p => { ragCounts[p.rag.overall]++; });
    const stalledList = active.filter(p => p.rag.isStalled);
    const overdueList = active.filter(p => p.rag.timeline === 'red');
    const overBudgetList = active.filter(p => p.rag.budget === 'red');

    const enrichedActive = active.map(p => {
      const lastAdv = latestAdvanced[p.id];
      const lastActivityDate = lastAdv ? safeDate(lastAdv) : null;
      const lastActivityDays = lastActivityDate ? differenceInDays(today, lastActivityDate) : null;
      const endDate = safeDate(p.end_date);
      const startDate = safeDate(p.start_date);
      const daysLeft = endDate ? differenceInDays(endDate, today) : null;
      let timelinePct = 0;
      if (startDate && endDate) {
        const totalDays = differenceInDays(endDate, startDate);
        const elapsed = differenceInDays(today, startDate);
        timelinePct = totalDays > 0 ? Math.min(110, Math.max(0, (elapsed / totalDays) * 100)) : 0;
      }
      const pmName = (p.team as any)?.projectManager
        ? String((p.team as any).projectManager).slice(0, 20)
        : null;
      return { ...p, lastActivityDays, lastActivityDate, daysLeft, timelinePct, pmName };
    });

    return { active: enrichedActive, ragCounts, stalledList, overdueList, overBudgetList };
  }, [execFiltered, latestAdvanced]);

  // ── Financial Overview ───────────────────────────────────────────────────
  const financialOverview = useMemo(() => {
    const totalBudget = execFiltered.reduce((s, p) => s + p.budget.total, 0);
    const budgetSpent = execFiltered.reduce((s, p) => s + p.budget.spent, 0);
    const costSubs = d?.costSubs ?? [];
    const downPays = d?.downPays ?? [];
    const opCosts = d?.opCosts ?? [];
    // Mirror the kpis logic so Overview tab and global KPI cards never disagree.
    // We use Math.max(downPaysPaid, costSubsApproved) instead of summing both
    // to avoid double-counting when a paid down payment is later reconciled
    // through a site visit cost submission. opCosts are independent and added.
    const opCostsApproved = opCosts
      .filter(o => {
        const s = (o.status ?? '').toLowerCase();
        const t1 = (o.tier1_status ?? '').toLowerCase();
        const t2 = (o.tier2_status ?? '').toLowerCase();
        return s === 'approved' || s === 'paid' || (t1 === 'approved' && (t2 === 'approved' || t2 === 'paid'));
      })
      .reduce((s, o) => s + (o.amount_cents ?? 0), 0);
    const downPaysPaid = downPays
      .filter(dp => {
        const s = (dp.status ?? '').toLowerCase();
        const a = (dp.admin_status ?? '').toLowerCase();
        return s === 'paid' || s === 'approved' || a === 'paid' || a === 'approved';
      })
      .reduce((s, dp) => s + (dp.requested_amount ?? 0) * 100, 0);
    const costSubsApproved = costSubs
      .filter(c => { const s = (c.status ?? '').toLowerCase(); return s === 'approved' || s === 'paid'; })
      .reduce((s, c) => s + (c.total_cost_cents ?? 0), 0);
    const actualSpent = opCostsApproved + Math.max(downPaysPaid, costSubsApproved);
    const totalSpent = Math.max(budgetSpent, actualSpent);
    const pendingApprovalsValue = [
      ...costSubs.filter(c => c.status === 'pending').map(c => c.total_cost_cents ?? 0),
      ...downPays.filter(dp => dp.status === 'pending_supervisor' || dp.status === 'pending_admin').map(dp => (dp.requested_amount ?? 0) * 100),
      ...opCosts.filter(o => o.tier1_status === 'pending' || o.tier2_status === 'pending').map(o => o.amount_cents ?? 0),
    ].reduce((s, v) => s + v, 0);
    const pendingApprovalsCount =
      costSubs.filter(c => c.status === 'pending').length +
      downPays.filter(dp => dp.status === 'pending_supervisor' || dp.status === 'pending_admin').length +
      opCosts.filter(o => o.tier1_status === 'pending' || o.tier2_status === 'pending').length;
    const outstandingWithdrawalsCount = downPays.filter(dp => ['approved','paid'].includes(dp.status)).length;
    const outstandingWithdrawalsValue = downPays.filter(dp => ['approved','paid'].includes(dp.status)).reduce((s,dp)=>s+(dp.requested_amount??0)*100,0);
    const burnPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    // Mini sparkline: budget by project type
    const byType: Record<string, number> = {};
    execFiltered.forEach(p => { const k = TYPE_LABELS[normaliseProjectType(p.project_type)] ?? p.project_type; byType[k] = (byType[k] ?? 0) + p.budget.total; });
    const typeSpend = Object.entries(byType).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name, val]) => ({ name, value: Math.round(val/100) }));
    return { totalBudget, totalSpent, burnPct, pendingApprovalsValue, pendingApprovalsCount, outstandingWithdrawalsCount, outstandingWithdrawalsValue, typeSpend };
  }, [execFiltered, d]);

  // ── People & Capacity ────────────────────────────────────────────────────
  const peopleCapacity = useMemo(() => {
    const profiles = d?.profiles ?? [];
    // Build staff utilization: count active project assignments per person
    const assignmentCount: Record<string, number> = {};
    const assignedProjects: Record<string, string[]> = {};
    execFiltered.filter(p => p.status === 'active').forEach(p => {
      const team = p.team;
      if (!team) return;
      const members: string[] = [];
      if (team.projectManager) members.push(team.projectManager);
      if ((team as any).members && Array.isArray((team as any).members)) {
        members.push(...(team as any).members);
      }
      if ((team as any).teamComposition && Array.isArray((team as any).teamComposition)) {
        (team as any).teamComposition.forEach((m: any) => { if (m?.userId) members.push(m.userId); });
      }
      members.forEach(uid => {
        assignmentCount[uid] = (assignmentCount[uid] ?? 0) + 1;
        if (!assignedProjects[uid]) assignedProjects[uid] = [];
        assignedProjects[uid].push(p.name);
      });
    });

    const overCapacityThreshold = 3;
    const staffUtil = profiles
      .filter(p => p.status !== 'inactive' && p.status !== 'suspended')
      .map(p => ({
        ...p,
        activeAssignments: assignmentCount[p.id] ?? 0,
        assignedProjectNames: assignedProjects[p.id] ?? [],
        isOverCapacity: (assignmentCount[p.id] ?? 0) >= overCapacityThreshold,
      }))
      .filter(p => p.activeAssignments > 0)
      .sort((a, b) => b.activeAssignments - a.activeAssignments);

    const overCapacityList = staffUtil.filter(p => p.isOverCapacity);

    // Upcoming project end dates (next 60 days) — will free up capacity
    const today = startOfToday();
    const upcoming = execFiltered
      .filter(p => p.status === 'active' && p.end_date)
      .map(p => ({ ...p, daysLeft: differenceInDays(safeDate(p.end_date)!, today) }))
      .filter(p => p.daysLeft >= 0 && p.daysLeft <= 60)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 8);

    const totalActive = profiles.filter(p => p.status !== 'inactive' && p.status !== 'suspended').length;
    const assignedCount = Object.keys(assignmentCount).length;
    const avgAssignments = assignedCount > 0 ? (Object.values(assignmentCount).reduce((s,v)=>s+v,0) / assignedCount).toFixed(1) : '0';

    return { staffUtil: staffUtil.slice(0, 10), overCapacityList, upcoming, totalActive, assignedCount, avgAssignments };
  }, [d, execFiltered]);

  // ── Global KPIs ──────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const active = enriched.filter(p => p.status === 'active').length;
    const stalled = enriched.filter(p => p.health === 'stalled').length;
    const atRisk = enriched.filter(p => p.health === 'at-risk').length;
    const totalBudget = enriched.reduce((s, p) => s + p.budget.total, 0);

    // Total Spent = actual disbursed money across the org. We sum approved/paid
    // amounts from the three real expense tables (op costs, down payments, site
    // visit cost subs) and take the larger of that vs project_budgets.spent so
    // cards never show SDG 0 while op costs visibly total billions. The previous
    // implementation only summed project_budgets.spent_budget_cents, which is a
    // sparsely-populated table and caused the "Total Spent SDG 0 / Op Costs
    // SDG 2.8B" inconsistency.
    const budgetSpent = enriched.reduce((s, p) => s + p.budget.spent, 0);
    const opCostsApproved = (d?.opCosts ?? [])
      .filter(o => {
        const s = (o.status ?? '').toLowerCase();
        const t1 = (o.tier1_status ?? '').toLowerCase();
        const t2 = (o.tier2_status ?? '').toLowerCase();
        return s === 'approved' || s === 'paid' || (t1 === 'approved' && (t2 === 'approved' || t2 === 'paid'));
      })
      .reduce((s, o) => s + (o.amount_cents ?? 0), 0);
    const downPaysPaid = (d?.downPays ?? [])
      .filter(dp => {
        const s = (dp.status ?? '').toLowerCase();
        const a = (dp.admin_status ?? '').toLowerCase();
        return s === 'paid' || s === 'approved' || a === 'paid' || a === 'approved';
      })
      .reduce((s, dp) => s + (dp.requested_amount ?? 0) * 100, 0);
    const costSubsApproved = (d?.costSubs ?? [])
      .filter(c => {
        const s = (c.status ?? '').toLowerCase();
        return s === 'approved' || s === 'paid';
      })
      .reduce((s, c) => s + (c.total_cost_cents ?? 0), 0);
    // Use Math.max(downPaysPaid, costSubsApproved) to avoid double-counting
    // when a paid down payment is later reconciled into a site visit cost
    // submission (advances → reconciliation flow).
    const actualSpent = opCostsApproved + Math.max(downPaysPaid, costSubsApproved);
    const totalSpent = Math.max(budgetSpent, actualSpent);
    const portfolioBurn = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    const overdueMilestones = enriched.reduce((s, p) => s + p.overdueMilestones, 0);

    // MMP — broaden the active set so "Active MMPs" reflects every file that's
    // moved past draft. Limiting this to {approved, verified} caused the
    // Operations card to read "1 Active MMP" when the workspace had files in
    // forwarded_to_coordinator, dispatched, in_progress, etc.
    const mmps = d?.mmps ?? [];
    const ACTIVE_MMP_STATUSES = new Set([
      'approved', 'verified', 'in_progress', 'inprogress', 'dispatched',
      'forwarded', 'forwarded_to_fom', 'forwarded_to_coordinator', 'forwarded_to_coordinators',
      'submitted', 'processed', 'costed', 'approved and costed',
    ]);
    const activeMMPs = mmps.filter(m => {
      const s = (m.status ?? '').toString().toLowerCase().trim();
      return ACTIVE_MMP_STATUSES.has(s);
    }).length;
    const siteEntries = d?.siteEntries ?? [];
    const completedSites = siteEntries.filter(e => classifySiteEntryStatus(e.status) === 'verified').length;
    const coveragePct = siteEntries.length > 0
      ? (completedSites / siteEntries.length >= 0.01
          ? Math.round((completedSites / siteEntries.length) * 100)
          : Math.round((completedSites / siteEntries.length) * 1000) / 10)
      : 0;

    // Financial approvals pending
    const pendingCosts = (d?.costSubs ?? []).filter(c => c.status === 'pending').length;
    const pendingDown = (d?.downPays ?? []).filter(dp => dp.status === 'pending_supervisor' || dp.status === 'pending_admin').length;
    const pendingOp = (d?.opCosts ?? []).filter(o => o.tier1_status === 'pending' || o.tier2_status === 'pending').length;
    const totalPendingApprovals = pendingCosts + pendingDown + pendingOp;

    // People
    const activeStaff = (d?.profiles ?? []).filter(p => p.status !== 'inactive' && p.status !== 'suspended').length;
    const pendingLeave = (d?.leaves ?? []).filter(l => l.status === 'pending').length;

    // Incidents
    const openIncidents = (d?.incidents ?? []).filter(i => i.status === 'open' || i.status === 'investigating').length;
    const criticalIncidents = (d?.incidents ?? []).filter(i => (i.status === 'open' || i.status === 'investigating') && i.severity === 'critical').length;

    // CRM
    const activePipeline = (d?.crmOpptys ?? []).filter(o => o.stage !== 'won' && o.stage !== 'lost').reduce((s, o) => s + (o.value_usd ?? 0), 0);

    return {
      active, stalled, atRisk, totalBudget, totalSpent, portfolioBurn, overdueMilestones,
      activeMMPs, coveragePct, completedSites, totalSiteEntries: siteEntries.length,
      pendingCosts, pendingDown, pendingOp, totalPendingApprovals,
      activeStaff, pendingLeave, openIncidents, criticalIncidents,
      activePipeline, totalProjects: enriched.length,
    };
  }, [enriched, d]);

  // ── Operations tab ────────────────────────────────────────────────────────

  const mmpStats = useMemo(() => {
    const mmps = d?.mmps ?? [];
    // Open dictionary: count every distinct status that comes back from the DB
    // (forwarded_to_coordinator, dispatched, draft, in_progress, etc.) instead
    // of dropping anything outside a hardcoded 5-bucket list. UI below renders
    // canonical buckets first then rolls everything else into "Other".
    const byStatus: Record<string, number> = { pending: 0, verified: 0, approved: 0, rejected: 0, archived: 0 };
    mmps.forEach(m => {
      const s = (m.status ?? '').toString().toLowerCase().trim() || 'unknown';
      byStatus[s] = (byStatus[s] ?? 0) + 1;
    });
    const totalPlanned = mmps.reduce((s, m) => s + (m.entries ?? 0), 0);
    const totalProcessed = mmps.reduce((s, m) => s + (m.processed_entries ?? 0), 0);
    const siteEntries = d?.siteEntries ?? [];
    const buckets = { verified: 0, inProgress: 0, returned: 0, rejected: 0, pending: 0, other: 0 };
    siteEntries.forEach(e => { buckets[classifySiteEntryStatus(e.status)]++; });
    return {
      byStatus, totalPlanned, totalProcessed,
      completedSites: buckets.verified,
      inProgressSites: buckets.inProgress,
      pendingSites: buckets.pending,
      returnedSites: buckets.returned,
      rejectedSites: buckets.rejected,
      otherSites: buckets.other,
      totalEntries: siteEntries.length,
    };
  }, [d]);

  const equipStats = useMemo(() => {
    const equip = d?.equip ?? [];
    const byStatus: Record<string, number> = {};
    equip.forEach(e => { byStatus[e.status] = (byStatus[e.status] ?? 0) + 1; });
    return { total: equip.length, byStatus, damaged: equip.filter(e => e.status === 'damaged').length, lost: equip.filter(e => e.status === 'lost').length };
  }, [d?.equip]);

  // Median time-to-complete per hub, last 30 days, from
  // dispatched_at → completed_at (fallback updated_at for legacy rows).
  const hubTimeToComplete = useMemo(() => {
    const siteEntries = d?.siteEntries ?? [];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const perHub = new Map<string, number[]>();
    let overallSamples: number[] = [];

    for (const e of siteEntries) {
      if (!e.dispatched_at) continue;
      // Strict completion check (shared helper): only `completed`/`verified`
      // raw statuses are eligible for updated_at fallback; intermediate states
      // like dispatched or approved must not contribute or they skew the median.
      const completedRaw = e.completed_at ?? (isTerminalCompletionRawStatus(e.status) ? e.updated_at : null);
      if (!completedRaw) continue;
      const completed = new Date(completedRaw).getTime();
      const dispatched = new Date(e.dispatched_at).getTime();
      if (!Number.isFinite(completed) || !Number.isFinite(dispatched)) continue;
      if (completed < cutoff) continue;
      const diff = completed - dispatched;
      if (diff < 0) continue;
      const hub = (e.hub_office ?? '').trim() || 'Unassigned';
      if (!perHub.has(hub)) perHub.set(hub, []);
      perHub.get(hub)!.push(diff);
      overallSamples.push(diff);
    }

    const rows = Array.from(perHub.entries())
      .map(([hub, vals]) => ({ hub, sampleCount: vals.length, medianMs: medianMs(vals) ?? 0 }))
      .sort((a, b) => a.medianMs - b.medianMs);

    return {
      rows,
      overallMedianMs: medianMs(overallSamples),
      totalSamples: overallSamples.length,
    };
  }, [d?.siteEntries]);

  // ── Financial tab ─────────────────────────────────────────────────────────

  const finStats = useMemo(() => {
    const costSubs = d?.costSubs ?? [];
    const downPays = d?.downPays ?? [];
    const opCosts = d?.opCosts ?? [];
    const payrollRuns = d?.payrollRuns ?? [];

    const costSubTotal = costSubs.reduce((s, c) => s + (c.total_cost_cents ?? 0), 0);
    const costSubPending = costSubs.filter(c => c.status === 'pending');
    // Include 'paid' as a terminal approved state — the cost submission lifecycle
    // moves approved → paid, and previously the dashboard would drop to 0 once
    // a cost was paid. Cards now reflect every approved-or-disbursed cost.
    const costSubApproved = costSubs.filter(c => {
      const s = (c.status ?? '').toLowerCase();
      return s === 'approved' || s === 'paid';
    });

    const downPayPending = downPays.filter(dp => dp.status === 'pending_supervisor' || dp.status === 'pending_admin');
    const downPayTotal = downPays.reduce((s, dp) => s + (dp.requested_amount ?? 0) * 100, 0);

    const opCostPending = opCosts.filter(o => o.tier1_status === 'pending' || o.tier2_status === 'pending');
    const opCostTotal = opCosts.reduce((s, o) => s + (o.amount_cents ?? 0), 0);

    const latestPayroll = payrollRuns[0];
    const payrollData = payrollRuns.slice(0, 6).map(r => ({
      period: r.period_start ? format(parseISO(r.period_start), 'MMM yy') : '—',
      gross: Math.round((r.total_gross_cents ?? 0) / 100),
      status: r.status,
    })).reverse();

    const budgetBarData = enriched
      .filter(p => p.budget.total > 0)
      .sort((a, b) => b.budget.total - a.budget.total)
      .slice(0, 10)
      .map(p => ({
        name: p.project_code || p.name.slice(0, 10),
        fullName: p.name,
        total: Math.round(p.budget.total / 100),
        spent: Math.round(p.budget.spent / 100),
        burn: p.burnPct,
      }));

    return {
      costSubTotal, costSubPending: costSubPending.length, costSubApproved: costSubApproved.length,
      downPayPending: downPayPending.length, downPayTotal,
      opCostPending: opCostPending.length, opCostTotal,
      latestPayroll, payrollData, budgetBarData,
      totalBudget: kpis.totalBudget, totalSpent: kpis.totalSpent,
    };
  }, [d, enriched, kpis]);

  // ── People tab ────────────────────────────────────────────────────────────

  const peopleStats = useMemo(() => {
    const profiles = d?.profiles ?? [];
    const depts = d?.depts ?? [];
    const leaves = d?.leaves ?? [];

    const byRole: Record<string, number> = {};
    profiles.forEach(p => {
      if (!p.role) return;
      const key = normalizeRoleKey(p.role);
      if (!key) return;
      byRole[key] = (byRole[key] ?? 0) + 1;
    });

    const byEmployment: Record<string, number> = {};
    profiles.forEach(p => { const k = p.employment_type ?? 'unknown'; byEmployment[k] = (byEmployment[k] ?? 0) + 1; });

    const today = startOfToday();
    const expiringContracts = profiles.filter(p => {
      if (!p.contract_end_date) return false;
      const d = safeDate(p.contract_end_date);
      return d && differenceInDays(d, today) <= 30 && differenceInDays(d, today) >= 0;
    });

    const leaveByStatus: Record<string, number> = {};
    leaves.forEach(l => { leaveByStatus[l.status] = (leaveByStatus[l.status] ?? 0) + 1; });

    const leaveByType: Record<string, number> = {};
    leaves.forEach(l => { leaveByType[l.leave_type] = (leaveByType[l.leave_type] ?? 0) + 1; });

    const roleChartData = Object.entries(byRole)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([role, count], i) => ({
        name: prettyRoleLabel(role),
        value: count,
        color: ['#0F2041','#1D3461','#4f86c6','#34d399','#f59e0b','#a78bfa','#f87171','#38bdf8'][i % 8],
      }));

    return {
      total: profiles.length,
      active: profiles.filter(p => p.status !== 'inactive' && p.status !== 'suspended').length,
      byRole, byEmployment, deptCount: depts.length,
      expiringContracts, leaveByStatus, leaveByType, roleChartData,
      pendingLeave: leaveByStatus['pending'] ?? 0,
      approvedLeave: leaveByStatus['approved'] ?? 0,
    };
  }, [d]);

  // ── CRM & Partners tab ────────────────────────────────────────────────────

  const crmStats = useMemo(() => {
    const partners = d?.crmPartners ?? [];
    const opptys = d?.crmOpptys ?? [];

    const byType: Record<string, number> = {};
    partners.forEach(p => { const k = p.type ?? 'other'; byType[k] = (byType[k] ?? 0) + 1; });

    const byStage: Record<string, { count: number; value: number }> = {};
    opptys.forEach(o => {
      if (!byStage[o.stage]) byStage[o.stage] = { count: 0, value: 0 };
      byStage[o.stage].count++;
      byStage[o.stage].value += o.value_usd ?? 0;
    });

    const activePipeline = opptys.filter(o => o.stage !== 'won' && o.stage !== 'lost');
    const closingSoon = activePipeline.filter(o => {
      const d = safeDate(o.expected_close_date);
      return d && differenceInDays(d, new Date()) <= 30;
    });
    const totalPipelineValue = activePipeline.reduce((s, o) => s + (o.value_usd ?? 0), 0);
    const wonValue = opptys.filter(o => o.stage === 'won').reduce((s, o) => s + (o.value_usd ?? 0), 0);

    const stageChartData = Object.entries(CRM_STAGE_CFG).map(([stage, cfg]) => ({
      name: cfg.label, value: byStage[stage]?.count ?? 0,
      amount: byStage[stage]?.value ?? 0, color: cfg.color,
    })).filter(s => s.value > 0);

    return {
      totalPartners: partners.length, activePartners: partners.filter(p => p.status === 'active').length,
      byType, totalOpptys: opptys.length, activePipeline: activePipeline.length,
      closingSoon: closingSoon.length, totalPipelineValue, wonValue, stageChartData, closingSoonList: closingSoon.slice(0, 5),
    };
  }, [d]);

  // ── Task Health (org-wide) ────────────────────────────────────────────────

  const taskStats = useMemo(() => {
    // Merge personal_tasks AND project_field_tasks for an honest org-wide health
    // signal. The dashboard previously only looked at personal_tasks AND used
    // the wrong status strings — the personal_tasks enum is
    // 'todo'|'inprogress'|'on_hold'|'rescheduled'|'done'|'cancelled', so the
    // old check for 'in_progress'|'in-progress'|'doing' never matched a single
    // row, which is why every counter showed 0.
    const personalTasks = d?.tasks ?? [];
    const fieldTasks = (d?.projectFieldTasks ?? []).map(ft => ({
      id: ft.id, title: ft.title, status: ft.status, priority: ft.priority,
      due_date: ft.due_date, assigned_to: ft.assigned_to, assigned_to_name: null,
      user_id: null, department_id: null, updated_at: ft.updated_at, created_at: ft.created_at,
    } as TaskRow));
    const tasks = [...personalTasks, ...fieldTasks];
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const isDone = (s: string) => {
      const x = (s ?? '').toLowerCase();
      return x === 'done' || x === 'completed' || x === 'complete' || x === 'closed';
    };
    const isInProgress = (s: string) => {
      const x = (s ?? '').toLowerCase();
      return x === 'inprogress' || x === 'in_progress' || x === 'in-progress' || x === 'doing' || x === 'started' || x === 'in progress';
    };
    const isCancelled = (s: string) => {
      const x = (s ?? '').toLowerCase();
      return x === 'cancelled' || x === 'canceled';
    };

    const open = tasks.filter(t => !isDone(t.status) && !isInProgress(t.status) && !isCancelled(t.status));
    const inProgress = tasks.filter(t => isInProgress(t.status));
    const overdue = tasks.filter(t => {
      if (!t.due_date) return false;
      const due = safeDate(t.due_date);
      return due && isBefore(due, today) && !isDone(t.status) && !isCancelled(t.status);
    });
    const completedThisMonth = tasks.filter(t => {
      if (!isDone(t.status)) return false;
      const updated = safeDate(t.updated_at);
      return updated && isAfter(updated, startOfMonth);
    });

    const depts = d?.depts ?? [];
    const profiles = d?.profiles ?? [];
    const profileMap: Record<string, ProfileRow> = {};
    profiles.forEach(p => { profileMap[p.id] = p; });

    const overdueByDept: Record<string, { deptName: string; count: number; tasks: TaskRow[] }> = {};
    overdue.forEach(t => {
      const profile = t.assigned_to ? profileMap[t.assigned_to] : null;
      const deptId = t.department_id ?? profile?.department_id ?? '__none__';
      const dept = depts.find(dd => dd.id === deptId);
      const deptName = dept?.name ?? (deptId === '__none__' ? 'Unassigned' : 'Other');
      if (!overdueByDept[deptId]) overdueByDept[deptId] = { deptName, count: 0, tasks: [] };
      overdueByDept[deptId].count++;
      overdueByDept[deptId].tasks.push(t);
    });

    return {
      total: tasks.length,
      openCount: open.length,
      inProgressCount: inProgress.length,
      overdueCount: overdue.length,
      completedThisMonthCount: completedThisMonth.length,
      overdueByDept: Object.values(overdueByDept).sort((a, b) => b.count - a.count).slice(0, 5),
      topOverdue: overdue.slice(0, 8),
      hasData: tasks.length > 0,
    };
  }, [d]);

  // ── Employee Task Productivity Assessment ─────────────────────────────────

  const employeeTaskMetrics = useMemo(() => {
    const tasks = d?.tasks ?? [];
    const fieldTasks = d?.projectFieldTasks ?? [];
    const profiles = d?.profiles ?? [];
    const depts = d?.depts ?? [];
    const today = new Date();

    // Build profile map
    const profileMap: Record<string, ProfileRow> = {};
    profiles.forEach(p => { profileMap[p.id] = p; });

    // Aggregate tasks by user (assigned_to = primary ownership)
    const userMetrics: Record<string, {
      userId: string; name: string; role: string | null; dept: string;
      total: number; completed: number; inProgress: number; overdue: number; todo: number;
      projectTasks: number; completedOn: Date[];
    }> = {};

    const initUser = (uid: string) => {
      if (userMetrics[uid]) return;
      const p = profileMap[uid];
      const dept = depts.find(dd => dd.id === p?.department_id);
      userMetrics[uid] = {
        userId: uid,
        name: p?.full_name ?? 'Unknown',
        role: p?.role ?? null,
        dept: dept?.name ?? '—',
        total: 0, completed: 0, inProgress: 0, overdue: 0, todo: 0, projectTasks: 0,
        completedOn: [],
      };
    };

    tasks.forEach(t => {
      const uid = t.assigned_to ?? t.user_id;
      if (!uid) return;
      initUser(uid);
      const m = userMetrics[uid];
      m.total++;
      const isDone = ['done', 'completed', 'complete'].includes(t.status);
      const isIP = ['inprogress', 'in_progress', 'in-progress', 'doing'].includes(t.status);
      if (isDone) {
        m.completed++;
        const ud = safeDate(t.updated_at);
        if (ud) m.completedOn.push(ud);
      } else if (isIP) {
        m.inProgress++;
        const due = safeDate(t.due_date);
        if (due && isBefore(due, today)) m.overdue++;
      } else {
        m.todo++;
        const due = safeDate(t.due_date);
        if (due && isBefore(due, today)) m.overdue++;
      }
    });

    fieldTasks.forEach(ft => {
      const uid = ft.assigned_to;
      if (!uid) return;
      initUser(uid);
      const m = userMetrics[uid];
      m.total++;
      m.projectTasks++;
      const isDone = ['done', 'completed', 'complete'].includes(ft.status);
      if (isDone) {
        m.completed++;
        const ud = safeDate(ft.updated_at);
        if (ud) m.completedOn.push(ud);
      } else {
        const isIP = ['inprogress', 'in_progress', 'in-progress', 'doing'].includes(ft.status);
        if (isIP) m.inProgress++;
        else m.todo++;
        const due = safeDate(ft.due_date);
        if (due && isBefore(due, today)) m.overdue++;
      }
    });

    return Object.values(userMetrics)
      .filter(m => m.total > 0)
      .map(m => {
        const completionRate = m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0;
        const overdueRate = m.total > 0 ? Math.round((m.overdue / m.total) * 100) : 0;
        // Efficiency score: completionRate - overdueRate penalty
        const efficiencyScore = Math.max(0, completionRate - overdueRate * 0.5);
        const efficiency = efficiencyScore >= 70 ? 'high' : efficiencyScore >= 40 ? 'medium' : 'low';
        return { ...m, completionRate, overdueRate, efficiencyScore: Math.round(efficiencyScore), efficiency };
      })
      .sort((a, b) => b.total - a.total);
  }, [d]);

  // ── Timesheet / Workload ──────────────────────────────────────────────────

  const workloadStats = useMemo(() => {
    const timesheets = d?.timesheets ?? [];
    const profiles = d?.profiles ?? [];
    const depts = d?.depts ?? [];
    if (!timesheets.length) return null;

    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const weekStr = format(startOfWeek, 'yyyy-MM-dd');

    const thisWeekSheets = timesheets.filter(t => t.week_start === weekStr);
    const approvedThisWeek = thisWeekSheets.filter(t => t.status === 'approved');

    const profileMap: Record<string, ProfileRow> = {};
    profiles.forEach(p => { profileMap[p.id] = p; });

    const deptHoursWeek: Record<string, { deptName: string; hours: number; headcount: number }> = {};
    approvedThisWeek.forEach(t => {
      const profile = profileMap[t.user_id];
      if (!profile) return;
      const deptId = profile.department_id ?? '__none__';
      const dept = depts.find(d => d.id === deptId);
      const deptName = dept?.name ?? 'Other';
      if (!deptHoursWeek[deptId]) deptHoursWeek[deptId] = { deptName, hours: 0, headcount: 0 };
      deptHoursWeek[deptId].hours += t.total_hours ?? 0;
      deptHoursWeek[deptId].headcount++;
    });

    const submittedUserIds = new Set(thisWeekSheets.map(t => t.user_id));
    const activeProfiles = profiles.filter(p => p.status !== 'inactive' && p.status !== 'suspended' && p.employment_type !== 'contractor');
    const missingThisWeek = activeProfiles.filter(p => !submittedUserIds.has(p.id));

    const totalApprovedHoursWeek = approvedThisWeek.reduce((s, t) => s + (t.total_hours ?? 0), 0);
    const departmentList = Object.values(deptHoursWeek).sort((a, b) => b.hours - a.hours);
    const avgHoursPerDept = departmentList.length > 0 ? totalApprovedHoursWeek / departmentList.length : 0;

    return {
      totalApprovedHoursWeek,
      departmentList,
      missingCount: missingThisWeek.length,
      missingList: missingThisWeek.slice(0, 8),
      avgHoursPerDept,
      hasData: timesheets.length > 0,
    };
  }, [d]);

  // ── Subscription costs ────────────────────────────────────────────────────

  const subscriptionStats = useMemo(() => {
    const subs = d?.subscriptions ?? [];
    const activeSubs = subs.filter(s => s.status === 'active');
    const totalMonthlyCents = activeSubs.reduce((s, sub) => s + (sub.monthly_cost_cents ?? 0), 0);
    const today = new Date();
    const renewingSoon = subs.filter(s => {
      const rd = safeDate(s.renewal_date);
      return rd && differenceInDays(rd, today) <= 30 && differenceInDays(rd, today) >= 0;
    });
    return {
      total: subs.length,
      activeCount: activeSubs.length,
      totalMonthlyCents,
      renewingSoon: renewingSoon.length,
      renewingSoonList: renewingSoon.slice(0, 5),
      hasData: subs.length > 0,
    };
  }, [d]);

  // ── Accountability feed items ─────────────────────────────────────────────

  const accountabilityFeed = useMemo(() => {
    type FeedItem = {
      id: string;
      type: 'overdue_task' | 'timesheet_pending' | 'subscription_renewal' | 'incident' | 'stalled_project' | 'pending_approval';
      title: string;
      sub: string;
      urgency: 'critical' | 'high' | 'medium';
      action?: () => void;
    };
    const items: FeedItem[] = [];

    // Overdue tasks escalations (no update in 48h)
    const tasks = d?.tasks ?? [];
    const now = new Date();
    tasks.filter(t => {
      if (!t.due_date) return false;
      const due = safeDate(t.due_date);
      const done = t.status === 'done' || t.status === 'completed' || t.status === 'complete';
      if (!due || !isBefore(due, now) || done) return false;
      const lastUpdate = safeDate(t.updated_at);
      return !lastUpdate || differenceInDays(now, lastUpdate) >= 2;
    }).slice(0, 5).forEach(t => {
      const daysOverdue = t.due_date ? differenceInDays(now, safeDate(t.due_date)!) : 0;
      items.push({
        id: `task-${t.id}`,
        type: 'overdue_task',
        title: `Overdue task: ${t.title}`,
        sub: `${daysOverdue}d overdue, no update in 48h`,
        urgency: daysOverdue > 7 ? 'critical' : 'high',
      });
    });

    // Pending timesheet approvals
    const timesheets = d?.timesheets ?? [];
    const pendingSheets = timesheets.filter(t => t.status === 'submitted' || t.status === 'pending');
    if (pendingSheets.length > 0) {
      items.push({
        id: 'timesheet-pending',
        type: 'timesheet_pending',
        title: `${pendingSheets.length} timesheet${pendingSheets.length > 1 ? 's' : ''} awaiting approval`,
        sub: 'Submitted and pending manager review',
        urgency: pendingSheets.length > 5 ? 'high' : 'medium',
      });
    }

    // Subscription renewals due in 14 days
    const subs = d?.subscriptions ?? [];
    subs.filter(s => {
      const rd = safeDate(s.renewal_date);
      return rd && differenceInDays(rd, now) <= 14 && differenceInDays(rd, now) >= 0;
    }).slice(0, 3).forEach(s => {
      const daysLeft = differenceInDays(safeDate(s.renewal_date)!, now);
      items.push({
        id: `sub-${s.id}`,
        type: 'subscription_renewal',
        title: `Subscription renewal: ${s.name}`,
        sub: `Renews in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
        urgency: daysLeft <= 3 ? 'critical' : 'medium',
      });
    });

    // Critical incidents
    const incidents = d?.incidents ?? [];
    incidents.filter(i => i.severity === 'critical' && (i.status === 'open' || i.status === 'investigating')).slice(0, 3).forEach(i => {
      items.push({
        id: `incident-${i.id}`,
        type: 'incident',
        title: `Critical incident: ${i.title}`,
        sub: `Reported ${fmtDate(i.date_reported)} — still open`,
        urgency: 'critical',
      });
    });

    // Stalled projects
    enriched.filter(p => p.health === 'stalled').slice(0, 3).forEach(p => {
      items.push({
        id: `stalled-${p.id}`,
        type: 'stalled_project',
        title: `Stalled project: ${p.name}`,
        sub: `No flow advance in >${STALL_DAYS} days`,
        urgency: 'high',
      });
    });

    // High pending approvals
    const totalPending = (d?.costSubs ?? []).filter(c => c.status === 'pending').length +
      (d?.downPays ?? []).filter(dp => dp.status === 'pending_supervisor' || dp.status === 'pending_admin').length +
      (d?.opCosts ?? []).filter(o => o.tier1_status === 'pending' || o.tier2_status === 'pending').length;
    if (totalPending > 10) {
      items.push({
        id: 'pending-approvals',
        type: 'pending_approval',
        title: `${totalPending} financial approvals pending`,
        sub: 'Cost reimbursements, advances, and op costs',
        urgency: 'high',
      });
    }

    return items.sort((a, b) => {
      const rank = (u: string) => u === 'critical' ? 3 : u === 'high' ? 2 : 1;
      return rank(b.urgency) - rank(a.urgency);
    }).slice(0, 12);
  }, [d, enriched]);

  // ── Risk & Safety tab ─────────────────────────────────────────────────────

  const riskStats = useMemo(() => {
    const incidents = d?.incidents ?? [];
    const bySeverity: Record<string, number> = {};
    incidents.forEach(i => { bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1; });
    const openIncidents = incidents.filter(i => i.status === 'open' || i.status === 'investigating');
    const resolvedRecently = incidents.filter(i => {
      if (i.status !== 'resolved' && i.status !== 'closed') return false;
      const d = safeDate(i.date_reported);
      return d && differenceInDays(new Date(), d) <= 30;
    }).length;
    const severityChartData = ['critical', 'high', 'medium', 'low']
      .map(s => ({ name: s.charAt(0).toUpperCase() + s.slice(1), value: bySeverity[s] ?? 0, color: { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#3b82f6' }[s] }))
      .filter(s => s.value > 0);
    const stalledProjects = enriched.filter(p => p.health === 'stalled');
    const overBudgetProjects = enriched.filter(p => p.burnPct > 100);
    const overdueMilestonesAll = milestones.filter(m => m.status !== 'completed' && m.due_date && isBefore(parseISO(m.due_date), new Date()));

    return {
      total: incidents.length, openIncidents, resolvedRecently, bySeverity, severityChartData,
      criticalOpen: openIncidents.filter(i => i.severity === 'critical').length,
      stalledProjects, overBudgetProjects, overdueMilestonesAll: overdueMilestonesAll.length,
    };
  }, [d, enriched, milestones]);

  // ── Project health matrix (Portfolio tab) ─────────────────────────────────

  const filteredProjects = useMemo(() => {
    let rows = enriched;
    if (projectStatusFilter !== 'all') rows = rows.filter(p => p.status === projectStatusFilter);
    if (projectSearch.trim()) { const q = projectSearch.toLowerCase(); rows = rows.filter(p => p.name.toLowerCase().includes(q) || p.project_code.toLowerCase().includes(q)); }
    return [...rows].sort((a, b) => {
      const order: HealthSignal[] = ['stalled', 'at-risk', 'on-track', 'draft', 'completed'];
      const cmp = order.indexOf(a.health) - order.indexOf(b.health);
      return projectSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [enriched, projectStatusFilter, projectSearch, projectSort]);

  // Milestones — next 30 days
  const upcomingMilestones = useMemo(() => {
    const today = startOfToday();
    const limit = addDays(today, 30);
    return milestones
      .filter(m => m.status !== 'completed' && m.due_date)
      .map(m => {
        const due = safeDate(m.due_date)!;
        const project = enriched.find(p => p.id === m.project_id);
        return { ...m, due, daysLeft: differenceInDays(due, today), projectName: project?.name ?? '—', projectId: m.project_id };
      })
      .filter(m => isAfter(m.due, addDays(today, -1)) && isBefore(m.due, limit))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [milestones, enriched]);

  // Pipeline board
  const pipelineGroups = useMemo(() => {
    const active = enriched.filter(p => p.status === 'active' || p.status === 'onHold');
    const stageMap: Record<string, typeof active> = {};
    active.forEach(p => { const k = p.current_flow_stage ?? '__none__'; if (!stageMap[k]) stageMap[k] = []; stageMap[k].push(p); });
    const groups: { stageLabel: string; projects: typeof active }[] = [];
    const seen = new Set<string>();
    if (stageMap['__none__']?.length) groups.push({ stageLabel: 'Not Started', projects: stageMap['__none__'] });
    active.forEach(p => {
      const flow = getProjectFlow(normaliseProjectType(p.project_type));
      flow.stages.forEach(s => {
        if (!seen.has(s.id) && stageMap[s.id]?.length) { seen.add(s.id); groups.push({ stageLabel: s.label, projects: stageMap[s.id] }); }
      });
    });
    return groups;
  }, [enriched]);

  // ─────────────────────────────────────────────────────────────────────────
  // PDF Export
  // ─────────────────────────────────────────────────────────────────────────

  function exportExecutivePDF() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pw = doc.internal.pageSize.width;
    const ph = doc.internal.pageSize.height;
    const ml = 14; const mr = 14;
    const today = format(new Date(), 'dd MMM yyyy');

    // Header
    doc.setFillColor(15, 32, 65);
    doc.rect(0, 0, pw, 36, 'F');
    doc.setFontSize(18); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.text('PACT – Portfolio Executive Report', ml + 2, 16);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${today}`, ml + 2, 23);
    const filters: string[] = [];
    if (filterProjectType !== 'all') filters.push(`Type: ${TYPE_LABELS[filterProjectType] ?? filterProjectType}`);
    if (filterClient !== 'all') filters.push(`Client: ${filterClient}`);
    if (filterDateFrom) filters.push(`From: ${filterDateFrom}`);
    if (filterDateTo) filters.push(`To: ${filterDateTo}`);
    if (filters.length) doc.text(`Filters: ${filters.join(' | ')}`, ml + 2, 29);
    doc.setFontSize(8); doc.setTextColor(190, 205, 225);
    doc.text(`${execFiltered.length} projects in scope`, pw - mr, 23, { align: 'right' });

    let y = 44;

    // 1. Business Pipeline
    doc.setFontSize(13); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('1. Business Pipeline', ml, y); y += 7;
    autoTable(doc, {
      startY: y,
      head: [['Stage', 'Count / Value']],
      body: businessPipeline.stageBarData.map(r => [r.stage, r.value > 0 ? `${r.count} opp — $${r.value >= 1e6 ? (r.value/1e6).toFixed(1)+'M' : r.value >= 1000 ? (r.value/1000).toFixed(0)+'K' : r.value.toFixed(0)}` : `${r.count}`]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 32, 65], textColor: [255,255,255] },
      margin: { left: ml, right: mr },
    });
    y = (doc as any).lastAutoTable?.finalY + 8 || y + 30;

    // 2. Delivery Health
    if (y > ph - 60) { doc.addPage(); y = 14; }
    doc.setFontSize(13); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('2. Delivery Health', ml, y); y += 7;
    const ragSummaryRows = [
      ['Red (Critical Issues)', String(deliveryHealth.ragCounts.red)],
      ['Amber (At Risk)', String(deliveryHealth.ragCounts.amber)],
      ['Green (On Track)', String(deliveryHealth.ragCounts.green)],
      ['Stalled Projects', String(deliveryHealth.stalledList.length)],
      ['Past End Date', String(deliveryHealth.overdueList.length)],
      ['Over Budget', String(deliveryHealth.overBudgetList.length)],
    ];
    autoTable(doc, {
      startY: y, head: [['Metric', 'Count']],
      body: ragSummaryRows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 32, 65], textColor: [255,255,255] },
      margin: { left: ml, right: mr },
    });
    y = (doc as any).lastAutoTable?.finalY + 4 || y + 30;
    if (deliveryHealth.active.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Project', 'Type', 'RAG', 'Timeline', 'Budget%', 'End Date']],
        body: deliveryHealth.active.slice(0,15).map(p => [
          p.name.substring(0, 30),
          TYPE_LABELS[normaliseProjectType(p.project_type)] ?? p.project_type,
          p.rag.overall.toUpperCase(),
          p.rag.timeline.toUpperCase(),
          p.budget.total > 0 ? `${p.burnPct}%` : '—',
          fmtDate(p.end_date),
        ]),
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [15, 32, 65], textColor: [255,255,255] },
        margin: { left: ml, right: mr },
      });
      y = (doc as any).lastAutoTable?.finalY + 8 || y + 40;
    }

    // 3. Financial Overview
    if (y > ph - 60) { doc.addPage(); y = 14; }
    doc.setFontSize(13); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('3. Financial Overview', ml, y); y += 7;
    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: [
        ['Total Committed Budget', fmtMoney(financialOverview.totalBudget)],
        ['Total Expenditure to Date', fmtMoney(financialOverview.totalSpent)],
        ['Portfolio Burn Rate', `${financialOverview.burnPct}%`],
        ['Pending Approvals (count)', String(financialOverview.pendingApprovalsCount)],
        ['Pending Approvals (value)', fmtMoney(financialOverview.pendingApprovalsValue)],
        ['Outstanding Withdrawals', `${financialOverview.outstandingWithdrawalsCount} requests`],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 32, 65], textColor: [255,255,255] },
      margin: { left: ml, right: mr },
    });
    y = (doc as any).lastAutoTable?.finalY + 8 || y + 30;

    // 4. People & Capacity
    if (y > ph - 60) { doc.addPage(); y = 14; }
    doc.setFontSize(13); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('4. People & Capacity', ml, y); y += 7;
    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: [
        ['Active Staff', String(peopleCapacity.totalActive)],
        ['Staff Assigned to Projects', String(peopleCapacity.assignedCount)],
        ['Avg. Project Assignments', String(peopleCapacity.avgAssignments)],
        ['Over-Capacity Staff (≥3 projects)', String(peopleCapacity.overCapacityList.length)],
        ['Projects Ending in 60 Days', String(peopleCapacity.upcoming.length)],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 32, 65], textColor: [255,255,255] },
      margin: { left: ml, right: mr },
    });
    y = (doc as any).lastAutoTable?.finalY + 4 || y + 30;
    if (peopleCapacity.overCapacityList.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Staff Member', 'Role', 'Active Assignments']],
        body: peopleCapacity.overCapacityList.slice(0, 10).map(p => [
          p.full_name ?? 'Unknown',
          p.role?.replace(/_/g,' ') ?? '—',
          String(p.activeAssignments),
        ]),
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [15, 32, 65], textColor: [255,255,255] },
        margin: { left: ml, right: mr },
      });
    }

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFillColor(15, 32, 65);
      doc.rect(0, ph - 12, pw, 12, 'F');
      doc.setFontSize(7); doc.setTextColor(180, 195, 220);
      doc.text(`Page ${i} of ${totalPages}  |  PACT Portfolio Executive Report  |  ${today}`, pw / 2, ph - 5, { align: 'center' });
    }

    doc.save(`PACT-Executive-Report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-3">
        <Loader2 className="h-10 w-10 animate-spin text-[#1D3461] mx-auto" />
        <p className="text-sm text-muted-foreground">Loading portfolio data from all modules…</p>
      </div>
    </div>
  );

  if (isError) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <AlertTriangle className="h-10 w-10 text-red-500" />
      <p className="text-sm text-muted-foreground">Failed to load portfolio data</p>
      <Button onClick={() => refetch()} size="sm">Retry</Button>
    </div>
  );

  const totalPendingApprovals = kpis.totalPendingApprovals;

  return (
    <div className="min-h-screen bg-background">

      {/* ══ Gradient Header ══════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-r from-[#0F2041] via-[#1D3461] to-[#163060] text-white px-6 pt-8 pb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center ring-1 ring-white/20">
              <LayoutDashboard className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Portfolio Command Center</h1>
              <p className="text-blue-200 text-sm mt-0.5">
                Executive overview · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {lastUpdated && (
                <p className="text-blue-300/70 text-[11px] mt-0.5 flex items-center gap-1" data-testid="text-last-updated">
                  <Clock className="h-3 w-3" />
                  Last updated {secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.floor(secondsAgo / 60)}m ago`}
                  {isFetching && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canAccessExecutive && (
              <Button variant="outline" size="sm" onClick={exportExecutivePDF}
                className="border-white/30 text-white hover:bg-white/10 gap-1.5"
                data-testid="button-export-report">
                <Download className="h-3.5 w-3.5" />
                Export Report
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}
              className="border-white/30 text-white hover:bg-white/10 gap-1.5"
              data-testid="button-manual-refresh">
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
        </div>

        {/* 10-tile KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-2.5">
          <KpiTile icon={Briefcase} label="Active Projects" value={kpis.active} sub={`${kpis.totalProjects} total`} color="text-white"
            onClick={() => setActiveTab('portfolio')} actionLabel="View projects" />
          <KpiTile icon={Clock} label="Stalled" value={kpis.stalled} sub={`>${STALL_DAYS}d no advance`} color="text-white" urgent={kpis.stalled > 0}
            onClick={() => setActiveTab('portfolio')} actionLabel="Investigate" />
          <KpiTile icon={TrendingUp} label="Portfolio Burn" value={`${kpis.portfolioBurn}%`} sub={fmtMoney(kpis.totalSpent)} color="text-white" urgent={kpis.portfolioBurn > 90}
            onClick={() => setActiveTab('financial')} actionLabel="Financial view" />
          <KpiTile icon={ClipboardList} label="MMP Coverage" value={`${kpis.coveragePct}%`} sub={`${kpis.completedSites}/${kpis.totalSiteEntries} sites`} color="text-emerald-300"
            onClick={() => setActiveTab('operations')} actionLabel="Operations" />
          <KpiTile icon={Users} label="Active Staff" value={kpis.activeStaff} sub={`${peopleStats.deptCount} depts`} color="text-white"
            onClick={() => setActiveTab('people')} actionLabel="People view" />
          <KpiTile icon={Receipt} label="Pending Approvals" value={totalPendingApprovals} sub="cost / advance / ops" color="text-amber-300" urgent={totalPendingApprovals > 10}
            onClick={() => setActiveTab('financial')} actionLabel="Review now" />
          <KpiTile icon={Flag} label="Overdue Milestones" value={kpis.overdueMilestones} sub="across portfolio" color="text-white" urgent={kpis.overdueMilestones > 0}
            onClick={() => setActiveTab('portfolio')} actionLabel="View milestones" />
          <KpiTile icon={Siren} label="Open Incidents" value={kpis.openIncidents} sub={`${kpis.criticalIncidents} critical`} color="text-white" urgent={kpis.criticalIncidents > 0}
            onClick={() => setActiveTab('risk')} actionLabel="Risk & Safety" />
          <KpiTile icon={Handshake} label="CRM Pipeline" value={fmtUSD(kpis.activePipeline)} sub={`${crmStats.activePipeline} opportunities`} color="text-blue-200"
            onClick={() => setActiveTab('partners')} actionLabel="CRM view" />
          <KpiTile icon={UserCheck} label="Pending Leave" value={kpis.pendingLeave} sub="awaiting approval" color="text-white" urgent={kpis.pendingLeave > 5}
            onClick={() => navigate('/leave-requests')} actionLabel="Review leave" />
        </div>
      </div>

      {/* ══ Alert Banner ═════════════════════════════════════════════════════ */}
      {(kpis.criticalIncidents > 0 || kpis.stalled > 0 || riskStats.overBudgetProjects.length > 0) && (
        <div className="flex flex-wrap gap-2 px-6 pt-4">
          {kpis.criticalIncidents > 0 && (
            <button onClick={() => setActiveTab('risk')} className="flex items-center gap-2 bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-red-700 transition-colors">
              <Siren className="h-3.5 w-3.5" />{kpis.criticalIncidents} CRITICAL INCIDENT{kpis.criticalIncidents > 1 ? 'S' : ''} OPEN — Action required
            </button>
          )}
          {kpis.stalled > 0 && (
            <button onClick={() => setActiveTab('portfolio')} className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-xs font-semibold px-4 py-2 rounded-xl hover:bg-red-100 transition-colors">
              <Clock className="h-3.5 w-3.5" />{kpis.stalled} stalled project{kpis.stalled > 1 ? 's' : ''}
            </button>
          )}
          {riskStats.overBudgetProjects.length > 0 && (
            <button onClick={() => setActiveTab('financial')} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 text-amber-800 dark:text-amber-300 text-xs font-semibold px-4 py-2 rounded-xl hover:bg-amber-100 transition-colors">
              <TrendingUp className="h-3.5 w-3.5" />{riskStats.overBudgetProjects.length} project{riskStats.overBudgetProjects.length > 1 ? 's' : ''} over budget
            </button>
          )}
        </div>
      )}

      {/* ══ Main Content ═════════════════════════════════════════════════════ */}
      <div className="px-4 sm:px-6 py-5 space-y-5 max-w-[1700px] mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-row flex-wrap h-auto w-full justify-start bg-muted/50 p-1 rounded-xl gap-0.5">
            {[
              ...(canAccessExecutive ? [{ id: 'executive', icon: Layers, label: 'Executive View' }] : []),
              { id: 'overview',   icon: LayoutDashboard, label: 'Overview' },
              { id: 'operations', icon: ClipboardList,   label: 'Operations' },
              { id: 'financial',  icon: DollarSign,      label: 'Financial', badge: totalPendingApprovals > 0 ? totalPendingApprovals : undefined },
              { id: 'portfolio',  icon: Briefcase,       label: 'Projects',  badge: kpis.stalled > 0 ? kpis.stalled : undefined },
              { id: 'people',     icon: Users,           label: 'People',    badge: peopleStats.pendingLeave > 0 ? peopleStats.pendingLeave : undefined },
              { id: 'partners',   icon: Handshake,       label: 'Partners & CRM' },
              { id: 'pipeline',   icon: TrendingUp,      label: 'Business Pipeline', badge: data.crmOpptys.filter((o: any) => ['negotiating','won'].includes(o.stage)).length > 0 ? data.crmOpptys.filter((o: any) => ['negotiating','won'].includes(o.stage)).length : undefined },
              { id: 'risk',       icon: ShieldAlert,     label: 'Risk & Safety', badge: kpis.openIncidents > 0 ? kpis.openIncidents : undefined },
              { id: 'tasks',      icon: CheckSquare,     label: 'Tasks', badge: taskStats.overdueCount > 0 ? taskStats.overdueCount : undefined },
            ].map(t => (
              <TabsTrigger key={t.id} value={t.id} className={cn('gap-1.5 text-xs font-semibold relative', t.id === 'executive' && 'bg-[#1D3461]/10 data-[state=active]:bg-[#1D3461] data-[state=active]:text-white')}>
                <t.icon className="h-3.5 w-3.5" />{t.label}
                {(t as any).badge !== undefined && (
                  <span className="ml-0.5 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {(t as any).badge}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ═══════════════ EXECUTIVE VIEW ═══════════════ */}
          {canAccessExecutive && (
          <TabsContent value="executive" className="mt-4 space-y-5">

            {/* Global Filter Bar */}
            <div className="flex flex-wrap gap-3 items-center p-4 bg-card border rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
                <Filter className="h-4 w-4" />
                Filters
              </div>
              <div className="flex flex-wrap gap-2 flex-1">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-muted-foreground font-medium">From</label>
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                    className="h-8 px-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-[#1D3461]"
                    data-testid="filter-date-from" />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-muted-foreground font-medium">To</label>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                    className="h-8 px-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-[#1D3461]"
                    data-testid="filter-date-to" />
                </div>
                <Select value={filterProjectType} onValueChange={setFilterProjectType}>
                  <SelectTrigger className="h-8 w-40 text-xs" data-testid="filter-project-type">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterClient} onValueChange={setFilterClient}>
                  <SelectTrigger className="h-8 w-44 text-xs" data-testid="filter-client">
                    <SelectValue placeholder="All Clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients / Donors</SelectItem>
                    {clientOptions.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                {(filterDateFrom || filterDateTo || filterProjectType !== 'all' || filterClient !== 'all') && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterProjectType('all'); setFilterClient('all'); }}>
                    Clear filters
                  </Button>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex-shrink-0">
                <span className="font-semibold text-foreground">{execFiltered.length}</span> projects in scope
              </div>
            </div>

            {/* Section 1: Business Pipeline */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-blue-600/10 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">1. Business Pipeline</h2>
                  <p className="text-[11px] text-muted-foreground">Revenue funnel from prospect to delivered value</p>
                </div>
                <button onClick={() => navigate('/crm/opportunities')} className="ml-auto text-[11px] text-[#1D3461] hover:underline flex items-center gap-1">
                  Open CRM <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {businessPipeline.stageBarData.map(stage => (
                  <button key={stage.stage}
                    onClick={() => navigate(stage.stage.includes('Project') || stage.stage === 'Completed' ? '/projects' : '/crm/opportunities')}
                    className="rounded-xl border bg-card p-3 text-left hover:shadow-md hover:border-[#1D3461]/30 transition-all"
                    data-testid={`pipeline-stage-${stage.stage.toLowerCase().replace(/\s+/g,'-')}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.fill }} />
                      <span className="text-[11px] font-semibold text-muted-foreground truncate">{stage.stage}</span>
                    </div>
                    <div className="text-xl font-bold text-foreground">
                      {stage.value > 0 ? (stage.value >= 1e6 ? `$${(stage.value/1e6).toFixed(1)}M` : stage.value >= 1000 ? `$${(stage.value/1000).toFixed(0)}K` : `$${stage.value.toFixed(0)}`) : stage.count}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{stage.count} {stage.count === 1 ? 'item' : 'items'}</div>
                  </button>
                ))}
              </div>
              {businessPipeline.topOpptys.length > 0 && (
                <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/20">
                    <span className="text-xs font-bold flex-1">Top Open Opportunities</span>
                    <button onClick={() => navigate('/crm/opportunities')} className="text-[11px] text-[#1D3461] hover:underline flex items-center gap-1">
                      View all <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="divide-y">
                    {businessPipeline.topOpptys.map(o => {
                      const stageCfg = CRM_STAGE_CFG[o.stage] ?? { label: o.stage, color: '#94a3b8' };
                      return (
                        <div key={o.id} onClick={() => navigate('/crm/opportunities')}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors">
                          <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: stageCfg.color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{o.title}</p>
                            <p className="text-[10px] text-muted-foreground">{fmtDate(o.expected_close_date)}</p>
                          </div>
                          <span className="text-xs font-bold text-[#1D3461]">{fmtUSD(o.value_usd)}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: stageCfg.color+'20', color: stageCfg.color }}>{stageCfg.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Delivery Health */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-emerald-600/10 flex items-center justify-center flex-shrink-0">
                  <Activity className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">2. Delivery Health</h2>
                  <p className="text-[11px] text-muted-foreground">RAG status across active projects — timeline, budget, activity, and flow progress</p>
                </div>
                <button onClick={() => setActiveTab('portfolio')} className="ml-auto text-[11px] text-[#1D3461] hover:underline flex items-center gap-1">
                  All Projects <ChevronRight className="h-3 w-3" />
                </button>
              </div>

              {/* RAG summary chips — 6 tiles */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[
                  { label: 'Critical', sub: 'Red — needs action', count: deliveryHealth.ragCounts.red, bg: 'bg-red-50 dark:bg-red-900/20 border-red-200', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
                  { label: 'At Risk', sub: 'Amber — monitor', count: deliveryHealth.ragCounts.amber, bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
                  { label: 'On Track', sub: 'Green — healthy', count: deliveryHealth.ragCounts.green, bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
                  { label: 'Stalled', sub: `${STALL_DAYS}+ days silent`, count: deliveryHealth.stalledList.length, bg: deliveryHealth.stalledList.length > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200' : 'bg-muted/30 border-border', text: deliveryHealth.stalledList.length > 0 ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground', dot: 'bg-slate-400' },
                  { label: 'Past End Date', sub: 'Timeline overdue', count: deliveryHealth.overdueList.length, bg: deliveryHealth.overdueList.length > 0 ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200' : 'bg-muted/30 border-border', text: deliveryHealth.overdueList.length > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-muted-foreground', dot: 'bg-orange-400' },
                  { label: 'Over Budget', sub: '>20% variance', count: deliveryHealth.overBudgetList.length, bg: deliveryHealth.overBudgetList.length > 0 ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200' : 'bg-muted/30 border-border', text: deliveryHealth.overBudgetList.length > 0 ? 'text-purple-700 dark:text-purple-400' : 'text-muted-foreground', dot: 'bg-purple-400' },
                ].map(r => (
                  <div key={r.label} className={cn('rounded-xl border p-3', r.bg)}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className={cn('h-2 w-2 rounded-full flex-shrink-0', r.dot)} />
                      <span className="text-[10px] text-muted-foreground font-medium leading-tight">{r.label}</span>
                    </div>
                    <div className={cn('text-xl font-bold', r.text)}>{r.count}</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{r.sub}</div>
                  </div>
                ))}
              </div>

              {/* Active project detail table */}
              {deliveryHealth.active.length > 0 && (
                <div className="rounded-xl border overflow-hidden bg-card shadow-sm">
                  {/* Table header */}
                  <div className="hidden lg:grid grid-cols-[2fr_60px_150px_150px_140px_130px_60px_36px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/40 border-b px-4 py-2 gap-3 items-center">
                    <span>Project</span>
                    <span>RAG</span>
                    <span>Timeline</span>
                    <span>Budget</span>
                    <span>Last Activity</span>
                    <span>Flow Stage</span>
                    <span className="text-center">Overdue</span>
                    <span />
                  </div>
                  <div className="divide-y max-h-[60vh] overflow-y-auto">
                    {deliveryHealth.active
                      .sort((a, b) => {
                        const r = (s: RAGStatus) => s === 'red' ? 3 : s === 'amber' ? 2 : s === 'green' ? 1 : 0;
                        return r(b.rag.overall) - r(a.rag.overall);
                      })
                      .map(p => {
                        const ragBg = (s: RAGStatus) =>
                          s === 'red' ? 'bg-red-500' :
                          s === 'amber' ? 'bg-amber-400' :
                          s === 'green' ? 'bg-emerald-500' : 'bg-slate-300';
                        const ragText = (s: RAGStatus) =>
                          s === 'red' ? 'text-red-700 dark:text-red-400' :
                          s === 'amber' ? 'text-amber-700 dark:text-amber-400' :
                          s === 'green' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500';
                        const ragPill = (s: RAGStatus) =>
                          s === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          s === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          s === 'green' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          'bg-slate-100 text-slate-500';

                        const timelineLabel =
                          p.rag.timeline === 'red' ? `${p.rag.daysOverdue}d overdue` :
                          p.rag.timeline === 'amber' ? `Due in ${p.daysLeft}d` :
                          p.daysLeft !== null ? `${p.daysLeft}d remaining` : 'No end date';

                        const budgetLabel = p.budget.total > 0
                          ? `${p.burnPct}% burned`
                          : 'No budget set';
                        const budgetSub = p.budget.total > 0
                          ? `${fmtMoney(p.budget.spent)} / ${fmtMoney(p.budget.total)}`
                          : '—';

                        const activityLabel =
                          p.lastActivityDays === null ? 'No activity logged' :
                          p.lastActivityDays === 0 ? 'Today' :
                          `${p.lastActivityDays}d ago`;

                        const flowPct = p.flow.total > 0 ? Math.round((p.flow.current / p.flow.total) * 100) : 0;

                        return (
                          <div key={p.id} className="grid grid-cols-1 lg:grid-cols-[2fr_60px_150px_150px_140px_130px_60px_36px] gap-3 px-4 py-3 items-center hover:bg-muted/30 transition-colors group">

                            {/* Project info */}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate leading-tight">{p.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{p.project_code}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-px rounded font-medium">
                                  {TYPE_LABELS[normaliseProjectType(p.project_type)] ?? p.project_type}
                                </span>
                                {p.status === 'onHold' && (
                                  <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-px rounded font-medium">On Hold</span>
                                )}
                              </div>
                            </div>

                            {/* RAG overall — colored dot + text */}
                            <div className="flex items-center gap-1.5 lg:flex-col lg:items-center lg:gap-1">
                              <div className={cn('h-3 w-3 rounded-full flex-shrink-0', ragBg(p.rag.overall))} />
                              <span className={cn('text-[10px] font-bold', ragText(p.rag.overall))}>
                                {p.rag.overall.toUpperCase()}
                              </span>
                            </div>

                            {/* Timeline */}
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={cn('text-[10px] font-semibold', ragText(p.rag.timeline))}>{timelineLabel}</span>
                              </div>
                              {p.end_date && (
                                <p className="text-[10px] text-muted-foreground">
                                  End: {format(safeDate(p.end_date)!, 'dd MMM yyyy')}
                                </p>
                              )}
                              {/* Timeline progress bar */}
                              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full transition-all', p.rag.timeline === 'red' ? 'bg-red-500' : p.rag.timeline === 'amber' ? 'bg-amber-400' : 'bg-emerald-500')}
                                  style={{ width: `${Math.min(100, p.timelinePct)}%` }}
                                />
                              </div>
                              <p className="text-[9px] text-muted-foreground">{Math.round(p.timelinePct)}% elapsed</p>
                            </div>

                            {/* Budget */}
                            <div className="space-y-1 min-w-0">
                              {p.budget.total > 0 ? (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <span className={cn('text-[10px] font-semibold', ragText(p.rag.budget))}>{budgetLabel}</span>
                                    {p.rag.budget !== 'green' && (
                                      <span className={cn('text-[9px] px-1.5 py-px rounded-full', ragPill(p.rag.budget))}>
                                        {p.rag.budgetVariancePct > 0 ? `+${p.rag.budgetVariancePct.toFixed(0)}% over` : 'Under budget'}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground truncate">{budgetSub}</p>
                                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={cn('h-full rounded-full transition-all', p.rag.budget === 'red' ? 'bg-red-500' : p.rag.budget === 'amber' ? 'bg-amber-400' : 'bg-emerald-500')}
                                      style={{ width: `${Math.min(100, p.burnPct)}%` }}
                                    />
                                  </div>
                                </>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic">No budget configured</span>
                              )}
                            </div>

                            {/* Last Activity */}
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={cn(
                                  'text-[10px] font-semibold',
                                  p.rag.isStalled ? 'text-red-600 dark:text-red-400' :
                                  (p.lastActivityDays ?? 0) > 7 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                                )}>
                                  {activityLabel}
                                </span>
                                {p.rag.isStalled && (
                                  <span className="text-[9px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-px rounded-full font-bold">STALLED</span>
                                )}
                              </div>
                              {p.lastActivityDate && (
                                <p className="text-[10px] text-muted-foreground">
                                  {format(p.lastActivityDate, 'dd MMM yyyy')}
                                </p>
                              )}
                              {!p.lastActivityDate && (
                                <p className="text-[10px] text-muted-foreground">No flow advance recorded</p>
                              )}
                            </div>

                            {/* Flow Stage */}
                            <div className="space-y-1 min-w-0">
                              <p className="text-[10px] font-medium truncate leading-tight">{p.flow.stageName}</p>
                              <p className="text-[10px] text-muted-foreground">Stage {p.flow.current} of {p.flow.total}</p>
                              {p.flow.total > 0 && (
                                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-[#1D3461] transition-all"
                                    style={{ width: `${flowPct}%` }}
                                  />
                                </div>
                              )}
                            </div>

                            {/* Overdue milestones */}
                            <div className="flex items-center justify-center lg:justify-start">
                              {p.overdueMilestones > 0 ? (
                                <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full">
                                  {p.overdueMilestones}
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">—</span>
                              )}
                            </div>

                            {/* Navigate */}
                            <button
                              onClick={() => navigate(`/projects/${p.id}`)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-[#1D3461] hover:bg-[#1D3461]/10 opacity-0 group-hover:opacity-100 transition-all"
                              title="Open project"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Alert banners for critical issues */}
              {(deliveryHealth.overdueList.length > 0 || deliveryHealth.stalledList.length > 0 || deliveryHealth.overBudgetList.length > 0) && (
                <div className="space-y-2">
                  {deliveryHealth.overdueList.length > 0 && (
                    <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 px-4 py-3">
                      <p className="text-[11px] font-bold text-red-700 dark:text-red-400 mb-1.5 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {deliveryHealth.overdueList.length} project{deliveryHealth.overdueList.length > 1 ? 's' : ''} past end date
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {deliveryHealth.overdueList.slice(0, 6).map(p => (
                          <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                            className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full hover:bg-red-200 transition-colors font-medium">
                            {p.name} · {p.rag.daysOverdue}d
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {deliveryHealth.stalledList.length > 0 && (
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 px-4 py-3">
                      <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {deliveryHealth.stalledList.length} project{deliveryHealth.stalledList.length > 1 ? 's' : ''} stalled — no flow activity in {STALL_DAYS}+ days
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {deliveryHealth.stalledList.slice(0, 6).map(p => (
                          <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                            className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full hover:bg-amber-200 transition-colors font-medium">
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {deliveryHealth.overBudgetList.length > 0 && (
                    <div className="rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 px-4 py-3">
                      <p className="text-[11px] font-bold text-purple-700 dark:text-purple-400 mb-1.5 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {deliveryHealth.overBudgetList.length} project{deliveryHealth.overBudgetList.length > 1 ? 's' : ''} over budget by more than 20%
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {deliveryHealth.overBudgetList.slice(0, 6).map(p => (
                          <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                            className="text-[10px] bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full hover:bg-purple-200 transition-colors font-medium">
                            {p.name} · +{p.rag.budgetVariancePct.toFixed(0)}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {deliveryHealth.active.length === 0 && (
                <div className="flex flex-col items-center py-10 text-muted-foreground gap-2 border-2 border-dashed rounded-2xl">
                  <CheckCircle2 className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No active projects found for the selected filters</p>
                </div>
              )}
            </div>

            {/* Section 3: Financial Overview */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-violet-600/10 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="h-3.5 w-3.5 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">3. Financial Overview</h2>
                  <p className="text-[11px] text-muted-foreground">Consolidated budget, expenditure, approvals, and withdrawals</p>
                </div>
                <button onClick={() => setActiveTab('financial')} className="ml-auto text-[11px] text-[#1D3461] hover:underline flex items-center gap-1">
                  Finance Detail <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Total Budget Committed', value: fmtMoney(financialOverview.totalBudget), sub: `${execFiltered.filter(p=>p.budget.total>0).length} projects`, bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200', icon: Wallet, iconCls: 'text-blue-600', action: () => setActiveTab('financial') },
                  { label: 'Total Expenditure', value: fmtMoney(financialOverview.totalSpent), sub: `${financialOverview.burnPct}% burn rate`, bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200', icon: TrendingUp, iconCls: 'text-amber-600', action: () => setActiveTab('financial') },
                  { label: 'Pending Approvals', value: String(financialOverview.pendingApprovalsCount), sub: fmtMoney(financialOverview.pendingApprovalsValue) + ' value', bg: financialOverview.pendingApprovalsCount > 10 ? 'bg-red-50 dark:bg-red-900/20 border-red-200' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200', icon: ClipboardList, iconCls: financialOverview.pendingApprovalsCount > 10 ? 'text-red-600' : 'text-orange-600', action: () => setActiveTab('financial') },
                  { label: 'Outstanding Withdrawals', value: String(financialOverview.outstandingWithdrawalsCount), sub: 'approved / paid requests', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200', icon: Receipt, iconCls: 'text-emerald-600', action: () => navigate('/finance') },
                ].map(k => (
                  <button key={k.label} onClick={k.action}
                    className={cn('rounded-2xl border p-4 text-left hover:shadow-md transition-all', k.bg)}
                    data-testid={`fin-kpi-${k.label.toLowerCase().replace(/\s+/g,'-')}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <k.icon className={cn('h-4 w-4', k.iconCls)} />
                      <span className="text-[11px] text-muted-foreground font-medium">{k.label}</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{k.value}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>
                  </button>
                ))}
              </div>
              {/* Subscription + Payroll Total Cost Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border p-4 bg-violet-50 dark:bg-violet-900/20 border-violet-200" data-testid="fin-kpi-subscription-monthly-cost">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="h-4 w-4 text-violet-600" />
                    <span className="text-[11px] text-muted-foreground font-medium">Monthly Subscription Cost</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {subscriptionStats.hasData ? fmtMoney(subscriptionStats.totalMonthlyCents) : '—'}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{subscriptionStats.activeCount} active subscriptions</div>
                  {subscriptionStats.renewingSoon > 0 && (
                    <div className="mt-1 text-[10px] text-amber-600 font-semibold">{subscriptionStats.renewingSoon} renewal{subscriptionStats.renewingSoon > 1 ? 's' : ''} due in 30 days</div>
                  )}
                </div>
                <div className="rounded-2xl border p-4 bg-slate-50 dark:bg-slate-900/20 border-slate-200" data-testid="fin-kpi-latest-payroll-cost">
                  <div className="flex items-center gap-2 mb-2">
                    <BadgeDollarSign className="h-4 w-4 text-slate-600" />
                    <span className="text-[11px] text-muted-foreground font-medium">Latest Payroll Gross</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {d?.payrollRuns?.[0] ? fmtMoney(d.payrollRuns[0].total_gross_cents ?? 0) : '—'}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {d?.payrollRuns?.[0] ? `${fmtDate(d.payrollRuns[0].period_start)} – ${fmtDate(d.payrollRuns[0].period_end)}` : 'No payroll run recorded'}
                  </div>
                </div>
                <div className={cn('rounded-2xl border p-4', subscriptionStats.hasData ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200' : 'bg-muted/30 border-border')} data-testid="fin-kpi-total-org-cost">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-teal-600" />
                    <span className="text-[11px] text-muted-foreground font-medium">Total Org Cost (Est.)</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {(() => {
                      const payrollCents = d?.payrollRuns?.[0]?.total_gross_cents ?? 0;
                      const subsCents = subscriptionStats.totalMonthlyCents;
                      return fmtMoney(payrollCents + subsCents);
                    })()}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Payroll + subscriptions (monthly)</div>
                </div>
              </div>
              {/* Budget by type sparkline */}
              {financialOverview.typeSpend.length > 0 && (
                <div className="rounded-2xl border bg-card shadow-sm p-4">
                  <p className="text-xs font-bold mb-3">Budget Committed by Project Type</p>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={financialOverview.typeSpend} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-15} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => [`SDG ${v.toLocaleString()}`, 'Budget']} />
                        <Bar dataKey="value" fill="#1D3461" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Section 4: People & Capacity */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-purple-600/10 flex items-center justify-center flex-shrink-0">
                  <Users className="h-3.5 w-3.5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">4. People & Capacity</h2>
                  <p className="text-[11px] text-muted-foreground">Team utilization, over-allocation, and upcoming capacity releases</p>
                </div>
                <button onClick={() => setActiveTab('people')} className="ml-auto text-[11px] text-[#1D3461] hover:underline flex items-center gap-1">
                  People Detail <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Active Staff', value: String(peopleCapacity.totalActive), icon: Users },
                  { label: 'Assigned to Projects', value: String(peopleCapacity.assignedCount), icon: Briefcase },
                  { label: 'Avg. Assignments', value: String(peopleCapacity.avgAssignments), icon: BarChart3 },
                  { label: 'Over-Capacity (≥3)', value: String(peopleCapacity.overCapacityList.length), icon: AlertTriangle, urgent: peopleCapacity.overCapacityList.length > 0 },
                ].map(k => (
                  <div key={k.label} className={cn('rounded-xl border bg-card p-4 text-center', (k as any).urgent && k.value !== '0' ? 'border-red-200 bg-red-50 dark:bg-red-900/10' : '')}>
                    <k.icon className={cn('h-4 w-4 mx-auto mb-2', (k as any).urgent && k.value !== '0' ? 'text-red-500' : 'text-muted-foreground')} />
                    <div className={cn('text-2xl font-bold', (k as any).urgent && k.value !== '0' ? 'text-red-700 dark:text-red-400' : 'text-foreground')}>{k.value}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{k.label}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Over-capacity staff */}
                <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/20">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs font-bold flex-1">Over-Capacity Staff ({peopleCapacity.overCapacityList.length})</span>
                    <button onClick={() => navigate('/admin/staff-profiles')} className="text-[11px] text-[#1D3461] hover:underline flex items-center gap-1">
                      Staff Directory <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                  {peopleCapacity.overCapacityList.length === 0 ? (
                    <div className="flex items-center gap-2 py-6 text-emerald-700 dark:text-emerald-400 justify-center">
                      <CheckCircle2 className="h-5 w-5" /><span className="text-sm">All staff within capacity</span>
                    </div>
                  ) : (
                    <div className="divide-y max-h-64 overflow-y-auto">
                      {peopleCapacity.overCapacityList.map(p => (
                        <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="h-7 w-7 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-red-700">
                            {p.full_name ? p.full_name.charAt(0).toUpperCase() : '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{p.full_name ?? 'Unknown'}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{p.role?.replace(/_/g,' ')}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-bold text-red-700 dark:text-red-400">{p.activeAssignments}</div>
                            <div className="text-[10px] text-muted-foreground">projects</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Upcoming capacity releases */}
                <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/20">
                    <Calendar className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs font-bold flex-1">Upcoming Capacity Releases (60d)</span>
                  </div>
                  {peopleCapacity.upcoming.length === 0 ? (
                    <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">No projects ending in 60 days</div>
                  ) : (
                    <div className="divide-y max-h-64 overflow-y-auto">
                      {peopleCapacity.upcoming.map(p => (
                        <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors">
                          <div className={cn('h-7 w-7 rounded-lg flex flex-col items-center justify-center flex-shrink-0 text-xs font-bold',
                            p.daysLeft <= 7 ? 'bg-red-100 text-red-700' : p.daysLeft <= 14 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
                            {p.daysLeft}d
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground">Ends {fmtDate(p.end_date)}</p>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* Staff utilization list */}
              {peopleCapacity.staffUtil.length > 0 && (
                <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/20">
                    <BarChart3 className="h-3.5 w-3.5 text-[#1D3461]" />
                    <span className="text-xs font-bold flex-1">Staff Utilization — Most Assigned</span>
                  </div>
                  <div className="p-4 space-y-2.5">
                    {peopleCapacity.staffUtil.map(p => {
                      const pct = Math.min(100, (p.activeAssignments / 5) * 100);
                      const barColor = p.activeAssignments >= 3 ? 'bg-red-500' : p.activeAssignments >= 2 ? 'bg-amber-500' : 'bg-emerald-500';
                      return (
                        <div key={p.id} className="flex items-center gap-3">
                          <div className="w-28 text-xs font-medium truncate flex-shrink-0">{p.full_name ?? 'Unknown'}</div>
                          <div className="flex-1 bg-muted/30 rounded-full h-2">
                            <div className={cn('h-2 rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-xs font-bold w-4 text-right">{p.activeAssignments}</span>
                            <span className="text-[10px] text-muted-foreground">proj</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Section 5: Time & Workload */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-teal-600/10 flex items-center justify-center flex-shrink-0">
                  <Timer className="h-3.5 w-3.5 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">5. Time & Workload</h2>
                  <p className="text-[11px] text-muted-foreground">Approved hours by department this week, utilisation signals, and missing timesheets</p>
                </div>
                <button onClick={() => navigate('/timesheets')} className="ml-auto text-[11px] text-[#1D3461] hover:underline flex items-center gap-1">
                  Timesheets <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              {!workloadStats ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground gap-2 border-2 border-dashed rounded-2xl">
                  <Timer className="h-7 w-7 opacity-30" />
                  <p className="text-sm">Timesheet data not yet available</p>
                  <p className="text-[11px] text-muted-foreground">This panel will populate once staff submit timesheets</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Department hours */}
                  <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/20">
                      <BarChart3 className="h-3.5 w-3.5 text-teal-600" />
                      <span className="text-xs font-bold flex-1">Approved Hours This Week — By Department</span>
                      <span className="text-[11px] text-muted-foreground font-semibold">{workloadStats.totalApprovedHoursWeek.toFixed(0)}h total</span>
                    </div>
                    {workloadStats.departmentList.length === 0 ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">No approved timesheets for this week yet</div>
                    ) : (
                      <div className="p-4 space-y-2.5">
                        {workloadStats.departmentList.map(dept => {
                          const pct = workloadStats.avgHoursPerDept > 0 ? (dept.hours / workloadStats.avgHoursPerDept) : 1;
                          const isOver = pct > 1.3;
                          const isUnder = pct < 0.7;
                          const barColor = isOver ? 'bg-red-500' : isUnder ? 'bg-amber-400' : 'bg-teal-500';
                          return (
                            <div key={dept.deptName} className="flex items-center gap-3">
                              <div className="w-28 text-xs font-medium truncate flex-shrink-0">{dept.deptName}</div>
                              <div className="flex-1 bg-muted/30 rounded-full h-2">
                                <div className={cn('h-2 rounded-full transition-all', barColor)} style={{ width: `${Math.min(100, (dept.hours / Math.max(...workloadStats.departmentList.map(d => d.hours), 1)) * 100)}%` }} />
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className={cn('text-xs font-bold w-10 text-right', isOver ? 'text-red-600' : isUnder ? 'text-amber-600' : '')}>{dept.hours.toFixed(0)}h</span>
                                {isOver && <span className="text-[9px] text-red-600 font-bold">HIGH</span>}
                                {isUnder && <span className="text-[9px] text-amber-600 font-bold">LOW</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* Missing timesheets */}
                  <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/20">
                      <AlertTriangle className={cn('h-3.5 w-3.5', workloadStats.missingCount > 0 ? 'text-amber-500' : 'text-muted-foreground')} />
                      <span className="text-xs font-bold flex-1">Missing Timesheets This Week</span>
                      <span className={cn('text-[11px] font-bold', workloadStats.missingCount > 0 ? 'text-amber-600' : 'text-emerald-600')}>{workloadStats.missingCount} staff</span>
                    </div>
                    {workloadStats.missingCount === 0 ? (
                      <div className="flex items-center gap-2 py-6 text-emerald-700 dark:text-emerald-400 justify-center">
                        <CheckCircle2 className="h-5 w-5" /><span className="text-sm">All staff submitted timesheets this week</span>
                      </div>
                    ) : (
                      <div className="divide-y max-h-52 overflow-y-auto">
                        {workloadStats.missingList.map(p => (
                          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="h-7 w-7 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-amber-700">
                              {p.full_name ? p.full_name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">{p.full_name ?? 'Unknown'}</p>
                              <p className="text-[10px] text-muted-foreground capitalize">{p.role?.replace(/_/g,' ')}</p>
                            </div>
                            <span className="text-[10px] text-amber-600 font-semibold flex-shrink-0">No submission</span>
                          </div>
                        ))}
                        {workloadStats.missingCount > 8 && (
                          <div className="px-4 py-2 text-[11px] text-muted-foreground text-center">+{workloadStats.missingCount - 8} more</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Section 6: Accountability Feed */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-red-600/10 flex items-center justify-center flex-shrink-0">
                  <Activity className="h-3.5 w-3.5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">6. Accountability Feed</h2>
                  <p className="text-[11px] text-muted-foreground">Escalations, overdue items, pending reviews, and renewal alerts requiring leadership attention</p>
                </div>
              </div>
              {accountabilityFeed.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-emerald-700 dark:text-emerald-400 gap-2 border-2 border-dashed border-emerald-200 rounded-2xl">
                  <CheckCircle2 className="h-7 w-7" />
                  <p className="text-sm font-semibold">All clear — no accountability items</p>
                  <p className="text-[11px] text-muted-foreground">No escalations, overdue tasks, or pending approvals requiring your attention</p>
                </div>
              ) : (
                <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                  <div className="divide-y">
                    {accountabilityFeed.map(item => {
                      const urgencyConfig = {
                        critical: { bg: 'bg-red-50 dark:bg-red-900/10', dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400', badge: 'bg-red-100 text-red-700' },
                        high: { bg: 'bg-amber-50 dark:bg-amber-900/10', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', badge: 'bg-amber-100 text-amber-700' },
                        medium: { bg: '', dot: 'bg-blue-400', text: 'text-blue-700 dark:text-blue-400', badge: 'bg-blue-100 text-blue-700' },
                      }[item.urgency];
                      const typeIcon = {
                        overdue_task: CheckSquare,
                        timesheet_pending: Timer,
                        subscription_renewal: CreditCard,
                        incident: Siren,
                        stalled_project: Clock,
                        pending_approval: Receipt,
                      }[item.type];
                      const IconComp = typeIcon;
                      return (
                        <div key={item.id} className={cn('flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors', urgencyConfig.bg)} data-testid={`feed-item-${item.id}`}>
                          <div className={cn('h-6 w-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', urgencyConfig.badge)}>
                            <IconComp className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold">{item.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{item.sub}</p>
                          </div>
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 capitalize', urgencyConfig.badge)}>
                            {item.urgency}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          </TabsContent>
          )}

          {/* ═══════════════ OVERVIEW ═══════════════ */}
          <TabsContent value="overview" className="mt-4 space-y-4">

            {/* Org-wide Task Health */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden" data-testid="section-task-health">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/20">
                <div className="h-7 w-7 rounded-lg bg-indigo-600/10 flex items-center justify-center flex-shrink-0">
                  <CheckSquare className="h-3.5 w-3.5 text-indigo-600" />
                </div>
                <span className="text-sm font-bold flex-1">Org-wide Task Health</span>
                <button onClick={() => navigate('/tasks')} className="text-[11px] text-[#1D3461] hover:underline flex items-center gap-1">
                  View tasks <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              <div className="p-4">
                {/* Status breakdown cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Open', value: taskStats.openCount, bg: 'bg-slate-50 dark:bg-slate-900/20 border-slate-200', text: 'text-slate-700', action: () => navigate('/tasks?status=todo') },
                    { label: 'In Progress', value: taskStats.inProgressCount, bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200', text: 'text-blue-700', action: () => navigate('/tasks?status=in_progress') },
                    { label: 'Overdue', value: taskStats.overdueCount, bg: taskStats.overdueCount > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200' : 'bg-slate-50 border-slate-200', text: taskStats.overdueCount > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-500', action: () => navigate('/tasks?filter=overdue') },
                    { label: 'Done This Month', value: taskStats.completedThisMonthCount, bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200', text: 'text-emerald-700', action: () => navigate('/tasks?filter=done') },
                  ].map(k => (
                    <button key={k.label} onClick={k.action} className={cn('rounded-xl border p-3 text-left hover:shadow-sm transition-all', k.bg)} data-testid={`task-status-${k.label.toLowerCase().replace(/\s+/g,'-')}`}>
                      <div className={cn('text-2xl font-bold', k.text)}>{k.value}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{k.label}</div>
                    </button>
                  ))}
                </div>
                {/* Overdue by department */}
                {taskStats.overdueCount > 0 && taskStats.overdueByDept.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground mb-2 uppercase tracking-wider">Overdue tasks by department</p>
                    <div className="space-y-1.5">
                      {taskStats.overdueByDept.map(dept => (
                        <div key={dept.deptName} className="flex items-center gap-3 py-1.5 border-b last:border-b-0">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium">{dept.deptName}</span>
                          </div>
                          <div className="flex-1 bg-muted/30 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-red-400" style={{ width: `${Math.min(100, (dept.count / taskStats.overdueCount) * 100)}%` }} />
                          </div>
                          <span className="text-xs font-bold text-red-600 w-6 text-right">{dept.count}</span>
                          <button onClick={() => navigate('/tasks?filter=overdue')} className="text-[10px] text-[#1D3461] hover:underline flex-shrink-0">
                            View <ChevronRight className="h-3 w-3 inline" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!taskStats.hasData && (
                  <p className="text-sm text-muted-foreground text-center py-4">No task data available yet</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

              {/* Project status breakdown */}
              <SectionCard icon={Briefcase} title="Project Portfolio" action={() => setActiveTab('portfolio')} actionLabel="Portfolio">
                <div className="space-y-0">
                  {Object.entries(STATUS_CFG).map(([status, cfg]) => {
                    const count = enriched.filter(p => p.status === status).length;
                    if (count === 0) return null;
                    const pct = enriched.length > 0 ? Math.round((count / enriched.length) * 100) : 0;
                    return (
                      <div key={status} className="flex items-center gap-3 py-2 border-b last:border-b-0">
                        <div className={cn('h-2 w-2 rounded-full flex-shrink-0', cfg.dot)} />
                        <span className="text-xs font-medium flex-1">{cfg.label}</span>
                        <Progress value={pct} className="h-1.5 w-20" />
                        <span className="text-xs font-bold w-6 text-right">{count}</span>
                      </div>
                    );
                  })}
                  <div className="mt-3 pt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
                      <p className="font-bold text-red-600">{kpis.stalled}</p><p className="text-muted-foreground">Stalled</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
                      <p className="font-bold text-amber-600">{kpis.atRisk}</p><p className="text-muted-foreground">At Risk</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2">
                      <p className="font-bold text-emerald-600">{enriched.filter(p => p.health === 'on-track').length}</p><p className="text-muted-foreground">On Track</p>
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* MMP & Field Ops snapshot */}
              <SectionCard icon={ClipboardList} title="Field Operations Snapshot" action={() => { navigate('/mmp'); }} actionLabel="MMP">
                <StatRow label="Active MMPs" value={mmpStats.byStatus.approved + mmpStats.byStatus.verified} />
                <StatRow label="Pending Verification" value={mmpStats.byStatus.pending} color={mmpStats.byStatus.pending > 0 ? 'text-amber-600' : undefined} />
                <StatRow label="Total Sites Planned" value={mmpStats.totalEntries.toLocaleString()} />
                <StatRow label="Sites Completed" value={mmpStats.completedSites.toLocaleString()} color="text-emerald-600" />
                <StatRow label="Coverage Rate" value={`${kpis.coveragePct}%`} color={kpis.coveragePct >= 80 ? 'text-emerald-600' : 'text-amber-600'} />
                <StatRow label="In Progress" value={mmpStats.inProgressSites.toLocaleString()} />
              </SectionCard>

              {/* Pending approvals */}
              {canFinance && (
                <SectionCard icon={Receipt} title="Pending Financial Approvals" action={() => setActiveTab('financial')} actionLabel="Financial">
                  <div className="space-y-2 mt-1">
                    <ApprovalBadge count={kpis.pendingCosts} label="Cost Reimbursements" urgent={kpis.pendingCosts > 5} />
                    <ApprovalBadge count={kpis.pendingDown} label="Down Payment Requests" urgent={kpis.pendingDown > 3} />
                    <ApprovalBadge count={kpis.pendingOp} label="Operational Cost Claims" />
                    {totalPendingApprovals === 0 && (
                      <div className="flex items-center gap-2 py-3 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" /><span className="text-sm font-medium">All approvals up to date</span>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2 text-[11px] text-center">
                      <div className="bg-muted/30 rounded-lg p-2">
                        <p className="font-bold text-lg text-[#1D3461]">{fmtMoney(kpis.totalBudget)}</p>
                        <p className="text-muted-foreground">Total Budget</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2">
                        <p className={cn('font-bold text-lg', kpis.portfolioBurn > 90 ? 'text-red-600' : 'text-emerald-600')}>{kpis.portfolioBurn}%</p>
                        <p className="text-muted-foreground">Burn Rate</p>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              )}

              {/* People snapshot */}
              <SectionCard icon={Users} title="People Snapshot" action={() => setActiveTab('people')} actionLabel="People">
                <StatRow label="Total Staff" value={peopleStats.total} />
                <StatRow label="Active" value={peopleStats.active} color="text-emerald-600" />
                <StatRow label="Departments" value={peopleStats.deptCount} />
                <StatRow label="Pending Leave Requests" value={peopleStats.pendingLeave} color={peopleStats.pendingLeave > 0 ? 'text-amber-600' : undefined} />
                <StatRow label="Expiring Contracts (30d)" value={peopleStats.expiringContracts.length} color={peopleStats.expiringContracts.length > 0 ? 'text-red-600' : undefined} />
                <StatRow label="Contractors" value={peopleStats.byEmployment['contractor'] ?? 0} />
              </SectionCard>

              {/* Incidents & Safety */}
              <SectionCard icon={ShieldAlert} title="Safety & Risk" action={() => setActiveTab('risk')} actionLabel="Risk">
                <StatRow label="Open Incidents" value={riskStats.openIncidents.length} color={riskStats.openIncidents.length > 0 ? 'text-red-600' : 'text-emerald-600'} />
                <StatRow label="Critical" value={riskStats.criticalOpen} color={riskStats.criticalOpen > 0 ? 'text-red-600' : undefined} />
                <StatRow label="Resolved Last 30d" value={riskStats.resolvedRecently} color="text-emerald-600" />
                <StatRow label="Over Budget Projects" value={riskStats.overBudgetProjects.length} color={riskStats.overBudgetProjects.length > 0 ? 'text-red-600' : undefined} />
                <StatRow label="Overdue Milestones" value={riskStats.overdueMilestonesAll} color={riskStats.overdueMilestonesAll > 0 ? 'text-amber-600' : undefined} />
                <StatRow label="Equipment Damaged/Lost" value={equipStats.damaged + equipStats.lost} color={(equipStats.damaged + equipStats.lost) > 0 ? 'text-red-600' : undefined} />
              </SectionCard>

              {/* CRM Pipeline */}
              <SectionCard icon={Handshake} title="CRM Pipeline" action={() => setActiveTab('partners')} actionLabel="Partners">
                <StatRow label="Total Partners" value={crmStats.totalPartners} />
                <StatRow label="Active Partners" value={crmStats.activePartners} color="text-emerald-600" />
                <StatRow label="Open Opportunities" value={crmStats.activePipeline} />
                <StatRow label="Pipeline Value" value={fmtUSD(crmStats.totalPipelineValue)} color="text-[#1D3461]" />
                <StatRow label="Closing in 30 days" value={crmStats.closingSoon} color={crmStats.closingSoon > 0 ? 'text-amber-600' : undefined} />
                <StatRow label="Won This Year" value={fmtUSD(crmStats.wonValue)} color="text-emerald-600" />
              </SectionCard>
            </div>

            {/* Upcoming Milestones strip */}
            {upcomingMilestones.length > 0 && (
              <SectionCard icon={Flag} title={`${upcomingMilestones.length} Milestone${upcomingMilestones.length > 1 ? 's' : ''} Due — Next 30 Days`}>
                <div className="flex flex-wrap gap-2 mt-1">
                  {upcomingMilestones.slice(0, 8).map(m => (
                    <button key={m.id} onClick={() => navigate(`/projects/${m.projectId}?tab=milestones`)}
                      className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border text-left hover:shadow-sm transition-all',
                        m.daysLeft <= 3 ? 'bg-red-50 border-red-200 dark:bg-red-900/10' : m.daysLeft <= 7 ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/10' : 'bg-card border-border')}>
                      <div className={cn('h-7 w-7 rounded-lg flex flex-col items-center justify-center flex-shrink-0 font-bold text-xs',
                        m.daysLeft <= 3 ? 'bg-red-100 text-red-700' : m.daysLeft <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-[#1D3461]/10 text-[#1D3461]')}>
                        {m.daysLeft}d
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate max-w-[140px]">{m.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{m.projectName}</p>
                      </div>
                    </button>
                  ))}
                  {upcomingMilestones.length > 8 && (
                    <button onClick={() => setActiveTab('portfolio')} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-dashed text-xs text-muted-foreground hover:border-solid hover:text-foreground transition-all">
                      +{upcomingMilestones.length - 8} more <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </SectionCard>
            )}
          </TabsContent>

          {/* ═══════════════ OPERATIONS ═══════════════ */}
          <TabsContent value="operations" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

              {/* MMP Status — render canonical 5 buckets first, then any other
                   live statuses present in the data (forwarded_to_coordinator,
                   dispatched, in_progress, draft…) so the card reflects every
                   file rather than dropping unfamiliar statuses to zero. */}
              <SectionCard icon={ClipboardList} title="MMP File Status" action={() => navigate('/mmp')} actionLabel="Open MMP">
                {(() => {
                  const CANONICAL = ['approved', 'verified', 'pending', 'rejected', 'archived'] as const;
                  const COLORS: Record<string, string> = {
                    approved: 'text-emerald-600', verified: 'text-blue-600',
                    pending: 'text-amber-600', rejected: 'text-red-600', archived: 'text-slate-500',
                    in_progress: 'text-blue-600', inprogress: 'text-blue-600',
                    forwarded_to_fom: 'text-blue-500', forwarded_to_coordinator: 'text-blue-500',
                    forwarded_to_coordinators: 'text-blue-500', dispatched: 'text-indigo-600',
                    submitted: 'text-cyan-600', processed: 'text-emerald-500',
                    draft: 'text-slate-400', cancelled: 'text-red-500',
                  };
                  const prettify = (s: string) =>
                    s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  const extras = Object.entries(mmpStats.byStatus)
                    .filter(([k, v]) => v > 0 && !(CANONICAL as readonly string[]).includes(k))
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8);
                  return (
                    <>
                      {CANONICAL.map(s => (
                        <StatRow key={s} label={prettify(s)} value={mmpStats.byStatus[s] ?? 0} color={COLORS[s]} />
                      ))}
                      {extras.map(([s, v]) => (
                        <StatRow key={s} label={prettify(s)} value={v} color={COLORS[s] ?? 'text-slate-600'} />
                      ))}
                    </>
                  );
                })()}
              </SectionCard>

              {/* Site Visit Coverage */}
              <SectionCard icon={MapPin} title="Site Visit Coverage">
                <div className="mb-3">
                  <div className="flex items-end gap-2 mb-1">
                    <span className="text-3xl font-bold text-[#1D3461]" data-testid="text-coverage-pct">{kpis.coveragePct}%</span>
                    <span className="text-sm text-muted-foreground mb-1">overall coverage</span>
                  </div>
                  <Progress value={Math.min(100, Math.max(0, kpis.coveragePct))} className="h-3 rounded-full" />
                </div>
                <StatRow label="Total Planned Sites" value={mmpStats.totalEntries.toLocaleString()} />
                <StatRow label="Completed / Verified" value={mmpStats.completedSites.toLocaleString()} color="text-emerald-600" />
                <StatRow label="In Progress" value={mmpStats.inProgressSites.toLocaleString()} color="text-blue-600" />
                <StatRow label="Pending / Assigned" value={mmpStats.pendingSites.toLocaleString()} color="text-amber-600" />
                {mmpStats.returnedSites > 0 && (
                  <StatRow label="Returned / Recalled" value={mmpStats.returnedSites.toLocaleString()} color="text-orange-600" />
                )}
                {mmpStats.rejectedSites > 0 && (
                  <StatRow label="Rejected" value={mmpStats.rejectedSites.toLocaleString()} color="text-red-600" />
                )}
                {mmpStats.otherSites > 0 && (
                  <StatRow label="Other / Uncategorized" value={mmpStats.otherSites.toLocaleString()} color="text-slate-500" />
                )}
              </SectionCard>

              {/* Equipment */}
              <SectionCard icon={Package} title="Equipment Inventory" action={() => navigate('/equipment')} actionLabel="Equipment">
                <StatRow label="Total Assets" value={equipStats.total} />
                {Object.entries(equipStats.byStatus).map(([status, count]) => (
                  <StatRow key={status} label={status.charAt(0).toUpperCase() + status.slice(1)} value={count}
                    color={{ available: 'text-emerald-600', assigned: 'text-blue-600', maintenance: 'text-amber-600', damaged: 'text-red-600', lost: 'text-red-700' }[status]} />
                ))}
              </SectionCard>
            </div>

            {/* MMP Time-to-Complete by Hub (last 30 days) */}
            <SectionCard
              icon={Clock}
              title="MMP Time-to-Complete by Hub (last 30 days)"
              action={() => navigate('/mmp')}
              actionLabel="Open MMP"
            >
              {hubTimeToComplete.totalSamples === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-time-to-complete-data">
                  No sites completed with both dispatch and completion timestamps in the last 30 days.
                </p>
              ) : (
                <>
                  <div className="flex items-end gap-3 mb-3">
                    <span
                      className="text-2xl font-bold text-[#1D3461]"
                      data-testid="text-overall-median-time-to-complete"
                    >
                      {hubTimeToComplete.overallMedianMs !== null
                        ? formatDurationFromMs(hubTimeToComplete.overallMedianMs)
                        : '—'}
                    </span>
                    <span className="text-xs text-muted-foreground mb-1">
                      overall median across {hubTimeToComplete.totalSamples} site{hubTimeToComplete.totalSamples === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {hubTimeToComplete.rows.map(row => (
                      <div
                        key={row.hub}
                        className="flex items-center justify-between gap-3 py-1.5 border-b last:border-0"
                        data-testid={`row-hub-time-to-complete-${row.hub}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium truncate" data-testid={`text-hub-name-${row.hub}`}>
                            {row.hub}
                          </span>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {row.sampleCount} site{row.sampleCount === 1 ? '' : 's'}
                          </span>
                        </div>
                        <span
                          className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap"
                          data-testid={`text-hub-median-${row.hub}`}
                        >
                          {formatDurationFromMs(row.medianMs)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>

            {/* Field team heatmap — role distribution */}
            {d?.profiles && d.profiles.length > 0 && (
              <SectionCard icon={Users} title="Field Staff — Role Distribution" action={() => navigate('/admin/staff-profiles')} actionLabel="Staff Directory">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2 mt-2">
                  {Object.entries(peopleStats.byRole).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
                    <div key={role} className="bg-muted/30 rounded-xl p-3 text-center border" data-testid={`card-role-${role}`}>
                      <p className="text-xl font-bold text-[#1D3461]" data-testid={`text-role-count-${role}`}>{count}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                        {prettyRoleLabel(role)}
                      </p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </TabsContent>

          {/* ═══════════════ FINANCIAL ═══════════════ */}
          <TabsContent value="financial" className="mt-4 space-y-4">
            {!canFinance ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground gap-3 border-2 border-dashed rounded-2xl">
                <DollarSign className="h-10 w-10 opacity-30" />
                <p className="text-sm">Financial data is restricted to admin and finance roles</p>
              </div>
            ) : (
              <>
                {/* Summary row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Portfolio Budget', value: fmtMoney(finStats.totalBudget), color: 'text-[#1D3461]', bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200' },
                    { label: 'Total Spent', value: fmtMoney(finStats.totalSpent), color: 'text-amber-700', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200' },
                    { label: 'Portfolio Burn', value: `${kpis.portfolioBurn}%`, color: kpis.portfolioBurn > 90 ? 'text-red-600' : 'text-emerald-700', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200' },
                    { label: 'Over Budget Projects', value: riskStats.overBudgetProjects.length, color: riskStats.overBudgetProjects.length > 0 ? 'text-red-600' : 'text-emerald-600', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200' },
                  ].map(k => (
                    <div key={k.label} className={cn('rounded-2xl border p-4', k.bg)}>
                      <p className={cn('text-2xl font-bold', k.color)}>{k.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {/* Pending approvals detail */}
                  <SectionCard icon={Receipt} title="Pending Approval Queue">
                    <div className="space-y-2 mt-1">
                      <ApprovalBadge count={finStats.costSubPending} label="Cost Reimbursements awaiting approval" urgent={finStats.costSubPending > 5} />
                      <ApprovalBadge count={finStats.downPayPending} label="Down Payment Requests (Tier 1/2)" urgent={finStats.downPayPending > 3} />
                      <ApprovalBadge count={finStats.opCostPending} label="Operational Cost Claims" />
                      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-center pt-2 border-t">
                        <div className="bg-muted/30 rounded-lg p-2">
                          <p className="font-bold">{finStats.costSubApproved}</p><p className="text-muted-foreground">Costs Approved</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2">
                          <p className="font-bold">{fmtMoney(finStats.downPayTotal)}</p><p className="text-muted-foreground">Advances Total</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2">
                          <p className="font-bold">{fmtMoney(finStats.opCostTotal)}</p><p className="text-muted-foreground">Op Costs Total</p>
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  {/* Payroll runs */}
                  <SectionCard icon={BadgeDollarSign} title="Recent Payroll Runs" action={() => navigate('/hr?tab=payroll')} actionLabel="Payroll">
                    {finStats.payrollData.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No payroll runs recorded</p>
                    ) : (
                      <>
                        <div className="h-40">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={finStats.payrollData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                              <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => [`SDG ${v.toLocaleString()}`, 'Gross']} />
                              <Bar dataKey="gross" fill="#1D3461" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        {finStats.latestPayroll && (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <Badge className={cn('text-[10px]', finStats.latestPayroll.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                              {finStats.latestPayroll.status}
                            </Badge>
                            <span className="text-muted-foreground">Latest: {fmtDate(finStats.latestPayroll.period_start)} – {fmtDate(finStats.latestPayroll.period_end)}</span>
                          </div>
                        )}
                      </>
                    )}
                  </SectionCard>
                </div>

                {/* Budget vs Actual chart */}
                {finStats.budgetBarData.length > 0 && (
                  <SectionCard icon={BarChart2} title="Budget vs. Spent by Project (Top 10)">
                    <div className="h-64 mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={finStats.budgetBarData} barGap={2} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number, name: string) => [`SDG ${v.toLocaleString()}`, name === 'total' ? 'Budget' : 'Spent']} labelFormatter={(l, p) => p?.[0]?.payload?.fullName ?? l} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="total" name="Budget" fill="#1D3461" opacity={0.25} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="spent" name="Spent" radius={[4, 4, 0, 0]}>
                            {finStats.budgetBarData.map((e, i) => <Cell key={i} fill={e.burn >= 100 ? '#ef4444' : e.burn >= 80 ? '#f59e0b' : '#10b981'} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Under 80%</span>
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />80–100%</span>
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Over budget</span>
                    </div>
                  </SectionCard>
                )}
              </>
            )}
          </TabsContent>

          {/* ═══════════════ PORTFOLIO / PROJECTS ═══════════════ */}
          <TabsContent value="portfolio" className="mt-4 space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={projectSearch} onChange={e => setProjectSearch(e.target.value)} placeholder="Search projects…" className="pl-9 h-9 text-sm" />
              </div>
              <Select value={projectStatusFilter} onValueChange={setProjectStatusFilter}>
                <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_CFG).map(([v, c]) => <SelectItem key={v} value={v} className="text-xs">{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-auto">{filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Health matrix */}
            <div className="rounded-xl border overflow-hidden bg-card shadow-sm">
              <div className="grid grid-cols-[minmax(160px,2fr)_90px_110px_130px_minmax(100px,1fr)_80px_36px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/40 border-b px-4 py-2.5 gap-2">
                <span>Project</span><span>Type</span><span>Health</span><span>Flow Progress</span><span>Next Milestone</span><span className="text-right">Burn</span><span />
              </div>
              {filteredProjects.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                  <Briefcase className="h-8 w-8 opacity-30" /><p className="text-sm">No projects match</p>
                </div>
              ) : (
                <div className="divide-y max-h-[60vh] overflow-y-auto">
                  {filteredProjects.map(p => {
                    const hCfg = HEALTH_CFG[p.health];
                    const sCfg = STATUS_CFG[p.status] ?? STATUS_CFG.draft;
                    const flowPct = p.flow.total > 0 ? Math.round((p.flow.current / p.flow.total) * 100) : 0;
                    const burnColor = p.burnPct >= 100 ? 'text-red-600' : p.burnPct >= 80 ? 'text-amber-600' : 'text-emerald-600';
                    return (
                      <div key={p.id} className="grid grid-cols-[minmax(160px,2fr)_90px_110px_130px_minmax(100px,1fr)_80px_36px] gap-2 px-4 py-2.5 items-center hover:bg-muted/30 transition-colors group">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{p.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[10px] text-muted-foreground font-mono">{p.project_code}</span>
                            <Badge className={cn('text-[9px] px-1', sCfg.badge)}>{sCfg.label}</Badge>
                            {p.overdueMilestones > 0 && <Badge className="text-[9px] px-1 bg-red-100 text-red-700">{p.overdueMilestones} overdue</Badge>}
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground truncate">{TYPE_LABELS[normaliseProjectType(p.project_type)] ?? p.project_type}</span>
                        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', hCfg.bg, hCfg.text)}>{hCfg.icon}{hCfg.label}</span>
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Progress value={flowPct} className="h-1.5 flex-1" />
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">{p.flow.current}/{p.flow.total}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{p.flow.stageName}</p>
                        </div>
                        <div className="min-w-0">
                          {p.nextMilestone ? (
                            <><p className="text-[11px] truncate">{p.nextMilestone.title}</p><p className="text-[10px] text-muted-foreground">{fmtDate(p.nextMilestone.due_date)}</p></>
                          ) : <span className="text-[11px] text-muted-foreground/40">—</span>}
                        </div>
                        {canFinance ? (
                          <div className="text-right"><p className={cn('text-sm font-bold', burnColor)}>{p.burnPct}%</p><p className="text-[10px] text-muted-foreground">{fmtMoney(p.budget.spent)}</p></div>
                        ) : <div className="text-right text-[11px] text-muted-foreground/40">—</div>}
                        <button onClick={() => navigate(`/projects/${p.id}`)} className="p-1 rounded text-muted-foreground hover:text-[#1D3461] opacity-0 group-hover:opacity-100 transition-all">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pipeline Kanban */}
            {pipelineGroups.length > 0 && (
              <SectionCard icon={Zap} title="Active Pipeline — Flow Stage Board">
                <div className="overflow-x-auto pb-2 mt-2">
                  <div className="flex gap-3 min-w-max">
                    {pipelineGroups.map((group, gi) => (
                      <div key={gi} className="w-52 flex-shrink-0">
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <div className="h-2 w-2 rounded-full bg-[#1D3461]" />
                          <span className="text-xs font-bold truncate">{group.stageLabel}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 ml-auto">{group.projects.length}</Badge>
                        </div>
                        <div className="space-y-2">
                          {group.projects.map(p => {
                            const hCfg = HEALTH_CFG[p.health];
                            return (
                              <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                                className="bg-card border rounded-xl p-3 cursor-pointer hover:shadow-md hover:border-[#1D3461]/30 transition-all">
                                <p className="text-xs font-semibold line-clamp-2 mb-1">{p.name}</p>
                                <p className="text-[10px] font-mono text-muted-foreground mb-2">{p.project_code}</p>
                                <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full', hCfg.bg, hCfg.text)}>
                                  {hCfg.icon}{hCfg.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>
            )}

            {/* Milestone Timeline */}
            <MilestoneTimeline milestones={milestones} projects={enriched} onNavigate={(pid) => navigate(`/projects/${pid}?tab=milestones`)} />
          </TabsContent>

          {/* ═══════════════ PEOPLE ═══════════════ */}
          <TabsContent value="people" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

              {/* Staff counts */}
              <SectionCard icon={Users} title="Workforce Overview" action={() => navigate('/admin/staff-profiles')} actionLabel="Staff Directory">
                <StatRow label="Total Profiles" value={peopleStats.total} />
                <StatRow label="Active Staff" value={peopleStats.active} color="text-emerald-600" />
                <StatRow label="Full-time" value={peopleStats.byEmployment['full-time'] ?? 0} />
                <StatRow label="Part-time" value={peopleStats.byEmployment['part-time'] ?? 0} />
                <StatRow label="Contractors" value={peopleStats.byEmployment['contractor'] ?? 0} />
                <StatRow label="Interns" value={peopleStats.byEmployment['intern'] ?? 0} />
                <StatRow label="Departments" value={peopleStats.deptCount} />
              </SectionCard>

              {/* Leave requests */}
              <SectionCard icon={Calendar} title="Leave Requests" action={() => navigate('/leave')} actionLabel="Leave Manager">
                <StatRow label="Pending Approval" value={peopleStats.pendingLeave} color={peopleStats.pendingLeave > 0 ? 'text-amber-600' : undefined} />
                <StatRow label="Approved" value={peopleStats.approvedLeave} color="text-emerald-600" />
                <StatRow label="Rejected" value={peopleStats.leaveByStatus['rejected'] ?? 0} />
                <div className="mt-3 pt-2 border-t">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-2">By Type</p>
                  {Object.entries(peopleStats.leaveByType).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2 py-1 text-xs">
                      <span className="flex-1 text-muted-foreground capitalize">{type.replace('_', ' ')}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Expiring contracts */}
              <SectionCard icon={FileWarning} title="Contracts Expiring (30 days)" action={() => navigate('/admin/staff-profiles')} actionLabel="HR Profiles">
                {peopleStats.expiringContracts.length === 0 ? (
                  <div className="flex items-center gap-2 py-6 text-emerald-700 dark:text-emerald-400 justify-center">
                    <CheckCircle2 className="h-5 w-5" /><span className="text-sm">No contracts expiring soon</span>
                  </div>
                ) : (
                  <div className="space-y-2 mt-1">
                    {peopleStats.expiringContracts.slice(0, 8).map(p => {
                      const end = safeDate(p.contract_end_date);
                      const daysLeft = end ? differenceInDays(end, startOfToday()) : 0;
                      return (
                        <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10">
                          <UserCheck className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{p.full_name ?? 'Unknown'}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{p.role?.replace(/_/g, ' ')}</p>
                          </div>
                          <span className={cn('text-[11px] font-bold flex-shrink-0', daysLeft <= 7 ? 'text-red-600' : 'text-amber-600')}>{daysLeft}d</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Role distribution chart */}
            {peopleStats.roleChartData.length > 0 && (
              <SectionCard icon={BarChart2} title="Staff Composition by Role">
                <div className="h-52 mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peopleStats.roleChartData} margin={{ top: 4, right: 8, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-20} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Bar dataKey="value" name="Staff" radius={[4, 4, 0, 0]}>
                        {peopleStats.roleChartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            )}
          </TabsContent>

          {/* ═══════════════ PARTNERS & CRM ═══════════════ */}
          <TabsContent value="partners" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

              {/* Partner summary */}
              <SectionCard icon={Handshake} title="Partner Organisations" action={() => navigate('/crm')} actionLabel="Open CRM">
                <StatRow label="Total Partners" value={crmStats.totalPartners} />
                <StatRow label="Active" value={crmStats.activePartners} color="text-emerald-600" />
                {Object.entries(crmStats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <StatRow key={type} label={type.replace(/_/g, ' ')} value={count} />
                ))}
              </SectionCard>

              {/* Pipeline summary */}
              <SectionCard icon={TrendingUp} title="Opportunity Pipeline">
                <div className="mb-3 p-3 bg-[#1D3461]/5 rounded-xl">
                  <p className="text-2xl font-bold text-[#1D3461]">{fmtUSD(crmStats.totalPipelineValue)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Active pipeline value ({crmStats.activePipeline} opportunities)</p>
                </div>
                <StatRow label="Closing in 30 days" value={crmStats.closingSoon} color={crmStats.closingSoon > 0 ? 'text-amber-600' : undefined} />
                <StatRow label="Won This Year" value={fmtUSD(crmStats.wonValue)} color="text-emerald-600" />
              </SectionCard>

              {/* Stage breakdown */}
              <SectionCard icon={BarChart2} title="Pipeline by Stage">
                {crmStats.stageChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No opportunities recorded</p>
                ) : (
                  <div className="h-48 mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={crmStats.stageChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {crmStats.stageChartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number, n: string, p: any) => [fmtUSD(p.payload.amount), n]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Closing soon list */}
            {crmStats.closingSoonList.length > 0 && (
              <SectionCard icon={Timer} title="Opportunities Closing in 30 Days">
                <div className="space-y-2 mt-1">
                  {crmStats.closingSoonList.map(o => {
                    const d = safeDate(o.expected_close_date);
                    const daysLeft = d ? differenceInDays(d, new Date()) : 0;
                    const stageCfg = CRM_STAGE_CFG[o.stage] ?? { label: o.stage, color: '#94a3b8' };
                    return (
                      <div key={o.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:shadow-sm transition-all">
                        <div className="h-9 w-9 rounded-lg flex flex-col items-center justify-center flex-shrink-0 font-bold text-xs bg-[#1D3461]/10 text-[#1D3461]">
                          {daysLeft}d
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{o.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-muted-foreground">{fmtDate(o.expected_close_date)}</span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: stageCfg.color + '20', color: stageCfg.color }}>{stageCfg.label}</span>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-[#1D3461] flex-shrink-0">{fmtUSD(o.value_usd)}</span>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}
          </TabsContent>

          {/* ═══════════════ BUSINESS PIPELINE ═══════════════ */}
          <TabsContent value="pipeline" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {/* Pipeline Value KPI */}
              <SectionCard icon={TrendingUp} title="Pipeline Overview">
                <div className="mb-3 p-3 bg-[#1D3461]/5 rounded-xl">
                  <p className="text-2xl font-bold text-[#1D3461]">{fmtUSD(crmStats.totalPipelineValue)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total active pipeline ({crmStats.activePipeline} opportunities)</p>
                </div>
                <StatRow label="Won This Year" value={fmtUSD(crmStats.wonValue)} color="text-emerald-600" />
                <StatRow label="Closing in 30 days" value={crmStats.closingSoon} color={crmStats.closingSoon > 0 ? 'text-amber-600' : undefined} />
              </SectionCard>

              {/* CRM ↔ Projects bridge stats */}
              <SectionCard icon={Briefcase} title="CRM → Projects Bridge" action={() => navigate('/projects/create')} actionLabel="New Project">
                <StatRow label="Won Opportunities" value={data.crmOpptys.filter((o: any) => o.stage === 'won').length} color="text-emerald-600" />
                <StatRow label="In Negotiation" value={data.crmOpptys.filter((o: any) => o.stage === 'negotiating').length} color="text-blue-600" />
                <StatRow label="Projects with CRM Link" value={enriched.filter(p => !!p.crm_opportunity_id).length} color="text-purple-600" />
                <StatRow label="Projects from Partners" value={enriched.filter(p => !!p.partner_id).length} color="text-[#1D3461]" />
              </SectionCard>

              {/* Stage breakdown */}
              <SectionCard icon={BarChart2} title="Pipeline by Stage">
                {crmStats.stageChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No opportunities recorded</p>
                ) : (
                  <div className="h-52 mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={crmStats.stageChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {crmStats.stageChartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number, n: string, p: any) => [fmtUSD(p.payload.amount), n]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Won / Negotiating opportunities — ready to convert */}
            {data.crmOpptys.filter((o: any) => ['won', 'negotiating'].includes(o.stage)).length > 0 && (
              <SectionCard icon={FolderPlus} title="Opportunities Ready to Convert" action={() => navigate('/crm/opportunities')} actionLabel="Open CRM Opportunities">
                <div className="space-y-2 mt-1">
                  {data.crmOpptys
                    .filter((o: any) => ['won', 'negotiating'].includes(o.stage))
                    .map((o: any) => {
                      const stageCfg = CRM_STAGE_CFG[o.stage] ?? { label: o.stage, color: '#94a3b8' };
                      const linkedProject = enriched.find(p => p.crm_opportunity_id === o.id);
                      return (
                        <div key={o.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:shadow-sm transition-all">
                          <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#1D3461]/10">
                            <TrendingUp className="h-4 w-4 text-[#1D3461]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{o.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: stageCfg.color + '20', color: stageCfg.color }}>{stageCfg.label}</span>
                              {o.expected_close_date && <span className="text-[11px] text-muted-foreground">{fmtDate(o.expected_close_date)}</span>}
                              {linkedProject && (
                                <button
                                  className="text-[10px] font-semibold text-purple-600 hover:underline flex items-center gap-1"
                                  onClick={() => navigate(`/projects/${linkedProject.id}`)}
                                  data-testid={`link-project-from-oppty-${o.id}`}
                                >
                                  <Briefcase className="h-2.5 w-2.5" /> {linkedProject.name}
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#1D3461] flex-shrink-0">{fmtUSD(o.value_usd)}</span>
                            {!linkedProject && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                data-testid={`button-convert-oppty-${o.id}`}
                                onClick={() => {
                                  const params = new URLSearchParams();
                                  params.set('crm_opportunity_id', o.id);
                                  params.set('crm_opportunity_title', o.title);
                                  if (o.value_usd) params.set('crm_value_usd', String(o.value_usd));
                                  navigate(`/projects/create?${params.toString()}`);
                                }}
                              >
                                <FolderPlus className="h-3 w-3 mr-1" /> Convert
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </SectionCard>
            )}

            {/* All active opportunities list */}
            <SectionCard icon={Target} title="All Active Opportunities" action={() => navigate('/crm/opportunities')} actionLabel="Manage Opportunities">
              {data.crmOpptys.filter((o: any) => !['won', 'lost'].includes(o.stage)).length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No active opportunities in pipeline.</p>
              ) : (
                <div className="space-y-1.5 mt-1">
                  {data.crmOpptys
                    .filter((o: any) => !['won', 'lost'].includes(o.stage))
                    .map((o: any) => {
                      const stageCfg = CRM_STAGE_CFG[o.stage] ?? { label: o.stage, color: '#94a3b8' };
                      return (
                        <div key={o.id} className="flex items-center gap-3 py-2 border-b last:border-b-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{o.title}</p>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: stageCfg.color + '20', color: stageCfg.color }}>{stageCfg.label}</span>
                          </div>
                          {o.expected_close_date && <span className="text-xs text-muted-foreground flex-shrink-0">{fmtDate(o.expected_close_date)}</span>}
                          <span className="text-sm font-bold text-[#1D3461] flex-shrink-0">{fmtUSD(o.value_usd)}</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </SectionCard>
          </TabsContent>

          {/* ═══════════════ RISK & SAFETY ═══════════════ */}
          <TabsContent value="risk" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

              {/* Incident summary */}
              <SectionCard icon={ShieldAlert} title="Incident Reports" action={() => navigate('/incident-reports')} actionLabel="Incident Manager">
                <StatRow label="Open / Investigating" value={riskStats.openIncidents.length} color={riskStats.openIncidents.length > 0 ? 'text-red-600' : 'text-emerald-600'} />
                <StatRow label="Critical Open" value={riskStats.criticalOpen} color={riskStats.criticalOpen > 0 ? 'text-red-700' : undefined} />
                <StatRow label="Resolved Last 30d" value={riskStats.resolvedRecently} color="text-emerald-600" />
                <StatRow label="Total Incidents" value={riskStats.total} />
                {riskStats.severityChartData.length > 0 && (
                  <div className="mt-3 pt-3 border-t space-y-1.5">
                    {riskStats.severityChartData.map(s => (
                      <div key={s.name} className="flex items-center gap-2">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: s.color + '20', color: s.color }}>{s.name}</span>
                        <div className="flex-1 bg-muted h-1.5 rounded-full"><div className="h-1.5 rounded-full" style={{ width: `${riskStats.total > 0 ? (s.value / riskStats.total) * 100 : 0}%`, background: s.color }} /></div>
                        <span className="text-xs font-bold w-4">{s.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Open incidents list */}
              <SectionCard icon={Siren} title="Open Incidents" action={() => navigate('/incident-reports')} actionLabel="All Incidents">
                {riskStats.openIncidents.length === 0 ? (
                  <div className="flex items-center gap-2 py-6 text-emerald-700 dark:text-emerald-400 justify-center">
                    <CheckCircle2 className="h-5 w-5" /><span className="text-sm">No open incidents</span>
                  </div>
                ) : (
                  <div className="space-y-2 mt-1 max-h-64 overflow-y-auto">
                    {riskStats.openIncidents.map(i => {
                      const sCfg = SEVERITY_CFG[i.severity] ?? SEVERITY_CFG.low;
                      return (
                        <div key={i.id} className={cn('flex items-start gap-2 p-2.5 rounded-xl border', i.severity === 'critical' ? 'border-red-300 bg-red-50 dark:bg-red-900/10' : 'border-border bg-card')}>
                          <AlertCircle className={cn('h-4 w-4 flex-shrink-0 mt-0.5', i.severity === 'critical' ? 'text-red-600' : i.severity === 'high' ? 'text-orange-600' : 'text-amber-500')} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{i.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold', sCfg.bg, sCfg.text)}>{i.severity}</span>
                              <span className="text-[10px] text-muted-foreground">{fmtDate(i.date_reported)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>

              {/* Portfolio risks */}
              <SectionCard icon={AlertTriangle} title="Portfolio Risk Signals">
                <div className="space-y-2 mt-1">
                  {[
                    { label: 'Stalled Projects', value: riskStats.stalledProjects.length, urgent: riskStats.stalledProjects.length > 0, action: () => setActiveTab('portfolio') },
                    { label: 'Over Budget Projects', value: riskStats.overBudgetProjects.length, urgent: riskStats.overBudgetProjects.length > 0, action: () => setActiveTab('financial') },
                    { label: 'Overdue Milestones', value: riskStats.overdueMilestonesAll, urgent: riskStats.overdueMilestonesAll > 0, action: () => setActiveTab('portfolio') },
                    { label: 'Pending Leave Requests', value: peopleStats.pendingLeave, urgent: peopleStats.pendingLeave > 5, action: () => setActiveTab('people') },
                    { label: 'Expiring Contracts', value: peopleStats.expiringContracts.length, urgent: peopleStats.expiringContracts.length > 0, action: () => setActiveTab('people') },
                    { label: 'Pending Approvals', value: totalPendingApprovals, urgent: totalPendingApprovals > 10, action: () => setActiveTab('financial') },
                    { label: 'Damaged/Lost Equipment', value: equipStats.damaged + equipStats.lost, urgent: (equipStats.damaged + equipStats.lost) > 0, action: () => setActiveTab('operations') },
                  ].map(r => (
                    <button key={r.label} onClick={r.action}
                      className={cn('w-full flex items-center justify-between py-2.5 px-3 rounded-xl border text-left transition-all hover:shadow-sm',
                        r.urgent && r.value > 0 ? 'border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800/40 hover:bg-red-100' : 'border-border hover:bg-muted/30')}>
                      <span className={cn('text-xs font-medium', r.urgent && r.value > 0 ? 'text-red-800 dark:text-red-300' : 'text-foreground')}>{r.label}</span>
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-bold', r.urgent && r.value > 0 ? 'text-red-700' : r.value === 0 ? 'text-emerald-600' : 'text-foreground')}>{r.value}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              </SectionCard>
            </div>
          </TabsContent>

          {/* ═══════════════ TASKS TAB ═══════════════ */}
          <TabsContent value="tasks" className="mt-4 space-y-5">

            {/* KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Tasks', value: taskStats.total + (d?.projectFieldTasks?.length ?? 0), sub: 'org-wide all types', icon: CheckSquare, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200' },
                { label: 'Completed', value: (d?.tasks ?? []).filter(t => ['done','completed','complete'].includes(t.status)).length + (d?.projectFieldTasks ?? []).filter(t => ['done','completed','complete'].includes(t.status)).length, sub: `${taskStats.completedThisMonthCount} this month`, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200' },
                { label: 'In Progress', value: taskStats.inProgressCount, sub: 'active work', icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200' },
                { label: 'Overdue', value: taskStats.overdueCount, sub: 'need immediate attention', icon: AlertTriangle, color: taskStats.overdueCount > 0 ? 'text-red-600' : 'text-emerald-600', bg: taskStats.overdueCount > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200' },
                { label: 'Project Field Tasks', value: d?.projectFieldTasks?.length ?? 0, sub: 'across all projects', icon: Briefcase, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200' },
                { label: 'Employees Tracked', value: employeeTaskMetrics.length, sub: 'with task assignments', icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200' },
              ].map(k => (
                <div key={k.label} className={cn('rounded-2xl border p-4 flex flex-col gap-1 transition-all hover:shadow-md', k.bg)}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{k.label}</span>
                    <k.icon className={cn('h-4 w-4', k.color)} />
                  </div>
                  <span className="text-2xl font-bold text-foreground">{k.value}</span>
                  <span className="text-[11px] text-muted-foreground">{k.sub}</span>
                </div>
              ))}
            </div>

            {/* Employee Productivity Assessment */}
            <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b bg-muted/30">
                <Users className="h-4 w-4 text-[#1D3461]" />
                <span className="font-bold text-sm text-foreground">Employee Task Analytics & Productivity Assessment</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{employeeTaskMetrics.length} employees with tasks</span>
              </div>
              {employeeTaskMetrics.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">No task data available</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">#</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Employee</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Department</th>
                        <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Total</th>
                        <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Done</th>
                        <th className="text-center px-3 py-3 font-semibold text-muted-foreground hidden sm:table-cell">In Progress</th>
                        <th className="text-center px-3 py-3 font-semibold text-muted-foreground text-red-600">Overdue</th>
                        <th className="text-center px-3 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Project Tasks</th>
                        <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Completion %</th>
                        <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Efficiency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeTaskMetrics.map((m, idx) => (
                        <tr key={m.userId} className={cn('border-b transition-colors hover:bg-muted/30', idx % 2 === 0 ? '' : 'bg-muted/10')}>
                          <td className="px-4 py-3 text-muted-foreground font-mono">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-[#1D3461]/10 flex items-center justify-center text-[#1D3461] font-bold text-[10px] flex-shrink-0">
                                {m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-foreground">{m.name}</div>
                                <div className="text-[10px] text-muted-foreground">{m.role ?? '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{m.dept}</td>
                          <td className="px-3 py-3 text-center font-bold text-foreground">{m.total}</td>
                          <td className="px-3 py-3 text-center text-emerald-600 font-semibold">{m.completed}</td>
                          <td className="px-3 py-3 text-center text-amber-600 hidden sm:table-cell">{m.inProgress}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={cn('font-bold', m.overdue > 0 ? 'text-red-600' : 'text-emerald-600')}>{m.overdue}</span>
                          </td>
                          <td className="px-3 py-3 text-center text-purple-600 hidden lg:table-cell">{m.projectTasks}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className="font-bold text-foreground">{m.completionRate}%</span>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{
                                  width: `${m.completionRate}%`,
                                  background: m.completionRate >= 70 ? '#10b981' : m.completionRate >= 40 ? '#f59e0b' : '#ef4444'
                                }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn('px-2 py-1 rounded-full text-[10px] font-bold',
                              m.efficiency === 'high' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                              m.efficiency === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            )}>
                              {m.efficiency === 'high' ? '⚡ High' : m.efficiency === 'medium' ? '⚠ Medium' : '↓ Low'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Task Load by Employee */}
              <div className="bg-card border rounded-2xl shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 className="h-4 w-4 text-[#1D3461]" />
                  <span className="font-bold text-sm">Task Load by Employee (Top 12)</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={employeeTaskMetrics.slice(0, 12).map(m => ({
                    name: m.name.split(' ')[0],
                    completed: m.completed,
                    inProgress: m.inProgress,
                    overdue: m.overdue,
                    todo: m.todo,
                  }))} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                    <Bar dataKey="completed" name="Completed" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
                    <Bar dataKey="inProgress" name="In Progress" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="overdue" name="Overdue" stackId="a" fill="#ef4444" />
                    <Bar dataKey="todo" name="To Do" stackId="a" fill="#94a3b8" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Efficiency Distribution */}
              <div className="bg-card border rounded-2xl shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="h-4 w-4 text-[#1D3461]" />
                  <span className="font-bold text-sm">Efficiency Distribution</span>
                </div>
                {(() => {
                  const high = employeeTaskMetrics.filter(m => m.efficiency === 'high').length;
                  const medium = employeeTaskMetrics.filter(m => m.efficiency === 'medium').length;
                  const low = employeeTaskMetrics.filter(m => m.efficiency === 'low').length;
                  const total = employeeTaskMetrics.length || 1;
                  return (
                    <div className="space-y-4">
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={[
                            { name: 'High Efficiency', value: high, fill: '#10b981' },
                            { name: 'Medium Efficiency', value: medium, fill: '#f59e0b' },
                            { name: 'Low Efficiency', value: low, fill: '#ef4444' },
                          ].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value">
                          </Pie>
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="grid grid-cols-3 gap-3 text-center text-xs">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 p-3">
                          <div className="text-xl font-bold text-emerald-600">{high}</div>
                          <div className="text-muted-foreground">High</div>
                          <div className="text-[10px] text-muted-foreground">{Math.round(high/total*100)}%</div>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3">
                          <div className="text-xl font-bold text-amber-600">{medium}</div>
                          <div className="text-muted-foreground">Medium</div>
                          <div className="text-[10px] text-muted-foreground">{Math.round(medium/total*100)}%</div>
                        </div>
                        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-3">
                          <div className="text-xl font-bold text-red-600">{low}</div>
                          <div className="text-muted-foreground">Low</div>
                          <div className="text-[10px] text-muted-foreground">{Math.round(low/total*100)}%</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Task Calendar — next 30 days */}
            <div className="bg-card border rounded-2xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-4 w-4 text-[#1D3461]" />
                <span className="font-bold text-sm">Upcoming Task Calendar — Next 30 Days</span>
                <span className="ml-auto text-[11px] text-muted-foreground">All employees</span>
              </div>
              {(() => {
                const today = new Date();
                const allTasks = [
                  ...(d?.tasks ?? []).map(t => ({ ...t, _type: 'personal' as const })),
                  ...(d?.projectFieldTasks ?? []).map(t => ({ ...t, assigned_to_name: null, user_id: null, department_id: null, updated_at: t.updated_at, _type: 'project' as const })),
                ];
                const days = Array.from({ length: 30 }, (_, i) => addDays(today, i));
                const tasksByDay: Record<string, typeof allTasks> = {};
                allTasks.forEach(t => {
                  if (!t.due_date) return;
                  const d2 = safeDate(t.due_date);
                  if (!d2) return;
                  const key = format(d2, 'yyyy-MM-dd');
                  if (!tasksByDay[key]) tasksByDay[key] = [];
                  tasksByDay[key].push(t);
                });
                const profileMap2: Record<string, ProfileRow> = {};
                (d?.profiles ?? []).forEach(p => { profileMap2[p.id] = p; });
                return (
                  <div className="overflow-x-auto">
                    <div className="flex gap-1 min-w-max pb-2">
                      {days.map(day => {
                        const key = format(day, 'yyyy-MM-dd');
                        const dayTasks = tasksByDay[key] ?? [];
                        const isToday2 = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                        const hasTasks = dayTasks.length > 0;
                        return (
                          <div key={key} className={cn(
                            'flex flex-col items-center rounded-xl border p-1.5 min-w-[52px] transition-all',
                            isToday2 ? 'border-[#1D3461] bg-[#1D3461]/10' : hasTasks ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10' : 'border-border'
                          )}>
                            <span className={cn('text-[9px] font-semibold uppercase tracking-wide', isToday2 ? 'text-[#1D3461]' : 'text-muted-foreground')}>{format(day, 'EEE')}</span>
                            <span className={cn('text-sm font-bold', isToday2 ? 'text-[#1D3461]' : 'text-foreground')}>{format(day, 'd')}</span>
                            <span className="text-[9px] text-muted-foreground">{format(day, 'MMM')}</span>
                            {hasTasks && (
                              <div className="mt-1 flex flex-col items-center gap-0.5 w-full">
                                <span className={cn('text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center',
                                  dayTasks.some(t => t._type === 'project') ? 'bg-purple-500 text-white' : 'bg-amber-500 text-white'
                                )}>{dayTasks.length}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-amber-500 inline-block" /> Personal Tasks</span>
                      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-purple-500 inline-block" /> Project Field Tasks</span>
                      <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border-2 border-[#1D3461] inline-block" /> Today</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Top Performers & Needs Attention */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-card border rounded-2xl shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="h-4 w-4 text-amber-500" />
                  <span className="font-bold text-sm">Top Performers</span>
                </div>
                <div className="space-y-2">
                  {[...employeeTaskMetrics].filter(m => m.efficiency === 'high' && m.total >= 3).sort((a, b) => b.completionRate - a.completionRate).slice(0, 5).map((m, i) => (
                    <div key={m.userId} className="flex items-center gap-3 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100">
                      <span className="text-sm font-bold text-emerald-600 w-6 text-center">#{i+1}</span>
                      <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-[10px] flex-shrink-0">
                        {m.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">{m.name}</div>
                        <div className="text-[10px] text-muted-foreground">{m.completed}/{m.total} tasks · {m.completionRate}% rate</div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5">⚡ {m.efficiencyScore}</span>
                    </div>
                  ))}
                  {employeeTaskMetrics.filter(m => m.efficiency === 'high' && m.total >= 3).length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">No high performers yet — keep working!</div>
                  )}
                </div>
              </div>

              <div className="bg-card border rounded-2xl shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="font-bold text-sm">Needs Attention</span>
                </div>
                <div className="space-y-2">
                  {[...employeeTaskMetrics].filter(m => m.overdue > 0 || m.efficiency === 'low').sort((a, b) => b.overdue - a.overdue).slice(0, 5).map(m => (
                    <div key={m.userId} className="flex items-center gap-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100">
                      <div className="h-7 w-7 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold text-[10px] flex-shrink-0">
                        {m.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">{m.name}</div>
                        <div className="text-[10px] text-muted-foreground">{m.total} tasks · {m.overdueRate}% overdue rate</div>
                      </div>
                      {m.overdue > 0 && <span className="text-[10px] font-bold text-red-600 bg-red-100 rounded-full px-2 py-0.5">{m.overdue} overdue</span>}
                    </div>
                  ))}
                  {employeeTaskMetrics.filter(m => m.overdue > 0 || m.efficiency === 'low').length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">All employees are on track!</div>
                  )}
                </div>
              </div>
            </div>

          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
