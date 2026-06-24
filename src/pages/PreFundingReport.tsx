import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  FileBarChart2, Download, RefreshCw, AlertTriangle,
  DollarSign, TrendingDown, CheckCircle2, Clock,
  FileSpreadsheet, Wallet, Activity, GitBranch,
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface FundRow {
  id: string; name: string; source: string | null; status: string;
  currency: string; amount: number; available_balance: number;
  committed_amount: number; paid_amount: number;
  start_date: string | null; end_date: string | null;
  project_id: string | null; project_name?: string;
  created_at: string;
}
interface TxnRow {
  id: string; pre_fund_request_id: string; fund_name?: string;
  transaction_type: string; amount: number; currency: string;
  reference: string | null; description: string | null;
  transaction_date: string; created_at: string;
}
interface StepRow {
  id: string; pre_fund_request_id: string; fund_name?: string;
  step_label: string; status: string; step_order: number; is_required: boolean;
  approved_at: string | null; notes: string | null;
}
interface Project { id: string; name: string }

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string; color: string }> = {
  draft:            { label: 'Draft',            cls: 'bg-slate-100 text-slate-600',   color: '#94a3b8' },
  pending_approval: { label: 'Awaiting Approval',cls: 'bg-amber-100 text-amber-700',   color: '#f59e0b' },
  awaiting_receipt: { label: 'Awaiting Receipt', cls: 'bg-sky-100 text-sky-700',       color: '#0ea5e9' },
  active:           { label: 'Active',           cls: 'bg-emerald-100 text-emerald-700',color: '#10b981' },
  low_balance:      { label: 'Low Balance',      cls: 'bg-orange-100 text-orange-700', color: '#f97316' },
  closed:           { label: 'Closed',           cls: 'bg-slate-100 text-slate-500',   color: '#64748b' },
  rejected:         { label: 'Rejected',         cls: 'bg-rose-100 text-rose-700',     color: '#f43f5e' },
};

const TXN_COLORS: Record<string, string> = {
  payment: '#f43f5e', receipt: '#10b981', commitment: '#f59e0b',
  reversal: '#8b5cf6', carry_forward: '#0ea5e9', return: '#06b6d4', adjustment: '#64748b',
};

const CURRENCIES = ['All', 'USD', 'SDG', 'EUR', 'GBP', 'SAR', 'AED'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kpiCard(title: string, value: string, sub: string, icon: React.ElementType, cls: string) {
  const Icon = icon;
  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-0.5 truncate">{value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
          </div>
          <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', cls)}>
            <Icon className="h-4.5 w-4.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PreFundingReport() {
  const { hasAnyRole } = useAuthorization();
  const canAccess = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);

  const [funds, setFunds]         = useState<FundRow[]>([]);
  const [txns, setTxns]           = useState<TxnRow[]>([]);
  const [steps, setSteps]         = useState<StepRow[]>([]);
  const [projects, setProjects]   = useState<Project[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter]   = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('All');
  const [projectFilter, setProjectFilter] = useState('all');
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');
  const [txnSearch, setTxnSearch]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fundsRes, txnsRes, stepsRes, projRes] = await Promise.all([
        supabase.from('pre_fund_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('pre_fund_transactions').select('*').order('transaction_date', { ascending: false }),
        supabase.from('pre_fund_approval_steps').select('*').order('step_order'),
        supabase.from('projects').select('id,name').order('name'),
      ]);
      if (fundsRes.error && !fundsRes.error.message.includes('does not exist')) throw fundsRes.error;

      const projMap = new Map<string, string>((projRes.data ?? []).map((p: Project) => [p.id, p.name]));
      const fundMap = new Map<string, string>();

      const enrichedFunds: FundRow[] = ((fundsRes.data as any) ?? []).map((f: FundRow) => {
        const enriched = { ...f, project_name: f.project_id ? (projMap.get(f.project_id) ?? 'Unknown') : '—' };
        fundMap.set(f.id, f.name);
        return enriched;
      });

      const enrichedTxns: TxnRow[] = ((txnsRes.data as any) ?? []).map((t: TxnRow) => ({
        ...t, fund_name: fundMap.get(t.pre_fund_request_id) ?? '—',
      }));
      const enrichedSteps: StepRow[] = ((stepsRes.data as any) ?? []).map((s: StepRow) => ({
        ...s, fund_name: fundMap.get(s.pre_fund_request_id) ?? '—',
      }));

      setFunds(enrichedFunds);
      setTxns(enrichedTxns);
      setSteps(enrichedSteps);
      setProjects((projRes.data as any) ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Filtered funds ──────────────────────────────────────────────────────────

  const filteredFunds = useMemo(() => funds.filter(f => {
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    if (currencyFilter !== 'All' && f.currency !== currencyFilter) return false;
    if (projectFilter !== 'all') {
      if (projectFilter === '__none__' && f.project_id) return false;
      if (projectFilter !== '__none__' && f.project_id !== projectFilter) return false;
    }
    if (dateFrom && f.created_at < dateFrom) return false;
    if (dateTo   && f.created_at.split('T')[0] > dateTo) return false;
    return true;
  }), [funds, statusFilter, currencyFilter, projectFilter, dateFrom, dateTo]);

  const filteredTxns = useMemo(() => {
    const fundIds = new Set(filteredFunds.map(f => f.id));
    return txns.filter(t => {
      if (!fundIds.has(t.pre_fund_request_id)) return false;
      if (txnSearch) {
        const q = txnSearch.toLowerCase();
        if (!t.fund_name?.toLowerCase().includes(q) &&
            !(t.reference ?? '').toLowerCase().includes(q) &&
            !(t.description ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [txns, filteredFunds, txnSearch]);

  const filteredSteps = useMemo(() => {
    const fundIds = new Set(filteredFunds.map(f => f.id));
    return steps.filter(s => fundIds.has(s.pre_fund_request_id));
  }, [steps, filteredFunds]);

  // ─── KPIs ────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const activeFunds = filteredFunds.filter(f => ['active','low_balance'].includes(f.status));
    const totalFunded  = filteredFunds.reduce((s, f) => s + f.amount, 0);
    const totalBalance = filteredFunds.reduce((s, f) => s + (f.available_balance ?? 0), 0);
    const totalPaid    = filteredFunds.reduce((s, f) => s + (f.paid_amount ?? 0), 0);
    const totalCommit  = filteredFunds.reduce((s, f) => s + (f.committed_amount ?? 0), 0);
    const utilPct      = totalFunded > 0 ? Math.round((totalPaid / totalFunded) * 100) : 0;
    return { activeFunds, totalFunded, totalBalance, totalPaid, totalCommit, utilPct };
  }, [filteredFunds]);

  // ─── Charts data ─────────────────────────────────────────────────────────────

  // Funds by status (pie)
  const statusPieData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredFunds.forEach(f => { map[f.status] = (map[f.status] ?? 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({
      name: STATUS_CFG[status]?.label ?? status,
      value: count,
      color: STATUS_CFG[status]?.color ?? '#94a3b8',
    }));
  }, [filteredFunds]);

  // Utilization per fund (bar — top 10)
  const utilizationBarData = useMemo(() =>
    filteredFunds.slice(0, 12).map(f => ({
      name: f.name.length > 18 ? f.name.slice(0, 16) + '…' : f.name,
      Funded: f.amount,
      Paid: f.paid_amount ?? 0,
      Balance: f.available_balance ?? 0,
    })),
    [filteredFunds]
  );

  // Monthly disbursements (line) — last 6 months
  const monthlyData = useMemo(() => {
    const months: { month: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      months.push({ month: format(d, 'yyyy-MM'), label: format(d, 'MMM yy') });
    }
    return months.map(({ month, label }) => {
      const total = filteredTxns
        .filter(t => t.transaction_type === 'payment' && t.transaction_date?.startsWith(month))
        .reduce((s, t) => s + t.amount, 0);
      return { label, disbursed: total };
    });
  }, [filteredTxns]);

  // Transaction type breakdown
  const txnTypeData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredTxns.forEach(t => { map[t.transaction_type] = (map[t.transaction_type] ?? 0) + t.amount; });
    return Object.entries(map).map(([type, amount]) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      amount,
      color: TXN_COLORS[type] ?? '#64748b',
    }));
  }, [filteredTxns]);

  // Approval chain summary
  const approvalSummary = useMemo(() => {
    const byFund: Record<string, { total: number; approved: number; pending: number; rejected: number; name: string }> = {};
    filteredSteps.forEach(s => {
      if (!byFund[s.pre_fund_request_id]) {
        byFund[s.pre_fund_request_id] = { total: 0, approved: 0, pending: 0, rejected: 0, name: s.fund_name ?? '—' };
      }
      byFund[s.pre_fund_request_id].total++;
      if (s.status === 'approved') byFund[s.pre_fund_request_id].approved++;
      else if (s.status === 'rejected') byFund[s.pre_fund_request_id].rejected++;
      else byFund[s.pre_fund_request_id].pending++;
    });
    return Object.values(byFund);
  }, [filteredSteps]);

  // ─── Export handlers ──────────────────────────────────────────────────────────

  const exportPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const now = format(new Date(), 'MMM d, yyyy HH:mm');

    // Header
    doc.setFillColor(3, 105, 161);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('Pre-Funding Report', 15, 14);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${now}`, 150, 14);

    // KPI summary
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('Summary', 15, 32);
    autoTable(doc, {
      startY: 36,
      head: [['Metric', 'Value']],
      body: [
        ['Total Funds in View', String(filteredFunds.length)],
        ['Active Funds', String(kpis.activeFunds.length)],
        ['Total Funded', `USD ${formatNumber(kpis.totalFunded, 0)}`],
        ['Total Disbursed', `USD ${formatNumber(kpis.totalPaid, 0)}`],
        ['Total Balance', `USD ${formatNumber(kpis.totalBalance, 0)}`],
        ['Utilization', `${kpis.utilPct}%`],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [3, 105, 161] },
      columnStyles: { 1: { halign: 'right' } },
    });

    // Fund detail table
    let y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('Fund Detail', 15, y); y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Fund', 'Status', 'Currency', 'Amount', 'Paid', 'Balance', 'Util %']],
      body: filteredFunds.map(f => [
        f.name,
        STATUS_CFG[f.status]?.label ?? f.status,
        f.currency,
        formatNumber(f.amount, 0),
        formatNumber(f.paid_amount ?? 0, 0),
        formatNumber(f.available_balance ?? 0, 0),
        f.amount > 0 ? `${Math.round(((f.paid_amount ?? 0) / f.amount) * 100)}%` : '—',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 32, 65] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });

    // Transactions
    if (filteredTxns.length > 0) {
      y = (doc as any).lastAutoTable.finalY + 10;
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text('Transactions', 15, y); y += 4;
      autoTable(doc, {
        startY: y,
        head: [['Date', 'Fund', 'Type', 'Reference', 'Amount', 'Currency']],
        body: filteredTxns.slice(0, 200).map(t => [
          t.transaction_date ? format(parseISO(t.transaction_date), 'dd MMM yyyy') : '—',
          t.fund_name ?? '—',
          t.transaction_type,
          t.reference ?? '—',
          formatNumber(t.amount, 2),
          t.currency,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [79, 70, 229] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });
    }

    const filename = `PreFunding-Report-${format(new Date(), 'yyyyMMdd')}.pdf`;
    doc.save(filename);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Pre-Funding Report', `Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`],
      [],
      ['Metric', 'Value'],
      ['Total Funds', filteredFunds.length],
      ['Active Funds', kpis.activeFunds.length],
      ['Total Funded (USD)', kpis.totalFunded],
      ['Total Disbursed (USD)', kpis.totalPaid],
      ['Total Balance (USD)', kpis.totalBalance],
      ['Utilization %', kpis.utilPct],
    ]), 'Summary');

    // Funds sheet
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredFunds.map(f => ({
      'Fund Name': f.name,
      'Project': f.project_name ?? '—',
      'Source / Donor': f.source ?? '—',
      'Status': STATUS_CFG[f.status]?.label ?? f.status,
      'Currency': f.currency,
      'Amount': f.amount,
      'Paid': f.paid_amount ?? 0,
      'Committed': f.committed_amount ?? 0,
      'Balance': f.available_balance ?? 0,
      'Utilization %': f.amount > 0 ? Math.round(((f.paid_amount ?? 0) / f.amount) * 100) : 0,
      'Start Date': f.start_date ?? '',
      'End Date': f.end_date ?? '',
      'Created': f.created_at ? format(parseISO(f.created_at), 'yyyy-MM-dd') : '',
    }))), 'Funds');

    // Transactions sheet
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredTxns.map(t => ({
      'Date': t.transaction_date ?? '',
      'Fund': t.fund_name ?? '—',
      'Type': t.transaction_type,
      'Reference': t.reference ?? '',
      'Description': t.description ?? '',
      'Amount': t.amount,
      'Currency': t.currency,
    }))), 'Transactions');

    // Approvals sheet
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredSteps.map(s => ({
      'Fund': s.fund_name ?? '—',
      'Step #': s.step_order,
      'Step Label': s.step_label,
      'Required': s.is_required ? 'Yes' : 'No',
      'Status': s.status,
      'Actioned At': s.approved_at ? format(parseISO(s.approved_at), 'yyyy-MM-dd HH:mm') : '',
      'Notes': s.notes ?? '',
    }))), 'Approval Chain');

    XLSX.writeFile(wb, `PreFunding-Report-${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (!canAccess) return (
    <div className="p-8 text-center">
      <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
      <p className="text-muted-foreground">Access denied.</p>
    </div>
  );

  return (
    <div className="space-y-5 p-4 md:p-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
            <FileBarChart2 className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Pre-Funding Report</h1>
            <p className="text-sm text-muted-foreground">Comprehensive view of all pre-funds, transactions, and approval status</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-1.5', loading && 'animate-spin')} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={loading}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5 text-emerald-600" />Excel
          </Button>
          <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white" onClick={exportPDF} disabled={loading}>
            <Download className="h-4 w-4 mr-1.5" />PDF
          </Button>
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-3 rounded-xl border bg-muted/20">
        <div className="flex flex-col gap-1 min-w-[120px]">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[100px]">
          <Label className="text-xs">Currency</Label>
          <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label className="text-xs">Project</Label>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              <SelectItem value="__none__">No Project</SelectItem>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Created From</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs w-[130px]" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Created To</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs w-[130px]" />
        </div>
        {(statusFilter !== 'all' || currencyFilter !== 'All' || projectFilter !== 'all' || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs self-end"
            onClick={() => { setStatusFilter('all'); setCurrencyFilter('All'); setProjectFilter('all'); setDateFrom(''); setDateTo(''); }}>
            Clear Filters
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground self-end ml-auto">
          {filteredFunds.length} fund{filteredFunds.length !== 1 ? 's' : ''} · {filteredTxns.length} transactions
        </span>
      </div>

      {/* KPI cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCard('Total Funded', `${filteredFunds[0]?.currency ?? 'USD'} ${formatNumber(kpis.totalFunded, 0)}`, `${filteredFunds.length} fund${filteredFunds.length !== 1 ? 's' : ''}`, Wallet, 'bg-sky-100 dark:bg-sky-900/30 text-sky-600')}
          {kpiCard('Available Balance', `${filteredFunds[0]?.currency ?? 'USD'} ${formatNumber(kpis.totalBalance, 0)}`, `${kpis.utilPct}% utilization`, DollarSign, 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600')}
          {kpiCard('Total Disbursed', `${filteredFunds[0]?.currency ?? 'USD'} ${formatNumber(kpis.totalPaid, 0)}`, `${filteredTxns.filter(t => t.transaction_type === 'payment').length} payments`, TrendingDown, 'bg-rose-100 dark:bg-rose-900/30 text-rose-600')}
          {kpiCard('Active Funds', String(kpis.activeFunds.length), `of ${filteredFunds.length} total`, CheckCircle2, 'bg-amber-100 dark:bg-amber-900/30 text-amber-600')}
        </div>
      )}

      {/* Charts row */}
      {!loading && filteredFunds.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Status pie */}
          <Card className="border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Funds by Status</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    dataKey="value" nameKey="name" paddingAngle={3}>
                    {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v} fund${v !== 1 ? 's' : ''}`, '']} />
                  <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Transaction type bar */}
          <Card className="border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Transactions by Type</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              {txnTypeData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No transactions</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={txnTypeData} layout="vertical" margin={{ left: 8 }}>
                    <XAxis type="number" tickFormatter={v => formatNumber(v, 0)} tick={{ fontSize: 9 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={72} />
                    <Tooltip formatter={(v: any) => [formatNumber(v, 2), 'Amount']} />
                    <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                      {txnTypeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Monthly disbursements line */}
          <Card className="border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Monthly Disbursements (6m)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => formatNumber(v, 0)} tick={{ fontSize: 9 }} width={60} />
                  <Tooltip formatter={(v: any) => [formatNumber(v, 2), 'Disbursed']} />
                  <Line type="monotone" dataKey="disbursed" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Utilization bar chart (full width) */}
      {!loading && utilizationBarData.length > 0 && (
        <Card className="border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-sky-600" />
              Fund Utilization — Amount vs Disbursed vs Balance
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={utilizationBarData} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tickFormatter={v => formatNumber(v, 0)} tick={{ fontSize: 9 }} width={72} />
                <Tooltip formatter={(v: any) => [formatNumber(v, 0), '']} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Funded"  fill="#0ea5e9" radius={[3,3,0,0]} />
                <Bar dataKey="Paid"    fill="#f43f5e" radius={[3,3,0,0]} />
                <Bar dataKey="Balance" fill="#10b981" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Detail tabs */}
      <Tabs defaultValue="funds">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="funds" className="text-xs gap-1.5">
            <Wallet className="h-3.5 w-3.5" />Funds ({filteredFunds.length})
          </TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs gap-1.5">
            <Activity className="h-3.5 w-3.5" />Transactions ({filteredTxns.length})
          </TabsTrigger>
          <TabsTrigger value="approvals" className="text-xs gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />Approvals ({filteredSteps.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Funds table ── */}
        <TabsContent value="funds" className="mt-3">
          <Card className="border">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : filteredFunds.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground text-sm">No funds match the current filters.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-semibold pl-4">Fund Name</TableHead>
                        <TableHead className="font-semibold">Project</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold text-right">Amount</TableHead>
                        <TableHead className="font-semibold text-right">Disbursed</TableHead>
                        <TableHead className="font-semibold text-right">Balance</TableHead>
                        <TableHead className="font-semibold text-right">Util %</TableHead>
                        <TableHead className="font-semibold">Period</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFunds.map(f => {
                        const util = f.amount > 0 ? Math.round(((f.paid_amount ?? 0) / f.amount) * 100) : 0;
                        const statusCfg = STATUS_CFG[f.status];
                        return (
                          <TableRow key={f.id} className="hover:bg-muted/30">
                            <TableCell className="pl-4 font-medium text-sm max-w-[200px]">
                              <div className="truncate">{f.name}</div>
                              {f.source && <div className="text-[10px] text-muted-foreground truncate">{f.source}</div>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[140px]">
                              <span className="truncate block">{f.project_name}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn('text-[10px]', statusCfg?.cls)}>
                                {statusCfg?.label ?? f.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums">
                              {f.currency} {formatNumber(f.amount, 0)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-rose-600">
                              {f.currency} {formatNumber(f.paid_amount ?? 0, 0)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-emerald-600">
                              {f.currency} {formatNumber(f.available_balance ?? 0, 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className={cn('h-full rounded-full', util >= 90 ? 'bg-rose-500' : util >= 70 ? 'bg-amber-500' : 'bg-emerald-500')}
                                    style={{ width: `${Math.min(util, 100)}%` }} />
                                </div>
                                <span className="text-xs tabular-nums w-8 text-right">{util}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {f.start_date && f.end_date
                                ? `${format(parseISO(f.start_date), 'MMM d')} – ${format(parseISO(f.end_date), 'MMM d, yy')}`
                                : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Transactions tab ── */}
        <TabsContent value="transactions" className="mt-3">
          <div className="mb-3">
            <Input value={txnSearch} onChange={e => setTxnSearch(e.target.value)}
              placeholder="Search transactions by fund name, reference, or description…"
              className="max-w-sm h-8 text-sm" />
          </div>
          <Card className="border">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : filteredTxns.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground text-sm">No transactions found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-semibold pl-4">Date</TableHead>
                        <TableHead className="font-semibold">Fund</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold">Reference</TableHead>
                        <TableHead className="font-semibold">Description</TableHead>
                        <TableHead className="font-semibold text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTxns.slice(0, 200).map(t => (
                        <TableRow key={t.id} className="hover:bg-muted/30">
                          <TableCell className="pl-4 text-xs whitespace-nowrap">
                            {t.transaction_date ? format(parseISO(t.transaction_date), 'MMM d, yyyy') : '—'}
                          </TableCell>
                          <TableCell className="text-sm max-w-[180px]">
                            <span className="truncate block">{t.fund_name}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                              style={{ background: (TXN_COLORS[t.transaction_type] ?? '#94a3b8') + '22', color: TXN_COLORS[t.transaction_type] ?? '#64748b' }}>
                              {t.transaction_type}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{t.reference ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                            <span className="truncate block">{t.description ?? '—'}</span>
                          </TableCell>
                          <TableCell className={cn('text-right text-sm font-medium tabular-nums',
                            t.transaction_type === 'payment' ? 'text-rose-600' : 'text-emerald-600')}>
                            {t.currency} {formatNumber(t.amount, 2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredTxns.length > 200 && (
                    <p className="text-center text-xs text-muted-foreground py-3">Showing first 200 of {filteredTxns.length} transactions. Export to Excel for full data.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Approvals tab ── */}
        <TabsContent value="approvals" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Step list */}
            <Card className="border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">All Approval Steps</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : filteredSteps.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">No approval steps found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="font-semibold pl-4">#</TableHead>
                          <TableHead className="font-semibold">Fund</TableHead>
                          <TableHead className="font-semibold">Step</TableHead>
                          <TableHead className="font-semibold">Status</TableHead>
                          <TableHead className="font-semibold">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSteps.slice(0, 150).map(s => (
                          <TableRow key={s.id} className="hover:bg-muted/30">
                            <TableCell className="pl-4 text-xs text-muted-foreground w-8">{s.step_order}</TableCell>
                            <TableCell className="text-xs max-w-[140px]"><span className="truncate block">{s.fund_name}</span></TableCell>
                            <TableCell className="text-sm max-w-[160px]">
                              <span className="truncate block">{s.step_label}</span>
                              {!s.is_required && <span className="text-[10px] text-muted-foreground">optional</span>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn('text-[10px]',
                                s.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                s.status === 'rejected' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                                'bg-amber-100 text-amber-700 border-amber-200')}>
                                {s.status === 'approved' ? '✓ Approved' : s.status === 'rejected' ? '✗ Rejected' : <><Clock className="inline h-2.5 w-2.5 mr-0.5" />Pending</>}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {s.approved_at ? format(parseISO(s.approved_at), 'MMM d, yy') : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Per-fund approval summary */}
            <Card className="border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">Approval Progress per Fund</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3 max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : approvalSummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No approval chains configured.</p>
                ) : approvalSummary.map((row, i) => {
                  const pct = row.total > 0 ? Math.round((row.approved / row.total) * 100) : 0;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate max-w-[200px]">{row.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {row.approved > 0 && <span className="text-[10px] text-emerald-600">✓{row.approved}</span>}
                          {row.pending  > 0 && <span className="text-[10px] text-amber-600"><Clock className="inline h-2.5 w-2.5" />{row.pending}</span>}
                          {row.rejected > 0 && <span className="text-[10px] text-rose-600">✗{row.rejected}</span>}
                          <span className="text-[10px] text-muted-foreground">/{row.total}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', row.rejected > 0 ? 'bg-rose-500' : pct === 100 ? 'bg-emerald-500' : 'bg-sky-500')}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
