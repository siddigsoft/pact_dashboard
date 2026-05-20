import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  Users, Download, Search, Filter, Loader2, Banknote, ChevronLeft, ChevronRight,
  FileSpreadsheet, FileText, Building2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
interface LineItem { name: string; amount: number; type: 'fixed' | 'percent'; }
interface SalaryConfig {
  user_id: string; base_salary: number; currency: string;
  allowances: LineItem[]; deductions: LineItem[]; effective_date: string | null;
}
interface EmployeeRow {
  id: string; full_name: string | null; role: string | null; email: string | null;
  department_id: string | null; department_name: string | null;
  employment_type: string | null; contract_type: string | null;
  contract_start_date: string | null; contract_end_date: string | null;
  is_employee: boolean | null;
  salary_config: SalaryConfig | null;
  retainer_amount: number | null;
  retainer_currency: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', SDG: 'SDG', EUR: '€', GBP: '£' };
const sym = (c: string) => CURRENCY_SYMBOL[c] ?? c;
const fmt = (n: number, c = 'SDG') =>
  `${sym(c)} ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function computeSalary(cfg: SalaryConfig) {
  const base = cfg.base_salary;
  const fixedA = cfg.allowances.filter(a => a.type === 'fixed').reduce((s, a) => s + a.amount, 0);
  const pctA = cfg.allowances.filter(a => a.type === 'percent').reduce((s, a) => s + base * a.amount / 100, 0);
  const gross = base + fixedA + pctA;
  const fixedD = cfg.deductions.filter(d => d.type === 'fixed').reduce((s, d) => s + d.amount, 0);
  const pctD = cfg.deductions.filter(d => d.type === 'percent').reduce((s, d) => s + gross * d.amount / 100, 0);
  const net = Math.max(0, gross - fixedD - pctD);
  return { base, gross, net, currency: cfg.currency };
}

const CACHE = { staleTime: 5 * 60_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false } as const;

// ── Raw Supabase row types ─────────────────────────────────────────────────────
interface RawProfile {
  id: string; full_name: string | null; role: string | null; email: string | null;
  department_id: string | null; employment_type: string | null;
  contract_start_date: string | null; contract_end_date: string | null;
  contract_type: string | null; is_employee: boolean | null;
}
interface RawDepartment { id: string; name: string; }
interface RawSalaryConfig {
  user_id: string; base_salary: number; currency: string;
  allowances: LineItem[] | null; deductions: LineItem[] | null;
  effective_date: string | null;
}
// Retainers are stored as wallet_transactions (type='adjustment', metadata.type='retainer')
interface RawRetainerTx {
  user_id: string; amount: number; currency: string;
  metadata: { type: string; period: string } | null;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SalaryRetainerReport() {
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const navigate = useNavigate();
  const isAuthorized = isSuperAdmin() || hasAnyRole([
    'admin', 'Admin', 'financialAdmin', 'financial_admin', 'FinancialAdmin',
  ]);

  // Route-level authorization — redirect users without finance/admin/auditor access
  useEffect(() => {
    if (!isAuthorized) {
      navigate('/unauthorized', { replace: true });
    }
  }, [isAuthorized, navigate]);

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [monthOffset, setMonthOffset] = useState(0);
  const [dateRangeMode, setDateRangeMode] = useState<'month' | 'custom'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const periodStart = dateRangeMode === 'custom' && customStart
    ? new Date(customStart)
    : startOfMonth(subMonths(new Date(), monthOffset));
  const periodEnd = dateRangeMode === 'custom' && customEnd
    ? new Date(customEnd)
    : endOfMonth(subMonths(new Date(), monthOffset));
  const periodLabel = dateRangeMode === 'custom' && customStart && customEnd
    ? `${format(periodStart, 'dd MMM yyyy')} – ${format(periodEnd, 'dd MMM yyyy')}`
    : format(periodStart, 'MMMM yyyy');

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: employees = [], isLoading } = useQuery<EmployeeRow[]>({
    queryKey: ['salary-retainer-report'],
    ...CACHE,
    queryFn: async () => {
      const [profsResult, deptsResult, configsResult] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, email, department_id, employment_type, contract_start_date, contract_end_date, contract_type, is_employee').order('full_name'),
        supabase.from('departments').select('id, name'),
        supabase.from('employee_salary_config').select('*'),
      ]);
      const profs = (profsResult.data ?? []) as RawProfile[];
      const depts = (deptsResult.data ?? []) as RawDepartment[];
      const configs = (configsResult.data ?? []) as RawSalaryConfig[];

      const deptMap: Record<string, string> = {};
      depts.forEach(d => { deptMap[d.id] = d.name; });

      const cfgMap: Record<string, SalaryConfig> = {};
      configs.forEach(c => {
        cfgMap[c.user_id] = {
          ...c,
          allowances: Array.isArray(c.allowances) ? c.allowances : [],
          deductions: Array.isArray(c.deductions) ? c.deductions : [],
        };
      });

      return profs
        .filter(p => p.is_employee === true)
        .map(p => ({
          id: p.id, full_name: p.full_name, role: p.role, email: p.email,
          department_id: p.department_id,
          department_name: deptMap[p.department_id ?? ''] ?? null,
          employment_type: p.employment_type,
          contract_type: p.contract_type ?? null,
          contract_start_date: p.contract_start_date,
          contract_end_date: p.contract_end_date,
          is_employee: p.is_employee,
          salary_config: cfgMap[p.id] ?? null,
          retainer_amount: null,
          retainer_currency: null,
        }));
    },
  });

  // Fetch retainer wallet transactions — retainers are stored in wallet_transactions
  // with type='adjustment' and metadata.type='retainer'. The old retainer_payments
  // table does not exist in this system.
  const { data: retainerData = [] } = useQuery<RawRetainerTx[]>({
    queryKey: ['retainer-wallet-txs'],
    ...CACHE,
    queryFn: async () => {
      const { data } = await supabase
        .from('wallet_transactions')
        .select('user_id, amount, currency, metadata')
        .eq('metadata->>type', 'retainer');
      return (data ?? []) as RawRetainerTx[];
    },
  });

  // Departments for filter
  const { data: departments = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['departments-list'],
    ...CACHE,
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id, name').order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  // ── Derived ────────────────────────────────────────────────────────────────
  const retainerMap = useMemo(() => {
    // Transactions store the pay period in metadata.period as 'YYYY-MM'.
    // Match against the selected period's start month.
    const targetPeriod = format(periodStart, 'yyyy-MM');
    const map: Record<string, { amount: number; currency: string }> = {};
    retainerData.forEach(r => {
      if (r.metadata?.period === targetPeriod) {
        map[r.user_id] = { amount: r.amount, currency: r.currency ?? 'SDG' };
      }
    });
    return map;
  }, [retainerData, periodStart]);

  const enriched = useMemo(() => {
    return employees.map(emp => {
      const sal = emp.salary_config ? computeSalary(emp.salary_config) : null;
      const ret = retainerMap[emp.id] ?? null;
      const totalFixed = (sal?.gross ?? 0) + (ret?.amount ?? 0);
      return { ...emp, salaryCalc: sal, retainerPeriod: ret, totalFixed };
    });
  }, [employees, retainerMap]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e => (e.full_name ?? '').toLowerCase().includes(q) || (e.department_name ?? '').toLowerCase().includes(q));
    }
    if (deptFilter !== 'all') list = list.filter(e => e.department_id === deptFilter);
    if (typeFilter === 'salary') list = list.filter(e => e.salaryCalc !== null && !e.retainerPeriod);
    if (typeFilter === 'retainer') list = list.filter(e => !!e.retainerPeriod);
    return list;
  }, [enriched, search, deptFilter, typeFilter]);

  const totals = useMemo(() => {
    const salaryTotal = filtered.filter(e => e.salaryCalc).reduce((s, e) => s + (e.salaryCalc?.gross ?? 0), 0);
    const retainerTotal = filtered.reduce((s, e) => s + (e.retainerPeriod?.amount ?? 0), 0);
    return { salary: salaryTotal, retainer: retainerTotal, combined: salaryTotal + retainerTotal };
  }, [filtered]);

  // ── Export ─────────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows: string[][] = [
      ['Employee', 'Department', 'Role', 'Type', 'Base Salary', 'Gross Salary', 'Net Salary', 'Retainer', 'Currency', 'Total Fixed Cost'],
    ];
    filtered.forEach(e => {
      rows.push([
        e.full_name ?? '', e.department_name ?? '', e.role ?? '',
        e.contract_type ?? e.employment_type ?? '',
        String(e.salaryCalc?.base ?? ''), String(e.salaryCalc?.gross ?? ''),
        String(e.salaryCalc?.net ?? ''), String(e.retainerPeriod?.amount ?? ''),
        e.salaryCalc?.currency ?? e.retainerPeriod?.currency ?? 'SDG',
        String(e.totalFixed),
      ]);
    });
    rows.push(['', '', '', 'TOTAL', '', String(totals.salary), '', String(totals.retainer), '', String(totals.combined)]);
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `salary-retainer-${format(periodStart, 'yyyy-MM')}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  }

  function exportExcel() {
    const data = [
      ['Employee', 'Department', 'Role', 'Type', 'Base Salary', 'Gross Salary', 'Net Salary', 'Retainer', 'Currency', 'Total Fixed Cost'],
      ...filtered.map(e => [
        e.full_name ?? '', e.department_name ?? '', e.role ?? '',
        e.contract_type ?? e.employment_type ?? '',
        e.salaryCalc?.base ?? '', e.salaryCalc?.gross ?? '', e.salaryCalc?.net ?? '',
        e.retainerPeriod?.amount ?? '',
        e.salaryCalc?.currency ?? e.retainerPeriod?.currency ?? 'SDG',
        e.totalFixed,
      ]),
      ['', '', '', 'TOTAL', '', totals.salary, '', totals.retainer, '', totals.combined],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salary & Retainer');
    XLSX.writeFile(wb, `salary-retainer-${format(periodStart, 'yyyy-MM')}.xlsx`);
  }

  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFillColor(15, 32, 65);
    doc.rect(0, 0, 297, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('Salary & Retainer Cost Report', 14, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.setTextColor(180, 210, 255);
    doc.text(`Period: ${periodLabel} · Generated: ${format(new Date(), 'dd MMM yyyy')}`, 14, 22);

    autoTable(doc, {
      startY: 32,
      head: [['Employee', 'Department', 'Role', 'Base Salary', 'Gross', 'Net', 'Retainer', 'Total Fixed']],
      body: filtered.map(e => [
        e.full_name ?? '—', e.department_name ?? '—', e.role ?? '—',
        e.salaryCalc ? fmt(e.salaryCalc.base, e.salaryCalc.currency) : '—',
        e.salaryCalc ? fmt(e.salaryCalc.gross, e.salaryCalc.currency) : '—',
        e.salaryCalc ? fmt(e.salaryCalc.net, e.salaryCalc.currency) : '—',
        e.retainerPeriod ? fmt(e.retainerPeriod.amount, e.retainerPeriod.currency) : '—',
        e.totalFixed > 0 ? fmt(e.totalFixed, e.salaryCalc?.currency ?? 'SDG') : '—',
      ]),
      foot: [['', '', 'TOTALS', '', fmt(totals.salary), '', fmt(totals.retainer), fmt(totals.combined)]],
      headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      footStyles: { fillColor: [235, 244, 255], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 255] },
      margin: { left: 14, right: 14 },
    });

    doc.save(`salary-retainer-${format(periodStart, 'yyyy-MM')}.pdf`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-[#0d1117]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-emerald-500" />
              Salary & Retainer Cost Report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Per-employee fixed monthly cost breakdown</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date range mode toggle */}
            <Select value={dateRangeMode} onValueChange={(v) => setDateRangeMode(v as 'month' | 'custom')}>
              <SelectTrigger className="h-8 w-[120px] text-xs bg-white dark:bg-slate-900" data-testid="select-date-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {/* Period selector */}
            {dateRangeMode === 'month' ? (
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border rounded-xl px-2 py-1 shadow-sm">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonthOffset(o => o + 1)} data-testid="button-prev-month"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm font-semibold min-w-[130px] text-center">{periodLabel}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonthOffset(o => o - 1)} disabled={monthOffset <= 0} data-testid="button-next-month"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-8 w-[140px] text-xs bg-white dark:bg-slate-900" data-testid="input-date-start" />
                <span className="text-xs text-muted-foreground">–</span>
                <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-8 w-[140px] text-xs bg-white dark:bg-slate-900" data-testid="input-date-end" />
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 bg-white dark:bg-slate-900" data-testid="button-export">
                  <Download className="h-3.5 w-3.5" />Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportCSV}><FileSpreadsheet className="h-3.5 w-3.5 mr-2" />Export CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={exportExcel}><FileSpreadsheet className="h-3.5 w-3.5 mr-2" />Export Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={exportPDF}><FileText className="h-3.5 w-3.5 mr-2" />Export PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
            <CardContent className="pt-4 pb-4 px-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Employees</p>
              <p className="text-2xl font-bold mt-1 text-indigo-600">{isLoading ? '…' : filtered.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">In filter</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
            <CardContent className="pt-4 pb-4 px-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Total Salaries</p>
              <p className="text-2xl font-bold mt-1 text-emerald-600">{isLoading ? '…' : fmt(totals.salary)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Gross payroll</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
            <CardContent className="pt-4 pb-4 px-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Total Retainers</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{isLoading ? '…' : fmt(totals.retainer)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{periodLabel}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
            <CardContent className="pt-4 pb-4 px-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Total Fixed Cost</p>
              <p className="text-2xl font-bold mt-1 text-violet-600">{isLoading ? '…' : fmt(totals.combined)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Salary + Retainer</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or department…" className="pl-9 h-9 text-sm bg-white dark:bg-slate-900" data-testid="input-search" />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 w-[180px] text-sm bg-white dark:bg-slate-900" data-testid="select-department">
              <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-[150px] text-sm bg-white dark:bg-slate-900" data-testid="select-type">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="salary">Salary Only</SelectItem>
              <SelectItem value="retainer">Retainer Only</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="h-9 px-3 text-xs font-medium bg-white dark:bg-slate-900">{filtered.length} employees</Badge>
        </div>

        {/* Table */}
        <Card className="shadow-sm border-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3 uppercase tracking-wide">Employee</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide hidden md:table-cell">Department</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide hidden lg:table-cell">Type</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide">Base Salary</th>
                  <th className="text-right text-xs font-semibold text-emerald-600 px-3 py-3 uppercase tracking-wide">Gross</th>
                  <th className="text-right text-xs font-semibold text-blue-600 px-3 py-3 uppercase tracking-wide hidden sm:table-cell">Net</th>
                  <th className="text-right text-xs font-semibold text-indigo-600 px-3 py-3 uppercase tracking-wide">Retainer</th>
                  <th className="text-right text-xs font-semibold text-violet-700 px-3 py-3 uppercase tracking-wide">Total Fixed</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="py-16 text-center"><Loader2 className="h-5 w-5 animate-spin opacity-30 mx-auto" /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="py-16 text-center text-sm text-muted-foreground">No employees found matching your filters.</td></tr>
                ) : filtered.map(emp => (
                  <tr key={emp.id} className="border-b last:border-0 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors" data-testid={`row-employee-${emp.id}`}>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold leading-tight">{emp.full_name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{emp.role?.replace(/_/g, ' ') ?? '—'}</p>
                    </td>
                    <td className="px-3 py-3.5 hidden md:table-cell text-sm text-muted-foreground">{emp.department_name ?? '—'}</td>
                    <td className="px-3 py-3.5 hidden lg:table-cell">
                      <Badge variant="outline" className="text-xs capitalize">{emp.contract_type ?? emp.employment_type ?? '—'}</Badge>
                    </td>
                    <td className="px-3 py-3.5 text-right font-medium text-sm">
                      {emp.salaryCalc ? fmt(emp.salaryCalc.base, emp.salaryCalc.currency) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3.5 text-right font-semibold text-emerald-700 text-sm">
                      {emp.salaryCalc ? fmt(emp.salaryCalc.gross, emp.salaryCalc.currency) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3.5 text-right text-blue-700 text-sm hidden sm:table-cell">
                      {emp.salaryCalc ? fmt(emp.salaryCalc.net, emp.salaryCalc.currency) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3.5 text-right text-indigo-700 text-sm">
                      {emp.retainerPeriod ? fmt(emp.retainerPeriod.amount, emp.retainerPeriod.currency) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3.5 text-right font-bold text-violet-700 text-sm">
                      {emp.totalFixed > 0 ? fmt(emp.totalFixed, emp.salaryCalc?.currency ?? 'SDG') : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {!isLoading && filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-800/40 border-t">
                    <td colSpan={4} className="px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Totals</td>
                    <td className="px-3 py-3 text-right font-bold text-emerald-700">{fmt(totals.salary)}</td>
                    <td className="px-3 py-3 hidden sm:table-cell" />
                    <td className="px-3 py-3 text-right font-bold text-indigo-700">{fmt(totals.retainer)}</td>
                    <td className="px-3 py-3 text-right font-bold text-violet-700">{fmt(totals.combined)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
