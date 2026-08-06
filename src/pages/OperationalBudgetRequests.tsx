import { useState, useEffect, useCallback, useRef } from 'react';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus, Trash2, Eye, Send, CheckCircle2, XCircle, Loader2,
  FileSpreadsheet, FileDown, ClipboardList, ChevronDown, ChevronUp,
  Info, Calendar, Building2, FolderOpen, DollarSign, AlertTriangle,
  Clock, CheckCheck, X, Pencil, RefreshCw,
} from 'lucide-react';
import { exportStandardExcel } from '@/utils/standardExcelExport';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dispatchNotification } from '@/lib/notify';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OBRLine {
  id: string;
  category: string;
  description: string;
  vendor: string;
  estimated_amount: number;
  notes: string;
}

export interface OBR {
  id: string;
  title: string;
  period_label: string;
  period_start: string;
  period_end: string;
  hub: string | null;
  project_id: string | null;
  currency: string;
  notes: string | null;
  lines: OBRLine[];
  total_amount: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
  submitted_by: string;
  submitted_at: string | null;
  tier1_status: 'pending' | 'approved' | 'rejected';
  tier1_reviewed_by: string | null;
  tier1_reviewed_at: string | null;
  tier1_notes: string | null;
  tier2_status: 'pending' | 'approved' | 'rejected';
  tier2_reviewed_by: string | null;
  tier2_reviewed_at: string | null;
  tier2_notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  submitter_name?: string;
  project_name?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'accommodation',    label: 'Accommodation' },
  { value: 'meals',            label: 'Meals & Per Diem' },
  { value: 'general_transport',label: 'Transportation' },
  { value: 'communications',   label: 'Communications' },
  { value: 'supplies',         label: 'Supplies & Materials' },
  { value: 'equipment',        label: 'Equipment' },
  { value: 'printing',         label: 'Printing & Stationery' },
  { value: 'meetings',         label: 'Meetings & Events' },
  { value: 'training',         label: 'Training & Capacity Building' },
  { value: 'incentives',       label: 'Staff Incentives' },
  { value: 'permits',          label: 'Permits & Licenses' },
  { value: 'other',            label: 'Other' },
];

const categoryLabel = (v: string) =>
  EXPENSE_CATEGORIES.find(c => c.value === v)?.label ?? v;

const CURRENCIES = ['SDG', 'USD', 'EUR', 'GBP'];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:      { label: 'Draft',      color: 'bg-slate-100 text-slate-700 border-slate-200',   icon: Pencil },
  submitted:  { label: 'Submitted',  color: 'bg-blue-100 text-blue-700 border-blue-200',       icon: Send },
  approved:   { label: 'Approved',   color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  rejected:   { label: 'Rejected',   color: 'bg-red-100 text-red-700 border-red-200',          icon: XCircle },
  cancelled:  { label: 'Cancelled',  color: 'bg-gray-100 text-gray-500 border-gray-200',       icon: X },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'SDG'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }
}

function relTime(iso: string): string {
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}

function newLine(): OBRLine {
  return { id: crypto.randomUUID(), category: '', description: '', vendor: '', estimated_amount: 0, notes: '' };
}

function totalLines(lines: OBRLine[]): number {
  return lines.reduce((s, l) => s + (Number(l.estimated_amount) || 0), 0);
}

function groupByCategory(lines: OBRLine[]): Record<string, { lines: OBRLine[]; subtotal: number }> {
  return lines.reduce((acc, l) => {
    const k = l.category || 'other';
    if (!acc[k]) acc[k] = { lines: [], subtotal: 0 };
    acc[k].lines.push(l);
    acc[k].subtotal += Number(l.estimated_amount) || 0;
    return acc;
  }, {} as Record<string, { lines: OBRLine[]; subtotal: number }>);
}

// ── Project Budget Panel ──────────────────────────────────────────────────────

interface ProjectBudgetInfo {
  totalBudgetCents: number;
  spentBudgetCents: number;
  currency: string;
  status: string;
  obrApprovedTotal: number;
  obrPendingTotal: number;
}

function ProjectBudgetPanel({ projectId, thisTotalAmount, currency, selfObrId }: {
  projectId: string;
  thisTotalAmount: number;
  currency: string;
  selfObrId?: string;
}) {
  const [info, setInfo]       = useState<ProjectBudgetInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBudgetData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const [budgetRes, obrRes] = await Promise.all([
      supabase.from('project_budgets' as any).select('total_budget_cents,spent_budget_cents,currency,status')
        .eq('project_id', projectId).order('created_at', { ascending: false }).limit(1),
      supabase.from('operational_budget_requests' as any).select('id,total_amount,status')
        .eq('project_id', projectId),
    ]);
    const budget = (budgetRes.data ?? [])[0] as any ?? null;
    const obrs   = ((obrRes.data ?? []) as any[]).filter((o: any) => o.id !== selfObrId);
    if (!budget) { setInfo(null); setLoading(false); return; }
    setInfo({
      totalBudgetCents:  budget.total_budget_cents ?? 0,
      spentBudgetCents:  budget.spent_budget_cents  ?? 0,
      currency:          budget.currency ?? currency,
      status:            budget.status   ?? 'draft',
      obrApprovedTotal:  obrs.filter((o: any) => o.status === 'approved').reduce((s: number, o: any) => s + (o.total_amount || 0), 0),
      obrPendingTotal:   obrs.filter((o: any) => o.status === 'submitted').reduce((s: number, o: any) => s + (o.total_amount || 0), 0),
    });
    setLoading(false);
  }, [projectId, selfObrId, currency]);

  useEffect(() => { fetchBudgetData(); }, [fetchBudgetData]);

  // Live subscription — reflects any budget update from the Project page immediately
  useEffect(() => {
    if (!projectId) return;
    const ch = supabase.channel(`obr_proj_budget_${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_budgets', filter: `project_id=eq.${projectId}` }, fetchBudgetData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operational_budget_requests', filter: `project_id=eq.${projectId}` }, fetchBudgetData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, fetchBudgetData]);

  if (!projectId) return null;
  if (loading) return (
    <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading project budget…
    </div>
  );
  if (!info) return (
    <div className="rounded-md border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      No project budget set yet. Add one from the Project's Budget tab — it will appear here in real time.
    </div>
  );

  const total       = info.totalBudgetCents / 100;
  const spent       = info.spentBudgetCents / 100;
  const obrApproved = info.obrApprovedTotal;
  const usedTotal   = spent + obrApproved + thisTotalAmount;
  const remaining   = total - usedTotal;
  const pct         = total > 0 ? Math.min((usedTotal / total) * 100, 120) : 0;
  const isOver      = remaining < 0;
  const bCur        = info.currency;
  const fmtB        = (n: number) =>
    `${bCur} ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className={cn('rounded-md border p-3 space-y-2.5',
      isOver ? 'border-red-200 bg-red-50/40 dark:bg-red-950/20'
             : 'border-blue-200 bg-blue-50/30 dark:bg-blue-950/20')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#0F2041] dark:text-blue-300 flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5" /> Project Budget Health
          <span className="text-[10px] font-normal text-muted-foreground">(live · updates when project budget changes)</span>
        </span>
        <Badge variant="outline" className="text-[10px]">{info.status}</Badge>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div><div className="text-muted-foreground">Total Budget</div><div className="font-semibold">{fmtB(total)}</div></div>
        <div><div className="text-muted-foreground">Actual Spent</div><div className="font-semibold text-orange-600">{fmtB(spent)}</div></div>
        <div><div className="text-muted-foreground">OBR Approved</div><div className="font-semibold text-blue-600">{fmtB(obrApproved)}</div></div>
        <div>
          <div className="text-muted-foreground">{isOver ? 'Over Budget' : 'Remaining'}</div>
          <div className={cn('font-bold', isOver ? 'text-red-600' : 'text-emerald-600')}>{fmtB(remaining)}</div>
        </div>
      </div>

      {/* Stacked utilisation bar */}
      <div>
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>After this request</span>
          <span className={cn(isOver && 'text-red-600 font-bold')}>{pct.toFixed(1)}%</span>
        </div>
        <div className="h-2.5 bg-muted rounded-full overflow-hidden flex">
          {total > 0 && <>
            <div className="h-full bg-orange-400" style={{ width: `${Math.min((spent / total) * 100, 100)}%` }} title="Actual Spent" />
            <div className="h-full bg-blue-400"   style={{ width: `${Math.min((obrApproved / total) * 100, 100)}%` }} title="OBR Approved" />
            <div className="h-full bg-[#0F2041] opacity-70" style={{ width: `${Math.min((thisTotalAmount / total) * 100, 100)}%` }} title="This Request" />
          </>}
        </div>
        <div className="flex flex-wrap gap-3 mt-1 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-orange-400" />Spent</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-blue-400" />OBR Approved</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#0F2041] opacity-70" />This Request</span>
        </div>
      </div>

      {thisTotalAmount > 0 && (
        <div className={cn('text-xs px-2 py-1.5 rounded-md',
          isOver ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                 : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300')}>
          {isOver
            ? `⚠️ This request (${fmtB(thisTotalAmount)}) exceeds the available project budget by ${fmtB(-remaining)}.`
            : `✓ This request (${fmtB(thisTotalAmount)}) leaves ${fmtB(remaining)} remaining in the project budget.`}
        </div>
      )}
    </div>
  );
}

// ── PR-style Preview Document ────────────────────────────────────────────────

function OBRPreviewDocument({ obr, submitterName, onClose, onSubmit, onExportPDF, onExportExcel, submitting, projectBudgetInfo }: {
  obr: Partial<OBR> & { lines: OBRLine[]; currency: string };
  submitterName: string;
  onClose: () => void;
  onSubmit?: () => void;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  submitting?: boolean;
  projectBudgetInfo?: ProjectBudgetInfo | null;
}) {
  const grouped = groupByCategory(obr.lines ?? []);
  const total = totalLines(obr.lines ?? []);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg overflow-hidden">
      {/* PACT Header */}
      <div className="bg-[#0F2041] px-6 py-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-bold tracking-wide">PACT</div>
            <div className="text-xs text-blue-200 mt-0.5">Operational Budget Request</div>
          </div>
          <div className="text-right text-xs text-blue-200">
            <div>Ref: OBR-{(obr.id ?? 'DRAFT').slice(0, 8).toUpperCase()}</div>
            <div className="mt-0.5">{format(new Date(), 'dd MMM yyyy')}</div>
          </div>
        </div>
        <div className="mt-4 text-xl font-semibold leading-snug">
          {obr.title || '(Untitled Budget Request)'}
        </div>
        <div className="flex flex-wrap gap-4 mt-2 text-xs text-blue-200">
          {obr.period_label && <span>📅 {obr.period_label}</span>}
          {obr.hub && <span>🏢 Hub: {obr.hub}</span>}
          {obr.project_name && <span>📁 Project: {obr.project_name}</span>}
          <span>👤 Prepared by: {submitterName}</span>
          <span>💱 Currency: {obr.currency}</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-4 space-y-5">
        {/* Summary KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border bg-slate-50 dark:bg-slate-800 p-3 text-center">
            <div className="text-xs text-muted-foreground">Total Requested</div>
            <div className="text-lg font-bold text-[#0F2041] dark:text-blue-300 mt-0.5">{fmt(total, obr.currency)}</div>
          </div>
          <div className="rounded-md border bg-slate-50 dark:bg-slate-800 p-3 text-center">
            <div className="text-xs text-muted-foreground">Line Items</div>
            <div className="text-lg font-bold mt-0.5">{obr.lines?.length ?? 0}</div>
          </div>
          <div className="rounded-md border bg-slate-50 dark:bg-slate-800 p-3 text-center">
            <div className="text-xs text-muted-foreground">Categories</div>
            <div className="text-lg font-bold mt-0.5">{Object.keys(grouped).length}</div>
          </div>
        </div>

        {/* Project Budget Context — shows live project budget health when linked */}
        {projectBudgetInfo && (
          <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-2">
            <div className="text-xs font-semibold text-[#0F2041] dark:text-blue-300 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Project Budget Context
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              {[
                { label: 'Total Budget',  val: (projectBudgetInfo.totalBudgetCents / 100), color: '' },
                { label: 'Actual Spent',  val: (projectBudgetInfo.spentBudgetCents  / 100), color: 'text-orange-600' },
                { label: 'OBR Approved', val: projectBudgetInfo.obrApprovedTotal,            color: 'text-blue-600' },
                { label: 'Remaining',
                  val: (projectBudgetInfo.totalBudgetCents / 100) - (projectBudgetInfo.spentBudgetCents / 100) - projectBudgetInfo.obrApprovedTotal - total,
                  color: ((projectBudgetInfo.totalBudgetCents / 100) - (projectBudgetInfo.spentBudgetCents / 100) - projectBudgetInfo.obrApprovedTotal - total) < 0 ? 'text-red-600' : 'text-emerald-600' },
              ].map(k => (
                <div key={k.label}>
                  <div className="text-muted-foreground">{k.label}</div>
                  <div className={cn('font-semibold', k.color)}>
                    {projectBudgetInfo.currency} {Math.abs(k.val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    {k.val < 0 && ' (over)'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Line items by category */}
        {Object.entries(grouped).map(([cat, { lines, subtotal }]) => (
          <div key={cat}>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-sm font-semibold text-[#0F2041] dark:text-blue-300">
                {categoryLabel(cat)}
              </h4>
              <span className="text-sm font-semibold">{fmt(subtotal, obr.currency)}</span>
            </div>
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-[#0F2041]/8 dark:bg-[#0F2041]/40">
                  <tr>
                    <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Description</th>
                    <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Vendor</th>
                    <th className="text-right px-2.5 py-1.5 font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={line.id} className={i % 2 === 0 ? '' : 'bg-slate-50 dark:bg-slate-800/50'}>
                      <td className="px-2.5 py-1.5">{line.description || '—'}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{line.vendor || '—'}</td>
                      <td className="px-2.5 py-1.5 text-right font-medium">{fmt(Number(line.estimated_amount) || 0, obr.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {(!obr.lines || obr.lines.length === 0) && (
          <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
            No line items added yet.
          </div>
        )}

        {/* Grand total */}
        <div className="flex items-center justify-between rounded-md bg-[#0F2041]/5 dark:bg-[#0F2041]/30 border border-[#0F2041]/20 px-4 py-3">
          <span className="font-semibold text-[#0F2041] dark:text-blue-200">Grand Total</span>
          <span className="text-xl font-bold text-[#0F2041] dark:text-blue-300">{fmt(total, obr.currency)}</span>
        </div>

        {/* Notes */}
        {obr.notes && (
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3 text-sm">
            <div className="font-medium text-amber-900 dark:text-amber-200 mb-1">Notes</div>
            <p className="text-amber-800 dark:text-amber-300">{obr.notes}</p>
          </div>
        )}

        {/* Approval routing */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Approval Routing</h4>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {[
              { step: 1, label: 'Submitter', status: 'done' },
              { step: 2, label: 'Supervisor / FOM (Tier 1)', status: obr.tier1_status ?? 'pending' },
              { step: 3, label: 'Finance Admin (Tier 2)', status: obr.tier2_status ?? 'pending' },
            ].map((s, i, arr) => (
              <div key={s.step} className="flex items-center gap-1.5">
                <div className={cn(
                  'rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold',
                  s.status === 'done' || s.status === 'approved'
                    ? 'bg-emerald-500 text-white'
                    : s.status === 'rejected'
                    ? 'bg-red-500 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
                )}>{s.step}</div>
                <span className={cn(
                  s.status === 'approved' || s.status === 'done' ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-muted-foreground'
                )}>{s.label}</span>
                {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-800/50 flex flex-wrap gap-2 justify-between items-center">
        <div className="flex gap-2">
          {onExportPDF && (
            <Button type="button" variant="outline" size="sm" onClick={onExportPDF}>
              <FileDown className="h-3.5 w-3.5 mr-1.5" /> PDF
            </Button>
          )}
          {onExportExcel && (
            <Button type="button" variant="outline" size="sm" onClick={onExportExcel}>
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Excel
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
          {onSubmit && (
            <Button type="button" size="sm" onClick={onSubmit} disabled={submitting || !obr.lines?.length}>
              {submitting
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Submit for Approval
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Line-item row editor ─────────────────────────────────────────────────────

function LineItemRow({ line, onChange, onRemove }: {
  line: OBRLine;
  onChange: (updated: OBRLine) => void;
  onRemove: () => void;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-2 py-1.5 w-36">
        <Select value={line.category} onValueChange={v => onChange({ ...line, category: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1.5">
        <Input
          className="h-8 text-xs"
          placeholder="Description *"
          value={line.description}
          onChange={e => onChange({ ...line, description: e.target.value })}
        />
      </td>
      <td className="px-2 py-1.5 w-28">
        <Input
          className="h-8 text-xs"
          placeholder="Vendor"
          value={line.vendor}
          onChange={e => onChange({ ...line, vendor: e.target.value })}
        />
      </td>
      <td className="px-2 py-1.5 w-28">
        <Input
          className="h-8 text-xs text-right"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={line.estimated_amount || ''}
          onChange={e => onChange({ ...line, estimated_amount: parseFloat(e.target.value) || 0 })}
        />
      </td>
      <td className="px-2 py-1.5 w-8 text-center">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

// ── Form Dialog (New / Edit) ──────────────────────────────────────────────────

function OBRFormDialog({ open, onClose, onSaved, editing, currentUserId, currentUserName }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: OBR | null;
  currentUserId: string;
  currentUserName: string;
}) {
  const { toast } = useToast();
  const now = new Date();
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle]               = useState('');
  const [periodLabel, setPeriodLabel]   = useState('');
  const [periodStart, setPeriodStart]   = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
  const [periodEnd, setPeriodEnd]       = useState(format(endOfMonth(now), 'yyyy-MM-dd'));
  const [hub, setHub]                   = useState('');
  const [projectId, setProjectId]       = useState<string>('');
  const [currency, setCurrency]         = useState('SDG');
  const [notes, setNotes]               = useState('');
  const [lines, setLines]               = useState<OBRLine[]>([newLine()]);

  const [projects, setProjects]         = useState<{ id: string; name: string }[]>([]);
  const [projectBudgetInfo, setProjectBudgetInfo] = useState<ProjectBudgetInfo | null>(null);

  // Populate from editing record
  useEffect(() => {
    if (editing) {
      setTitle(editing.title ?? '');
      setPeriodLabel(editing.period_label ?? '');
      setPeriodStart(editing.period_start ?? format(startOfMonth(now), 'yyyy-MM-dd'));
      setPeriodEnd(editing.period_end ?? format(endOfMonth(now), 'yyyy-MM-dd'));
      setHub(editing.hub ?? '');
      setProjectId(editing.project_id ?? '');
      setCurrency(editing.currency ?? 'SDG');
      setNotes(editing.notes ?? '');
      setLines(editing.lines?.length ? editing.lines : [newLine()]);
    } else {
      setTitle('');
      setPeriodLabel(format(now, 'MMMM yyyy'));
      setPeriodStart(format(startOfMonth(now), 'yyyy-MM-dd'));
      setPeriodEnd(format(endOfMonth(now), 'yyyy-MM-dd'));
      setHub(''); setProjectId(''); setCurrency('SDG'); setNotes('');
      setLines([newLine()]);
    }
  }, [editing, open]);

  useEffect(() => {
    supabase.from('projects').select('id, name').eq('status', 'active').order('name')
      .then(({ data }) => setProjects((data ?? []) as { id: string; name: string }[]));
  }, []);

  const updateLine = (id: string, updated: OBRLine) =>
    setLines(prev => prev.map(l => l.id === id ? updated : l));
  const removeLine = (id: string) =>
    setLines(prev => prev.filter(l => l.id !== id));
  const addLine = () => setLines(prev => [...prev, newLine()]);

  const total = totalLines(lines);

  const buildPayload = (status: 'draft' | 'submitted') => ({
    title: title.trim(),
    period_label: periodLabel.trim() || format(parseISO(periodStart), 'MMMM yyyy'),
    period_start: periodStart,
    period_end: periodEnd,
    hub: hub.trim() || null,
    project_id: projectId || null,
    currency,
    notes: notes.trim() || null,
    lines: lines.filter(l => l.description || l.estimated_amount > 0),
    total_amount: total,
    status,
    submitted_by: currentUserId,
    ...(status === 'submitted' ? { submitted_at: new Date().toISOString() } : {}),
  });

  const handleSaveDraft = async () => {
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = buildPayload('draft');
    const { error } = editing
      ? await supabase.from('operational_budget_requests' as any).update(payload).eq('id', editing.id)
      : await supabase.from('operational_budget_requests' as any).insert(payload);
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'Draft updated' : 'Draft saved' });
    onSaved();
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    const validLines = lines.filter(l => l.description && l.estimated_amount > 0);
    if (validLines.length === 0) { toast({ title: 'Add at least one line item with a description and amount', variant: 'destructive' }); return; }
    setSubmitting(true);
    const payload = buildPayload('submitted');
    const { error } = editing
      ? await supabase.from('operational_budget_requests' as any).update(payload).eq('id', editing.id)
      : await supabase.from('operational_budget_requests' as any).insert(payload);
    setSubmitting(false);
    if (error) { toast({ title: 'Submit failed', description: error.message, variant: 'destructive' }); return; }
    // Notify supervisors/admins
    const { data: approvers } = await supabase.from('profiles').select('id')
      .in('role', ['super_admin', 'admin', 'fom', 'FOM', 'financialAdmin', 'financial_admin', 'FinancialAdmin', 'coordinator'])
      .neq('id', currentUserId);
    const approverIds = (approvers ?? []).map((a: any) => a.id);
    if (approverIds.length > 0) {
      dispatchNotification({
        event: 'approval_required',
        recipientIds: approverIds,
        titleEn: `Budget Request Submitted: ${title.trim()}`,
        titleAr: `تم إرسال طلب الميزانية: ${title.trim()}`,
        messageEn: `${currentUserName} submitted an operational budget request "${title.trim()}" for ${periodLabel || format(parseISO(periodStart), 'MMMM yyyy')} — Total: ${fmt(total, currency)}.`,
        messageAr: `أرسل ${currentUserName} طلب ميزانية تشغيلية "${title.trim()}" لـ ${periodLabel || format(parseISO(periodStart), 'MMMM yyyy')} — الإجمالي: ${fmt(total, currency)}.`,
        priority: 'normal',
        entityType: 'budget_request',
        actionUrl: '/budget-requests',
        sendEmail: true,
        triggeredBy: currentUserId,
        triggeredByName: currentUserName,
      }).catch(() => {});
    }
    toast({ title: 'Submitted for approval ✓', description: 'Your reviewers have been notified.' });
    setShowPreview(false);
    onSaved();
    onClose();
  };

  const handleExportPDF = () => exportOBRPDF({ ...buildPayload('draft'), id: editing?.id ?? 'DRAFT', lines } as any, currentUserName);
  const handleExportExcel = () => exportOBRExcel({ ...buildPayload('draft'), id: editing?.id ?? 'DRAFT', lines, submitter_name: currentUserName } as any);

  const previewObr: Partial<OBR> & { lines: OBRLine[]; currency: string } = {
    id: editing?.id,
    title, period_label: periodLabel, period_start: periodStart, period_end: periodEnd,
    hub: hub || null, currency, notes: notes || null, lines,
    tier1_status: 'pending', tier2_status: 'pending',
  };

  if (showPreview) {
    return (
      <Dialog open={open} onOpenChange={v => { if (!v) { setShowPreview(false); onClose(); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
          <OBRPreviewDocument
            obr={previewObr}
            submitterName={currentUserName}
            onClose={() => setShowPreview(false)}
            onSubmit={handleSubmit}
            onExportPDF={handleExportPDF}
            onExportExcel={handleExportExcel}
            submitting={submitting}
            projectBudgetInfo={projectBudgetInfo}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Budget Request' : 'New Operational Budget Request'}</DialogTitle>
          <DialogDescription>
            Plan your operational spending for a period. Add line items by category, then preview and submit for approval.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {/* Header fields */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="obr-title">Request Title <span className="text-destructive">*</span></Label>
              <Input id="obr-title" placeholder="e.g. Hub Operations Budget — August 2026" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obr-period-label">Period Label</Label>
              <Input id="obr-period-label" placeholder="e.g. August 2026 / Q3 2026" value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} />
              <p className="text-xs text-muted-foreground">Short name shown on the document header.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obr-start">Period Start <span className="text-destructive">*</span></Label>
              <Input id="obr-start" type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obr-end">Period End <span className="text-destructive">*</span></Label>
              <Input id="obr-end" type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obr-hub">Hub / Location</Label>
              <Input id="obr-hub" placeholder="e.g. Khartoum, North Darfur…" value={hub} onChange={e => setHub(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Project (optional)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No project</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base">Budget Lines <span className="text-destructive">*</span></Label>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Total: <strong>{fmt(total, currency)}</strong>
                </span>
                <Button type="button" size="sm" variant="outline" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Line
                </Button>
              </div>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground w-36">Category</th>
                    <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Description</th>
                    <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground w-28">Vendor</th>
                    <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground w-28">Est. Amount ({currency})</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => (
                    <LineItemRow
                      key={line.id}
                      line={line}
                      onChange={updated => updateLine(line.id, updated)}
                      onRemove={() => removeLine(line.id)}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 border-t">
                    <td colSpan={3} className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">Grand Total</td>
                    <td className="px-2 py-2 text-right text-sm font-bold">{fmt(total, currency)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: group related costs by category — this generates automatic subtotals in the document and Excel export.
            </p>
          </div>

          {/* Project Budget Panel — live link to project_budgets */}
          {projectId && projectId !== '__none__' && (
            <div className="space-y-1.5">
              <Label className="text-sm">Project Budget Impact</Label>
              <ProjectBudgetPanel
                projectId={projectId}
                thisTotalAmount={total}
                currency={currency}
                selfObrId={editing?.id}
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="obr-notes">Additional Notes (optional)</Label>
            <Textarea id="obr-notes" rows={2} placeholder="Context, assumptions, or justification for reviewers…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap sm:flex-nowrap">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Save Draft
          </Button>
          <Button type="button" onClick={() => setShowPreview(true)} disabled={!title.trim()}>
            <Eye className="h-4 w-4 mr-1.5" />
            Preview & Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Approval Dialog ──────────────────────────────────────────────────────────

function ApprovalDialog({ obr, tier, open, onClose, onDone, currentUserId, currentUserName }: {
  obr: OBR; tier: 1 | 2; open: boolean; onClose: () => void; onDone: () => void;
  currentUserId: string; currentUserName: string;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState<'approve' | 'reject' | null>(null);

  const handle = async (action: 'approve' | 'reject') => {
    setProcessing(action);
    const tierField = tier === 1 ? 'tier1' : 'tier2';
    const updates: Record<string, any> = {
      [`${tierField}_status`]: action === 'approve' ? 'approved' : 'rejected',
      [`${tierField}_reviewed_by`]: currentUserId,
      [`${tierField}_reviewed_at`]: new Date().toISOString(),
      [`${tierField}_notes`]: notes.trim() || null,
    };

    // Update overall status
    if (action === 'reject') {
      updates.status = 'rejected';
    } else if (tier === 2) {
      updates.status = 'approved';
    }
    // tier1 approve → status stays 'submitted' until tier2 also approves

    const { error } = await supabase
      .from('operational_budget_requests' as any)
      .update(updates)
      .eq('id', obr.id);
    setProcessing(null);
    if (error) { toast({ title: 'Action failed', description: error.message, variant: 'destructive' }); return; }

    // On final (tier2) approval → post budget lines to GL and update project_budgets
    if (tier === 2 && action === 'approve') {
      const glResult = await postOBRToGL({ ...obr, ...updates });
      if (glResult.linesCreated > 0) {
        toast({ title: `GL updated — ${glResult.linesCreated} budget line(s) posted`, description: 'Visible in Accounting → Budget Planning.' });
      } else if (glResult.error) {
        toast({ title: 'GL posting skipped', description: glResult.error, variant: 'default' });
      }
    }

    // Notify submitter
    const msg = action === 'approve'
      ? `${currentUserName} approved your budget request "${obr.title}" (Tier ${tier}).`
      : `${currentUserName} rejected your budget request "${obr.title}" (Tier ${tier}).${notes ? ` Notes: ${notes}` : ''}`;
    dispatchNotification({
      event: action === 'approve' ? 'cost_approved' : 'cost_rejected',
      recipientIds: [obr.submitted_by],
      titleEn: `Budget Request ${action === 'approve' ? 'Approved' : 'Rejected'}: ${obr.title}`,
      titleAr: `طلب الميزانية ${action === 'approve' ? 'مُعتمد' : 'مرفوض'}: ${obr.title}`,
      messageEn: msg, messageAr: msg,
      priority: 'normal', entityType: 'budget_request',
      actionUrl: '/budget-requests', sendEmail: true,
      triggeredBy: currentUserId, triggeredByName: currentUserName,
    }).catch(() => {});

    toast({ title: `Budget request ${action === 'approve' ? 'approved' : 'rejected'}` });
    onDone();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review Budget Request — Tier {tier}</DialogTitle>
          <DialogDescription>
            <strong>{obr.title}</strong> · {obr.period_label} · {fmt(obr.total_amount, obr.currency)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Review Notes (optional)</Label>
            <Textarea rows={3} placeholder="Add a comment for the submitter…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="destructive" disabled={!!processing} onClick={() => handle('reject')}>
            {processing === 'reject' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
            Reject
          </Button>
          <Button type="button" disabled={!!processing} onClick={() => handle('approve')}>
            {processing === 'approve' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Request Card ─────────────────────────────────────────────────────────────

function OBRCard({ obr, currentUserId, isReviewer, isAdmin, onEdit, onView, onApprove, onCancel, onDelete }: {
  obr: OBR; currentUserId: string; isReviewer: boolean; isAdmin: boolean;
  onEdit: () => void; onView: () => void;
  onApprove: (tier: 1 | 2) => void; onCancel: () => void; onDelete: () => void;
}) {
  const cfg = STATUS_CONFIG[obr.status] ?? STATUS_CONFIG.draft;
  const StatusIcon = cfg.icon;
  const isOwn = obr.submitted_by === currentUserId;
  const canApproveT1 = isReviewer && obr.status === 'submitted' && obr.tier1_status === 'pending';
  const canApproveT2 = isAdmin && obr.status === 'submitted' && obr.tier1_status === 'approved' && obr.tier2_status === 'pending';

  const grouped = groupByCategory(obr.lines ?? []);

  return (
    <Card className="shadow-none border-border/60 hover:border-border transition-colors" data-testid={`obr-card-${obr.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{obr.title}</span>
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', cfg.color)}>
                <StatusIcon className="h-2.5 w-2.5 mr-1" />{cfg.label}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
              {obr.period_label && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{obr.period_label}</span>}
              {obr.hub && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{obr.hub}</span>}
              {obr.project_name && <span className="flex items-center gap-1"><FolderOpen className="h-3 w-3" />{obr.project_name}</span>}
              {obr.submitter_name && !isOwn && <span>By {obr.submitter_name}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-bold">{fmt(obr.total_amount, obr.currency)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{obr.lines?.length ?? 0} lines</div>
          </div>
        </div>

        {/* Category mini-bar */}
        {Object.keys(grouped).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(grouped).map(([cat, { subtotal }]) => (
              <span key={cat} className="inline-flex items-center gap-1 text-[10px] bg-muted rounded-full px-2 py-0.5">
                {categoryLabel(cat)}: <strong>{fmt(subtotal, obr.currency)}</strong>
              </span>
            ))}
          </div>
        )}

        {/* Approval tier indicators */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className={cn('flex items-center gap-0.5 rounded-full px-2 py-0.5 border',
            obr.tier1_status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20' :
            obr.tier1_status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20' :
            'bg-muted text-muted-foreground')}>
            T1: {obr.tier1_status}
          </span>
          <span className={cn('flex items-center gap-0.5 rounded-full px-2 py-0.5 border',
            obr.tier2_status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20' :
            obr.tier2_status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20' :
            'bg-muted text-muted-foreground')}>
            T2: {obr.tier2_status}
          </span>
          {obr.tier1_notes && <span className="text-muted-foreground italic">"{obr.tier1_notes.slice(0, 40)}"</span>}
          {obr.tier2_notes && !obr.tier1_notes && <span className="text-muted-foreground italic">"{obr.tier2_notes.slice(0, 40)}"</span>}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onView}>
            <Eye className="h-3 w-3 mr-1" /> View
          </Button>
          {isOwn && obr.status === 'draft' && (
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onEdit}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
          )}
          {canApproveT1 && (
            <Button type="button" size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={() => onApprove(1)}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Review (T1)
            </Button>
          )}
          {canApproveT2 && (
            <Button type="button" size="sm" className="h-7 text-xs" onClick={() => onApprove(2)}>
              <CheckCheck className="h-3 w-3 mr-1" /> Final Review (T2)
            </Button>
          )}
          {isOwn && (obr.status === 'draft' || obr.status === 'submitted') && (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={onCancel}>
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
          )}
          {isOwn && obr.status === 'draft' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete draft?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────

function exportOBRExcel(obr: OBR & { submitter_name?: string }) {
  const grouped = groupByCategory(obr.lines ?? []);
  const total = totalLines(obr.lines ?? []);

  const summaryRows: (string | number | null)[][] = [
    ['Request Title',  obr.title],
    ['Period',         obr.period_label],
    ['Period Start',   obr.period_start],
    ['Period End',     obr.period_end],
    ['Hub',            obr.hub ?? '—'],
    ['Currency',       obr.currency],
    ['Total Requested', total],
    ['Status',         obr.status],
    ['Submitted By',   obr.submitter_name ?? '—'],
    ['Submitted At',   obr.submitted_at ? format(parseISO(obr.submitted_at), 'd MMM yyyy HH:mm') : 'Draft'],
    [],
    ['CATEGORY TOTALS', '', ''],
    ...Object.entries(grouped).map(([cat, { subtotal }]) => [categoryLabel(cat), subtotal, `${((subtotal / total) * 100).toFixed(1)}%`]),
    ['GRAND TOTAL', total, '100%'],
  ];

  const lineRows = (obr.lines ?? []).map(l => [
    categoryLabel(l.category),
    l.description,
    l.vendor || '',
    Number(l.estimated_amount) || 0,
    l.notes || '',
  ]);

  const breakdownRows = Object.entries(grouped).map(([cat, { lines, subtotal }]) => [
    categoryLabel(cat),
    lines.length,
    subtotal,
    `${total > 0 ? ((subtotal / total) * 100).toFixed(1) : '0'}%`,
  ]);

  exportStandardExcel({
    reportTitle:   `Operational Budget Request — ${obr.title}`,
    subtitleLine:  `Period: ${obr.period_label}${obr.hub ? ` · Hub: ${obr.hub}` : ''}`,
    metaLine:      `Submitted by: ${obr.submitter_name ?? '—'} · Status: ${obr.status.toUpperCase()} · Generated: ${format(new Date(), 'd MMM yyyy HH:mm')}`,
    filenamePrefix: `OBR_${obr.title.replace(/\s+/g, '_').slice(0, 40)}`,
    mainSheet: {
      sheetName: 'Line Items',
      headers: ['Category', 'Description', 'Vendor', `Est. Amount (${obr.currency})`, 'Notes'],
      rows: lineRows,
      totalsRow: ['', 'TOTAL', '', total, ''],
      colWidths: { 0: 22, 1: 35, 2: 20, 3: 18, 4: 30 },
    },
    summarySheet: {
      title: 'Request Summary',
      rows: summaryRows,
      colWidths: [28, 35, 12],
    },
    breakdownSheets: [{
      title: 'By Category',
      sheetName: 'By Category',
      headers: ['Category', 'Line Count', `Total (${obr.currency})`, '% of Budget'],
      rows: breakdownRows,
      colWidths: [25, 12, 18, 14],
    }],
  });
}

function exportOBRPDF(obr: OBR & { submitter_name?: string }, submitterName: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const ml = 14, mr = 14;

  // Header
  doc.setFillColor(15, 32, 65);
  doc.rect(0, 0, pw, 36, 'F');
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('PACT', ml, 13);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 200, 230);
  doc.text('Operational Budget Request', ml, 19);
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(obr.title, ml, 28, { maxWidth: pw - ml - 40 });
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 185, 215);
  doc.text(`Ref: OBR-${obr.id.slice(0, 8).toUpperCase()}`, pw - mr, 9, { align: 'right' });
  doc.text(format(new Date(), 'dd MMM yyyy'), pw - mr, 14, { align: 'right' });

  let y = 42;
  const fmt2 = (n: number) => `${obr.currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  // Meta row
  doc.setFontSize(8); doc.setTextColor(60, 60, 60); doc.setFont('helvetica', 'normal');
  const meta = [
    obr.period_label && `Period: ${obr.period_label}`,
    obr.hub && `Hub: ${obr.hub}`,
    `Prepared by: ${submitterName}`,
    `Status: ${obr.status.toUpperCase()}`,
  ].filter(Boolean).join('   ·   ');
  doc.text(meta, ml, y, { maxWidth: pw - ml - mr });
  y += 8;

  // Summary KPIs
  const total = totalLines(obr.lines ?? []);
  const grouped = groupByCategory(obr.lines ?? []);
  autoTable(doc, {
    startY: y,
    head: [['Total Requested', 'Line Items', 'Categories', 'Currency']],
    body: [[fmt2(total), String(obr.lines?.length ?? 0), String(Object.keys(grouped).length), obr.currency]],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255] },
    columnStyles: { 0: { fontStyle: 'bold' } },
    margin: { left: ml, right: mr },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Line items by category
  for (const [cat, { lines, subtotal }] of Object.entries(grouped)) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 32, 65);
    doc.text(`${categoryLabel(cat)}  —  ${fmt2(subtotal)}`, ml, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Description', 'Vendor', `Amount (${obr.currency})`]],
      body: lines.map(l => [l.description || '—', l.vendor || '—', fmt2(Number(l.estimated_amount) || 0)]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [40, 60, 100], textColor: [255, 255, 255] },
      columnStyles: { 2: { halign: 'right' } },
      margin: { left: ml, right: mr },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // Grand total
  autoTable(doc, {
    startY: y,
    body: [['GRAND TOTAL', fmt2(total)]],
    styles: { fontSize: 10, fontStyle: 'bold', cellPadding: 3 },
    bodyStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: ml, right: mr },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Notes
  if (obr.notes) {
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
    doc.text(`Notes: ${obr.notes}`, ml, y, { maxWidth: pw - ml - mr });
    y += 8;
  }

  // Approval chain
  autoTable(doc, {
    startY: y,
    head: [['Approval Step', 'Role', 'Status', 'Reviewed At']],
    body: [
      ['Tier 1', 'Supervisor / FOM', obr.tier1_status.toUpperCase(), obr.tier1_reviewed_at ? format(parseISO(obr.tier1_reviewed_at), 'd MMM yyyy') : '—'],
      ['Tier 2', 'Finance Admin',    obr.tier2_status.toUpperCase(), obr.tier2_reviewed_at ? format(parseISO(obr.tier2_reviewed_at), 'd MMM yyyy') : '—'],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255] },
    margin: { left: ml, right: mr },
  });

  // Page footer
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(15, 32, 65);
    doc.rect(0, ph - 10, pw, 10, 'F');
    doc.setFontSize(6.5); doc.setTextColor(160, 185, 215);
    doc.text(`Page ${i} of ${pages}  |  Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}  |  PACT Operational Budget Request`, pw / 2, ph - 4, { align: 'center' });
  }

  doc.save(`OBR_${obr.title.replace(/\s+/g, '_').slice(0, 40)}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

// ── GL posting on OBR tier-2 approval ────────────────────────────────────────

/** Category keywords used to match OBR expense categories to GL account names */
const CATEGORY_GL_KEYWORDS: Record<string, string[]> = {
  accommodation:     ['accommodation', 'hotel', 'lodging', 'housing'],
  meals:             ['meal', 'food', 'catering', 'per diem', 'perdiem'],
  general_transport: ['transport', 'travel', 'vehicle', 'fuel', 'logistics'],
  communications:    ['communication', 'internet', 'telephone', 'phone', 'telecom'],
  supplies:          ['supplies', 'material', 'stationery', 'consumable'],
  equipment:         ['equipment', 'asset', 'machinery', 'tool'],
  printing:          ['printing', 'reproduction', 'photocopying'],
  meetings:          ['meeting', 'event', 'workshop', 'conference', 'seminar'],
  training:          ['training', 'capacity', 'learning', 'development'],
  incentives:        ['incentive', 'bonus', 'staff allowance'],
  permits:           ['permit', 'legal', 'tax', 'license', 'licence'],
  other:             ['other', 'miscellaneous', 'general'],
};

async function postOBRToGL(obr: OBR): Promise<{ linesCreated: number; error?: string }> {
  try {
    // 1. Group lines by category with subtotals
    const grouped = groupByCategory(obr.lines ?? []);
    if (!Object.keys(grouped).length) return { linesCreated: 0, error: 'No line items to post' };

    // 2. Find fiscal period overlapping the OBR period
    const { data: periods } = await supabase
      .from('acct_fiscal_periods' as any)
      .select('id, fiscal_year_id, start_date, end_date')
      .lte('start_date', obr.period_end)
      .gte('end_date',   obr.period_start)
      .limit(1);
    const period = (periods as any[])?.[0] ?? null;
    if (!period) return { linesCreated: 0, error: 'No fiscal period covers the OBR date range — GL posting skipped. Map it manually in Budget Planning.' };

    // 3. Fetch expense accounts
    const { data: accounts } = await supabase
      .from('acct_accounts' as any)
      .select('id, code, name_en, account_type')
      .eq('account_type', 'expense')
      .order('code');
    const accts = (accounts as any[]) ?? [];
    if (!accts.length) return { linesCreated: 0, error: 'No expense GL accounts found — configure Chart of Accounts first.' };

    // 4. For each category, find best-matching account and insert a budget line
    let created = 0;
    for (const [cat, { subtotal }] of Object.entries(grouped)) {
      if (subtotal <= 0) continue;
      const keywords = CATEGORY_GL_KEYWORDS[cat] ?? [cat];
      const matched =
        accts.find(a => keywords.some(kw => (a.name_en as string).toLowerCase().includes(kw))) ??
        accts.find(a => (a.name_en as string).toLowerCase().includes('other')) ??
        accts[0];
      if (!matched) continue;

      // Idempotent — skip if this OBR already has a line for this account+period
      const { data: existing } = await supabase
        .from('acct_budget_lines' as any)
        .select('id')
        .eq('account_id', matched.id)
        .eq('period_id',  period.id)
        .eq('obr_id',     obr.id)
        .limit(1);
      if ((existing as any[])?.length) continue;

      const { error: insErr } = await supabase.from('acct_budget_lines' as any).insert({
        account_id:    matched.id,
        period_id:     period.id,
        fiscal_year_id: period.fiscal_year_id,
        budget_amount: subtotal,
        obr_id:        obr.id,
        obr_notes:     `OBR: ${obr.title} — ${categoryLabel(cat)}`,
      });
      if (!insErr) created++;
    }
    return { linesCreated: created };
  } catch (e: any) {
    return { linesCreated: 0, error: e?.message ?? 'Unknown error during GL posting' };
  }
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function OperationalBudgetRequests() {
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const { toast } = useToast();

  const isAdmin     = isSuperAdmin() || hasAnyRole(['admin', 'Admin', 'financialAdmin', 'financial_admin', 'FinancialAdmin']);
  const isFOM       = hasAnyRole(['fom', 'FOM']);
  const isReviewer  = isAdmin || isFOM || hasAnyRole(['coordinator', 'countryDirector', 'cd', 'projectManager']);

  const currentUserId   = currentUser?.id ?? '';
  const currentUserName = currentUser?.fullName ?? currentUser?.email ?? 'Unknown';

  const [requests, setRequests] = useState<OBR[]>([]);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('mine');

  const [formOpen, setFormOpen]         = useState(false);
  const [editing, setEditing]           = useState<OBR | null>(null);
  const [viewingObr, setViewingObr]     = useState<OBR | null>(null);
  const [approvingObr, setApprovingObr] = useState<{ obr: OBR; tier: 1 | 2 } | null>(null);
  const [cancelling, setCancelling]     = useState<string | null>(null);

  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('operational_budget_requests' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load budget requests', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as OBR[];

    // Enrich with submitter names and project names
    const userIds = [...new Set(rows.map(r => r.submitted_by).filter(Boolean))];
    const projectIds = [...new Set(rows.map(r => r.project_id).filter(Boolean) as string[])];
    const [{ data: profiles }, { data: projects }] = await Promise.all([
      userIds.length ? supabase.from('profiles').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] }),
      projectIds.length ? supabase.from('projects').select('id, name').in('id', projectIds) : Promise.resolve({ data: [] }),
    ]);
    const nameMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.full_name]));
    const projMap = Object.fromEntries((projects ?? []).map((p: any) => [p.id, p.name]));

    setRequests(rows.map(r => ({
      ...r,
      submitter_name: nameMap[r.submitted_by] ?? r.submitted_by?.slice(0, 8),
      project_name: r.project_id ? projMap[r.project_id] : undefined,
    })));
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleCancel = async (id: string) => {
    setCancelling(id);
    await supabase.from('operational_budget_requests' as any).update({ status: 'cancelled' }).eq('id', id);
    setCancelling(null);
    fetchRequests();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('operational_budget_requests' as any).delete().eq('id', id);
    fetchRequests();
  };

  const filter = (list: OBR[]) => list.filter(r => {
    const matchSearch = !search || r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.hub ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.submitter_name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const myRequests        = filter(requests.filter(r => r.submitted_by === currentUserId));
  const pendingT1         = filter(requests.filter(r => r.status === 'submitted' && r.tier1_status === 'pending'));
  const pendingT2         = filter(requests.filter(r => r.status === 'submitted' && r.tier1_status === 'approved' && r.tier2_status === 'pending'));
  const reviewRequests    = filter([...pendingT1, ...pendingT2].filter((r, i, a) => a.findIndex(x => x.id === r.id) === i));
  const allRequests       = filter(requests);

  const ReviewBadge = ({ count }: { count: number }) => count > 0
    ? <span className="ml-1.5 rounded-full bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5">{count}</span>
    : null;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-6xl" data-testid="page-operational-budget-requests">
      <PageInfoBanner
        title="Operational Budget Requests"
        description="Plan your hub or project spending in advance. Create a budget request with line items grouped by expense category, preview a formal document, then submit it for two-tier approval (Supervisor → Finance Admin). Once approved, the budget becomes the spend baseline that can be compared against actual cost submissions. Use 'New Request' below to start — approved requests can be exported as a formatted PDF or Excel workbook."
        descriptionAr="خطط إنفاق المحور أو المشروع مسبقاً. أنشئ طلب ميزانية ببنود مصنفة، راجع المستند الرسمي، ثم أرسله للموافقة (مشرف → مدير مالي). بمجرد الاعتماد يصبح هذا الطلب خط الأساس للمقارنة مع تقديمات التكاليف الفعلية. اضغط 'طلب جديد' للبدء."
        workflowSteps={[
          { step: 1, role: 'Planner / Coordinator', action: 'Create & Preview',  description: 'Fill in title, period, hub, and add line items by category. Click "Preview & Submit" to see the formatted document.' },
          { step: 2, role: 'Supervisor / FOM',       action: 'Tier 1 Review',    description: 'The Supervisor or FOM receives a notification, reviews the request, and approves or rejects with notes.' },
          { step: 3, role: 'Finance Admin',           action: 'Tier 2 Approval', description: 'Finance Admin gives final sign-off. The status becomes Approved and the budget is locked as the spend baseline.' },
          { step: 4, role: 'Anyone with access',     action: 'Export',           description: 'Export any approved (or draft) request as a formatted PDF report or a branded Excel workbook with 3 sheets.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'منسق / مخطط',    action: 'إنشاء ومعاينة',      description: 'أدخل العنوان والفترة والمحور وأضف البنود. اضغط "معاينة وإرسال" لرؤية المستند الرسمي.' },
          { step: 2, role: 'مشرف / مدير ميداني', action: 'مراجعة المستوى الأول', description: 'يصل إشعار للمشرف للموافقة أو الرفض مع ملاحظات.' },
          { step: 3, role: 'مدير مالي',        action: 'الموافقة النهائية',  description: 'الموافقة النهائية من المدير المالي.' },
          { step: 4, role: 'أي مستخدم',         action: 'تصدير',             description: 'تصدير الطلب كملف PDF أو Excel بصيغة مصممة.' },
        ]}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <Input
            placeholder="Search by title, hub, or submitter…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={fetchRequests} className="h-8">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
          <Button type="button" size="sm" className="h-8 bg-[#0F2041] hover:bg-[#1D3461] text-white" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> New Request
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="mine" className="text-xs sm:text-sm">
            My Requests
            {myRequests.filter(r => r.status === 'draft').length > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-400 text-white text-[9px] font-bold px-1.5 py-0.5">
                {myRequests.filter(r => r.status === 'draft').length}
              </span>
            )}
          </TabsTrigger>
          {isReviewer && (
            <TabsTrigger value="review" className="text-xs sm:text-sm">
              To Review<ReviewBadge count={reviewRequests.length} />
            </TabsTrigger>
          )}
          {(isAdmin || isFOM) && (
            <TabsTrigger value="all" className="text-xs sm:text-sm">All Requests</TabsTrigger>
          )}
        </TabsList>

        {/* My Requests */}
        <TabsContent value="mine" className="mt-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : myRequests.length === 0 ? (
            <div className="text-center py-14 border border-dashed rounded-lg">
              <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No budget requests yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Create a budget request to plan your operational spending for a period. Click <strong>New Request</strong> to get started.
              </p>
              <Button type="button" size="sm" className="mt-4 bg-[#0F2041] hover:bg-[#1D3461] text-white" onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" /> New Request
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {myRequests.map(obr => (
                <OBRCard
                  key={obr.id} obr={obr}
                  currentUserId={currentUserId} isReviewer={isReviewer} isAdmin={isAdmin}
                  onEdit={() => { setEditing(obr); setFormOpen(true); }}
                  onView={() => setViewingObr(obr)}
                  onApprove={tier => setApprovingObr({ obr, tier })}
                  onCancel={() => handleCancel(obr.id)}
                  onDelete={() => handleDelete(obr.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* To Review */}
        {isReviewer && (
          <TabsContent value="review" className="mt-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : reviewRequests.length === 0 ? (
              <div className="text-center py-14 border border-dashed rounded-lg">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-400 mb-3" />
                <p className="text-sm font-medium">All clear — no pending reviews</p>
                <p className="text-xs text-muted-foreground mt-1">Budget requests awaiting your review will appear here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingT1.length > 0 && (
                  <>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">Awaiting Tier 1 Review</h3>
                    <div className="grid gap-3">
                      {pendingT1.map(obr => (
                        <OBRCard key={obr.id} obr={obr} currentUserId={currentUserId} isReviewer={isReviewer} isAdmin={isAdmin}
                          onEdit={() => { setEditing(obr); setFormOpen(true); }}
                          onView={() => setViewingObr(obr)}
                          onApprove={tier => setApprovingObr({ obr, tier })}
                          onCancel={() => handleCancel(obr.id)}
                          onDelete={() => handleDelete(obr.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
                {pendingT2.length > 0 && (
                  <>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-4">Awaiting Final Approval (Tier 2)</h3>
                    <div className="grid gap-3">
                      {pendingT2.map(obr => (
                        <OBRCard key={obr.id} obr={obr} currentUserId={currentUserId} isReviewer={isReviewer} isAdmin={isAdmin}
                          onEdit={() => { setEditing(obr); setFormOpen(true); }}
                          onView={() => setViewingObr(obr)}
                          onApprove={tier => setApprovingObr({ obr, tier })}
                          onCancel={() => handleCancel(obr.id)}
                          onDelete={() => handleDelete(obr.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </TabsContent>
        )}

        {/* All Requests */}
        {(isAdmin || isFOM) && (
          <TabsContent value="all" className="mt-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : allRequests.length === 0 ? (
              <div className="text-center py-14 border border-dashed rounded-lg">
                <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No budget requests found.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {allRequests.map(obr => (
                  <OBRCard key={obr.id} obr={obr} currentUserId={currentUserId} isReviewer={isReviewer} isAdmin={isAdmin}
                    onEdit={() => { setEditing(obr); setFormOpen(true); }}
                    onView={() => setViewingObr(obr)}
                    onApprove={tier => setApprovingObr({ obr, tier })}
                    onCancel={() => handleCancel(obr.id)}
                    onDelete={() => handleDelete(obr.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Form dialog */}
      <OBRFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={fetchRequests}
        editing={editing}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
      />

      {/* View/preview dialog */}
      {viewingObr && (
        <Dialog open={!!viewingObr} onOpenChange={v => { if (!v) setViewingObr(null); }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
            <OBRPreviewDocument
              obr={viewingObr}
              submitterName={viewingObr.submitter_name ?? currentUserName}
              onClose={() => setViewingObr(null)}
              onExportPDF={() => exportOBRPDF(viewingObr, viewingObr.submitter_name ?? currentUserName)}
              onExportExcel={() => exportOBRExcel(viewingObr)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Approval dialog */}
      {approvingObr && (
        <ApprovalDialog
          obr={approvingObr.obr}
          tier={approvingObr.tier}
          open={!!approvingObr}
          onClose={() => setApprovingObr(null)}
          onDone={fetchRequests}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
        />
      )}
    </div>
  );
}
