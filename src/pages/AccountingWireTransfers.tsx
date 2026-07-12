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
import { Loader2, Plus, Search, Download, RefreshCw, Send, DollarSign, Pencil } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface Wire {
  id: string; transfer_date: string; reference: string; swift_ref: string | null;
  beneficiary_name: string; beneficiary_bank: string | null; beneficiary_swift: string | null;
  amount: number; currency: string; exchange_rate: number; charges: number;
  purpose: string | null; status: string; notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  initiated: 'bg-gray-100 text-gray-700', pending: 'bg-amber-50 text-amber-700',
  processing: 'bg-blue-50 text-blue-700', completed: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700', returned: 'bg-purple-50 text-purple-700',
};

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n ?? 0);

export default function AccountingWireTransfers() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [rows, setRows] = useState<Wire[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Wire | null>(null);
  const [saving, setSaving] = useState(false);

  const BLANK = { transfer_date: new Date().toISOString().slice(0, 10), reference: `WIRE-${Date.now().toString().slice(-6)}`, swift_ref: '', beneficiary_name: '', beneficiary_bank: '', beneficiary_swift: '', beneficiary_iban: '', amount: '', currency: 'USD', exchange_rate: '1', charges: '0', purpose: '', status: 'initiated', notes: '' };
  const [form, setForm] = useState<Record<string, string>>(BLANK);
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('acct_wire_transfers' as any).select('*').order('transfer_date', { ascending: false });
    setRows((data ?? []) as Wire[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (q) return r.beneficiary_name.toLowerCase().includes(q) || r.reference.toLowerCase().includes(q) || (r.swift_ref ?? '').toLowerCase().includes(q);
      return true;
    });
  }, [rows, search, statusFilter]);

  const totals = useMemo(() => ({
    amount: filtered.reduce((s, r) => s + r.amount, 0),
    charges: filtered.reduce((s, r) => s + r.charges, 0),
    completed: filtered.filter(r => r.status === 'completed').length,
  }), [filtered]);

  const openAdd = () => { setEditTarget(null); setForm(BLANK); setFormOpen(true); };
  const openEdit = (r: Wire) => { setEditTarget(r); setForm({ transfer_date: r.transfer_date, reference: r.reference, swift_ref: r.swift_ref ?? '', beneficiary_name: r.beneficiary_name, beneficiary_bank: r.beneficiary_bank ?? '', beneficiary_swift: r.beneficiary_swift ?? '', amount: String(r.amount), currency: r.currency, exchange_rate: String(r.exchange_rate), charges: String(r.charges), purpose: r.purpose ?? '', status: r.status, notes: r.notes ?? '' }); setFormOpen(true); };

  const handleSave = async () => {
    if (!form.beneficiary_name.trim() || !form.amount) { toast({ title: 'Beneficiary and amount required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { transfer_date: form.transfer_date, reference: form.reference, swift_ref: form.swift_ref || null, beneficiary_name: form.beneficiary_name.trim(), beneficiary_bank: form.beneficiary_bank || null, beneficiary_swift: form.beneficiary_swift || null, amount: parseFloat(form.amount), currency: form.currency, exchange_rate: parseFloat(form.exchange_rate) || 1, charges: parseFloat(form.charges) || 0, purpose: form.purpose || null, status: form.status, notes: form.notes || null };
    const { error } = editTarget
      ? await supabase.from('acct_wire_transfers' as any).update(payload).eq('id', editTarget.id)
      : await supabase.from('acct_wire_transfers' as any).insert(payload);
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
          <h1 className="text-2xl font-bold flex items-center gap-2"><Send className="w-6 h-6 text-blue-600" /> Wire / SWIFT Transfers</h1>
          <p className="text-sm text-muted-foreground mt-1">International wire transfer register — SWIFT refs, status, and exchange rates</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> New Wire</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered, 'wire-transfers')} disabled={!filtered.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: `Total Transferred (${filtered.length})`, value: `${fmt(totals.amount)}`, color: 'text-blue-700' },
          { label: 'Total Charges', value: fmt(totals.charges), color: 'text-rose-700' },
          { label: 'Completed', value: totals.completed, color: 'text-emerald-700' },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k.label}</div><div className={cn('text-xl font-bold', k.color)}>{k.value}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Transfers</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48"><Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" /><Input placeholder="Search beneficiary, reference…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" /></div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No wire transfers found.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-left">Beneficiary</th><th className="px-3 py-2 text-left">Bank</th>
                  <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-center">Status</th><th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/30 group" data-testid={`row-wire-${r.id}`}>
                      <td className="px-3 py-2 text-muted-foreground">{r.transfer_date}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.reference}</td>
                      <td className="px-3 py-2 font-medium">{r.beneficiary_name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.beneficiary_bank ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-bold">{r.currency} {fmt(r.amount)}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{r.exchange_rate !== 1 ? r.exchange_rate : '—'}</td>
                      <td className="px-3 py-2 text-center"><Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[r.status] ?? '')}>{r.status}</Badge></td>
                      <td className="px-3 py-2">{canManage && <button onClick={() => openEdit(r)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-50 text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit Wire Transfer' : 'New Wire Transfer'}</DialogTitle><DialogDescription>Record an international bank transfer.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.transfer_date} onChange={e => sf('transfer_date', e.target.value)} /></div>
              <div className="space-y-1"><Label>Reference</Label><Input value={form.reference} onChange={e => sf('reference', e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Beneficiary Name *</Label><Input value={form.beneficiary_name} onChange={e => sf('beneficiary_name', e.target.value)} placeholder="UNHCR HQ / Vendor Name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Beneficiary Bank</Label><Input value={form.beneficiary_bank} onChange={e => sf('beneficiary_bank', e.target.value)} placeholder="Bank name" /></div>
              <div className="space-y-1"><Label>SWIFT Code</Label><Input value={form.beneficiary_swift} onChange={e => sf('beneficiary_swift', e.target.value)} placeholder="XXXXXX" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-1"><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => sf('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['USD','EUR','GBP','SAR','AED'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Amount *</Label><Input type="number" value={form.amount} onChange={e => sf('amount', e.target.value)} placeholder="0.00" /></div>
              <div className="space-y-1"><Label>FX Rate</Label><Input type="number" value={form.exchange_rate} onChange={e => sf('exchange_rate', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Bank Charges</Label><Input type="number" value={form.charges} onChange={e => sf('charges', e.target.value)} placeholder="0.00" /></div>
              <div className="space-y-1"><Label>Status</Label>
                <Select value={form.status} onValueChange={v => sf('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Purpose</Label><Input value={form.purpose} onChange={e => sf('purpose', e.target.value)} placeholder="e.g. Program funds disbursement Q2" /></div>
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
