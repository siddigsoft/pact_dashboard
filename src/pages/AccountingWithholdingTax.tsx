import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Search, Download, RefreshCw, Percent, CheckCircle2, Clock, Pencil } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface WHTRate { id: string; name_en: string; code: string | null; rate_pct: number; applies_to: string; is_active: boolean; }
interface WHTEntry { id: string; rate_id: string; entry_date: string; vendor_name: string; invoice_ref: string | null; gross_amount: number; wht_amount: number; net_amount: number; currency: string; remitted: boolean; remittance_date: string | null; }

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n ?? 0);

export default function AccountingWithholdingTax() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [rates, setRates] = useState<WHTRate[]>([]);
  const [entries, setEntries] = useState<WHTEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'entries' | 'rates'>('entries');
  const [search, setSearch] = useState('');
  const [remittedFilter, setRemittedFilter] = useState('all');
  const [rateFormOpen, setRateFormOpen] = useState(false);
  const [entryFormOpen, setEntryFormOpen] = useState(false);
  const [editRate, setEditRate] = useState<WHTRate | null>(null);
  const [saving, setSaving] = useState(false);

  const BLANK_RATE = { name_en: '', name_ar: '', code: '', rate_pct: '', applies_to: 'vendor', notes: '' };
  const BLANK_ENTRY = { rate_id: '', entry_date: new Date().toISOString().slice(0, 10), vendor_name: '', invoice_ref: '', gross_amount: '', currency: 'SDG' };
  const [rateForm, setRateForm] = useState<Record<string, string>>(BLANK_RATE);
  const [entryForm, setEntryForm] = useState<Record<string, string>>(BLANK_ENTRY);
  const rf = (k: string, v: string) => setRateForm(p => ({ ...p, [k]: v }));
  const ef = (k: string, v: string) => setEntryForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const [rRes, eRes] = await Promise.all([
      supabase.from('acct_withholding_tax_rates' as any).select('*').order('name_en'),
      supabase.from('acct_withholding_tax_entries' as any).select('*').order('entry_date', { ascending: false }),
    ]);
    setRates((rRes.data ?? []) as WHTRate[]);
    setEntries((eRes.data ?? []) as WHTEntry[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filteredEntries = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter(e => {
      if (remittedFilter === 'remitted' && !e.remitted) return false;
      if (remittedFilter === 'pending' && e.remitted) return false;
      if (q) return e.vendor_name.toLowerCase().includes(q) || (e.invoice_ref ?? '').toLowerCase().includes(q);
      return true;
    });
  }, [entries, search, remittedFilter]);

  const totals = useMemo(() => ({
    wht: filteredEntries.reduce((s, e) => s + e.wht_amount, 0),
    gross: filteredEntries.reduce((s, e) => s + e.gross_amount, 0),
    pending: filteredEntries.filter(e => !e.remitted).reduce((s, e) => s + e.wht_amount, 0),
  }), [filteredEntries]);

  const saveRate = async () => {
    if (!rateForm.name_en.trim() || !rateForm.rate_pct) { toast({ title: 'Name and rate required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { name_en: rateForm.name_en.trim(), code: rateForm.code || null, rate_pct: parseFloat(rateForm.rate_pct), applies_to: rateForm.applies_to, is_active: true };
    const { error } = editRate
      ? await supabase.from('acct_withholding_tax_rates' as any).update(payload).eq('id', editRate.id)
      : await supabase.from('acct_withholding_tax_rates' as any).insert(payload);
    if (error) toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Saved' }); setRateFormOpen(false); void load(); }
    setSaving(false);
  };

  const saveEntry = async () => {
    if (!entryForm.vendor_name.trim() || !entryForm.gross_amount || !entryForm.rate_id) { toast({ title: 'Vendor, amount and rate required', variant: 'destructive' }); return; }
    setSaving(true);
    const rate = rates.find(r => r.id === entryForm.rate_id);
    const gross = parseFloat(entryForm.gross_amount);
    const wht = gross * ((rate?.rate_pct ?? 0) / 100);
    const payload = { rate_id: entryForm.rate_id, entry_date: entryForm.entry_date, vendor_name: entryForm.vendor_name.trim(), invoice_ref: entryForm.invoice_ref || null, gross_amount: gross, wht_amount: wht, net_amount: gross - wht, currency: entryForm.currency, remitted: false };
    const { error } = await supabase.from('acct_withholding_tax_entries' as any).insert(payload);
    if (error) toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'WHT entry recorded' }); setEntryFormOpen(false); void load(); }
    setSaving(false);
  };

  const markRemitted = async (id: string) => {
    await supabase.from('acct_withholding_tax_entries' as any).update({ remitted: true, remittance_date: new Date().toISOString().slice(0, 10) }).eq('id', id);
    toast({ title: 'Marked as remitted' }); void load();
  };

  if (!authReady || !isAuthenticated) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Percent className="w-6 h-6 text-rose-600" /> Withholding Tax</h1>
          <p className="text-sm text-muted-foreground mt-1">WHT deducted from vendor payments — remittance tracking and liability management</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" onClick={() => setRateFormOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Rate</Button>}
          {canManage && <Button size="sm" variant="outline" onClick={() => { setEntryForm(BLANK_ENTRY); setEntryFormOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Record WHT</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(filteredEntries, 'wht-entries')} disabled={!filteredEntries.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Gross', value: fmt(totals.gross), color: 'text-blue-700' },
          { label: 'Total WHT Deducted', value: fmt(totals.wht), color: 'text-rose-700' },
          { label: 'Pending Remittance', value: fmt(totals.pending), color: 'text-amber-700' },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k.label}</div><div className={cn('text-xl font-bold', k.color)}>{k.value}</div></CardContent></Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant={tab === 'entries' ? 'default' : 'outline'} size="sm" onClick={() => setTab('entries')}>WHT Entries</Button>
        <Button variant={tab === 'rates' ? 'default' : 'outline'} size="sm" onClick={() => setTab('rates')}>WHT Rates ({rates.length})</Button>
      </div>

      {tab === 'rates' ? (
        <Card><CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rates.map(r => (
              <div key={r.id} className="p-3 border rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.name_en}</div>
                  {r.code && <div className="text-xs text-muted-foreground font-mono">{r.code}</div>}
                  <Badge variant="outline" className="text-[10px] mt-1">{r.applies_to}</Badge>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-rose-600">{r.rate_pct}%</div>
                  {canManage && <button onClick={() => { setEditRate(r); setRateForm({ name_en: r.name_en, code: r.code ?? '', rate_pct: String(r.rate_pct), applies_to: r.applies_to }); setRateFormOpen(true); }} className="text-xs text-blue-600 hover:underline">Edit</button>}
                </div>
              </div>
            ))}
            {rates.length === 0 && <div className="col-span-3 text-center py-8 text-muted-foreground text-sm">No WHT rates configured.</div>}
          </div>
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">WHT Entries ({filteredEntries.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-48"><Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" /><Input placeholder="Search vendor, invoice…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" /></div>
              <Select value={remittedFilter} onValueChange={setRemittedFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="pending">Pending Remittance</SelectItem><SelectItem value="remitted">Remitted</SelectItem></SelectContent>
              </Select>
            </div>
            {loading ? <PageLoader compact />
            : filteredEntries.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No entries found.</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Vendor</th><th className="px-3 py-2 text-left">Invoice</th>
                    <th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">WHT</th><th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-center">Remitted</th><th className="px-3 py-2"></th>
                  </tr></thead>
                  <tbody>
                    {filteredEntries.map(e => (
                      <tr key={e.id} className="border-b hover:bg-muted/30 group" data-testid={`row-wht-${e.id}`}>
                        <td className="px-3 py-2 text-muted-foreground">{e.entry_date}</td>
                        <td className="px-3 py-2 font-medium">{e.vendor_name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{e.invoice_ref ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{e.currency} {fmt(e.gross_amount)}</td>
                        <td className="px-3 py-2 text-right text-rose-700 font-medium">{fmt(e.wht_amount)}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{fmt(e.net_amount)}</td>
                        <td className="px-3 py-2 text-center">
                          {e.remitted ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <Clock className="w-4 h-4 text-amber-500 mx-auto" />}
                        </td>
                        <td className="px-3 py-2">{canManage && !e.remitted && <button onClick={() => void markRemitted(e.id)} className="opacity-0 group-hover:opacity-100 text-xs text-emerald-700 hover:underline">Mark Remitted</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={rateFormOpen} onOpenChange={setRateFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editRate ? 'Edit WHT Rate' : 'New WHT Rate'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Name *</Label><Input value={rateForm.name_en} onChange={e => rf('name_en', e.target.value)} placeholder="e.g. Suppliers WHT" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Code</Label><Input value={rateForm.code} onChange={e => rf('code', e.target.value)} placeholder="WHT-5" /></div>
              <div className="space-y-1"><Label>Rate % *</Label><Input type="number" value={rateForm.rate_pct} onChange={e => rf('rate_pct', e.target.value)} placeholder="5" /></div>
            </div>
            <div className="space-y-1"><Label>Applies To</Label>
              <Select value={rateForm.applies_to} onValueChange={v => rf('applies_to', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="vendor">Vendor</SelectItem><SelectItem value="employee">Employee</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveRate()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={entryFormOpen} onOpenChange={setEntryFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record WHT Entry</DialogTitle><DialogDescription>WHT amount is auto-calculated from the rate.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>WHT Rate *</Label>
              <Select value={entryForm.rate_id} onValueChange={v => ef('rate_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select rate" /></SelectTrigger>
                <SelectContent>{rates.map(r => <SelectItem key={r.id} value={r.id}>{r.name_en} ({r.rate_pct}%)</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Date</Label><Input type="date" value={entryForm.entry_date} onChange={e => ef('entry_date', e.target.value)} /></div>
              <div className="space-y-1"><Label>Currency</Label>
                <Select value={entryForm.currency} onValueChange={v => ef('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['SDG','USD','EUR'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Vendor Name *</Label><Input value={entryForm.vendor_name} onChange={e => ef('vendor_name', e.target.value)} placeholder="Vendor / Supplier name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Invoice Ref</Label><Input value={entryForm.invoice_ref} onChange={e => ef('invoice_ref', e.target.value)} placeholder="INV-001" /></div>
              <div className="space-y-1"><Label>Gross Amount *</Label><Input type="number" value={entryForm.gross_amount} onChange={e => ef('gross_amount', e.target.value)} placeholder="0.00" /></div>
            </div>
            {entryForm.rate_id && entryForm.gross_amount && (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 text-sm">
                <div className="flex justify-between"><span>WHT ({rates.find(r => r.id === entryForm.rate_id)?.rate_pct}%)</span><strong className="text-rose-700">{fmt(parseFloat(entryForm.gross_amount) * ((rates.find(r => r.id === entryForm.rate_id)?.rate_pct ?? 0) / 100))}</strong></div>
                <div className="flex justify-between mt-1"><span>Net to Vendor</span><strong className="text-emerald-700">{fmt(parseFloat(entryForm.gross_amount) * (1 - (rates.find(r => r.id === entryForm.rate_id)?.rate_pct ?? 0) / 100))}</strong></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveEntry()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
