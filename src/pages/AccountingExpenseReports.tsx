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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Search, Download, RefreshCw, Receipt, DollarSign, Clock, CheckCircle2, Pencil, Send, ThumbsUp, ThumbsDown } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface ExpenseReport {
  id: string; report_number: string; title: string; employee_id: string | null;
  currency: string; total_amount: number; advance_amount: number; balance_due: number;
  period_start: string | null; period_end: string | null; purpose: string | null;
  status: string; submitted_at: string | null; approved_at: string | null;
  notes: string | null; created_at: string;
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

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

export default function AccountingExpenseReports() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor', 'coordinator', 'fom']);
  const canApprove = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [rows, setRows] = useState<ExpenseReport[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpenseReport | null>(null);
  const [saving, setSaving] = useState(false);

  const BLANK = { report_number: `EXP-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`, title: '', employee_id: '', currency: 'USD', total_amount: '', advance_amount: '0', period_start: '', period_end: '', purpose: '', notes: '', status: 'draft' };
  const [form, setForm] = useState<Record<string, string>>(BLANK);
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const [repRes, empRes] = await Promise.all([
      supabase.from('acct_expense_reports' as any).select('*, profiles(full_name)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ]);
    setRows((repRes.data ?? []) as ExpenseReport[]);
    setEmployees((empRes.data ?? []) as { id: string; full_name: string }[]);
    setLoading(false);
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
    const payload = {
      report_number: form.report_number, title: form.title.trim(),
      employee_id: form.employee_id || null, currency: form.currency,
      total_amount: total, advance_amount: advance, balance_due: total - advance,
      period_start: form.period_start || null, period_end: form.period_end || null,
      purpose: form.purpose || null, notes: form.notes || null, status: form.status,
    };
    const { error } = editTarget
      ? await supabase.from('acct_expense_reports' as any).update(payload).eq('id', editTarget.id)
      : await supabase.from('acct_expense_reports' as any).insert(payload);
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else { toast({ title: editTarget ? 'Updated' : 'Report created' }); setFormOpen(false); void load(); }
    setSaving(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('acct_expense_reports' as any).update({ status }).eq('id', id);
    if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    else { toast({ title: `Status → ${status}` }); void load(); }
  };

  if (!authReady || !isAuthenticated) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="w-6 h-6 text-amber-600" /> Expense Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Employee expense claims with approval workflow and GL posting</p>
        </div>
        <div className="flex gap-2">
          {allowed && <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> New Report</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered, 'expense-reports')} disabled={!filtered.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Claimed', value: `$${fmt(totals.total)}`, icon: DollarSign, color: 'text-amber-600' },
          { label: 'Total Advances', value: `$${fmt(totals.advances)}`, icon: CheckCircle2, color: 'text-blue-600' },
          { label: 'Pending Approval', value: totals.pending, icon: Clock, color: 'text-rose-600' },
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

          {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No expense reports found.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Report #</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-left">Period</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Advance</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/30 group" data-testid={`row-expense-${r.id}`}>
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{r.report_number}</td>
                      <td className="px-3 py-2 font-medium">{r.title}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{(r.profiles as any)?.full_name ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.period_start ? `${r.period_start} → ${r.period_end}` : '—'}</td>
                      <td className="px-3 py-2 text-right font-medium">{r.currency} {fmt(r.total_amount)}</td>
                      <td className="px-3 py-2 text-right text-blue-700">{fmt(r.advance_amount)}</td>
                      <td className={cn('px-3 py-2 text-right font-medium', r.balance_due > 0 ? 'text-emerald-700' : r.balance_due < 0 ? 'text-rose-700' : 'text-muted-foreground')}>{fmt(r.balance_due)}</td>
                      <td className="px-3 py-2 text-center"><Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[r.status] ?? '')}>{r.status.replace('_', ' ')}</Badge></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canApprove && r.status === 'submitted' && <>
                            <button onClick={() => void updateStatus(r.id, 'approved')} className="p-1 rounded hover:bg-emerald-50 text-emerald-600" title="Approve"><ThumbsUp className="w-3.5 h-3.5" /></button>
                            <button onClick={() => void updateStatus(r.id, 'rejected')} className="p-1 rounded hover:bg-rose-50 text-rose-600" title="Reject"><ThumbsDown className="w-3.5 h-3.5" /></button>
                          </>}
                          {r.status === 'draft' && <button onClick={() => void updateStatus(r.id, 'submitted')} className="p-1 rounded hover:bg-blue-50 text-blue-600" title="Submit"><Send className="w-3.5 h-3.5" /></button>}
                          <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-blue-50 text-blue-600" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
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
    </div>
  );
}
