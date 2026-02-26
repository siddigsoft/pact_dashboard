import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GradientStatCard, GRADIENT_PRESETS } from '@/components/dashboard/GradientStatCard';
import {
  DollarSign,
  Truck,
  Receipt,
  TrendingUp,
  Wallet,
  Award,
  FileSpreadsheet,
  FileText,
  BarChart3,
  Clock,
  CheckCircle,
  AlertTriangle,
  PieChart,
  FolderKanban,
  ExternalLink,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart as RechartsPieChart, Pie, Cell,
} from 'recharts';
import { useDownPayment } from '@/context/downPayment/DownPaymentContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, isValid, startOfMonth, subMonths } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface OpCostRow {
  id: string;
  project_id: string | null;
  expense_category: string;
  amount_cents: number;
  currency: string;
  description: string | null;
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

interface ConsolidatedFinancialTabProps {
  opCosts: OpCostRow[];
  costSubmissions: any[];
  totalPendingAmount: number;
  totalApprovedAmount: number;
  totalPaidAmount: number;
}

const formatCurrency = (amount: number, currency: string = 'SDG') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'SDG' ? 'USD' : currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount).replace('$', currency === 'SDG' ? 'SDG ' : '$');
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const getOpDerivedStatus = (oc: OpCostRow): string => {
  if (oc.reconciled_at) return 'reconciled';
  if (oc.paid_at) return 'paid';
  if (oc.tier2_status === 'approved') return 'approved';
  if (oc.tier2_status === 'rejected' || oc.tier1_status === 'rejected') return 'rejected';
  if (oc.tier1_status === 'approved') return 'under_review';
  return 'pending';
};

export function ConsolidatedFinancialTab({
  opCosts,
  costSubmissions,
  totalPendingAmount,
  totalApprovedAmount,
  totalPaidAmount,
}: ConsolidatedFinancialTabProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { requests: transportRequests, loading: transportLoading } = useDownPayment();
  const { projects } = useProjectContext();
  const [projectFilter, setProjectFilter] = useState<string>('all');

  const transportStats = useMemo(() => {
    if (!transportRequests) return { total: 0, requested: 0, approved: 0, paid: 0, pending: 0, pendingCount: 0, approvedCount: 0, paidCount: 0, rejectedCount: 0 };
    const filterProjectName = projectFilter !== 'all' ? projects.find(p => p.id === projectFilter)?.name : null;
    const filtered = projectFilter === 'all' ? transportRequests : transportRequests.filter(r => r.projectName && filterProjectName && r.projectName === filterProjectName);
    return {
      total: filtered.length,
      requested: filtered.reduce((s, r) => s + (r.requestedAmount || 0), 0),
      approved: filtered.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount || 0), 0),
      paid: filtered.reduce((s, r) => s + (r.totalPaidAmount || 0), 0),
      pending: filtered.filter(r => ['pending_supervisor', 'pending_admin'].includes(r.status)).reduce((s, r) => s + (r.requestedAmount || 0), 0),
      pendingCount: filtered.filter(r => ['pending_supervisor', 'pending_admin'].includes(r.status)).length,
      approvedCount: filtered.filter(r => r.status === 'approved').length,
      paidCount: filtered.filter(r => ['partially_paid', 'fully_paid'].includes(r.status)).length,
      rejectedCount: filtered.filter(r => r.status === 'rejected').length,
    };
  }, [transportRequests, projectFilter, projects]);

  const opStats = useMemo(() => {
    const filtered = projectFilter === 'all' ? opCosts : opCosts.filter(oc => oc.project_id === projectFilter);
    const byStatus = (statuses: string[]) => filtered.filter(oc => statuses.includes(getOpDerivedStatus(oc)));
    return {
      total: filtered.length,
      totalAmount: filtered.reduce((s, oc) => s + oc.amount_cents, 0) / 100,
      approvedAmount: byStatus(['approved', 'paid', 'reconciled']).reduce((s, oc) => s + oc.amount_cents, 0) / 100,
      paidAmount: byStatus(['paid', 'reconciled']).reduce((s, oc) => s + oc.amount_cents, 0) / 100,
      pendingAmount: byStatus(['pending', 'under_review']).reduce((s, oc) => s + oc.amount_cents, 0) / 100,
      pendingCount: byStatus(['pending', 'under_review']).length,
      approvedCount: byStatus(['approved']).length,
      paidCount: byStatus(['paid', 'reconciled']).length,
      rejectedCount: byStatus(['rejected']).length,
    };
  }, [opCosts, projectFilter]);

  const combinedTotals = useMemo(() => ({
    totalSpend: transportStats.paid + opStats.paidAmount,
    totalApproved: transportStats.approved + opStats.approvedAmount,
    totalPending: transportStats.pending + opStats.pendingAmount,
    totalPendingCount: transportStats.pendingCount + opStats.pendingCount,
    transportPercent: (transportStats.paid + opStats.paidAmount) > 0
      ? (transportStats.paid / (transportStats.paid + opStats.paidAmount)) * 100 : 0,
    opPercent: (transportStats.paid + opStats.paidAmount) > 0
      ? (opStats.paidAmount / (transportStats.paid + opStats.paidAmount)) * 100 : 0,
  }), [transportStats, opStats]);

  const monthlyTrend = useMemo(() => {
    const months: { label: string; month: Date; transport: number; operational: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = startOfMonth(subMonths(new Date(), i));
      months.push({ label: format(m, 'MMM yyyy'), month: m, transport: 0, operational: 0 });
    }

    transportRequests?.forEach(r => {
      if (!r.requestedAt) return;
      try {
        const d = parseISO(r.requestedAt);
        if (!isValid(d)) return;
        const mKey = format(startOfMonth(d), 'MMM yyyy');
        const entry = months.find(m => m.label === mKey);
        if (entry) entry.transport += r.totalPaidAmount || 0;
      } catch {}
    });

    opCosts.forEach(oc => {
      const status = getOpDerivedStatus(oc);
      if (!['paid', 'reconciled'].includes(status)) return;
      const dateStr = oc.paid_at || oc.reconciled_at;
      if (!dateStr) return;
      try {
        const d = parseISO(dateStr);
        if (!isValid(d)) return;
        const mKey = format(startOfMonth(d), 'MMM yyyy');
        const entry = months.find(m => m.label === mKey);
        if (entry) entry.operational += oc.amount_cents / 100;
      } catch {}
    });

    return months;
  }, [transportRequests, opCosts]);

  const categoryBreakdown = useMemo(() => {
    const cats: Record<string, number> = {};
    opCosts.forEach(oc => {
      const status = getOpDerivedStatus(oc);
      if (!['paid', 'reconciled'].includes(status)) return;
      const cat = oc.expense_category || 'Uncategorized';
      cats[cat] = (cats[cat] || 0) + oc.amount_cents / 100;
    });
    if (transportStats.paid > 0) {
      cats['Transportation Advance'] = transportStats.paid;
    }
    return Object.entries(cats)
      .map(([name, value]) => ({ name: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value }))
      .sort((a, b) => b.value - a.value);
  }, [opCosts, transportStats]);

  const projectBreakdown = useMemo(() => {
    const map: Record<string, { projectName: string; transport: number; operational: number }> = {};

    transportRequests?.forEach(r => {
      const pName = r.projectName || 'WFP TPM';
      if (!map[pName]) map[pName] = { projectName: pName, transport: 0, operational: 0 };
      map[pName].transport += r.totalPaidAmount || 0;
    });

    opCosts.forEach(oc => {
      const status = getOpDerivedStatus(oc);
      if (!['paid', 'reconciled'].includes(status)) return;
      const proj = projects.find(p => p.id === oc.project_id);
      const pName = proj?.name || 'WFP TPM';
      if (!map[pName]) map[pName] = { projectName: pName, transport: 0, operational: 0 };
      map[pName].operational += oc.amount_cents / 100;
    });

    return Object.values(map)
      .map(p => ({ ...p, total: p.transport + p.operational }))
      .sort((a, b) => b.total - a.total);
  }, [transportRequests, opCosts, projects]);

  const pieData = useMemo(() => [
    { name: 'Transportation', value: transportStats.paid },
    { name: 'Operational', value: opStats.paidAmount },
  ].filter(d => d.value > 0), [transportStats.paid, opStats.paidAmount]);

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const summaryData = [
      ['Consolidated Financial Report', '', '', ''],
      ['Generated', format(new Date(), 'dd MMM yyyy HH:mm'), '', ''],
      ['', '', '', ''],
      ['OVERALL SUMMARY', '', '', ''],
      ['Metric', 'Transportation', 'Operational', 'Combined'],
      ['Total Submissions', transportStats.total, opStats.total, transportStats.total + opStats.total],
      ['Total Requested (SDG)', transportStats.requested, opStats.totalAmount, transportStats.requested + opStats.totalAmount],
      ['Total Approved (SDG)', transportStats.approved, opStats.approvedAmount, transportStats.approved + opStats.approvedAmount],
      ['Total Paid (SDG)', transportStats.paid, opStats.paidAmount, transportStats.paid + opStats.paidAmount],
      ['Pending Count', transportStats.pendingCount, opStats.pendingCount, transportStats.pendingCount + opStats.pendingCount],
      ['Pending Amount (SDG)', transportStats.pending, opStats.pendingAmount, transportStats.pending + opStats.pendingAmount],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    const trendData = [['Month', 'Transportation (SDG)', 'Operational (SDG)', 'Combined (SDG)']];
    monthlyTrend.forEach(m => trendData.push([m.label, String(m.transport), String(m.operational), String(m.transport + m.operational)]));
    const ws2 = XLSX.utils.aoa_to_sheet(trendData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Monthly Trend');

    const catData = [['Category', 'Amount (SDG)', '% of Total']];
    const totalCat = categoryBreakdown.reduce((s, c) => s + c.value, 0);
    categoryBreakdown.forEach(c => catData.push([c.name, String(c.value), totalCat > 0 ? `${((c.value / totalCat) * 100).toFixed(1)}%` : '0%']));
    const ws3 = XLSX.utils.aoa_to_sheet(catData);
    XLSX.utils.book_append_sheet(wb, ws3, 'Category Breakdown');

    const projData = [['Project', 'Transportation (SDG)', 'Operational (SDG)', 'Total (SDG)']];
    projectBreakdown.forEach(p => projData.push([p.projectName, String(p.transport), String(p.operational), String(p.total)]));
    const ws4 = XLSX.utils.aoa_to_sheet(projData);
    XLSX.utils.book_append_sheet(wb, ws4, 'By Project');

    XLSX.writeFile(wb, `Consolidated_Financial_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast({ title: 'Export complete', description: 'Consolidated report exported to Excel' });
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(18);
    doc.text('Consolidated Financial Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 28);

    autoTable(doc, {
      startY: 35,
      head: [['Metric', 'Transportation', 'Operational', 'Combined']],
      body: [
        ['Total Submissions', String(transportStats.total), String(opStats.total), String(transportStats.total + opStats.total)],
        ['Total Requested', formatCurrency(transportStats.requested), formatCurrency(opStats.totalAmount), formatCurrency(transportStats.requested + opStats.totalAmount)],
        ['Total Approved', formatCurrency(transportStats.approved), formatCurrency(opStats.approvedAmount), formatCurrency(transportStats.approved + opStats.approvedAmount)],
        ['Total Paid', formatCurrency(transportStats.paid), formatCurrency(opStats.paidAmount), formatCurrency(transportStats.paid + opStats.paidAmount)],
        ['Pending Count', String(transportStats.pendingCount), String(opStats.pendingCount), String(combinedTotals.totalPendingCount)],
        ['Pending Amount', formatCurrency(transportStats.pending), formatCurrency(opStats.pendingAmount), formatCurrency(combinedTotals.totalPending)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 90;

    autoTable(doc, {
      startY: finalY + 10,
      head: [['Month', 'Transportation', 'Operational', 'Combined']],
      body: monthlyTrend.map(m => [m.label, formatCurrency(m.transport), formatCurrency(m.operational), formatCurrency(m.transport + m.operational)]),
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] },
    });

    doc.addPage();
    doc.setFontSize(14);
    doc.text('Spending by Category', 14, 20);

    const totalCat = categoryBreakdown.reduce((s, c) => s + c.value, 0);
    autoTable(doc, {
      startY: 28,
      head: [['Category', 'Amount (SDG)', '% of Total']],
      body: categoryBreakdown.map(c => [c.name, formatCurrency(c.value), totalCat > 0 ? `${((c.value / totalCat) * 100).toFixed(1)}%` : '0%']),
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246] },
    });

    const fy2 = (doc as any).lastAutoTable?.finalY || 60;
    doc.setFontSize(14);
    doc.text('Spending by Project', 14, fy2 + 15);

    autoTable(doc, {
      startY: fy2 + 22,
      head: [['Project', 'Transportation', 'Operational', 'Total']],
      body: projectBreakdown.map(p => [p.projectName, formatCurrency(p.transport), formatCurrency(p.operational), formatCurrency(p.total)]),
      theme: 'grid',
      headStyles: { fillColor: [245, 158, 11] },
    });

    doc.save(`Consolidated_Financial_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'Export complete', description: 'Consolidated report exported to PDF' });
  };

  const availableProjects = useMemo(() => {
    const pIds = new Set<string>();
    opCosts.forEach(oc => { if (oc.project_id) pIds.add(oc.project_id); });
    transportRequests?.forEach(r => {
      if (r.projectName) {
        const proj = projects.find(p => p.name === r.projectName);
        if (proj) pIds.add(proj.id);
      }
    });
    return projects.filter(p => pIds.has(p.id));
  }, [opCosts, projects, transportRequests]);

  if (transportLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground mt-4">
        <div className="text-center space-y-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
          <p className="text-sm">Loading financial data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-project-filter">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {availableProjects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} data-testid="button-export-excel">
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} data-testid="button-export-pdf">
            <FileText className="h-4 w-4 mr-1.5" />
            PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GradientStatCard
          title="Total Paid Out"
          value={formatCurrency(combinedTotals.totalSpend)}
          subtitle="Transport + Operational"
          icon={DollarSign}
          gradient={GRADIENT_PRESETS.blue}
          testId="card-total-spend"
        />
        <GradientStatCard
          title="Transportation"
          value={formatCurrency(transportStats.paid)}
          subtitle={`${transportStats.total} requests`}
          icon={Truck}
          gradient={GRADIENT_PRESETS.teal}
          onClick={() => navigate('/advance-requests-report')}
          testId="card-transport-total"
        />
        <GradientStatCard
          title="Operational"
          value={formatCurrency(opStats.paidAmount)}
          subtitle={`${opStats.total} submissions`}
          icon={Receipt}
          gradient={GRADIENT_PRESETS.purple}
          onClick={() => navigate('/cost-submission/reports')}
          testId="card-op-total"
        />
        <GradientStatCard
          title="Pending"
          value={combinedTotals.totalPendingCount}
          subtitle={formatCurrency(combinedTotals.totalPending)}
          icon={Clock}
          gradient={GRADIENT_PRESETS.orange}
          testId="card-total-pending"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Monthly Spending Trend
            </CardTitle>
            <CardDescription className="text-xs">Last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyTrend} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs" tick={{ fill: 'currentColor', fontSize: 11 }} />
                  <YAxis className="text-xs" tick={{ fill: 'currentColor', fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} width={50} />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), '']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="transport" name="Transportation" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="operational" name="Operational" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4 text-muted-foreground" />
              By Category
            </CardTitle>
            <CardDescription className="text-xs">Spending distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length > 0 ? (
              <div className="space-y-3">
                <ResponsiveContainer width="100%" height={180}>
                  <RechartsPieChart>
                    <Pie data={categoryBreakdown.slice(0, 6)} cx="50%" cy="50%" outerRadius={70} innerRadius={35} dataKey="value" paddingAngle={2}>
                      {categoryBreakdown.slice(0, 6).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatCurrency(value), 'Amount']} contentStyle={{ fontSize: 12 }} />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {categoryBreakdown.slice(0, 6).map((cat, i) => {
                    const totalCat = categoryBreakdown.reduce((s, c) => s + c.value, 0);
                    const pct = totalCat > 0 ? ((cat.value / totalCat) * 100).toFixed(0) : '0';
                    return (
                      <div key={cat.name} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 truncate min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="truncate">{cat.name}</span>
                        </span>
                        <span className="text-muted-foreground shrink-0">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                Transportation
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/advance-requests-report')} data-testid="button-goto-advance-report">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-muted/50 p-2.5">
                <div className="text-[11px] text-muted-foreground">Requested</div>
                <div className="text-sm font-bold" data-testid="text-transport-requested">{formatCurrency(transportStats.requested)}</div>
              </div>
              <div className="rounded-md bg-muted/50 p-2.5">
                <div className="text-[11px] text-muted-foreground">Paid</div>
                <div className="text-sm font-bold" data-testid="text-transport-paid">{formatCurrency(transportStats.paid)}</div>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5"><Clock className="h-3 w-3 text-amber-500" />Pending</span>
                <Badge variant="secondary">{transportStats.pendingCount}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-green-500" />Approved</span>
                <Badge variant="secondary">{transportStats.approvedCount}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5"><Wallet className="h-3 w-3 text-blue-500" />Paid</span>
                <Badge variant="secondary">{transportStats.paidCount}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-red-500" />Rejected</span>
                <Badge variant="secondary">{transportStats.rejectedCount}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                Operational Costs
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/cost-submission/reports')} data-testid="button-goto-cost-reports">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-muted/50 p-2.5">
                <div className="text-[11px] text-muted-foreground">Submitted</div>
                <div className="text-sm font-bold" data-testid="text-op-submitted">{formatCurrency(opStats.totalAmount)}</div>
              </div>
              <div className="rounded-md bg-muted/50 p-2.5">
                <div className="text-[11px] text-muted-foreground">Paid</div>
                <div className="text-sm font-bold" data-testid="text-op-paid">{formatCurrency(opStats.paidAmount)}</div>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5"><Clock className="h-3 w-3 text-amber-500" />Pending</span>
                <Badge variant="secondary">{opStats.pendingCount}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-green-500" />Approved</span>
                <Badge variant="secondary">{opStats.approvedCount}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5"><Wallet className="h-3 w-3 text-blue-500" />Paid</span>
                <Badge variant="secondary">{opStats.paidCount}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-red-500" />Rejected</span>
                <Badge variant="secondary">{opStats.rejectedCount}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {projectBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
              Spending by Project
            </CardTitle>
            <CardDescription className="text-xs">Transportation vs Operational by project</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Project</TableHead>
                    <TableHead className="text-right text-xs">Transport</TableHead>
                    <TableHead className="text-right text-xs">Operational</TableHead>
                    <TableHead className="text-right text-xs">Total</TableHead>
                    <TableHead className="w-[140px] text-xs hidden md:table-cell">Split</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectBreakdown.map((p, i) => {
                    const tPct = p.total > 0 ? (p.transport / p.total) * 100 : 0;
                    return (
                      <TableRow key={i} data-testid={`row-project-${i}`}>
                        <TableCell className="font-medium text-sm">{p.projectName}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(p.transport)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(p.operational)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(p.total)}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
                            <div className="h-full bg-cyan-500" style={{ width: `${tPct}%` }} />
                            <div className="h-full bg-purple-500" style={{ width: `${100 - tPct}%` }} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell className="text-sm">Total</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(projectBreakdown.reduce((s, p) => s + p.transport, 0))}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(projectBreakdown.reduce((s, p) => s + p.operational, 0))}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(projectBreakdown.reduce((s, p) => s + p.total, 0))}</TableCell>
                    <TableCell className="hidden md:table-cell" />
                  </TableRow>
                </TableBody>
              </Table>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-sm bg-cyan-500" /> Transport</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-sm bg-purple-500" /> Operational</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <Button variant="outline" className="justify-start h-auto py-2.5 px-3" onClick={() => navigate('/advance-requests-report')} data-testid="button-nav-advance-report">
          <Truck className="h-4 w-4 mr-2 text-cyan-600 dark:text-cyan-400 shrink-0" />
          <span className="text-xs font-medium truncate">Advance Report</span>
        </Button>
        <Button variant="outline" className="justify-start h-auto py-2.5 px-3" onClick={() => navigate('/cost-submission/reports')} data-testid="button-nav-cost-reports">
          <Receipt className="h-4 w-4 mr-2 text-purple-600 dark:text-purple-400 shrink-0" />
          <span className="text-xs font-medium truncate">Cost Reports</span>
        </Button>
        <Button variant="outline" className="justify-start h-auto py-2.5 px-3" onClick={() => navigate('/finance-approval')} data-testid="button-nav-finance-approval">
          <CheckCircle className="h-4 w-4 mr-2 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="text-xs font-medium truncate">Approvals</span>
        </Button>
        <Button variant="outline" className="justify-start h-auto py-2.5 px-3" onClick={() => navigate('/wallet-reports')} data-testid="button-nav-wallet-reports">
          <Wallet className="h-4 w-4 mr-2 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-xs font-medium truncate">Wallets</span>
        </Button>
        <Button variant="outline" className="justify-start h-auto py-2.5 px-3" onClick={() => navigate('/budget')} data-testid="button-nav-budget">
          <TrendingUp className="h-4 w-4 mr-2 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-xs font-medium truncate">Budget</span>
        </Button>
        <Button variant="outline" className="justify-start h-auto py-2.5 px-3" onClick={() => navigate('/classifications')} data-testid="button-nav-classifications">
          <Award className="h-4 w-4 mr-2 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="text-xs font-medium truncate">Classifications</span>
        </Button>
      </div>
    </div>
  );
}
