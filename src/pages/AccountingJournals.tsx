import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, Download, RefreshCw, FileText, Eye, Plus, Trash2, AlertTriangle, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ACCT_STATUS_TONE, formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useAccountingCountry } from '@/hooks/use-accounting-country';
import { Textarea } from '@/components/ui/textarea';

interface Period { id: string; period_no: number; start_date: string; end_date: string; status: string; fiscal_year_id: string }
interface FiscalYear { id: string; code: string }
interface Country { id: string; code: string; name_en: string; flag_emoji: string | null; currency_code: string }
interface Entry {
  id: string;
  entry_no: number;
  period_id: string;
  posting_date: string;
  description_en: string;
  description_ar: string | null;
  source_type: string;
  source_id: string | null;
  status: 'draft' | 'pending_approval' | 'posted' | 'reversed' | 'rejected';
  branch_id: string | null;
  idempotency_key: string;
  posted_at: string | null;
  posted_by: string | null;
  created_at: string;
  created_by: string;
  reversed_by_entry_id: string | null;
  country_id: string | null;
}
interface Line {
  id: string;
  line_no: number;
  account_id: string;
  fund_id: string;
  function: string;
  partner_id: string | null;
  project_id: string | null;
  cost_center_id: string | null;
  original_amount: number;
  original_currency: string;
  functional_amount: number;
  functional_currency: string;
  fx_rate: number | null;
  debit_credit: 'DR' | 'CR';
  description: string | null;
}

const PAGE_SIZE = 50;

interface NewLine {
  account_id: string;
  fund_id: string;
  function: string;
  debit_credit: 'DR' | 'CR';
  amount: string;
  currency: string;
  description: string;
}

const BLANK_LINE = (): NewLine => ({
  account_id: '', fund_id: '', function: 'none',
  debit_credit: 'DR', amount: '', currency: 'SDG', description: '',
});

export default function AccountingJournals() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed   = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canPost   = hasAnyRole(['super_admin', 'finance', 'accountant']);
  const { toast } = useToast();
  const { countryId: defaultCountryId } = useAccountingCountry();

  const [years, setYears] = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [accountsMap, setAccountsMap] = useState<Record<string, { code: string; name_en: string; name_ar: string; country_id: string | null; is_postable: boolean }>>({});
  const [fundsMap, setFundsMap] = useState<Record<string, { code: string; name_en: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [periodFilter, setPeriodFilter]   = useState<string>('all');
  const [statusFilter, setStatusFilter]   = useState<string>('all');
  const [sourceFilter, setSourceFilter]   = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>(() => defaultCountryId);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [openLines, setOpenLines] = useState<Line[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  // ── New entry form ──────────────────────────────────────
  const [newOpen, setNewOpen]               = useState(false);
  const [newPeriodId, setNewPeriodId]       = useState('');
  const [newDate, setNewDate]               = useState('');
  const [newDescEn, setNewDescEn]           = useState('');
  const [newDescAr, setNewDescAr]           = useState('');
  const [newLines, setNewLines]             = useState<NewLine[]>([BLANK_LINE(), BLANK_LINE()]);
  const [submitting, setSubmitting]         = useState(false);
  const [newCountryId, setNewCountryId]     = useState<string>('all');
  const [backdateReason, setBackdateReason] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  // ── Backdate helpers ──────────────────────────────────
  const selectedPeriod     = periods.find(p => p.id === newPeriodId);
  const isBackdate         = !!newDate && newDate < today;
  const periodSoftClosed   = selectedPeriod?.status === 'soft_closed';
  const periodHardBlocked  = selectedPeriod?.status === 'hard_closed' || selectedPeriod?.status === 'locked';
  const periodNotOpen      = !!selectedPeriod && selectedPeriod.status !== 'open';
  const dateMismatch       = !!selectedPeriod && !!newDate && (
    newDate < selectedPeriod.start_date || newDate > selectedPeriod.end_date
  );
  // Reason required when backdating to an open period, or posting to a soft-closed period
  const needsReason        = isBackdate || periodSoftClosed;
  // Hard-blocked: cannot post at all — must reopen the period first
  const isBlocked          = periodHardBlocked;

  // Auto-suggest the period that contains the chosen date
  const handleDateChange = (d: string) => {
    setNewDate(d);
    if (!d) return;
    const match = periods.find(p => d >= p.start_date && d <= p.end_date);
    if (match && match.id !== newPeriodId) setNewPeriodId(match.id);
  };

  const openNewEntry = () => {
    const firstOpen = periods.find(p => p.status === 'open');
    setNewPeriodId(firstOpen?.id ?? '');
    setNewDate(today);
    setNewDescEn('');
    setNewDescAr('');
    setNewCountryId(defaultCountryId);
    setNewLines([BLANK_LINE(), BLANK_LINE()]);
    setBackdateReason('');
    setNewOpen(true);
  };

  const setLineField = (idx: number, k: keyof NewLine, v: string) =>
    setNewLines(prev => prev.map((l, i) => i === idx ? { ...l, [k]: v } : l));

  const addLine = () => setNewLines(prev => [...prev, BLANK_LINE()]);
  const removeLine = (idx: number) => setNewLines(prev => prev.filter((_, i) => i !== idx));

  const newLineDrTotal = newLines.reduce((s, l) => l.debit_credit === 'DR' ? s + (Number(l.amount) || 0) : s, 0);
  const newLineCrTotal = newLines.reduce((s, l) => l.debit_credit === 'CR' ? s + (Number(l.amount) || 0) : s, 0);
  const newBalanced    = Math.abs(newLineDrTotal - newLineCrTotal) < 0.005;

  const selectedCountry = countries.find(c => c.id === newCountryId);
  const dialogCurrency  = selectedCountry?.currency_code ?? 'USD';

  const filteredAccountsForDialog = useMemo(() =>
    Object.entries(accountsMap).filter(([, a]) =>
      a.is_postable && (newCountryId === 'all' || a.country_id === newCountryId)
    ),
    [accountsMap, newCountryId],
  );

  const submitEntry = async () => {
    if (!newPeriodId) { toast({ title: 'Select a period', variant: 'destructive' }); return; }
    if (isBlocked) {
      toast({ title: 'Period is closed', description: `Cannot post to a ${selectedPeriod?.status} period. Reopen the period first.`, variant: 'destructive' });
      return;
    }
    if (!newDescEn.trim()) { toast({ title: 'English description is required', variant: 'destructive' }); return; }
    if (needsReason && !backdateReason.trim()) {
      toast({ title: 'Backdate reason is required', description: 'Explain why this entry is being posted to a past date or closed period.', variant: 'destructive' });
      return;
    }
    if (newLines.length < 2) { toast({ title: 'At least 2 lines required', variant: 'destructive' }); return; }
    if (!newBalanced) { toast({ title: 'Debits and credits must balance', variant: 'destructive' }); return; }
    for (const [i, l] of newLines.entries()) {
      if (!l.account_id) { toast({ title: `Line ${i + 1}: select an account`, variant: 'destructive' }); return; }
      if (!l.fund_id)    { toast({ title: `Line ${i + 1}: select a fund`,    variant: 'destructive' }); return; }
      if (!l.amount || Number(l.amount) <= 0) { toast({ title: `Line ${i + 1}: enter a positive amount`, variant: 'destructive' }); return; }
    }
    setSubmitting(true);
    const funcCcy = selectedCountry?.currency_code ?? 'USD';
    const descEn = needsReason && backdateReason.trim()
      ? `${newDescEn.trim()} [Backdated: ${backdateReason.trim()}]`
      : newDescEn.trim();
    const payload = {
      period_id:      newPeriodId,
      posting_date:   newDate,
      description_en: descEn,
      description_ar: newDescAr.trim() || null,
      source_type:    'manual',
      lines: newLines.map((l, idx) => ({
        account_id:          l.account_id,
        fund_id:             l.fund_id,
        function:            l.function,
        debit_credit:        l.debit_credit,
        functional_amount:   Number(l.amount),
        original_amount:     Number(l.amount),
        original_currency:   l.currency || funcCcy,
        functional_currency: funcCcy,
        description:         l.description || null,
        line_no:             idx + 1,
      })),
    };
    const idempotencyKey = `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { data: entryId, error: err } = await supabase.rpc('acct_post_journal', {
      p_payload: payload,
      p_idempotency_key: idempotencyKey,
    });
    setSubmitting(false);
    if (err) {
      toast({ title: 'Post failed', description: err.message, variant: 'destructive' });
    } else {
      toast({ title: `Journal entry posted (${String(entryId).slice(0, 8)}…)` });
      setNewOpen(false);
      void loadAll();
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    const [yres, pres, eres, ares, fres, cres] = await Promise.all([
      supabase.from('acct_fiscal_years').select('id, code').order('code', { ascending: false }),
      supabase.from('acct_fiscal_periods').select('id, period_no, start_date, end_date, status, fiscal_year_id').order('start_date', { ascending: false }),
      supabase.from('acct_journal_entries').select('id, entry_no, period_id, posting_date, description_en, description_ar, source_type, source_id, status, branch_id, idempotency_key, posted_at, posted_by, created_at, created_by, reversed_by_entry_id, country_id').order('posting_date', { ascending: false }).order('entry_no', { ascending: false }).limit(2000),
      supabase.from('acct_accounts').select('id, code, name_en, name_ar, country_id, is_postable').order('code'),
      supabase.from('acct_funds').select('id, code, name_en'),
      supabase.from('countries').select('id, code, name_en, flag_emoji, currency_code').eq('is_active', true).order('name_en'),
    ]);
    const firstErr = [yres.error, pres.error, eres.error, ares.error, fres.error].find(Boolean);
    if (firstErr) setError(firstErr.message);
    setYears((yres.data ?? []) as FiscalYear[]);
    setPeriods((pres.data ?? []) as Period[]);
    setEntries((eres.data ?? []) as Entry[]);
    setCountries((cres.data ?? []) as Country[]);
    const am: typeof accountsMap = {};
    for (const a of (ares.data ?? [])) am[a.id] = { code: a.code, name_en: a.name_en, name_ar: a.name_ar, country_id: a.country_id ?? null, is_postable: a.is_postable ?? true };
    setAccountsMap(am);
    const fm: typeof fundsMap = {};
    for (const f of (fres.data ?? [])) fm[f.id] = { code: f.code, name_en: f.name_en };
    setFundsMap(fm);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void loadAll(); }, [allowed]);

  const sources = useMemo(() => {
    const s = new Set<string>();
    entries.forEach(e => s.add(e.source_type));
    return Array.from(s).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (periodFilter !== 'all' && e.period_id !== periodFilter) return false;
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && e.source_type !== sourceFilter) return false;
      if (countryFilter !== 'all' && e.country_id !== countryFilter) return false;
      if (q) {
        return String(e.entry_no).includes(q)
          || e.description_en.toLowerCase().includes(q)
          || (e.description_ar ?? '').toLowerCase().includes(q)
          || e.idempotency_key.toLowerCase().includes(q)
          || (e.source_id ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [entries, periodFilter, statusFilter, sourceFilter, countryFilter, search]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => { setPage(0); }, [periodFilter, statusFilter, sourceFilter, countryFilter, search]);

  const counts = useMemo(() => {
    const c = { total: entries.length, posted: 0, draft: 0, reversed: 0 };
    for (const e of entries) {
      if (e.status === 'posted') c.posted++;
      else if (e.status === 'draft') c.draft++;
      else if (e.status === 'reversed') c.reversed++;
    }
    return c;
  }, [entries]);

  const periodLabel = (id: string) => {
    const p = periods.find(x => x.id === id);
    if (!p) return id.slice(0, 8);
    const y = years.find(yy => yy.id === p.fiscal_year_id);
    return `${y?.code ?? '?'} P${String(p.period_no).padStart(2, '0')}`;
  };

  const openDetails = async (e: Entry) => {
    setOpenEntry(e);
    setOpenLines([]);
    setLinesLoading(true);
    const { data } = await supabase
      .from('acct_journal_lines')
      .select('id, line_no, account_id, fund_id, function, partner_id, project_id, cost_center_id, original_amount, original_currency, functional_amount, functional_currency, fx_rate, debit_credit, description')
      .eq('entry_id', e.id)
      .order('line_no', { ascending: true });
    setOpenLines((data ?? []) as Line[]);
    setLinesLoading(false);
  };

  const exportCsv = () => {
    const header = ['Entry #', 'Posting Date', 'Period', 'Status', 'Source Type', 'Source ID', 'Description (EN)', 'Description (AR)', 'Idempotency Key', 'Posted At', 'Created At'];
    const body = filtered.map(e => [
      e.entry_no,
      e.posting_date,
      periodLabel(e.period_id),
      e.status,
      e.source_type,
      e.source_id ?? '',
      e.description_en,
      e.description_ar ?? '',
      e.idempotency_key,
      e.posted_at ?? '',
      e.created_at,
    ]);
    downloadCsv(`journal-entries-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  const lineTotals = useMemo(() => {
    let dr = 0, cr = 0;
    for (const l of openLines) {
      if (l.debit_credit === 'DR') dr += Number(l.functional_amount);
      else cr += Number(l.functional_amount);
    }
    return { dr, cr, balanced: Math.abs(dr - cr) < 0.005 };
  }, [openLines]);

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-violet-600" /> Journal Entries
            <span className="text-sm font-normal text-muted-foreground" dir="rtl" lang="ar">قيود اليومية</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every balanced GL posting routed through <code className="text-xs bg-muted px-1 rounded">acct_post_journal</code>. Lines are immutable.
          </p>
        </div>
        <div className="flex gap-2">
          {canPost && (
            <Button size="sm" onClick={openNewEntry} data-testid="button-new-entry">
              <Plus className="w-4 h-4 mr-1" /> New Entry
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void loadAll()} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Loaded entries</div><div className="text-xl font-bold" data-testid="kpi-total">{counts.total}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Posted</div><div className="text-xl font-bold text-emerald-700" data-testid="kpi-posted">{counts.posted}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Draft</div><div className="text-xl font-bold text-slate-700" data-testid="kpi-draft">{counts.draft}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Reversed</div><div className="text-xl font-bold text-rose-700" data-testid="kpi-reversed">{counts.reversed}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Entries</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search #, desc, key…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" data-testid="input-search" />
            </div>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger data-testid="select-period"><SelectValue placeholder="Period" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All periods</SelectItem>
                {periods.map(p => (
                  <SelectItem key={p.id} value={p.id}>{periodLabel(p.id)} · {p.status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger data-testid="select-country"><SelectValue placeholder="Country" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🌐 All countries</SelectItem>
                {countries.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger data-testid="select-source"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_approval">Pending approval</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="reversed">Reversed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm" data-testid="text-error">
              {error}
              <div className="text-xs mt-1 text-rose-700/80">If this is a missing-relation error, Sprint 1.1/1.2 SQL has not been pasted into pactdb yet.</div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading entries…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-empty">No journal entries match the current filters.</div>
          ) : (
            <>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Entry #</th>
                      <th className="text-left px-3 py-2">Posting Date</th>
                      <th className="text-left px-3 py-2">Period</th>
                      <th className="text-left px-3 py-2">Source</th>
                      <th className="text-left px-3 py-2">Description</th>
                      <th className="text-left px-3 py-2">GL Status</th>
                      <th className="text-right px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(e => (
                      <tr key={e.id} className="border-t hover:bg-muted/30" data-testid={`row-entry-${e.id}`}>
                        <td className="px-3 py-2 font-mono text-xs">{e.entry_no}</td>
                        <td className="px-3 py-2">{format(parseISO(e.posting_date), 'yyyy-MM-dd')}</td>
                        <td className="px-3 py-2">{periodLabel(e.period_id)}</td>
                        <td className="px-3 py-2 text-xs"><Badge variant="outline" className="text-[10px]">{e.source_type}</Badge></td>
                        <td className="px-3 py-2 max-w-[420px]">
                          <div className="truncate">{e.description_en}</div>
                          {e.description_ar && <div className="truncate text-xs text-muted-foreground" dir="rtl" lang="ar">{e.description_ar}</div>}
                        </td>
                        <td className="px-3 py-2">
                          {e.status === 'posted'
                            ? <Badge className="text-[10px] px-1.5 py-0 border-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30">GL Posted</Badge>
                            : e.status === 'reversed'
                            ? <Badge className="text-[10px] px-1.5 py-0 border-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30">GL Reversed</Badge>
                            : e.status === 'rejected'
                            ? <Badge className="text-[10px] px-1.5 py-0 border-0 bg-rose-100 text-rose-800 dark:bg-rose-900/30">GL Rejected</Badge>
                            : e.status === 'pending_approval'
                            ? <Badge className="text-[10px] px-1.5 py-0 border-0 bg-blue-100 text-blue-800 dark:bg-blue-900/30">GL Pending</Badge>
                            : <Badge className="text-[10px] px-1.5 py-0 border-0 bg-slate-100 text-slate-600 dark:bg-slate-800">GL Draft</Badge>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => void openDetails(e)} data-testid={`button-view-${e.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} data-testid="button-prev">Prev</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} data-testid="button-next">Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── New Journal Entry Dialog ── */}
      <Dialog open={newOpen} onOpenChange={o => !o && setNewOpen(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-new-entry">
          <DialogHeader>
            <DialogTitle>New Manual Journal Entry</DialogTitle>
            <DialogDescription>
              Balanced double-entry — debits must equal credits before posting. All lines are immutable once posted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Country selector */}
            <div className="space-y-1">
              <Label>Country / COA Scope</Label>
              <Select value={newCountryId} onValueChange={id => {
                setNewCountryId(id);
                const ccy = countries.find(c => c.id === id)?.currency_code ?? 'USD';
                setNewLines([{ ...BLANK_LINE(), currency: ccy }, { ...BLANK_LINE(), currency: ccy }]);
              }}>
                <SelectTrigger data-testid="select-new-country"><SelectValue placeholder="All countries" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌐 All countries</SelectItem>
                  {countries.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.flag_emoji ?? ''} {c.name_en} ({c.currency_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {newCountryId !== 'all' && (
                <p className="text-[11px] text-muted-foreground">
                  Showing {filteredAccountsForDialog.length} postable accounts · functional currency: <strong>{dialogCurrency}</strong>
                </p>
              )}
            </div>

            {/* Header row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Accounting Period *</Label>
                <Select value={newPeriodId} onValueChange={setNewPeriodId}>
                  <SelectTrigger data-testid="select-new-period"><SelectValue placeholder="Select open period…" /></SelectTrigger>
                  <SelectContent>
                    {periods.filter(p => p.status === 'open').map(p => (
                      <SelectItem key={p.id} value={p.id}>{periodLabel(p.id)}</SelectItem>
                    ))}
                    {periods.filter(p => p.status !== 'open').length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] text-muted-foreground uppercase font-semibold">Closed / Locked</div>
                        {periods.filter(p => p.status !== 'open').map(p => (
                          <SelectItem key={p.id} value={p.id} className="text-muted-foreground">{periodLabel(p.id)} ({p.status})</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Posting Date *</Label>
                <Input type="date" value={newDate} onChange={e => handleDateChange(e.target.value)} data-testid="input-new-date" />
              </div>
            </div>

            {/* ── Period / backdate warnings ── */}
            {(isBlocked || isBackdate || periodSoftClosed || dateMismatch) && (
              <div className="space-y-2">

                {/* Hard block — posting is not allowed */}
                {isBlocked && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-700 px-3 py-2.5 text-sm text-rose-800 dark:text-rose-300" data-testid="banner-period-blocked">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
                    <div>
                      <p className="font-semibold leading-tight">
                        Period is {selectedPeriod?.status === 'locked' ? 'locked' : 'hard-closed'} — posting not allowed
                      </p>
                      <p className="text-xs mt-0.5 opacity-80">
                        {selectedPeriod?.status === 'locked'
                          ? 'This period is locked and cannot accept any new entries. Contact your system administrator to unlock it.'
                          : 'This period has been hard-closed. Go to Fiscal Years & Periods and reopen it to soft-closed before posting.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Soft-closed warning — allowed with reason */}
                {!isBlocked && periodSoftClosed && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300" data-testid="banner-soft-closed-warning">
                    <Clock className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="font-semibold leading-tight">
                        {isBackdate ? 'Backdated entry to a soft-closed period' : 'Posting to a soft-closed period'}
                      </p>
                      <p className="text-xs mt-0.5 opacity-80">
                        {isBackdate && `Posting date is ${Math.round((new Date(today).getTime() - new Date(newDate).getTime()) / 86400000)} day(s) before today. `}
                        This period is soft-closed. Posting is permitted but requires a documented reason for audit purposes.
                      </p>
                    </div>
                  </div>
                )}

                {/* Plain backdate to an open period */}
                {!isBlocked && !periodSoftClosed && isBackdate && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300" data-testid="banner-backdate-warning">
                    <Clock className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="font-semibold leading-tight">Backdated entry</p>
                      <p className="text-xs mt-0.5 opacity-80">
                        Posting date is {Math.round((new Date(today).getTime() - new Date(newDate).getTime()) / 86400000)} day(s) before today. A reason is required for audit purposes.
                      </p>
                    </div>
                  </div>
                )}

                {/* Date outside selected period range */}
                {dateMismatch && (
                  <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-700 px-3 py-2 text-xs text-rose-700 dark:text-rose-300" data-testid="banner-date-mismatch">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Posting date <strong>{newDate}</strong> is outside the selected period range ({selectedPeriod?.start_date} → {selectedPeriod?.end_date}). Adjust the date or select the correct period.
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Description (English) *</Label>
                <Input placeholder="Payroll August 2026…" value={newDescEn} onChange={e => setNewDescEn(e.target.value)} data-testid="input-new-desc-en" />
              </div>
              <div className="space-y-1">
                <Label>Description (Arabic)</Label>
                <Input dir="rtl" lang="ar" placeholder="رواتب أغسطس 2026…" value={newDescAr} onChange={e => setNewDescAr(e.target.value)} data-testid="input-new-desc-ar" />
              </div>
            </div>

            {/* ── Backdate reason (required when backdating or posting to closed period) ── */}
            {needsReason && (
              <div className="space-y-1" data-testid="field-backdate-reason">
                <Label className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Reason for Backdating *
                </Label>
                <Textarea
                  placeholder="e.g. Correction of August payroll entry omitted during period close. Approved by Finance Manager."
                  value={backdateReason}
                  onChange={e => setBackdateReason(e.target.value)}
                  rows={2}
                  className="text-sm border-amber-300 focus-visible:ring-amber-400 dark:border-amber-700"
                  data-testid="textarea-backdate-reason"
                />
                <p className="text-[11px] text-muted-foreground">This reason will be appended to the journal description as an audit trail.</p>
              </div>
            )}

            {/* Balance indicator */}
            <div className={cn(
              'flex items-center gap-3 rounded-lg border px-4 py-2 text-sm',
              newBalanced ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
            )}>
              <div>DR: <strong>{formatNumber(newLineDrTotal)}</strong></div>
              <div>CR: <strong>{formatNumber(newLineCrTotal)}</strong></div>
              <div className="ml-auto">
                {newBalanced
                  ? <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200">Balanced ✓</Badge>
                  : <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">Off by {formatNumber(Math.abs(newLineDrTotal - newLineCrTotal))}</Badge>
                }
              </div>
            </div>

            {/* Lines table */}
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-2 w-8">#</th>
                    <th className="text-left px-2 py-2">Account</th>
                    <th className="text-left px-2 py-2">Fund</th>
                    <th className="text-left px-2 py-2 w-24">Function</th>
                    <th className="text-left px-2 py-2 w-16">DR/CR</th>
                    <th className="text-left px-2 py-2 w-28">Amount</th>
                    <th className="text-left px-2 py-2 w-16">CCY</th>
                    <th className="text-left px-2 py-2">Note</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {newLines.map((l, idx) => (
                    <tr key={idx} className="border-t" data-testid={`new-line-row-${idx}`}>
                      <td className="px-2 py-1.5 font-mono">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <Select value={l.account_id} onValueChange={v => setLineField(idx, 'account_id', v)}>
                          <SelectTrigger className="h-7 text-xs min-w-[160px]" data-testid={`select-line-account-${idx}`}>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredAccountsForDialog.map(([id, a]) => (
                              <SelectItem key={id} value={id}>{a.code} — {a.name_en}</SelectItem>
                            ))}
                            {filteredAccountsForDialog.length === 0 && (
                              <div className="px-2 py-4 text-xs text-muted-foreground text-center">No postable accounts found.<br/>Apply the COA migration for this country.</div>
                            )}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Select value={l.fund_id} onValueChange={v => setLineField(idx, 'fund_id', v)}>
                          <SelectTrigger className="h-7 text-xs min-w-[120px]" data-testid={`select-line-fund-${idx}`}>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(fundsMap).map(([id, f]) => (
                              <SelectItem key={id} value={id}>{f.code} — {f.name_en}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-xs w-24"
                          placeholder="none"
                          value={l.function}
                          onChange={e => setLineField(idx, 'function', e.target.value)}
                          data-testid={`input-line-function-${idx}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Select value={l.debit_credit} onValueChange={v => setLineField(idx, 'debit_credit', v as 'DR' | 'CR')}>
                          <SelectTrigger className="h-7 text-xs w-16" data-testid={`select-line-dc-${idx}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DR"><span className="text-emerald-700 font-semibold">DR</span></SelectItem>
                            <SelectItem value="CR"><span className="text-rose-700 font-semibold">CR</span></SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="h-7 text-xs w-28"
                          placeholder="0.00"
                          value={l.amount}
                          onChange={e => setLineField(idx, 'amount', e.target.value)}
                          data-testid={`input-line-amount-${idx}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-xs w-14"
                          value={l.currency}
                          onChange={e => setLineField(idx, 'currency', e.target.value.toUpperCase())}
                          maxLength={3}
                          data-testid={`input-line-ccy-${idx}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-xs"
                          placeholder="Optional note…"
                          value={l.description}
                          onChange={e => setLineField(idx, 'description', e.target.value)}
                          data-testid={`input-line-desc-${idx}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {newLines.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="p-1 rounded hover:bg-rose-50 text-rose-500"
                            title="Remove line"
                            data-testid={`button-remove-line-${idx}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button variant="outline" size="sm" className="text-xs" onClick={addLine} data-testid="button-add-line">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)} disabled={submitting}>Cancel</Button>
            <Button
              onClick={() => void submitEntry()}
              disabled={submitting || !newBalanced || isBlocked || (needsReason && !backdateReason.trim())}
              data-testid="button-submit-entry"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Posting…</>
                : isBlocked
                  ? 'Period Closed — Cannot Post'
                  : isBackdate || periodSoftClosed
                    ? <><Clock className="w-4 h-4 mr-1" /> Post Backdated Entry</>
                    : 'Post Journal Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!openEntry} onOpenChange={o => !o && setOpenEntry(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Entry #{openEntry?.entry_no}
              {openEntry && (
                openEntry.status === 'posted'
                  ? <Badge className="text-[10px] px-1.5 py-0 border-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30">GL Posted</Badge>
                  : openEntry.status === 'reversed'
                  ? <Badge className="text-[10px] px-1.5 py-0 border-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30">GL Reversed</Badge>
                  : openEntry.status === 'rejected'
                  ? <Badge className="text-[10px] px-1.5 py-0 border-0 bg-rose-100 text-rose-800 dark:bg-rose-900/30">GL Rejected</Badge>
                  : openEntry.status === 'pending_approval'
                  ? <Badge className="text-[10px] px-1.5 py-0 border-0 bg-blue-100 text-blue-800 dark:bg-blue-900/30">GL Pending</Badge>
                  : <Badge className="text-[10px] px-1.5 py-0 border-0 bg-slate-100 text-slate-600 dark:bg-slate-800">GL Draft</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {openEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div><div className="text-muted-foreground">Posting date</div><div className="font-medium">{format(parseISO(openEntry.posting_date), 'PPP')}</div></div>
                <div><div className="text-muted-foreground">Period</div><div className="font-medium">{periodLabel(openEntry.period_id)}</div></div>
                <div><div className="text-muted-foreground">Source</div><div className="font-medium">{openEntry.source_type}</div></div>
                <div><div className="text-muted-foreground">Source ID</div><div className="font-mono text-[11px] truncate">{openEntry.source_id ?? '—'}</div></div>
                <div className="sm:col-span-2"><div className="text-muted-foreground">Description (EN)</div><div className="font-medium">{openEntry.description_en}</div></div>
                <div className="sm:col-span-2"><div className="text-muted-foreground">Description (AR)</div><div className="font-medium" dir="rtl" lang="ar">{openEntry.description_ar ?? '—'}</div></div>
                <div className="sm:col-span-2"><div className="text-muted-foreground">Idempotency key</div><div className="font-mono text-[11px] break-all">{openEntry.idempotency_key}</div></div>
                <div><div className="text-muted-foreground">Posted at</div><div className="font-medium">{openEntry.posted_at ? format(parseISO(openEntry.posted_at), 'PPp') : '—'}</div></div>
                <div><div className="text-muted-foreground">Created</div><div className="font-medium">{format(parseISO(openEntry.created_at), 'PPp')}</div></div>
                {openEntry.reversed_by_entry_id && (
                  <div className="sm:col-span-4 p-2 rounded border border-rose-200 bg-rose-50 text-rose-800 text-xs">
                    Reversed by entry: <span className="font-mono">{openEntry.reversed_by_entry_id.slice(0, 8)}…</span>
                  </div>
                )}
              </div>

              <div className="border rounded-md overflow-x-auto">
                {linesLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading lines…</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-2 py-1.5">#</th>
                        <th className="text-left px-2 py-1.5">Account</th>
                        <th className="text-left px-2 py-1.5">Fund</th>
                        <th className="text-left px-2 py-1.5">Function</th>
                        <th className="text-right px-2 py-1.5">Original</th>
                        <th className="text-right px-2 py-1.5">DR</th>
                        <th className="text-right px-2 py-1.5">CR</th>
                        <th className="text-left px-2 py-1.5">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openLines.map(l => {
                        const acct = accountsMap[l.account_id];
                        const fund = fundsMap[l.fund_id];
                        return (
                          <tr key={l.id} className="border-t" data-testid={`row-line-${l.id}`}>
                            <td className="px-2 py-1.5 font-mono">{l.line_no}</td>
                            <td className="px-2 py-1.5">
                              <div className="font-mono text-[10px]">{acct?.code ?? l.account_id.slice(0, 8)}</div>
                              <div className="text-[11px]">{acct?.name_en ?? ''}</div>
                            </td>
                            <td className="px-2 py-1.5"><span className="font-mono text-[10px]">{fund?.code ?? l.fund_id.slice(0, 8)}</span></td>
                            <td className="px-2 py-1.5">{l.function}</td>
                            <td className="px-2 py-1.5 text-right">{formatNumber(l.original_amount)} {l.original_currency}</td>
                            <td className="px-2 py-1.5 text-right font-medium text-emerald-700">{l.debit_credit === 'DR' ? formatNumber(l.functional_amount) : ''}</td>
                            <td className="px-2 py-1.5 text-right font-medium text-rose-700">{l.debit_credit === 'CR' ? formatNumber(l.functional_amount) : ''}</td>
                            <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[200px]">{l.description ?? ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t bg-muted/30">
                      <tr>
                        <td colSpan={5} className="px-2 py-2 text-right text-xs font-semibold">Totals (functional {openLines[0]?.functional_currency ?? 'SDG'}):</td>
                        <td className="px-2 py-2 text-right font-bold text-emerald-700">{formatNumber(lineTotals.dr)}</td>
                        <td className="px-2 py-2 text-right font-bold text-rose-700">{formatNumber(lineTotals.cr)}</td>
                        <td className="px-2 py-2 text-xs">
                          {lineTotals.balanced
                            ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-[10px]">Balanced</Badge>
                            : <Badge variant="outline" className="bg-rose-50 text-rose-700 text-[10px]">Out of balance</Badge>}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
