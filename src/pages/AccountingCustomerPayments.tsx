import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Search, Download, RefreshCw, CreditCard, DollarSign, Pencil } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';

interface Payment {
  id: string; payment_date: string; customer_name: string; amount: number;
  currency: string; payment_method: string; reference: string | null;
  status: string; notes: string | null; created_at: string;
}

const METHOD_COLORS: Record<string, string> = {
  bank_transfer: 'bg-blue-50 text-blue-700', cheque: 'bg-amber-50 text-amber-700',
  cash: 'bg-emerald-50 text-emerald-700', mobile_money: 'bg-purple-50 text-purple-700',
  card: 'bg-rose-50 text-rose-700',
};

const fmt = (n: number, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n ?? 0);

export default function AccountingCustomerPayments() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Payment | null>(null);
  const [saving, setSaving] = useState(false);

  const BLANK = { payment_date: new Date().toISOString().slice(0, 10), customer_name: '', amount: '', currency: 'USD', payment_method: 'bank_transfer', reference: '', notes: '', status: 'posted' };
  const [form, setForm] = useState<Record<string, string>>(BLANK);
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('acct_customer_payments' as any).select('*').order('payment_date', { ascending: false }).limit(500);
    setRows((data ?? []) as Payment[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (methodFilter !== 'all' && r.payment_method !== methodFilter) return false;
      if (q) return r.customer_name.toLowerCase().includes(q) || (r.reference ?? '').toLowerCase().includes(q);
      return true;
    });
  }, [rows, search, methodFilter]);

  const total = useMemo(() => filtered.reduce((s, r) => s + r.amount, 0), [filtered]);

  const openAdd = () => { setEditTarget(null); setForm(BLANK); setFormOpen(true); };
  const openEdit = (r: Payment) => { setEditTarget(r); setForm({ payment_date: r.payment_date, customer_name: r.customer_name, amount: String(r.amount), currency: r.currency, payment_method: r.payment_method, reference: r.reference ?? '', notes: r.notes ?? '', status: r.status }); setFormOpen(true); };

  const handleSave = async () => {
    if (!form.customer_name.trim() || !form.amount) { toast({ title: 'Customer and amount required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { payment_date: form.payment_date, customer_name: form.customer_name.trim(), amount: parseFloat(form.amount), currency: form.currency, payment_method: form.payment_method, reference: form.reference || null, notes: form.notes || null, status: form.status };
    const { error } = editTarget
      ? await supabase.from('acct_customer_payments' as any).update(payload).eq('id', editTarget.id)
      : await supabase.from('acct_customer_payments' as any).insert(payload);
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Saved' }); setFormOpen(false); void load(); }
    setSaving(false);
  };

  if (!authReady || !isAuthenticated) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="w-6 h-6 text-emerald-600" /> Customer Payments</h1>
          <p className="text-sm text-muted-foreground mt-1">Record payments received from donors, partners and governments</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Record Payment</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered, 'customer-payments')} disabled={!filtered.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3"><DollarSign className="w-8 h-8 text-emerald-600" /><div><div className="text-xs text-muted-foreground">Total Received ({filtered.length})</div><div className="text-xl font-bold text-emerald-700">{fmt(total)}</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><CreditCard className="w-8 h-8 text-blue-600" /><div><div className="text-xs text-muted-foreground">Methods</div><div className="text-xl font-bold">{new Set(filtered.map(r => r.payment_method)).size}</div></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Payments ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48"><Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" /><Input placeholder="Search customer, reference…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" /></div>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All methods</SelectItem>{Object.keys(METHOD_COLORS).map(m => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No payments found.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Method</th><th className="px-3 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/30 group" data-testid={`row-cpay-${r.id}`}>
                      <td className="px-3 py-2 text-muted-foreground">{r.payment_date}</td>
                      <td className="px-3 py-2 font-medium">{r.customer_name}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className={`text-[10px] ${METHOD_COLORS[r.payment_method] ?? ''}`}>{r.payment_method.replace('_', ' ')}</Badge></td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.reference ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmt(r.amount, r.currency)}</td>
                      <td className="px-3 py-2">{canManage && <button onClick={() => openEdit(r)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-50 text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t bg-muted/30 font-bold"><td colSpan={4} className="px-3 py-2 text-right text-sm">Total</td><td className="px-3 py-2 text-right text-emerald-700">{fmt(total)}</td><td /></tr></tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit Payment' : 'Record Payment'}</DialogTitle><DialogDescription>Log a payment received from a customer or donor.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Customer *</Label><Input value={form.customer_name} onChange={e => sf('customer_name', e.target.value)} placeholder="UNHCR, WFP, MoH…" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Payment Date</Label><Input type="date" value={form.payment_date} onChange={e => sf('payment_date', e.target.value)} /></div>
              <div className="space-y-1"><Label>Method</Label>
                <Select value={form.payment_method} onValueChange={v => sf('payment_method', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(METHOD_COLORS).map(m => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2"><Label>Amount *</Label><Input type="number" value={form.amount} onChange={e => sf('amount', e.target.value)} placeholder="0.00" /></div>
              <div className="space-y-1"><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => sf('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['USD','SDG','EUR','GBP','SAR'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Reference / Cheque #</Label><Input value={form.reference} onChange={e => sf('reference', e.target.value)} placeholder="TXN-REF-123" /></div>
            <div className="space-y-1"><Label>Notes</Label><Input value={form.notes} onChange={e => sf('notes', e.target.value)} placeholder="Optional notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
