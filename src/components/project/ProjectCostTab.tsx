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
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  ExternalLink,
  Filter,
  TrendingUp,
  Receipt,
  AlertTriangle,
  Download,
  Loader2,
  FileText,
  BookOpen,
  RefreshCw,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import * as XLSX from 'xlsx';

interface ProjectCostTabProps {
  projectId: string;
  projectName: string;
  budgetTotalCents?: number | null;
  currency?: string;
}

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

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  under_review: { label: 'Under Review', variant: 'outline' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  paid: { label: 'Paid', variant: 'default' },
  reconciled: { label: 'Reconciled', variant: 'default' },
};

function getDerivedStatus(oc: OperationalCost): string {
  if (oc.reconciled_at) return 'reconciled';
  if (oc.paid_at) return 'paid';
  if (oc.tier2_status === 'approved') return 'approved';
  if (oc.tier2_status === 'rejected' || oc.tier1_status === 'rejected') return 'rejected';
  if (oc.tier1_status === 'approved') return 'under_review';
  return 'pending';
}

const formatCurrency = (cents: number, currency: string = 'SDG') => {
  return `${currency} ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
};

const safeFormatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, 'dd MMM yyyy') : '-';
  } catch { return '-'; }
};

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

function GLBridgeSection({ projectId, projectName, costIds }: { projectId: string; projectName: string; costIds: string[] }) {
  const [glLines, setGlLines] = useState<GLLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchGL = async () => {
    setLoading(true);
    try {
      // Strategy: look for journal entries whose source_id matches any of this project's op-cost IDs
      // or whose description_en contains the project name
      const promises: Promise<any>[] = [];

      // 1. By source_id = projectId (if project is linked directly to JE)
      promises.push(
        supabase
          .from('acct_journal_entries')
          .select('id, entry_no, posting_date, description_en, source_type, status, acct_journal_lines(id, line_no, debit_credit, functional_amount, description, account_id, acct_accounts(code, name_en))')
          .eq('source_id', projectId)
          .in('status', ['posted', 'draft'])
          .order('posting_date', { ascending: false })
          .limit(100)
      );

      // 2. By source_id matching any cost submission ID
      if (costIds.length > 0) {
        promises.push(
          supabase
            .from('acct_journal_entries')
            .select('id, entry_no, posting_date, description_en, source_type, status, acct_journal_lines(id, line_no, debit_credit, functional_amount, description, account_id, acct_accounts(code, name_en))')
            .in('source_id', costIds.slice(0, 100))
            .in('status', ['posted', 'draft'])
            .order('posting_date', { ascending: false })
            .limit(200)
        );
      }

      const results = await Promise.all(promises.map(p => p.catch(() => ({ data: [] }))));

      // Flatten and deduplicate by line id
      const seen = new Set<string>();
      const lines: GLLine[] = [];
      for (const res of results) {
        for (const je of ((res as any).data ?? []) as any[]) {
          for (const l of (je.acct_journal_lines ?? []) as any[]) {
            if (seen.has(l.id)) continue;
            seen.add(l.id);
            lines.push({
              id: l.id,
              line_no: l.line_no,
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
      lines.sort((a, b) => b.posting_date.localeCompare(a.posting_date) || a.entry_no - b.entry_no);
      setGlLines(lines);
    } catch {
      // Silently ignore — GL tables may not exist in all environments
    }
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
            Shows GL journal lines linked to this project or its cost submissions.
          </p>
        )}
      </CardHeader>
      {loaded && (
        <CardContent className="p-4 pt-0 space-y-3">
          {glLines.length === 0 ? (
            <div className="text-center text-muted-foreground text-xs py-6 border border-dashed rounded-lg">
              No GL journal entries found linked to this project. GL Bridge entries are created when operational costs are posted through the Journals module.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border p-2.5">
                  <div className="text-muted-foreground">Total Debits</div>
                  <div className="font-bold text-sm mt-0.5 text-indigo-700 dark:text-indigo-400">{totalDR.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="rounded-md border p-2.5">
                  <div className="text-muted-foreground">Total Credits</div>
                  <div className="font-bold text-sm mt-0.5 text-slate-700 dark:text-slate-300">{totalCR.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
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
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">{l.functional_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
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

export default function ProjectCostTab({ projectId, projectName, budgetTotalCents, currency = 'SDG' }: ProjectCostTabProps) {
  const navigate = useNavigate();
  const { users } = useUser();
  const [costs, setCosts] = useState<OperationalCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const fetchCosts = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('operational_cost_submissions')
          .select('id, expense_category, amount_cents, currency, description, expense_date, vendor, submitted_by, submitted_at, status, tier1_status, tier2_status, paid_at, reconciled_at, reconciled_amount_cents, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setCosts((data as OperationalCost[]) || []);
      } catch (err) {
        console.error('Failed to fetch project costs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCosts();
  }, [projectId]);

  const filteredCosts = useMemo(() => {
    return costs.filter(c => {
      if (categoryFilter !== 'all' && c.expense_category !== categoryFilter) return false;
      if (statusFilter !== 'all' && getDerivedStatus(c) !== statusFilter) return false;
      return true;
    });
  }, [costs, categoryFilter, statusFilter]);

  const stats = useMemo(() => {
    const totalSubmitted = costs.reduce((s, c) => s + c.amount_cents, 0);
    const approved = costs.filter(c => ['approved', 'paid', 'reconciled'].includes(getDerivedStatus(c)));
    const totalApproved = approved.reduce((s, c) => s + c.amount_cents, 0);
    const totalPaid = costs.filter(c => ['paid', 'reconciled'].includes(getDerivedStatus(c))).reduce((s, c) => s + c.amount_cents, 0);
    const totalReconciled = costs.filter(c => getDerivedStatus(c) === 'reconciled').reduce((s, c) => s + (c.reconciled_amount_cents || c.amount_cents), 0);
    const pendingCount = costs.filter(c => ['pending', 'under_review'].includes(getDerivedStatus(c))).length;
    const rejectedCount = costs.filter(c => getDerivedStatus(c) === 'rejected').length;

    const byCategory: Record<string, number> = {};
    costs.forEach(c => {
      const cat = c.expense_category || 'other';
      byCategory[cat] = (byCategory[cat] || 0) + c.amount_cents;
    });

    return { totalSubmitted, totalApproved, totalPaid, totalReconciled, pendingCount, rejectedCount, byCategory, totalCount: costs.length };
  }, [costs]);

  const budgetUtilization = useMemo(() => {
    if (!budgetTotalCents || budgetTotalCents <= 0) return null;
    const pct = Math.min(100, (stats.totalApproved / budgetTotalCents) * 100);
    return { percentage: pct, remaining: budgetTotalCents - stats.totalApproved };
  }, [budgetTotalCents, stats.totalApproved]);

  const getUserName = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return u?.name || u?.email || userId.slice(0, 8);
  };

  const exportToExcel = () => {
    const rows = filteredCosts.map(c => ({
      Date: safeFormatDate(c.expense_date || c.submitted_at),
      Category: EXPENSE_LABELS[c.expense_category] || c.expense_category,
      Description: c.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || '-',
      Vendor: c.vendor || '-',
      'Amount (SDG)': (c.amount_cents / 100).toFixed(2),
      Status: STATUS_CONFIG[getDerivedStatus(c)]?.label || getDerivedStatus(c),
      'Submitted By': getUserName(c.submitted_by),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Project Costs');
    XLSX.writeFile(wb, `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_costs.xlsx`);
  };

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="stat-total-submitted">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Total Submitted</span>
            </div>
            <p className="text-lg font-bold">{formatCurrency(stats.totalSubmitted, currency)}</p>
            <p className="text-xs text-muted-foreground">{stats.totalCount} submissions</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-total-approved">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Approved</span>
            </div>
            <p className="text-lg font-bold text-green-600">{formatCurrency(stats.totalApproved, currency)}</p>
            <p className="text-xs text-muted-foreground">{stats.pendingCount} pending</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-total-paid">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Paid Out</span>
            </div>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(stats.totalPaid, currency)}</p>
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

      {budgetUtilization && (
        <Card data-testid="card-budget-utilization">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Budget Utilization</span>
              </div>
              <span className="text-sm font-bold">{budgetUtilization.percentage.toFixed(1)}%</span>
            </div>
            <Progress
              value={budgetUtilization.percentage}
              className={`h-3 ${budgetUtilization.percentage > 90 ? '[&>*]:bg-red-500' : budgetUtilization.percentage > 70 ? '[&>*]:bg-amber-500' : '[&>*]:bg-green-500'}`}
            />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>Approved: {formatCurrency(stats.totalApproved, currency)}</span>
              <span>Budget: {formatCurrency(budgetTotalCents!, currency)}</span>
            </div>
            {budgetUtilization.percentage > 90 && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Budget utilization is above 90% - review before approving more costs</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                    <span className="font-mono font-medium">{formatCurrency(amount, currency)}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

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
        <Button size="sm" variant="outline" onClick={exportToExcel} data-testid="button-export-costs">
          <Download className="h-4 w-4 mr-1.5" />
          Export
        </Button>
        <Button size="sm" onClick={() => navigate('/cost-submission')} data-testid="button-go-cost-submission">
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
                          {safeFormatDate(cost.expense_date || cost.submitted_at)}
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
                          {formatCurrency(cost.amount_cents, cost.currency || currency)}
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

      {/* ── GL Bridge — journal entries linked to this project ─── */}
      <GLBridgeSection
        projectId={projectId}
        projectName={projectName}
        costIds={costs.map(c => c.id)}
      />
    </div>
  );
}
