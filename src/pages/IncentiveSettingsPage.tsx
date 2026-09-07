import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthorization } from '@/hooks/use-authorization';
import { useLocation as useLocationCtx } from '@/context/location/LocationContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  BarChart3, CircleDollarSign, Download, FileText, Info, LineChart, ListChecks, RefreshCw,
  ShieldCheck, WalletCards,
} from 'lucide-react';
import type { IncentiveConfigRow, IncentiveRole, IncentiveSplitMethod } from '@/types/incentive';
import { CONFIGURABLE_INCENTIVE_ROLES, INCENTIVE_ROLE_LABELS } from '@/types/incentive';
import {
  exportIncentiveExcel,
  exportIncentivePdf,
} from './incentiveReportExports';
import { getCurrentLanguage } from '@/lib/i18n';
import { EligibilityRoleRules } from '@/components/incentives/EligibilityRoleRules';
import { SettingsWorkspaceTranslated } from '@/components/incentives/SettingsWorkspaceTranslated';

interface GlobalRoleRow { role: IncentiveRole; isActive: boolean; bonusPct: number; splitMethod: IncentiveSplitMethod; coverageThresholdPct: number; whatCounts: string; dbId: string | null }
interface HubOverrideRow { localId: string; dbId: string | null; hubId: string; role: IncentiveRole; isActive: boolean; bonusPct: number; splitMethod: IncentiveSplitMethod; coverageThresholdPct: number; whatCounts: string; isNew: boolean; toDelete: boolean }
interface Snapshot { id: string; mmp_id: string; status: string; total_dc_fee_pool_cents: number; total_bonus_cents: number; currency: string; coordinator_count: number; supervisor_count: number; role_counts?: Partial<Record<IncentiveRole, number>> | null; pre_approved_at: string | null; approved_at: string | null; created_at: string }
interface Payment { id: string; snapshot_id?: string; mmp_id: string; user_id: string; role: string; hub_name: string | null; bonus_pct: number; bonus_amount_cents: number; currency: string; excluded: boolean; payment_method: string | null; payroll_period: string | null; paid_at: string | null; status: string; profiles?: { full_name?: string; email?: string } | null }
interface MmpName { id: string; name: string | null; mmp_id: string | null; hub_id: string | null; hub_name: string | null }
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
const monthLabel = (key: string, language: PageLanguage = 'en') => new Date(`${key}-02T12:00:00`).toLocaleDateString(language === 'ar' ? 'ar' : 'en-US', { month: 'long', year: 'numeric' });
const monthBoundsUtc = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start: start.toISOString(), end: end.toISOString() };
};
const statusLabel = (status: string) => status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const statusClass = (status: string) => ({ paid: 'bg-emerald-50 text-emerald-700 border-emerald-200', approved: 'bg-sky-50 text-sky-700 border-sky-200', pre_approved: 'bg-amber-50 text-amber-700 border-amber-200', calculating: 'bg-slate-100 text-slate-600 border-slate-200', failed: 'bg-red-50 text-red-700 border-red-200' }[status] ?? 'bg-slate-100 text-slate-600 border-slate-200');
type PageLanguage = 'en' | 'ar';
const text = (language: PageLanguage, en: string, ar: string) => language === 'ar' ? ar : en;
const roleLabel = (language: PageLanguage, role: IncentiveRole | string) => language === 'ar'
  ? ({ coordinator: 'المنسق', supervisor: 'المشرف', fom: 'مدير العمليات الميدانية', support_team: 'فريق الدعم' } as Record<string, string>)[role] ?? role
  : INCENTIVE_ROLE_LABELS[role as IncentiveRole] ?? role;
const statusText = (language: PageLanguage, status: string) => language === 'ar'
  ? ({ paid: 'مدفوع', approved: 'معتمد', pre_approved: 'معتمد مبدئياً', calculating: 'قيد الاحتساب', pending: 'قيد الانتظار', reversed: 'معكوس', failed: 'فشل' } as Record<string, string>)[status] ?? statusLabel(status)
  : statusLabel(status);
const DEFAULT_INCENTIVE_CONFIGS: Omit<GlobalRoleRow, 'dbId'>[] = [
  { role: 'coordinator', isActive: true, bonusPct: 10, splitMethod: 'proportional', coverageThresholdPct: 70, whatCounts: 'wfp_confirmed' },
  { role: 'supervisor', isActive: true, bonusPct: 7, splitMethod: 'equal', coverageThresholdPct: 70, whatCounts: 'wfp_confirmed' },
  { role: 'fom', isActive: false, bonusPct: 5, splitMethod: 'equal', coverageThresholdPct: 70, whatCounts: 'wfp_confirmed' },
  { role: 'support_team', isActive: false, bonusPct: 0, splitMethod: 'equal', coverageThresholdPct: 70, whatCounts: 'wfp_confirmed' },
];

export default function IncentiveSettingsPage() {
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const { hubs, hubStates } = useLocationCtx();
  const { toast } = useToast();
  const [language, setLanguage] = useState<PageLanguage>(() => getCurrentLanguage() === 'ar' ? 'ar' : 'en');
  const allowed = isSuperAdmin() || hasAnyRole(['admin']);
  const [section, setSection] = useState<'reports' | 'settings'>('reports');
  const [loading, setLoading] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [globalRows, setGlobalRows] = useState<GlobalRoleRow[]>(DEFAULT_INCENTIVE_CONFIGS.map(row => ({ ...row, dbId: null })));
  const coverageThreshold = globalRows[0]?.coverageThresholdPct ?? 70;
  const setCoverageThreshold = () => undefined;
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
    setLoading(true); setSettingsError(''); setSettingsLoaded(false);
    try {
      const { data, error } = await supabase.from('incentive_configs').select('*').order('hub_id', { ascending: true, nullsFirst: true });
      if (error) throw error;
      const rows = (data ?? []) as IncentiveConfigRow[];
      const globals = rows.filter(row => row.hub_id === null);
       setGlobalRows(prev => prev.map(local => {
        const db = globals.find(row => row.role === local.role);
        const fallback = DEFAULT_INCENTIVE_CONFIGS.find(item => item.role === local.role)!;
        return db ? { ...local, dbId: db.id, isActive: db.is_active, bonusPct: Number(db.bonus_pct), splitMethod: db.split_method, coverageThresholdPct: Number(db.coverage_threshold_pct ?? 70), whatCounts: db.what_counts === 'wfp_submitted' ? 'submitted' : db.what_counts ?? 'wfp_confirmed' } : rows.length === 0 ? { ...fallback, dbId: null } : local;
      }));
      setHubOverrides(rows.filter(row => row.hub_id && CONFIGURABLE_INCENTIVE_ROLES.includes(row.role)).map(row => ({ localId: row.id, dbId: row.id, hubId: row.hub_id!, role: row.role, isActive: row.is_active, bonusPct: Number(row.bonus_pct), splitMethod: row.split_method, coverageThresholdPct: Number(row.coverage_threshold_pct ?? 70), whatCounts: row.what_counts === 'wfp_submitted' ? 'submitted' : row.what_counts ?? 'wfp_confirmed', isNew: false, toDelete: false })));
      setSettingsLoaded(true);
    } catch (error: any) { setSettingsError(error.message ?? text(language, 'Unable to load settings.', 'تعذر تحميل الإعدادات.')); toast({ title: text(language, 'Unable to load settings', 'تعذر تحميل الإعدادات'), description: error.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [language, toast]);

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
            .select('id,mmp_id,status,total_dc_fee_pool_cents,total_bonus_cents,currency,coordinator_count,supervisor_count,role_counts,pre_approved_at,approved_at,created_at')
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
              .select('id,mmp_id,status,total_dc_fee_pool_cents,total_bonus_cents,currency,coordinator_count,supervisor_count,role_counts,pre_approved_at,approved_at,created_at')
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
          .select('id,name,mmp_id,hub_id')
          .in('id', mmpIds.slice(index, index + queryBatchSize));
        if (error) throw error;
        mmpRows.push(...(data ?? []).map(row => ({
          ...row,
          hub_name: hubs.find(hub => hub.id === row.hub_id)?.name ?? null,
        })) as MmpName[]);
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
  }, [hubs, reportBasis, selectedMonth]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);
  useEffect(() => { if (allowed) loadReport(); }, [allowed, loadReport]);
  useEffect(() => {
    const next: string[] = [];
    globalRows.forEach(row => { if (row.isActive && row.bonusPct === 0) next.push(`${roleLabel(language, row.role)} ${text(language, 'is active with a 0% bonus.', 'مفعّل مع حافز بنسبة 0٪.')}`); });
    if (globalRows.some(row => row.coverageThresholdPct < 0 || row.coverageThresholdPct > 100) || hubOverrides.some(row => !row.toDelete && (row.coverageThresholdPct < 0 || row.coverageThresholdPct > 100))) next.push(text(language, 'Coverage threshold must be between 0 and 100.', 'يجب أن تكون نسبة التغطية بين 0 و100.'));
    const seen = new Set<string>();
    hubOverrides.filter(row => !row.toDelete).forEach(row => { const key = `${row.hubId}:${row.role}`; if (seen.has(key)) next.push(`${text(language, 'Duplicate override for', 'يوجد تكرار في إعداد الاستثناء للمركز')} ${hubs.find(h => h.id === row.hubId)?.name ?? row.hubId}.`); seen.add(key); });
    setWarnings(next);
  }, [globalRows, hubOverrides, hubs, language]);

  const save = async () => {
     if (!settingsLoaded || settingsError) return;
     const active = hubOverrides.filter(row => !row.toDelete); const seen = new Set<string>();
    for (const row of active) { const key = `${row.hubId}:${row.role}`; if (seen.has(key)) { toast({ title: text(language, 'Duplicate override', 'استثناء مكرر'), description: text(language, 'Remove duplicate hub and role overrides before saving.', 'أزل استثناءات المركز والدور المكررة قبل الحفظ.'), variant: 'destructive' }); return; } seen.add(key); }
    setSaving(true);
    try {
       const settings = [...globalRows.map(row => ({ hub_id: null, role: row.role, is_active: row.isActive, bonus_pct: row.bonusPct, split_method: row.splitMethod, coverage_threshold_pct: row.coverageThresholdPct, what_counts: row.whatCounts })), ...active.map(row => ({ hub_id: row.hubId, role: row.role, is_active: row.isActive, bonus_pct: row.bonusPct, split_method: row.splitMethod, coverage_threshold_pct: row.coverageThresholdPct, what_counts: row.whatCounts }))];
      const { data, error } = await supabase.rpc('save_incentive_settings', { p_settings: settings });
      const result = data as { ok?: boolean; error?: string } | null;
      if (error) throw error; if (result?.ok === false) throw new Error(result.error ?? text(language, 'Settings were not saved.', 'لم يتم حفظ الإعدادات.'));
      toast({ title: text(language, 'Settings saved', 'تم حفظ الإعدادات'), description: text(language, 'The new rules apply to future MMP calculations.', 'تسري القواعد الجديدة على احتسابات MMP المستقبلية.') }); await loadConfigs();
    } catch (error: any) { toast({ title: text(language, 'Save failed', 'فشل الحفظ'), description: error.message, variant: 'destructive' }); }
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
     monthLabel: monthLabel(selectedMonth, language),
     basisLabel: reportBasis === 'payment' ? text(language, 'Payment month (paid_at)', 'شهر الدفع (paid_at)') : text(language, 'Calculation month (snapshot created_at)', 'شهر الاحتساب (snapshot created_at)'),
    monthKey: selectedMonth,
     language,
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
         status: statusText(language, snapshot.status),
        coordinators: snapshot.role_counts?.coordinator ?? snapshot.coordinator_count ?? 0,
        supervisors: snapshot.role_counts?.supervisor ?? snapshot.supervisor_count ?? 0,
        roleCounts: snapshot.role_counts ?? {},
        feePool: reportBasis === 'calculation' ? snapshot.total_dc_fee_pool_cents : null,
        bonus,
        currency,
      }));
    }),
    payments: payments.map((payment) => ({
      recipient: payment.profiles?.full_name ?? payment.user_id,
      email: payment.profiles?.email ?? '',
       role: roleLabel(language, payment.role),
      hub: payment.hub_name ?? '—',
      rate: payment.bonus_pct,
      amount: payment.bonus_amount_cents,
      currency: payment.currency,
       status: statusText(language, payment.status),
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
       toast({ title: text(language, 'Excel report exported', 'تم تصدير تقرير Excel'), description: `${monthLabel(selectedMonth, language)} ${text(language, 'is ready to download.', 'جاهز للتنزيل.')}` });
    } catch (error: any) {
       toast({ title: text(language, 'Excel export failed', 'فشل تصدير Excel'), description: error.message ?? text(language, 'The workbook could not be generated.', 'تعذر إنشاء ملف المصنف.'), variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    if (loadedReportKey !== currentReportKey) return;
    setExporting('pdf');
    try {
      await exportIncentivePdf(exportReport);
       toast({ title: text(language, 'PDF report exported', 'تم تصدير تقرير PDF'), description: `${monthLabel(selectedMonth, language)} ${text(language, 'is ready to download.', 'جاهز للتنزيل.')}` });
    } catch (error: any) {
       toast({ title: text(language, 'PDF export failed', 'فشل تصدير PDF'), description: error.message ?? text(language, 'The PDF could not be generated.', 'تعذر إنشاء ملف PDF.'), variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

   if (!allowed) return <div dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language} className="min-h-[60vh] flex items-center justify-center p-6"><div className="max-w-sm text-center"><ShieldCheck className="mx-auto h-10 w-10 text-slate-400" /><h1 className="mt-4 text-xl font-semibold">{text(language, 'Access restricted', 'الوصول مقيّد')}</h1><p className="mt-2 text-sm text-muted-foreground">{text(language, 'Only Admins and Super Admins can configure and audit incentive bonuses.', 'يستطيع المشرفون ومديرو النظام فقط إعداد حوافز المكافآت ومراجعتها.')}</p></div></div>;
   if (loading) return <div dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language} className="mx-auto max-w-6xl p-6"><div className="h-8 w-64 animate-pulse rounded bg-muted" /><div className="mt-8 grid gap-4 md:grid-cols-3"><div className="h-28 animate-pulse rounded-xl bg-muted" /><div className="h-28 animate-pulse rounded-xl bg-muted" /><div className="h-28 animate-pulse rounded-xl bg-muted" /></div></div>;

   return <div dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language} className="min-h-[100dvh] bg-[#f4f7f6] text-[#16343a]">
    <header className="border-b border-[#d8e5e1] bg-[#123942] text-white">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
           <div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a7d9cc]"><LineChart className="h-4 w-4" /> PACT {text(language, 'operations / incentives', 'العمليات / الحوافز')}</div><h1 className="mt-2 text-3xl font-bold tracking-tight">{text(language, 'Bonus control room', 'مركز إدارة المكافآت')}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#c8ded9]">{text(language, 'Set the rules for future Coordinator and Supervisor bonuses, then audit exactly what was calculated for each monthly MMP cycle.', 'اضبط قواعد مكافآت المنسقين والمشرفين المستقبلية، وراجع بدقة ما تم احتسابه لكل دورة MMP شهرية.')}</p></div>
           <div className="flex flex-wrap items-center gap-2"><button onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} className="rounded-md border border-white/20 px-3 py-2 text-sm font-medium">{language === 'en' ? 'العربية' : 'English'}</button><div className="flex rounded-lg border border-white/15 bg-white/10 p-1"><button onClick={() => setSection('reports')} className={cn('rounded-md px-4 py-2 text-sm font-medium transition-colors', section === 'reports' && 'bg-[#e9c46a] text-[#16343a]')}>{text(language, 'Monthly reports', 'التقارير الشهرية')}</button><button onClick={() => setSection('settings')} className={cn('rounded-md px-4 py-2 text-sm font-medium transition-colors', section === 'settings' && 'bg-[#e9c46a] text-[#16343a]')}>{text(language, 'Configure rules', 'إعداد القواعد')}</button></div></div>
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
     {section === 'reports' ? <ReportWorkspace {...{ language, selectedMonth, setSelectedMonth, reportBasis, setReportBasis, months, reportLoading, reportError, loadReport, snapshots, payments, mmpNames, bonusByCurrency, poolByCurrency, excluded, exportExcel, exportPdf, exporting, reportReady: loadedReportKey === currentReportKey }} /> : <><PoolSplitGuide language={language} /><SettingsWorkspaceTranslated {...{ language, coverageThreshold, setCoverageThreshold, globalRows, setGlobalRows, hubOverrides, setHubOverrides, hubs, newHub, setNewHub, newRole, setNewRole, newPct, setNewPct, warnings, save, saving, settingsLoaded, settingsError, retry: loadConfigs }} /><EligibilityRoleRules language={language} hubs={hubs} hubStates={hubStates} toast={toast} /></>}
    </main>
  </div>;
}

function ReportWorkspace(props: any) {
  const {
    language,
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
             {text(language, 'Monthly review', 'المراجعة الشهرية')}
          </p>
           <h2 className="mt-1 text-2xl font-bold">{text(language, 'Incentive report ledger', 'سجل تقارير الحوافز')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {reportBasis === 'payment'
               ? text(language, 'Payment month uses paid_at. Only non-excluded paid rows in the selected month contribute to totals; excluded rows remain visible for audit.', 'يعتمد شهر الدفع على paid_at. تساهم الصفوف المدفوعة غير المستبعدة فقط في الإجماليات؛ وتظل الصفوف المستبعدة ظاهرة للمراجعة.')
               : text(language, 'Calculation month uses snapshot created_at and includes every payment attached to those snapshots.', 'يعتمد شهر الاحتساب على created_at للقطة، ويشمل كل دفعة مرتبطة بهذه اللقطات.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={reportBasis} onValueChange={setReportBasis}>
            <SelectTrigger className="w-[220px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
             <SelectItem value="payment">{text(language, 'Payment month', 'شهر الدفع')}</SelectItem>
             <SelectItem value="calculation">{text(language, 'Calculation month', 'شهر الاحتساب')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[190px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{months.map((month: string) => <SelectItem key={month} value={month}>{monthLabel(month, language)}</SelectItem>)}</SelectContent>
          </Select>
           <Button variant="outline" onClick={loadReport} disabled={reportLoading}><RefreshCw className="mr-2 h-4 w-4" />{text(language, 'Refresh', 'تحديث')}</Button>
           <Button onClick={exportExcel} disabled={!reportReady || !!exporting || reportLoading || !snapshots.length} className="bg-[#123942] hover:bg-[#1b4d57]"><Download className="mr-2 h-4 w-4" />Excel</Button>
           <Button variant="outline" onClick={exportPdf} disabled={!reportReady || !!exporting || reportLoading || !snapshots.length}><FileText className="mr-2 h-4 w-4" />PDF</Button>
        </div>
      </div>
       {reportError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>{text(language, 'Report unavailable.', 'التقرير غير متاح.')}</strong> {reportError}<Button variant="link" className="ml-2 p-0 text-red-800" onClick={loadReport}>{text(language, 'Try again', 'حاول مرة أخرى')}</Button></div>}
      {reportLoading ? <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-white/70" />)}</div> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
             <Metric language={language} label={reportBasis === 'payment' ? text(language, 'Paid in selected month', 'المدفوع في الشهر المحدد') : text(language, 'Snapshot bonus total', 'إجمالي مكافآت اللقطات')} value={moneyByCurrency(bonusByCurrency)} icon={CircleDollarSign} tone="gold" />
             <Metric language={language} label={reportBasis === 'payment' ? text(language, 'Fee pool not restated', 'مجمّع الرسوم دون إعادة احتساب') : text(language, 'DC fee pool', 'مجمّع رسوم التوزيع')} value={moneyByCurrency(poolByCurrency)} icon={WalletCards} tone="teal" />
             <Metric language={language} label={text(language, 'MMP snapshots', 'لقطات MMP')} value={snapshots.length} icon={BarChart3} tone="navy" />
             <Metric language={language} label={text(language, 'Excluded recipients', 'المستلمون المستبعدون')} value={excluded} icon={ShieldCheck} tone="rose" />
          </div>
          <section className="overflow-hidden rounded-xl border border-[#d8e5e1] bg-white">
             <div className="border-b border-[#e5efec] px-5 py-4"><h3 className="font-semibold">{text(language, 'MMP snapshot register', 'سجل لقطات MMP')}</h3><p className="mt-1 text-xs text-slate-500">{monthLabel(selectedMonth, language)} · {reportBasis === 'payment' ? text(language, 'paid recipients only; fee pool is not restated', 'المستلمون المدفوع لهم فقط؛ دون إعادة احتساب مجمّع الرسوم') : text(language, 'snapshot totals', 'إجماليات اللقطات')}</p></div>
             {snapshots.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[#f4f8f7] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3 text-left">{text(language, 'MMP / hub', 'MMP / المركز')}</th><th className="px-3 py-3 text-left">{text(language, 'Status', 'الحالة')}</th><th className="px-3 py-3 text-right">{text(language, 'Recipients', 'المستلمون')}</th><th className="px-3 py-3 text-right">{text(language, 'Fee pool', 'مجمّع الرسوم')}</th><th className="px-5 py-3 text-right">{text(language, 'Bonus / paid', 'المكافأة / المدفوع')}</th></tr></thead><tbody className="divide-y divide-[#edf3f1]">{snapshots.map((snapshot: Snapshot) => <tr key={snapshot.id} className="hover:bg-[#f7fbfa]"><td className="px-5 py-3"><p className="font-medium">{mmpNames[snapshot.mmp_id]?.name ?? snapshot.mmp_id}</p><p className="text-xs text-slate-500">{mmpNames[snapshot.mmp_id]?.hub_name ?? text(language, 'Hub not recorded', 'لم يُسجّل المركز')}</p></td><td className="px-3 py-3"><Badge className={cn('border text-[10px]', statusClass(snapshot.status))}>{statusText(language, snapshot.status)}</Badge></td><td className="px-3 py-3 text-right text-xs">{reportBasis === 'payment' ? `${paymentRowsFor(snapshot.id).length} ${text(language, 'paid', 'مدفوع')}` : `${text(language, 'C', 'م')}: ${snapshot.role_counts?.coordinator ?? snapshot.coordinator_count ?? 0} · ${text(language, 'S', 'ش')}: ${snapshot.role_counts?.supervisor ?? snapshot.supervisor_count ?? 0} · ${text(language, 'FOM', 'م ع م')}: ${snapshot.role_counts?.fom ?? 0} · ${text(language, 'Support', 'الدعم')}: ${snapshot.role_counts?.support_team ?? 0}`}</td><td className="px-3 py-3 text-right text-xs">{reportBasis === 'payment' ? text(language, 'N/A', 'لا ينطبق') : money(snapshot.total_dc_fee_pool_cents, snapshot.currency)}</td><td className="px-5 py-3 text-right text-xs font-semibold">{reportBasis === 'payment' ? paidSummaryFor(snapshot.id) : money(snapshot.total_bonus_cents, snapshot.currency)}</td></tr>)}</tbody></table></div> : <EmptyReport language={language} month={selectedMonth} />}</section>
           <section className="overflow-hidden rounded-xl border border-[#d8e5e1] bg-white"><div className="border-b border-[#e5efec] px-5 py-4"><h3 className="font-semibold">{text(language, 'Payment detail', 'تفاصيل الدفع')}</h3><p className="mt-1 text-xs text-slate-500">{text(language, 'Non-excluded rows reconcile to the selected headline; excluded rows are retained for audit.', 'تتطابق الصفوف غير المستبعدة مع الإجمالي المعروض؛ وتُحفظ الصفوف المستبعدة للمراجعة.')}</p></div>{payments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-[#f4f8f7] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3 text-left">{text(language, 'Recipient', 'المستلم')}</th><th className="px-3 py-3 text-left">{text(language, 'Role', 'الدور')}</th><th className="px-3 py-3 text-left">{text(language, 'Currency', 'العملة')}</th><th className="px-3 py-3 text-right">{text(language, 'Amount', 'المبلغ')}</th><th className="px-5 py-3 text-left">{text(language, 'Status', 'الحالة')}</th></tr></thead><tbody className="divide-y divide-[#edf3f1]">{payments.map((payment: Payment) => <tr key={payment.id} className={cn(payment.excluded && 'opacity-60')}><td className="px-5 py-3"><p className="font-medium">{payment.profiles?.full_name ?? payment.user_id}</p><p className="text-xs text-slate-500">{payment.profiles?.email ?? text(language, 'Email not available', 'البريد الإلكتروني غير متاح')}</p></td><td className="px-3 py-3 text-xs capitalize">{roleLabel(language, payment.role)}</td><td className="px-3 py-3 text-xs">{payment.currency}</td><td className="px-3 py-3 text-right text-xs font-semibold">{money(payment.bonus_amount_cents, payment.currency)}</td><td className="px-5 py-3"><Badge className={cn('border text-[10px]', payment.excluded ? 'bg-slate-100 text-slate-500' : statusClass(payment.status))}>{payment.excluded ? text(language, 'Excluded · audit only', 'مستبعد · للمراجعة فقط') : statusText(language, payment.status)}</Badge></td></tr>)}</tbody></table></div> : <div className="p-10 text-center text-sm text-slate-500">{text(language, 'No payment records are attached to this report basis and month.', 'لا توجد سجلات دفع مرتبطة بأساس التقرير وهذا الشهر.')}</div>}</section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon, tone, language }: any) { const tones: any = { gold: 'bg-[#fff3c8] text-[#8a6811]', teal: 'bg-[#d8efea] text-[#167575]', navy: 'bg-[#dce9eb] text-[#215260]', rose: 'bg-[#f7e5df] text-[#98513c]' }; return <div className="rounded-xl border border-[#d8e5e1] bg-white p-4 shadow-[0_8px_30px_rgba(18,57,66,0.04)]"><div className="flex items-center justify-between"><div className={cn('rounded-lg p-2', tones[tone])}><Icon className="h-4 w-4" /></div><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{text(language, 'Selected month', 'الشهر المحدد')}</span></div><p className="mt-4 text-xs text-slate-500">{label}</p><p className="mt-1 truncate text-xl font-bold tracking-tight">{value}</p></div>; }
function EmptyReport({ month, language }: { month: string; language: PageLanguage }) { return <div className="p-14 text-center"><ListChecks className="mx-auto h-9 w-9 text-[#8fb8af]" /><h3 className="mt-3 font-semibold">{text(language, 'No incentive snapshots yet', 'لا توجد لقطات حوافز بعد')}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{text(language, `There are no calculated MMP snapshots for ${monthLabel(month, language)}. Try another month or return after the calculation run.`, `لا توجد لقطات MMP محتسبة لشهر ${monthLabel(month, language)}. جرّب شهراً آخر أو عد بعد اكتمال الاحتساب.`)}</p></div>; }

function PoolSplitGuide({ language }: { language: PageLanguage }) {
  return (
    <details open className="group border-b border-[#dbeae5] bg-[#f2f8f6]">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#178080]">
        <span className="mt-0.5 rounded-full bg-[#d8efea] p-1.5 text-[#167575]">
          <Info className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-[#16343a]">
             {text(language, 'How pool split works', 'كيف يعمل تقسيم المجمّع')}
             <span className="rounded-full border border-[#b9d9d0] bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#167575]">{text(language, 'Admin guide', 'دليل المشرف')}</span>
          </span>
           <span className="mt-1 block text-xs leading-5 text-slate-600">{text(language, 'A role percentage creates a hub pool, or separate qualifying state pools for proportional Coordinators; it is not paid once to every person.', 'تنشئ نسبة الدور مجمّعاً للمركز، أو مجمّعات منفصلة للولايات المؤهلة عند التوزيع النسبي للمنسقين؛ ولا تُدفع النسبة كاملة لكل شخص.')}</span>
        </span>
        <span className="mt-1 text-xs font-semibold text-[#167575] group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>
      <div className="space-y-4 px-5 pb-5 pl-16 text-xs leading-5 text-slate-600">
         <p>{text(language, 'Each rule applies its rate to the DC fee pool selected by that rule’s evidence basis: WFP confirmed or WFP submitted. The resulting pool and recipients are recorded in the snapshot.', 'تطبق كل قاعدة نسبتها على مجمّع رسوم التوزيع المحدد بأساس دليلها: المؤكد من WFP أو المقدم إلى WFP. ويُسجل المجمّع والمستلمون في اللقطة.')}</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-[#c5e0d8] bg-white p-4">
             <p className="font-semibold text-[#16343a]">{text(language, 'Proportional', 'نسبي')}</p>
             <p className="mt-1">{text(language, 'For Coordinators, proportional creates a separate pool for each qualifying state and equal-divides that state pool among its eligible Coordinators. Supervisor, FOM, and Support are hub-scoped and currently equal-divide among eligible recipients.', 'بالنسبة للمنسقين، ينشئ النسبي مجمّعاً منفصلاً لكل ولاية مؤهلة ويقسمه بالتساوي بين منسقيها المؤهلين. المشرف ومدير العمليات الميدانية وفريق الدعم محددون بالمركز ويقسمون حالياً بالتساوي بين المستحقين.')}</p>
            <p className="mt-3 rounded-md bg-[#edf6f3] px-3 py-2 font-mono text-[11px] leading-5 text-[#24545a]">Coordinator proportional: qualifying state pool ÷ eligible Coordinators in that state</p>
          </div>
          <div className="rounded-lg border border-[#c5e0d8] bg-white p-4">
             <p className="font-semibold text-[#16343a]">{text(language, 'Equal', 'متساوٍ')}</p>
             <p className="mt-1">{text(language, 'Coordinator equal uses one hub pool and divides it evenly among eligible Coordinators. For the other hub-scoped roles, the current distribution is already equal; changing this control does not promise person-level fee weighting.', 'يستخدم التوزيع المتساوي للمنسق مجمّعاً واحداً للمركز ويقسمه بالتساوي بين المنسقين المؤهلين. أما الأدوار الأخرى المحددة بالمركز فتوزيعها الحالي متساوٍ بالفعل؛ ولا يعد تغيير هذا التحكم بوزن رسوم على مستوى الشخص.')}</p>
            <p className="mt-3 rounded-md bg-[#edf6f3] px-3 py-2 font-mono text-[11px] leading-5 text-[#24545a]">person bonus = role pool ÷ eligible recipients</p>
          </div>
        </div>
        <div className="rounded-lg border border-[#ead7a1] bg-[#fffaf0] p-4">
           <p className="font-semibold text-[#6d5412]">{text(language, 'Worked example', 'مثال تطبيقي')}</p>
           <p className="mt-1">{text(language, 'With an SDG 1,000,000 applicable DC fee pool and a 5% bonus, the total bonus basis is SDG 50,000. For proportional Coordinators, each qualifying state receives 5% of its own applicable fee pool, then that state amount is divided equally among its eligible Coordinators. For an equal hub rule with three eligible recipients, SDG 50,000 is divided into approximately SDG 16,666.67 each, with remainder cents assigned deterministically.', 'مع مجمّع رسوم توزيع منطبق قدره SDG 1,000,000 ومكافأة بنسبة 5٪، يكون أساس المكافأة الإجمالي SDG 50,000. عند التوزيع النسبي للمنسقين، تحصل كل ولاية مؤهلة على 5٪ من مجمّع رسومها المنطبق، ثم يُقسم مبلغ الولاية بالتساوي بين منسقيها المؤهلين. وعند تطبيق قاعدة متساوية على مستوى المركز مع ثلاثة مستلمين مؤهلين، يُقسم مبلغ SDG 50,000 إلى نحو SDG 16,666.67 لكل شخص، مع توزيع كسور السنت بصورة حتمية.')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[#d8e5e1] bg-white p-3">
             <p className="font-semibold text-[#16343a]">{text(language, 'Coverage and eligibility', 'التغطية والأهلية')}</p>
             <p className="mt-1">{text(language, 'The coverage threshold checks the share of DC fees confirmed by WFP. Recipients who pass the snapshot eligibility rules are included; excluded recipients do not receive a payment and remain visible for audit.', 'تتحقق عتبة التغطية من حصة رسوم التوزيع التي أكدها WFP. يُدرج المستلمون الذين يستوفون قواعد الأهلية في اللقطة؛ ولا يتلقى المستبعدون دفعة ويظلون ظاهرين للمراجعة.')}</p>
          </div>
          <div className="rounded-lg border border-[#d8e5e1] bg-white p-3">
             <p className="font-semibold text-[#16343a]">{text(language, 'When changes take effect', 'متى تسري التغييرات')}</p>
             <p className="mt-1">{text(language, 'Saved changes affect future snapshots only. Existing snapshots keep the rates, split method, eligibility, and recipient counts recorded when they were calculated.', 'تؤثر التغييرات المحفوظة على اللقطات المستقبلية فقط. وتحتفظ اللقطات الحالية بالنسب وطريقة التقسيم والأهلية وأعداد المستلمين المسجلة وقت احتسابها.')}</p>
          </div>
        </div>
      </div>
    </details>
  );
}
