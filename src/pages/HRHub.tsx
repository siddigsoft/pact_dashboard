import { Suspense, lazy, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Banknote, FileText, Loader2, Settings2, Wrench, Plus, Minus, Calculator, GitBranch, Download, RefreshCw, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search, ExternalLink, Users, BarChart2, TableIcon, Filter } from 'lucide-react';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { useAuthorization } from '@/hooks/use-authorization';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import * as XLSX from 'xlsx';

const PayrollPanel      = lazy(() => import('./Payroll'));
const RetainerPanel     = lazy(() => import('./RetainerManagement'));
const PayrollAdminPanel = lazy(() => import('./PayrollAdmin'));

type HRTab = 'payroll' | 'retainer' | 'payroll-admin' | 'hr-tools';

const ALL_TABS: { id: HRTab; label: string; icon: typeof Banknote; accent: string; bg: string; adminOnly: boolean }[] = [
  { id: 'payroll',       label: 'My Payroll',      icon: Banknote,   accent: '#D97706', bg: 'rgba(217,119,6,0.12)',   adminOnly: false },
  { id: 'payroll-admin', label: 'Payroll Admin',    icon: Settings2,  accent: '#67e8f9', bg: 'rgba(103,232,249,0.12)', adminOnly: true  },
  { id: 'retainer',      label: 'Retainer',         icon: FileText,   accent: '#a78bfa', bg: 'rgba(167,139,250,0.12)', adminOnly: true  },
  { id: 'hr-tools',      label: 'HR Tools',         icon: Wrench,     accent: '#34d399', bg: 'rgba(52,211,153,0.12)', adminOnly: true  },
];

const ADMIN_ROLES = [
  'super_admin', 'superAdmin', 'SuperAdmin',
  'admin', 'Admin',
  'finance', 'Finance',
];

function PanelLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin opacity-30" />
      <span className="text-sm font-medium">Loading…</span>
    </div>
  );
}

export default function HRHub() {
  const [params, setParams] = useSearchParams();
  const { isSuperAdmin, hasAnyRole } = useAuthorization();

  const isAdmin = isSuperAdmin() || hasAnyRole(ADMIN_ROLES);

  // Tabs this user can see
  const visibleTabs = ALL_TABS.filter(t => !t.adminOnly || isAdmin);

  const requestedTab = params.get('tab') as HRTab | null;
  const tab: HRTab = (() => {
    const t = requestedTab ?? 'payroll';
    // If non-admin requests an admin-only tab, fall back to payroll
    const found = visibleTabs.find(vt => vt.id === t);
    return found ? t : 'payroll';
  })();

  const setTab = (t: HRTab) => setParams({ tab: t }, { replace: true });

  // Redirect if URL has an unauthorised tab
  useEffect(() => {
    if (requestedTab && tab !== requestedTab) setParams({ tab: 'payroll' }, { replace: true });
  }, [requestedTab, tab]);

  const activeTab = visibleTabs.find(t => t.id === tab) ?? visibleTabs[0];

  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-[#0d1117]">

      {/* ── Hero Header ───────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30"
        style={{ background: 'linear-gradient(135deg, #0F2041 0%, #1D3461 60%, #1e4080 100%)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">

          {/* Connected pages bar */}
          <div className="pt-3 pb-1 opacity-90">
            <ConnectedPagesBar exclude="hr" />
          </div>

          {/* Title row */}
          <div className="flex items-end justify-between pt-3 pb-1 gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: activeTab.bg }}>
                <activeTab.icon className="h-5 w-5" style={{ color: activeTab.accent }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white leading-tight tracking-tight">
                  {isAdmin ? 'HR & Finance' : 'My Payroll'}
                </h1>
                <p className="text-xs text-blue-200/80 font-medium">{activeTab.label}</p>
              </div>
            </div>
          </div>

          {/* Tab strip — only render if more than one tab is visible */}
          {visibleTabs.length > 1 && (
            <div className="flex gap-0 overflow-x-auto mt-2 scrollbar-hide -mb-px">
              {visibleTabs.map(t => {
                const Icon = t.icon;
                const isActive = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    data-testid={`hr-tab-${t.id}`}
                    className={cn(
                      'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap shrink-0 select-none',
                      isActive
                        ? 'border-white text-white'
                        : 'border-transparent text-blue-200/60 hover:text-blue-100 hover:border-blue-200/30'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="min-h-[calc(100vh-130px)]">
        {tab === 'payroll' && (
          <Suspense fallback={<PanelLoader />}>
            <PayrollPanel embedded />
          </Suspense>
        )}
        {tab === 'retainer' && isAdmin && (
          <Suspense fallback={<PanelLoader />}>
            <RetainerPanel />
          </Suspense>
        )}
        {tab === 'payroll-admin' && isAdmin && (
          <Suspense fallback={<PanelLoader />}>
            <PayrollAdminPanel />
          </Suspense>
        )}
        {tab === 'hr-tools' && isAdmin && <HRToolsPanel />}
      </div>
    </div>
  );
}

// ── HR Tools Panel ─────────────────────────────────────────────────────────────
interface OrgPerson { id: string; full_name: string | null; role: string | null; department_name: string | null; reports_to: string | null; }

function HRToolsPanel() {
  const [toolTab, setToolTab] = useState<'projection' | 'orgchart'>('projection');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-5">
      <div className="flex gap-2 flex-wrap">
        {([
          { id: 'projection', label: 'Staff Cost Projection', icon: <Calculator className="h-3.5 w-3.5" /> },
          { id: 'orgchart',   label: 'Org Chart',             icon: <GitBranch className="h-3.5 w-3.5" /> },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setToolTab(t.id)}
            className={cn('flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl font-medium transition-all border',
              toolTab === t.id ? 'bg-[#0F2041] text-white border-[#0F2041]' : 'bg-white dark:bg-slate-900 text-muted-foreground border-slate-200 hover:border-slate-300 hover:text-foreground')}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      {toolTab === 'projection' && <StaffCostProjection />}
      {toolTab === 'orgchart'   && <OrgChartView />}
    </div>
  );
}

// ── Staff Cost Projection ─────────────────────────────────────────────────────
interface ProjectionRow { id: string; role: string; headcount: number; baseSalary: number; allowancePct: number; deductionPct: number; currency: string; }

const CHART_COLORS = ['#0F2041','#1D3461','#4f86c6','#34d399','#f59e0b','#a78bfa','#f87171','#38bdf8','#fb923c'];

function StaffCostProjection() {
  const [scenarioName, setScenarioName] = useState('Scenario 1');
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [rows, setRows] = useState<ProjectionRow[]>([
    { id: crypto.randomUUID(), role: 'Field Coordinator', headcount: 5,  baseSalary: 50000, allowancePct: 20, deductionPct: 10, currency: 'SDG' },
    { id: crypto.randomUUID(), role: 'Data Collector',    headcount: 10, baseSalary: 30000, allowancePct: 10, deductionPct: 8,  currency: 'SDG' },
  ]);
  const [loadingReal, setLoadingReal] = useState(false);

  const updateRow = (id: string, field: keyof ProjectionRow, val: any) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: typeof r[field] === 'number' ? (parseFloat(val) || 0) : val } : r));
  const addRow    = () => setRows(prev => [...prev, { id: crypto.randomUUID(), role: 'New Role', headcount: 1, baseSalary: 30000, allowancePct: 10, deductionPct: 8, currency: 'SDG' }]);
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const loadFromReal = useCallback(async () => {
    setLoadingReal(true);
    try {
      const [{ data: configs }, { data: depts }] = await Promise.all([
        supabase.from('employee_salary_config').select('user_id, base_salary, allowances, deductions, currency'),
        supabase.from('departments').select('id, name'),
      ]);
      const { data: profs } = await supabase
        .from('profiles').select('id, full_name, role, department_id, employment_type');
      if (!configs || configs.length === 0) { setLoadingReal(false); return; }
      const deptMap: Record<string,string> = {};
      (depts ?? []).forEach((d: any) => { deptMap[d.id] = d.name; });
      const profMap: Record<string, any> = {};
      (profs ?? []).forEach((p: any) => { profMap[p.id] = p; });
      const roleGrouped: Record<string, { headcount: number; totalBase: number; allowPct: number; deductPct: number; currency: string }> = {};
      configs.forEach((c: any) => {
        const prof = profMap[c.user_id];
        const key = prof?.role ?? 'Unknown';
        const allow = Array.isArray(c.allowances) ? c.allowances.reduce((s: number, a: any) => s + (a.type === 'percent' ? a.value : 0), 0) : 0;
        const deduct = Array.isArray(c.deductions) ? c.deductions.reduce((s: number, d: any) => s + (d.type === 'percent' ? d.value : 0), 0) : 0;
        if (!roleGrouped[key]) roleGrouped[key] = { headcount: 0, totalBase: 0, allowPct: 0, deductPct: 0, currency: c.currency ?? 'SDG' };
        roleGrouped[key].headcount++;
        roleGrouped[key].totalBase += c.base_salary ?? 0;
        roleGrouped[key].allowPct  = allow;
        roleGrouped[key].deductPct = deduct;
      });
      const newRows: ProjectionRow[] = Object.entries(roleGrouped).map(([role, v]) => ({
        id: crypto.randomUUID(),
        role: role.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()),
        headcount: v.headcount,
        baseSalary: v.headcount > 0 ? Math.round(v.totalBase / v.headcount) : 0,
        allowancePct: v.allowPct,
        deductionPct: v.deductPct,
        currency: v.currency,
      }));
      if (newRows.length > 0) { setRows(newRows); setScenarioName('From Payroll Data'); }
    } finally { setLoadingReal(false); }
  }, []);

  const computed = useMemo(() => rows.map(r => {
    const gross = r.baseSalary * (1 + r.allowancePct / 100);
    const net   = gross * (1 - r.deductionPct / 100);
    return { ...r, grossPerHead: gross, netPerHead: net, monthlyGross: gross * r.headcount, monthlyNet: net * r.headcount };
  }), [rows]);

  const totals = useMemo(() => ({
    headcount:    computed.reduce((s, r) => s + r.headcount, 0),
    monthlyGross: computed.reduce((s, r) => s + r.monthlyGross, 0),
    monthlyNet:   computed.reduce((s, r) => s + r.monthlyNet, 0),
    annualNet:    computed.reduce((s, r) => s + r.monthlyNet * 12, 0),
  }), [computed]);

  const chartData = useMemo(() => computed.map((r, i) => ({
    name: r.role.length > 14 ? r.role.slice(0, 13) + '…' : r.role,
    fullName: r.role,
    gross: Math.round(r.monthlyGross),
    net: Math.round(r.monthlyNet),
    color: CHART_COLORS[i % CHART_COLORS.length],
  })), [computed]);

  const exportXLSX = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const data = [
      ['Role / Grade', 'Headcount', 'Base Salary', 'Allow %', 'Deduct %', 'Net / Head', 'Monthly Gross', 'Monthly Net', 'Annual Net', 'Currency'],
      ...computed.map(r => [r.role, r.headcount, r.baseSalary, r.allowancePct, r.deductionPct,
        Math.round(r.netPerHead), Math.round(r.monthlyGross), Math.round(r.monthlyNet), Math.round(r.monthlyNet * 12), r.currency]),
      [],
      ['TOTALS', totals.headcount, '', '', '', '',
        Math.round(totals.monthlyGross), Math.round(totals.monthlyNet), Math.round(totals.annualNet), ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, scenarioName.slice(0, 31));
    XLSX.writeFile(wb, `${scenarioName.replace(/\s+/g,'-')}-cost-projection.xlsx`);
  }, [computed, totals, scenarioName]);

  const fmtN = (n: number, cur = 'SDG') => `${cur} ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        <Calculator className="h-4 w-4 text-emerald-500 shrink-0" />
        <Input
          value={scenarioName}
          onChange={e => setScenarioName(e.target.value)}
          className="h-8 text-sm font-semibold border-0 bg-transparent p-0 w-40 focus-visible:ring-0 focus-visible:border-b focus-visible:border-slate-300"
          placeholder="Scenario name…"
        />
        <span className="text-xs text-muted-foreground flex-1 hidden sm:block">Estimate payroll costs by headcount and salary grade. Values are projections only.</span>
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={loadFromReal} disabled={loadingReal}>
            {loadingReal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Load from Payroll
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportXLSX}>
            <Download className="h-3.5 w-3.5" />Export Excel
          </Button>
          <div className="flex border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('table')} className={cn('h-8 px-2.5 text-xs flex items-center gap-1 transition-colors', viewMode === 'table' ? 'bg-[#0F2041] text-white' : 'bg-white dark:bg-slate-900 text-muted-foreground hover:bg-slate-50')}>
              <TableIcon className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode('chart')} className={cn('h-8 px-2.5 text-xs flex items-center gap-1 transition-colors', viewMode === 'chart' ? 'bg-[#0F2041] text-white' : 'bg-white dark:bg-slate-900 text-muted-foreground hover:bg-slate-50')}>
              <BarChart2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button size="sm" className="h-8 gap-1.5 bg-[#0F2041] hover:bg-[#1D3461] text-white text-xs" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" />Add Role
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Headcount',     value: String(totals.headcount),  sub: 'staff',            color: 'text-[#0F2041] dark:text-blue-300' },
          { label: 'Monthly Gross', value: fmtN(totals.monthlyGross), sub: 'estimated gross',   color: 'text-emerald-600' },
          { label: 'Monthly Net',   value: fmtN(totals.monthlyNet),   sub: 'after deductions', color: 'text-blue-600' },
          { label: 'Annual Net',    value: fmtN(totals.annualNet),    sub: '× 12 months',      color: 'text-violet-600' },
          { label: 'Avg Net / Head',value: totals.headcount > 0 ? fmtN(totals.monthlyNet / totals.headcount) : '—', sub: 'per employee / mo.', color: 'text-amber-600' },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-slate-900 border rounded-xl px-3 py-3 text-center shadow-sm">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</p>
            <p className={cn('text-sm font-bold mt-0.5 leading-tight', k.color)}>{k.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {viewMode === 'chart' ? (
        /* ── Bar chart view ── */
        <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Monthly Cost by Role (SDG)</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 24 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip
                formatter={(val: any, name: string) => [fmtN(val), name === 'gross' ? 'Monthly Gross' : 'Monthly Net']}
                labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.fullName ?? ''}
              />
              <Legend formatter={v => v === 'gross' ? 'Monthly Gross' : 'Monthly Net'} />
              <Bar dataKey="gross" name="gross" radius={[4,4,0,0]}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.7} />)}
              </Bar>
              <Bar dataKey="net" name="net" radius={[4,4,0,0]}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-muted-foreground text-center mt-1">Dark bar = net; light = gross. Click role rows in table view to edit values.</p>
        </Card>
      ) : (
        /* ── Table view ── */
        <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/40 border-b">
                  <th className="px-4 py-2.5 text-left   text-[11px] font-semibold uppercase text-muted-foreground">Role / Grade</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-muted-foreground">HC</th>
                  <th className="px-3 py-2.5 text-right  text-[11px] font-semibold uppercase text-muted-foreground">Base Salary</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-emerald-600">Allow %</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-red-500">Deduct %</th>
                  <th className="px-3 py-2.5 text-right  text-[11px] font-semibold uppercase text-slate-500">Net / Head</th>
                  <th className="px-3 py-2.5 text-right  text-[11px] font-semibold uppercase text-emerald-600">Mo. Gross</th>
                  <th className="px-3 py-2.5 text-right  text-[11px] font-semibold uppercase text-blue-600">Mo. Net</th>
                  <th className="px-3 py-2.5 text-right  text-[11px] font-semibold uppercase text-violet-600">Annual Net</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {computed.map((r, i) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 group">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <Input value={r.role} onChange={e => updateRow(r.id, 'role', e.target.value)}
                          className="h-7 text-xs border-0 bg-transparent p-0 focus-visible:ring-0 font-medium min-w-[100px]" />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Input type="number" value={r.headcount} onChange={e => updateRow(r.id, 'headcount', e.target.value)} className="h-7 text-xs w-14 text-center mx-auto" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <Select value={r.currency} onValueChange={v => updateRow(r.id, 'currency', v)}>
                          <SelectTrigger className="h-7 w-[58px] text-[11px] px-1.5"><SelectValue /></SelectTrigger>
                          <SelectContent>{['SDG','USD','EUR','GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input type="number" value={r.baseSalary} onChange={e => updateRow(r.id, 'baseSalary', e.target.value)} className="h-7 text-xs w-24 text-right" />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-0.5 justify-center">
                        <Input type="number" value={r.allowancePct} onChange={e => updateRow(r.id, 'allowancePct', e.target.value)} className="h-7 text-xs w-14 text-center" />
                        <span className="text-muted-foreground text-xs">%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-0.5 justify-center">
                        <Input type="number" value={r.deductionPct} onChange={e => updateRow(r.id, 'deductionPct', e.target.value)} className="h-7 text-xs w-14 text-center" />
                        <span className="text-muted-foreground text-xs">%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-slate-500">{fmtN(r.netPerHead)}</td>
                    <td className="px-3 py-2 text-right text-xs font-semibold text-emerald-600">{fmtN(r.monthlyGross)}</td>
                    <td className="px-3 py-2 text-right text-xs font-bold text-blue-600">{fmtN(r.monthlyNet)}</td>
                    <td className="px-3 py-2 text-right text-xs font-bold text-violet-600">{fmtN(r.monthlyNet * 12)}</td>
                    <td className="pr-3">
                      <button onClick={() => removeRow(r.id)} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-400 hover:text-red-600 transition-all">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/40 dark:to-slate-800/60 border-t-2 border-slate-300 dark:border-slate-600">
                  <td className="px-4 py-3 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">TOTALS</td>
                  <td className="px-3 py-3 text-center text-sm font-bold text-[#0F2041] dark:text-blue-300">{totals.headcount}</td>
                  <td colSpan={4} />
                  <td className="px-3 py-3 text-right text-xs font-bold text-emerald-700">{fmtN(totals.monthlyGross)}</td>
                  <td className="px-3 py-3 text-right text-xs font-bold text-blue-700">{fmtN(totals.monthlyNet)}</td>
                  <td className="px-3 py-3 text-right text-xs font-bold text-violet-700">{fmtN(totals.annualNet)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Projections only. Gross = base × (1 + allow%). Net = gross × (1 − deduct%). Annual = monthly net × 12.
      </p>
    </div>
  );
}

// ── Org Chart View ─────────────────────────────────────────────────────────────
interface OrgPersonExtended extends OrgPerson { employment_type: string | null; avatar_url: string | null; }

const ROLE_CHIP: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700', superAdmin: 'bg-red-100 text-red-700',
  admin: 'bg-orange-100 text-orange-700', Admin: 'bg-orange-100 text-orange-700',
  fom: 'bg-purple-100 text-purple-700', supervisor: 'bg-indigo-100 text-indigo-700',
  coordinator: 'bg-blue-100 text-blue-700', dataCollector: 'bg-slate-100 text-slate-600',
  financialAdmin: 'bg-amber-100 text-amber-700', projectManager: 'bg-teal-100 text-teal-700',
};
const roleChip = (role: string | null) => ROLE_CHIP[role ?? ''] ?? 'bg-slate-100 text-slate-600';
const fmtRole = (r: string | null) => (r ?? '—').replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());

const ORG_COLORS = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-amber-500','bg-pink-500','bg-cyan-500','bg-indigo-500','bg-rose-500'];
const colorForId = (id: string) => ORG_COLORS[id.charCodeAt(0) % ORG_COLORS.length];
const orgInitials = (name: string | null) => (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

interface OrgNodeProps {
  person: OrgPersonExtended;
  depth?: number;
  expandAll: boolean | null;
  childrenOf: Record<string, OrgPersonExtended[]>;
  navigate: (path: string) => void;
}

function OrgNode({ person, depth = 0, expandAll, childrenOf, navigate }: OrgNodeProps) {
  const [expanded, setExpanded] = useState(expandAll !== null ? expandAll : depth < 2);
  const prevExpAll = useRef(expandAll);

  useEffect(() => {
    if (expandAll !== null && expandAll !== prevExpAll.current) {
      setExpanded(expandAll);
      prevExpAll.current = expandAll;
    }
  }, [expandAll]);

  const children = childrenOf[person.id] ?? [];
  const hasChildren = children.length > 0;

  return (
    <div className={cn('relative', depth > 0 && 'ml-7 pl-4 border-l-2 border-slate-200 dark:border-slate-700')}>
      <div
        className={cn(
          'flex items-center gap-2.5 py-2 px-3 rounded-xl my-0.5 transition-all',
          'hover:bg-slate-50 dark:hover:bg-slate-800/30',
          depth === 0 && 'bg-white dark:bg-slate-900 shadow-sm border',
          hasChildren && 'cursor-pointer',
        )}
        onClick={() => hasChildren && setExpanded(v => !v)}
      >
        {person.avatar_url ? (
          <img src={person.avatar_url} className="w-8 h-8 rounded-full object-cover shrink-0" alt={person.full_name ?? ''} />
        ) : (
          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0', colorForId(person.id))}>
            {orgInitials(person.full_name)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold leading-tight truncate">{person.full_name ?? '—'}</p>
            {person.employment_type && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-emerald-300 text-emerald-700 dark:text-emerald-400 font-medium capitalize">
                {person.employment_type.replace(/-/g, ' ')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={cn('text-[10px] px-1.5 py-0 rounded-full font-medium', roleChip(person.role))}>
              {fmtRole(person.role)}
            </span>
            {person.department_name && (
              <span className="text-[10px] text-muted-foreground">· {person.department_name}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {hasChildren && (
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium">
              {children.length} {children.length === 1 ? 'report' : 'reports'}
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); navigate(`/users/${person.id}`); }}
            className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-400 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100"
            title="View profile"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
          {hasChildren && (
            <span className="text-slate-400">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
          )}
        </div>
      </div>
      {expanded && children.map(c => (
        <OrgNode key={c.id} person={c} depth={depth + 1} expandAll={expandAll} childrenOf={childrenOf} navigate={navigate} />
      ))}
    </div>
  );
}

function OrgChartView() {
  const navigate = useNavigate();
  const [searchQ, setSearchQ] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [expandAll, setExpandAll] = useState<boolean | null>(null);

  const { data: people = [], isLoading } = useQuery<OrgPersonExtended[]>({
    queryKey: ['org-chart-people-v2'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, department_id, reports_to, employment_type, avatar_url, departments(name)')
        .order('full_name');
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        role: p.role,
        department_name: p.departments?.name ?? null,
        reports_to: p.reports_to,
        employment_type: p.employment_type ?? null,
        avatar_url: p.avatar_url ?? null,
      })) as OrgPersonExtended[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const departments = useMemo(() => {
    const depts = new Set<string>();
    people.forEach(p => { if (p.department_name) depts.add(p.department_name); });
    return Array.from(depts).sort();
  }, [people]);

  const visiblePeople = useMemo(() => {
    let list = people;
    if (deptFilter !== 'all') list = list.filter(p => p.department_name === deptFilter);
    return list;
  }, [people, deptFilter]);

  const personMap = useMemo(() => {
    const m: Record<string, OrgPersonExtended> = {};
    people.forEach(p => { m[p.id] = p; });
    return m;
  }, [people]);

  const childrenOf = useMemo(() => {
    const m: Record<string, OrgPersonExtended[]> = {};
    visiblePeople.forEach(p => {
      const parent = p.reports_to ?? '__root__';
      if (!m[parent]) m[parent] = [];
      m[parent].push(p);
    });
    return m;
  }, [visiblePeople]);

  const roots = useMemo(() => visiblePeople.filter(p => !p.reports_to || !personMap[p.reports_to]), [visiblePeople, personMap]);

  const filteredPeople = useMemo(() => {
    if (!searchQ.trim()) return null;
    const q = searchQ.toLowerCase();
    return visiblePeople.filter(p =>
      (p.full_name ?? '').toLowerCase().includes(q) ||
      (p.department_name ?? '').toLowerCase().includes(q) ||
      (p.role ?? '').toLowerCase().includes(q));
  }, [visiblePeople, searchQ]);

  if (isLoading) return <div className="py-20 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin opacity-30" /></div>;

  const withManagerCount = visiblePeople.filter(p => p.reports_to && personMap[p.reports_to]).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <GitBranch className="h-4 w-4 text-blue-500 shrink-0" />
        <h2 className="text-sm font-semibold">Org Chart</h2>
        <div className="flex gap-3 text-xs text-muted-foreground ml-1">
          <span><strong className="text-foreground">{visiblePeople.length}</strong> staff</span>
          <span><strong className="text-foreground">{withManagerCount}</strong> with manager</span>
          <span><strong className="text-foreground">{roots.length}</strong> root nodes</span>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Department filter */}
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs bg-white dark:bg-slate-900">
              <Filter className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search staff…"
              className="h-8 pl-8 text-xs bg-white dark:bg-slate-900 w-44" />
          </div>
          {/* Expand/Collapse all */}
          <div className="flex border rounded-lg overflow-hidden">
            <button onClick={() => setExpandAll(true)}  title="Expand all"
              className="h-8 px-2.5 text-xs flex items-center gap-1 bg-white dark:bg-slate-900 text-muted-foreground hover:bg-slate-50 hover:text-foreground transition-colors border-r">
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setExpandAll(false)} title="Collapse all"
              className="h-8 px-2.5 text-xs flex items-center gap-1 bg-white dark:bg-slate-900 text-muted-foreground hover:bg-slate-50 hover:text-foreground transition-colors">
              <ChevronsDownUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Search flat list */}
      {filteredPeople ? (
        <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="divide-y">
            {filteredPeople.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No results for "{searchQ}"</p>}
            {filteredPeople.map(p => {
              const manager = p.reports_to ? personMap[p.reports_to] : null;
              return (
                <div key={p.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors group">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} className="w-9 h-9 rounded-full object-cover shrink-0" alt={p.full_name ?? ''} />
                  ) : (
                    <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0', colorForId(p.id))}>
                      {orgInitials(p.full_name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">{p.full_name ?? '—'}</p>
                      {p.employment_type && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-emerald-300 text-emerald-700 capitalize">{p.employment_type.replace(/-/g,' ')}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn('text-[10px] px-1.5 py-0 rounded-full font-medium', roleChip(p.role))}>{fmtRole(p.role)}</span>
                      {p.department_name && <span className="text-[10px] text-muted-foreground">· {p.department_name}</span>}
                    </div>
                  </div>
                  {manager && (
                    <div className="text-right text-xs shrink-0">
                      <p className="text-[10px] text-muted-foreground">Reports to</p>
                      <p className="font-medium">{manager.full_name ?? '—'}</p>
                    </div>
                  )}
                  <button onClick={() => navigate(`/users/${p.id}`)}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-all" title="View profile">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      ) : roots.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <Users className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
          <p className="text-sm text-muted-foreground">No hierarchy data yet. Assign managers in staff profiles to build the org chart.</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {roots.map(r => <OrgNode key={r.id} person={r} depth={0} expandAll={expandAll} childrenOf={childrenOf} navigate={navigate} />)}
        </div>
      )}
    </div>
  );
}
