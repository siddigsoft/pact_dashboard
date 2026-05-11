import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, RefreshCw, Plus, ArrowRightLeft, CheckCircle2, XCircle,
  Eye, Download, Send, Clock, Ban,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';

interface Country {
  id: string; code: string; name_en: string; flag_emoji: string | null; currency_code: string;
}

type TxStatus = 'pending' | 'approved' | 'posted' | 'cancelled';

interface Transfer {
  id: string;
  transfer_number: string;
  from_country_id: string;
  to_country_id: string;
  amount: number;
  currency: string;
  transfer_date: string;
  description_en: string | null;
  description_ar: string | null;
  reference: string | null;
  status: TxStatus;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  from_je_id: string | null;
  to_je_id: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<TxStatus, string> = {
  pending:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30',
  approved:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30',
  posted:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800',
};

const today = () => new Date().toISOString().slice(0, 10);

export default function AccountingIntercompany() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canWrite = hasAnyRole(['super_admin', 'admin', 'finance', 'accountant']);
  const { currentUser } = useUser();
  const { toast } = useToast();

  const [countries, setCountries] = useState<Country[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [fromFilter, setFromFilter]     = useState<string>('all');
  const [toFilter, setToFilter]         = useState<string>('all');
  const [search, setSearch]             = useState('');

  // Detail dialog
  const [viewTx, setViewTx] = useState<Transfer | null>(null);

  // New transfer dialog
  const [newOpen, setNewOpen]         = useState(false);
  const [fromCountry, setFromCountry] = useState('');
  const [toCountry, setToCountry]     = useState('');
  const [amount, setAmount]           = useState('');
  const [currency, setCurrency]       = useState('USD');
  const [txDate, setTxDate]           = useState(today());
  const [descEn, setDescEn]           = useState('');
  const [descAr, setDescAr]           = useState('');
  const [reference, setReference]     = useState('');
  const [notes, setNotes]             = useState('');
  const [saving, setSaving]           = useState(false);

  // Approve / cancel busy map
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    const [cRes, tRes] = await Promise.all([
      supabase.from('countries').select('id, code, name_en, flag_emoji, currency_code').eq('is_active', true).order('name_en'),
      supabase.from('acct_intercompany_transfers').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
    if (cRes.error) setError(cRes.error.message);
    if (tRes.error) setError(tRes.error.message);
    setCountries((cRes.data ?? []) as Country[]);
    setTransfers((tRes.data ?? []) as Transfer[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const countryMap = useMemo(() => {
    const m: Record<string, Country> = {};
    for (const c of countries) m[c.id] = c;
    return m;
  }, [countries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transfers.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (fromFilter !== 'all' && t.from_country_id !== fromFilter) return false;
      if (toFilter !== 'all' && t.to_country_id !== toFilter) return false;
      if (q) {
        return t.transfer_number.toLowerCase().includes(q)
          || (t.description_en ?? '').toLowerCase().includes(q)
          || (t.reference ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [transfers, statusFilter, fromFilter, toFilter, search]);

  const kpi = useMemo(() => {
    let pending = 0, posted = 0, totalUSD = 0;
    for (const t of transfers) {
      if (t.status === 'pending') pending++;
      if (t.status === 'posted')  posted++;
      if (t.currency === 'USD' || t.currency === 'usd') totalUSD += Number(t.amount);
    }
    return { total: transfers.length, pending, posted, totalUSD };
  }, [transfers]);

  const countryFlag = (id: string) => {
    const c = countryMap[id];
    return c ? `${c.flag_emoji ?? ''} ${c.name_en}` : id.slice(0, 8);
  };

  const openNew = () => {
    setFromCountry(''); setToCountry(''); setAmount(''); setCurrency('USD');
    setTxDate(today()); setDescEn(''); setDescAr(''); setReference(''); setNotes('');
    setNewOpen(true);
  };

  const submitNew = async () => {
    if (!fromCountry)              { toast({ title: 'Select a source country', variant: 'destructive' }); return; }
    if (!toCountry)                { toast({ title: 'Select a destination country', variant: 'destructive' }); return; }
    if (fromCountry === toCountry) { toast({ title: 'Source and destination must be different countries', variant: 'destructive' }); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0)          { toast({ title: 'Enter a positive amount', variant: 'destructive' }); return; }
    if (!txDate)                   { toast({ title: 'Select a transfer date', variant: 'destructive' }); return; }

    setSaving(true);
    // Generate transfer number via DB function
    const { data: txNo } = await supabase.rpc('acct_next_transfer_number' as any);
    const payload = {
      transfer_number:  txNo as string ?? `ICT-${Date.now()}`,
      from_country_id:  fromCountry,
      to_country_id:    toCountry,
      amount:           amt,
      currency:         currency || 'USD',
      transfer_date:    txDate,
      description_en:   descEn.trim() || null,
      description_ar:   descAr.trim() || null,
      reference:        reference.trim() || null,
      notes:            notes.trim() || null,
      status:           'pending',
      requested_by:     currentUser?.id ?? null,
    };
    const { error: err } = await supabase.from('acct_intercompany_transfers').insert(payload);
    setSaving(false);
    if (err) {
      toast({ title: 'Failed to create transfer', description: err.message, variant: 'destructive' });
    } else {
      toast({ title: `Transfer ${payload.transfer_number} created — pending approval` });
      setNewOpen(false);
      void load();
    }
  };

  const approve = async (t: Transfer) => {
    setBusy(b => ({ ...b, [t.id]: true }));
    const { error: err } = await supabase
      .from('acct_intercompany_transfers')
      .update({ status: 'approved', approved_by: currentUser?.id, approved_at: new Date().toISOString() })
      .eq('id', t.id);
    setBusy(b => ({ ...b, [t.id]: false }));
    if (err) {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    } else {
      toast({ title: `${t.transfer_number} approved — GL entries are being posted automatically` });
      void load();
    }
  };

  const cancel = async (t: Transfer) => {
    if (!confirm(`Cancel ${t.transfer_number}? This cannot be undone.`)) return;
    setBusy(b => ({ ...b, [t.id]: true }));
    const { error: err } = await supabase
      .from('acct_intercompany_transfers')
      .update({ status: 'cancelled' })
      .eq('id', t.id);
    setBusy(b => ({ ...b, [t.id]: false }));
    if (err) toast({ title: 'Cancel failed', description: err.message, variant: 'destructive' });
    else { toast({ title: `${t.transfer_number} cancelled` }); void load(); }
  };

  const exportCsv = () => {
    const header = ['#', 'Transfer No.', 'Date', 'From', 'To', 'Amount', 'Currency', 'Status', 'Reference', 'Description', 'From JE', 'To JE'];
    const rows = filtered.map((t, i) => [
      i + 1,
      t.transfer_number,
      t.transfer_date,
      countryMap[t.from_country_id]?.name_en ?? t.from_country_id,
      countryMap[t.to_country_id]?.name_en ?? t.to_country_id,
      Number(t.amount).toFixed(2),
      t.currency,
      t.status,
      t.reference ?? '',
      t.description_en ?? '',
      t.from_je_id ?? '',
      t.to_je_id ?? '',
    ]);
    downloadCsv(`intercompany-transfers-${today()}.csv`, [header, ...rows]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-[1400px]">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-indigo-600" />
            Intercompany Transfers
            <span className="text-sm font-normal text-muted-foreground" dir="rtl" lang="ar">التحويلات بين الكيانات</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Move funds between country offices. Each approval auto-posts two balanced GL entries — one in each country's ledger.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canWrite && (
            <Button size="sm" onClick={openNew} data-testid="button-new-transfer">
              <Plus className="w-4 h-4 mr-1" /> New Transfer
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh">
            <RefreshCw className={cn('w-4 h-4 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground">Total Transfers</div>
          <div className="text-2xl font-bold" data-testid="kpi-total">{kpi.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground">Pending Approval</div>
          <div className={cn('text-2xl font-bold', kpi.pending > 0 ? 'text-amber-600' : '')} data-testid="kpi-pending">{kpi.pending}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground">GL Posted</div>
          <div className="text-2xl font-bold text-emerald-700" data-testid="kpi-posted">{kpi.posted}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground">Total USD Value</div>
          <div className="text-xl font-bold" data-testid="kpi-usd">{formatNumber(kpi.totalUSD)}</div>
          <div className="text-[10px] text-muted-foreground">USD-denominated only</div>
        </CardContent></Card>
      </div>

      {/* ── Filters ── */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="relative">
              <Input
                placeholder="Search number, description, reference…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fromFilter} onValueChange={setFromFilter}>
              <SelectTrigger data-testid="select-from"><SelectValue placeholder="From country" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🌐 All sources</SelectItem>
                {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={toFilter} onValueChange={setToFilter}>
              <SelectTrigger data-testid="select-to"><SelectValue placeholder="To country" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🌐 All destinations</SelectItem>
                {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {filtered.length} transfer{filtered.length !== 1 ? 's' : ''}
            {statusFilter !== 'all' && ` · ${statusFilter}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="p-3 mb-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm" data-testid="text-error">
              {error}
              <div className="text-xs mt-1 text-rose-600/80">
                If this is a "relation does not exist" error, apply <code>20260521_acct_intercompany.sql</code> in the Supabase SQL editor first.
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading transfers…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-empty">
              No transfers match the current filters.
              {canWrite && <div className="mt-2"><Button size="sm" onClick={openNew}>Create the first transfer</Button></div>}
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Transfer #</th>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">From → To</th>
                    <th className="text-right px-3 py-2">Amount</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">GL Entries</th>
                    <th className="text-right px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id} className="border-t hover:bg-muted/30" data-testid={`row-transfer-${t.id}`}>
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{t.transfer_number}</td>
                      <td className="px-3 py-2 text-xs">{format(parseISO(t.transfer_date), 'dd MMM yyyy')}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 text-xs">
                          <span>{countryFlag(t.from_country_id)}</span>
                          <ArrowRightLeft className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span>{countryFlag(t.to_country_id)}</span>
                        </div>
                        {t.description_en && <div className="text-[11px] text-muted-foreground truncate max-w-[200px] mt-0.5">{t.description_en}</div>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium">
                        {formatNumber(t.amount)} <span className="text-[10px] text-muted-foreground">{t.currency}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={cn('text-[10px] px-1.5 py-0 border-0', STATUS_STYLES[t.status])}>
                          {t.status === 'pending'   && <Clock className="w-2.5 h-2.5 mr-1 inline" />}
                          {t.status === 'posted'    && <CheckCircle2 className="w-2.5 h-2.5 mr-1 inline" />}
                          {t.status === 'cancelled' && <Ban className="w-2.5 h-2.5 mr-1 inline" />}
                          {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-[10px] font-mono text-muted-foreground">
                        {t.from_je_id
                          ? <><div title="FROM-country JE">F: {t.from_je_id.slice(0, 8)}…</div><div title="TO-country JE">T: {t.to_je_id?.slice(0, 8)}…</div></>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setViewTx(t)} data-testid={`button-view-${t.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canWrite && t.status === 'pending' && (
                            <>
                              <Button
                                variant="ghost" size="sm"
                                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => void approve(t)}
                                disabled={busy[t.id]}
                                data-testid={`button-approve-${t.id}`}
                              >
                                {busy[t.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                onClick={() => void cancel(t)}
                                disabled={busy[t.id]}
                                data-testid={`button-cancel-${t.id}`}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── New Transfer Dialog ── */}
      <Dialog open={newOpen} onOpenChange={o => !o && setNewOpen(false)}>
        <DialogContent className="max-w-lg" data-testid="dialog-new-transfer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-indigo-600" /> New Intercompany Transfer
            </DialogTitle>
            <DialogDescription>
              Funds will move between two country COAs. Approving triggers two automatic GL entries.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>From (sending) country <span className="text-rose-500">*</span></Label>
                <Select value={fromCountry} onValueChange={v => { setFromCountry(v); const c = countries.find(x => x.id === v); if (c) setCurrency(c.currency_code); }}>
                  <SelectTrigger data-testid="select-from-country"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>To (receiving) country <span className="text-rose-500">*</span></Label>
                <Select value={toCountry} onValueChange={setToCountry}>
                  <SelectTrigger data-testid="select-to-country"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {countries.filter(c => c.id !== fromCountry).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Amount <span className="text-rose-500">*</span></Label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" data-testid="input-amount" />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} data-testid="input-currency" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Transfer date <span className="text-rose-500">*</span></Label>
              <Input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} data-testid="input-date" />
            </div>
            <div className="space-y-1">
              <Label>Bank / Wire reference</Label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="SWIFT ref, wire no…" data-testid="input-reference" />
            </div>
            <div className="space-y-1">
              <Label>Description (EN)</Label>
              <Input value={descEn} onChange={e => setDescEn(e.target.value)} placeholder="Purpose of transfer…" data-testid="input-desc-en" />
            </div>
            <div className="space-y-1">
              <Label>Description (AR)</Label>
              <Input value={descAr} onChange={e => setDescAr(e.target.value)} placeholder="وصف التحويل…" dir="rtl" lang="ar" data-testid="input-desc-ar" />
            </div>
            <div className="space-y-1">
              <Label>Internal notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Finance team notes…" data-testid="input-notes" />
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200">
              This creates a <strong>pending</strong> transfer. An authorised approver must approve it before GL entries are posted.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)} data-testid="button-cancel-dialog">Cancel</Button>
            <Button onClick={() => void submitNew()} disabled={saving} data-testid="button-save-transfer">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Create Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Detail Dialog ── */}
      <Dialog open={!!viewTx} onOpenChange={o => !o && setViewTx(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-view-transfer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
              {viewTx?.transfer_number}
            </DialogTitle>
          </DialogHeader>
          {viewTx && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge className={cn('text-[11px] px-2 border-0', STATUS_STYLES[viewTx.status])}>
                  {viewTx.status.toUpperCase()}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div><div className="text-[11px] text-muted-foreground">From</div><div className="font-medium">{countryFlag(viewTx.from_country_id)}</div></div>
                <div><div className="text-[11px] text-muted-foreground">To</div><div className="font-medium">{countryFlag(viewTx.to_country_id)}</div></div>
                <div><div className="text-[11px] text-muted-foreground">Amount</div><div className="font-mono font-medium">{formatNumber(viewTx.amount)} {viewTx.currency}</div></div>
                <div><div className="text-[11px] text-muted-foreground">Date</div><div>{format(parseISO(viewTx.transfer_date), 'dd MMM yyyy')}</div></div>
                {viewTx.reference && <div className="col-span-2"><div className="text-[11px] text-muted-foreground">Reference</div><div className="font-mono text-xs">{viewTx.reference}</div></div>}
                {viewTx.description_en && <div className="col-span-2"><div className="text-[11px] text-muted-foreground">Description</div><div>{viewTx.description_en}</div></div>}
                {viewTx.description_ar && <div className="col-span-2 text-right" dir="rtl" lang="ar"><div className="text-[11px] text-muted-foreground text-left" dir="ltr">Arabic description</div><div>{viewTx.description_ar}</div></div>}
                {viewTx.notes && <div className="col-span-2"><div className="text-[11px] text-muted-foreground">Notes</div><div className="text-xs text-muted-foreground">{viewTx.notes}</div></div>}
                {viewTx.approved_at && <div className="col-span-2"><div className="text-[11px] text-muted-foreground">Approved at</div><div className="text-xs">{format(parseISO(viewTx.approved_at), 'dd MMM yyyy HH:mm')}</div></div>}
              </div>
              {(viewTx.from_je_id || viewTx.to_je_id) && (
                <div className="rounded-md border p-2 space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase">GL Journal Entries</div>
                  {viewTx.from_je_id && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{countryMap[viewTx.from_country_id]?.name_en ?? 'FROM'} GL</span>
                      <span className="font-mono">{viewTx.from_je_id}</span>
                    </div>
                  )}
                  {viewTx.to_je_id && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{countryMap[viewTx.to_country_id]?.name_en ?? 'TO'} GL</span>
                      <span className="font-mono">{viewTx.to_je_id}</span>
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    FROM: DR 1800 / CR 1200 · TO: DR 1200 / CR 2800
                  </div>
                </div>
              )}
              {canWrite && viewTx.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <Button className="flex-1" onClick={() => { void approve(viewTx); setViewTx(null); }} disabled={busy[viewTx.id]} data-testid="button-detail-approve">
                    {busy[viewTx.id] ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                    Approve & Post GL
                  </Button>
                  <Button variant="outline" className="text-rose-600 border-rose-200" onClick={() => { void cancel(viewTx); setViewTx(null); }} disabled={busy[viewTx.id]} data-testid="button-detail-cancel">
                    <XCircle className="w-4 h-4 mr-1" /> Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
