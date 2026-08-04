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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Download, RefreshCw, Wallet, ArrowUpCircle, ArrowDownCircle, Pencil, ListOrdered, AlertTriangle, Send, CheckCircle2, XCircle } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface CashBox { id: string; name: string; code: string | null; location: string | null; currency: string; float_limit: number; current_balance: number; status: string; is_active: boolean; }
interface CashTxn { id: string; box_id: string; txn_date: string; txn_type: string; description: string; amount: number; balance_after: number; receipt_ref: string | null; }
interface Replenishment { id: string; box_id: string; requested_amount: number; current_balance: number; status: string; requested_at: string; notes: string | null; profiles?: { full_name: string }; }

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n);

const REPLEN_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
  fulfilled: 'bg-teal-50 text-teal-700',
};

export default function AccountingPettyCash() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed   = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [boxes, setBoxes]         = useState<CashBox[]>([]);
  const [txns, setTxns]           = useState<CashTxn[]>([]);
  const [replenishments, setReplenishments] = useState<Replenishment[]>([]);
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [boxFormOpen, setBoxFormOpen] = useState(false);
  const [txnFormOpen, setTxnFormOpen] = useState(false);
  const [replenFormOpen, setReplenFormOpen] = useState(false);
  const [editBox, setEditBox]     = useState<CashBox | null>(null);
  const [saving, setSaving]       = useState(false);
  const [activeTab, setActiveTab] = useState<'transactions' | 'replenishments'>('transactions');

  const BLANK_BOX = { name: '', code: '', location: '', currency: 'USD', float_limit: '500', current_balance: '0' };
  const BLANK_TXN = { txn_date: new Date().toISOString().slice(0, 10), txn_type: 'payment', description: '', amount: '', receipt_ref: '' };
  const BLANK_REP = { requested_amount: '', notes: '' };
  const [boxForm, setBoxForm] = useState<Record<string, string>>(BLANK_BOX);
  const [txnForm, setTxnForm] = useState<Record<string, string>>(BLANK_TXN);
  const [replenForm, setReplenForm] = useState<Record<string, string>>(BLANK_REP);
  const bf = (k: string, v: string) => setBoxForm(p => ({ ...p, [k]: v }));
  const tf = (k: string, v: string) => setTxnForm(p => ({ ...p, [k]: v }));
  const rp = (k: string, v: string) => setReplenForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const [bRes, tRes, rRes] = await Promise.all([
      supabase.from('acct_petty_cash_boxes' as any).select('*').order('name'),
      supabase.from('acct_petty_cash_transactions' as any).select('*').order('txn_date', { ascending: false }).limit(200),
      supabase.from('acct_petty_cash_replenishments' as any).select('*, profiles(full_name)').order('requested_at', { ascending: false }),
    ]);
    setBoxes((bRes.data ?? []) as CashBox[]);
    setTxns((tRes.data ?? []) as CashTxn[]);
    setReplenishments((rRes.data ?? []) as Replenishment[]);
    if (!selectedBox && (bRes.data ?? []).length > 0) setSelectedBox((bRes.data as CashBox[])[0].id);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const activeTxns  = useMemo(() => txns.filter(t => t.box_id === selectedBox), [txns, selectedBox]);
  const activeReplens = useMemo(() => replenishments.filter(r => r.box_id === selectedBox), [replenishments, selectedBox]);
  const activeBox   = useMemo(() => boxes.find(b => b.id === selectedBox), [boxes, selectedBox]);
  const isLow       = activeBox ? activeBox.current_balance < activeBox.float_limit * 0.2 : false;
  const pendingCount = useMemo(() => replenishments.filter(r => r.status === 'pending').length, [replenishments]);

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
    const { error } = await supabase.from('acct_petty_cash_transactions' as any).insert({ box_id: selectedBox, txn_date: txnForm.txn_date, txn_type: txnForm.txn_type, description: txnForm.description.trim(), amount, balance_after: newBalance, receipt_ref: txnForm.receipt_ref || null });
    if (!error) await supabase.from('acct_petty_cash_boxes' as any).update({ current_balance: newBalance }).eq('id', selectedBox);
    if (error) toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Transaction recorded' }); setTxnFormOpen(false); void load(); }
    setSaving(false);
  };

  const requestReplenishment = async () => {
    if (!replenForm.requested_amount || !selectedBox) { toast({ title: 'Amount required', variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('acct_petty_cash_replenishments' as any).insert({ box_id: selectedBox, requested_amount: parseFloat(replenForm.requested_amount), current_balance: activeBox?.current_balance ?? 0, notes: replenForm.notes || null, status: 'pending' });
    if (error) toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Replenishment request submitted' }); setReplenFormOpen(false); void load(); }
    setSaving(false);
  };

  const approveReplen = async (id: string) => {
    await supabase.from('acct_petty_cash_replenishments' as any).update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', id);
    toast({ title: 'Approved' }); void load();
  };

  const rejectReplen = async (id: string) => {
    await supabase.from('acct_petty_cash_replenishments' as any).update({ status: 'rejected' }).eq('id', id);
    toast({ title: 'Rejected' }); void load();
  };

  const fulfillReplen = async (rep: Replenishment) => {
    // Create top-up transaction + update box balance
    const newBalance = (activeBox?.current_balance ?? 0) + rep.requested_amount;
    await supabase.from('acct_petty_cash_transactions' as any).insert({ box_id: rep.box_id, txn_date: new Date().toISOString().slice(0, 10), txn_type: 'top_up', description: `Replenishment top-up`, amount: rep.requested_amount, balance_after: newBalance });
    await supabase.from('acct_petty_cash_boxes' as any).update({ current_balance: newBalance }).eq('id', rep.box_id);
    await supabase.from('acct_petty_cash_replenishments' as any).update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() }).eq('id', rep.id);
    toast({ title: 'Replenishment fulfilled — top-up transaction recorded' }); void load();
  };

  if (!authReady || !isAuthenticated) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="w-6 h-6 text-emerald-600" /> Petty Cash / Cash Boxes</h1>
          <p className="text-sm text-muted-foreground mt-1">Per-office cash floats with replenishment request workflow</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" onClick={() => { setEditBox(null); setBoxForm(BLANK_BOX); setBoxFormOpen(true); }}><Plus className="w-4 h-4 mr-1" /> New Box</Button>}
          {selectedBox && <Button size="sm" variant="outline" onClick={() => { setTxnForm(BLANK_TXN); setTxnFormOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Transaction</Button>}
          {selectedBox && <Button size="sm" variant={isLow ? 'default' : 'outline'} onClick={() => { setReplenForm(BLANK_REP); setReplenFormOpen(true); }} className={isLow ? 'bg-amber-600 hover:bg-amber-700' : ''}><Send className="w-4 h-4 mr-1" /> Request Top-up{isLow ? ' ⚠️' : ''}</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-amber-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{pendingCount}</strong> replenishment request{pendingCount !== 1 ? 's' : ''} pending approval.</span>
        </div>
      )}

      {loading ? <PageLoader compact /> : (
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
                {b.current_balance < b.float_limit * 0.2 && <div className="text-[10px] text-rose-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Low — replenishment needed</div>}
              </CardContent>
            </Card>
          ))}
          {boxes.length === 0 && <div className="col-span-3 text-center py-12 text-muted-foreground text-sm">No cash boxes yet.</div>}
        </div>
      )}

      {activeBox && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{activeBox.name}</CardTitle>
              <div className="flex gap-1">
                <button onClick={() => setActiveTab('transactions')} className={cn('text-xs px-3 py-1.5 rounded', activeTab === 'transactions' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>Transactions</button>
                <button onClick={() => setActiveTab('replenishments')} className={cn('text-xs px-3 py-1.5 rounded flex items-center gap-1', activeTab === 'replenishments' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                  Replenishments
                  {activeReplens.filter(r => r.status === 'pending').length > 0 && <span className="bg-amber-500 text-white text-[9px] px-1 rounded-full">{activeReplens.filter(r => r.status === 'pending').length}</span>}
                </button>
                <Button variant="outline" size="sm" onClick={() => exportToExcel(activeTxns, `petty-cash-${activeBox.name}`)} disabled={!activeTxns.length}><Download className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === 'transactions' ? (
              activeTxns.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm">No transactions yet.</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-left">Ref</th>
                      <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Balance</th>
                    </tr></thead>
                    <tbody>
                      {activeTxns.map(t => (
                        <tr key={t.id} className="border-b hover:bg-muted/30">
                          <td className="px-3 py-2 text-muted-foreground">{t.txn_date}</td>
                          <td className="px-3 py-2">{t.amount > 0 ? <span className="flex items-center gap-1 text-emerald-700 text-xs"><ArrowUpCircle className="w-3 h-3" /> {t.txn_type}</span> : <span className="flex items-center gap-1 text-rose-700 text-xs"><ArrowDownCircle className="w-3 h-3" /> {t.txn_type}</span>}</td>
                          <td className="px-3 py-2">{t.description}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{t.receipt_ref ?? '—'}</td>
                          <td className={cn('px-3 py-2 text-right font-medium', t.amount > 0 ? 'text-emerald-700' : 'text-rose-700')}>{t.amount > 0 ? '+' : ''}{fmt(t.amount)}</td>
                          <td className="px-3 py-2 text-right font-bold">{fmt(t.balance_after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              activeReplens.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm">No replenishment requests yet.</div> : (
                <div className="space-y-2">
                  {activeReplens.map(r => (
                    <div key={r.id} className={cn('p-3 border rounded-lg flex items-center justify-between gap-3', r.status === 'pending' ? 'border-amber-200 bg-amber-50/50' : '')}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{activeBox.currency} {fmt(r.requested_amount)}</span>
                          <Badge variant="outline" className={cn('text-[10px]', REPLEN_COLORS[r.status])}>{r.status}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Requested: {new Date(r.requested_at).toLocaleDateString()} · Box balance then: {fmt(r.current_balance)}
                          {r.notes && <span> · {r.notes}</span>}
                        </div>
                      </div>
                      {canManage && r.status === 'pending' && (
                        <div className="flex gap-1">
                          <button onClick={() => void approveReplen(r.id)} className="p-1.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700" title="Approve"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => void rejectReplen(r.id)} className="p-1.5 rounded bg-rose-100 hover:bg-rose-200 text-rose-700" title="Reject"><XCircle className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                      {canManage && r.status === 'approved' && (
                        <button onClick={() => void fulfillReplen(r)} className="text-xs px-3 py-1.5 rounded bg-teal-100 hover:bg-teal-200 text-teal-700 font-medium">Fulfill Top-up</button>
                      )}
                    </div>
                  ))}
                </div>
              )
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
                  <SelectContent><SelectItem value="payment">Payment (Out)</SelectItem><SelectItem value="top_up">Top-up (In)</SelectItem><SelectItem value="adjustment">Adjustment</SelectItem></SelectContent>
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

      {/* Replenishment Request Form */}
      <Dialog open={replenFormOpen} onOpenChange={setReplenFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Request Cash Replenishment</DialogTitle><DialogDescription>{activeBox?.name} — Current balance: {activeBox ? fmt(activeBox.current_balance) : ''}</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Amount Needed *</Label><Input type="number" value={replenForm.requested_amount} onChange={e => rp('requested_amount', e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-1"><Label>Notes</Label><Textarea value={replenForm.notes} onChange={e => rp('notes', e.target.value)} rows={2} placeholder="Why is replenishment needed?" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplenFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void requestReplenishment()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}<Send className="w-4 h-4 mr-1" />Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
