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
  Users, Receipt, ExternalLink, ChevronDown, ChevronRight,
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
  user_id: string | null; created_by: string | null;
  receipt_url: string | null; source_table: string | null; source_id: string | null;
  reconciled: boolean;
  /** enriched */
  user_name?: string;
}
interface AllocRow {
  id: string; pre_fund_request_id: string; user_id: string;
  allocated_amount: number; spent_amount: number; currency: string; notes: string | null;
  fund_name?: string; user_name?: string;
}
interface StepRow {
  id: string; pre_fund_request_id: string; fund_name?: string;
  step_label: string; status: string; step_order: number; is_required: boolean;
  approved_at: string | null; notes: string | null;
  assigned_user_id: string | null; assigned_user_ids: string[] | null;
  assignee_names?: string;
}
interface ProfileRow { id: string; full_name: string | null; email: string | null }
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

// CURRENCIES built dynamically from loaded data — see state below

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

  const [funds, setFunds]           = useState<FundRow[]>([]);
  const [txns, setTxns]             = useState<TxnRow[]>([]);
  const [steps, setSteps]           = useState<StepRow[]>([]);
  const [allocations, setAllocations] = useState<AllocRow[]>([]);
  const [projects, setProjects]     = useState<Project[]>([]);
  const [profiles, setProfiles]     = useState<Map<string, string>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [currencies, setCurrencies] = useState<string[]>(['All']);

  // Filters
  const [statusFilter, setStatusFilter]     = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('All');
  const [projectFilter, setProjectFilter]   = useState('all');
  const [dateFrom, setDateFrom]             = useState('');
  const [dateTo, setDateTo]                 = useState('');
  const [txnSearch, setTxnSearch]           = useState('');
  const [txnUserFilter, setTxnUserFilter]   = useState('all');

  // Reconciliation expand state
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fundsRes, txnsRes, stepsRes, projRes, profRes, allocRes] = await Promise.all([
        supabase.from('pre_fund_requests').select('*').order('created_at', { ascending: false }),
        (supabase as any).from('pre_fund_transactions')
          .select('id,pre_fund_request_id,transaction_type,amount,currency,reference,description,transaction_date,created_at,user_id,created_by,receipt_url,source_table,source_id,reconciled')
          .order('transaction_date', { ascending: false }),
        supabase.from('pre_fund_approval_steps')
          .select('id,pre_fund_request_id,step_label,status,step_order,is_required,approved_at,notes,assigned_user_id,assigned_user_ids')
          .order('step_order'),
        supabase.from('projects').select('id,name').order('name'),
        supabase.from('profiles').select('id,full_name,email'),
        (supabase as any).from('pre_fund_allocations')
          .select('id,pre_fund_request_id,user_id,allocated_amount,spent_amount,currency,notes')
          .order('created_at', { ascending: false }),
      ]);
      if (fundsRes.error && !fundsRes.error.message.includes('does not exist')) throw fundsRes.error;

      const projMap = new Map<string, string>((projRes.data ?? []).map((p: Project) => [p.id, p.name]));
      const fundMap = new Map<string, string>();

      // Build profile id → display name map
      const profMap = new Map<string, string>();
      ((profRes.data as any) ?? []).forEach((p: ProfileRow) => {
        profMap.set(p.id, p.full_name || p.email || p.id.slice(0, 8));
      });

      const enrichedFunds: FundRow[] = ((fundsRes.data as any) ?? []).map((f: FundRow) => {
        const enriched = { ...f, project_name: f.project_id ? (projMap.get(f.project_id) ?? 'Unknown') : '—' };
        fundMap.set(f.id, f.name);
        return enriched;
      });

      const enrichedTxns: TxnRow[] = ((txnsRes.data as any) ?? []).map((t: TxnRow) => {
        const userId = t.user_id ?? t.created_by ?? null;
        return {
          ...t,
          fund_name: fundMap.get(t.pre_fund_request_id) ?? '—',
          user_name: userId ? (profMap.get(userId) ?? userId.slice(0, 8)) : '—',
        };
      });

      const enrichedSteps: StepRow[] = ((stepsRes.data as any) ?? []).map((s: StepRow) => {
        const ids: string[] = Array.isArray(s.assigned_user_ids) && s.assigned_user_ids.length
          ? s.assigned_user_ids
          : s.assigned_user_id ? [s.assigned_user_id] : [];
        const assignee_names = ids.map(id => profMap.get(id) ?? id.slice(0, 8)).join(', ') || '—';
        return { ...s, fund_name: fundMap.get(s.pre_fund_request_id) ?? '—', assignee_names };
      });

      const enrichedAllocs: AllocRow[] = ((allocRes.data as any) ?? []).map((a: AllocRow) => ({
        ...a,
        fund_name: fundMap.get(a.pre_fund_request_id) ?? '—',
        user_name: profMap.get(a.user_id) ?? a.user_id.slice(0, 8),
      }));

      setFunds(enrichedFunds);
      setTxns(enrichedTxns);
      setSteps(enrichedSteps);
      setAllocations(enrichedAllocs);
      setProjects((projRes.data as any) ?? []);
      setProfiles(profMap);

      // Build currency list from fund currencies + exchange rate pairs
      const ratesRes = await (supabase as any).from('acct_exchange_rates').select('from_currency,to_currency');
      const currSet = new Set<string>();
      enrichedFunds.forEach(f => { if (f.currency) currSet.add(f.currency); });
      if (!ratesRes.error) {
        (ratesRes.data ?? []).forEach((r: any) => { currSet.add(r.from_currency); currSet.add(r.to_currency); });
      }
      setCurrencies(['All', ...[...currSet].sort()]);
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
      if (txnUserFilter !== 'all') {
        const uid = t.user_id ?? t.created_by;
        if (uid !== txnUserFilter) return false;
      }
      if (txnSearch) {
        const q = txnSearch.toLowerCase();
        if (!t.fund_name?.toLowerCase().includes(q) &&
            !(t.reference ?? '').toLowerCase().includes(q) &&
            !(t.description ?? '').toLowerCase().includes(q) &&
            !(t.user_name ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [txns, filteredFunds, txnSearch, txnUserFilter]);

  // ─── Reconciliation: per-user rollup ────────────────────────────────────────
  const reconciliationByUser = useMemo(() => {
    const fundIds = new Set(filteredFunds.map(f => f.id));
    // Build a user→txns map from filtered funds
    const userMap = new Map<string, {
      userId: string; userName: string;
      txns: TxnRow[];
      allocated: number; spent: number; currency: string;
    }>();

    // Seed from allocations first (to show allocated users even with no txns yet)
    allocations.filter(a => fundIds.has(a.pre_fund_request_id)).forEach(a => {
      if (!userMap.has(a.user_id)) {
        userMap.set(a.user_id, {
          userId: a.user_id,
          userName: a.user_name ?? a.user_id.slice(0, 8),
          txns: [],
          allocated: 0, spent: 0,
          currency: a.currency,
        });
      }
      const u = userMap.get(a.user_id)!;
      u.allocated += Number(a.allocated_amount);
      u.spent += Number(a.spent_amount);
    });

    // Add transactions (even for non-allocated users — unallocated payments)
    txns.filter(t => fundIds.has(t.pre_fund_request_id) && t.transaction_type === 'payment').forEach(t => {
      const uid = t.user_id ?? t.created_by ?? '__unknown__';
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          userId: uid,
          userName: t.user_name ?? uid.slice(0, 8),
          txns: [],
          allocated: 0, spent: 0,
          currency: t.currency,
        });
      }
      userMap.get(uid)!.txns.push(t);
    });

    return Array.from(userMap.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  }, [allocations, txns, filteredFunds]);

  // Unique users who appear in filtered transactions (for user filter dropdown)
  const txnUsers = useMemo(() => {
    const seen = new Map<string, string>();
    filteredTxns.forEach(t => {
      const uid = t.user_id ?? t.created_by;
      if (uid && !seen.has(uid)) seen.set(uid, t.user_name ?? uid.slice(0, 8));
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [filteredTxns]);

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
    const now = format(new Date(), 'MMM d, yyyy HH:mm');
    const filename = `PreFunding-Report-${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;

    // ── Helper: set column widths ──────────────────────────────────────────────
    const setCols = (ws: XLSX.WorkSheet, widths: number[]) => {
      ws['!cols'] = widths.map(w => ({ wch: w }));
    };

    // ── Sheet 1: Cover / Summary ───────────────────────────────────────────────
    const currency = filteredFunds[0]?.currency ?? 'USD';
    const summaryData: any[][] = [
      ['PACT — PRE-FUNDING REPORT', '', '', ''],
      [`Generated: ${now}`, '', '', ''],
      ['', '', '', ''],
      ['REPORT FILTERS', '', '', ''],
      ['Status Filter', statusFilter === 'all' ? 'All Statuses' : STATUS_CFG[statusFilter]?.label ?? statusFilter, '', ''],
      ['Currency Filter', currencyFilter, '', ''],
      ['Date From', dateFrom || '—', '', ''],
      ['Date To', dateTo || '—', '', ''],
      ['', '', '', ''],
      ['SUMMARY STATISTICS', '', '', ''],
      ['Metric', 'Value', '', ''],
      ['Total Funds in View', filteredFunds.length, '', ''],
      ['Active Funds', kpis.activeFunds.length, '', ''],
      ['Total Funded', `${currency} ${formatNumber(kpis.totalFunded, 2)}`, '', ''],
      ['Total Disbursed', `${currency} ${formatNumber(kpis.totalPaid, 2)}`, '', ''],
      ['Total Committed', `${currency} ${formatNumber(kpis.totalCommit, 2)}`, '', ''],
      ['Available Balance', `${currency} ${formatNumber(kpis.totalBalance, 2)}`, '', ''],
      ['Overall Utilization', `${kpis.utilPct}%`, '', ''],
      ['Total Transactions', filteredTxns.length, '', ''],
      ['Total Approval Steps', filteredSteps.length, '', ''],
      ['', '', '', ''],
      ['STATUS BREAKDOWN', '', '', ''],
      ['Status', 'Count', 'Amount', 'Currency'],
      ...Object.entries(
        filteredFunds.reduce((acc, f) => {
          if (!acc[f.status]) acc[f.status] = { count: 0, amount: 0 };
          acc[f.status].count++;
          acc[f.status].amount += f.amount;
          return acc;
        }, {} as Record<string, { count: number; amount: number }>)
      ).map(([status, v]) => [STATUS_CFG[status]?.label ?? status, v.count, v.amount, currency]),
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    setCols(summaryWs, [28, 22, 16, 8]);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Cover');

    // ── Sheet 2: Fund Detail ───────────────────────────────────────────────────
    const fundHeaders = [
      'Fund Name', 'Project', 'Source / Donor', 'Status', 'Currency',
      'Amount', 'Disbursed', 'Committed', 'Balance', 'Utilization %',
      'Start Date', 'End Date', 'Created',
    ];
    const fundRows = filteredFunds.map(f => [
      f.name,
      f.project_name ?? '—',
      f.source ?? '—',
      STATUS_CFG[f.status]?.label ?? f.status,
      f.currency,
      f.amount,
      f.paid_amount ?? 0,
      f.committed_amount ?? 0,
      f.available_balance ?? 0,
      f.amount > 0 ? Math.round(((f.paid_amount ?? 0) / f.amount) * 100) : 0,
      f.start_date ?? '',
      f.end_date ?? '',
      f.created_at ? format(parseISO(f.created_at), 'yyyy-MM-dd') : '',
    ]);
    const totalsRow = [
      `TOTALS (${filteredFunds.length} funds)`, '', '', '', currency,
      filteredFunds.reduce((s, f) => s + f.amount, 0),
      filteredFunds.reduce((s, f) => s + (f.paid_amount ?? 0), 0),
      filteredFunds.reduce((s, f) => s + (f.committed_amount ?? 0), 0),
      filteredFunds.reduce((s, f) => s + (f.available_balance ?? 0), 0),
      kpis.utilPct,
      '', '', '',
    ];
    const fundWs = XLSX.utils.aoa_to_sheet([fundHeaders, ...fundRows, [], totalsRow]);
    setCols(fundWs, [30, 22, 22, 18, 8, 14, 14, 14, 14, 12, 12, 12, 12]);
    XLSX.utils.book_append_sheet(wb, fundWs, 'Fund Detail');

    // ── Sheet 3: Transactions ──────────────────────────────────────────────────
    const txnHeaders = ['Date', 'Fund Name', 'Type', 'Reference', 'Description', 'Amount', 'Currency'];
    const txnRows = filteredTxns.map(t => [
      t.transaction_date ?? '',
      t.fund_name ?? '—',
      t.transaction_type,
      t.reference ?? '',
      t.description ?? '',
      t.amount,
      t.currency,
    ]);
    const txnTotals = ['TOTAL', '', '', '', '',
      filteredTxns.reduce((s, t) => s + t.amount, 0), ''];
    const txnWs = XLSX.utils.aoa_to_sheet([txnHeaders, ...txnRows, [], txnTotals]);
    setCols(txnWs, [12, 30, 14, 18, 30, 14, 8]);
    XLSX.utils.book_append_sheet(wb, txnWs, 'Transactions');

    // ── Sheet 4: Approval Chain ────────────────────────────────────────────────
    // Group by fund — each fund gets a header row then its steps
    const chainRows: any[][] = [
      ['APPROVAL CHAIN REPORT', '', '', '', '', '', ''],
      [`Generated: ${now}`, '', '', '', '', '', ''],
      [],
      ['Fund Name', 'Step #', 'Step Label', 'Required', 'Assignee(s)', 'Status', 'Date Actioned', 'Notes'],
    ];
    // Group steps by fund
    const byFundChain: Record<string, StepRow[]> = {};
    filteredSteps.forEach(s => {
      if (!byFundChain[s.pre_fund_request_id]) byFundChain[s.pre_fund_request_id] = [];
      byFundChain[s.pre_fund_request_id].push(s);
    });
    Object.values(byFundChain).forEach(fundSteps => {
      const fundName = fundSteps[0].fund_name ?? '—';
      fundSteps.forEach((s, i) => {
        chainRows.push([
          i === 0 ? fundName : '',
          s.step_order,
          s.step_label,
          s.is_required ? 'Required' : 'Optional',
          s.assignee_names ?? '—',
          s.status === 'approved' ? '✓ Approved' : s.status === 'rejected' ? '✗ Rejected' : '⏳ Pending',
          s.approved_at ? format(parseISO(s.approved_at), 'yyyy-MM-dd HH:mm') : '—',
          s.notes ?? '',
        ]);
      });
      chainRows.push([]); // blank row between funds
    });
    const chainWs = XLSX.utils.aoa_to_sheet(chainRows);
    setCols(chainWs, [30, 6, 22, 10, 28, 12, 18, 30]);
    XLSX.utils.book_append_sheet(wb, chainWs, 'Approval Chain');

    // ── Sheet 5: Monthly Trend ─────────────────────────────────────────────────
    const trendHeaders = ['Month', 'Disbursed', 'Receipts', 'Net'];
    const trendRows = monthlyData.map(m => {
      const disbursed = filteredTxns
        .filter(t => t.transaction_type === 'payment' && t.transaction_date?.startsWith(m.label.replace(' ', '-').toLowerCase()))
        .reduce((s, t) => s + t.amount, 0);
      const receipts = filteredTxns
        .filter(t => t.transaction_type === 'receipt' && t.transaction_date?.startsWith(m.label.replace(' ', '-').toLowerCase()))
        .reduce((s, t) => s + t.amount, 0);
      return [m.label, m.disbursed, receipts, receipts - m.disbursed];
    });
    const trendWs = XLSX.utils.aoa_to_sheet([trendHeaders, ...trendRows]);
    setCols(trendWs, [12, 16, 16, 16]);
    XLSX.utils.book_append_sheet(wb, trendWs, 'Monthly Trend');

    XLSX.writeFile(wb, filename);
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
              {currencies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="funds" className="text-xs gap-1">
            <Wallet className="h-3.5 w-3.5" />Funds ({filteredFunds.length})
          </TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs gap-1">
            <Activity className="h-3.5 w-3.5" />Transactions ({filteredTxns.length})
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="text-xs gap-1">
            <Users className="h-3.5 w-3.5" />By User ({reconciliationByUser.length})
          </TabsTrigger>
          <TabsTrigger value="approvals" className="text-xs gap-1">
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
        <TabsContent value="transactions" className="mt-3 space-y-3">
          {/* Search + user filter bar */}
          <div className="flex flex-wrap gap-2">
            <Input
              value={txnSearch}
              onChange={e => setTxnSearch(e.target.value)}
              placeholder="Search fund, reference, description, or user…"
              className="max-w-xs h-8 text-sm"
            />
            <Select value={txnUserFilter} onValueChange={setTxnUserFilter}>
              <SelectTrigger className="h-8 text-xs w-[180px]" data-testid="select-txn-user">
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {txnUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(txnSearch || txnUserFilter !== 'all') && (
              <Button variant="ghost" size="sm" className="h-8 text-xs"
                onClick={() => { setTxnSearch(''); setTxnUserFilter('all'); }}>
                Clear filters
              </Button>
            )}
          </div>

          <Card className="border">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : filteredTxns.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground text-sm">No transactions match the current filters.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-semibold pl-4 whitespace-nowrap">Date / Time</TableHead>
                        <TableHead className="font-semibold">Submitted By</TableHead>
                        <TableHead className="font-semibold">Fund</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold">Source</TableHead>
                        <TableHead className="font-semibold">Reference</TableHead>
                        <TableHead className="font-semibold">Description</TableHead>
                        <TableHead className="font-semibold text-center">Reconciled</TableHead>
                        <TableHead className="font-semibold text-center">Receipt</TableHead>
                        <TableHead className="font-semibold text-right pr-4">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTxns.slice(0, 200).map(t => (
                        <TableRow key={t.id} className="hover:bg-muted/30 align-middle">
                          {/* Date + exact timestamp */}
                          <TableCell className="pl-4 py-2.5">
                            <div className="text-xs font-medium whitespace-nowrap">
                              {t.transaction_date ? format(parseISO(t.transaction_date), 'MMM d, yyyy') : '—'}
                            </div>
                            {t.created_at && (
                              <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {format(parseISO(t.created_at), 'HH:mm:ss')}
                              </div>
                            )}
                          </TableCell>

                          {/* Submitted by */}
                          <TableCell className="py-2.5">
                            <span className="text-xs font-medium">{t.user_name ?? '—'}</span>
                          </TableCell>

                          {/* Fund */}
                          <TableCell className="text-xs max-w-[160px] py-2.5">
                            <span className="truncate block">{t.fund_name}</span>
                          </TableCell>

                          {/* Type badge */}
                          <TableCell className="py-2.5">
                            <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium whitespace-nowrap"
                              style={{ background: (TXN_COLORS[t.transaction_type] ?? '#94a3b8') + '22', color: TXN_COLORS[t.transaction_type] ?? '#64748b' }}>
                              {t.transaction_type}
                            </span>
                          </TableCell>

                          {/* Source module */}
                          <TableCell className="py-2.5">
                            {t.source_table ? (
                              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono whitespace-nowrap">
                                {t.source_table === 'operational_cost_submissions' ? 'Cost Sub.' :
                                 t.source_table === 'down_payment_requests' ? 'Down Pmt.' :
                                 t.source_table}
                              </span>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>

                          {/* Reference */}
                          <TableCell className="text-xs font-mono text-muted-foreground py-2.5 whitespace-nowrap">
                            {t.reference ?? '—'}
                          </TableCell>

                          {/* Description */}
                          <TableCell className="text-xs text-muted-foreground max-w-[180px] py-2.5">
                            <span className="truncate block">{t.description ?? '—'}</span>
                          </TableCell>

                          {/* Reconciled */}
                          <TableCell className="text-center py-2.5">
                            {t.reconciled ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                            ) : (
                              <Clock className="h-3.5 w-3.5 text-amber-400 mx-auto" />
                            )}
                          </TableCell>

                          {/* Receipt */}
                          <TableCell className="text-center py-2.5">
                            {t.receipt_url ? (
                              <a
                                href={t.receipt_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-sky-600 hover:text-sky-800 text-xs font-medium"
                                title="View receipt"
                              >
                                <Receipt className="h-3.5 w-3.5" />
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>

                          {/* Amount */}
                          <TableCell className={cn('text-right text-sm font-semibold tabular-nums pr-4 py-2.5',
                            t.transaction_type === 'payment' ? 'text-rose-600' : 'text-emerald-600')}>
                            {t.currency} {formatNumber(t.amount, 2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredTxns.length > 200 && (
                    <p className="text-center text-xs text-muted-foreground py-3">
                      Showing first 200 of {filteredTxns.length} transactions. Export to Excel for the full list.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── By-User / Reconciliation tab ── */}
        <TabsContent value="reconciliation" className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Per-user allocation vs actual spending with full transaction history.
            </p>
            {reconciliationByUser.length > 0 && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                onClick={() => setExpandedUsers(
                  expandedUsers.size === reconciliationByUser.length
                    ? new Set()
                    : new Set(reconciliationByUser.map(u => u.userId))
                )}>
                {expandedUsers.size === reconciliationByUser.length ? 'Collapse All' : 'Expand All'}
              </Button>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          ) : reconciliationByUser.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm border rounded-xl bg-muted/20">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No user allocations or transactions found for the current fund filters.
            </div>
          ) : (
            <div className="space-y-3">
              {reconciliationByUser.map(u => {
                const isExpanded = expandedUsers.has(u.userId);
                const txnTotal = u.txns.reduce((s, t) => s + t.amount, 0);
                const currency = u.currency || u.txns[0]?.currency || 'USD';
                const hasAlloc = u.allocated > 0;
                const remaining = hasAlloc ? u.allocated - u.spent : null;
                const pct = hasAlloc && u.allocated > 0 ? Math.min((u.spent / u.allocated) * 100, 100) : null;
                const reconciledCount = u.txns.filter(t => t.reconciled).length;
                const unreconciled = u.txns.length - reconciledCount;

                return (
                  <Card key={u.userId} className={cn('border overflow-hidden', isExpanded && 'ring-1 ring-violet-300 dark:ring-violet-700')}>
                    {/* User header row */}
                    <button
                      className="w-full text-left"
                      onClick={() => setExpandedUsers(prev => {
                        const next = new Set(prev);
                        if (next.has(u.userId)) next.delete(u.userId); else next.add(u.userId);
                        return next;
                      })}
                    >
                      <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                        {/* Chevron */}
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}

                        {/* Avatar */}
                        <div className="h-8 w-8 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-violet-700 dark:text-violet-300">
                            {u.userName.slice(0, 2).toUpperCase()}
                          </span>
                        </div>

                        {/* Name */}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{u.userName}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {u.txns.length} transaction{u.txns.length !== 1 ? 's' : ''}
                            {unreconciled > 0 && (
                              <span className="ml-2 text-amber-600 font-medium">{unreconciled} unreconciled</span>
                            )}
                          </div>
                        </div>

                        {/* Allocation pill */}
                        {hasAlloc ? (
                          <div className="shrink-0 text-right hidden sm:block">
                            <div className="text-[10px] text-muted-foreground mb-0.5">Allocated</div>
                            <div className="text-xs font-mono font-semibold">{currency} {formatNumber(u.allocated, 0)}</div>
                          </div>
                        ) : (
                          <div className="shrink-0 hidden sm:block">
                            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">No allocation</span>
                          </div>
                        )}

                        {/* Spent */}
                        <div className="shrink-0 text-right hidden sm:block">
                          <div className="text-[10px] text-muted-foreground mb-0.5">Spent</div>
                          <div className="text-xs font-mono font-semibold text-rose-600">
                            {currency} {formatNumber(hasAlloc ? u.spent : txnTotal, 0)}
                          </div>
                        </div>

                        {/* Remaining */}
                        {hasAlloc && remaining !== null && (
                          <div className="shrink-0 text-right hidden sm:block">
                            <div className="text-[10px] text-muted-foreground mb-0.5">Remaining</div>
                            <div className={cn('text-xs font-mono font-semibold', remaining < 0 ? 'text-red-600' : 'text-emerald-600')}>
                              {currency} {formatNumber(remaining, 0)}
                            </div>
                          </div>
                        )}

                        {/* Progress bar */}
                        {pct !== null && (
                          <div className="shrink-0 hidden md:flex flex-col items-end gap-0.5 w-20">
                            <span className="text-[10px] text-muted-foreground">{Math.round(pct)}%</span>
                            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500')}
                                style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Expanded: per-transaction list */}
                    {isExpanded && (
                      <div className="border-t">
                        {u.txns.length === 0 ? (
                          <div className="px-4 py-4 text-xs text-muted-foreground italic">
                            No transactions recorded yet for this user under the current fund filters.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-violet-50/40 dark:bg-violet-900/10 hover:bg-violet-50/40">
                                  <TableHead className="text-[11px] font-semibold pl-4 whitespace-nowrap">Date / Time</TableHead>
                                  <TableHead className="text-[11px] font-semibold">Fund</TableHead>
                                  <TableHead className="text-[11px] font-semibold">Type</TableHead>
                                  <TableHead className="text-[11px] font-semibold">Source</TableHead>
                                  <TableHead className="text-[11px] font-semibold">Reference</TableHead>
                                  <TableHead className="text-[11px] font-semibold">Description</TableHead>
                                  <TableHead className="text-[11px] font-semibold text-center">Reconciled</TableHead>
                                  <TableHead className="text-[11px] font-semibold text-center">Receipt</TableHead>
                                  <TableHead className="text-[11px] font-semibold text-right pr-4">Amount</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {u.txns.map(t => (
                                  <TableRow key={t.id} className="hover:bg-muted/20">
                                    {/* Date + timestamp */}
                                    <TableCell className="pl-4 py-2">
                                      <div className="text-[11px] font-medium whitespace-nowrap">
                                        {t.transaction_date ? format(parseISO(t.transaction_date), 'MMM d, yyyy') : '—'}
                                      </div>
                                      {t.created_at && (
                                        <div className="text-[10px] text-muted-foreground">
                                          {format(parseISO(t.created_at), 'HH:mm:ss')}
                                        </div>
                                      )}
                                    </TableCell>
                                    {/* Fund */}
                                    <TableCell className="text-xs max-w-[130px] py-2">
                                      <span className="truncate block">{t.fund_name}</span>
                                    </TableCell>
                                    {/* Type */}
                                    <TableCell className="py-2">
                                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
                                        style={{ background: (TXN_COLORS[t.transaction_type] ?? '#94a3b8') + '22', color: TXN_COLORS[t.transaction_type] ?? '#64748b' }}>
                                        {t.transaction_type}
                                      </span>
                                    </TableCell>
                                    {/* Source */}
                                    <TableCell className="py-2">
                                      {t.source_table ? (
                                        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                                          {t.source_table === 'operational_cost_submissions' ? 'Cost Sub.' :
                                           t.source_table === 'down_payment_requests' ? 'Down Pmt.' :
                                           t.source_table}
                                        </span>
                                      ) : <span className="text-muted-foreground text-xs">—</span>}
                                    </TableCell>
                                    {/* Reference */}
                                    <TableCell className="text-[11px] font-mono text-muted-foreground py-2 whitespace-nowrap">
                                      {t.reference ?? '—'}
                                    </TableCell>
                                    {/* Description */}
                                    <TableCell className="text-[11px] text-muted-foreground max-w-[160px] py-2">
                                      <span className="truncate block">{t.description ?? '—'}</span>
                                    </TableCell>
                                    {/* Reconciled */}
                                    <TableCell className="text-center py-2">
                                      {t.reconciled
                                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                                        : <Clock className="h-3.5 w-3.5 text-amber-400 mx-auto" />}
                                    </TableCell>
                                    {/* Receipt */}
                                    <TableCell className="text-center py-2">
                                      {t.receipt_url ? (
                                        <a href={t.receipt_url} target="_blank" rel="noopener noreferrer"
                                          className="inline-flex items-center gap-0.5 text-sky-600 hover:text-sky-800 text-xs font-medium">
                                          <Receipt className="h-3.5 w-3.5" />
                                          <ExternalLink className="h-2.5 w-2.5" />
                                        </a>
                                      ) : <span className="text-muted-foreground text-xs">—</span>}
                                    </TableCell>
                                    {/* Amount */}
                                    <TableCell className={cn('text-right text-xs font-semibold tabular-nums pr-4 py-2',
                                      t.transaction_type === 'payment' ? 'text-rose-600' : 'text-emerald-600')}>
                                      {t.currency} {formatNumber(t.amount, 2)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>

                            {/* User subtotal */}
                            <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-t text-xs">
                              <span className="font-semibold text-muted-foreground">{u.txns.length} transactions</span>
                              <span className="font-mono font-bold text-rose-600">
                                {currency} {formatNumber(txnTotal, 2)} total
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Approvals tab — visual chain flow ── */}
        <TabsContent value="approvals" className="mt-3 space-y-4">
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
          ) : approvalSummary.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />No approval chains configured for the current filters.
            </div>
          ) : (() => {
            // Group steps by fund
            const byFund: Record<string, StepRow[]> = {};
            filteredSteps.forEach(s => {
              if (!byFund[s.pre_fund_request_id]) byFund[s.pre_fund_request_id] = [];
              byFund[s.pre_fund_request_id].push(s);
            });
            const fundIds = Object.keys(byFund);
            return fundIds.map(fid => {
              const fundSteps = byFund[fid].sort((a, b) => a.step_order - b.step_order);
              const fund = filteredFunds.find(f => f.id === fid);
              const fundStatus = fund ? STATUS_CFG[fund.status] : null;
              const allDone  = fundSteps.every(s => s.status !== 'pending');
              const anyRej   = fundSteps.some(s => s.status === 'rejected');
              const approvedCount = fundSteps.filter(s => s.status === 'approved').length;
              const pct = fundSteps.length > 0 ? Math.round((approvedCount / fundSteps.length) * 100) : 0;

              return (
                <Card key={fid} className="border overflow-hidden">
                  {/* Fund header */}
                  <div className={cn(
                    'flex items-center justify-between px-4 py-2.5 border-b',
                    anyRej ? 'bg-rose-50 dark:bg-rose-950/30' :
                    allDone ? 'bg-emerald-50 dark:bg-emerald-950/30' :
                    'bg-sky-50 dark:bg-sky-950/20'
                  )}>
                    <div className="flex items-center gap-2 min-w-0">
                      <GitBranch className={cn('h-4 w-4 shrink-0', anyRej ? 'text-rose-500' : allDone ? 'text-emerald-500' : 'text-sky-500')} />
                      <span className="font-semibold text-sm truncate">{fundSteps[0].fund_name}</span>
                      {fundStatus && (
                        <Badge variant="outline" className={cn('text-[10px] shrink-0', fundStatus.cls)}>
                          {fundStatus.label}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-muted-foreground">{approvedCount}/{fundSteps.length} steps</span>
                      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={cn('h-full rounded-full', anyRej ? 'bg-rose-500' : pct === 100 ? 'bg-emerald-500' : 'bg-sky-500')}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Step flow — horizontal scroll on mobile */}
                  <CardContent className="p-4">
                    <div className="flex items-start gap-0 overflow-x-auto pb-1">
                      {fundSteps.map((step, idx) => {
                        const isApproved = step.status === 'approved';
                        const isRejected = step.status === 'rejected';
                        const isPending  = step.status === 'pending';
                        const isActive   = isPending && (idx === 0 || fundSteps[idx - 1].status === 'approved');

                        const stepColor = isApproved ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
                          : isRejected ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/30'
                          : isActive   ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 ring-2 ring-amber-300/50'
                          : 'border-border bg-muted/30';
                        const numColor = isApproved ? 'bg-emerald-500 text-white'
                          : isRejected ? 'bg-rose-500 text-white'
                          : isActive   ? 'bg-amber-500 text-white'
                          : 'bg-muted text-muted-foreground';

                        return (
                          <div key={step.id} className="flex items-center shrink-0">
                            {/* Step card */}
                            <div className={cn('border rounded-xl p-3 w-44 flex flex-col gap-1.5 relative', stepColor)}>
                              {/* Number + label row */}
                              <div className="flex items-center gap-2">
                                <span className={cn('h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0', numColor)}>
                                  {step.step_order}
                                </span>
                                <span className="text-xs font-semibold leading-tight truncate">{step.step_label}</span>
                              </div>
                              {/* Optional badge */}
                              {!step.is_required && (
                                <span className="text-[9px] text-muted-foreground bg-muted rounded px-1 py-0.5 w-fit">optional</span>
                              )}
                              {/* Assignee */}
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground truncate">{step.assignee_names}</span>
                              </div>
                              {/* Status badge */}
                              <Badge variant="outline" className={cn('text-[10px] w-fit px-1.5 py-0',
                                isApproved ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                : isRejected ? 'bg-rose-100 text-rose-700 border-rose-300'
                                : isActive   ? 'bg-amber-100 text-amber-700 border-amber-300'
                                : 'bg-muted text-muted-foreground')}>
                                {isApproved ? '✓ Approved'
                                  : isRejected ? '✗ Rejected'
                                  : isActive ? <><Clock className="inline h-2.5 w-2.5 mr-0.5" />Active</>
                                  : <><Clock className="inline h-2.5 w-2.5 mr-0.5" />Waiting</>}
                              </Badge>
                              {/* Date */}
                              {step.approved_at && (
                                <span className="text-[9px] text-muted-foreground">
                                  {format(parseISO(step.approved_at), 'MMM d, yyyy')}
                                </span>
                              )}
                            </div>

                            {/* Arrow connector */}
                            {idx < fundSteps.length - 1 && (
                              <div className="flex items-center shrink-0 mx-1">
                                <div className="h-px w-5 bg-border" />
                                <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-t-transparent border-b-transparent border-l-border" />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Final outcome bubble */}
                      {fundSteps.length > 0 && (
                        <div className="flex items-center shrink-0 mx-1">
                          <div className="h-px w-5 bg-border" />
                          <div className={cn(
                            'rounded-full px-2.5 py-1 text-[10px] font-semibold border',
                            anyRej ? 'bg-rose-100 text-rose-700 border-rose-300'
                            : allDone ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                            : 'bg-muted text-muted-foreground border-border'
                          )}>
                            {anyRej ? 'Rejected' : allDone ? '✓ All Clear' : 'In Progress'}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            });
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
