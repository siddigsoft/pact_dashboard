import { Suspense, lazy, useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, FileText, Loader2, Settings2, Wrench, Plus, Minus, Calculator, GitBranch } from 'lucide-react';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { useAuthorization } from '@/hooks/use-authorization';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

function StaffCostProjection() {
  const [rows, setRows] = useState<ProjectionRow[]>([
    { id: crypto.randomUUID(), role: 'Field Coordinator', headcount: 5, baseSalary: 50000, allowancePct: 20, deductionPct: 10, currency: 'SDG' },
    { id: crypto.randomUUID(), role: 'Data Collector',    headcount: 10, baseSalary: 30000, allowancePct: 10, deductionPct: 8, currency: 'SDG' },
  ]);

  const updateRow = (id: string, field: keyof ProjectionRow, val: any) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: typeof r[field] === 'number' ? (parseFloat(val) || 0) : val } : r));

  const addRow = () => setRows(prev => [...prev, { id: crypto.randomUUID(), role: 'New Role', headcount: 1, baseSalary: 30000, allowancePct: 10, deductionPct: 8, currency: 'SDG' }]);
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const computed = useMemo(() => rows.map(r => {
    const gross  = r.baseSalary * (1 + r.allowancePct / 100);
    const net    = gross * (1 - r.deductionPct / 100);
    return { ...r, grossPerHead: gross, netPerHead: net, monthlyGross: gross * r.headcount, monthlyNet: net * r.headcount };
  }), [rows]);

  const totals = useMemo(() => ({
    headcount:    computed.reduce((s, r) => s + r.headcount, 0),
    monthlyGross: computed.reduce((s, r) => s + r.monthlyGross, 0),
    monthlyNet:   computed.reduce((s, r) => s + r.monthlyNet, 0),
    annualGross:  computed.reduce((s, r) => s + r.monthlyGross * 12, 0),
    annualNet:    computed.reduce((s, r) => s + r.monthlyNet * 12, 0),
  }), [computed]);

  const fmtN = (n: number, cur = 'SDG') => `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold">Staff Cost Projection Calculator</h2>
        </div>
        <p className="text-xs text-muted-foreground flex-1">Estimate future payroll costs by headcount and salary grade. Values are projections only.</p>
        <Button onClick={addRow} size="sm" className="h-8 gap-1.5 bg-[#0F2041] hover:bg-[#1D3461] text-white text-xs">
          <Plus className="h-3.5 w-3.5" />Add Role
        </Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Headcount',   value: String(totals.headcount),       sub: 'staff', color: 'text-[#0F2041] dark:text-blue-300' },
          { label: 'Monthly Gross',     value: fmtN(totals.monthlyGross),      sub: 'estimated', color: 'text-emerald-600' },
          { label: 'Monthly Net',       value: fmtN(totals.monthlyNet),        sub: 'after deductions', color: 'text-blue-600' },
          { label: 'Annual Total (Net)',value: fmtN(totals.annualNet),         sub: '× 12 months', color: 'text-violet-600' },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-slate-900 border rounded-xl px-4 py-3 text-center shadow-sm">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</p>
            <p className={cn('text-sm font-bold mt-0.5', k.color)}>{k.value}</p>
            <p className="text-[10px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>

      <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/40 border-b">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase text-muted-foreground">Role / Grade</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-muted-foreground">Headcount</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase text-muted-foreground">Base Salary</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-emerald-600">Allow %</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-red-500">Deduct %</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase text-emerald-600">Mo. Gross</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase text-blue-600">Mo. Net</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase text-violet-600">Annual Net</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {computed.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                  <td className="px-4 py-2.5">
                    <Input value={r.role} onChange={e => updateRow(r.id, 'role', e.target.value)} className="h-8 text-xs border-0 bg-transparent p-0 focus-visible:ring-0 font-medium" />
                  </td>
                  <td className="px-3 py-2.5">
                    <Input type="number" value={r.headcount} onChange={e => updateRow(r.id, 'headcount', e.target.value)} className="h-8 text-xs w-16 text-center mx-auto" />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <Select value={r.currency} onValueChange={v => updateRow(r.id, 'currency', v)}>
                        <SelectTrigger className="h-8 w-16 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{['SDG','USD','EUR','GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" value={r.baseSalary} onChange={e => updateRow(r.id, 'baseSalary', e.target.value)} className="h-8 text-xs w-24 text-right" />
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-center">
                      <Input type="number" value={r.allowancePct} onChange={e => updateRow(r.id, 'allowancePct', e.target.value)} className="h-8 text-xs w-16 text-center" />
                      <span className="text-muted-foreground text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-center">
                      <Input type="number" value={r.deductionPct} onChange={e => updateRow(r.id, 'deductionPct', e.target.value)} className="h-8 text-xs w-16 text-center" />
                      <span className="text-muted-foreground text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-emerald-600">{fmtN(r.monthlyGross)}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-bold text-blue-600">{fmtN(r.monthlyNet)}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-bold text-violet-600">{fmtN(r.monthlyNet * 12)}</td>
                  <td className="pr-3">
                    <button onClick={() => removeRow(r.id)} className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2">
                <td className="px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase">Totals</td>
                <td className="px-3 py-2.5 text-center text-sm font-bold text-[#0F2041]">{totals.headcount}</td>
                <td colSpan={3} />
                <td className="px-3 py-2.5 text-right text-xs font-bold text-emerald-600">{fmtN(totals.monthlyGross)}</td>
                <td className="px-3 py-2.5 text-right text-xs font-bold text-blue-600">{fmtN(totals.monthlyNet)}</td>
                <td className="px-3 py-2.5 text-right text-xs font-bold text-violet-600">{fmtN(totals.annualNet)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        These are estimated projections. Annual = monthly net × 12. Gross = base × (1 + allowance%). Net = gross × (1 − deduction%).
      </p>
    </div>
  );
}

// ── Org Chart View ─────────────────────────────────────────────────────────────
function OrgChartView() {
  const { data: people = [], isLoading } = useQuery<OrgPerson[]>({
    queryKey: ['org-chart-people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, department_id, reports_to, departments(name)')
        .order('full_name');
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        role: p.role,
        department_name: p.departments?.name ?? null,
        reports_to: p.reports_to,
      })) as OrgPerson[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const [searchQ, setSearchQ] = useState('');

  // Build tree: find root nodes (no manager or manager not in list)
  const personMap = useMemo(() => {
    const m: Record<string, OrgPerson> = {};
    people.forEach(p => { m[p.id] = p; });
    return m;
  }, [people]);

  const childrenOf = useMemo(() => {
    const m: Record<string, OrgPerson[]> = {};
    people.forEach(p => {
      const parent = p.reports_to ?? '__root__';
      if (!m[parent]) m[parent] = [];
      m[parent].push(p);
    });
    return m;
  }, [people]);

  const roots = useMemo(() => people.filter(p => !p.reports_to || !personMap[p.reports_to]), [people, personMap]);

  const filteredPeople = useMemo(() => {
    if (!searchQ) return null;
    const q = searchQ.toLowerCase();
    return people.filter(p => (p.full_name ?? '').toLowerCase().includes(q) || (p.department_name ?? '').toLowerCase().includes(q));
  }, [people, searchQ]);

  const COLORS = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-amber-500','bg-pink-500','bg-cyan-500','bg-indigo-500'];
  const colorForId = (id: string) => COLORS[id.charCodeAt(0) % COLORS.length];
  const initials = (name: string | null) => (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  function OrgNode({ person, depth = 0 }: { person: OrgPerson; depth?: number }) {
    const [expanded, setExpanded] = useState(depth < 2);
    const children = childrenOf[person.id] ?? [];
    return (
      <div className={cn('relative', depth > 0 && 'ml-6 pl-4 border-l-2 border-slate-200 dark:border-slate-700')}>
        <div className={cn('flex items-center gap-3 py-2 px-3 rounded-xl my-1 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer', depth === 0 && 'bg-white dark:bg-slate-900 shadow-sm border')} onClick={() => setExpanded(v => !v)}>
          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0', colorForId(person.id))}>{initials(person.full_name)}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{person.full_name ?? '—'}</p>
            <p className="text-[11px] text-muted-foreground capitalize truncate">{person.role?.replace(/_/g, ' ') ?? '—'} {person.department_name ? `· ${person.department_name}` : ''}</p>
          </div>
          {children.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground shrink-0">
              <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">{children.length}</span>
              <span className="text-slate-400">{expanded ? '▲' : '▼'}</span>
            </div>
          )}
        </div>
        {expanded && children.map(c => <OrgNode key={c.id} person={c} depth={depth + 1} />)}
      </div>
    );
  }

  if (isLoading) return <div className="py-20 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin opacity-30" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-blue-500" />
          <h2 className="text-sm font-semibold">Org Chart</h2>
        </div>
        <p className="text-xs text-muted-foreground">{people.length} staff · hierarchy from manager assignments</p>
        <div className="ml-auto relative">
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search staff…"
            className="h-9 pl-3 pr-3 text-sm border rounded-lg bg-white dark:bg-slate-900 w-48 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-300" />
        </div>
      </div>

      {/* Flat list when searching */}
      {filteredPeople ? (
        <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="divide-y">
            {filteredPeople.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No results</p>}
            {filteredPeople.map(p => {
              const manager = p.reports_to ? personMap[p.reports_to] : null;
              return (
                <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0', colorForId(p.id))}>{initials(p.full_name)}</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{p.full_name ?? '—'}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{p.role?.replace(/_/g, ' ') ?? '—'} {p.department_name ? `· ${p.department_name}` : ''}</p>
                  </div>
                  {manager && (
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Reports to</p>
                      <p className="text-xs font-medium">{manager.full_name ?? '—'}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <div className="space-y-1">
          {roots.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No hierarchy data found. Assign managers in staff profiles to build the org chart.</p>}
          {roots.map(r => <OrgNode key={r.id} person={r} depth={0} />)}
        </div>
      )}
    </div>
  );
}
