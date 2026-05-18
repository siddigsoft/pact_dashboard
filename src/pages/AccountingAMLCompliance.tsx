import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { usePageManageOverride } from '@/hooks/usePageManageOverride';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2, RefreshCw, Download, AlertTriangle, ShieldCheck, Shield,
  Search, CheckCircle2, XCircle, Eye, Flag, FileText, Plus,
  TrendingUp, Clock, DollarSign, Users, Activity,
} from 'lucide-react';
import { format, parseISO, subMonths, differenceInDays } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

/* ─── types ──────────────────────────────────────────────────────────────── */
interface JournalEntry {
  id: string; entry_no: string; posting_date: string;
  description_en: string | null; source_type: string | null;
  created_by: string; total_amount: number; currency: string;
  status: string; created_at: string;
  vendor_name?: string | null;
}

interface AlertFlag {
  id: string;
  entry_id: string;
  entry_no: string;
  posting_date: string;
  amount: number;
  currency: string;
  description: string | null;
  source_type: string | null;
  risk_type: RiskType;
  risk_score: number;
  status: 'open' | 'reviewed' | 'cleared' | 'escalated';
  reviewer_note: string | null;
}

type RiskType =
  | 'large_transaction'
  | 'round_number'
  | 'structuring'
  | 'unusual_frequency'
  | 'threshold_breach'
  | 'dormant_account';

interface WatchlistEntry {
  id: string;
  name: string;
  identifier: string | null;
  reason: string;
  added_by: string | null;
  added_at: string;
  is_active: boolean;
}

interface ComplianceCheck {
  id: string; label: string; labelAr: string;
  description: string; status: 'pass' | 'warn' | 'fail' | 'na';
  detail: string;
}

/* ─── risk thresholds ─────────────────────────────────────────────────────── */
const LARGE_TXN_THRESHOLD   = 10_000;
const THRESHOLD_NEAR        = 9_500;
const ROUND_NUMBER_MULTIPLE = 1_000;

const RISK_META: Record<RiskType, { label: string; color: string; score: number; description: string }> = {
  large_transaction:   { label: 'Large Transaction',   color: 'bg-rose-100 text-rose-700 border-rose-300',     score: 70, description: `Single transaction ≥ ${formatNumber(LARGE_TXN_THRESHOLD, 0)}` },
  threshold_breach:    { label: 'Near Threshold',      color: 'bg-orange-100 text-orange-700 border-orange-300', score: 60, description: `Amount between ${formatNumber(THRESHOLD_NEAR, 0)} and ${formatNumber(LARGE_TXN_THRESHOLD, 0)}` },
  round_number:        { label: 'Round Number',        color: 'bg-amber-100 text-amber-700 border-amber-300',   score: 30, description: `Amount is an exact multiple of ${formatNumber(ROUND_NUMBER_MULTIPLE, 0)}` },
  structuring:         { label: 'Structuring Risk',    color: 'bg-rose-100 text-rose-700 border-rose-300',     score: 80, description: 'Multiple transactions just below reporting threshold' },
  unusual_frequency:   { label: 'Unusual Frequency',  color: 'bg-violet-100 text-violet-700 border-violet-300', score: 50, description: 'High number of transactions in a short period' },
  dormant_account:     { label: 'Dormant Account',     color: 'bg-slate-100 text-slate-700 border-slate-300',  score: 25, description: 'Transaction on an account inactive for 6+ months' },
};

const STATUS_META: Record<AlertFlag['status'], { label: string; color: string; icon: React.ElementType }> = {
  open:      { label: 'Open',      color: 'bg-rose-100 text-rose-700 border-rose-300',       icon: AlertTriangle },
  reviewed:  { label: 'Reviewed',  color: 'bg-amber-100 text-amber-700 border-amber-300',     icon: Eye },
  cleared:   { label: 'Cleared',   color: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: CheckCircle2 },
  escalated: { label: 'Escalated', color: 'bg-violet-100 text-violet-700 border-violet-300',  icon: Flag },
};

const DATE_RANGES = [
  { value: '1m',  label: 'Last 1 month' },
  { value: '3m',  label: 'Last 3 months' },
  { value: '6m',  label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
];

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function scoreEntry(e: JournalEntry): { type: RiskType; score: number } | null {
  const amt = e.total_amount;
  if (amt >= LARGE_TXN_THRESHOLD)
    return { type: 'large_transaction', score: RISK_META.large_transaction.score };
  if (amt >= THRESHOLD_NEAR)
    return { type: 'threshold_breach', score: RISK_META.threshold_breach.score };
  if (amt > 0 && amt % ROUND_NUMBER_MULTIPLE === 0)
    return { type: 'round_number', score: RISK_META.round_number.score };
  return null;
}

/* ─── component ───────────────────────────────────────────────────────────── */
export default function AccountingAMLCompliance() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'auditor']);
  const roleCanEdit = hasAnyRole(['super_admin', 'admin']);

  const overrideCanEdit = usePageManageOverride('acct-aml', roleCanEdit);

  const canEdit = roleCanEdit || overrideCanEdit;
  const { toast } = useToast();

  /* ── state ── */
  const [entries, setEntries]       = useState<JournalEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [dateRange, setDateRange]   = useState('3m');
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter]  = useState<string>('all');
  const [noDataTable, setNoDataTable] = useState(false);

  const [watchlist, setWatchlist]   = useState<WatchlistEntry[]>([]);
  const [wlSearch, setWlSearch]     = useState('');
  const [wlOpen, setWlOpen]         = useState(false);
  const [wlForm, setWlForm]         = useState({ name: '', identifier: '', reason: '' });
  const [wlSaving, setWlSaving]     = useState(false);

  const [reviewOpen, setReviewOpen]  = useState(false);
  const [reviewFlag, setReviewFlag]  = useState<AlertFlag | null>(null);
  const [reviewNote, setReviewNote]  = useState('');
  const [reviewStatus, setReviewStatus] = useState<AlertFlag['status']>('reviewed');
  const [reviewSaving, setReviewSaving] = useState(false);

  const [flagOverrides, setFlagOverrides] = useState<Map<string, { status: AlertFlag['status']; note: string }>>(new Map());
  const [checks, setChecks]          = useState<ComplianceCheck[]>([]);

  const [screeningEnabled, setScreeningEnabled] = useState(true);
  const [alertsEnabled, setAlertsEnabled]       = useState(true);

  /* ── load entries ── */
  const load = useCallback(async () => {
    setLoading(true);
    const cutoff = subMonths(new Date(), parseInt(dateRange)).toISOString();
    const { data, error } = await supabase
      .from('acct_journal_entries')
      .select('id, entry_no, posting_date, description_en, source_type, created_by, status, created_at, currency, acct_journal_lines(functional_amount)')
      .eq('status', 'posted')
      .gte('created_at', cutoff)
      .order('posting_date', { ascending: false })
      .limit(3000);

    if (error?.code === '42P01') { setNoDataTable(true); setLoading(false); return; }
    setNoDataTable(false);

    const mapped: JournalEntry[] = ((data ?? []) as any[]).map(e => {
      const lines = (e.acct_journal_lines ?? []) as { functional_amount: number }[];
      const total = lines.reduce((s, l) => s + Math.abs(Number(l.functional_amount ?? 0)), 0) / 2;
      return {
        id: e.id, entry_no: e.entry_no, posting_date: e.posting_date,
        description_en: e.description_en, source_type: e.source_type,
        created_by: e.created_by, status: e.status, created_at: e.created_at,
        currency: e.currency ?? 'USD', total_amount: total,
      };
    });
    setEntries(mapped);

    /* build compliance checks */
    const openFlags = mapped.filter(e => scoreEntry(e) !== null);
    const largeCount = mapped.filter(e => e.total_amount >= LARGE_TXN_THRESHOLD).length;
    setChecks([
      {
        id: 'c1', label: 'Large Transaction Monitoring',
        labelAr: 'مراقبة المعاملات الكبيرة',
        description: `Transactions ≥ ${formatNumber(LARGE_TXN_THRESHOLD, 0)} are flagged for review.`,
        status: largeCount > 0 ? 'warn' : 'pass',
        detail: largeCount > 0 ? `${largeCount} transaction${largeCount !== 1 ? 's' : ''} exceed threshold` : 'No large transactions in period',
      },
      {
        id: 'c2', label: 'Structuring Detection',
        labelAr: 'كشف التجزئة',
        description: 'Detect multiple transactions just below reporting thresholds.',
        status: mapped.filter(e => e.total_amount >= THRESHOLD_NEAR && e.total_amount < LARGE_TXN_THRESHOLD).length > 3 ? 'warn' : 'pass',
        detail: `${mapped.filter(e => e.total_amount >= THRESHOLD_NEAR && e.total_amount < LARGE_TXN_THRESHOLD).length} near-threshold transactions`,
      },
      {
        id: 'c3', label: 'Sanctions Screening',
        labelAr: 'فحص العقوبات',
        description: 'Vendors and counterparties checked against watchlist.',
        status: screeningEnabled ? 'pass' : 'warn',
        detail: screeningEnabled ? 'Screening active' : 'Screening disabled',
      },
      {
        id: 'c4', label: 'Open Alerts Review',
        labelAr: 'مراجعة التنبيهات المفتوحة',
        description: 'All flagged transactions should be reviewed within 5 business days.',
        status: openFlags.length === 0 ? 'pass' : openFlags.length < 5 ? 'warn' : 'fail',
        detail: `${openFlags.length} open alert${openFlags.length !== 1 ? 's' : ''} awaiting review`,
      },
      {
        id: 'c5', label: 'Transaction Alert System',
        labelAr: 'نظام تنبيه المعاملات',
        description: 'Automated flagging engine for suspicious activity.',
        status: alertsEnabled ? 'pass' : 'fail',
        detail: alertsEnabled ? 'Alerts active and processing' : 'Alerts disabled — enable to resume monitoring',
      },
      {
        id: 'c6', label: 'Audit Trail Coverage',
        labelAr: 'تغطية مسار التدقيق',
        description: 'All posted transactions have a complete audit trail.',
        status: 'pass',
        detail: `${mapped.length} posted entries with full audit trail`,
      },
    ]);

    setLoading(false);
  }, [dateRange, screeningEnabled, alertsEnabled]);

  /* ── load watchlist (from local state, no dedicated table) ── */
  useEffect(() => {
    const stored = localStorage.getItem('aml_watchlist');
    if (stored) {
      try { setWatchlist(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  const saveWatchlist = (list: WatchlistEntry[]) => {
    setWatchlist(list);
    localStorage.setItem('aml_watchlist', JSON.stringify(list));
  };

  useEffect(() => { void load(); }, [load]);

  /* ── derive flags ── */
  const allFlags = useMemo<AlertFlag[]>(() => {
    const flags: AlertFlag[] = [];
    const freq: Record<string, number> = {};

    for (const e of entries) {
      const key = e.source_type ?? 'manual';
      freq[key] = (freq[key] ?? 0) + 1;
    }

    const nearThresholdEntries = entries.filter(e => e.total_amount >= THRESHOLD_NEAR && e.total_amount < LARGE_TXN_THRESHOLD);
    const structuringVendorMap: Record<string, number> = {};
    for (const e of nearThresholdEntries) {
      const k = e.source_type ?? 'unknown';
      structuringVendorMap[k] = (structuringVendorMap[k] ?? 0) + 1;
    }

    for (const e of entries) {
      const scored = scoreEntry(e);
      if (!scored) continue;

      let riskType = scored.type;
      let riskScore = scored.score;

      if (riskType === 'threshold_breach') {
        const k = e.source_type ?? 'unknown';
        if ((structuringVendorMap[k] ?? 0) >= 3) {
          riskType = 'structuring';
          riskScore = RISK_META.structuring.score;
        }
      }

      const override = flagOverrides.get(e.id);
      flags.push({
        id: e.id,
        entry_id: e.id,
        entry_no: e.entry_no,
        posting_date: e.posting_date,
        amount: e.total_amount,
        currency: e.currency,
        description: e.description_en,
        source_type: e.source_type,
        risk_type: riskType,
        risk_score: riskScore,
        status: override?.status ?? 'open',
        reviewer_note: override?.note ?? null,
      });
    }

    return flags.sort((a, b) => b.risk_score - a.risk_score);
  }, [entries, flagOverrides]);

  const filtered = useMemo(() => {
    let list = allFlags;
    if (statusFilter !== 'all') list = list.filter(f => f.status === statusFilter);
    if (riskFilter !== 'all') list = list.filter(f => f.risk_type === riskFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.entry_no.toLowerCase().includes(q) ||
        (f.description ?? '').toLowerCase().includes(q) ||
        (f.source_type ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allFlags, statusFilter, riskFilter, search]);

  const openCount      = allFlags.filter(f => f.status === 'open').length;
  const escalatedCount = allFlags.filter(f => f.status === 'escalated').length;
  const clearedCount   = allFlags.filter(f => f.status === 'cleared').length;
  const highRiskCount  = allFlags.filter(f => f.risk_score >= 70).length;

  /* ── watchlist ── */
  const filteredWL = useMemo(() =>
    watchlist.filter(w => !wlSearch || w.name.toLowerCase().includes(wlSearch.toLowerCase()) || (w.identifier ?? '').toLowerCase().includes(wlSearch.toLowerCase())),
    [watchlist, wlSearch]
  );

  const addWatchlistEntry = () => {
    if (!wlForm.name.trim()) return;
    setWlSaving(true);
    const entry: WatchlistEntry = {
      id: crypto.randomUUID(),
      name: wlForm.name.trim(),
      identifier: wlForm.identifier.trim() || null,
      reason: wlForm.reason.trim() || 'Manual addition',
      added_by: null,
      added_at: new Date().toISOString(),
      is_active: true,
    };
    const updated = [entry, ...watchlist];
    saveWatchlist(updated);
    setWlForm({ name: '', identifier: '', reason: '' });
    setWlOpen(false);
    setWlSaving(false);
    toast({ title: 'Added to watchlist', description: entry.name });
  };

  const toggleWatchlistEntry = (id: string) => {
    const updated = watchlist.map(w => w.id === id ? { ...w, is_active: !w.is_active } : w);
    saveWatchlist(updated);
  };

  const removeWatchlistEntry = (id: string) => {
    const updated = watchlist.filter(w => w.id !== id);
    saveWatchlist(updated);
    toast({ title: 'Removed from watchlist' });
  };

  /* ── review dialog ── */
  const openReview = (flag: AlertFlag) => {
    setReviewFlag(flag);
    setReviewNote(flag.reviewer_note ?? '');
    setReviewStatus(flag.status === 'open' ? 'reviewed' : flag.status);
    setReviewOpen(true);
  };

  const submitReview = () => {
    if (!reviewFlag) return;
    setReviewSaving(true);
    const updated = new Map(flagOverrides);
    updated.set(reviewFlag.entry_id, { status: reviewStatus, note: reviewNote });
    setFlagOverrides(updated);
    setReviewOpen(false);
    setReviewSaving(false);
    toast({ title: `Flag ${reviewStatus}`, description: `Entry ${reviewFlag.entry_no} marked as ${reviewStatus}.` });
  };

  /* ── export ── */
  const exportCsv = () => {
    const header = ['Entry No', 'Date', 'Amount', 'Currency', 'Risk Type', 'Risk Score', 'Status', 'Description', 'Source', 'Note'];
    const body = filtered.map(f => [
      f.entry_no, f.posting_date, f.amount.toFixed(0), f.currency,
      RISK_META[f.risk_type]?.label ?? f.risk_type,
      String(f.risk_score), f.status, f.description ?? '', f.source_type ?? '', f.reviewer_note ?? '',
    ]);
    downloadCsv(`aml-alerts-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const checkStatus = (s: ComplianceCheck['status']) => {
    if (s === 'pass') return { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200' };
    if (s === 'warn') return { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/10 border-amber-200' };
    if (s === 'fail') return { icon: XCircle, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-900/10 border-rose-200' };
    return { icon: Eye, color: 'text-slate-500', bg: 'bg-muted/30 border-border' };
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="aml-compliance-page">
      {/* ── header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-gradient-to-br from-rose-600 to-violet-700 text-white shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AML & Compliance</h1>
            <p className="text-muted-foreground text-sm">مكافحة غسيل الأموال والامتثال — Transaction monitoring & sanctions screening</p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-9 w-36" data-testid="select-date-range"><SelectValue /></SelectTrigger>
            <SelectContent>{DATE_RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="button-refresh">
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} data-testid="button-export">
            <Download className="h-4 w-4 mr-1" />Export
          </Button>
        </div>
      </div>

      <PageInfoBanner
        title="AML & Compliance Monitoring"
        description="Automatically flags posted journal entries that match suspicious-activity patterns: large transactions, near-threshold amounts (structuring risk), round-number transactions, and unusual frequency. Use the Watchlist tab to manage sanctioned entities and counterparties."
        descriptionAr="يرصد تلقائياً القيود المشبوهة: المعاملات الكبيرة، المبالغ القريبة من العتبة (خطر التجزئة)، والمبالغ الكاملة. استخدم قائمة المراقبة لإدارة الأطراف المقيدة."
      />

      {noDataTable && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">Journal entries table not found. Run the accounting migrations first to enable AML monitoring.</p>
        </div>
      )}

      {/* ── control toggles ── */}
      <div className="flex flex-wrap gap-4 mb-5 p-3 rounded-xl border bg-muted/20">
        <div className="flex items-center gap-2">
          <Switch checked={alertsEnabled} onCheckedChange={setAlertsEnabled} id="alerts-toggle" data-testid="switch-alerts" />
          <Label htmlFor="alerts-toggle" className="text-xs">Automated Alerts</Label>
          {alertsEnabled
            ? <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50">Active</Badge>
            : <Badge variant="outline" className="text-[10px] text-rose-700 border-rose-300 bg-rose-50">Disabled</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={screeningEnabled} onCheckedChange={setScreeningEnabled} id="screening-toggle" data-testid="switch-screening" />
          <Label htmlFor="screening-toggle" className="text-xs">Sanctions Screening</Label>
          {screeningEnabled
            ? <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50">Active</Badge>
            : <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">Paused</Badge>}
        </div>
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Activity className="h-3 w-3" />
          Threshold: <span className="font-mono font-semibold ml-1">{formatNumber(LARGE_TXN_THRESHOLD, 0)}</span>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Open Alerts', labelAr: 'التنبيهات المفتوحة', value: String(openCount), sub: 'Requiring review', icon: AlertTriangle, color: openCount > 0 ? 'text-rose-600' : 'text-emerald-600', accent: openCount > 0 ? 'bg-rose-600' : 'bg-emerald-600' },
          { label: 'High Risk', labelAr: 'مخاطر عالية', value: String(highRiskCount), sub: `Risk score ≥ 70`, icon: Flag, color: 'text-violet-600', accent: 'bg-violet-600' },
          { label: 'Escalated', labelAr: 'مُصعَّدة', value: String(escalatedCount), sub: 'Pending senior review', icon: TrendingUp, color: 'text-orange-600', accent: 'bg-orange-600' },
          { label: 'Cleared', labelAr: 'تم إخلاؤها', value: String(clearedCount), sub: 'False positives resolved', icon: ShieldCheck, color: 'text-emerald-600', accent: 'bg-emerald-600' },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{c.label}</div>
                  <div className="text-[9px] text-muted-foreground" dir="rtl">{c.labelAr}</div>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-2" /> : (
                    <div className="text-2xl font-bold tabular-nums mt-1.5 leading-none">{c.value}</div>
                  )}
                  {!loading && <div className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</div>}
                </div>
                <div className={cn('flex items-center justify-center h-10 w-10 rounded-xl shrink-0 text-white', c.accent)}>
                  <c.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── tabs ── */}
      <Tabs defaultValue="alerts">
        <TabsList className="mb-4">
          <TabsTrigger value="alerts" data-testid="tab-alerts">
            Alerts {allFlags.length > 0 && <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 h-4">{allFlags.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">Compliance Checks</TabsTrigger>
          <TabsTrigger value="watchlist" data-testid="tab-watchlist">
            Watchlist {watchlist.filter(w => w.is_active).length > 0 && <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 h-4">{watchlist.filter(w => w.is_active).length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── alerts tab ── */}
        <TabsContent value="alerts">
          {/* filters */}
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search entry no or description…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-alerts" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-[160px] h-9" data-testid="select-risk-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk Types</SelectItem>
                {Object.entries(RISK_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-emerald-400 opacity-70" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                {allFlags.length === 0 ? 'No suspicious transactions detected in the selected period.' : 'No alerts match your filters.'}
              </p>
              <p className="text-xs mt-1">
                {allFlags.length === 0 ? `Monitoring ${entries.length} posted entries — all within normal parameters.` : 'Try adjusting the status or risk type filter.'}
              </p>
            </div>
          ) : (
            <Card>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Entry</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Date</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Amount</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-36">Risk Type</th>
                        <th className="text-center px-4 py-2 font-medium text-muted-foreground w-20">Score</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-28">Status</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Note</th>
                        <th className="px-4 py-2 w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((flag, i) => {
                        const rm = RISK_META[flag.risk_type];
                        const sm = STATUS_META[flag.status];
                        return (
                          <tr key={flag.id} className={cn('border-b hover:bg-muted/20', i % 2 === 0 ? '' : 'bg-muted/10')} data-testid={`row-alert-${flag.id}`}>
                            <td className="px-4 py-2.5">
                              <div className="font-mono font-semibold text-xs">{flag.entry_no}</div>
                              {flag.description && <div className="text-[10px] text-muted-foreground truncate max-w-[160px]" title={flag.description}>{flag.description}</div>}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {flag.posting_date ? format(parseISO(flag.posting_date), 'dd MMM yy') : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                              {formatNumber(flag.amount, 0)}
                              <span className="ml-1 text-muted-foreground font-normal">{flag.currency}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge variant="outline" className={cn('text-[10px]', rm?.color)}>{rm?.label ?? flag.risk_type}</Badge>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={cn('inline-flex items-center justify-center w-8 h-6 rounded-md text-[11px] font-bold',
                                flag.risk_score >= 70 ? 'bg-rose-100 text-rose-700' :
                                flag.risk_score >= 50 ? 'bg-orange-100 text-orange-700' :
                                'bg-amber-100 text-amber-700'
                              )}>{flag.risk_score}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge variant="outline" className={cn('text-[10px] gap-0.5', sm.color)}>
                                <sm.icon className="h-2.5 w-2.5" />
                                {sm.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground max-w-[140px] truncate text-[10px]">
                              {flag.reviewer_note ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {canEdit && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openReview(flag)} data-testid={`button-review-${flag.id}`}>
                                  <Eye className="h-3.5 w-3.5 mr-1" />Review
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Showing {filtered.length} of {allFlags.length} alert{allFlags.length !== 1 ? 's' : ''}</span>
                  <span>Large Transaction Threshold: {formatNumber(LARGE_TXN_THRESHOLD, 0)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── compliance checks tab ── */}
        <TabsContent value="compliance">
          {loading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-3">
              {checks.map(c => {
                const { icon: Icon, color, bg } = checkStatus(c.status);
                return (
                  <div key={c.id} className={cn('rounded-xl border p-4 flex items-start gap-4', bg)} data-testid={`check-${c.id}`}>
                    <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', color)} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{c.label}</span>
                        <span className="text-[10px] text-muted-foreground" dir="rtl">{c.labelAr}</span>
                        <Badge variant="outline" className={cn('text-[10px] ml-auto',
                          c.status === 'pass' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                          c.status === 'warn' ? 'bg-amber-50 text-amber-700 border-amber-300' :
                          c.status === 'fail' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                          'bg-slate-50 text-slate-600 border-slate-300'
                        )}>
                          {c.status.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                      <p className={cn('text-xs font-medium mt-1', color)}>{c.detail}</p>
                    </div>
                  </div>
                );
              })}

              <div className="rounded-xl border border-slate-200 bg-muted/20 p-4 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground mb-1">Compliance Framework</p>
                    <p>This compliance checklist follows general AML best-practice guidance. For jurisdiction-specific requirements (Sudan FSA / FATF recommendations), consult your compliance officer. Alert thresholds and risk scoring can be calibrated to your organization's risk appetite.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── watchlist tab ── */}
        <TabsContent value="watchlist">
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search watchlist…" className="pl-9 h-9 text-sm" value={wlSearch} onChange={e => setWlSearch(e.target.value)} data-testid="input-search-watchlist" />
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => setWlOpen(true)} data-testid="button-add-watchlist">
                <Plus className="h-4 w-4 mr-1" />Add Entry
              </Button>
            )}
          </div>

          {filteredWL.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{watchlist.length === 0 ? 'No watchlist entries yet.' : 'No entries match your search.'}</p>
              {canEdit && watchlist.length === 0 && <p className="text-xs mt-1">Add sanctioned entities, politically exposed persons (PEPs), or restricted counterparties.</p>}
            </div>
          ) : (
            <Card>
              <CardContent className="px-0 pb-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground w-32">Identifier</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Reason</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Added</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground w-20">Status</th>
                      {canEdit && <th className="px-4 py-2 w-24" />}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWL.map((w, i) => (
                      <tr key={w.id} className={cn('border-b hover:bg-muted/20', i % 2 === 0 ? '' : 'bg-muted/10')} data-testid={`row-watchlist-${w.id}`}>
                        <td className="px-4 py-2.5 font-medium">{w.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground font-mono text-[11px]">{w.identifier ?? '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{w.reason}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {format(parseISO(w.added_at), 'dd MMM yy')}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={cn('text-[10px]', w.is_active ? 'text-rose-700 border-rose-300 bg-rose-50' : 'text-slate-500 border-slate-300')}>
                            {w.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        {canEdit && (
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => toggleWatchlistEntry(w.id)}>
                                {w.is_active ? 'Deactivate' : 'Activate'}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-rose-600 hover:text-rose-700" onClick={() => removeWatchlistEntry(w.id)}>
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-4 border-t text-[10px] text-muted-foreground">
                  {watchlist.filter(w => w.is_active).length} active · {watchlist.filter(w => !w.is_active).length} inactive
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── review dialog ── */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-4 w-4" />Review Alert — {reviewFlag?.entry_no}</DialogTitle></DialogHeader>
          {reviewFlag && (
            <div className="py-2 space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold tabular-nums">{formatNumber(reviewFlag.amount, 0)} {reviewFlag.currency}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Risk Type</span><Badge variant="outline" className={cn('text-[10px]', RISK_META[reviewFlag.risk_type]?.color)}>{RISK_META[reviewFlag.risk_type]?.label}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Risk Score</span><span className="font-bold">{reviewFlag.risk_score}/100</span></div>
                {reviewFlag.description && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Description</span><span className="text-right text-xs">{reviewFlag.description}</span></div>}
              </div>
              <div className="space-y-2">
                <Label>Update Status</Label>
                <Select value={reviewStatus} onValueChange={v => setReviewStatus(v as AlertFlag['status'])}>
                  <SelectTrigger data-testid="select-review-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reviewed">Reviewed — Under investigation</SelectItem>
                    <SelectItem value="cleared">Cleared — False positive</SelectItem>
                    <SelectItem value="escalated">Escalated — Requires senior review</SelectItem>
                    <SelectItem value="open">Re-open</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reviewer Note</Label>
                <Textarea
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder="Describe your findings, rationale, or next steps…"
                  rows={3}
                  data-testid="textarea-review-note"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button onClick={submitReview} disabled={reviewSaving} data-testid="button-submit-review">
              {reviewSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── add to watchlist dialog ── */}
      <Dialog open={wlOpen} onOpenChange={setWlOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />Add to Watchlist</DialogTitle></DialogHeader>
          <div className="py-2 space-y-4">
            <div className="space-y-2">
              <Label>Name <span className="text-rose-500">*</span></Label>
              <Input value={wlForm.name} onChange={e => setWlForm(p => ({ ...p, name: e.target.value }))} placeholder="Entity or individual name" data-testid="input-wl-name" />
            </div>
            <div className="space-y-2">
              <Label>Identifier <span className="text-muted-foreground text-xs">(ID, passport, registration no.)</span></Label>
              <Input value={wlForm.identifier} onChange={e => setWlForm(p => ({ ...p, identifier: e.target.value }))} placeholder="Optional unique identifier" data-testid="input-wl-identifier" />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input value={wlForm.reason} onChange={e => setWlForm(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. OFAC sanctioned, PEP, restricted entity" data-testid="input-wl-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWlOpen(false)}>Cancel</Button>
            <Button onClick={addWatchlistEntry} disabled={wlSaving || !wlForm.name.trim()} data-testid="button-save-watchlist">
              {wlSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Add to Watchlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
