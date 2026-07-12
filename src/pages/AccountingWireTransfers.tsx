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
import { Loader2, Plus, Search, Download, RefreshCw, Send, DollarSign, Pencil, CheckCircle2, XCircle, ArrowRight, Clock } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface Wire {
  id: string; transfer_date: string; reference: string; swift_ref: string | null;
  beneficiary_name: string; beneficiary_bank: string | null; beneficiary_swift: string | null;
  amount: number; currency: string; exchange_rate: number; charges: number;
  purpose: string | null; status: string; notes: string | null;
  swift_confirm_ref: string | null; rejection_reason: string | null;
  submitted_at: string | null; processed_at: string | null; completed_at: string | null;
}

const STATUS_STEPS = ['initiated', 'pending', 'processing', 'completed'];
const STATUS_COLORS: Record<string, string> = {
  initiated: 'bg-gray-100 text-gray-700',
  pending: 'bg-amber-50 text-amber-700',
  processing: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
  returned: 'bg-purple-50 text-purple-700',
};

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n ?? 0);

export default function AccountingWireTransfers() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed   = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [rows, setRows]         = useState<Wire[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceTarget, setAdvanceTarget] = useState<Wire | null>(null);
  const [editTarget, setEditTarget] = useState<Wire | null>(null);
  const [saving, setSaving]     = useState(false);
  const [confirmRef, setConfirmRef] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [advanceAction, setAdvanceAction] = useState<'next' | 'reject'>('next');

  const BLANK = { transfer_date: new Date().toISOString().slice(0, 10), reference: `WIRE-${Date.now().toString().slice(-6)}`, swift_ref: '', beneficiary_name: '', beneficiary_bank: '', beneficiary_swift: '', amount: '', currency: 'USD', exchange_rate: '1', charges: '0', purpose: '', status: 'initiated', notes: '' };
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
    pending: filtered.filter(r => ['initiated', 'pending', 'processing'].includes(r.status)).length,
  }), [filtered]);

  const openAdd  = () => { setEditTarget(null); setForm(BLANK); setFormOpen(true); };
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

  const openAdvance = (r: Wire, action: 'next' | 'reject') => { setAdvanceTarget(r); setAdvanceAction(action); setConfirmRef(''); setRejectReason(''); setAdvanceOpen(true); };

  const confirmAdvance = async () => {
    if (!advanceTarget) return;
    setSaving(true);
    const now = new Date().toISOString();
    let update: Record<string, any> = {};

    if (advanceAction === 'reject') {
      update = { status: 'rejected', rejection_reason: rejectReason || null };
    } else {
      const currentIdx = STATUS_STEPS.indexOf(advanceTarget.status);
      const nextStatus = STATUS_STEPS[currentIdx + 1] ?? 'completed';
      update.status = nextStatus;
      if (nextStatus === 'pending') update.submitted_at = now;
      if (nextStatus === 'processing') update.processed_at = now;
      if (nextStatus === 'completed') { update.completed_at = now; if (confirmRef) update.swift_confirm_ref = confirmRef; }
    }

    const { error } = await supabase.from('acct_wire_transfers' as any).update(update).eq('id', advanceTarget.id);
    if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    else { toast({ title: advanceAction === 'reject' ? 'Transfer rejected' : `Status advanced` }); setAdvanceOpen(false); void load(); }
    setSaving(false);
  };

  const nextStep = (status: string) => {
    const idx = STATUS_STEPS.indexOf(status);
    return STATUS_STEPS[idx + 1] ?? null;
  };

  if (!authReady || !isAuthenticated) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Send className="w-6 h-6 text-blue-600" /> Wire / SWIFT Transfers</h1>
          <p className="text-sm text-muted-foreground mt-1">Status pipeline: Initiated → Pending → Processing → Completed</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> New Wire</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered, 'wire-transfers')} disabled={!filtered.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      {/* Pipeline summary */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_STEPS.map((step, i) => {
          const count = rows.filter(r => r.status === step).length;
          return (
            <span key={step} className="flex items-center gap-2">
              <button onClick={() => setStatusFilter(statusFilter === step ? 'all' : step)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all', statusFilter === step ? 'ring-2 ring-offset-1 ring-primary' : '', STATUS_COLORS[step])}>
                {step} <span className="bg-white/50 rounded-full px-1.5">{count}</span>
              </button>
              {i < STATUS_STEPS.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
            </span>
          );
        })}
        <Badge variant="outline" className="text-rose-700 bg-rose-50">{rows.filter(r => r.status === 'rejected').length} rejected</Badge>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Amount', value: `${filtered[0]?.currency ?? 'USD'} ${fmt(totals.amount)}`, color: 'text-blue-700' },
          { label: 'Total Charges', value: fmt(totals.charges), color: 'text-rose-700' },
          { label: 'Completed', value: totals.completed, color: 'text-emerald-700' },
          { label: 'In Progress', value: totals.pending, color: 'text-amber-700' },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k.label}</div><div className={cn('text-xl font-bold', k.color)}>{k.value}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Transfers ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48"><Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" /><Input placeholder="Search beneficiary, reference…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" /></div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No wire transfers found.</div>
          : (
            <div className="space-y-2">
              {filtered.map(r => {
                const next = nextStep(r.status);
                const inProgress = ['initiated', 'pending', 'processing'].includes(r.status);
                return (
                  <div key={r.id} className="p-3 border rounded-lg hover:shadow-sm transition-shadow" data-testid={`row-wire-${r.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{r.beneficiary_name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{r.reference}</span>
                          <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[r.status] ?? '')}>{r.status}</Badge>
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                          <span>{r.transfer_date}</span>
                          {r.beneficiary_bank && <span>{r.beneficiary_bank}</span>}
                          {r.swift_ref && <span className="font-mono">SWIFT: {r.swift_ref}</span>}
                          {r.swift_confirm_ref && <span className="text-emerald-600 font-mono">Confirm: {r.swift_confirm_ref}</span>}
                        </div>
                        {r.purpose && <div className="text-xs text-muted-foreground mt-0.5">{r.purpose}</div>}
                        {r.rejection_reason && <div className="text-xs text-rose-600 mt-0.5">Rejected: {r.rejection_reason}</div>}
                        {/* Progress bar */}
                        {inProgress && (
                          <div className="flex items-center gap-1 mt-2">
                            {STATUS_STEPS.map((step, i) => (
                              <span key={step} className="flex items-center gap-1">
                                <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', r.status === step ? STATUS_COLORS[step] : STATUS_STEPS.indexOf(r.status) > i ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400')}>{step}</span>
                                {i < STATUS_STEPS.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/40" />}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold">{r.currency} {fmt(r.amount)}</div>
                        {r.charges > 0 && <div className="text-xs text-muted-foreground">Charges: {fmt(r.charges)}</div>}
                        {r.exchange_rate !== 1 && <div className="text-xs text-muted-foreground">Rate: {r.exchange_rate}</div>}
                        {canManage && (
                          <div className="flex gap-1 mt-2 justify-end">
                            <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                            {next && <button onClick={() => openAdvance(r, 'next')} className="p-1 rounded hover:bg-blue-50 text-blue-600" title={`Advance to ${next}`}><CheckCircle2 className="w-3.5 h-3.5" /></button>}
                            {inProgress && <button onClick={() => openAdvance(r, 'reject')} className="p-1 rounded hover:bg-rose-50 text-rose-600" title="Reject transfer"><XCircle className="w-3.5 h-3.5" /></button>}
                          </div>
                        )}
                      </div>
                    </div>
                    {r.status === 'completed' && r.completed_at && (
                      <div className="flex items-center gap-1 text-[10px] text-emerald-700 mt-2"><CheckCircle2 className="w-3 h-3" /> Completed {new Date(r.completed_at).toLocaleDateString()}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
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
              <div className="space-y-1"><Label>Currency</Label>
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

      {/* Status advance dialog */}
      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{advanceAction === 'reject' ? 'Reject Transfer' : `Advance: ${advanceTarget?.status} → ${nextStep(advanceTarget?.status ?? '')}`}</DialogTitle>
            <DialogDescription>{advanceTarget?.reference} — {advanceTarget?.beneficiary_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {advanceAction === 'next' && nextStep(advanceTarget?.status ?? '') === 'completed' && (
              <div className="space-y-1"><Label>SWIFT Confirmation Reference (optional)</Label><Input value={confirmRef} onChange={e => setConfirmRef(e.target.value)} placeholder="Confirmation number from bank" /></div>
            )}
            {advanceAction === 'reject' && (
              <div className="space-y-1"><Label>Rejection Reason</Label><Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Invalid beneficiary account" /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant={advanceAction === 'reject' ? 'destructive' : 'default'} onClick={() => void confirmAdvance()} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {advanceAction === 'reject' ? 'Reject' : 'Advance Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
