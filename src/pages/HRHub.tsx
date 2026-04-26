import { Suspense, lazy, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Banknote, FileText, Loader2, Settings2, Wrench, Plus, Minus, Calculator, GitBranch, Download, FileDown, RefreshCw, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search, ExternalLink, Users, BarChart2, TableIcon, Filter, Copy, X } from 'lucide-react';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { useAuthorization } from '@/hooks/use-authorization';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';

const PayrollPanel      = lazy(() => import('./Payroll'));
const RetainerPanel     = lazy(() => import('./RetainerManagement'));
const PayrollAdminPanel = lazy(() => import('./PayrollAdmin'));
const TimesheetPanel    = lazy(() => import('./Timesheet'));
const PerformancePanel  = lazy(() => import('./PerformanceReviews'));
const SalaryIncrPanel   = lazy(() => import('./SalaryIncrements'));
const TrainingPanel     = lazy(() => import('@/components/hr/TrainingCertifications'));

type HRTab = 'payroll' | 'retainer' | 'payroll-admin' | 'hr-tools' | 'timesheet' | 'performance' | 'salary-increments' | 'training';

const ALL_TABS: { id: HRTab; label: string; icon: typeof Banknote; accent: string; bg: string; adminOnly: boolean }[] = [
  { id: 'payroll',           label: 'My Payroll',          icon: Banknote,   accent: '#D97706', bg: 'rgba(217,119,6,0.12)',   adminOnly: false },
  { id: 'payroll-admin',     label: 'Payroll Admin',        icon: Settings2,  accent: '#67e8f9', bg: 'rgba(103,232,249,0.12)', adminOnly: true  },
  { id: 'retainer',          label: 'Retainer',             icon: FileText,   accent: '#a78bfa', bg: 'rgba(167,139,250,0.12)', adminOnly: true  },
  { id: 'timesheet',         label: 'Timesheet',            icon: Wrench,     accent: '#f472b6', bg: 'rgba(244,114,182,0.12)', adminOnly: false },
  { id: 'training',          label: 'Training & Certs',     icon: BarChart2,  accent: '#a78bfa', bg: 'rgba(167,139,250,0.12)', adminOnly: false },
  { id: 'performance',       label: 'Performance Reviews',  icon: BarChart2,  accent: '#fb923c', bg: 'rgba(251,146,60,0.12)',  adminOnly: true  },
  { id: 'salary-increments', label: 'Salary Increments',   icon: Calculator, accent: '#4ade80', bg: 'rgba(74,222,128,0.12)',  adminOnly: true  },
  { id: 'hr-tools',          label: 'HR Analytics',         icon: GitBranch,  accent: '#34d399', bg: 'rgba(52,211,153,0.12)', adminOnly: true  },
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
        {tab === 'timesheet' && (
          <Suspense fallback={<PanelLoader />}>
            <TimesheetPanel />
          </Suspense>
        )}
        {tab === 'performance' && isAdmin && (
          <Suspense fallback={<PanelLoader />}>
            <PerformancePanel />
          </Suspense>
        )}
        {tab === 'salary-increments' && isAdmin && (
          <Suspense fallback={<PanelLoader />}>
            <SalaryIncrPanel />
          </Suspense>
        )}
        {tab === 'training' && (
          <Suspense fallback={<PanelLoader />}>
            <TrainingPanel />
          </Suspense>
        )}
        {tab === 'hr-tools' && isAdmin && <HRToolsPanel />}
      </div>
    </div>
  );
}

// ── Leave Entitlements Panel ──────────────────────────────────────────────────
interface Entitlement { id?: string; user_id: string; year: number; annual_days: number; sick_days: number; emergency_days: number; maternity_days: number; paternity_days: number; unpaid_days: number; }
interface StaffProfile { id: string; full_name: string | null; email: string | null; }

function LeaveEntitlementsPanel() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Entitlement>>({});

  const { data: profiles } = useQuery({
    queryKey: ['profiles_for_entitlements'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email').order('full_name');
      return (data ?? []) as StaffProfile[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: entitlements, refetch } = useQuery({
    queryKey: ['leave_entitlements', year],
    queryFn: async () => {
      const { data } = await supabase.from('leave_entitlements').select('*').eq('year', year);
      return (data ?? []) as Entitlement[];
    },
    staleTime: 30_000,
  });

  const entMap = Object.fromEntries((entitlements ?? []).map(e => [e.user_id, e]));

  const startEdit = (profile: StaffProfile) => {
    const existing = entMap[profile.id];
    setForm({
      user_id: profile.id, year,
      annual_days: existing?.annual_days ?? 21,
      sick_days: existing?.sick_days ?? 10,
      emergency_days: existing?.emergency_days ?? 5,
      maternity_days: existing?.maternity_days ?? 90,
      paternity_days: existing?.paternity_days ?? 3,
      unpaid_days: existing?.unpaid_days ?? 0,
    });
    setEditing(profile.id);
  };

  const saveEntitlement = async () => {
    if (!form.user_id) return;
    setSaving(true);
    try {
      const existing = entMap[form.user_id];
      const payload = { user_id: form.user_id, year, annual_days: form.annual_days ?? 0, sick_days: form.sick_days ?? 0, emergency_days: form.emergency_days ?? 0, maternity_days: form.maternity_days ?? 0, paternity_days: form.paternity_days ?? 0, unpaid_days: form.unpaid_days ?? 0, updated_at: new Date().toISOString() };
      if (existing?.id) {
        await supabase.from('leave_entitlements').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('leave_entitlements').insert(payload);
      }
      toast({ title: 'Entitlement saved' });
      setEditing(null);
      refetch();
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const EntField = ({ label, field }: { label: string; field: keyof Entitlement }) => (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-muted-foreground font-medium">{label}</label>
      <Input
        type="number" min="0" max="365"
        value={String(form[field] ?? 0)}
        onChange={e => setForm(f => ({ ...f, [field]: Number(e.target.value) }))}
        className="h-7 text-xs w-20 text-center"
        data-testid={`input-ent-${field}`}
      />
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold">Leave Entitlements</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Set annual leave entitlement per staff member — used in Leave Balance report</p>
          </div>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="border rounded px-2 py-1 text-xs bg-background" data-testid="select-entitlement-year">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Staff</th>
                <th className="text-center px-2 py-2 font-semibold">Annual</th>
                <th className="text-center px-2 py-2 font-semibold">Sick</th>
                <th className="text-center px-2 py-2 font-semibold">Emergency</th>
                <th className="text-center px-2 py-2 font-semibold">Maternity</th>
                <th className="text-center px-2 py-2 font-semibold">Paternity</th>
                <th className="text-center px-2 py-2 font-semibold">Unpaid</th>
                <th className="text-center px-2 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map(p => {
                const ent = entMap[p.id];
                const isEditing = editing === p.id;
                return (
                  <tr key={p.id} className="border-t hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{p.full_name ?? '—'}</div>
                      <div className="text-[10px] text-muted-foreground">{p.email ?? ''}</div>
                    </td>
                    {isEditing ? (
                      <>
                        <td className="px-2 py-1 text-center"><EntField label="Annual" field="annual_days" /></td>
                        <td className="px-2 py-1 text-center"><EntField label="Sick" field="sick_days" /></td>
                        <td className="px-2 py-1 text-center"><EntField label="Emergency" field="emergency_days" /></td>
                        <td className="px-2 py-1 text-center"><EntField label="Maternity" field="maternity_days" /></td>
                        <td className="px-2 py-1 text-center"><EntField label="Paternity" field="paternity_days" /></td>
                        <td className="px-2 py-1 text-center"><EntField label="Unpaid" field="unpaid_days" /></td>
                        <td className="px-2 py-1 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={saveEntitlement} disabled={saving} data-testid="btn-save-entitlement">Save</Button>
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setEditing(null)}>Cancel</Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-2 text-center">{ent?.annual_days ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-2 py-2 text-center">{ent?.sick_days ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-2 py-2 text-center">{ent?.emergency_days ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-2 py-2 text-center">{ent?.maternity_days ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-2 py-2 text-center">{ent?.paternity_days ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-2 py-2 text-center">{ent?.unpaid_days ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-2 py-2 text-center">
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => startEdit(p)} data-testid={`btn-edit-entitlement-${p.id}`}>
                            {ent ? 'Edit' : 'Set'}
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── HR Tools Panel ─────────────────────────────────────────────────────────────
interface OrgPerson { id: string; full_name: string | null; role: string | null; department_name: string | null; reports_to: string | null; }

// ── Leave Trends Chart ────────────────────────────────────────────────────────
const LEAVE_TYPE_COLORS: Record<string, string> = {
  annual:       '#1D3461',
  sick:         '#ef4444',
  emergency:    '#f97316',
  maternity:    '#a855f7',
  paternity:    '#3b82f6',
  unpaid:       '#94a3b8',
  study:        '#14b8a6',
  compassionate: '#f59e0b',
};

function LeaveTrendsChart() {
  const { data, isLoading } = useQuery({
    queryKey: ['leave_trends_monthly_6m'],
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const since = sixMonthsAgo.toISOString().slice(0, 10);
      const { data: rows } = await supabase
        .from('leave_requests')
        .select('leave_type, start_date, end_date, status')
        .eq('status', 'approved')
        .gte('start_date', since);
      // Build guaranteed 6-month axis (includes months with no data as zeros)
      const last6Months: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        last6Months.push(d.toISOString().slice(0, 7));
      }

      const monthMap: Record<string, Record<string, number>> = {};
      // Pre-seed all 6 months so they always appear
      last6Months.forEach(m => { monthMap[m] = {}; });

      const typeSet = new Set<string>();
      (rows ?? []).forEach((r: any) => {
        const month = String(r.start_date ?? '').slice(0, 7);
        if (!month || month.length < 7 || !last6Months.includes(month)) return;
        const type = r.leave_type ?? 'other';
        typeSet.add(type);
        if (!monthMap[month]) monthMap[month] = {};
        const start = r.start_date ? new Date(r.start_date) : null;
        const end   = r.end_date   ? new Date(r.end_date)   : start;
        const days  = start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1) : 1;
        monthMap[month][type] = (monthMap[month][type] ?? 0) + days;
      });

      const leaveTypes = Array.from(typeSet).sort();
      const chartData = last6Months.map(m => {
        const entry: Record<string, any> = { month: m };
        leaveTypes.forEach(t => { entry[t] = monthMap[m]?.[t] ?? 0; });
        return entry;
      });
      return { chartData, leaveTypes };
    },
    staleTime: 120_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-48 text-muted-foreground gap-2 text-sm">
      <div className="h-5 w-5 rounded-full border-2 border-[#1D3461] border-t-transparent animate-spin" />
      Loading leave data…
    </div>
  );

  if (!data?.chartData.length) return (
    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
      No leave request data available
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-20} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: any, name: string) => [`${v} day${v !== 1 ? 's' : ''}`, name.replace(/_/g,' ')]} />
        <Legend iconSize={9} iconType="circle" formatter={(v) => <span className="text-[10px] capitalize">{v.replace(/_/g,' ')}</span>} />
        {(data.leaveTypes).map(type => (
          <Bar key={type} dataKey={type} name={type.replace(/_/g,' ')} stackId="a"
            fill={LEAVE_TYPE_COLORS[type] ?? '#64748b'} radius={[0,0,0,0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function HRToolsPanel() {
  const [toolTab, setToolTab] = useState<'projection' | 'orgchart' | 'leave-trends' | 'leave-entitlements'>('projection');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-5">
      <div className="flex gap-2 flex-wrap">
        {([
          { id: 'projection',         label: 'Staff Cost Projection', icon: <Calculator className="h-3.5 w-3.5" /> },
          { id: 'orgchart',           label: 'Org Chart',             icon: <GitBranch className="h-3.5 w-3.5" /> },
          { id: 'leave-trends',       label: 'Leave Trends',          icon: <BarChart2 className="h-3.5 w-3.5" /> },
          { id: 'leave-entitlements', label: 'Leave Entitlements',    icon: <TableIcon className="h-3.5 w-3.5" /> },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setToolTab(t.id)}
            className={cn('flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl font-medium transition-all border',
              toolTab === t.id ? 'bg-[#0F2041] text-white border-[#0F2041]' : 'bg-white dark:bg-slate-900 text-muted-foreground border-slate-200 hover:border-slate-300 hover:text-foreground')}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      {toolTab === 'projection'         && <StaffCostProjection />}
      {toolTab === 'orgchart'           && <OrgChartView />}
      {toolTab === 'leave-entitlements' && <LeaveEntitlementsPanel />}
      {toolTab === 'leave-trends' && (
        <Card>
          <CardHeader className="pb-2">
            <div>
              <h3 className="text-sm font-semibold">Leave Trends by Month</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Leave days taken (approved) by type per month — last 6 months</p>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <LeaveTrendsChart />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Staff Cost Projection ─────────────────────────────────────────────────────
interface ProjectionRow { id: string; role: string; headcount: number; baseSalary: number; allowancePct: number; deductionPct: number; currency: string; }

const CHART_COLORS = ['#0F2041','#1D3461','#4f86c6','#34d399','#f59e0b','#a78bfa','#f87171','#38bdf8','#fb923c'];

const CURRENCIES = ['SDG', 'USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED', 'QAR', 'TRY', 'UGX', 'RWF', 'KES', 'SSP'] as const;

interface Scenario {
  id: string;
  name: string;
  currency: string;
  rows: ProjectionRow[];
}

function makeScenario(name: string, currency = 'SDG', rows?: ProjectionRow[]): Scenario {
  return {
    id: crypto.randomUUID(),
    name,
    currency,
    rows: rows ?? [
      { id: crypto.randomUUID(), role: 'Field Coordinator', headcount: 5,  baseSalary: 50000, allowancePct: 20, deductionPct: 10, currency },
      { id: crypto.randomUUID(), role: 'Data Collector',    headcount: 10, baseSalary: 30000, allowancePct: 10, deductionPct: 8,  currency },
    ],
  };
}

function computeScenario(rows: ProjectionRow[]) {
  const comp = rows.map(r => {
    const gross = r.baseSalary * (1 + r.allowancePct / 100);
    const net   = gross * (1 - r.deductionPct / 100);
    return { ...r, grossPerHead: gross, netPerHead: net, monthlyGross: gross * r.headcount, monthlyNet: net * r.headcount };
  });
  return {
    rows: comp,
    headcount:    comp.reduce((s, r) => s + r.headcount, 0),
    monthlyGross: comp.reduce((s, r) => s + r.monthlyGross, 0),
    monthlyNet:   comp.reduce((s, r) => s + r.monthlyNet, 0),
    annualNet:    comp.reduce((s, r) => s + r.monthlyNet * 12, 0),
  };
}

function StaffCostProjection() {
  const [scenarios, setScenarios] = useState<Scenario[]>(() => [makeScenario('Scenario 1')]);
  const [activeId, setActiveId]   = useState<string>(() => scenarios[0].id);
  const [viewMode, setViewMode]   = useState<'table' | 'chart'>('table');
  const [loadingReal, setLoadingReal] = useState(false);

  const scenario        = scenarios.find(s => s.id === activeId) ?? scenarios[0];
  const displayCurrency = scenario.currency;

  const updateScenario = (id: string, patch: Partial<Omit<Scenario, 'id'>>) =>
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

  const addScenario = () => {
    const n = makeScenario(`Scenario ${scenarios.length + 1}`, displayCurrency);
    setScenarios(prev => [...prev, n]);
    setActiveId(n.id);
  };

  const duplicateScenario = (id: string) => {
    const src = scenarios.find(s => s.id === id);
    if (!src) return;
    const copy: Scenario = {
      ...src,
      id: crypto.randomUUID(),
      name: `${src.name} (Copy)`,
      rows: src.rows.map(r => ({ ...r, id: crypto.randomUUID() })),
    };
    setScenarios(prev => [...prev, copy]);
    setActiveId(copy.id);
  };

  const deleteScenario = (id: string) => {
    if (scenarios.length <= 1) return;
    const idx = scenarios.findIndex(s => s.id === id);
    const next = scenarios.filter(s => s.id !== id);
    setScenarios(next);
    if (activeId === id) setActiveId(next[Math.max(0, idx - 1)].id);
  };

  const changeCurrency = (cur: string) =>
    updateScenario(activeId, { currency: cur, rows: scenario.rows.map(r => ({ ...r, currency: cur })) });

  const updateRow = (rowId: string, field: keyof ProjectionRow, val: any) =>
    updateScenario(activeId, {
      rows: scenario.rows.map(r => r.id === rowId ? { ...r, [field]: typeof r[field] === 'number' ? (parseFloat(val) || 0) : val } : r),
    });

  const addRow = () =>
    updateScenario(activeId, {
      rows: [...scenario.rows, { id: crypto.randomUUID(), role: 'New Role', headcount: 1, baseSalary: 30000, allowancePct: 10, deductionPct: 8, currency: displayCurrency }],
    });

  const removeRow = (rowId: string) =>
    updateScenario(activeId, { rows: scenario.rows.filter(r => r.id !== rowId) });

  const loadFromReal = useCallback(async () => {
    setLoadingReal(true);
    try {
      const [{ data: configs }, { data: depts }] = await Promise.all([
        supabase.from('employee_salary_config').select('user_id, base_salary, allowances, deductions, currency'),
        supabase.from('departments').select('id, name'),
      ]);
      const { data: profs } = await supabase.from('profiles').select('id, full_name, role, department_id, employment_type');
      if (!configs || configs.length === 0) { setLoadingReal(false); return; }
      const profMap: Record<string, any> = {};
      (profs ?? []).forEach((p: any) => { profMap[p.id] = p; });
      const roleGrouped: Record<string, { headcount: number; totalBase: number; allowPct: number; deductPct: number; currency: string }> = {};
      configs.forEach((c: any) => {
        const prof = profMap[c.user_id];
        const key  = prof?.role ?? 'Unknown';
        const allow  = Array.isArray(c.allowances) ? c.allowances.reduce((s: number, a: any) => s + (a.type === 'percent' ? a.value : 0), 0) : 0;
        const deduct = Array.isArray(c.deductions)  ? c.deductions.reduce( (s: number, d: any) => s + (d.type === 'percent' ? d.value : 0), 0) : 0;
        if (!roleGrouped[key]) roleGrouped[key] = { headcount: 0, totalBase: 0, allowPct: 0, deductPct: 0, currency: c.currency ?? 'SDG' };
        roleGrouped[key].headcount++;
        roleGrouped[key].totalBase += c.base_salary ?? 0;
        roleGrouped[key].allowPct   = allow;
        roleGrouped[key].deductPct  = deduct;
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
      if (newRows.length > 0) updateScenario(activeId, { name: 'From Payroll Data', rows: newRows });
    } finally { setLoadingReal(false); }
  }, [activeId, scenario]);

  const { rows: computed, headcount: hc, monthlyGross: mg, monthlyNet: mn, annualNet: an } = useMemo(
    () => computeScenario(scenario.rows),
    [scenario.rows],
  );
  const totals = { headcount: hc, monthlyGross: mg, monthlyNet: mn, annualNet: an };

  const scenarioTotals = useMemo(() =>
    scenarios.map(s => {
      const c = computeScenario(s.rows);
      return { id: s.id, name: s.name, currency: s.currency, headcount: c.headcount, monthlyGross: c.monthlyGross, monthlyNet: c.monthlyNet, annualNet: c.annualNet };
    }),
    [scenarios],
  );

  const chartData = useMemo(() => computed.map((r, i) => ({
    name: r.role.length > 14 ? r.role.slice(0, 13) + '…' : r.role,
    fullName: r.role,
    gross: Math.round(r.monthlyGross),
    net: Math.round(r.monthlyNet),
    color: CHART_COLORS[i % CHART_COLORS.length],
  })), [computed]);

  const exportXLSX = useCallback(() => {
    const wb = XLSX.utils.book_new();
    for (const sc of scenarios) {
      const c = computeScenario(sc.rows);
      const data = [
        ['Role / Grade','Headcount','Base Salary','Allow %','Deduct %','Net / Head','Monthly Gross','Monthly Net','Annual Net','Currency'],
        ...c.rows.map(r => [r.role, r.headcount, r.baseSalary, r.allowancePct, r.deductionPct, Math.round(r.netPerHead), Math.round(r.monthlyGross), Math.round(r.monthlyNet), Math.round(r.monthlyNet * 12), r.currency]),
        [],
        ['TOTALS', c.headcount,'','','','', Math.round(c.monthlyGross), Math.round(c.monthlyNet), Math.round(c.annualNet),''],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), sc.name.slice(0, 31));
    }
    XLSX.writeFile(wb, 'cost-projection.xlsx');
  }, [scenarios]);

  const fmtN = (n: number, cur = displayCurrency) => `${cur} ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">

      {/* ── Scenario tabs ───────────────────────────────────────────────────── */}
      <div className="flex items-end gap-0 border-b overflow-x-auto">
        {scenarios.map((sc, idx) => (
          <div
            key={sc.id}
            className={cn(
              'group relative flex items-center gap-1.5 px-3 py-2 border-b-2 cursor-pointer transition-all whitespace-nowrap text-sm select-none',
              sc.id === activeId
                ? 'border-[#0F2041] text-[#0F2041] dark:border-blue-400 dark:text-blue-300 bg-slate-50 dark:bg-slate-800/40 font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-slate-300',
            )}
            onClick={() => setActiveId(sc.id)}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }}
            />
            <Input
              value={sc.name}
              onChange={e => updateScenario(sc.id, { name: e.target.value })}
              onClick={e => e.stopPropagation()}
              className="h-6 text-xs border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:border-b focus-visible:border-slate-300 w-28 font-medium"
            />
            <button
              title="Duplicate scenario"
              onClick={e => { e.stopPropagation(); duplicateScenario(sc.id); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground transition-all"
            >
              <Copy className="h-3 w-3" />
            </button>
            {scenarios.length > 1 && (
              <button
                title="Delete scenario"
                onClick={e => { e.stopPropagation(); deleteScenario(sc.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-red-400 hover:text-red-600 transition-all"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addScenario}
          title="Add new scenario"
          className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-[#0F2041] dark:hover:text-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 border-b-2 border-transparent rounded-tl rounded-tr transition-all whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Scenario
        </button>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Calculator className="h-4 w-4 text-emerald-500 shrink-0" />
        <span className="text-xs text-muted-foreground hidden sm:block">Estimate payroll costs by headcount and salary grade. Values are projections only.</span>
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={loadFromReal} disabled={loadingReal}>
            {loadingReal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Load from Payroll
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportXLSX}>
            <Download className="h-3.5 w-3.5" />Export Excel
          </Button>
          <Select value={displayCurrency} onValueChange={changeCurrency}>
            <SelectTrigger className="h-8 w-[76px] text-xs font-semibold" data-testid="select-display-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
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

      {/* ── KPI cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Headcount',      value: String(totals.headcount),  sub: 'staff',              color: 'text-[#0F2041] dark:text-blue-300' },
          { label: 'Monthly Gross',  value: fmtN(totals.monthlyGross), sub: 'estimated gross',     color: 'text-emerald-600' },
          { label: 'Monthly Net',    value: fmtN(totals.monthlyNet),   sub: 'after deductions',   color: 'text-blue-600' },
          { label: 'Annual Net',     value: fmtN(totals.annualNet),    sub: '× 12 months',        color: 'text-violet-600' },
          { label: 'Avg Net / Head', value: totals.headcount > 0 ? fmtN(totals.monthlyNet / totals.headcount) : '—', sub: 'per employee / mo.', color: 'text-amber-600' },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-slate-900 border rounded-xl px-3 py-3 text-center shadow-sm">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</p>
            <p className={cn('text-sm font-bold mt-0.5 leading-tight', k.color)}>{k.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Chart or table ──────────────────────────────────────────────────── */}
      {viewMode === 'chart' ? (
        <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Monthly Cost by Role ({displayCurrency})</p>
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
          <p className="text-[11px] text-muted-foreground text-center mt-1">Dark bar = net; light = gross.</p>
        </Card>
      ) : (
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
                        <span className="text-[11px] text-muted-foreground font-medium w-10 text-right shrink-0">{displayCurrency}</span>
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

      {/* ── Scenario comparison (only when ≥ 2 scenarios exist) ─────────────── */}
      {scenarios.length >= 2 && (
        <Card className="shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 dark:bg-slate-800/40 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-[#0F2041] dark:text-blue-300" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Scenario Comparison</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50/60 dark:bg-slate-800/20">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase text-muted-foreground">Scenario</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-muted-foreground">Currency</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-muted-foreground">Headcount</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase text-emerald-600">Mo. Gross</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase text-blue-600">Mo. Net</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase text-violet-600">Annual Net</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase text-amber-600">Avg / Head</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {scenarioTotals.map((sc, idx) => (
                  <tr
                    key={sc.id}
                    className={cn('cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/20', sc.id === activeId && 'bg-blue-50/60 dark:bg-blue-900/10')}
                    onClick={() => setActiveId(sc.id)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }} />
                        <span className={cn('text-xs font-semibold', sc.id === activeId && 'text-[#0F2041] dark:text-blue-300')}>{sc.name}</span>
                        {sc.id === activeId && <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-300 text-blue-600">Active</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-muted-foreground font-medium">{sc.currency}</td>
                    <td className="px-3 py-2.5 text-center text-xs font-bold text-[#0F2041] dark:text-blue-300">{sc.headcount}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold text-emerald-600">{sc.currency} {Math.round(sc.monthlyGross).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-blue-600">{sc.currency} {Math.round(sc.monthlyNet).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-violet-600">{sc.currency} {Math.round(sc.annualNet).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-amber-600">{sc.headcount > 0 ? `${sc.currency} ${Math.round(sc.monthlyNet / sc.headcount).toLocaleString()}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
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
  const chartRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<null | 'png' | 'pdf'>(null);

  async function handleExport(kind: 'png' | 'pdf') {
    if (!chartRef.current) return;
    setExporting(kind);
    // Force-expand everything before snapshot so the full hierarchy is in the image.
    const prevExpand = expandAll;
    setExpandAll(true);
    try {
      // Wait two animation frames for any controlled children to re-render.
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      if (kind === 'png') {
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `org-chart-${new Date().toISOString().slice(0,10)}.png`;
        a.click();
      } else {
        const { default: jsPDF } = await import('jspdf');
        const isWide = canvas.width > canvas.height;
        const pdf = new jsPDF({ orientation: isWide ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(pw / canvas.width, ph / canvas.height);
        const w = canvas.width * ratio;
        const h = canvas.height * ratio;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pw - w) / 2, (ph - h) / 2, w, h);
        pdf.save(`org-chart-${new Date().toISOString().slice(0,10)}.pdf`);
      }
    } catch (e) {
      console.error('[OrgChart] export failed:', e);
    } finally {
      setExporting(null);
    }
  }

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
          {/* Export */}
          <div className="flex border rounded-lg overflow-hidden">
            <button onClick={() => handleExport('png')} disabled={!!exporting} title="Export as PNG"
              data-testid="button-export-orgchart-png"
              className="h-8 px-2.5 text-xs flex items-center gap-1 bg-white dark:bg-slate-900 text-muted-foreground hover:bg-slate-50 hover:text-foreground transition-colors border-r disabled:opacity-50">
              {exporting === 'png' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">PNG</span>
            </button>
            <button onClick={() => handleExport('pdf')} disabled={!!exporting} title="Export as PDF"
              data-testid="button-export-orgchart-pdf"
              className="h-8 px-2.5 text-xs flex items-center gap-1 bg-white dark:bg-slate-900 text-muted-foreground hover:bg-slate-50 hover:text-foreground transition-colors disabled:opacity-50">
              {exporting === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
        </div>
      </div>
      <div ref={chartRef} className="bg-white dark:bg-slate-950 rounded-lg p-2">

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
    </div>
  );
}
