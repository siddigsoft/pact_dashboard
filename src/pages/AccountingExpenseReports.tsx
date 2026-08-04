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
import { Loader2, Plus, Search, Download, RefreshCw, Receipt, DollarSign, Clock, CheckCircle2, Pencil, Send, ThumbsUp, ThumbsDown, Eye, XCircle, Calculator } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface ExpenseReport {
  id: string; report_number: string; title: string; employee_id: string | null;
  currency: string; total_amount: number; advance_amount: number; balance_due: number;
  period_start: string | null; period_end: string | null; purpose: string | null;
  status: string; submitted_at: string | null; approved_at: string | null;
  rejection_reason: string | null; notes: string | null; created_at: string;
  tier1_approved_by: string | null; tier1_approved_at: string | null;
  tier2_approved_by: string | null; tier2_approved_at: string | null;
  profiles?: { full_name: string };
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-50 text-blue-700',
  under_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
  paid: 'bg-teal-50 text-teal-700',
  closed: 'bg-zinc-100 text-zinc-500',
};

const FLOW_STEPS = ['draft', 'submitted', 'under_review', 'approved', 'paid'];

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

export default function AccountingExpenseReports() {
  const { hasAnyRole, isAuthenticated, user } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed   = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor', 'coordinator', 'fom']);
  const canTier1  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'fom']);
  const canTier2  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);
  const canPay    = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [rows, setRows]           = useState<ExpenseReport[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [perDiemRates, setPerDiemRates] = useState<{ id: string; country_name: string; city: string | null; rate_usd: number }[]>([]);
  const [pdCountry, setPdCountry] = useState('');
  const [pdCalc, setPdCalc]       = useState<{ days: number; rate: number; total: number } | null>(null);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen]   = useState(false);
  const [viewOpen, setViewOpen]   = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ExpenseReport | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editTarget, setEditTarget] = useState<ExpenseReport | null>(null);
  const [selected, setSelected]   = useState<ExpenseReport | null>(null);
  const [saving, setSaving]       = useState(false);

  const BLANK = {
    report_number: `EXP-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    title: '', employee_id: '', currency: 'USD', total_amount: '', advance_amount: '0',
    period_start: '', period_end: '', purpose: '', notes: '', status: 'draft',
  };
  const [form, setForm] = useState<Record<string, string>>(BLANK);
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const [repRes, empRes, pdRes] = await Promise.all([
      supabase.from('acct_expense_reports' as any)
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('acct_per_diem_rates' as any)
        .select('id, city, rate_usd, countries(name_en)')
        .eq('is_active', true)
        .order('rate_usd', { ascending: false }),
    ]);
    setRows((repRes.data ?? []) as ExpenseReport[]);
    setEmployees((empRes.data ?? []) as { id: string; full_name: string }[]);
    setPerDiemRates(((pdRes.data ?? []) as any[]).map((r: any) => ({
      id: r.id, city: r.city, rate_usd: r.rate_usd,
      country_name: r.countries?.name_en ?? 'Unknown',
    })));
    setLoading(false);
  };

  const calcPerDiem = (countryId: string) => {
    const rate = perDiemRates.find(r => r.id === countryId);
    if (!rate || !form.period_start || !form.period_end) { setPdCalc(null); return; }
    const days = Math.max(1, Math.round((new Date(form.period_end).getTime() - new Date(form.period_start).getTime()) / 86400000) + 1);
    const total = days * rate.rate_usd;
    setPdCalc({ days, rate: rate.rate_usd, total });
  };

  const applyPerDiem = () => {
    if (!pdCalc) return;
    sf('total_amount', String(pdCalc.total.toFixed(2)));
    sf('currency', 'USD');
    toast({ title: `Per diem applied: $${fmt(pdCalc.total)} (${pdCalc.days} days × $${fmt(pdCalc.rate)}/day)` });
    setPdCalc(null); setPdCountry('');
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (q) return r.report_number.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || (r.purpose ?? '').toLowerCase().includes(q);
      return true;
    });
  }, [rows, search, statusFilter]);

  const totals = useMemo(() => ({
    total: filtered.reduce((s, r) => s + r.total_amount, 0),
    advances: filtered.reduce((s, r) => s + r.advance_amount, 0),
    pending: filtered.filter(r => ['submitted', 'under_review'].includes(r.status)).length,
  }), [filtered]);

  const openAdd = () => { setEditTarget(null); setForm(BLANK); setFormOpen(true); };
  const openEdit = (r: ExpenseReport) => {
    setEditTarget(r);
    setForm({ report_number: r.report_number, title: r.title, employee_id: r.employee_id ?? '', currency: r.currency, total_amount: String(r.total_amount), advance_amount: String(r.advance_amount), period_start: r.period_start ?? '', period_end: r.period_end ?? '', purpose: r.purpose ?? '', notes: r.notes ?? '', status: r.status });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setSaving(true);
    const total = parseFloat(form.total_amount) || 0;
    const advance = parseFloat(form.advance_amount) || 0;
    const payload = { report_number: form.report_number, title: form.title.trim(), employee_id: form.employee_id || null, currency: form.currency, total_amount: total, advance_amount: advance, balance_due: total - advance, period_start: form.period_start || null, period_end: form.period_end || null, purpose: form.purpose || null, notes: form.notes || null, status: form.status };
    const { error } = editTarget
      ? await supabase.from('acct_expense_reports' as any).update(payload).eq('id', editTarget.id)
      : await supabase.from('acct_expense_reports' as any).insert(payload);
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else { toast({ title: editTarget ? 'Updated' : 'Report created' }); setFormOpen(false); void load(); }
    setSaving(false);
  };

  // Approval actions
  const submit = async (id: string) => {
    await supabase.from('acct_expense_reports' as any).update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', id);
    toast({ title: 'Submitted for review' }); void load();
  };

  const reviewTier1 = async (id: string) => {
    await supabase.from('acct_expense_reports' as any).update({ status: 'under_review', tier1_approved_by: (user as any)?.id ?? null, tier1_approved_at: new Date().toISOString() }).eq('id', id);
    toast({ title: 'Moved to under review (Tier 1 approved)' }); void load();
  };

  const approveTier2 = async (id: string) => {
    await supabase.from('acct_expense_reports' as any).update({ status: 'approved', tier2_approved_by: (user as any)?.id ?? null, tier2_approved_at: new Date().toISOString(), approved_at: new Date().toISOString() }).eq('id', id);
    toast({ title: 'Expense report approved' }); void load();
  };

  const markPaid = async (id: string) => {
    await supabase.from('acct_expense_reports' as any).update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: (user as any)?.id ?? null }).eq('id', id);
    toast({ title: 'Marked as paid' }); void load();
  };

  const openReject = (r: ExpenseReport) => { setRejectTarget(r); setRejectReason(''); setRejectOpen(true); };
  const confirmReject = async () => {
    if (!rejectTarget) return;
    await supabase.from('acct_expense_reports' as any).update({ status: 'rejected', rejection_reason: rejectReason || null }).eq('id', rejectTarget.id);
    toast({ title: 'Report rejected' }); setRejectOpen(false); void load();
  };

  if (!authReady || !isAuthenticated) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="w-6 h-6 text-amber-600" /> Expense Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Two-tier approval workflow: Tier 1 (Manager review) → Tier 2 (Finance approval) → Payment</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> New Report</Button>
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered, 'expense-reports')} disabled={!filtered.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      {/* Approval pipeline legend */}
      <div className="flex items-center gap-1 flex-wrap text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-2.5 border">
        {FLOW_STEPS.map((step, i) => (
          <span key={step} className="flex items-center gap-1">
            <span className={cn('px-2 py-0.5 rounded font-medium', STATUS_COLORS[step])}>{step.replace('_', ' ')}</span>
            {i < FLOW_STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
          </span>
        ))}
        <span className="ml-2 text-[11px]">· Tier 1: Manager submits for review · Tier 2: Finance approves · Finance pays</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Claimed', value: `$${fmt(totals.total)}`, icon: DollarSign, color: 'text-amber-600' },
          { label: 'Total Advances', value: `$${fmt(totals.advances)}`, icon: CheckCircle2, color: 'text-blue-600' },
          { label: 'Pending Approval', value: totals.pending, icon: Clock, color: totals.pending > 0 ? 'text-rose-600' : 'text-muted-foreground' },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4 flex items-center gap-3">
            <k.icon className={cn('w-7 h-7', k.color)} />
            <div><div className="text-xs text-muted-foreground">{k.label}</div><div className="text-lg font-bold">{k.value}</div></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Reports ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search report, title…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? <PageLoader compact />
          : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No expense reports found.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Report #</th>
                  <th className="px-3 py-2 text-left">Title / Employee</th>
                  <th className="px-3 py-2 text-left">Period</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Actions</th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className={cn('border-b hover:bg-muted/30 group', r.status === 'rejected' ? 'bg-rose-50/40' : '')} data-testid={`row-expense-${r.id}`}>
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{r.report_number}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground">{(r.profiles as any)?.full_name ?? 'Unassigned'}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.period_start ? `${r.period_start} → ${r.period_end ?? '?'}` : '—'}</td>
                      <td className="px-3 py-2 text-right font-medium">{r.currency} {fmt(r.total_amount)}</td>
                      <td className={cn('px-3 py-2 text-right font-medium', r.balance_due > 0 ? 'text-emerald-700' : r.balance_due < 0 ? 'text-rose-700' : 'text-muted-foreground')}>{fmt(r.balance_due)}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[r.status] ?? '')}>{r.status.replace('_', ' ')}</Badge>
                        {r.status === 'rejected' && r.rejection_reason && (
                          <div className="text-[10px] text-rose-600 mt-0.5 max-w-[120px] truncate" title={r.rejection_reason}>{r.rejection_reason}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => { setSelected(r); setViewOpen(true); }} className="p-1 rounded hover:bg-blue-50 text-blue-500" title="View timeline"><Eye className="w-3.5 h-3.5" /></button>
                          {r.status === 'draft' && (
                            <>
                              <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => void submit(r.id)} className="p-1 rounded hover:bg-blue-50 text-blue-600" title="Submit for review"><Send className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                          {r.status === 'submitted' && canTier1 && (
                            <>
                              <button onClick={() => void reviewTier1(r.id)} className="p-1 rounded hover:bg-amber-50 text-amber-600" title="Mark Under Review (Tier 1)"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => openReject(r)} className="p-1 rounded hover:bg-rose-50 text-rose-600" title="Reject"><XCircle className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                          {r.status === 'under_review' && canTier2 && (
                            <>
                              <button onClick={() => void approveTier2(r.id)} className="p-1 rounded hover:bg-emerald-50 text-emerald-600" title="Approve (Tier 2 Finance)"><ThumbsUp className="w-3.5 h-3.5" /></button>
                              <button onClick={() => openReject(r)} className="p-1 rounded hover:bg-rose-50 text-rose-600" title="Reject"><ThumbsDown className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                          {r.status === 'approved' && canPay && (
                            <button onClick={() => void markPaid(r.id)} className="p-1 rounded hover:bg-teal-50 text-teal-600" title="Mark as Paid"><DollarSign className="w-3.5 h-3.5" /></button>
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

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Expense Report' : 'New Expense Report'}</DialogTitle>
            <DialogDescription>Fill in the report details. Add expense lines after saving.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Report Number</Label><Input value={form.report_number} onChange={e => sf('report_number', e.target.value)} /></div>
              <div className="space-y-1"><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => sf('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['USD','SDG','EUR','GBP','SAR'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Title *</Label><Input value={form.title} onChange={e => sf('title', e.target.value)} placeholder="e.g. Field Visit — Blue Nile, June 2026" /></div>
            <div className="space-y-1"><Label>Employee</Label>
              <Select value={form.employee_id || '__none__'} onValueChange={v => sf('employee_id', v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Not assigned —</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Period Start</Label><Input type="date" value={form.period_start} onChange={e => sf('period_start', e.target.value)} /></div>
              <div className="space-y-1"><Label>Period End</Label><Input type="date" value={form.period_end} onChange={e => sf('period_end', e.target.value)} /></div>
            </div>

            {/* ── Per Diem Auto-Calculator ─────────────────────────────────── */}
            {perDiemRates.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <Calculator className="w-3.5 h-3.5" /> Per Diem Auto-Calculator
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Destination</Label>
                    <Select value={pdCountry} onValueChange={v => { setPdCountry(v); calcPerDiem(v); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select country / city…" /></SelectTrigger>
                      <SelectContent>
                        {perDiemRates.map(r => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.country_name}{r.city ? ` — ${r.city}` : ''} (${fmt(r.rate_usd)}/day)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {pdCalc && (
                    <Button size="sm" className="h-8 text-xs shrink-0 bg-amber-600 hover:bg-amber-700" onClick={applyPerDiem}>
                      Apply ${fmt(pdCalc.total)} ({pdCalc.days}d × ${fmt(pdCalc.rate)})
                    </Button>
                  )}
                </div>
                {!form.period_start && <div className="text-[11px] text-amber-600">Set period dates above first to auto-calculate days.</div>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Total Amount</Label><Input type="number" value={form.total_amount} onChange={e => sf('total_amount', e.target.value)} placeholder="0.00" /></div>
              <div className="space-y-1"><Label>Advance Given</Label><Input type="number" value={form.advance_amount} onChange={e => sf('advance_amount', e.target.value)} placeholder="0.00" /></div>
            </div>
            <div className="space-y-1"><Label>Purpose</Label><Input value={form.purpose} onChange={e => sf('purpose', e.target.value)} placeholder="Purpose of the trip / expense" /></div>
            <div className="space-y-1"><Label>Notes</Label><Textarea value={form.notes} onChange={e => sf('notes', e.target.value)} rows={2} placeholder="Optional notes…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{editTarget ? 'Save Changes' : 'Create Report'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Timeline view dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Report Timeline — {selected?.report_number}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Employee:</span> <strong>{(selected.profiles as any)?.full_name ?? '—'}</strong></div>
                <div><span className="text-muted-foreground">Currency:</span> <strong>{selected.currency}</strong></div>
                <div><span className="text-muted-foreground">Total:</span> <strong>{fmt(selected.total_amount)}</strong></div>
                <div><span className="text-muted-foreground">Advance:</span> <strong>{fmt(selected.advance_amount)}</strong></div>
                <div><span className="text-muted-foreground">Balance:</span> <strong className={selected.balance_due >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{fmt(selected.balance_due)}</strong></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[selected.status])}>{selected.status.replace('_', ' ')}</Badge></div>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Approval Timeline</div>
                {[
                  { label: 'Submitted', date: selected.submitted_at, color: 'text-blue-600' },
                  { label: 'Tier 1 Review', date: selected.tier1_approved_at, color: 'text-amber-600' },
                  { label: 'Tier 2 Approved', date: selected.tier2_approved_at, color: 'text-emerald-600' },
                  { label: 'Approved At', date: selected.approved_at, color: 'text-emerald-700' },
                ].map(step => (
                  <div key={step.label} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{step.label}</span>
                    <span className={step.date ? step.color : 'text-muted-foreground/40'}>{step.date ? new Date(step.date).toLocaleDateString() : '—'}</span>
                  </div>
                ))}
                {selected.status === 'rejected' && (
                  <div className="p-2 bg-rose-50 rounded text-rose-700 text-xs mt-2">
                    <strong>Rejection reason:</strong> {selected.rejection_reason ?? 'No reason given'}
                  </div>
                )}
              </div>
              {selected.notes && <div className="border-t pt-2 text-xs text-muted-foreground">{selected.notes}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject Report</DialogTitle><DialogDescription>Provide a reason for rejection. The submitter will see this.</DialogDescription></DialogHeader>
          <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="e.g. Missing receipts for item 3, please resubmit…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmReject()}>Reject Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
