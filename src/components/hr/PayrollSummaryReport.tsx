import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Download, FileText, Printer, CheckCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function computeGross(sc: any): number {
  let g = Number(sc.base_salary) || 0;
  (sc.allowances ?? []).forEach((a: any) => {
    g += a.type === 'percent' ? (Number(sc.base_salary) || 0) * (Number(a.amount) || 0) / 100 : (Number(a.amount) || 0);
  });
  return g;
}
function computeDeductions(sc: any): number {
  let d = 0;
  (sc.deductions ?? []).forEach((a: any) => {
    d += a.type === 'percent' ? (Number(sc.base_salary) || 0) * (Number(a.amount) || 0) / 100 : (Number(a.amount) || 0);
  });
  return d;
}
function fmtN(n: number) { return Math.round(n).toLocaleString(); }

export default function PayrollSummaryReport() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year,  setYear]  = useState(today.getFullYear());
  const [approved, setApproved] = useState(false);
  const [approverName, setApproverName] = useState('');
  const { toast } = useToast();

  const { data: employees = [], isLoading: loadingEmp } = useQuery({
    queryKey: ['payroll-report-employees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role, department_id, contract_type, employee_id')
        .eq('is_employee', true)
        .order('full_name');
      return data ?? [];
    },
    staleTime: 120_000,
  });

  const { data: salaryConfigs = [], isLoading: loadingSC } = useQuery({
    queryKey: ['payroll-report-salary-configs'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('employee_salary_config').select('user_id, base_salary, currency, allowances, deductions');
      return data ?? [];
    },
    staleTime: 120_000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['hr-depts'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id,name');
      return data ?? [];
    },
    staleTime: 300_000,
  });

  const isLoading = loadingEmp || loadingSC;

  const deptMap = useMemo(() => {
    const m: Record<string, string> = {};
    departments.forEach((d: any) => { m[d.id] = d.name; });
    return m;
  }, [departments]);

  const scMap = useMemo(() => {
    const m: Record<string, any> = {};
    salaryConfigs.forEach((s: any) => { m[s.user_id] = s; });
    return m;
  }, [salaryConfigs]);

  const rows = useMemo(() => employees
    .filter((e: any) => !e.contract_type || e.contract_type === 'salary' || e.contract_type === 'both')
    .map((e: any) => {
      const sc = scMap[e.id];
      const gross      = sc ? computeGross(sc)      : 0;
      const deductions = sc ? computeDeductions(sc) : 0;
      const net        = gross - deductions;
      return { ...e, sc, gross, deductions, net, dept: deptMap[e.department_id ?? ''] ?? 'Unassigned' };
    })
    .sort((a: any, b: any) => a.dept.localeCompare(b.dept) || a.full_name.localeCompare(b.full_name)),
  [employees, scMap, deptMap]);

  const deptTotals = useMemo(() => {
    const m: Record<string, { gross: number; deductions: number; net: number; count: number }> = {};
    rows.forEach((r: any) => {
      if (!m[r.dept]) m[r.dept] = { gross: 0, deductions: 0, net: 0, count: 0 };
      m[r.dept].gross      += r.gross;
      m[r.dept].deductions += r.deductions;
      m[r.dept].net        += r.net;
      m[r.dept].count++;
    });
    return m;
  }, [rows]);

  const grandTotal = useMemo(() => rows.reduce((a: any, r: any) => ({
    gross: a.gross + r.gross, deductions: a.deductions + r.deductions, net: a.net + r.net,
  }), { gross: 0, deductions: 0, net: 0 }), [rows]);

  const currency = salaryConfigs[0]?.currency ?? 'SDG';

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const periodLabel = `${MONTHS[month]} ${year}`;

    // Header
    doc.setFillColor(15, 32, 65);
    doc.rect(0, 0, pageW, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('PACT Command Center — Payroll Summary', 14, 10);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${periodLabel}   |   Generated: ${new Date().toLocaleDateString('en-GB')}`, 14, 17);
    doc.setTextColor(0, 0, 0);

    // Grand total row
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`Total Payroll: ${currency} ${fmtN(grandTotal.net)}  (Gross: ${fmtN(grandTotal.gross)}  Deductions: ${fmtN(grandTotal.deductions)})`, 14, 30);

    // Table
    const tableRows = rows.map((r: any) => [
      r.employee_id ?? '—',
      r.full_name,
      r.dept,
      r.role ?? '—',
      r.sc ? `${currency} ${fmtN(r.sc.base_salary)}` : '—',
      r.sc ? `${currency} ${fmtN(r.gross)}` : '—',
      r.sc ? `${currency} ${fmtN(r.deductions)}` : '—',
      r.sc ? `${currency} ${fmtN(r.net)}` : 'Not configured',
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['Emp ID', 'Name', 'Department', 'Role', 'Base Salary', 'Gross', 'Deductions', 'Net Pay']],
      body: tableRows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 32, 65], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right', fontStyle: 'bold' } },
    });

    // Dept summary
    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('Department Summary', 14, finalY);
    autoTable(doc, {
      startY: finalY + 3,
      head: [['Department', 'Staff Count', `Gross (${currency})`, `Deductions (${currency})`, `Net (${currency})`]],
      body: Object.entries(deptTotals).map(([dept, t]) => [dept, t.count, fmtN(t.gross), fmtN(t.deductions), fmtN(t.net)]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [29, 52, 97], textColor: 255 },
    });

    // Signature block
    const sigY = (doc as any).lastAutoTable.finalY + 14;
    if (sigY < doc.internal.pageSize.getHeight() - 30) {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text('Approved by:', 14, sigY);
      doc.text(approverName || '________________________________', 14, sigY + 6);
      doc.line(14, sigY + 10, 90, sigY + 10);
      doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 14, sigY + 16);
      doc.text('Signature', 14, sigY + 22);
      doc.setFont('helvetica', 'italic');
      doc.text('This document is system-generated from PACT Command Center.', pageW - 14, sigY + 22, { align: 'right' });
    }

    doc.save(`Payroll_${periodLabel.replace(' ', '_')}.pdf`);
    toast({ title: 'PDF exported', description: `Payroll summary for ${periodLabel}` });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Controls */}
      <Card>
        <CardContent className="pt-4 pb-4 px-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Period:</span>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="text-sm border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="text-sm border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <input value={approverName} onChange={e => setApproverName(e.target.value)}
                placeholder="Approver name…"
                className="text-xs border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring w-44" />
              <Button size="sm" variant="outline" className={cn('text-xs h-8', approved ? 'text-green-700 border-green-400 bg-green-50' : '')}
                onClick={() => setApproved(a => !a)}>
                <CheckCircle className={cn('h-3.5 w-3.5 mr-1', approved ? 'text-green-600' : '')} />
                {approved ? 'Approved ✓' : 'Mark Approved'}
              </Button>
              <Button size="sm" className="text-xs h-8 bg-[#0F2041] hover:bg-[#1D3461] text-white" onClick={exportPDF} disabled={isLoading}>
                <Download className="h-3.5 w-3.5 mr-1" />Export PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grand total */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Gross',      value: grandTotal.gross,      color: 'text-blue-700 dark:text-blue-300',   accent: 'bg-blue-500'  },
          { label: 'Total Deductions', value: grandTotal.deductions,  color: 'text-red-600 dark:text-red-400',     accent: 'bg-red-500'   },
          { label: 'Total Net Pay',    value: grandTotal.net,         color: 'text-emerald-700 dark:text-emerald-300', accent: 'bg-emerald-500' },
        ].map(k => (
          <Card key={k.label} className="overflow-hidden">
            <div className={`h-1 ${k.accent}`} />
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-xl font-bold ${k.color}`}>{isLoading ? '—' : `${currency} ${fmtN(k.value)}`}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Department summary */}
      {!isLoading && Object.keys(deptTotals).length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Department Totals</p>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="space-y-2">
              {Object.entries(deptTotals).map(([dept, t]) => (
                <div key={dept} className="flex items-center gap-4 rounded-xl border px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{dept}</p>
                    <p className="text-xs text-muted-foreground">{t.count} staff · Gross: {currency} {fmtN(t.gross)} · Deductions: {fmtN(t.deductions)}</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 shrink-0">{currency} {fmtN(t.net)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full employee table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Individual Payroll — {MONTHS[month]} {year}</p>
          {approved && <span className="text-xs font-bold text-green-700 bg-green-100 dark:bg-green-900/40 px-3 py-1 rounded-full">✓ Approved{approverName ? ` by ${approverName}` : ''}</span>}
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Building report…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#0F2041] text-white">
                    {['Emp ID','Name','Department','Role','Base','Gross','Deductions','Net Pay'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap first:pl-5 last:pr-5 last:text-right">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r: any, i: number) => (
                    <tr key={r.id} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                      <td className="px-4 py-2 pl-5 font-mono text-muted-foreground">{r.employee_id ?? '—'}</td>
                      <td className="px-4 py-2 font-medium">{r.full_name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.dept}</td>
                      <td className="px-4 py-2 text-muted-foreground truncate max-w-[120px]">{r.role ?? '—'}</td>
                      <td className="px-4 py-2">{r.sc ? `${fmtN(r.sc.base_salary)}` : <span className="text-amber-600">—</span>}</td>
                      <td className="px-4 py-2 text-blue-700 dark:text-blue-400">{r.sc ? fmtN(r.gross) : '—'}</td>
                      <td className="px-4 py-2 text-red-600">{r.sc ? fmtN(r.deductions) : '—'}</td>
                      <td className="px-4 py-2 pr-5 text-right font-bold text-emerald-700 dark:text-emerald-400">
                        {r.sc ? `${currency} ${fmtN(r.net)}` : <span className="text-amber-600 font-normal text-[10px]">No config</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#0F2041]/8 dark:bg-[#0F2041]/40 border-t-2 border-[#0F2041]/30">
                    <td colSpan={5} className="px-4 py-3 pl-5 font-bold text-sm">TOTAL — {rows.length} employees</td>
                    <td className="px-4 py-3 font-bold text-blue-700 dark:text-blue-400">{fmtN(grandTotal.gross)}</td>
                    <td className="px-4 py-3 font-bold text-red-600">{fmtN(grandTotal.deductions)}</td>
                    <td className="px-4 py-3 pr-5 text-right font-bold text-emerald-700 dark:text-emerald-400">{currency} {fmtN(grandTotal.net)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
