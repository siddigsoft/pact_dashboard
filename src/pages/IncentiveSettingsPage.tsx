import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthorization } from '@/hooks/use-authorization';
import { useLocation as useLocationCtx } from '@/context/location/LocationContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  AlertTriangle, ArrowRight, BarChart3, CircleDollarSign,
  Download, FileText, Info, LineChart, ListChecks, Plus, RefreshCw, Save, Settings2,
  ShieldCheck, Trash2, WalletCards,
} from 'lucide-react';
import type { IncentiveConfigRow, IncentiveRole, IncentiveSplitMethod } from '@/types/incentive';
import { CONFIGURABLE_INCENTIVE_ROLES, INCENTIVE_ROLE_LABELS } from '@/types/incentive';
import {
  exportIncentiveExcel,
  exportIncentivePdf,
} from './incentiveReportExports';

interface GlobalRoleRow { role: IncentiveRole; isActive: boolean; bonusPct: number; splitMethod: IncentiveSplitMethod; dbId: string | null }
interface HubOverrideRow { localId: string; dbId: string | null; hubId: string; role: IncentiveRole; bonusPct: number; isNew: boolean; toDelete: boolean }
interface Snapshot { id: string; mmp_id: string; status: string; total_dc_fee_pool_cents: number; total_bonus_cents: number; currency: string; coordinator_count: number; supervisor_count: number; pre_approved_at: string | null; approved_at: string | null; created_at: string }
interface Payment { id: string; snapshot_id?: string; mmp_id: string; user_id: string; role: string; hub_name: string | null; bonus_pct: number; bonus_amount_cents: number; currency: string; excluded: boolean; payment_method: string | null; payroll_period: string | null; paid_at: string | null; status: string; profiles?: { full_name?: string; email?: string } | null }
interface MmpName { id: string; name: string | null; mmp_id: string | null; hub_name: string | null }
type ReportBasis = 'payment' | 'calculation';

const mkId = () => crypto.randomUUID();
const money = (cents: number, currency = 'SDG') => `${currency} ${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const byCurrency = (rows: Array<{ currency: string; amount: number }>) => rows.reduce<Record<string, number>>((result, row) => {
  result[row.currency] = (result[row.currency] ?? 0) + row.amount;
  return result;
}, {});
const moneyByCurrency = (totals: Record<string, number>) => Object.entries(totals).map(([currency, cents]) => money(cents, currency)).join(' · ') || '—';
const paymentSummaryForSnapshot = (snapshotId: string, payments: Payment[]) =>
  Object.entries(byCurrency(payments.filter((payment) => payment.snapshot_id === snapshotId && !payment.excluded).map((payment) => ({
    currency: payment.currency,
    amount: payment.bonus_amount_cents,
  })))).map(([currency, amount]) => ({ currency, amount }));
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (key: string) => new Date(`${key}-02T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const monthBoundsUtc = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start: start.toISOString(), end: end.toISOString() };
};
const statusLabel = (status: string) => status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const statusClass = (status: string) => ({ paid: 'bg-emerald-50 text-emerald-700 border-emerald-200', approved: 'bg-sky-50 text-sky-700 border-sky-200', pre_approved: 'bg-amber-50 text-amber-700 border-amber-200', calculating: 'bg-slate-100 text-slate-600 border-slate-200', failed: 'bg-red-50 text-red-700 border-red-200' }[status] ?? 'bg-slate-100 text-slate-600 border-slate-200');

export default function IncentiveSettingsPage() {
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const { hubs } = useLocationCtx();
  const { toast } = useToast();
  const allowed = isSuperAdmin() || hasAnyRole(['admin']);
  const [section, setSection] = useState<'reports' | 'settings'>('reports');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globalRows, setGlobalRows] = useState<GlobalRoleRow[]>(CONFIGURABLE_INCENTIVE_ROLES.map(role => ({ role, isActive: true, bonusPct: role === 'coordinator' ? 10 : 7, splitMethod: 'proportional', dbId: null })));
  const [coverageThreshold, setCoverageThreshold] = useState(70);
  const [hubOverrides, setHubOverrides] = useState<HubOverrideRow[]>([]);
  const [newHub, setNewHub] = useState('');
  const [newRole, setNewRole] = useState<IncentiveRole>('coordinator');
  const [newPct, setNewPct] = useState(10);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [reportBasis, setReportBasis] = useState<ReportBasis>('payment');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [mmpNames, setMmpNames] = useState<Record<string, MmpName>>({});
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [loadedReportKey, setLoadedReportKey] = useState<string | null>(null);
  const reportRequestRef = useRef(0);
  const currentReportKey = `${reportBasis}:${selectedMonth}`;

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('incentive_configs').select('*').order('hub_id', { ascending: true, nullsFirst: true });
      if (error) throw error;
      const rows = (data ?? []) as IncentiveConfigRow[];
      const globals = rows.filter(row => row.hub_id === null);
      setCoverageThreshold(Number(globals[0]?.coverage_threshold_pct ?? 70));
      setGlobalRows(prev => prev.map(local => {
        const db = globals.find(row => row.role === local.role);
        return db ? { ...local, dbId: db.id, isActive: db.is_active, bonusPct: Number(db.bonus_pct), splitMethod: db.split_method } : local;
      }));
      setHubOverrides(rows.filter(row => row.hub_id && CONFIGURABLE_INCENTIVE_ROLES.includes(row.role)).map(row => ({ localId: row.id, dbId: row.id, hubId: row.hub_id!, role: row.role, bonusPct: Number(row.bonus_pct), isNew: false, toDelete: false })));
    } catch (error: any) { toast({ title: 'Unable to load settings', description: error.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [toast]);

  const loadReport = useCallback(async () => {
    const requestId = ++reportRequestRef.current;
    const requestedKey = `${reportBasis}:${selectedMonth}`;
    setReportLoading(true);
    setReportError('');
    setLoadedReportKey(null);
    setSnapshots([]);
    setPayments([]);
    setMmpNames({});
    try {
      const { start, end } = monthBoundsUtc(selectedMonth);
      const pageSize = 500;
      const nextSnapshots: Snapshot[] = [];
      const paymentRows: Payment[] = [];
      const loadPages = async <T,>(
        queryFactory: (from: number, to: number) => any,
        target: T[],
      ) => {
        let from = 0;
        while (true) {
          const { data, error } = await queryFactory(from, from + pageSize - 1);
          if (error) throw error;
          const page = (data ?? []) as T[];
          target.push(...page);
          if (page.length < pageSize) break;
          from += pageSize;
        }
      };

      if (reportBasis === 'calculation') {
        await loadPages(
          (from, to) => supabase
            .from('mmp_incentive_snapshots')
            .select('id,mmp_id,status,total_dc_fee_pool_cents,total_bonus_cents,currency,coordinator_count,supervisor_count,pre_approved_at,approved_at,created_at')
            .gte('created_at', start).lt('created_at', end)
            .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
          nextSnapshots,
        );
      } else {
        await loadPages(
          (from, to) => supabase
            .from('mmp_incentive_payments')
             .select('id,snapshot_id,mmp_id,user_id,role,hub_name,bonus_pct,bonus_amount_cents,currency,excluded,payment_method,payroll_period,paid_at,status')
             .gte('paid_at', start).lt('paid_at', end).eq('excluded', false).eq('status', 'paid')
             .order('paid_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
          paymentRows,
        );
        const snapshotIds = [...new Set(paymentRows.map(row => row.snapshot_id).filter(Boolean))] as string[];
        for (let index = 0; index < snapshotIds.length; index += pageSize) {
          const batch = snapshotIds.slice(index, index + pageSize);
          await loadPages(
            (from, to) => supabase.from('mmp_incentive_snapshots')
              .select('id,mmp_id,status,total_dc_fee_pool_cents,total_bonus_cents,currency,coordinator_count,supervisor_count,pre_approved_at,approved_at,created_at')
               .in('id', batch).order('id', { ascending: true }).range(from, to),
            nextSnapshots,
          );
        }
      }

      const ids = [...new Set(nextSnapshots.map(row => row.id))];
      if (reportBasis === 'calculation') {
        for (let index = 0; index < ids.length; index += pageSize) {
          const batch = ids.slice(index, index + pageSize);
          await loadPages(
            (from, to) => supabase.from('mmp_incentive_payments')
              .select('id,snapshot_id,mmp_id,user_id,role,hub_name,bonus_pct,bonus_amount_cents,currency,excluded,payment_method,payroll_period,paid_at,status')
               .in('snapshot_id', batch).order('bonus_amount_cents', { ascending: false }).order('id', { ascending: true }).range(from, to),
            paymentRows,
          );
        }
      }
      if (reportBasis === 'payment') {
        const paidSnapshotIds = [...new Set(paymentRows.map(row => row.snapshot_id).filter(Boolean))] as string[];
        for (let index = 0; index < paidSnapshotIds.length; index += pageSize) {
          const batch = paidSnapshotIds.slice(index, index + pageSize);
          await loadPages(
            (from, to) => supabase.from('mmp_incentive_payments')
              .select('id,snapshot_id,mmp_id,user_id,role,hub_name,bonus_pct,bonus_amount_cents,currency,excluded,payment_method,payroll_period,paid_at,status')
              .in('snapshot_id', batch).eq('excluded', true)
              .order('id', { ascending: true }).range(from, to),
            paymentRows,
          );
        }
      }
      const uniqueSnapshots = [...new Map(nextSnapshots.map(row => [row.id, row])).values()];
      const uniquePayments = [...new Map(paymentRows.map(row => [row.id, row])).values()];
      const uniqueIds = uniqueSnapshots.map(row => row.id);
      if (!uniqueIds.length && !uniquePayments.length) {
        if (requestId === reportRequestRef.current) {
          setLoadedReportKey(requestedKey);
        }
        return;
      }

      const mmpRows: MmpName[] = [];
      const queryBatchSize = 150;
      const mmpIds = [...new Set(uniqueSnapshots.map(row => row.mmp_id).concat(uniquePayments.map(row => row.mmp_id)))];
      for (let index = 0; index < mmpIds.length; index += queryBatchSize) {
        const { data, error } = await supabase
          .from('mmp_files')
          .select('id,name,mmp_id,hub_name')
          .in('id', mmpIds.slice(index, index + queryBatchSize));
        if (error) throw error;
        mmpRows.push(...((data ?? []) as MmpName[]));
      }

      const profileMap = new Map<string, { full_name?: string; email?: string }>();
      const userIds = [...new Set(uniquePayments.map(row => row.user_id).filter(Boolean))];
      for (let index = 0; index < userIds.length; index += queryBatchSize) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id,full_name,email')
          .in('id', userIds.slice(index, index + queryBatchSize));
        if (error) throw error;
        for (const profile of data ?? []) {
          profileMap.set(profile.id, {
            full_name: profile.full_name ?? undefined,
            email: profile.email ?? undefined,
          });
        }
      }

      if (requestId !== reportRequestRef.current) return;
      setSnapshots(uniqueSnapshots);
      setPayments(uniquePayments.map(row => ({
        ...row,
        profiles: profileMap.get(row.user_id) ?? null,
      })));
      setMmpNames(Object.fromEntries(mmpRows.map(row => [row.id, row])));
      setLoadedReportKey(requestedKey);
    } catch (error: any) {
      if (requestId === reportRequestRef.current) {
        setReportError(error.message ?? 'The report could not be loaded.');
      }
    } finally {
      if (requestId === reportRequestRef.current) {
        setReportLoading(false);
      }
    }
  }, [reportBasis, selectedMonth]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);
  useEffect(() => { if (allowed) loadReport(); }, [allowed, loadReport]);
  useEffect(() => {
    const next: string[] = [];
    globalRows.forEach(row => { if (row.isActive && row.bonusPct === 0) next.push(`${INCENTIVE_ROLE_LABELS[row.role]} is active with a 0% bonus.`); });
    if (coverageThreshold < 0 || coverageThreshold > 100) next.push('Coverage threshold must be between 0 and 100.');
    const seen = new Set<string>();
    hubOverrides.filter(row => !row.toDelete).forEach(row => { const key = `${row.hubId}:${row.role}`; if (seen.has(key)) next.push(`Duplicate override for ${hubs.find(h => h.id === row.hubId)?.name ?? row.hubId}.`); seen.add(key); });
    setWarnings(next);
  }, [coverageThreshold, globalRows, hubOverrides, hubs]);

  const save = async () => {
    const active = hubOverrides.filter(row => !row.toDelete); const seen = new Set<string>();
    for (const row of active) { const key = `${row.hubId}:${row.role}`; if (seen.has(key)) { toast({ title: 'Duplicate override', description: 'Remove duplicate hub and role overrides before saving.', variant: 'destructive' }); return; } seen.add(key); }
    setSaving(true);
    try {
      const settings = [...globalRows.map(row => ({ hub_id: null, role: row.role, is_active: row.isActive, bonus_pct: row.bonusPct, split_method: row.splitMethod, coverage_threshold_pct: coverageThreshold, what_counts: 'wfp_confirmed' })), ...active.map(row => ({ hub_id: row.hubId, role: row.role, is_active: true, bonus_pct: row.bonusPct, split_method: 'proportional', coverage_threshold_pct: coverageThreshold, what_counts: 'wfp_confirmed' }))];
      const { data, error } = await (supabase.rpc as any)('save_incentive_settings', { p_settings: settings });
      if (error) throw error; if (data?.ok === false) throw new Error(data.error ?? 'Settings were not saved.');
      toast({ title: 'Settings saved', description: 'The new rules apply to future MMP calculations.' }); await loadConfigs();
    } catch (error: any) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const months = useMemo(() => Array.from({ length: 18 }, (_, index) => { const d = new Date(); d.setDate(2); d.setMonth(d.getMonth() - index); return monthKey(d); }), []);
  const bonusByCurrency = reportBasis === 'payment'
    ? byCurrency(payments.filter(row => !row.excluded).map(row => ({ currency: row.currency, amount: row.bonus_amount_cents })))
    : byCurrency(snapshots.map(row => ({ currency: row.currency, amount: Number(row.total_bonus_cents || 0) })));
  const poolByCurrency = reportBasis === 'calculation'
    ? byCurrency(snapshots.map(row => ({ currency: row.currency, amount: Number(row.total_dc_fee_pool_cents || 0) })))
    : {};
  const excluded = payments.filter(row => row.excluded).length;
  const exportReport = {
    monthLabel: monthLabel(selectedMonth),
    basisLabel: reportBasis === 'payment' ? 'Payment month (paid_at)' : 'Calculation month (snapshot created_at)',
    monthKey: selectedMonth,
    snapshots: snapshots.flatMap((snapshot) => {
      const relatedPayments = payments.filter((payment) =>
        payment.snapshot_id === snapshot.id && !payment.excluded,
      );
      const currencies = reportBasis === 'calculation'
        ? [{ currency: snapshot.currency, bonus: snapshot.total_bonus_cents }]
        : Object.entries(byCurrency(relatedPayments.map((payment) => ({
          currency: payment.currency,
          amount: payment.bonus_amount_cents,
        })))).map(([currency, bonus]) => ({ currency, bonus }));
      return currencies.map(({ currency, bonus }) => ({
        name: mmpNames[snapshot.mmp_id]?.name ?? snapshot.mmp_id,
        hub: mmpNames[snapshot.mmp_id]?.hub_name ?? '—',
        status: statusLabel(snapshot.status),
        coordinators: snapshot.coordinator_count,
        supervisors: snapshot.supervisor_count,
        feePool: reportBasis === 'calculation' ? snapshot.total_dc_fee_pool_cents : null,
        bonus,
        currency,
      }));
    }),
    payments: payments.map((payment) => ({
      recipient: payment.profiles?.full_name ?? payment.user_id,
      email: payment.profiles?.email ?? '',
      role: statusLabel(payment.role),
      hub: payment.hub_name ?? '—',
      rate: payment.bonus_pct,
      amount: payment.bonus_amount_cents,
      currency: payment.currency,
      status: statusLabel(payment.status),
      excluded: payment.excluded,
    })),
    poolByCurrency,
    bonusByCurrency,
    excluded,
  };

  const exportExcel = async () => {
    if (loadedReportKey !== currentReportKey) return;
    setExporting('excel');
    try {
      await exportIncentiveExcel(exportReport);
      toast({ title: 'Excel report exported', description: `${monthLabel(selectedMonth)} is ready to download.` });
    } catch (error: any) {
      toast({ title: 'Excel export failed', description: error.message ?? 'The workbook could not be generated.', variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = () => {
    if (loadedReportKey !== currentReportKey) return;
    setExporting('pdf');
    try {
      exportIncentivePdf(exportReport);
      toast({ title: 'PDF report exported', description: `${monthLabel(selectedMonth)} is ready to download.` });
    } catch (error: any) {
      toast({ title: 'PDF export failed', description: error.message ?? 'The PDF could not be generated.', variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  if (!allowed) return <div className="min-h-[60vh] flex items-center justify-center p-6"><div className="max-w-sm text-center"><ShieldCheck className="mx-auto h-10 w-10 text-slate-400" /><h1 className="mt-4 text-xl font-semibold">Access restricted</h1><p className="mt-2 text-sm text-muted-foreground">Only Admins and Super Admins can configure and audit incentive bonuses.</p></div></div>;
  if (loading) return <div className="mx-auto max-w-6xl p-6"><div className="h-8 w-64 animate-pulse rounded bg-muted" /><div className="mt-8 grid gap-4 md:grid-cols-3"><div className="h-28 animate-pulse rounded-xl bg-muted" /><div className="h-28 animate-pulse rounded-xl bg-muted" /><div className="h-28 animate-pulse rounded-xl bg-muted" /></div></div>;

  return <div className="min-h-[100dvh] bg-[#f4f7f6] text-[#16343a]">
    <header className="border-b border-[#d8e5e1] bg-[#123942] text-white">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a7d9cc]"><LineChart className="h-4 w-4" /> PACT operations / incentives</div><h1 className="mt-2 text-3xl font-bold tracking-tight">Bonus control room</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#c8ded9]">Set the rules for future Coordinator and Supervisor bonuses, then audit exactly what was calculated for each monthly MMP cycle.</p></div>
          <div className="flex rounded-lg border border-white/15 bg-white/10 p-1"><button onClick={() => setSection('reports')} className={cn('rounded-md px-4 py-2 text-sm font-medium transition-colors', section === 'reports' && 'bg-[#e9c46a] text-[#16343a]')}>Monthly reports</button><button onClick={() => setSection('settings')} className={cn('rounded-md px-4 py-2 text-sm font-medium transition-colors', section === 'settings' && 'bg-[#e9c46a] text-[#16343a]')}>Configure rules</button></div>
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
     {section === 'reports' ? <ReportWorkspace {...{ selectedMonth, setSelectedMonth, reportBasis, setReportBasis, months, reportLoading, reportError, loadReport, snapshots, payments, mmpNames, bonusByCurrency, poolByCurrency, excluded, exportExcel, exportPdf, exporting, reportReady: loadedReportKey === currentReportKey }} /> : <SettingsWorkspace {...{ coverageThreshold, setCoverageThreshold, globalRows, setGlobalRows, hubOverrides, setHubOverrides, hubs, newHub, setNewHub, newRole, setNewRole, newPct, setNewPct, warnings, save, saving }} />}
    </main>
  </div>;
}

function ReportWorkspace(props: any) {
  const {
    selectedMonth, setSelectedMonth, reportBasis, setReportBasis, months,
    reportLoading, reportError, loadReport, snapshots, payments, mmpNames,
    bonusByCurrency, poolByCurrency, excluded, exportExcel, exportPdf, exporting,
    reportReady,
  } = props;
  const paymentRowsFor = (snapshotId: string) =>
    payments.filter((payment: Payment) => payment.snapshot_id === snapshotId && !payment.excluded);
  const paidSummaryFor = (snapshotId: string) => {
    const rows = paymentRowsFor(snapshotId);
    return moneyByCurrency(byCurrency(rows.map((row: Payment) => ({
      currency: row.currency,
      amount: row.bonus_amount_cents,
    }))));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#178080]">
            Monthly review
          </p>
          <h2 className="mt-1 text-2xl font-bold">Incentive report ledger</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {reportBasis === 'payment'
              ? 'Payment month uses paid_at. Only non-excluded paid rows in the selected month contribute to totals; excluded rows remain visible for audit.'
              : 'Calculation month uses snapshot created_at and includes every payment attached to those snapshots.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={reportBasis} onValueChange={setReportBasis}>
            <SelectTrigger className="w-[220px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="payment">Payment month</SelectItem>
              <SelectItem value="calculation">Calculation month</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[190px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{months.map((month: string) => <SelectItem key={month} value={month}>{monthLabel(month)}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={loadReport} disabled={reportLoading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          <Button onClick={exportExcel} disabled={!reportReady || !!exporting || reportLoading || !snapshots.length} className="bg-[#123942] hover:bg-[#1b4d57]"><Download className="mr-2 h-4 w-4" />Excel</Button>
          <Button variant="outline" onClick={exportPdf} disabled={!reportReady || !!exporting || reportLoading || !snapshots.length}><FileText className="mr-2 h-4 w-4" />PDF</Button>
        </div>
      </div>
      {reportError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>Report unavailable.</strong> {reportError}<Button variant="link" className="ml-2 p-0 text-red-800" onClick={loadReport}>Try again</Button></div>}
      {reportLoading ? <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-white/70" />)}</div> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label={reportBasis === 'payment' ? 'Paid in selected month' : 'Snapshot bonus total'} value={moneyByCurrency(bonusByCurrency)} icon={CircleDollarSign} tone="gold" />
            <Metric label={reportBasis === 'payment' ? 'Fee pool not restated' : 'DC fee pool'} value={moneyByCurrency(poolByCurrency)} icon={WalletCards} tone="teal" />
            <Metric label="MMP snapshots" value={snapshots.length} icon={BarChart3} tone="navy" />
            <Metric label="Excluded recipients" value={excluded} icon={ShieldCheck} tone="rose" />
          </div>
          <section className="overflow-hidden rounded-xl border border-[#d8e5e1] bg-white">
            <div className="border-b border-[#e5efec] px-5 py-4"><h3 className="font-semibold">MMP snapshot register</h3><p className="mt-1 text-xs text-slate-500">{monthLabel(selectedMonth)} · {reportBasis === 'payment' ? 'paid recipients only; fee pool is not restated' : 'snapshot totals'}</p></div>
            {snapshots.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[#f4f8f7] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3 text-left">MMP / hub</th><th className="px-3 py-3 text-left">Status</th><th className="px-3 py-3 text-right">Recipients</th><th className="px-3 py-3 text-right">Fee pool</th><th className="px-5 py-3 text-right">Bonus / paid</th></tr></thead><tbody className="divide-y divide-[#edf3f1]">{snapshots.map((snapshot: Snapshot) => <tr key={snapshot.id} className="hover:bg-[#f7fbfa]"><td className="px-5 py-3"><p className="font-medium">{mmpNames[snapshot.mmp_id]?.name ?? snapshot.mmp_id}</p><p className="text-xs text-slate-500">{mmpNames[snapshot.mmp_id]?.hub_name ?? 'Hub not recorded'}</p></td><td className="px-3 py-3"><Badge className={cn('border text-[10px]', statusClass(snapshot.status))}>{statusLabel(snapshot.status)}</Badge></td><td className="px-3 py-3 text-right text-xs">{reportBasis === 'payment' ? `${paymentRowsFor(snapshot.id).length} paid` : `${snapshot.coordinator_count} C · ${snapshot.supervisor_count} S`}</td><td className="px-3 py-3 text-right text-xs">{reportBasis === 'payment' ? 'N/A' : money(snapshot.total_dc_fee_pool_cents, snapshot.currency)}</td><td className="px-5 py-3 text-right text-xs font-semibold">{reportBasis === 'payment' ? paidSummaryFor(snapshot.id) : money(snapshot.total_bonus_cents, snapshot.currency)}</td></tr>)}</tbody></table></div> : <EmptyReport month={selectedMonth} />}</section>
          <section className="overflow-hidden rounded-xl border border-[#d8e5e1] bg-white"><div className="border-b border-[#e5efec] px-5 py-4"><h3 className="font-semibold">Payment detail</h3><p className="mt-1 text-xs text-slate-500">Non-excluded rows reconcile to the selected headline; excluded rows are retained for audit.</p></div>{payments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-[#f4f8f7] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3 text-left">Recipient</th><th className="px-3 py-3 text-left">Role</th><th className="px-3 py-3 text-left">Currency</th><th className="px-3 py-3 text-right">Amount</th><th className="px-5 py-3 text-left">Status</th></tr></thead><tbody className="divide-y divide-[#edf3f1]">{payments.map((payment: Payment) => <tr key={payment.id} className={cn(payment.excluded && 'opacity-60')}><td className="px-5 py-3"><p className="font-medium">{payment.profiles?.full_name ?? payment.user_id}</p><p className="text-xs text-slate-500">{payment.profiles?.email ?? 'Email not available'}</p></td><td className="px-3 py-3 text-xs capitalize">{payment.role}</td><td className="px-3 py-3 text-xs">{payment.currency}</td><td className="px-3 py-3 text-right text-xs font-semibold">{money(payment.bonus_amount_cents, payment.currency)}</td><td className="px-5 py-3"><Badge className={cn('border text-[10px]', payment.excluded ? 'bg-slate-100 text-slate-500' : statusClass(payment.status))}>{payment.excluded ? 'Excluded · audit only' : statusLabel(payment.status)}</Badge></td></tr>)}</tbody></table></div> : <div className="p-10 text-center text-sm text-slate-500">No payment records are attached to this report basis and month.</div>}</section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon, tone }: any) { const tones: any = { gold: 'bg-[#fff3c8] text-[#8a6811]', teal: 'bg-[#d8efea] text-[#167575]', navy: 'bg-[#dce9eb] text-[#215260]', rose: 'bg-[#f7e5df] text-[#98513c]' }; return <div className="rounded-xl border border-[#d8e5e1] bg-white p-4 shadow-[0_8px_30px_rgba(18,57,66,0.04)]"><div className="flex items-center justify-between"><div className={cn('rounded-lg p-2', tones[tone])}><Icon className="h-4 w-4" /></div><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Selected month</span></div><p className="mt-4 text-xs text-slate-500">{label}</p><p className="mt-1 truncate text-xl font-bold tracking-tight">{value}</p></div>; }
function EmptyReport({ month }: { month: string }) { return <div className="p-14 text-center"><ListChecks className="mx-auto h-9 w-9 text-[#8fb8af]" /><h3 className="mt-3 font-semibold">No incentive snapshots yet</h3><p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">There are no calculated MMP snapshots for {monthLabel(month)}. Try another month or return after the calculation run.</p></div>; }

function SettingsWorkspace(props: any) {
  const { coverageThreshold, setCoverageThreshold, globalRows, setGlobalRows, hubOverrides, setHubOverrides, hubs, newHub, setNewHub, newRole, setNewRole, newPct, setNewPct, warnings, save, saving } = props;
  const visible = hubOverrides.filter((row: HubOverrideRow) => !row.toDelete);
  const addOverride = () => { if (!newHub) return; if (visible.some((row: HubOverrideRow) => row.hubId === newHub && row.role === newRole)) return; setHubOverrides((rows: HubOverrideRow[]) => [...rows, { localId: mkId(), dbId: null, hubId: newHub, role: newRole, bonusPct: newPct, isNew: true, toDelete: false }]); setNewHub(''); };
  return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#178080]">Future calculations</p><div className="mt-1 flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><h2 className="text-2xl font-bold">Configure bonus rules</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">These rules are read when a new MMP incentive snapshot is calculated. Existing snapshots keep their recorded configuration.</p></div><Button onClick={save} disabled={saving} className="bg-[#123942] hover:bg-[#1b4d57]"><Save className="mr-2 h-4 w-4" />{saving ? 'Saving changes…' : 'Save changes'}</Button></div></div>{warnings.length > 0 && <div className="rounded-xl border border-[#ead7a1] bg-[#fff8df] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-[#775d14]"><AlertTriangle className="h-4 w-4" />Review before saving</div>{warnings.map((warning: string) => <p key={warning} className="ml-6 mt-1 text-xs text-[#775d14]">{warning}</p>)}</div>}<div className="grid gap-6 xl:grid-cols-[1fr_360px]"><div className="space-y-6"><section className="rounded-xl border border-[#d8e5e1] bg-white p-5"><div className="flex items-start gap-3"><div className="rounded-lg bg-[#d8efea] p-2 text-[#167575]"><CircleDollarSign className="h-4 w-4" /></div><div><h3 className="font-semibold">Eligibility gate</h3><p className="mt-1 text-xs leading-5 text-slate-500">An MMP must meet this WFP-confirmed coverage percentage before its bonus pool can be unlocked.</p></div></div><div className="mt-5 flex max-w-sm items-end gap-3"><div className="flex-1"><Label className="text-xs text-slate-500">Minimum confirmed coverage</Label><Input className="mt-1.5" type="number" min={0} max={100} value={coverageThreshold} onChange={e => setCoverageThreshold(Math.max(0, Math.min(100, Number(e.target.value))))} /></div><span className="pb-2 text-sm font-semibold text-slate-500">%</span></div></section><section className="overflow-hidden rounded-xl border border-[#d8e5e1] bg-white"><div className="border-b border-[#e5efec] px-5 py-4"><div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-[#178080]" /><h3 className="font-semibold">Role rules</h3></div><p className="mt-1 text-xs text-slate-500">The global rule applies unless a hub override is listed below.</p></div><div className="divide-y divide-[#edf3f1]">{globalRows.map((row: GlobalRoleRow) => <div key={row.role} className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_auto_130px_170px] sm:items-center"><div><p className="font-medium">{INCENTIVE_ROLE_LABELS[row.role]}</p><p className="mt-0.5 text-xs text-slate-500">{row.role === 'coordinator' ? 'Coordinates field delivery and quality checks.' : 'Supervises hub-level programme execution.'}</p></div><Switch checked={row.isActive} onCheckedChange={(value: boolean) => setGlobalRows((rows: GlobalRoleRow[]) => rows.map(item => item.role === row.role ? { ...item, isActive: value } : item))} /><div><Label className="text-[10px] uppercase tracking-wider text-slate-400">Bonus rate</Label><div className="mt-1 flex items-center gap-1"><Input className="h-9" type="number" step={0.5} disabled={!row.isActive} value={row.bonusPct} onChange={e => setGlobalRows((rows: GlobalRoleRow[]) => rows.map(item => item.role === row.role ? { ...item, bonusPct: Number(e.target.value) } : item))} /><span className="text-sm text-slate-500">%</span></div></div><div><Label className="text-[10px] uppercase tracking-wider text-slate-400">Pool distribution</Label><Select value={row.splitMethod} disabled={!row.isActive} onValueChange={(value: IncentiveSplitMethod) => setGlobalRows((rows: GlobalRoleRow[]) => rows.map(item => item.role === row.role ? { ...item, splitMethod: value } : item))}><SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="proportional">Proportional</SelectItem><SelectItem value="equal">Equal share</SelectItem></SelectContent></Select></div></div>)}</div><div className="flex gap-2 border-t border-[#e5efec] bg-[#f7fbfa] px-5 py-3 text-xs text-slate-500"><Info className="h-4 w-4 shrink-0 text-[#178080]" /><span><strong>Proportional</strong> weights a share by DC fee pool. <strong>Equal share</strong> divides eligible recipients evenly.</span></div></section><section className="overflow-hidden rounded-xl border border-[#d8e5e1] bg-white"><div className="border-b border-[#e5efec] px-5 py-4"><h3 className="font-semibold">Hub-specific overrides</h3><p className="mt-1 text-xs text-slate-500">Use sparingly for a hub and role that needs a different rate.</p></div>{visible.length ? <div className="divide-y divide-[#edf3f1]">{visible.map((row: HubOverrideRow) => <div key={row.localId} className="flex flex-wrap items-center gap-3 px-5 py-3"><span className="min-w-[160px] flex-1 text-sm font-medium">{hubs.find((hub: any) => hub.id === row.hubId)?.name ?? row.hubId}</span><span className="w-32 text-xs text-slate-500">{INCENTIVE_ROLE_LABELS[row.role]}</span><div className="flex items-center gap-1"><Input className="h-8 w-20" type="number" step={0.5} value={row.bonusPct} onChange={e => setHubOverrides((rows: HubOverrideRow[]) => rows.map(item => item.localId === row.localId ? { ...item, bonusPct: Number(e.target.value) } : item))} /><span className="text-xs text-slate-500">%</span></div><Button variant="ghost" size="icon" className="text-red-600" onClick={() => setHubOverrides((rows: HubOverrideRow[]) => rows.filter(item => item.localId !== row.localId))}><Trash2 className="h-4 w-4" /></Button></div>)}</div> : <p className="px-5 py-6 text-sm text-slate-500">No hub overrides. Global rules apply across all hubs.</p>}<div className="flex flex-wrap items-end gap-2 border-t border-[#e5efec] bg-[#f7fbfa] p-5"><div><Label className="text-[10px] uppercase tracking-wider text-slate-400">Hub</Label><Select value={newHub} onValueChange={setNewHub}><SelectTrigger className="mt-1 h-9 w-44"><SelectValue placeholder="Select a hub" /></SelectTrigger><SelectContent>{hubs.map((hub: any) => <SelectItem key={hub.id} value={hub.id}>{hub.name}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-[10px] uppercase tracking-wider text-slate-400">Role</Label><Select value={newRole} onValueChange={(value: IncentiveRole) => setNewRole(value)}><SelectTrigger className="mt-1 h-9 w-36"><SelectValue /></SelectTrigger><SelectContent>{CONFIGURABLE_INCENTIVE_ROLES.map(role => <SelectItem key={role} value={role}>{INCENTIVE_ROLE_LABELS[role]}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-[10px] uppercase tracking-wider text-slate-400">Rate</Label><Input className="mt-1 h-9 w-20" type="number" step={0.5} value={newPct} onChange={e => setNewPct(Number(e.target.value))} /></div><Button variant="outline" className="h-9" onClick={addOverride}><Plus className="mr-2 h-4 w-4" />Add override</Button></div></section></div><aside className="space-y-4"><section className="rounded-xl bg-[#123942] p-5 text-white"><div className="flex items-center gap-2 text-[#a7d9cc]"><ListChecks className="h-4 w-4" /><h3 className="font-semibold">How the workflow works</h3></div><div className="mt-5 space-y-5">{[['01', 'Configure', 'Save rules for future calculations.'], ['02', 'Calculate', 'The system checks coverage and builds a snapshot.'], ['03', 'Pre-approve', 'An administrator reviews recipients and exclusions.'], ['04', 'Approve and pay', 'Finance approves the locked snapshot and records payment.']].map(([number, title, text], index) => <div key={number} className="flex gap-3"><span className="font-mono text-xs text-[#e9c46a]">{number}</span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#c8ded9]">{text}</p>{index < 3 && <ArrowRight className="mt-3 h-3 w-3 rotate-90 text-[#6da89c]" />}</div></div>)}</div></section><section className="rounded-xl border border-[#d8e5e1] bg-white p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#178080]" /><h3 className="font-semibold">What is recorded</h3></div><ul className="mt-4 space-y-3 text-xs leading-5 text-slate-600"><li>Coverage gate and eligible role rates.</li><li>Pool split method and recipient counts.</li><li>Pre-approval, approval, and payment timestamps.</li><li>Excluded recipients and payment method.</li></ul></section></aside></div></div>;
}