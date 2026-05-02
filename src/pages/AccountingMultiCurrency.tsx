import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, RefreshCw, Plus, Pencil, Download, AlertTriangle,
  TrendingUp, TrendingDown, ArrowLeftRight, Globe, Calendar,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface ExchangeRate {
  id: string; from_currency: string; to_currency: string;
  rate: number; effective_date: string; source: string | null;
  country_id: string | null; created_at: string;
}

const CURRENCIES = ['USD', 'SDG', 'EUR', 'GBP', 'SAR', 'AED', 'EGP', 'ETB', 'KES', 'UGX', 'TZS', 'NGN', 'XAF', 'JPY', 'CNY'];
const SOURCES = ['manual', 'central_bank', 'reuters', 'bloomberg', 'ecb'];

const BLANK = {
  from_currency: 'USD', to_currency: 'SDG', rate: '', effective_date: new Date().toISOString().slice(0, 10), source: 'manual',
};

export default function AccountingMultiCurrency() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canEdit  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const { toast } = useToast();

  const [rates, setRates]         = useState<ExchangeRate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tableExists, setTableExists] = useState<boolean | null>(null);
  const [fromFilter, setFromFilter] = useState('all');
  const [toFilter, setToFilter]   = useState('all');

  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState<ExchangeRate | null>(null);
  const [form, setForm]           = useState(BLANK);
  const [saving, setSaving]       = useState(false);

  const [calcFrom, setCalcFrom]   = useState('USD');
  const [calcTo, setCalcTo]       = useState('SDG');
  const [calcAmt, setCalcAmt]     = useState('1000');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('acct_exchange_rates')
      .select('*')
      .order('effective_date', { ascending: false })
      .order('from_currency');
    if (error?.code === '42P01') { setTableExists(false); setLoading(false); return; }
    setTableExists(true);
    setRates((data ?? []) as ExchangeRate[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => rates.filter(r => {
    if (fromFilter !== 'all' && r.from_currency !== fromFilter) return false;
    if (toFilter   !== 'all' && r.to_currency   !== toFilter)   return false;
    return true;
  }), [rates, fromFilter, toFilter]);

  const latestRates = useMemo(() => {
    const map = new Map<string, ExchangeRate>();
    for (const r of rates) {
      const key = `${r.from_currency}→${r.to_currency}`;
      if (!map.has(key) || r.effective_date > map.get(key)!.effective_date) map.set(key, r);
    }
    return Array.from(map.values()).sort((a, b) => `${a.from_currency}${a.to_currency}`.localeCompare(`${b.from_currency}${b.to_currency}`));
  }, [rates]);

  const calcResult = useMemo(() => {
    const r = latestRates.find(r => r.from_currency === calcFrom && r.to_currency === calcTo);
    if (!r) {
      const inv = latestRates.find(r => r.from_currency === calcTo && r.to_currency === calcFrom);
      if (inv) return { rate: 1 / inv.rate, result: Number(calcAmt) / inv.rate, inverted: true };
      return null;
    }
    return { rate: r.rate, result: Number(calcAmt) * r.rate, inverted: false };
  }, [latestRates, calcFrom, calcTo, calcAmt]);

  const uniqueFroms = useMemo(() => [...new Set(rates.map(r => r.from_currency))].sort(), [rates]);
  const uniqueTos   = useMemo(() => [...new Set(rates.map(r => r.to_currency))].sort(), [rates]);

  const openCreate = () => { setEditing(null); setForm(BLANK); setOpen(true); };
  const openEdit   = (r: ExchangeRate) => {
    setEditing(r);
    setForm({ from_currency: r.from_currency, to_currency: r.to_currency, rate: String(r.rate), effective_date: r.effective_date, source: r.source ?? 'manual' });
    setOpen(true);
  };

  const save = async () => {
    if (!form.rate || Number(form.rate) <= 0) { toast({ title: 'Rate must be > 0', variant: 'destructive' }); return; }
    if (form.from_currency === form.to_currency) { toast({ title: 'From and To currencies must differ', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { from_currency: form.from_currency, to_currency: form.to_currency, rate: Number(form.rate), effective_date: form.effective_date, source: form.source || null };
    if (editing) {
      const { error } = await supabase.from('acct_exchange_rates').update(payload).eq('id', editing.id);
      if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Rate updated' }); setOpen(false); void load(); }
    } else {
      const { error } = await supabase.from('acct_exchange_rates').insert(payload);
      if (error) toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Exchange rate saved' }); setOpen(false); void load(); }
    }
    setSaving(false);
  };

  const exportCsv = () => {
    downloadCsv('exchange_rates.csv', [
      ['From', 'To', 'Rate', 'Effective Date', 'Source'],
      ...filtered.map(r => [r.from_currency, r.to_currency, r.rate, r.effective_date, r.source ?? '']),
    ]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed)   return <Navigate to="/" replace />;

  if (tableExists === false) {
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-[900px] space-y-5">
        <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowLeftRight className="w-6 h-6 text-green-600" /> Multi-Currency</h1>
        <Card className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-5 flex gap-4">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="font-medium text-amber-800 dark:text-amber-400">Phase 4 Migration Required</p>
              <p className="text-sm text-amber-700 dark:text-amber-500">
                The <code className="font-mono text-xs">acct_exchange_rates</code> table does not exist yet.
                Apply the Phase 4 SQL migration to your Supabase project.
              </p>
              <code className="block text-xs font-mono bg-white/60 dark:bg-black/20 rounded p-2 border border-amber-200">
                supabase/migrations/20260520_acct_phase4_advanced.sql
              </code>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1100px]">
      <PageInfoBanner
        title="Multi-Currency & Exchange Rates"
        description="Maintain historical exchange rate tables for all currency pairs. Rates are used for journal revaluation, AP invoice conversion, and multi-currency reporting."
        workflowSteps={['Add Exchange Rate', 'Set Effective Date', 'Used in Journals & Invoices', 'Period-End Revaluation']}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-green-600" /> Multi-Currency
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Exchange rate registry for journal revaluation and multi-currency reporting.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh-fx"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-fx"><Download className="w-4 h-4 mr-1" /> Export</Button>
          {canEdit && <Button size="sm" onClick={openCreate} data-testid="button-create-fx"><Plus className="w-4 h-4 mr-1" /> Add Rate</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Latest Rates */}
        <div className="lg:col-span-2 space-y-3">
          <Card className="border shadow-sm">
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-sm">Latest Exchange Rates</CardTitle>
              <CardDescription className="text-xs">Most recent rate per currency pair.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : latestRates.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ArrowLeftRight className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No exchange rates yet.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {latestRates.map(r => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30" data-testid={`row-fx-${r.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 font-mono text-sm font-semibold">
                          <span className="text-muted-foreground">{r.from_currency}</span>
                          <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{r.to_currency}</span>
                        </div>
                        <span className="text-lg font-bold">{formatNumber(r.rate, 4)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">{format(parseISO(r.effective_date), 'dd MMM yyyy')}</p>
                          {r.source && <Badge variant="outline" className="text-[10px] mt-0.5">{r.source}</Badge>}
                        </div>
                        {canEdit && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)} data-testid={`btn-edit-fx-${r.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rate History */}
          {rates.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="p-4 border-b flex-row items-center justify-between">
                <CardTitle className="text-sm">Rate History</CardTitle>
                <div className="flex gap-2">
                  <Select value={fromFilter} onValueChange={setFromFilter}>
                    <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue placeholder="From" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {uniqueFroms.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={toFilter} onValueChange={setToFilter}>
                    <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue placeholder="To" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {uniqueTos.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b sticky top-0">
                      <tr>
                        {['From', 'To', 'Rate', 'Effective Date', 'Source', ''].map(h => (
                          <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filtered.map(r => (
                        <tr key={r.id} className="hover:bg-muted/30" data-testid={`row-fx-hist-${r.id}`}>
                          <td className="px-4 py-2 font-mono text-xs font-semibold">{r.from_currency}</td>
                          <td className="px-4 py-2 font-mono text-xs font-semibold">{r.to_currency}</td>
                          <td className="px-4 py-2 font-mono text-sm">{formatNumber(r.rate, 4)}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{format(parseISO(r.effective_date), 'dd MMM yyyy')}</td>
                          <td className="px-4 py-2 text-xs">{r.source ?? '—'}</td>
                          <td className="px-4 py-2">
                            {canEdit && (
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(r)}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Currency Converter */}
        <div className="space-y-3">
          <Card className="border shadow-sm">
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-sm flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" /> Currency Converter</CardTitle>
              <CardDescription className="text-xs">Live preview using latest rates.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Amount</Label>
                <Input type="number" min={0} value={calcAmt} onChange={e => setCalcAmt(e.target.value)} data-testid="input-calc-amount" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Select value={calcFrom} onValueChange={setCalcFrom}>
                  <SelectTrigger data-testid="select-calc-from"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Select value={calcTo} onValueChange={setCalcTo}>
                  <SelectTrigger data-testid="select-calc-to"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className={cn('rounded-xl p-4 text-center',
                calcResult ? 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200' : 'bg-muted/40 border border-border'
              )}>
                {calcResult ? (
                  <>
                    <p className="text-xs text-muted-foreground mb-1">
                      1 {calcFrom} = {formatNumber(calcResult.rate, 4)} {calcTo}
                      {calcResult.inverted && ' (inverted)'}
                    </p>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                      {formatNumber(calcResult.result)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">{calcTo}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No rate found for {calcFrom} → {calcTo}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm border-blue-200 bg-blue-50/40 dark:border-blue-800/50 dark:bg-blue-950/10">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-400 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> Multi-Currency Notes
              </p>
              <ul className="text-xs text-blue-700 dark:text-blue-500 space-y-1 list-disc list-inside">
                <li>Rates are point-in-time snapshots</li>
                <li>Set effective date to the period start for period-end revaluation</li>
                <li>Journals use the rate active on posting_date</li>
                <li>Enable <code className="font-mono text-[10px]">acct.multi_currency.enabled</code> flag to activate</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Exchange Rate' : 'Add Exchange Rate'}</DialogTitle>
            <DialogDescription>Set the rate for a currency pair on a given effective date.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>From Currency *</Label>
              <Select value={form.from_currency} onValueChange={v => setForm(p => ({ ...p, from_currency: v }))}>
                <SelectTrigger data-testid="select-fx-from"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>To Currency *</Label>
              <Select value={form.to_currency} onValueChange={v => setForm(p => ({ ...p, to_currency: v }))}>
                <SelectTrigger data-testid="select-fx-to"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rate *</Label>
              <Input type="number" min={0} step="0.0001" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} placeholder="e.g. 2570.5" data-testid="input-fx-rate" />
              {form.from_currency && form.to_currency && form.rate && (
                <p className="text-[10px] text-muted-foreground">1 {form.from_currency} = {formatNumber(Number(form.rate), 4)} {form.to_currency}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Effective Date *</Label>
              <Input type="date" value={form.effective_date} onChange={e => setForm(p => ({ ...p, effective_date: e.target.value }))} data-testid="input-fx-date" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={v => setForm(p => ({ ...p, source: v }))}>
                <SelectTrigger data-testid="select-fx-source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="button-save-fx">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {editing ? 'Update' : 'Save Rate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
