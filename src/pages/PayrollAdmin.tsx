/**
 * PayrollAdmin — Admin payroll management
 * 3 sub-tabs: Employee Salaries · Run Payroll · Payslips & History
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  Users, Trash2, Edit3, Save, Lock, CheckCircle2, Download,
  Loader2, Banknote, CalendarRange, PlusCircle, TrendingDown,
  TrendingUp, ReceiptText, PlayCircle, ChevronLeft, ChevronRight,
  Search, AlertCircle, UserCheck, FileDown, MoreVertical,
  BarChart3, Building2, FileSpreadsheet,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────
interface LineItem { name: string; amount: number; type: 'fixed' | 'percent'; }
interface SalaryConfig {
  id: string; user_id: string; base_salary: number; currency: string;
  allowances: LineItem[]; deductions: LineItem[];
  effective_date: string; notes: string | null;
}
interface EmployeeRow {
  id: string; full_name: string | null; role: string | null;
  department_name: string | null; department_id: string | null; email: string | null;
  employment_type: string | null; contract_start_date: string | null;
  salary_config: SalaryConfig | null;
}
interface RunItem {
  id: string; run_id: string; user_id: string; user_name: string; department_name: string;
  base_salary: number; allowances_total: number; gross_salary: number;
  deductions_total: number; net_salary: number; task_rewards: number; retainer_amount: number;
  currency: string; allowances_snapshot: LineItem[]; deductions_snapshot: LineItem[];
}
interface PayrollRun {
  id: string; period_label: string; period_start: string; period_end: string;
  status: string; notes: string | null; created_at: string; locked_at: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const CURRENCIES = ['SDG', 'USD', 'EUR', 'GBP'];
const fmt = (n: number, c = 'SDG') =>
  `${c} ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function computePayroll(cfg: SalaryConfig) {
  const base = cfg.base_salary;
  const fixedA = cfg.allowances.filter(a => a.type === 'fixed').reduce((s, a) => s + a.amount, 0);
  const pctA   = cfg.allowances.filter(a => a.type === 'percent').reduce((s, a) => s + base * a.amount / 100, 0);
  const gross  = base + fixedA + pctA;
  const fixedD = cfg.deductions.filter(d => d.type === 'fixed').reduce((s, d) => s + d.amount, 0);
  const pctD   = cfg.deductions.filter(d => d.type === 'percent').reduce((s, d) => s + gross * d.amount / 100, 0);
  const deductions = fixedD + pctD;
  const net = Math.max(0, gross - deductions);
  return { base, allowTotal: fixedA + pctA, gross, dedTotal: deductions, net };
}

function initials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700', 'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700',
];
function avatarColor(str: string) { return AVATAR_COLORS[str.charCodeAt(0) % AVATAR_COLORS.length]; }

// ── PDF ──────────────────────────────────────────────────────────────────────
function generatePayslipPDF(emp: EmployeeRow, run: PayrollRun, item: RunItem) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;

  // Navy header
  doc.setFillColor(15, 32, 65);
  doc.rect(0, 0, W, 42, 'F');
  doc.setFillColor(29, 52, 97);
  doc.rect(0, 30, W, 12, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text('PACT', 14, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.setTextColor(180, 210, 255);
  doc.text('People and Community Together', 14, 25);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('SALARY PAYSLIP', W - 14, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.setTextColor(180, 210, 255);
  doc.text(`Pay Period: ${run.period_label}`, W - 14, 25, { align: 'right' });
  doc.text(`Issue Date: ${format(new Date(), 'dd MMMM yyyy')}`, W - 14, 31.5, { align: 'right' });

  // Employee info panel
  doc.setFillColor(248, 250, 255);
  doc.rect(14, 50, W - 28, 34, 'F');
  doc.setDrawColor(220, 228, 245);
  doc.rect(14, 50, W - 28, 34, 'S');

  doc.setTextColor(15, 32, 65);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(emp.full_name ?? '—', 20, 61);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80, 100, 140);
  doc.text(`Employee ID: ${item.user_id.slice(0, 8).toUpperCase()}`, 20, 69);
  doc.text(`Role: ${emp.role ?? '—'}`, 20, 76);

  doc.setTextColor(80, 100, 140);
  doc.text(`Department: ${item.department_name ?? '—'}`, W / 2, 61);
  doc.text(`Email: ${emp.email ?? '—'}`, W / 2, 69);
  doc.text(`Currency: ${item.currency}`, W / 2, 76);

  // Earnings
  const earningsRows: any[] = [
    [{ content: 'Base Salary', styles: { fontStyle: 'bold' } }, '', `${item.currency} ${item.base_salary.toLocaleString()}`],
    ...item.allowances_snapshot.map(a => [
      `  ${a.name}`,
      a.type === 'percent' ? `${a.amount}% of base` : 'Fixed',
      `${item.currency} ${(a.type === 'percent' ? item.base_salary * a.amount / 100 : a.amount).toLocaleString()}`
    ]),
    [
      { content: 'GROSS SALARY', styles: { fontStyle: 'bold', fillColor: [235, 244, 255], textColor: [15, 32, 65] } },
      { content: '', styles: { fillColor: [235, 244, 255] } },
      { content: `${item.currency} ${item.gross_salary.toLocaleString()}`, styles: { fontStyle: 'bold', fillColor: [235, 244, 255], textColor: [15, 32, 65] } },
    ],
  ];

  autoTable(doc, {
    startY: 92,
    head: [['EARNINGS', 'BASIS', 'AMOUNT']],
    body: earningsRows,
    theme: 'striped',
    headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, cellPadding: 4 },
    bodyStyles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 52 }, 2: { cellWidth: 44, halign: 'right' } },
    alternateRowStyles: { fillColor: [250, 252, 255] },
    margin: { left: 14, right: 14 },
  });

  const afterE = (doc as any).lastAutoTable.finalY + 6;

  // Deductions
  const dedRows: any[] = [
    ...item.deductions_snapshot.map(d => [
      `  ${d.name}`,
      d.type === 'percent' ? `${d.amount}% of gross` : 'Fixed',
      `${item.currency} ${(d.type === 'percent' ? item.gross_salary * d.amount / 100 : d.amount).toLocaleString()}`
    ]),
    [
      { content: 'TOTAL DEDUCTIONS', styles: { fontStyle: 'bold', fillColor: [255, 245, 245], textColor: [160, 30, 30] } },
      { content: '', styles: { fillColor: [255, 245, 245] } },
      { content: `${item.currency} ${item.deductions_total.toLocaleString()}`, styles: { fontStyle: 'bold', fillColor: [255, 245, 245], textColor: [160, 30, 30] } },
    ],
  ];

  autoTable(doc, {
    startY: afterE,
    head: [['DEDUCTIONS', 'BASIS', 'AMOUNT']],
    body: dedRows,
    theme: 'striped',
    headStyles: { fillColor: [140, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, cellPadding: 4 },
    bodyStyles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 52 }, 2: { cellWidth: 44, halign: 'right', textColor: [160, 30, 30] } },
    alternateRowStyles: { fillColor: [255, 250, 250] },
    margin: { left: 14, right: 14 },
  });

  const afterD = (doc as any).lastAutoTable.finalY + 10;

  // Net pay box
  doc.setFillColor(15, 32, 65);
  doc.roundedRect(14, afterD, W - 28, 22, 4, 4, 'F');
  doc.setTextColor(180, 210, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('NET PAY FOR THE PERIOD', 22, afterD + 10);
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(`${item.currency} ${item.net_salary.toLocaleString()}`, W - 22, afterD + 13, { align: 'right' });

  // Signatures
  const sigY = afterD + 40;
  doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.4);
  doc.line(22, sigY, 90, sigY); doc.line(W - 90, sigY, W - 22, sigY);
  doc.setTextColor(120, 140, 170); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('Employee Signature', 22, sigY + 5);
  doc.text('Authorised by', W - 90, sigY + 5);

  // Footer
  doc.setFontSize(7); doc.setTextColor(180, 190, 210);
  doc.text('This is a computer-generated payslip · PACT Sudan Field Operations · Confidential', W / 2, 287, { align: 'center' });

  doc.save(`Payslip_${(emp.full_name ?? 'employee').replace(/\s+/g, '_')}_${run.period_label.replace(/\s+/g, '_')}.pdf`);
}

// ── Root ─────────────────────────────────────────────────────────────────────
export default function PayrollAdmin() {
  const { currentUser } = useUser();

  const { data: employees = [], isLoading: loadingEmp } = useQuery<EmployeeRow[]>({
    queryKey: ['payroll-admin-employees'],
    queryFn: async () => {
      const [{ data: profs }, { data: depts }, { data: configs }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, email, department_id, employment_type, contract_start_date').order('full_name'),
        supabase.from('departments').select('id, name'),
        supabase.from('employee_salary_config').select('*'),
      ]);
      const deptMap: Record<string, string> = {};
      (depts ?? []).forEach((d: any) => { deptMap[d.id] = d.name; });
      const cfgMap: Record<string, SalaryConfig> = {};
      (configs ?? []).forEach((c: any) => { cfgMap[c.user_id] = { ...c, allowances: Array.isArray(c.allowances) ? c.allowances : [], deductions: Array.isArray(c.deductions) ? c.deductions : [] }; });
      // Only include employees who have an Employment Record (employment_type is set)
      return (profs ?? [])
        .filter((p: any) => p.employment_type != null && p.employment_type !== '')
        .map((p: any) => ({
          id: p.id, full_name: p.full_name, role: p.role, email: p.email,
          department_id: p.department_id, department_name: deptMap[p.department_id] ?? null,
          employment_type: p.employment_type, contract_start_date: p.contract_start_date,
          salary_config: cfgMap[p.id] ?? null,
        }));
    },
  });

  const { data: runs = [], isLoading: loadingRuns } = useQuery<PayrollRun[]>({
    queryKey: ['payroll-runs'],
    queryFn: async () => {
      const { data } = await supabase.from('payroll_runs').select('*').order('created_at', { ascending: false });
      return (data ?? []) as PayrollRun[];
    },
  });

  const configured = employees.filter(e => e.salary_config).length;
  const totalGross  = employees.filter(e => e.salary_config).reduce((s, e) => s + computePayroll(e.salary_config!).gross, 0);
  const totalNet    = employees.filter(e => e.salary_config).reduce((s, e) => s + computePayroll(e.salary_config!).net, 0);

  return (
    <div className="bg-[#f5f7fa] dark:bg-[#0d1117] min-h-screen">

      {/* ── Section header ── */}
      <div className="border-b bg-white dark:bg-slate-900 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-[#0F2041] dark:text-white flex items-center gap-2">
              <Banknote className="h-5 w-5 text-cyan-500" />
              Payroll Administration
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure salaries · run payroll · generate payslips
            </p>
          </div>
          {/* Top-level KPIs */}
          <div className="flex items-center gap-3 flex-wrap">
            <Kpi label="Configured" value={`${configured} / ${employees.length}`} color="text-indigo-600" />
            <Kpi label="Monthly Gross" value={configured > 0 ? fmt(totalGross) : '—'} color="text-emerald-600" />
            <Kpi label="Monthly Net"   value={configured > 0 ? fmt(totalNet) : '—'}   color="text-blue-600" />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
        <Tabs defaultValue="salaries">
          <TabsList className="w-full sm:w-auto h-10 bg-white dark:bg-slate-900 border shadow-sm rounded-xl p-1 mb-5 flex-wrap gap-0">
            <TabsTrigger value="salaries" className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white">
              <Users className="h-3.5 w-3.5" />Employee Salaries
            </TabsTrigger>
            <TabsTrigger value="run" className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white">
              <PlayCircle className="h-3.5 w-3.5" />Run Payroll
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white">
              <ReceiptText className="h-3.5 w-3.5" />Payslips &amp; History
            </TabsTrigger>
            <TabsTrigger value="reports" className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white">
              <BarChart3 className="h-3.5 w-3.5" />Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="salaries" className="mt-0">
            <SalarySetupTab employees={employees} loading={loadingEmp} />
          </TabsContent>
          <TabsContent value="run" className="mt-0">
            <RunPayrollTab employees={employees} runs={runs} currentUserId={currentUser?.id ?? ''} />
          </TabsContent>
          <TabsContent value="history" className="mt-0">
            <PayslipsTab runs={runs} loading={loadingRuns} employees={employees} />
          </TabsContent>
          <TabsContent value="reports" className="mt-0">
            <PayrollReportsTab runs={runs} employees={employees} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Kpi pill ──────────────────────────────────────────────────────────────────
function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border rounded-xl px-4 py-2 text-center shadow-sm min-w-[100px]">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      <p className={cn('text-base font-bold mt-0.5', color)}>{value}</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Employee Salaries
// ══════════════════════════════════════════════════════════════════════════════
function SalarySetupTab({ employees, loading }: { employees: EmployeeRow[]; loading: boolean }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'configured' | 'missing'>('configured');
  const [editEmp, setEditEmp] = useState<EmployeeRow | null>(null);

  const filtered = useMemo(() => {
    let list = employees;
    if (search) list = list.filter(e => (e.full_name ?? '').toLowerCase().includes(search.toLowerCase()) || (e.department_name ?? '').toLowerCase().includes(search.toLowerCase()));
    if (filter === 'configured') list = list.filter(e => e.salary_config);
    if (filter === 'missing')    list = list.filter(e => !e.salary_config);
    return list;
  }, [employees, search, filter]);

  return (
    <div className="space-y-4">
      {/* Notice */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800/40 text-sm text-blue-800 dark:text-blue-200">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <p>Showing only <strong>configured</strong> employees by default. Switch to <strong>Not configured</strong> or <strong>All employees</strong> using the filter to set up new salary packages.</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or department…" className="pl-9 h-9 text-sm bg-white dark:bg-slate-900" />
        </div>
        <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
          <SelectTrigger className="h-9 w-[160px] text-sm bg-white dark:bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            <SelectItem value="configured">Configured</SelectItem>
            <SelectItem value="missing">Not configured</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="h-9 px-3 text-xs font-medium bg-white dark:bg-slate-900">
          {filtered.length} shown
        </Badge>
      </div>

      {/* Table */}
      <Card className="shadow-sm border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b">
                <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3 uppercase tracking-wide">Employee</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide hidden md:table-cell">Contract</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide">Department</th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide">Base</th>
                <th className="text-right text-xs font-semibold text-emerald-600 px-3 py-3 uppercase tracking-wide">Gross</th>
                <th className="text-right text-xs font-semibold text-blue-600 px-3 py-3 uppercase tracking-wide">Net Pay</th>
                <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin opacity-30 mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-sm text-muted-foreground">No employees with employment records found.</td></tr>
              ) : filtered.map(emp => {
                const calc = emp.salary_config ? computePayroll(emp.salary_config) : null;
                const cur  = emp.salary_config?.currency ?? 'SDG';
                return (
                  <tr key={emp.id} className="border-b last:border-0 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0', avatarColor(emp.id))}>
                          {initials(emp.full_name)}
                        </div>
                        <div>
                          <p className="font-semibold text-sm leading-tight">{emp.full_name ?? '—'}</p>
                          <p className="text-[11px] text-muted-foreground capitalize mt-0.5">{emp.role?.replace(/_/g, ' ') ?? '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 hidden md:table-cell">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
                        {emp.employment_type?.replace(/_/g, ' ') ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-sm text-muted-foreground">{emp.department_name ?? <span className="opacity-30">—</span>}</td>
                    <td className="px-3 py-3.5 text-right font-medium text-sm">{calc ? fmt(calc.base, cur) : <span className="text-muted-foreground/30">—</span>}</td>
                    <td className="px-3 py-3.5 text-right font-semibold text-emerald-600 text-sm">{calc ? fmt(calc.gross, cur) : <span className="text-muted-foreground/30">—</span>}</td>
                    <td className="px-3 py-3.5 text-right font-bold text-blue-600 text-sm">{calc ? fmt(calc.net, cur) : <span className="text-muted-foreground/30">—</span>}</td>
                    <td className="px-3 py-3.5 text-center">
                      {emp.salary_config
                        ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Active</span>
                        : <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Not set</span>
                      }
                    </td>
                    <td className="px-5 py-3.5">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-slate-800" onClick={() => setEditEmp(emp)}>
                        <Edit3 className="h-3 w-3" />{emp.salary_config ? 'Edit' : 'Set up'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {editEmp && <SalaryEditDialog emp={editEmp} onClose={() => setEditEmp(null)} />}
    </div>
  );
}

// ── Preset templates ─────────────────────────────────────────────────────────
const ALLOWANCE_PRESETS: LineItem[] = [
  { name: 'Housing Allowance',    amount: 25, type: 'percent' },
  { name: 'Transport Allowance',  amount: 10, type: 'percent' },
  { name: 'Food Allowance',       amount: 5,  type: 'percent' },
  { name: 'Medical Allowance',    amount: 10, type: 'percent' },
  { name: 'Communication Allow.', amount: 5,  type: 'percent' },
  { name: 'Risk Allowance',       amount: 15, type: 'percent' },
];
const DEDUCTION_PRESETS: LineItem[] = [
  { name: 'Income Tax',           amount: 10, type: 'percent' },
  { name: 'Social Security',      amount: 8,  type: 'percent' },
  { name: 'Pension',              amount: 5,  type: 'percent' },
  { name: 'Advance Recovery',     amount: 0,  type: 'fixed'   },
  { name: 'Absence Deduction',    amount: 0,  type: 'fixed'   },
];

// ── Salary Edit Dialog ────────────────────────────────────────────────────────
function SalaryEditDialog({ emp, onClose }: { emp: EmployeeRow; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const existing = emp.salary_config;

  const [baseSalary, setBaseSalary]   = useState(String(existing?.base_salary ?? ''));
  const [currency, setCurrency]       = useState(existing?.currency ?? 'SDG');
  const [allowances, setAllowances]   = useState<LineItem[]>(existing?.allowances ?? []);
  const [deductions, setDeductions]   = useState<LineItem[]>(existing?.deductions ?? []);
  const [effectiveDate, setEffDate]   = useState(existing?.effective_date ?? format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes]             = useState(existing?.notes ?? '');
  const [saving, setSaving]           = useState(false);

  const base = parseFloat(baseSalary) || 0;

  // Computed line items with amounts
  const computedAllowances = allowances.map(a => ({
    ...a,
    computed: a.type === 'fixed' ? a.amount : base * a.amount / 100,
  }));
  const allowTotal = computedAllowances.reduce((s, a) => s + a.computed, 0);
  const gross = base + allowTotal;
  const computedDeductions = deductions.map(d => ({
    ...d,
    computed: d.type === 'fixed' ? d.amount : gross * d.amount / 100,
  }));
  const dedTotal = computedDeductions.reduce((s, d) => s + d.computed, 0);
  const net = Math.max(0, gross - dedTotal);

  const addLine = (list: LineItem[], setList: (l: LineItem[]) => void, preset?: LineItem) =>
    setList([...list, preset ? { ...preset } : { name: '', amount: 0, type: 'fixed' }]);

  const addPreset = (list: LineItem[], setList: (l: LineItem[]) => void, preset: LineItem) => {
    if (list.some(i => i.name === preset.name)) return;
    setList([...list, { ...preset }]);
  };

  const updateLine = (list: LineItem[], setList: (l: LineItem[]) => void, idx: number, field: keyof LineItem, value: any) =>
    setList(list.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  const removeLine = (list: LineItem[], setList: (l: LineItem[]) => void, idx: number) =>
    setList(list.filter((_, i) => i !== idx));

  const save = async () => {
    if (!base || base <= 0) { toast({ title: 'Enter a valid base salary', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = {
      user_id: emp.id, base_salary: base, currency, allowances, deductions,
      notes: notes || null, effective_date: effectiveDate, updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await supabase.from('employee_salary_config').update(payload).eq('id', existing.id)
      : await supabase.from('employee_salary_config').insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id });
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Salary configuration saved' });
    qc.invalidateQueries({ queryKey: ['payroll-admin-employees'] });
    onClose();
  };

  // Visual bar widths (cap allowances bar at gross, show deductions as portion of gross)
  const barBase      = gross > 0 ? (base / gross) * 100 : 0;
  const barAllow     = gross > 0 ? (allowTotal / gross) * 100 : 0;
  const barDed       = gross > 0 ? (dedTotal / gross) * 100 : 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b bg-slate-50 dark:bg-slate-900 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold', avatarColor(emp.id))}>
              {initials(emp.full_name)}
            </div>
            <div>
              <DialogTitle className="text-base font-bold leading-tight">{emp.full_name}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5 capitalize">{emp.role?.replace(/_/g, ' ')} · {emp.department_name ?? 'No dept'} · {emp.employment_type?.replace(/_/g, ' ') ?? 'Employment type not set'}</DialogDescription>
            </div>
            {/* Net pay badge in header */}
            {base > 0 && (
              <div className="ml-auto text-right shrink-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Est. Net</p>
                <p className="text-base font-bold text-[#0F2041] dark:text-blue-300">{fmt(net, currency)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Base salary + currency + effective date */}
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-2">
              <SectionLabel icon={<Banknote className="h-3.5 w-3.5 text-indigo-500" />} label="Base Salary" />
              <Input type="number" value={baseSalary} onChange={e => setBaseSalary(e.target.value)} placeholder="0" className="text-sm h-10 mt-1.5 font-medium" />
            </div>
            <div>
              <SectionLabel icon={null} label="Currency" />
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-10 text-sm mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <SectionLabel icon={<CalendarRange className="h-3.5 w-3.5 text-violet-500" />} label="Effective Date" />
              <Input type="date" value={effectiveDate} onChange={e => setEffDate(e.target.value)} className="text-sm h-10 mt-1.5" />
            </div>
          </div>

          {/* Visual salary bar */}
          {base > 0 && (
            <div className="space-y-1.5">
              <div className="flex rounded-lg overflow-hidden h-3 gap-px">
                <div className="bg-[#0F2041] transition-all duration-300" style={{ width: `${barBase}%` }} title={`Base: ${fmt(base, currency)}`} />
                {allowTotal > 0 && <div className="bg-emerald-400 transition-all duration-300" style={{ width: `${barAllow}%` }} title={`Allowances: ${fmt(allowTotal, currency)}`} />}
              </div>
              <div className="flex rounded-lg overflow-hidden h-1.5 gap-px">
                <div className="bg-blue-500 transition-all duration-300" style={{ width: `${Math.max(0, 100 - barDed)}%` }} />
                {dedTotal > 0 && <div className="bg-red-400 transition-all duration-300" style={{ width: `${barDed}%` }} />}
              </div>
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0F2041] inline-block" />Base</span>
                {allowTotal > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Allowances</span>}
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Net</span>
                {dedTotal > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Deductions</span>}
              </div>
            </div>
          )}

          {/* Allowances */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionLabel icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />} label="Allowances" />
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => addLine(allowances, setAllowances)}>
                <PlusCircle className="h-3.5 w-3.5" />Custom
              </Button>
            </div>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-1.5">
              {ALLOWANCE_PRESETS.map(p => {
                const active = allowances.some(a => a.name === p.name);
                return (
                  <button
                    key={p.name}
                    onClick={() => active
                      ? setAllowances(allowances.filter(a => a.name !== p.name))
                      : addPreset(allowances, setAllowances, p)
                    }
                    className={cn(
                      'text-[11px] px-2.5 py-1 rounded-full border transition-all font-medium',
                      active
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-400',
                    )}
                  >
                    {active ? '✓ ' : '+ '}{p.name} ({p.amount}{p.type === 'percent' ? '%' : ''})
                  </button>
                );
              })}
            </div>

            {allowances.length === 0
              ? <p className="text-xs text-muted-foreground italic pl-1">No allowances yet. Select a preset above or click Custom.</p>
              : (
                <div className="rounded-xl border overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-slate-50 px-3 py-1.5 border-b">
                    <span>Name</span><span className="w-20 text-right">Amount</span><span className="w-20 text-center">Type</span><span className="w-24 text-right text-emerald-600">= Value</span><span className="w-6" />
                  </div>
                  <div className="divide-y">
                    {computedAllowances.map((a, i) => (
                      <EnhancedLineRow
                        key={i} item={a} computed={a.computed} currency={currency}
                        onUpdate={(f, v) => updateLine(allowances, setAllowances, i, f, v)}
                        onRemove={() => removeLine(allowances, setAllowances, i)}
                        typeSuffix="of base" valueColor="text-emerald-600"
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 bg-emerald-50/60 border-t">
                    <span className="text-xs font-semibold text-emerald-700">Total Allowances</span>
                    <span className="text-sm font-bold text-emerald-600">+ {fmt(allowTotal, currency)}</span>
                  </div>
                </div>
              )
            }
          </div>

          {/* Gross subtotal indicator */}
          {base > 0 && allowTotal > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800">
              <span className="text-xs text-muted-foreground">Gross Salary (before deductions):</span>
              <span className="text-sm font-bold text-[#0F2041] dark:text-blue-300 ml-auto">{fmt(gross, currency)}</span>
            </div>
          )}

          {/* Deductions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionLabel icon={<TrendingDown className="h-3.5 w-3.5 text-red-500" />} label="Deductions" />
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => addLine(deductions, setDeductions)}>
                <PlusCircle className="h-3.5 w-3.5" />Custom
              </Button>
            </div>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-1.5">
              {DEDUCTION_PRESETS.map(p => {
                const active = deductions.some(d => d.name === p.name);
                return (
                  <button
                    key={p.name}
                    onClick={() => active
                      ? setDeductions(deductions.filter(d => d.name !== p.name))
                      : addPreset(deductions, setDeductions, p)
                    }
                    className={cn(
                      'text-[11px] px-2.5 py-1 rounded-full border transition-all font-medium',
                      active
                        ? 'bg-red-500 text-white border-red-500'
                        : 'bg-white text-red-700 border-red-200 hover:bg-red-50 hover:border-red-400',
                    )}
                  >
                    {active ? '✓ ' : '− '}{p.name}{p.type === 'percent' ? ` (${p.amount}%)` : ''}
                  </button>
                );
              })}
            </div>

            {deductions.length === 0
              ? <p className="text-xs text-muted-foreground italic pl-1">No deductions yet. Select a preset above or click Custom.</p>
              : (
                <div className="rounded-xl border overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-slate-50 px-3 py-1.5 border-b">
                    <span>Name</span><span className="w-20 text-right">Amount</span><span className="w-20 text-center">Type</span><span className="w-24 text-right text-red-500">= Value</span><span className="w-6" />
                  </div>
                  <div className="divide-y">
                    {computedDeductions.map((d, i) => (
                      <EnhancedLineRow
                        key={i} item={d} computed={d.computed} currency={currency}
                        onUpdate={(f, v) => updateLine(deductions, setDeductions, i, f, v)}
                        onRemove={() => removeLine(deductions, setDeductions, i)}
                        typeSuffix="of gross" valueColor="text-red-500"
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 bg-red-50/60 border-t">
                    <span className="text-xs font-semibold text-red-700">Total Deductions</span>
                    <span className="text-sm font-bold text-red-500">− {fmt(dedTotal, currency)}</span>
                  </div>
                </div>
              )
            }
          </div>

          {/* Net pay summary */}
          {base > 0 && (
            <div
              className="rounded-2xl p-4 text-white"
              style={{ background: 'linear-gradient(135deg, #0F2041 0%, #1D3461 100%)' }}
            >
              <p className="text-blue-200/70 text-[10px] font-medium uppercase tracking-wide mb-3">Salary Calculation Summary</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-blue-200/80">Base Salary</span><span className="font-medium">{fmt(base, currency)}</span></div>
                {computedAllowances.map((a, i) => (
                  <div key={i} className="flex justify-between text-emerald-300">
                    <span className="truncate max-w-[200px]">+ {a.name || 'Allowance'}</span>
                    <span className="font-medium shrink-0 ml-2">+{fmt(a.computed, currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-white/20 pt-1.5 font-semibold">
                  <span>= Gross Salary</span><span>{fmt(gross, currency)}</span>
                </div>
                {computedDeductions.map((d, i) => (
                  <div key={i} className="flex justify-between text-red-300">
                    <span className="truncate max-w-[200px]">− {d.name || 'Deduction'}</span>
                    <span className="font-medium shrink-0 ml-2">−{fmt(d.computed, currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-white/20 pt-2 mt-1">
                  <span className="text-base font-bold">NET SALARY</span>
                  <span className="text-xl font-bold text-cyan-300">{fmt(net, currency)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <SectionLabel icon={<MoreVertical className="h-3.5 w-3.5 text-slate-400" />} label="Notes (optional)" />
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes about this salary package…" className="text-sm mt-2 h-16 resize-none" />
          </div>
        </div>

        <div className="px-6 pb-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#0F2041] hover:bg-[#1D3461] text-white gap-2 min-w-[160px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4 — Payroll Reports
// ══════════════════════════════════════════════════════════════════════════════
interface AggregateLine { name: string; total: number; count: number; pctOfGross: number; }
interface DeptSummary { dept: string; headcount: number; base: number; gross: number; deductions: number; net: number; }

function aggregateLines(items: RunItem[], kind: 'allowances_snapshot' | 'deductions_snapshot'): AggregateLine[] {
  const map: Record<string, { total: number; count: number; grossSum: number }> = {};
  for (const item of items) {
    const lines = item[kind] ?? [];
    const base  = item.base_salary;
    const gross = item.gross_salary;
    for (const line of lines) {
      const computed = line.type === 'fixed'
        ? line.amount
        : (kind === 'allowances_snapshot' ? base : gross) * line.amount / 100;
      if (!map[line.name]) map[line.name] = { total: 0, count: 0, grossSum: 0 };
      map[line.name].total    += computed;
      map[line.name].count    += 1;
      map[line.name].grossSum += gross;
    }
  }
  return Object.entries(map)
    .map(([name, v]) => ({ name, total: v.total, count: v.count, pctOfGross: v.grossSum > 0 ? (v.total / v.grossSum) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

function deptBreakdown(items: RunItem[]): DeptSummary[] {
  const map: Record<string, DeptSummary> = {};
  for (const item of items) {
    const d = item.department_name || 'No Department';
    if (!map[d]) map[d] = { dept: d, headcount: 0, base: 0, gross: 0, deductions: 0, net: 0 };
    map[d].headcount  += 1;
    map[d].base       += item.base_salary;
    map[d].gross      += item.gross_salary;
    map[d].deductions += item.deductions_total;
    map[d].net        += item.net_salary;
  }
  return Object.values(map).sort((a, b) => b.gross - a.gross);
}

function PayrollReportsTab({ runs, employees }: { runs: PayrollRun[]; employees: EmployeeRow[] }) {
  const [selectedRunId, setSelectedRunId] = useState<string>('projection');

  // Fetch run items for selected payroll run
  const { data: fetchedItems = [], isLoading: loadingItems } = useQuery<RunItem[]>({
    queryKey: ['payroll-report-items', selectedRunId],
    enabled: selectedRunId !== 'projection',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_run_items')
        .select('*')
        .eq('run_id', selectedRunId);
      if (error) throw error;
      return (data ?? []) as RunItem[];
    },
  });

  // Build projection from current salary configs
  const projectionItems: RunItem[] = useMemo(() => {
    return employees
      .filter(e => e.salary_config)
      .map(emp => {
        const calc = computePayroll(emp.salary_config!);
        return {
          id: emp.id, run_id: '', user_id: emp.id,
          user_name: emp.full_name ?? '—',
          department_name: emp.department_name ?? 'No Department',
          base_salary: calc.base, allowances_total: calc.allowTotal,
          gross_salary: calc.gross, deductions_total: calc.dedTotal,
          net_salary: calc.net, task_rewards: 0, retainer_amount: 0,
          currency: emp.salary_config!.currency,
          allowances_snapshot: emp.salary_config!.allowances,
          deductions_snapshot: emp.salary_config!.deductions,
        };
      });
  }, [employees]);

  const items = selectedRunId === 'projection' ? projectionItems : fetchedItems;
  const isProjection = selectedRunId === 'projection';
  const selectedRun  = runs.find(r => r.id === selectedRunId);

  const allowanceSummary = useMemo(() => aggregateLines(items, 'allowances_snapshot'), [items]);
  const deductionSummary = useMemo(() => aggregateLines(items, 'deductions_snapshot'), [items]);
  const deptSummary      = useMemo(() => deptBreakdown(items), [items]);

  const totalGross  = items.reduce((s, i) => s + i.gross_salary, 0);
  const totalDed    = items.reduce((s, i) => s + i.deductions_total, 0);
  const totalNet    = items.reduce((s, i) => s + i.net_salary, 0);
  const totalBase   = items.reduce((s, i) => s + i.base_salary, 0);
  const totalAllow  = items.reduce((s, i) => s + i.allowances_total, 0);

  const maxAllowBar = allowanceSummary[0]?.total || 1;
  const maxDedBar   = deductionSummary[0]?.total || 1;
  const maxDeptBar  = deptSummary[0]?.gross || 1;

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['PACT Payroll Report', isProjection ? 'Current Configuration (Projection)' : selectedRun?.period_label ?? ''],
      ['Generated', format(new Date(), 'dd MMM yyyy HH:mm')],
      [],
      ['SUMMARY'],
      ['Headcount', items.length],
      ['Total Base', totalBase],
      ['Total Allowances', totalAllow],
      ['Total Gross', totalGross],
      ['Total Deductions', totalDed],
      ['Total Net Pay', totalNet],
    ]), 'Summary');

    // Allowances sheet
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Allowance', 'Employees', 'Total Amount', '% of Gross'],
      ...allowanceSummary.map(a => [a.name, a.count, a.total, `${a.pctOfGross.toFixed(1)}%`]),
    ]), 'Allowances');

    // Deductions sheet
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Deduction', 'Employees', 'Total Amount', '% of Gross'],
      ...deductionSummary.map(d => [d.name, d.count, d.total, `${d.pctOfGross.toFixed(1)}%`]),
    ]), 'Deductions');

    // Department sheet
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Department', 'Headcount', 'Total Base', 'Total Gross', 'Total Deductions', 'Total Net'],
      ...deptSummary.map(d => [d.dept, d.headcount, d.base, d.gross, d.deductions, d.net]),
    ]), 'By Department');

    // Full employee list
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Employee', 'Department', 'Base', 'Allowances', 'Gross', 'Deductions', 'Net'],
      ...items.map(i => [i.user_name, i.department_name, i.base_salary, i.allowances_total, i.gross_salary, i.deductions_total, i.net_salary]),
    ]), 'Employee Detail');

    const label = isProjection ? 'projection' : (selectedRun?.period_label ?? 'report');
    XLSX.writeFile(wb, `pact-payroll-${label.replace(/\s/g, '-').toLowerCase()}.xlsx`);
  };

  const loading = selectedRunId !== 'projection' && loadingItems;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedRunId} onValueChange={setSelectedRunId}>
            <SelectTrigger className="h-9 w-[240px] text-sm bg-white dark:bg-slate-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="projection">Current Config (Live Projection)</SelectItem>
              {runs.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  {r.period_label} — {r.status === 'locked' ? '🔒 Locked' : 'Draft'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isProjection && (
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium">
            Live projection from current salary configs
          </span>
        )}
        {selectedRun && (
          <span className={cn(
            'text-[11px] px-2.5 py-1 rounded-full border font-medium',
            selectedRun.status === 'locked'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-blue-50 border-blue-200 text-blue-700',
          )}>
            {selectedRun.status === 'locked' ? '🔒 Locked payroll run' : 'Draft payroll run'}
          </span>
        )}
        <Button onClick={exportExcel} disabled={items.length === 0} size="sm" variant="outline" className="ml-auto h-9 gap-2 text-xs bg-white dark:bg-slate-900">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />Export Excel
        </Button>
      </div>

      {loading && (
        <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin opacity-30" />
          <span className="text-sm">Loading payroll data…</span>
        </div>
      )}

      {!loading && items.length === 0 && (
        <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
          <CardContent className="py-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
              <BarChart3 className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm font-semibold">No data available</p>
            <p className="text-sm text-muted-foreground">Configure employee salaries or run payroll first.</p>
          </CardContent>
        </Card>
      )}

      {!loading && items.length > 0 && (
        <>
          {/* KPI summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Headcount',     value: String(items.length),           color: 'text-[#0F2041] dark:text-blue-300' },
              { label: 'Total Base',    value: fmt(totalBase),                 color: 'text-slate-600' },
              { label: 'Total Allow.',  value: fmt(totalAllow),                color: 'text-emerald-600' },
              { label: 'Total Deductions', value: fmt(totalDed),               color: 'text-red-500' },
              { label: 'Total Net Pay', value: fmt(totalNet),                  color: 'text-blue-600' },
            ].map(k => (
              <div key={k.label} className="bg-white dark:bg-slate-900 border rounded-xl px-4 py-3 shadow-sm text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</p>
                <p className={cn('text-sm font-bold mt-0.5', k.color)}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Allowance breakdown */}
            <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-semibold">Allowance Breakdown</h3>
                <span className="ml-auto text-xs text-muted-foreground">{allowanceSummary.length} types</span>
              </div>
              <CardContent className="p-0">
                {allowanceSummary.length === 0
                  ? <p className="px-5 py-8 text-xs text-muted-foreground italic text-center">No allowances configured</p>
                  : (
                    <div className="divide-y">
                      {allowanceSummary.map((a, i) => (
                        <div key={i} className="px-5 py-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate max-w-[180px]">{a.name}</span>
                            <div className="text-right shrink-0 ml-2">
                              <span className="text-sm font-bold text-emerald-600">{fmt(a.total)}</span>
                              <span className="text-[11px] text-muted-foreground ml-2">({a.pctOfGross.toFixed(1)}% gross)</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${(a.total / maxAllowBar) * 100}%` }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0">{a.count} emp</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-5 py-2.5 bg-emerald-50/60 dark:bg-emerald-950/10">
                        <span className="text-xs font-semibold text-emerald-700">Total Allowances</span>
                        <span className="text-sm font-bold text-emerald-600">{fmt(totalAllow)}</span>
                      </div>
                    </div>
                  )
                }
              </CardContent>
            </Card>

            {/* Deduction breakdown */}
            <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-semibold">Deduction Breakdown</h3>
                <span className="ml-auto text-xs text-muted-foreground">{deductionSummary.length} types</span>
              </div>
              <CardContent className="p-0">
                {deductionSummary.length === 0
                  ? <p className="px-5 py-8 text-xs text-muted-foreground italic text-center">No deductions configured</p>
                  : (
                    <div className="divide-y">
                      {deductionSummary.map((d, i) => (
                        <div key={i} className="px-5 py-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate max-w-[180px]">{d.name}</span>
                            <div className="text-right shrink-0 ml-2">
                              <span className="text-sm font-bold text-red-500">{fmt(d.total)}</span>
                              <span className="text-[11px] text-muted-foreground ml-2">({d.pctOfGross.toFixed(1)}% gross)</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${(d.total / maxDedBar) * 100}%` }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0">{d.count} emp</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-5 py-2.5 bg-red-50/60 dark:bg-red-950/10">
                        <span className="text-xs font-semibold text-red-700">Total Deductions</span>
                        <span className="text-sm font-bold text-red-500">{fmt(totalDed)}</span>
                      </div>
                    </div>
                  )
                }
              </CardContent>
            </Card>
          </div>

          {/* Department comparison */}
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b flex items-center gap-2">
              <Building2 className="h-4 w-4 text-violet-500" />
              <h3 className="text-sm font-semibold">By Department</h3>
              <span className="ml-auto text-xs text-muted-foreground">{deptSummary.length} departments</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/40 border-b">
                    <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Department</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Staff</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Base</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-emerald-600">Gross</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-red-500">Deductions</th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-blue-600">Net Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {deptSummary.map((d, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-5 py-3">
                        <div className="space-y-1">
                          <span className="font-medium">{d.dept}</span>
                          <div className="w-32 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#0F2041] rounded-full" style={{ width: `${(d.gross / maxDeptBar) * 100}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-0.5">{d.headcount}</span>
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-muted-foreground">{fmt(d.base)}</td>
                      <td className="px-3 py-3 text-right text-sm font-semibold text-emerald-600">{fmt(d.gross)}</td>
                      <td className="px-3 py-3 text-right text-sm font-medium text-red-500">−{fmt(d.deductions)}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold text-blue-600">{fmt(d.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-800/40 border-t-2 border-slate-200">
                    <td className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Total</td>
                    <td className="px-3 py-3 text-center text-xs font-bold">{items.length}</td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-muted-foreground">{fmt(totalBase)}</td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-emerald-600">{fmt(totalGross)}</td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-red-500">−{fmt(totalDed)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-blue-600">{fmt(totalNet)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* Gross composition bar */}
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#0F2041]" />
              <h3 className="text-sm font-semibold">Gross Salary Composition</h3>
            </div>
            <CardContent className="pt-4 pb-5 space-y-3">
              {[
                { label: 'Base Salary',      value: totalBase,  pct: totalGross > 0 ? totalBase / totalGross * 100 : 0,  color: 'bg-[#0F2041]',   text: 'text-[#0F2041] dark:text-blue-300' },
                { label: 'Total Allowances', value: totalAllow, pct: totalGross > 0 ? totalAllow / totalGross * 100 : 0, color: 'bg-emerald-400', text: 'text-emerald-600' },
              ].map(c => (
                <div key={c.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className={cn('w-2.5 h-2.5 rounded-sm', c.color)} />{c.label}
                    </span>
                    <span className={cn('font-bold', c.text)}>{fmt(c.value)} <span className="text-muted-foreground font-normal">({c.pct.toFixed(1)}%)</span></span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', c.color)} style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs pt-1 border-t">
                <span className="font-semibold text-[#0F2041] dark:text-blue-300">= Total Gross</span>
                <span className="font-bold text-[#0F2041] dark:text-blue-300">{fmt(totalGross)}</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-red-600">
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-400" />Total Deductions
                  </span>
                  <span className="font-bold text-red-500">−{fmt(totalDed)} <span className="text-muted-foreground font-normal">({totalGross > 0 ? (totalDed / totalGross * 100).toFixed(1) : 0}% of gross)</span></span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-red-400 transition-all" style={{ width: `${totalGross > 0 ? (totalDed / totalGross) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t">
                <span className="text-xs font-bold text-blue-600">= Total Net Pay</span>
                <span className="text-base font-bold text-blue-600">{fmt(totalNet)}</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function EnhancedLineRow({ item, computed, currency, onUpdate, onRemove, typeSuffix, valueColor }: {
  item: LineItem & { computed?: number }; computed: number; currency: string;
  onUpdate: (f: keyof LineItem, v: any) => void; onRemove: () => void;
  typeSuffix: string; valueColor: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-3 py-2 group hover:bg-slate-50/60 transition-colors">
      <Input
        placeholder="e.g. Housing Allowance"
        value={item.name}
        onChange={e => onUpdate('name', e.target.value)}
        className="text-xs h-8 border-dashed focus:border-solid"
      />
      <Input
        type="number" placeholder="0"
        value={item.amount || ''}
        onChange={e => onUpdate('amount', parseFloat(e.target.value) || 0)}
        className="text-xs h-8 w-20 text-right"
      />
      <Select value={item.type} onValueChange={v => onUpdate('type', v)}>
        <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="fixed">Fixed</SelectItem>
          <SelectItem value="percent">% {typeSuffix}</SelectItem>
        </SelectContent>
      </Select>
      <span className={cn('text-xs font-semibold w-24 text-right tabular-nums', valueColor)}>
        = {fmt(computed, currency)}
      </span>
      <button onClick={onRemove} className="p-1 rounded text-red-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all ml-1">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — Run Payroll
// ══════════════════════════════════════════════════════════════════════════════
function RunPayrollTab({ employees, runs, currentUserId }: {
  employees: EmployeeRow[]; runs: PayrollRun[]; currentUserId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [monthOffset, setMonthOffset] = useState(0);
  const [preview, setPreview]         = useState<RunItem[]>([]);
  const [computing, setComputing]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [locking, setLocking]         = useState(false);
  const [savedRunId, setSavedRunId]   = useState<string | null>(null);

  const periodStart = startOfMonth(subMonths(new Date(), -monthOffset));
  const periodEnd   = endOfMonth(subMonths(new Date(), -monthOffset));
  const periodLabel = format(periodStart, 'MMMM yyyy');

  const existingRun = runs.find(r => r.period_label === periodLabel);
  const isLocked    = existingRun?.status === 'locked';
  const configured  = employees.filter(e => e.salary_config);

  const computePreview = useCallback(() => {
    if (!configured.length) { toast({ title: 'No employees have salary configured.', variant: 'destructive' }); return; }
    setComputing(true);
    setTimeout(() => {
      setPreview(configured.map(emp => {
        const calc = computePayroll(emp.salary_config!);
        return {
          id: crypto.randomUUID(), run_id: '',
          user_id: emp.id, user_name: emp.full_name ?? '—',
          department_name: emp.department_name ?? '—',
          base_salary: calc.base, allowances_total: calc.allowTotal,
          gross_salary: calc.gross, deductions_total: calc.dedTotal,
          net_salary: calc.net, task_rewards: 0, retainer_amount: 0,
          currency: emp.salary_config!.currency,
          allowances_snapshot: emp.salary_config!.allowances,
          deductions_snapshot: emp.salary_config!.deductions,
        };
      }));
      setComputing(false);
    }, 200);
  }, [configured, toast]);

  const saveRun = async (lockIt = false) => {
    if (!preview.length) { toast({ title: 'Compute preview first', variant: 'destructive' }); return; }
    lockIt ? setLocking(true) : setSaving(true);
    try {
      let runId = savedRunId ?? existingRun?.id;
      if (!runId) {
        const { data, error } = await supabase.from('payroll_runs').insert({
          period_label: periodLabel,
          period_start: format(periodStart, 'yyyy-MM-dd'),
          period_end: format(periodEnd, 'yyyy-MM-dd'),
          status: lockIt ? 'locked' : 'draft',
          created_by: currentUserId,
          locked_at: lockIt ? new Date().toISOString() : null,
        }).select('id').single();
        if (error) throw error;
        runId = data.id; setSavedRunId(runId);
      } else if (lockIt) {
        await supabase.from('payroll_runs').update({ status: 'locked', locked_at: new Date().toISOString() }).eq('id', runId);
      }
      await supabase.from('payroll_run_items').delete().eq('run_id', runId!);
      await supabase.from('payroll_run_items').insert(preview.map(r => ({ run_id: runId, user_id: r.user_id, user_name: r.user_name, department_name: r.department_name, base_salary: r.base_salary, allowances_total: r.allowances_total, gross_salary: r.gross_salary, deductions_total: r.deductions_total, net_salary: r.net_salary, task_rewards: r.task_rewards, retainer_amount: r.retainer_amount, currency: r.currency, allowances_snapshot: r.allowances_snapshot, deductions_snapshot: r.deductions_snapshot })));
      toast({ title: lockIt ? `✓ ${periodLabel} payroll locked` : 'Draft saved' });
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); setLocking(false); }
  };

  const totals = preview.reduce((s, r) => ({ gross: s.gross + r.gross_salary, ded: s.ded + r.deductions_total, net: s.net + r.net_salary }), { gross: 0, ded: 0, net: 0 });

  return (
    <div className="space-y-5">
      {/* Period selector card */}
      <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-indigo-500" />Payroll Period
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-1.5">
              <button onClick={() => { setMonthOffset(o => o - 1); setPreview([]); }} className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-bold min-w-[130px] text-center">{periodLabel}</span>
              <button onClick={() => { setMonthOffset(o => o + 1); setPreview([]); }} disabled={monthOffset >= 0} className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {existingRun && (
              <Badge className={cn('text-xs font-semibold px-3 py-1', isLocked ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200')}>
                {isLocked ? '🔒 Locked' : '📝 Draft'}
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">{configured.length}/{employees.length} configured</span>
              <Button onClick={computePreview} disabled={computing || isLocked} className="bg-[#0F2041] hover:bg-[#1D3461] text-white gap-2 h-9">
                {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Compute
              </Button>
              {preview.length > 0 && !isLocked && (
                <>
                  <Button variant="outline" onClick={() => saveRun(false)} disabled={saving} className="h-9 gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Draft
                  </Button>
                  <Button onClick={() => saveRun(true)} disabled={locking} className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 gap-2">
                    {locking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    Lock &amp; Finalize
                  </Button>
                </>
              )}
            </div>
          </div>

          {isLocked && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Payroll Locked</p>
                <p className="text-xs text-emerald-700 mt-0.5">This payroll period is finalized. Switch to <strong>Payslips &amp; History</strong> to download individual payslips.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview table */}
      {preview.length > 0 && (
        <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Preview — {periodLabel}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{preview.length} employees · review before locking</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Gross: <strong className="text-emerald-600">{fmt(totals.gross)}</strong></span>
              <span>Ded: <strong className="text-red-500">-{fmt(totals.ded)}</strong></span>
              <span className="text-sm font-bold text-blue-600">Net: {fmt(totals.net)}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3 uppercase tracking-wide">Employee</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide">Base</th>
                  <th className="text-right text-xs font-semibold text-emerald-600 px-3 py-3 uppercase tracking-wide">+Allowances</th>
                  <th className="text-right text-xs font-semibold text-[#0F2041] dark:text-blue-300 px-3 py-3 uppercase tracking-wide">Gross</th>
                  <th className="text-right text-xs font-semibold text-red-500 px-3 py-3 uppercase tracking-wide">−Deductions</th>
                  <th className="text-right text-xs font-semibold text-blue-600 px-5 py-3 uppercase tracking-wide">Net Pay</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(row => (
                  <tr key={row.user_id} className="border-b last:border-0 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0', avatarColor(row.user_id))}>
                          {initials(row.user_name)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{row.user_name}</p>
                          <p className="text-[11px] text-muted-foreground">{row.department_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right text-sm">{fmt(row.base_salary, row.currency)}</td>
                    <td className="px-3 py-3.5 text-right text-sm text-emerald-600">+{fmt(row.allowances_total, row.currency)}</td>
                    <td className="px-3 py-3.5 text-right text-sm font-semibold text-[#0F2041] dark:text-blue-300">{fmt(row.gross_salary, row.currency)}</td>
                    <td className="px-3 py-3.5 text-right text-sm text-red-500">-{fmt(row.deductions_total, row.currency)}</td>
                    <td className="px-5 py-3.5 text-right text-sm font-bold text-blue-600">{fmt(row.net_salary, row.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-t-2">
                  <td className="px-5 py-3 text-sm font-bold text-muted-foreground">Totals</td>
                  <td colSpan={2} />
                  <td className="px-3 py-3 text-right text-sm font-bold text-[#0F2041] dark:text-blue-300">{fmt(totals.gross)}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-red-500">-{fmt(totals.ded)}</td>
                  <td className="px-5 py-3 text-right text-sm font-bold text-blue-600">{fmt(totals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {!preview.length && !computing && (
        <div className="py-20 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto">
            <PlayCircle className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          </div>
          <p className="text-sm text-muted-foreground">Select a period and click <strong className="text-foreground">Compute</strong> to preview payroll.</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Payslips & History
// ══════════════════════════════════════════════════════════════════════════════
function PayslipsTab({ runs, loading, employees }: {
  runs: PayrollRun[]; loading: boolean; employees: EmployeeRow[];
}) {
  const { toast } = useToast();
  const [selectedRun, setSelectedRun]   = useState<PayrollRun | null>(null);
  const [runItems, setRunItems]          = useState<RunItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const empMap = useMemo(() => {
    const m: Record<string, EmployeeRow> = {};
    employees.forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  const loadItems = async (run: PayrollRun) => {
    setSelectedRun(run); setLoadingItems(true);
    const { data } = await supabase.from('payroll_run_items').select('*').eq('run_id', run.id);
    setRunItems((data ?? []).map((d: any) => ({
      ...d,
      allowances_snapshot: Array.isArray(d.allowances_snapshot) ? d.allowances_snapshot : [],
      deductions_snapshot: Array.isArray(d.deductions_snapshot) ? d.deductions_snapshot : [],
    })));
    setLoadingItems(false);
  };

  const downloadPDF = (item: RunItem) => {
    if (!selectedRun) return;
    const emp = empMap[item.user_id] ?? { id: item.user_id, full_name: item.user_name, role: null, department_name: item.department_name, department_id: null, email: null, salary_config: null };
    generatePayslipPDF(emp, selectedRun, item);
  };

  const downloadAll = () => {
    runItems.forEach(item => downloadPDF(item));
    toast({ title: `Generating ${runItems.length} payslips…` });
  };

  if (loading) return (
    <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin opacity-30" /><span className="text-sm">Loading…</span>
    </div>
  );

  if (!runs.length) return (
    <div className="py-24 text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto">
        <ReceiptText className="h-8 w-8 text-slate-300 dark:text-slate-600" />
      </div>
      <p className="text-sm text-muted-foreground">No payroll runs yet.<br />Go to <strong className="text-foreground">Run Payroll</strong> to create the first one.</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

      {/* Run list */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Payroll Runs</p>
        {runs.map(run => (
          <button key={run.id} onClick={() => loadItems(run)}
            className={cn(
              'w-full text-left px-4 py-3.5 rounded-xl border transition-all hover:shadow-sm',
              selectedRun?.id === run.id
                ? 'border-[#0F2041] bg-[#0F2041] text-white shadow-md'
                : 'border-border bg-white dark:bg-slate-900 hover:border-[#0F2041]/30'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cn('text-sm font-bold', selectedRun?.id === run.id ? 'text-white' : '')}>{run.period_label}</span>
              <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', run.status === 'locked' ? 'bg-emerald-500 text-white' : selectedRun?.id === run.id ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700')}>
                {run.status === 'locked' ? 'Locked' : 'Draft'}
              </span>
            </div>
            <p className={cn('text-[11px] mt-1', selectedRun?.id === run.id ? 'text-blue-200' : 'text-muted-foreground')}>
              {format(parseISO(run.created_at), 'dd MMM yyyy')}
            </p>
          </button>
        ))}
      </div>

      {/* Payslips panel */}
      <div className="md:col-span-2">
        {!selectedRun ? (
          <div className="h-full flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground bg-white dark:bg-slate-900 rounded-2xl border border-dashed">
            <FileDown className="h-10 w-10 opacity-20" />
            <p className="text-sm">Select a payroll run to view payslips.</p>
          </div>
        ) : (
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden h-full">
            {/* Payslip panel header */}
            <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-bold">{selectedRun.period_label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(parseISO(selectedRun.period_start), 'dd MMM')} – {format(parseISO(selectedRun.period_end), 'dd MMM yyyy')}
                  {selectedRun.status === 'locked' && <span className="ml-2 text-emerald-600 font-semibold">· Locked</span>}
                </p>
              </div>
              {runItems.length > 0 && (
                <Button size="sm" onClick={downloadAll} className="bg-[#0F2041] hover:bg-[#1D3461] text-white h-8 gap-2 text-xs">
                  <Download className="h-3.5 w-3.5" />All PDFs ({runItems.length})
                </Button>
              )}
            </div>

            <CardContent className="p-0">
              {loadingItems && (
                <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin opacity-30" />
                </div>
              )}
              {!loadingItems && runItems.length === 0 && (
                <p className="py-12 text-center text-sm text-muted-foreground">No items in this run.</p>
              )}
              {!loadingItems && runItems.length > 0 && (
                <>
                  {/* Summary strip */}
                  <div className="grid grid-cols-3 divide-x border-b bg-slate-50 dark:bg-slate-800/40">
                    {[
                      { label: 'Total Gross', v: runItems.reduce((s, r) => s + r.gross_salary, 0), color: 'text-[#0F2041] dark:text-blue-300' },
                      { label: 'Total Deductions', v: runItems.reduce((s, r) => s + r.deductions_total, 0), color: 'text-red-500' },
                      { label: 'Total Net Pay', v: runItems.reduce((s, r) => s + r.net_salary, 0), color: 'text-blue-600' },
                    ].map(s => (
                      <div key={s.label} className="py-3 px-4 text-center">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{s.label}</p>
                        <p className={cn('text-sm font-bold mt-0.5', s.color)}>{fmt(s.v)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Employee payslip list */}
                  <div className="divide-y">
                    {runItems.map(item => (
                      <div key={item.id} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0', avatarColor(item.user_id))}>
                            {initials(item.user_name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{item.user_name}</p>
                            <p className="text-[11px] text-muted-foreground">{item.department_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-5 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gross</p>
                            <p className="text-xs font-semibold text-[#0F2041] dark:text-blue-300">{fmt(item.gross_salary, item.currency)}</p>
                          </div>
                          <div className="text-right hidden sm:block">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Deductions</p>
                            <p className="text-xs font-semibold text-red-500">-{fmt(item.deductions_total, item.currency)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Net Pay</p>
                            <p className="text-sm font-bold text-blue-600">{fmt(item.net_salary, item.currency)}</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => downloadPDF(item)}
                            className="h-8 gap-1.5 text-xs bg-white dark:bg-slate-800 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Download className="h-3.5 w-3.5" />PDF
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
