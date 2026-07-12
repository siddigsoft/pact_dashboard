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
import { Loader2, Plus, Download, RefreshCw, Wallet, ArrowUpCircle, ArrowDownCircle, Pencil, ListOrdered } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface CashBox { id: string; name: string; code: string | null; location: string | null; currency: string; float_limit: number; current_balance: number; status: string; is_active: boolean; }
interface CashTxn { id: string; box_id: string; txn_date: string; txn_type: string; description: string; amount: number; balance_after: number; receipt_ref: string | null; created_at: string; }

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n);

export default function AccountingPettyCash() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [boxes, setBoxes] = useState<CashBox[]>([]);
  const [txns, setTxns] = useState<CashTxn[]>([]);
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [boxFormOpen, setBoxFormOpen] = useState(false);
  const [txnFormOpen, setTxnFormOpen] = useState(false);
  const [editBox, setEditBox] = useState<CashBox | null>(null);
  const [saving, setSaving] = useState(false);

  const BLANK_BOX = { name: '', code: '', location: '', currency: 'USD', float_limit: '500', current_balance: '0' };
  const BLANK_TXN = { txn_date: new Date().toISOString().slice(0, 10), txn_type: 'payment', description: '', amount: '', receipt_ref: '' };
  const [boxForm, setBoxForm] = useState<Record<string, string>>(BLANK_BOX);
  const [txnForm, setTxnForm] = useState<Record<string, string>>(BLANK_TXN);
  const bf = (k: string, v: string) => setBoxForm(p => ({ ...p, [k]: v }));
  const tf = (k: string, v: string) => setTxnForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const [bRes, tRes] = await Promise.all([
      supabase.from('acct_petty_cash_boxes' as any).select('*').order('name'),
      supabase.from('acct_petty_cash_transactions' as any).select('*').order('txn_date', { ascending: false }).limit(200),
    ]);
    setBoxes((bRes.data ?? []) as CashBox[]);
    setTxns((tRes.data ?? []) as CashTxn[]);
    if (!selectedBox && (bRes.data ?? []).length > 0) setSelectedBox((bRes.data as CashBox[])[0].id);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const activeTxns = useMemo(() => txns.filter(t => t.box_id === selectedBox), [txns, selectedBox]);
  const activeBox = useMemo(() => boxes.find(b => b.id === selectedBox), [boxes, selectedBox]);

  const saveBox = async () => {
    if (!boxForm.name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { name: boxForm.name.trim(), code: boxForm.code || null, location: boxForm.location || null, currency: boxForm.currency, float_limit: parseFloat(boxForm.float_limit) || 500, current_balance: parseFloat(boxForm.current_balance) || 0 };
    const { error } = editBox
      ? await supabase.from('acct_petty_cash_boxes' as any).update(payload).eq('id', editBox.id)
      : await supabase.from('acct_petty_cash_boxes' as any).insert({ ...payload, status: 'open', is_active: true });
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Saved' }); setBoxFormOpen(false); void load(); }
    setSaving(false);
  };

  const saveTxn = async () => {
    if (!txnForm.description.trim() || !txnForm.amount) { toast({ title: 'Description and amount required', variant: 'destructive' }); return; }
    if (!selectedBox) return;
    setSaving(true);
    const amount = txnForm.txn_type === 'payment' ? -Math.abs(parseFloat(txnForm.amount)) : Math.abs(parseFloat(txnForm.amount));
    const newBalance = (activeBox?.current_balance ?? 0) + amount;
    const payload = { box_id: selectedBox, txn_date: txnForm.txn_date, txn_type: txnForm.txn_type, description: txnForm.description.trim(), amount, balance_after: newBalance, receipt_ref: txnForm.receipt_ref || null };
    const { error } = await supabase.from('acct_petty_cash_transactions' as any).insert(payload);
    if (!error) await supabase.from('acct_petty_cash_boxes' as any).update({ current_balance: newBalance }).eq('id', selectedBox);
    if (error) toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Transaction recorded' }); setTxnFormOpen(false); void load(); }
    setSaving(false);
  };

  if (!authReady || !isAuthenticated) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="w-6 h-6 text-emerald-600" /> Petty Cash / Cash Boxes</h1>
          <p className="text-sm text-muted-foreground mt-1">Per-office cash floats with transaction log and cash count sheets</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" onClick={() => { setEditBox(null); setBoxForm(BLANK_BOX); setBoxFormOpen(true); }}><Plus className="w-4 h-4 mr-1" /> New Box</Button>}
          {canManage && selectedBox && <Button size="sm" variant="outline" onClick={() => { setTxnForm(BLANK_TXN); setTxnFormOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Add Transaction</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        </div>
      </div>

      {/* Box cards */}
      {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {boxes.map(b => (
            <Card key={b.id} className={cn('cursor-pointer transition-all', selectedBox === b.id ? 'ring-2 ring-emerald-500' : 'hover:shadow-md')} onClick={() => setSelectedBox(b.id)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{b.name}</div>
                    {b.location && <div className="text-xs text-muted-foreground">{b.location}</div>}
                  </div>
                  <div className="flex gap-1 items-center">
                    <Badge variant="outline" className={b.status === 'open' ? 'text-emerald-700 border-emerald-300' : 'text-zinc-500'}>{b.status}</Badge>
                    {canManage && <button onClick={e => { e.stopPropagation(); setEditBox(b); setBoxForm({ name: b.name, code: b.code ?? '', location: b.location ?? '', currency: b.currency, float_limit: String(b.float_limit), current_balance: String(b.current_balance) }); setBoxFormOpen(true); }} className="p-1 hover:bg-muted rounded"><Pencil className="w-3 h-3" /></button>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><div className="text-xs text-muted-foreground">Balance</div><div className={cn('font-bold text-lg', b.current_balance < b.float_limit * 0.2 ? 'text-rose-600' : 'text-emerald-700')}>{b.currency} {fmt(b.current_balance)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Float Limit</div><div className="font-medium">{b.currency} {fmt(b.float_limit)}</div></div>
                </div>
                <div className="mt-2 h-1.5 rounded bg-muted overflow-hidden">
                  <div className={cn('h-full rounded transition-all', b.current_balance < b.float_limit * 0.2 ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, (b.current_balance / b.float_limit) * 100)}%` }} />
                </div>
              </CardContent>
            </Card>
          ))}
          {boxes.length === 0 && <div className="col-span-3 text-center py-12 text-muted-foreground text-sm">No cash boxes yet. Create the first one.</div>}
        </div>
      )}

      {/* Transactions */}
      {activeBox && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><ListOrdered className="w-4 h-4" /> {activeBox.name} — Transactions</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportToExcel(activeTxns, `petty-cash-${activeBox.name}`)} disabled={!activeTxns.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeTxns.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm">No transactions yet.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-left">Ref</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr></thead>
                  <tbody>
                    {activeTxns.map(t => (
                      <tr key={t.id} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground">{t.txn_date}</td>
                        <td className="px-3 py-2">
                          {t.amount > 0
                            ? <span className="flex items-center gap-1 text-emerald-700 text-xs"><ArrowUpCircle className="w-3 h-3" /> {t.txn_type}</span>
                            : <span className="flex items-center gap-1 text-rose-700 text-xs"><ArrowDownCircle className="w-3 h-3" /> {t.txn_type}</span>}
                        </td>
                        <td className="px-3 py-2">{t.description}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{t.receipt_ref ?? '—'}</td>
                        <td className={cn('px-3 py-2 text-right font-medium', t.amount > 0 ? 'text-emerald-700' : 'text-rose-700')}>{t.amount > 0 ? '+' : ''}{fmt(t.amount)}</td>
                        <td className="px-3 py-2 text-right font-bold">{fmt(t.balance_after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Box Form */}
      <Dialog open={boxFormOpen} onOpenChange={setBoxFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editBox ? 'Edit Cash Box' : 'New Cash Box'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Name *</Label><Input value={boxForm.name} onChange={e => bf('name', e.target.value)} placeholder="Head Office Box" /></div>
              <div className="space-y-1"><Label>Code</Label><Input value={boxForm.code} onChange={e => bf('code', e.target.value)} placeholder="PC-HQ" /></div>
            </div>
            <div className="space-y-1"><Label>Location</Label><Input value={boxForm.location} onChange={e => bf('location', e.target.value)} placeholder="Finance Office, 2nd Floor" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Currency</Label>
                <Select value={boxForm.currency} onValueChange={v => bf('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['USD','SDG','EUR'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Float Limit</Label><Input type="number" value={boxForm.float_limit} onChange={e => bf('float_limit', e.target.value)} /></div>
              <div className="space-y-1"><Label>Opening Balance</Label><Input type="number" value={boxForm.current_balance} onChange={e => bf('current_balance', e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoxFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void saveBox()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Form */}
      <Dialog open={txnFormOpen} onOpenChange={setTxnFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Transaction — {activeBox?.name}</DialogTitle><DialogDescription>Payments reduce balance; top-ups increase it.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Date</Label><Input type="date" value={txnForm.txn_date} onChange={e => tf('txn_date', e.target.value)} /></div>
              <div className="space-y-1"><Label>Type</Label>
                <Select value={txnForm.txn_type} onValueChange={v => tf('txn_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payment">Payment (Out)</SelectItem>
                    <SelectItem value="top_up">Top-up (In)</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Description *</Label><Input value={txnForm.description} onChange={e => tf('description', e.target.value)} placeholder="e.g. Office stationery purchase" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Amount *</Label><Input type="number" value={txnForm.amount} onChange={e => tf('amount', e.target.value)} placeholder="0.00" /></div>
              <div className="space-y-1"><Label>Receipt Ref</Label><Input value={txnForm.receipt_ref} onChange={e => tf('receipt_ref', e.target.value)} placeholder="RCT-001" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxnFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void saveTxn()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
