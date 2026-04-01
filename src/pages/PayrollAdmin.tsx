/**
 * PayrollAdmin — Admin-only payroll management module
 * Tabs: Employee Salaries | Run Payroll | Payslips & History
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Users, DollarSign, PlayCircle, FileText, Plus, Trash2, Edit3,
  Save, X, ChevronDown, ChevronUp, Lock, CheckCircle2, Download,
  AlertCircle, Loader2, Banknote, RefreshCw, Building2, CalendarRange,
  PlusCircle, Info, TrendingDown, TrendingUp, ReceiptText,
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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
  id: string; full_name: string | null; role: string | null; department_name: string | null;
  department_id: string | null; email: string | null;
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
  items?: RunItem[];
}

// ── Constants ────────────────────────────────────────────────────────────────
const CURRENCIES = ['SDG', 'USD', 'EUR', 'GBP'];
const fmt = (n: number, c = 'SDG') =>
  `${c} ${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// ── Payroll math ─────────────────────────────────────────────────────────────
function computePayroll(cfg: SalaryConfig) {
  const base = cfg.base_salary;
  const fixedAllow  = cfg.allowances.filter(a => a.type === 'fixed').reduce((s, a) => s + a.amount, 0);
  const pctAllow    = cfg.allowances.filter(a => a.type === 'percent').reduce((s, a) => s + (base * a.amount / 100), 0);
  const allowTotal  = fixedAllow + pctAllow;
  const gross       = base + allowTotal;
  const fixedDed    = cfg.deductions.filter(d => d.type === 'fixed').reduce((s, d) => s + d.amount, 0);
  const pctDed      = cfg.deductions.filter(d => d.type === 'percent').reduce((s, d) => s + (gross * d.amount / 100), 0);
  const dedTotal    = fixedDed + pctDed;
  const net         = Math.max(0, gross - dedTotal);
  return { base, allowTotal, gross, dedTotal, net };
}

// ── PDF Payslip ──────────────────────────────────────────────────────────────
function generatePayslipPDF(emp: EmployeeRow, run: PayrollRun, item: RunItem) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210; const pageH = 297;

  // Header band
  doc.setFillColor(15, 32, 65);
  doc.rect(0, 0, W, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('PACT', 14, 16);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('Building Capacity. Changing Lives.', 14, 22);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text('PAYSLIP', W - 14, 16, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${run.period_label}`, W - 14, 22, { align: 'right' });
  doc.text(`Issued: ${format(new Date(), 'dd MMM yyyy')}`, W - 14, 28, { align: 'right' });

  // Employee details box
  doc.setTextColor(30, 30, 30);
  doc.setFillColor(243, 246, 253);
  doc.roundedRect(14, 44, W - 28, 38, 3, 3, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(emp.full_name ?? '—', 20, 54);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`ID: ${emp.id.slice(0, 8).toUpperCase()}`, 20, 61);
  doc.text(`Role: ${emp.role ?? '—'}`, 20, 67);
  doc.text(`Department: ${emp.department_name ?? '—'}`, 20, 73);
  doc.text(`Email: ${emp.email ?? '—'}`, W / 2, 61);
  doc.text(`Currency: ${item.currency}`, W / 2, 67);
  doc.text(`Period: ${format(parseISO(run.period_start), 'dd MMM')} – ${format(parseISO(run.period_end), 'dd MMM yyyy')}`, W / 2, 73);

  // Earnings table
  const earningsRows: any[] = [
    ['Base Salary', '', `${item.currency} ${item.base_salary.toLocaleString()}`],
    ...item.allowances_snapshot.map(a => [
      `  ${a.name}`,
      a.type === 'percent' ? `${a.amount}% of base` : '',
      `${item.currency} ${(a.type === 'percent' ? item.base_salary * a.amount / 100 : a.amount).toLocaleString()}`
    ]),
    [{ content: 'GROSS SALARY', styles: { fontStyle: 'bold', fillColor: [235, 245, 255] } }, '', { content: `${item.currency} ${item.gross_salary.toLocaleString()}`, styles: { fontStyle: 'bold', fillColor: [235, 245, 255] } }],
  ];

  if (item.task_rewards > 0) earningsRows.push(['  Task Rewards', '', `${item.currency} ${item.task_rewards.toLocaleString()}`]);
  if (item.retainer_amount > 0) earningsRows.push(['  Retainer', '', `${item.currency} ${item.retainer_amount.toLocaleString()}`]);

  autoTable(doc, {
    startY: 90,
    head: [['EARNINGS', 'Basis', 'Amount']],
    body: earningsRows,
    theme: 'striped',
    headStyles: { fillColor: [29, 52, 97], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 50 }, 2: { cellWidth: 46, halign: 'right' } },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  const afterEarnings = (doc as any).lastAutoTable.finalY + 6;

  // Deductions table
  const dedRows: any[] = [
    ...item.deductions_snapshot.map(d => [
      `  ${d.name}`,
      d.type === 'percent' ? `${d.amount}% of gross` : '',
      `${item.currency} ${(d.type === 'percent' ? item.gross_salary * d.amount / 100 : d.amount).toLocaleString()}`
    ]),
    [{ content: 'TOTAL DEDUCTIONS', styles: { fontStyle: 'bold', fillColor: [255, 243, 240] } }, '', { content: `${item.currency} ${item.deductions_total.toLocaleString()}`, styles: { fontStyle: 'bold', fillColor: [255, 243, 240], textColor: [180, 40, 40] } }],
  ];

  autoTable(doc, {
    startY: afterEarnings,
    head: [['DEDUCTIONS', 'Basis', 'Amount']],
    body: dedRows,
    theme: 'striped',
    headStyles: { fillColor: [150, 50, 50], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 50 }, 2: { cellWidth: 46, halign: 'right', textColor: [180, 40, 40] } },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  const afterDed = (doc as any).lastAutoTable.finalY + 8;

  // Net pay banner
  doc.setFillColor(15, 32, 65);
  doc.roundedRect(14, afterDed, W - 28, 20, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('NET PAY', 22, afterDed + 13);
  doc.setFontSize(14);
  doc.text(`${item.currency} ${item.net_salary.toLocaleString()}`, W - 22, afterDed + 13, { align: 'right' });

  // Signature lines
  const sigY = afterDed + 38;
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.line(22, sigY, 80, sigY);
  doc.text('Employee Signature', 22, sigY + 5);
  doc.line(W - 80, sigY, W - 22, sigY);
  doc.text('Authorized by', W - 80, sigY + 5);

  // Footer
  doc.setFontSize(7); doc.setTextColor(160, 160, 160);
  doc.text('This payslip is computer-generated. PACT · Sudan Field Operations', W / 2, pageH - 8, { align: 'center' });

  doc.save(`Payslip_${(emp.full_name ?? 'employee').replace(/\s+/g, '_')}_${run.period_label.replace(/\s+/g, '_')}.pdf`);
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PayrollAdmin() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: employees = [], isLoading: loadingEmp } = useQuery<EmployeeRow[]>({
    queryKey: ['payroll-admin-employees'],
    queryFn: async () => {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, role, email, department_id')
        .order('full_name');

      const { data: depts } = await supabase.from('departments').select('id, name');
      const deptMap: Record<string, string> = {};
      (depts ?? []).forEach((d: any) => { deptMap[d.id] = d.name; });

      const { data: configs } = await supabase
        .from('employee_salary_config')
        .select('*');
      const cfgMap: Record<string, SalaryConfig> = {};
      (configs ?? []).forEach((c: any) => { cfgMap[c.user_id] = c; });

      return (profs ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        role: p.role,
        email: p.email,
        department_id: p.department_id,
        department_name: deptMap[p.department_id] ?? null,
        salary_config: cfgMap[p.id] ? {
          ...cfgMap[p.id],
          allowances: Array.isArray(cfgMap[p.id].allowances) ? cfgMap[p.id].allowances : [],
          deductions: Array.isArray(cfgMap[p.id].deductions) ? cfgMap[p.id].deductions : [],
        } : null,
      }));
    },
  });

  const { data: runs = [], isLoading: loadingRuns } = useQuery<PayrollRun[]>({
    queryKey: ['payroll-runs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('payroll_runs')
        .select('*')
        .order('created_at', { ascending: false });
      return (data ?? []) as PayrollRun[];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Tabs defaultValue="salaries" className="space-y-4">
          <TabsList className="h-9">
            <TabsTrigger value="salaries" className="text-xs gap-1.5">
              <Users className="h-3.5 w-3.5" />Employee Salaries
            </TabsTrigger>
            <TabsTrigger value="run" className="text-xs gap-1.5">
              <PlayCircle className="h-3.5 w-3.5" />Run Payroll
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs gap-1.5">
              <ReceiptText className="h-3.5 w-3.5" />Payslips &amp; History
            </TabsTrigger>
          </TabsList>

          {/* ── TAB 1: Employee Salaries ── */}
          <TabsContent value="salaries" className="mt-0">
            <SalarySetupTab employees={employees} loading={loadingEmp} />
          </TabsContent>

          {/* ── TAB 2: Run Payroll ── */}
          <TabsContent value="run" className="mt-0">
            <RunPayrollTab employees={employees} runs={runs} currentUserId={currentUser?.id ?? ''} />
          </TabsContent>

          {/* ── TAB 3: History & Payslips ── */}
          <TabsContent value="history" className="mt-0">
            <PayslipsTab runs={runs} loading={loadingRuns} employees={employees} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Salary Setup
// ══════════════════════════════════════════════════════════════════════════════
function SalarySetupTab({ employees, loading }: { employees: EmployeeRow[]; loading: boolean }) {
  const [search, setSearch] = useState('');
  const [editEmp, setEditEmp] = useState<EmployeeRow | null>(null);
  const [filterCfg, setFilterCfg] = useState<'all' | 'configured' | 'missing'>('all');

  const filtered = useMemo(() => {
    let list = employees;
    if (search) list = list.filter(e => (e.full_name ?? '').toLowerCase().includes(search.toLowerCase()));
    if (filterCfg === 'configured') list = list.filter(e => e.salary_config);
    if (filterCfg === 'missing')    list = list.filter(e => !e.salary_config);
    return list;
  }, [employees, search, filterCfg]);

  const configured = employees.filter(e => e.salary_config).length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-indigo-50 dark:bg-indigo-950/30 border-0">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Employees</p>
            <p className="text-2xl font-bold">{employees.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 dark:bg-emerald-950/30 border-0">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Salary Configured</p>
            <p className="text-2xl font-bold text-emerald-600">{configured}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 dark:bg-amber-950/30 border-0">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Missing Config</p>
            <p className="text-2xl font-bold text-amber-600">{employees.length - configured}</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder="Search employees…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 text-sm flex-1 min-w-[180px]" />
        <Select value={filterCfg} onValueChange={(v: any) => setFilterCfg(v)}>
          <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            <SelectItem value="configured">Configured only</SelectItem>
            <SelectItem value="missing">Missing salary</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Employee table */}
      <Card>
        <CardContent className="pt-4">
          {loading ? <Loader /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Employee</th>
                    <th className="pb-2 font-medium">Department</th>
                    <th className="pb-2 font-medium">Base Salary</th>
                    <th className="pb-2 font-medium">Gross</th>
                    <th className="pb-2 font-medium">Net</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(emp => {
                    const calc = emp.salary_config ? computePayroll(emp.salary_config) : null;
                    return (
                      <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 pr-3">
                          <p className="font-medium">{emp.full_name ?? '—'}</p>
                          <p className="text-[11px] text-muted-foreground capitalize">{emp.role ?? '—'}</p>
                        </td>
                        <td className="py-2.5 pr-3 text-sm text-muted-foreground">{emp.department_name ?? '—'}</td>
                        <td className="py-2.5 pr-3 font-semibold">
                          {calc ? fmt(calc.base, emp.salary_config!.currency) : <span className="text-muted-foreground/40 text-xs">—</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-emerald-600 font-semibold">
                          {calc ? fmt(calc.gross, emp.salary_config!.currency) : <span className="text-muted-foreground/40 text-xs">—</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-blue-600 font-bold">
                          {calc ? fmt(calc.net, emp.salary_config!.currency) : <span className="text-muted-foreground/40 text-xs">—</span>}
                        </td>
                        <td className="py-2.5 pr-3">
                          {emp.salary_config
                            ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Configured</Badge>
                            : <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Not set</Badge>
                          }
                        </td>
                        <td className="py-2.5">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditEmp(emp)}>
                            <Edit3 className="h-3 w-3" />{emp.salary_config ? 'Edit' : 'Set up'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No employees found.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {editEmp && <SalaryEditDialog emp={editEmp} onClose={() => setEditEmp(null)} />}
    </div>
  );
}

// ── Salary Edit Dialog ────────────────────────────────────────────────────────
function SalaryEditDialog({ emp, onClose }: { emp: EmployeeRow; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const existing = emp.salary_config;

  const [baseSalary, setBaseSalary] = useState(String(existing?.base_salary ?? ''));
  const [currency, setCurrency] = useState(existing?.currency ?? 'SDG');
  const [allowances, setAllowances] = useState<LineItem[]>(existing?.allowances ?? []);
  const [deductions, setDeductions] = useState<LineItem[]>(existing?.deductions ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const base = parseFloat(baseSalary) || 0;
  const preview = computePayroll({ base_salary: base, currency, allowances, deductions } as SalaryConfig);

  const addLine = (list: LineItem[], setList: (l: LineItem[]) => void) =>
    setList([...list, { name: '', amount: 0, type: 'fixed' }]);

  const updateLine = (list: LineItem[], setList: (l: LineItem[]) => void, idx: number, field: keyof LineItem, value: any) => {
    const next = list.map((item, i) => i === idx ? { ...item, [field]: value } : item);
    setList(next);
  };

  const removeLine = (list: LineItem[], setList: (l: LineItem[]) => void, idx: number) =>
    setList(list.filter((_, i) => i !== idx));

  const save = async () => {
    if (!base || base <= 0) { toast({ title: 'Enter a valid base salary', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = {
      user_id: emp.id,
      base_salary: base,
      currency,
      allowances,
      deductions,
      notes: notes || null,
      effective_date: format(new Date(), 'yyyy-MM-dd'),
      updated_at: new Date().toISOString(),
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-indigo-500" />
            Salary Setup — {emp.full_name}
          </DialogTitle>
          <DialogDescription>{emp.role} · {emp.department_name ?? 'No department'}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Base salary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Base Salary</label>
              <Input type="number" value={baseSalary} onChange={e => setBaseSalary(e.target.value)} placeholder="0.00" className="text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Allowances */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />Allowances
              </label>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => addLine(allowances, setAllowances)}>
                <PlusCircle className="h-3 w-3" />Add
              </Button>
            </div>
            {allowances.length === 0 && <p className="text-xs text-muted-foreground italic">No allowances. Click Add to include housing, transport, etc.</p>}
            {allowances.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="Name (e.g. Housing)" value={a.name} onChange={e => updateLine(allowances, setAllowances, i, 'name', e.target.value)} className="text-xs h-8 flex-1" />
                <Input type="number" placeholder="Amount" value={a.amount || ''} onChange={e => updateLine(allowances, setAllowances, i, 'amount', parseFloat(e.target.value) || 0)} className="text-xs h-8 w-24" />
                <Select value={a.type} onValueChange={v => updateLine(allowances, setAllowances, i, 'type', v)}>
                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="percent">% of base</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => removeLine(allowances, setAllowances, i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Deductions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />Deductions
              </label>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => addLine(deductions, setDeductions)}>
                <PlusCircle className="h-3 w-3" />Add
              </Button>
            </div>
            {deductions.length === 0 && <p className="text-xs text-muted-foreground italic">No deductions. Click Add for tax, social security, etc.</p>}
            {deductions.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="Name (e.g. Income Tax)" value={d.name} onChange={e => updateLine(deductions, setDeductions, i, 'name', e.target.value)} className="text-xs h-8 flex-1" />
                <Input type="number" placeholder="Amount" value={d.amount || ''} onChange={e => updateLine(deductions, setDeductions, i, 'amount', parseFloat(e.target.value) || 0)} className="text-xs h-8 w-24" />
                <Select value={d.type} onValueChange={v => updateLine(deductions, setDeductions, i, 'type', v)}>
                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="percent">% of gross</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => removeLine(deductions, setDeductions, i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Live preview */}
          {base > 0 && (
            <div className="rounded-xl border bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/20 p-4 space-y-2">
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-3">Live Preview</p>
              <Row label="Base Salary" value={fmt(preview.base, currency)} />
              <Row label="+ Allowances" value={fmt(preview.allowTotal, currency)} color="text-emerald-600" />
              <Row label="= Gross Salary" value={fmt(preview.gross, currency)} bold />
              <Row label="− Deductions" value={fmt(preview.dedTotal, currency)} color="text-red-500" />
              <div className="border-t pt-2">
                <Row label="NET SALARY" value={fmt(preview.net, currency)} bold color="text-blue-600" />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Notes (optional)</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes about this salary package…" className="text-sm h-20" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [preview, setPreview] = useState<RunItem[]>([]);
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [existingRunId, setExistingRunId] = useState<string | null>(null);

  const periodStart = startOfMonth(subMonths(new Date(), -monthOffset));
  const periodEnd   = endOfMonth(subMonths(new Date(), -monthOffset));
  const periodLabel = format(periodStart, 'MMMM yyyy');

  const existingRun = runs.find(r => r.period_label === periodLabel);
  const isLocked    = existingRun?.status === 'locked';

  const configuredEmployees = employees.filter(e => e.salary_config);

  const computePreview = useCallback(async () => {
    if (configuredEmployees.length === 0) {
      toast({ title: 'No employees have salary configured yet.', variant: 'destructive' }); return;
    }
    setComputing(true);
    const items: RunItem[] = configuredEmployees.map(emp => {
      const cfg = emp.salary_config!;
      const calc = computePayroll(cfg);
      return {
        id: crypto.randomUUID(),
        run_id: '',
        user_id: emp.id,
        user_name: emp.full_name ?? '—',
        department_name: emp.department_name ?? '—',
        base_salary: calc.base,
        allowances_total: calc.allowTotal,
        gross_salary: calc.gross,
        deductions_total: calc.dedTotal,
        net_salary: calc.net,
        task_rewards: 0,
        retainer_amount: 0,
        currency: cfg.currency,
        allowances_snapshot: cfg.allowances,
        deductions_snapshot: cfg.deductions,
      };
    });
    setPreview(items);
    setComputing(false);
  }, [configuredEmployees, toast]);

  const saveRun = async (lockIt = false) => {
    if (preview.length === 0) { toast({ title: 'Compute the preview first', variant: 'destructive' }); return; }
    lockIt ? setLocking(true) : setSaving(true);
    try {
      let runId = existingRunId ?? existingRun?.id;
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
        runId = data.id;
        setExistingRunId(runId);
      } else if (lockIt) {
        await supabase.from('payroll_runs').update({ status: 'locked', locked_at: new Date().toISOString() }).eq('id', runId);
      }
      await supabase.from('payroll_run_items').delete().eq('run_id', runId);
      const items = preview.map(item => ({
        run_id: runId,
        user_id: item.user_id,
        user_name: item.user_name,
        department_name: item.department_name,
        base_salary: item.base_salary,
        allowances_total: item.allowances_total,
        gross_salary: item.gross_salary,
        deductions_total: item.deductions_total,
        net_salary: item.net_salary,
        task_rewards: item.task_rewards,
        retainer_amount: item.retainer_amount,
        currency: item.currency,
        allowances_snapshot: item.allowances_snapshot,
        deductions_snapshot: item.deductions_snapshot,
      }));
      await supabase.from('payroll_run_items').insert(items);
      toast({ title: lockIt ? `Payroll for ${periodLabel} locked!` : `Payroll run saved as draft` });
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
    } catch (err: any) {
      toast({ title: 'Error saving run', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); setLocking(false); }
  };

  const totals = useMemo(() => preview.reduce(
    (s, r) => ({ gross: s.gross + r.gross_salary, ded: s.ded + r.deductions_total, net: s.net + r.net_salary }),
    { gross: 0, ded: 0, net: 0 }
  ), [preview]);

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-indigo-500" />Select Payroll Period
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => { setMonthOffset(o => o - 1); setPreview([]); }}>←</Button>
            <span className="text-base font-bold min-w-[140px] text-center">{periodLabel}</span>
            <Button variant="outline" size="sm" onClick={() => { setMonthOffset(o => o + 1); setPreview([]); }} disabled={monthOffset >= 0}>→</Button>
            {monthOffset !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => { setMonthOffset(0); setPreview([]); }}>Current month</Button>
            )}
            {existingRun && (
              <Badge className={cn('ml-2 text-xs', isLocked ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200')}>
                {isLocked ? '🔒 Locked' : '📝 Draft exists'}
              </Badge>
            )}
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <div className="text-xs text-muted-foreground">
              {configuredEmployees.length} / {employees.length} employees have salary configured
            </div>
            <div className="ml-auto flex gap-2">
              <Button onClick={computePreview} disabled={computing || isLocked} className="gap-1.5 h-9">
                {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Compute Preview
              </Button>
              {preview.length > 0 && !isLocked && (
                <>
                  <Button variant="outline" onClick={() => saveRun(false)} disabled={saving} className="gap-1.5 h-9">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Draft
                  </Button>
                  <Button onClick={() => saveRun(true)} disabled={locking} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 h-9">
                    {locking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    Lock &amp; Finalize
                  </Button>
                </>
              )}
            </div>
          </div>

          {isLocked && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              This payroll is locked. Go to Payslips &amp; History to download individual payslips.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview table */}
      {preview.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Payroll Preview — {periodLabel}</CardTitle>
            <CardDescription className="text-xs">{preview.length} employees · review before locking</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground text-left">
                    <th className="pb-2 font-medium">Employee</th>
                    <th className="pb-2 font-medium text-right">Base</th>
                    <th className="pb-2 font-medium text-right">Allowances</th>
                    <th className="pb-2 font-medium text-right text-emerald-600">Gross</th>
                    <th className="pb-2 font-medium text-right text-red-500">Deductions</th>
                    <th className="pb-2 font-medium text-right text-blue-600">Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map(row => (
                    <tr key={row.user_id} className="border-b last:border-0 hover:bg-muted/10">
                      <td className="py-2 pr-3">
                        <p className="font-medium">{row.user_name}</p>
                        <p className="text-[11px] text-muted-foreground">{row.department_name}</p>
                      </td>
                      <td className="py-2 pr-3 text-right">{fmt(row.base_salary, row.currency)}</td>
                      <td className="py-2 pr-3 text-right text-emerald-600">+{fmt(row.allowances_total, row.currency)}</td>
                      <td className="py-2 pr-3 text-right font-semibold text-emerald-600">{fmt(row.gross_salary, row.currency)}</td>
                      <td className="py-2 pr-3 text-right text-red-500">-{fmt(row.deductions_total, row.currency)}</td>
                      <td className="py-2 text-right font-bold text-blue-600">{fmt(row.net_salary, row.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 text-sm font-bold">
                    <td className="pt-2">Totals</td>
                    <td colSpan={2} />
                    <td className="pt-2 text-right text-emerald-600">{fmt(totals.gross)}</td>
                    <td className="pt-2 text-right text-red-500">-{fmt(totals.ded)}</td>
                    <td className="pt-2 text-right text-blue-600">{fmt(totals.net)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {preview.length === 0 && !computing && (
        <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
          <PlayCircle className="h-10 w-10 opacity-20" />
          <p className="text-sm">Select a period and click <strong>Compute Preview</strong> to see the payroll breakdown.</p>
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
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [runItems, setRunItems] = useState<RunItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const loadItems = async (run: PayrollRun) => {
    setSelectedRun(run);
    setLoadingItems(true);
    const { data } = await supabase.from('payroll_run_items').select('*').eq('run_id', run.id);
    setRunItems((data ?? []).map((d: any) => ({
      ...d,
      allowances_snapshot: Array.isArray(d.allowances_snapshot) ? d.allowances_snapshot : [],
      deductions_snapshot: Array.isArray(d.deductions_snapshot) ? d.deductions_snapshot : [],
    })));
    setLoadingItems(false);
  };

  const empMap = useMemo(() => {
    const m: Record<string, EmployeeRow> = {};
    employees.forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  const downloadPDF = (item: RunItem) => {
    if (!selectedRun) return;
    const emp = empMap[item.user_id] ?? {
      id: item.user_id, full_name: item.user_name, role: null,
      department_name: item.department_name, department_id: null, email: null, salary_config: null,
    };
    generatePayslipPDF(emp, selectedRun, item);
  };

  const { toast } = useToast();

  const downloadAllPDFs = () => {
    if (runItems.length === 0) return;
    runItems.forEach(item => downloadPDF(item));
    toast({ title: `Generating ${runItems.length} payslips…` });
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-4">
      {runs.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <ReceiptText className="h-10 w-10 opacity-20 mx-auto mb-3" />
          <p className="text-sm">No payroll runs yet. Go to <strong>Run Payroll</strong> to create the first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Run list */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Payroll Runs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-3">
              {runs.map(run => (
                <button
                  key={run.id}
                  onClick={() => loadItems(run)}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border transition-all hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20',
                    selectedRun?.id === run.id ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' : 'border-transparent'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{run.period_label}</span>
                    <Badge className={cn('text-[10px]', run.status === 'locked' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                      {run.status === 'locked' ? '🔒 Locked' : '📝 Draft'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{format(parseISO(run.created_at), 'dd MMM yyyy')}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Payslips panel */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  {selectedRun ? `${selectedRun.period_label} — Individual Payslips` : 'Select a payroll run'}
                </CardTitle>
                {selectedRun && runItems.length > 0 && (
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={downloadAllPDFs}>
                    <Download className="h-3.5 w-3.5" />All PDFs
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedRun && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <FileText className="h-8 w-8 opacity-20 mx-auto mb-2" />
                  Click a payroll run on the left to see payslips.
                </div>
              )}
              {selectedRun && loadingItems && <Loader />}
              {selectedRun && !loadingItems && runItems.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No items in this run.</p>
              )}
              {selectedRun && !loadingItems && runItems.length > 0 && (
                <div className="space-y-2">
                  {/* Summary row */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { label: 'Total Gross', v: runItems.reduce((s, r) => s + r.gross_salary, 0), color: 'text-emerald-600' },
                      { label: 'Total Deductions', v: runItems.reduce((s, r) => s + r.deductions_total, 0), color: 'text-red-500' },
                      { label: 'Total Net Pay', v: runItems.reduce((s, r) => s + r.net_salary, 0), color: 'text-blue-600' },
                    ].map(s => (
                      <div key={s.label} className="text-center p-2 rounded-lg bg-muted/30">
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        <p className={cn('text-sm font-bold', s.color)}>{fmt(s.v)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Per-employee payslip cards */}
                  {runItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border hover:border-indigo-200 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 transition-all">
                      <div>
                        <p className="text-sm font-semibold">{item.user_name}</p>
                        <p className="text-[11px] text-muted-foreground">{item.department_name}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] text-muted-foreground">Gross: <span className="font-medium text-emerald-600">{fmt(item.gross_salary, item.currency)}</span></span>
                          <span className="text-[11px] text-muted-foreground">Ded: <span className="font-medium text-red-500">-{fmt(item.deductions_total, item.currency)}</span></span>
                          <span className="text-[11px] font-bold text-blue-600">Net: {fmt(item.net_salary, item.currency)}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs ml-3 shrink-0" onClick={() => downloadPDF(item)}>
                        <Download className="h-3.5 w-3.5" />PDF
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={cn('text-muted-foreground', bold && 'font-semibold text-foreground')}>{label}</span>
      <span className={cn('font-medium', bold && 'font-bold', color)}>{value}</span>
    </div>
  );
}

function Loader() {
  return (
    <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin opacity-30" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}
