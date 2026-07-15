import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, Shield, FileText, TrendingUp } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { format, subMonths, startOfMonth } from 'date-fns';

interface PayrollItem {
  user_id: string;
  user_name: string;
  department_name: string;
  base_salary: number;
  gross_salary: number;
  currency: string;
}

interface PayrollRun {
  id: string;
  period_label: string;
  period_start: string;
  status: string;
}

// Sudan statutory rates (mirroring computeStatutoryDeductions in PayrollAdmin)
function computeStatutory(gross: number) {
  // Progressive PIT
  let pit = 0;
  const brackets = [
    { min: 0, max: 7500, rate: 0 },
    { min: 7500, max: 30000, rate: 0.05 },
    { min: 30000, max: 100000, rate: 0.10 },
    { min: 100000, max: Infinity, rate: 0.15 },
  ];
  for (const b of brackets) {
    if (gross > b.min) {
      pit += (Math.min(gross, b.max) - b.min) * b.rate;
    }
  }
  const socialEmployee = gross * 0.08;
  const socialEmployer = gross * 0.17;
  return {
    pit: Math.round(pit * 100) / 100,
    socialEmployee: Math.round(socialEmployee * 100) / 100,
    socialEmployer: Math.round(socialEmployer * 100) / 100,
    totalEmployee: Math.round((pit + socialEmployee) * 100) / 100,
    totalEmployer: Math.round(socialEmployer * 100) / 100,
  };
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card className="overflow-hidden">
      <div className={`h-1 ${color}`} />
      <CardContent className="pt-3 pb-3 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-[#0F2041] dark:text-white">{value}</p>
      </CardContent>
    </Card>
  );
}

type TabId = 'social-insurance' | 'tax-withholding';

export default function ComplianceReports() {
  const [activeTab, setActiveTab] = useState<TabId>('social-insurance');
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  const { data: runs = [], isLoading: runsLoading } = useQuery<PayrollRun[]>({
    queryKey: ['compliance-payroll-runs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('payroll_runs')
        .select('id, period_label, period_start, status')
        .order('period_start', { ascending: false })
        .limit(24);
      return (data ?? []) as PayrollRun[];
    },
    staleTime: 60_000,
  });

  // Auto-select most recent approved run
  const resolvedRunId = selectedRunId || runs.find(r => r.status === 'approved')?.id || runs[0]?.id || '';
  const selectedRun   = runs.find(r => r.id === resolvedRunId);

  const { data: runItems = [], isLoading: itemsLoading } = useQuery<PayrollItem[]>({
    queryKey: ['compliance-run-items', resolvedRunId],
    queryFn: async () => {
      if (!resolvedRunId) return [];
      const { data } = await supabase
        .from('payroll_run_items')
        .select('user_id, user_name, department_name, base_salary, gross_salary, currency')
        .eq('run_id', resolvedRunId);
      return (data ?? []) as PayrollItem[];
    },
    enabled: !!resolvedRunId,
    staleTime: 60_000,
  });

  const report = useMemo(() => {
    return runItems.map(item => {
      const gross = Number(item.gross_salary) || Number(item.base_salary) || 0;
      const stat  = computeStatutory(gross);
      return { ...item, gross, ...stat };
    });
  }, [runItems]);

  const totals = useMemo(() => ({
    grossTotal:        report.reduce((s, r) => s + r.gross, 0),
    pitTotal:          report.reduce((s, r) => s + r.pit, 0),
    socialEmpTotal:    report.reduce((s, r) => s + r.socialEmployee, 0),
    socialErTotal:     report.reduce((s, r) => s + r.socialEmployer, 0),
    totalEmpDed:       report.reduce((s, r) => s + r.totalEmployee, 0),
    totalErCost:       report.reduce((s, r) => s + r.totalEmployer, 0),
  }), [report]);

  const isLoading = runsLoading || itemsLoading;

  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const currency = runItems[0]?.currency ?? 'SDG';

  const exportSocialInsurance = () => {
    const rows = report.map(r => ({
      'Employee': r.user_name,
      'Department': r.department_name,
      'Gross Salary': r.gross,
      'Employee Contribution (8%)': r.socialEmployee,
      'Employer Contribution (17%)': r.socialEmployer,
      'Total NPF': r.socialEmployee + r.socialEmployer,
      'Currency': r.currency,
      'Period': selectedRun?.period_label ?? '',
    }));
    exportToExcel(rows, 'Social Insurance Report', `social-insurance-${selectedRun?.period_label ?? 'report'}.xlsx`);
  };

  const exportTaxWithholding = () => {
    const rows = report.map(r => ({
      'Employee': r.user_name,
      'Department': r.department_name,
      'Gross Salary': r.gross,
      'PIT Withheld': r.pit,
      'Social (Employee)': r.socialEmployee,
      'Total Deductions': r.totalEmployee,
      'Effective Tax Rate': r.gross > 0 ? (Math.round((r.pit / r.gross) * 10000) / 100) + '%' : '0%',
      'Currency': r.currency,
      'Period': selectedRun?.period_label ?? '',
    }));
    exportToExcel(rows, 'Tax Withholding Report', `tax-withholding-${selectedRun?.period_label ?? 'report'}.xlsx`);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-[#0F2041] dark:text-white">Statutory Compliance Reports</h2>
          <p className="text-sm text-muted-foreground">Sudan NPF Social Insurance · Personal Income Tax Withholding</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={resolvedRunId} onValueChange={setSelectedRunId}>
            <SelectTrigger className="h-9 text-sm w-48">
              <SelectValue placeholder="Select period…" />
            </SelectTrigger>
            <SelectContent>
              {runs.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  {r.period_label}
                  {r.status === 'approved' && ' ✓'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
        {([
          { id: 'social-insurance' as TabId, label: 'Social Insurance (NPF)', icon: Shield },
          { id: 'tax-withholding'  as TabId, label: 'Tax Withholding (PIT)',  icon: FileText },
        ] as { id: TabId; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-white dark:bg-slate-900 text-[#0F2041] dark:text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin opacity-30" /></div>
      ) : !resolvedRunId ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <TrendingUp className="h-10 w-10 opacity-20" />
          <p className="text-sm">No payroll runs found. Run payroll first.</p>
        </div>
      ) : (
        <>
          {/* ── Social Insurance Tab ── */}
          {activeTab === 'social-insurance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KpiCard label="Total Gross" value={`${currency} ${fmt(totals.grossTotal)}`} color="bg-blue-500" />
                <KpiCard label="Employee NPF (8%)" value={`${currency} ${fmt(totals.socialEmpTotal)}`} color="bg-violet-500" />
                <KpiCard label="Employer NPF (17%)" value={`${currency} ${fmt(totals.socialErTotal)}`} color="bg-amber-500" />
                <KpiCard label="Total NPF Liability" value={`${currency} ${fmt(totals.socialEmpTotal + totals.socialErTotal)}`} color="bg-red-500" />
              </div>

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={exportSocialInsurance} className="gap-1.5 h-9 text-xs">
                  <Download className="h-3.5 w-3.5" />Export Excel
                </Button>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-border">
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Employee</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Department</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Gross</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Employee 8%</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Employer 17%</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Total NPF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.map(r => (
                      <tr key={r.user_id} className="border-b border-border last:border-0 hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                        <td className="px-4 py-3 font-medium">{r.user_name}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.department_name}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.gross)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-violet-700 dark:text-violet-300 font-medium">{fmt(r.socialEmployee)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-300 font-medium">{fmt(r.socialEmployer)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold">{fmt(r.socialEmployee + r.socialEmployer)}</td>
                      </tr>
                    ))}
                    {report.length > 0 && (
                      <tr className="bg-slate-50 dark:bg-slate-900 font-bold border-t-2 border-border">
                        <td className="px-4 py-3" colSpan={2}>Total ({report.length} employees)</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.grossTotal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-violet-700 dark:text-violet-300">{fmt(totals.socialEmpTotal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-300">{fmt(totals.socialErTotal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.socialEmpTotal + totals.socialErTotal)}</td>
                      </tr>
                    )}
                    {report.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No payroll data for this period</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tax Withholding Tab ── */}
          {activeTab === 'tax-withholding' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KpiCard label="Total Gross" value={`${currency} ${fmt(totals.grossTotal)}`} color="bg-blue-500" />
                <KpiCard label="Total PIT Withheld" value={`${currency} ${fmt(totals.pitTotal)}`} color="bg-red-500" />
                <KpiCard label="Social (Employee)" value={`${currency} ${fmt(totals.socialEmpTotal)}`} color="bg-violet-500" />
                <KpiCard label="Total Employee Ded." value={`${currency} ${fmt(totals.totalEmpDed)}`} color="bg-amber-500" />
              </div>

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={exportTaxWithholding} className="gap-1.5 h-9 text-xs">
                  <Download className="h-3.5 w-3.5" />Export Excel
                </Button>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-border">
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Employee</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Department</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Gross</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">PIT (Sudan)</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Social Ins.</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Total Ded.</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Eff. Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.map(r => {
                      const effRate = r.gross > 0 ? Math.round((r.pit / r.gross) * 10000) / 100 : 0;
                      return (
                        <tr key={r.user_id} className="border-b border-border last:border-0 hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                          <td className="px-4 py-3 font-medium">{r.user_name}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{r.department_name}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmt(r.gross)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-600 dark:text-red-400 font-medium">{fmt(r.pit)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-violet-600 dark:text-violet-400">{fmt(r.socialEmployee)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold">{fmt(r.totalEmployee)}</td>
                          <td className="px-4 py-3 text-right">
                            <Badge className={`text-xs ${effRate === 0 ? 'bg-gray-100 text-gray-600 dark:bg-gray-800' : effRate < 5 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40' : effRate < 10 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40'}`}>
                              {effRate}%
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                    {report.length > 0 && (
                      <tr className="bg-slate-50 dark:bg-slate-900 font-bold border-t-2 border-border">
                        <td className="px-4 py-3" colSpan={2}>Total ({report.length} employees)</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.grossTotal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-600 dark:text-red-400">{fmt(totals.pitTotal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-violet-600 dark:text-violet-400">{fmt(totals.socialEmpTotal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.totalEmpDed)}</td>
                        <td className="px-4 py-3 text-right">
                          <Badge className="text-xs bg-slate-200 dark:bg-slate-700 text-foreground">
                            {totals.grossTotal > 0 ? Math.round((totals.pitTotal / totals.grossTotal) * 10000) / 100 : 0}%
                          </Badge>
                        </td>
                      </tr>
                    )}
                    {report.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No payroll data for this period</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
