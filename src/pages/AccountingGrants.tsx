import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { usePageManageOverride } from '@/hooks/usePageManageOverride';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2, Award, RefreshCw, Download, Plus, AlertTriangle,
  CheckCircle2, Clock, XCircle, Receipt, Flag, Pencil, FileText,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Grant {
  id: string; grant_name: string; donor_name: string; reference_number: string | null;
  award_amount: number; currency: string; start_date: string; end_date: string;
  reporting_frequency: string; status: string; description: string | null;
  fund_id: string | null; created_at: string;
}
interface GrantWithSpend extends Grant { spent: number; remaining: number; burnRate: number; daysLeft: number }

interface GrantExpense {
  id: string; grant_id: string; expense_date: string; amount: number;
  description: string | null; account_id: string | null; created_at: string;
}
interface GrantMilestone {
  id: string; grant_id: string; title: string; due_date: string;
  status: string; submitted_date: string | null; notes: string | null; created_at: string;
}

const STATUS_BADGE: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  active:        { label: 'Active',         class: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: CheckCircle2 },
  expiring_soon: { label: 'Expiring Soon',  class: 'bg-amber-100 text-amber-700 border-amber-300',      icon: Clock },
  expired:       { label: 'Expired',        class: 'bg-rose-100 text-rose-700 border-rose-300',          icon: XCircle },
  draft:         { label: 'Draft',          class: 'bg-slate-100 text-slate-600 border-slate-300',       icon: Clock },
  closed:        { label: 'Closed',         class: 'bg-slate-100 text-slate-600 border-slate-300',       icon: XCircle },
};

const MILESTONE_BADGE: Record<string, { label: string; class: string }> = {
  pending:     { label: 'Pending',     class: 'bg-slate-100 text-slate-600 border-slate-300' },
  in_progress: { label: 'In Progress', class: 'bg-blue-100 text-blue-700 border-blue-300' },
  submitted:   { label: 'Submitted',   class: 'bg-amber-100 text-amber-700 border-amber-300' },
  accepted:    { label: 'Accepted',    class: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  overdue:     { label: 'Overdue',     class: 'bg-rose-100 text-rose-700 border-rose-300' },
};

const MIGRATION_NOTICE = (
  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-4 flex items-start gap-3">
    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
    <div>
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Migration required</p>
      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
        Run <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">supabase/migrations/20260502_acct_phase5_expansion.sql</code> then{' '}
        <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">hr_advances_grant_milestones.sql</code> to enable Grant Tracking.
      </p>
    </div>
  </div>
);

const BLANK_GRANT = { grant_name: '', donor_name: '', reference_number: '', award_amount: '', currency: 'USD', start_date: '', end_date: '', reporting_frequency: 'quarterly', status: 'active', description: '' };
const BLANK_EXPENSE = { expense_date: '', amount: '', description: '' };
const BLANK_MILESTONE = { title: '', due_date: '', status: 'pending', submitted_date: '', notes: '' };

export default function AccountingGrants() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const roleCanEdit = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);

  const overrideCanEdit = usePageManageOverride('acct-grants', roleCanEdit);

  const canEdit = roleCanEdit || overrideCanEdit;
  const { toast } = useToast();

  const [grants, setGrants]           = useState<GrantWithSpend[]>([]);
  const [loading, setLoading]         = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Add grant dialog
  const [showAdd, setShowAdd]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState(BLANK_GRANT);

  // Grant detail dialog (expenses + milestones)
  const [selectedGrant, setSelectedGrant]       = useState<GrantWithSpend | null>(null);
  const [detailTab, setDetailTab]               = useState('expenses');
  const [expenses, setExpenses]                 = useState<GrantExpense[]>([]);
  const [milestones, setMilestones]             = useState<GrantMilestone[]>([]);
  const [detailLoading, setDetailLoading]       = useState(false);

  // Add expense sub-dialog
  const [showAddExpense, setShowAddExpense]   = useState(false);
  const [expenseForm, setExpenseForm]         = useState(BLANK_EXPENSE);
  const [savingExpense, setSavingExpense]     = useState(false);

  // Add milestone sub-dialog
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [milestoneForm, setMilestoneForm]       = useState(BLANK_MILESTONE);
  const [savingMilestone, setSavingMilestone]   = useState(false);

  // Edit milestone status inline
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null);

  // GL bridge log for expenses — map of expense_id → status
  const [expenseGlLog, setExpenseGlLog] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('acct_grants' as any).select('*').order('end_date', { ascending: true }).limit(500);
    if (error?.code === '42P01') { setMigrationNeeded(true); setLoading(false); return; }
    setMigrationNeeded(false);
    const today = new Date();
    const rows: GrantWithSpend[] = ((data ?? []) as Grant[]).map(g => {
      const daysLeft = differenceInDays(parseISO(g.end_date), today);
      let computedStatus = g.status;
      if (g.status === 'active') {
        if (daysLeft < 0) computedStatus = 'expired';
        else if (daysLeft <= 30) computedStatus = 'expiring_soon';
      }
      return { ...g, status: computedStatus, spent: 0, remaining: g.award_amount, burnRate: 0, daysLeft };
    });

    const spendRes = await supabase.from('acct_grant_expenses' as any).select('grant_id, amount').limit(50000).catch(() => ({ data: null }));
    const spendMap: Record<string, number> = {};
    for (const s of (spendRes.data ?? []) as any[]) spendMap[s.grant_id] = (spendMap[s.grant_id] ?? 0) + Number(s.amount ?? 0);
    const enriched = rows.map(g => {
      const spent = spendMap[g.id] ?? 0;
      const burnRate = g.award_amount > 0 ? Math.round((spent / g.award_amount) * 100) : 0;
      return { ...g, spent, remaining: g.award_amount - spent, burnRate };
    });
    setGrants(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Load detail when a grant is selected
  const openDetail = useCallback(async (g: GrantWithSpend) => {
    setSelectedGrant(g);
    setDetailTab('expenses');
    setDetailLoading(true);
    setExpenseGlLog({});
    const [exRes, msRes] = await Promise.all([
      supabase.from('acct_grant_expenses' as any).select('*').eq('grant_id', g.id).order('expense_date', { ascending: false }).limit(500).catch(() => ({ data: [] })),
      supabase.from('acct_grant_milestones' as any).select('*').eq('grant_id', g.id).order('due_date').limit(200).catch(() => ({ data: [] })),
    ]);
    const loadedExpenses = ((exRes as any).data ?? []) as GrantExpense[];
    setExpenses(loadedExpenses);
    setMilestones(((msRes as any).data ?? []) as GrantMilestone[]);

    // Fetch GL bridge statuses for these expense rows
    if (loadedExpenses.length > 0) {
      const ids = loadedExpenses.map(e => e.id);
      const { data: glData } = await supabase
        .from('acct_gl_bridge_log' as any)
        .select('source_id, status')
        .eq('source_table', 'acct_grant_expenses')
        .in('source_id', ids.slice(0, 500))
        .order('created_at', { ascending: false });
      const map: Record<string, string> = {};
      for (const row of (glData ?? []) as any[]) {
        if (!map[row.source_id]) map[row.source_id] = row.status;
      }
      setExpenseGlLog(map);
    }

    setDetailLoading(false);
  }, []);

  const filtered = grants.filter(g => {
    if (statusFilter !== 'all' && g.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return !q || g.grant_name.toLowerCase().includes(q) || g.donor_name.toLowerCase().includes(q) || (g.reference_number ?? '').toLowerCase().includes(q);
  });

  const totals = {
    awarded:  grants.reduce((s, g) => s + g.award_amount, 0),
    spent:    grants.reduce((s, g) => s + g.spent, 0),
    active:   grants.filter(g => g.status === 'active').length,
    expiring: grants.filter(g => g.status === 'expiring_soon').length,
  };

  const saveGrant = async () => {
    if (!form.grant_name || !form.donor_name || !form.award_amount || !form.start_date || !form.end_date) {
      toast({ title: 'Required fields missing', variant: 'destructive' }); return;
    }
    setSaving(true);
    const { error } = await supabase.from('acct_grants' as any).insert({ ...form, award_amount: parseFloat(form.award_amount) });
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Grant added' });
    setShowAdd(false);
    setForm(BLANK_GRANT);
    void load();
  };

  const saveExpense = async () => {
    if (!expenseForm.expense_date || !expenseForm.amount || !selectedGrant) {
      toast({ title: 'Date and amount are required', variant: 'destructive' }); return;
    }
    setSavingExpense(true);
    const { error } = await supabase.from('acct_grant_expenses' as any).insert({
      grant_id: selectedGrant.id,
      expense_date: expenseForm.expense_date,
      amount: parseFloat(expenseForm.amount),
      description: expenseForm.description || null,
    });
    setSavingExpense(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Expense recorded' });
    setShowAddExpense(false);
    setExpenseForm(BLANK_EXPENSE);
    void openDetail(selectedGrant);
    void load();
  };

  const saveMilestone = async () => {
    if (!milestoneForm.title || !milestoneForm.due_date || !selectedGrant) {
      toast({ title: 'Title and due date are required', variant: 'destructive' }); return;
    }
    setSavingMilestone(true);
    const { error } = await supabase.from('acct_grant_milestones' as any).insert({
      grant_id: selectedGrant.id,
      title: milestoneForm.title,
      due_date: milestoneForm.due_date,
      status: milestoneForm.status,
      submitted_date: milestoneForm.submitted_date || null,
      notes: milestoneForm.notes || null,
    });
    setSavingMilestone(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Milestone added' });
    setShowAddMilestone(false);
    setMilestoneForm(BLANK_MILESTONE);
    void openDetail(selectedGrant);
  };

  const updateMilestoneStatus = async (msId: string, newStatus: string) => {
    const { error } = await supabase.from('acct_grant_milestones' as any).update({ status: newStatus }).eq('id', msId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setMilestones(prev => prev.map(m => m.id === msId ? { ...m, status: newStatus } : m));
    setEditingMilestone(null);
  };

  const exportCsv = () => {
    const header = ['Grant Name', 'Donor', 'Reference', 'Award Amount', 'Currency', 'Spent', 'Remaining', 'Burn Rate %', 'Start Date', 'End Date', 'Status'];
    const body = filtered.map(g => [g.grant_name, g.donor_name, g.reference_number ?? '', g.award_amount.toFixed(2), g.currency, g.spent.toFixed(2), g.remaining.toFixed(2), `${g.burnRate}%`, g.start_date, g.end_date, g.status]);
    downloadCsv(`grants-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  const [generatingPdf, setGeneratingPdf] = useState(false);

  const generateGrantPdf = async (g: GrantWithSpend) => {
    setGeneratingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      let y = 15;

      // Header band
      doc.setFillColor(180, 120, 20);
      doc.rect(0, 0, pageW, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Grant Progress Report', 14, 12);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${format(new Date(), 'dd MMMM yyyy HH:mm')}`, 14, 20);
      doc.text('PACT Command Center', pageW - 14, 20, { align: 'right' });

      y = 36;
      doc.setTextColor(0, 0, 0);

      // Grant info block
      doc.setFillColor(249, 250, 251);
      doc.rect(10, y, pageW - 20, 34, 'F');
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(g.grant_name, 14, y + 8);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(`Donor: ${g.donor_name}`, 14, y + 16);
      doc.text(`Reference: ${g.reference_number ?? 'N/A'}`, 14, y + 22);
      doc.text(`Period: ${g.start_date} → ${g.end_date}`, 14, y + 28);
      if (g.description) doc.text(`Description: ${g.description}`, 14, y + 34);

      y += 42;
      doc.setTextColor(0, 0, 0);

      // Financial Summary table
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Financial Summary', 14, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [['Metric', 'Amount', 'Currency']],
        body: [
          ['Total Awarded', formatNumber(g.award_amount, 2), g.currency],
          ['Total Spent',   formatNumber(g.spent, 2),       g.currency],
          ['Remaining',     formatNumber(g.remaining, 2),   g.currency],
          ['Burn Rate',     `${g.burnRate}%`,               ''],
          ['Days Remaining', g.daysLeft >= 0 ? `${g.daysLeft} days` : 'Expired', ''],
        ],
        headStyles:  { fillColor: [180, 120, 20], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles:  { fontSize: 9 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } },
        margin: { left: 14, right: 14 },
        tableWidth: 'auto',
      });

      y = (doc as any).lastAutoTable.finalY + 10;

      // Expenses table
      if (expenses.length > 0) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Expense Ledger', 14, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          head: [['Date', 'Description', 'Amount']],
          body: expenses.map(e => [e.expense_date, e.description ?? '—', formatNumber(e.amount, 2)]),
          foot: [['', 'TOTAL', formatNumber(expenses.reduce((s, e) => s + e.amount, 0), 2)]],
          headStyles:  { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 9 },
          footStyles:  { fillColor: [240, 242, 255], fontStyle: 'bold', fontSize: 9 },
          bodyStyles:  { fontSize: 9 },
          columnStyles: { 2: { halign: 'right' } },
          margin: { left: 14, right: 14 },
        });

        y = (doc as any).lastAutoTable.finalY + 10;
      }

      // Milestones table
      if (milestones.length > 0) {
        if (y > 220) { doc.addPage(); y = 15; }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Reporting Milestones', 14, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          head: [['Milestone', 'Due Date', 'Status', 'Submitted']],
          body: milestones.map(m => [m.title, m.due_date, m.status.replace('_', ' ').toUpperCase(), m.submitted_date ?? '—']),
          headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          margin: { left: 14, right: 14 },
        });
      }

      // Footer on every page
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${pageCount} · PACT Command Center · Confidential`, pageW / 2, 290, { align: 'center' });
      }

      doc.save(`Grant_Report_${g.grant_name.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="grants-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-600 text-white shrink-0"><Award className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold">Grant Tracking</h1>
            <p className="text-muted-foreground text-sm">تتبع المنح — Donor grant registry, spend monitoring & milestones</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}><Download className="h-4 w-4 mr-1" />CSV</Button>
          {canEdit && !migrationNeeded && <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-grant"><Plus className="h-4 w-4 mr-1" />Add Grant</Button>}
        </div>
      </div>

      <PageInfoBanner
        title="Grant Tracking"
        description="Monitor donor grants: awarded vs spent vs remaining, burn rate, expiry, and reporting milestones. Click any grant row to record expenses and manage milestone submissions."
        descriptionAr="مراقبة المنح: المبلغ الممنوح مقابل المنفق والمتبقي ومعدل الصرف والمراحل."
      />

      {migrationNeeded ? MIGRATION_NOTICE : loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total Awarded', v: formatNumber(totals.awarded, 0), color: 'text-indigo-700 dark:text-indigo-400' },
              { label: 'Total Spent',   v: formatNumber(totals.spent, 0),   color: 'text-slate-700 dark:text-slate-300' },
              { label: 'Active Grants', v: String(totals.active),            color: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Expiring Soon', v: String(totals.expiring),          color: totals.expiring > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500' },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-3"><div className="text-xs text-muted-foreground">{s.label}</div><div className={cn('text-lg font-bold mt-1', s.color)}>{s.v}</div></CardContent></Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input className="h-9 text-sm max-w-xs" placeholder="Search grants…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-40" data-testid="select-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-16 text-sm">
              {grants.length === 0 ? 'No grants yet. Add your first grant to start tracking.' : 'No grants match the current filters.'}
            </div>
          ) : (
            <Card>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Grant / Donor</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Reference</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Awarded</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Spent</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Remaining</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-20">Burn %</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">End Date</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-28">Status</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-20">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((g, i) => {
                        const meta = STATUS_BADGE[g.status] ?? STATUS_BADGE['draft'];
                        const Icon = meta.icon;
                        return (
                          <tr key={g.id} className={cn('border-b hover:bg-muted/20', i % 2 !== 0 && 'bg-muted/10')} data-testid={`row-grant-${g.id}`}>
                            <td className="px-4 py-2.5">
                              <div className="font-medium">{g.grant_name}</div>
                              <div className="text-muted-foreground">{g.donor_name}</div>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">{g.reference_number ?? '—'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatNumber(g.award_amount, 0)} <span className="text-muted-foreground">{g.currency}</span></td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(g.spent, 0)}</td>
                            <td className={cn('px-4 py-2.5 text-right tabular-nums font-medium', g.remaining < 0 ? 'text-rose-700' : 'text-emerald-700')}>{formatNumber(g.remaining, 0)}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className={cn('font-semibold', g.burnRate > 100 ? 'text-rose-700' : g.burnRate >= 80 ? 'text-amber-700' : 'text-emerald-700')}>{g.burnRate}%</span>
                              <div className="mt-0.5 h-1 w-14 rounded-full bg-muted overflow-hidden inline-block ml-1 align-middle">
                                <div className={cn('h-full rounded-full', g.burnRate > 100 ? 'bg-rose-500' : g.burnRate >= 80 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(g.burnRate, 100)}%` }} />
                              </div>
                            </td>
                            <td className={cn('px-4 py-2.5', g.daysLeft <= 30 && g.daysLeft >= 0 ? 'text-amber-700 font-medium' : g.daysLeft < 0 ? 'text-rose-700' : '')}>
                              {format(parseISO(g.end_date), 'dd MMM yyyy')}
                              {g.daysLeft >= 0 && <div className="text-[10px] text-muted-foreground">{g.daysLeft}d left</div>}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge variant="outline" className={cn('text-[10px] gap-1', meta.class)}>
                                <Icon className="h-3 w-3" />{meta.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5">
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => openDetail(g)} data-testid={`button-detail-${g.id}`}>
                                <Receipt className="h-3 w-3 mr-1" />Manage
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Add Grant Dialog ─────────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Grant</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {[
              { key: 'grant_name',        label: 'Grant Name *',    span: 2 },
              { key: 'donor_name',        label: 'Donor Name *',    span: 1 },
              { key: 'reference_number',  label: 'Reference No.',   span: 1 },
              { key: 'award_amount',      label: 'Award Amount *',  span: 1, type: 'number' },
              { key: 'currency',          label: 'Currency',        span: 1 },
              { key: 'start_date',        label: 'Start Date *',    span: 1, type: 'date' },
              { key: 'end_date',          label: 'End Date *',      span: 1, type: 'date' },
            ].map(f => (
              <div key={f.key} className={f.span === 2 ? 'col-span-2' : ''}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type ?? 'text'} value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className="h-8 text-sm" data-testid={`input-${f.key}`} />
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1 block">Reporting Frequency</Label>
              <Select value={form.reporting_frequency} onValueChange={v => setForm(p => ({ ...p, reporting_frequency: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="semi_annual">Semi-Annual</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs mb-1 block">Description</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="h-8 text-sm" data-testid="input-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={saveGrant} disabled={saving} data-testid="button-save-grant">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Grant Detail Dialog (Expenses + Milestones) ───────────── */}
      <Dialog open={!!selectedGrant} onOpenChange={open => { if (!open) setSelectedGrant(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-600" />
              {selectedGrant?.grant_name}
              <span className="text-sm font-normal text-muted-foreground ml-1">— {selectedGrant?.donor_name}</span>
            </DialogTitle>
          </DialogHeader>

          {/* PDF Export button */}
          {!detailLoading && selectedGrant && (
            <div className="flex justify-end pb-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateGrantPdf(selectedGrant)}
                disabled={generatingPdf}
                data-testid="button-grant-pdf"
              >
                {generatingPdf
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <FileText className="h-4 w-4 mr-1" />
                }
                PDF Report
              </Button>
            </div>
          )}

          {detailLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Tabs value={detailTab} onValueChange={setDetailTab}>
              <TabsList className="mb-3">
                <TabsTrigger value="expenses" data-testid="tab-expenses">
                  <Receipt className="h-3.5 w-3.5 mr-1.5" />Expenses ({expenses.length})
                </TabsTrigger>
                <TabsTrigger value="milestones" data-testid="tab-milestones">
                  <Flag className="h-3.5 w-3.5 mr-1.5" />Milestones ({milestones.length})
                </TabsTrigger>
              </TabsList>

              {/* Expenses Tab */}
              <TabsContent value="expenses" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Total recorded: <span className="font-semibold text-foreground">{formatNumber(expenses.reduce((s, e) => s + e.amount, 0), 2)} {selectedGrant?.currency}</span>
                    {' '}of <span className="font-semibold text-foreground">{formatNumber(selectedGrant?.award_amount ?? 0, 2)}</span> awarded
                  </div>
                  {canEdit && (
                    <Button size="sm" onClick={() => setShowAddExpense(true)} data-testid="button-add-expense">
                      <Plus className="h-4 w-4 mr-1" />Add Expense
                    </Button>
                  )}
                </div>

                {expenses.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10 text-sm border border-dashed rounded-lg">
                    No expenses recorded yet. Click "Add Expense" to start tracking spend against this grant.
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">Amount</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">GL Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((e, i) => {
                          const glStatus = expenseGlLog[e.id];
                          return (
                            <tr key={e.id} className={cn('border-b', i % 2 !== 0 && 'bg-muted/10')} data-testid={`row-expense-${e.id}`}>
                              <td className="px-3 py-2 whitespace-nowrap">{e.expense_date}</td>
                              <td className="px-3 py-2 text-muted-foreground">{e.description ?? '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium">{formatNumber(e.amount, 2)}</td>
                              <td className="px-3 py-2">
                                {glStatus === 'success' ? (
                                  <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300 gap-1">
                                    <CheckCircle2 className="h-3 w-3" />Posted
                                  </Badge>
                                ) : glStatus === 'error' ? (
                                  <Badge variant="outline" className="text-[10px] bg-rose-100 text-rose-700 border-rose-300 gap-1">
                                    <XCircle className="h-3 w-3" />Error
                                  </Badge>
                                ) : glStatus === 'skipped' ? (
                                  <Badge variant="outline" className="text-[10px] text-slate-500">Skipped</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-slate-400">Pending</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-muted/20 font-semibold">
                          <td className="px-3 py-2" colSpan={2}>Total</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatNumber(expenses.reduce((s, e) => s + e.amount, 0), 2)}</td>
                          <td className="px-3 py-2" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* Milestones Tab */}
              <TabsContent value="milestones" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {milestones.filter(m => m.status === 'accepted').length} accepted · {milestones.filter(m => m.status === 'pending' || m.status === 'in_progress').length} pending
                  </div>
                  {canEdit && (
                    <Button size="sm" onClick={() => setShowAddMilestone(true)} data-testid="button-add-milestone">
                      <Plus className="h-4 w-4 mr-1" />Add Milestone
                    </Button>
                  )}
                </div>

                {milestones.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10 text-sm border border-dashed rounded-lg">
                    No milestones yet. Add donor reporting milestones to track submissions.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {milestones.map(m => {
                      const ms = MILESTONE_BADGE[m.status] ?? MILESTONE_BADGE['pending'];
                      const isOverdue = !['accepted', 'submitted'].includes(m.status) && new Date(m.due_date) < new Date();
                      return (
                        <div key={m.id} className={cn('border rounded-lg p-3', isOverdue && 'border-rose-200 bg-rose-50 dark:bg-rose-950/20')} data-testid={`row-milestone-${m.id}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">{m.title}</div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                Due: {m.due_date}
                                {m.submitted_date && <> · Submitted: {m.submitted_date}</>}
                                {m.notes && <> · {m.notes}</>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {editingMilestone === m.id ? (
                                <Select defaultValue={m.status} onValueChange={v => updateMilestoneStatus(m.id, v)}>
                                  <SelectTrigger className="h-6 text-[10px] w-32"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.keys(MILESTONE_BADGE).map(k => <SelectItem key={k} value={k}>{MILESTONE_BADGE[k].label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <>
                                  <Badge variant="outline" className={cn('text-[10px]', ms.class)}>{ms.label}</Badge>
                                  {canEdit && (
                                    <button onClick={() => setEditingMilestone(m.id)} className="text-muted-foreground hover:text-foreground">
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add Expense Sub-Dialog ───────────────────────────────── */}
      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs mb-1 block">Expense Date *</Label>
              <Input type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm(p => ({ ...p, expense_date: e.target.value }))} className="h-8 text-sm" data-testid="input-expense-date" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Amount *</Label>
              <Input type="number" min="0" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))} className="h-8 text-sm" data-testid="input-expense-amount" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Description</Label>
              <Input value={expenseForm.description} onChange={e => setExpenseForm(p => ({ ...p, description: e.target.value }))} className="h-8 text-sm" data-testid="input-expense-desc" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddExpense(false)}>Cancel</Button>
            <Button onClick={saveExpense} disabled={savingExpense} data-testid="button-save-expense">
              {savingExpense && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Milestone Sub-Dialog ─────────────────────────────── */}
      <Dialog open={showAddMilestone} onOpenChange={setShowAddMilestone}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Milestone</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs mb-1 block">Milestone Title *</Label>
              <Input value={milestoneForm.title} onChange={e => setMilestoneForm(p => ({ ...p, title: e.target.value }))} className="h-8 text-sm" placeholder="e.g. Q1 Progress Report" data-testid="input-milestone-title" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Due Date *</Label>
              <Input type="date" value={milestoneForm.due_date} onChange={e => setMilestoneForm(p => ({ ...p, due_date: e.target.value }))} className="h-8 text-sm" data-testid="input-milestone-due" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Status</Label>
              <Select value={milestoneForm.status} onValueChange={v => setMilestoneForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MILESTONE_BADGE).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Submission Date</Label>
              <Input type="date" value={milestoneForm.submitted_date} onChange={e => setMilestoneForm(p => ({ ...p, submitted_date: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Notes</Label>
              <Textarea value={milestoneForm.notes} onChange={e => setMilestoneForm(p => ({ ...p, notes: e.target.value }))} className="text-sm min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMilestone(false)}>Cancel</Button>
            <Button onClick={saveMilestone} disabled={savingMilestone} data-testid="button-save-milestone">
              {savingMilestone && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
