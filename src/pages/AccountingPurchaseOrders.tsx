import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, ShoppingCart, Plus, Download, RefreshCw, Search, CheckCircle2, XCircle, Clock, FileText, Pencil, ChevronRight, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface Vendor { id: string; vendor_code: string | null; name_en: string; vendor_type: string }
interface Country { id: string; code: string; name_en: string; flag_emoji: string | null }
interface Fund { id: string; code: string; name_en: string }
interface Account { id: string; code: string; name_en: string }
interface Profile { id: string; full_name: string }

interface PO {
  id: string; po_number: string; title: string; description: string | null;
  vendor_id: string | null; country_id: string | null; fund_id: string | null;
  gl_account_id: string | null; amount: number; currency: string;
  required_date: string | null; status: string;
  requested_by: string | null; approved_by: string | null; approved_at: string | null;
  rejection_note: string | null; received_date: string | null; invoice_ref: string | null;
  notes: string | null; created_at: string;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:      { label: 'Draft',      color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',    icon: FileText },
  submitted:  { label: 'Submitted',  color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30',                         icon: Clock },
  approved:   { label: 'Approved',   color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30',                icon: CheckCircle2 },
  rejected:   { label: 'Rejected',   color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30',                        icon: XCircle },
  ordered:    { label: 'Ordered',    color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30',                         icon: ShoppingCart },
  received:   { label: 'Received',   color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30',                        icon: CheckCircle2 },
  completed:  { label: 'Completed',  color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30',                  icon: CheckCircle2 },
  cancelled:  { label: 'Cancelled',  color: 'bg-gray-100 text-gray-500',                                             icon: XCircle },
};

const STATUS_FLOW: Record<string, string[]> = {
  draft:     ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected'],
  approved:  ['ordered', 'cancelled'],
  ordered:   ['received'],
  received:  ['completed'],
};

const BLANK = { title: '', description: '', vendor_id: '', country_id: '', fund_id: '', gl_account_id: '', amount: 0, currency: 'USD', required_date: '', notes: '', invoice_ref: '' };

export default function AccountingPurchaseOrders() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor', 'project_manager', 'program_manager']);
  const canApprove = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);
  const { currentUser } = useAppContext();
  const { toast } = useToast();

  const [pos, setPOs] = useState<PO[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<PO | null>(null);
  const [dialog, setDialog] = useState(false);
  const [editingPO, setEditingPO] = useState<PO | null>(null);
  const [form, setForm] = useState<typeof BLANK>(BLANK);
  const [saving, setSaving] = useState(false);
  const [rejNote, setRejNote] = useState('');
  const [rejDialog, setRejDialog] = useState(false);
  const [glLogMap, setGlLogMap] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [poRes, vRes, cRes, fRes, aRes] = await Promise.all([
        supabase.from('acct_purchase_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('acct_vendors').select('id, vendor_code, name_en, vendor_type').eq('is_active', true).order('name_en'),
        supabase.from('countries').select('id, code, name_en, flag_emoji').eq('is_active', true).order('name_en'),
        supabase.from('acct_funds').select('id, code, name_en').eq('is_active', true).order('name_en'),
        supabase.from('acct_accounts').select('id, code, name_en').eq('is_active', true).eq('is_postable', true).order('code'),
      ]);
      if (poRes.error && poRes.error.code !== '42P01') throw new Error(poRes.error.message);
      setPOs((poRes.data ?? []) as PO[]);
      setVendors((vRes.data ?? []) as Vendor[]);
      setCountries((cRes.data ?? []) as Country[]);
      setFunds((fRes.data ?? []) as Fund[]);
      setAccounts((aRes.data ?? []) as Account[]);
      // load profiles for requested_by / approved_by
      const userIds = [...new Set((poRes.data ?? []).flatMap((p: any) => [p.requested_by, p.approved_by].filter(Boolean)))];
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        const m: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { m[p.id] = p.full_name; });
        setProfiles(m);
      }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const bridgedIds = pos
      .filter(p => ['approved', 'ordered', 'received', 'completed'].includes(p.status))
      .map(p => p.id);
    if (!bridgedIds.length) { setGlLogMap(new Map()); return; }
    supabase
      .from('acct_gl_bridge_log')
      .select('source_id, status')
      .eq('source_table', 'acct_purchase_orders')
      .in('source_id', bridgedIds)
      .then(({ data }) => {
        const m = new Map<string, string>();
        (data ?? []).forEach(r => { if (!m.has(r.source_id)) m.set(r.source_id, r.status); });
        setGlLogMap(m);
      });
  }, [pos]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return pos.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (q) return p.po_number.toLowerCase().includes(q) || p.title.toLowerCase().includes(q) || (vendors.find(v => v.id === p.vendor_id)?.name_en.toLowerCase().includes(q) ?? false);
      return true;
    });
  }, [pos, statusFilter, search, vendors]);

  const totals = useMemo(() => {
    const byStatus: Record<string, { count: number; amount: number }> = {};
    for (const p of pos) {
      if (!byStatus[p.status]) byStatus[p.status] = { count: 0, amount: 0 };
      byStatus[p.status].count++;
      byStatus[p.status].amount += Number(p.amount ?? 0);
    }
    return byStatus;
  }, [pos]);

  const openDialog = (po?: PO) => {
    setEditingPO(po ?? null);
    setForm(po ? { title: po.title, description: po.description ?? '', vendor_id: po.vendor_id ?? '', country_id: po.country_id ?? '', fund_id: po.fund_id ?? '', gl_account_id: po.gl_account_id ?? '', amount: Number(po.amount), currency: po.currency, required_date: po.required_date ?? '', notes: po.notes ?? '', invoice_ref: po.invoice_ref ?? '' } : { ...BLANK });
    setDialog(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload: any = { title: form.title.trim(), description: form.description.trim() || null, vendor_id: form.vendor_id || null, country_id: form.country_id || null, fund_id: form.fund_id || null, gl_account_id: form.gl_account_id || null, amount: Number(form.amount ?? 0), currency: form.currency || 'USD', required_date: form.required_date || null, notes: form.notes.trim() || null, invoice_ref: form.invoice_ref.trim() || null, requested_by: currentUser?.id };
    const { error: err } = editingPO
      ? await supabase.from('acct_purchase_orders').update(payload).eq('id', editingPO.id)
      : await supabase.from('acct_purchase_orders').insert(payload);
    if (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); setSaving(false); return; }
    toast({ title: editingPO ? 'PO updated' : 'Purchase order created' });
    setDialog(false); await load(); setSaving(false);
  };

  const updateStatus = async (po: PO, newStatus: string) => {
    const patch: any = { status: newStatus };
    if (newStatus === 'approved') { patch.approved_by = currentUser?.id; patch.approved_at = new Date().toISOString(); }
    if (newStatus === 'rejected') { patch.rejection_note = rejNote; }
    const { error } = await supabase.from('acct_purchase_orders').update(patch).eq('id', po.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `PO ${newStatus}` });
    setRejDialog(false); setRejNote('');
    if (selected?.id === po.id) setSelected({ ...po, status: newStatus, ...patch });
    await load();
  };

  const exportCsv = () => {
    const header = ['PO Number', 'Title', 'Vendor', 'Amount', 'Currency', 'Status', 'Required Date', 'Created'];
    const rows = filtered.map(p => [p.po_number, p.title, vendors.find(v => v.id === p.vendor_id)?.name_en ?? '', p.amount.toFixed(2), p.currency, p.status, p.required_date ?? '', format(parseISO(p.created_at), 'yyyy-MM-dd')]);
    downloadCsv(`purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const StatusBadge = ({ status }: { status: string }) => {
    const cfg = STATUS_CFG[status] ?? STATUS_CFG.draft;
    return <Badge className={cn('text-[10px] px-1.5 py-0 border-0', cfg.color)}><cfg.icon className="h-3 w-3 mr-0.5" />{cfg.label}</Badge>;
  };

  const GlBadge = ({ poId, poStatus }: { poId: string; poStatus: string }) => {
    if (!['approved', 'ordered', 'received', 'completed'].includes(poStatus)) return null;
    const s = glLogMap.get(poId);
    if (s === 'success') return <Badge className="text-[10px] px-1.5 py-0 border-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30">GL Posted</Badge>;
    if (s === 'error')   return <Badge className="text-[10px] px-1.5 py-0 border-0 bg-rose-100 text-rose-800 dark:bg-rose-900/30">GL Error</Badge>;
    if (s === 'skipped') return <Badge className="text-[10px] px-1.5 py-0 border-0 bg-slate-100 text-slate-600 dark:bg-slate-800">GL Skipped</Badge>;
    return <Badge className="text-[10px] px-1.5 py-0 border-0 bg-gray-50 text-gray-400 dark:bg-gray-900/20">GL Pending</Badge>;
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="purchase-orders-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-violet-700 text-white shrink-0"><ShoppingCart className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold">Purchase Orders</h1>
            <p className="text-muted-foreground text-sm">أوامر الشراء — Procurement workflow</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="button-refresh"><RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} data-testid="button-export"><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button size="sm" onClick={() => openDialog()} data-testid="button-new"><Plus className="h-4 w-4 mr-1" />New PO</Button>
        </div>
      </div>

      <PageInfoBanner title="Purchase Orders" description="Manage the full procurement lifecycle — draft → submit → approve → order → receive → complete. Approvers can approve or reject submitted POs. Requires supabase/purchase_orders_migration.sql to activate." descriptionAr="إدارة دورة المشتريات الكاملة من المسودة حتى الإتمام. يحتاج إلى تنفيذ purchase_orders_migration.sql." />

      {error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-4">{error}</div>}

      {/* Status summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(STATUS_CFG).map(([s, cfg]) => {
          const t = totals[s];
          if (!t) return null;
          return <button key={s} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)} className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all', cfg.color, statusFilter === s ? 'ring-2 ring-offset-1 ring-current' : 'opacity-80 hover:opacity-100')}><cfg.icon className="h-3 w-3" />{cfg.label} <span className="font-bold">{t.count}</span> · {formatNumber(t.amount)}</button>;
        })}
        {statusFilter !== 'all' && <button onClick={() => setStatusFilter('all')} className="text-xs text-muted-foreground hover:text-foreground underline">Clear</button>}
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-3 pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-9 text-sm" placeholder="Search PO number, title, vendor..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* PO list */}
        <div className="lg:col-span-2 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-14 text-sm">
              {pos.length === 0 ? 'No purchase orders yet. Run purchase_orders_migration.sql then create your first PO.' : 'No POs match the current filters.'}
            </div>
          ) : filtered.map(po => {
            const vendor = vendors.find(v => v.id === po.vendor_id);
            const isSelected = selected?.id === po.id;
            return (
              <div key={po.id} onClick={() => setSelected(isSelected ? null : po)} className={cn('border rounded-lg p-3 cursor-pointer transition-all hover:shadow-sm', isSelected ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/20' : 'hover:border-muted-foreground/30')} data-testid={`po-card-${po.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{po.po_number}</span>
                      <StatusBadge status={po.status} />
                      <GlBadge poId={po.id} poStatus={po.status} />
                    </div>
                    <div className="font-medium text-sm mt-0.5">{po.title}</div>
                    {vendor && <div className="text-xs text-muted-foreground">{vendor.name_en}</div>}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      <span className="font-semibold text-foreground">{formatNumber(po.amount)} {po.currency}</span>
                      {po.required_date && <span>Due {format(parseISO(po.required_date), 'dd MMM yyyy')}</span>}
                      {po.requested_by && <span>By {profiles[po.requested_by] ?? '—'}</span>}
                    </div>
                  </div>
                  <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform shrink-0', isSelected && 'rotate-90')} />
                </div>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground text-center pt-1">{filtered.length} PO{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Detail panel */}
        <div>
          {selected ? (
            <Card className="sticky top-4">
              <CardHeader className="pb-2 pt-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm">{selected.po_number}</CardTitle>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={selected.status} />
                      <GlBadge poId={selected.id} poStatus={selected.status} />
                    </div>
                  </div>
                  {canApprove && (selected.status === 'draft' || selected.status === 'submitted') && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openDialog(selected); }} data-testid="button-edit-selected"><Pencil className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="text-base font-semibold">{selected.title}</div>
                {selected.description && <div className="text-muted-foreground">{selected.description}</div>}
                {[
                  { l: 'Vendor', v: vendors.find(v => v.id === selected.vendor_id)?.name_en ?? '—' },
                  { l: 'Amount', v: `${formatNumber(selected.amount)} ${selected.currency}` },
                  { l: 'Required By', v: selected.required_date ? format(parseISO(selected.required_date), 'dd MMM yyyy') : '—' },
                  { l: 'Requested By', v: selected.requested_by ? (profiles[selected.requested_by] ?? '—') : '—' },
                  { l: 'Approved By', v: selected.approved_by ? (profiles[selected.approved_by] ?? '—') : '—' },
                  { l: 'Invoice Ref', v: selected.invoice_ref ?? '—' },
                ].map(r => (
                  <div key={r.l} className="flex justify-between border-b pb-1">
                    <span className="text-muted-foreground">{r.l}</span>
                    <span className="font-medium">{r.v}</span>
                  </div>
                ))}
                {selected.rejection_note && (
                  <div className="rounded bg-rose-50 dark:bg-rose-900/20 border border-rose-200 p-2 text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{selected.rejection_note}
                  </div>
                )}
                {selected.notes && <div className="text-muted-foreground italic">{selected.notes}</div>}

                {/* Status action buttons */}
                {canApprove && STATUS_FLOW[selected.status] && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {STATUS_FLOW[selected.status].map(next => (
                      next === 'rejected' ? (
                        <Button key={next} size="sm" variant="destructive" className="text-xs h-7" onClick={() => setRejDialog(true)}>Reject</Button>
                      ) : (
                        <Button key={next} size="sm" variant={next === 'approved' ? 'default' : 'outline'} className="text-xs h-7 capitalize" onClick={() => updateStatus(selected, next)}>{next}</Button>
                      )
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Select a purchase order to see its details and take action
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPO ? `Edit ${editingPO.po_number}` : 'New Purchase Order'}</DialogTitle>
            <DialogDescription>Create a procurement request against a vendor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs mb-1">Title *</Label><Input className="h-9" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} data-testid="input-title" /></div>
            <div><Label className="text-xs mb-1">Description</Label><Textarea rows={2} className="resize-none" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs mb-1">Vendor</Label>
                <Select value={form.vendor_id} onValueChange={v => setForm(p => ({ ...p, vendor_id: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>{vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs mb-1">Required Date</Label><Input type="date" className="h-9" value={form.required_date} onChange={e => setForm(p => ({ ...p, required_date: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs mb-1">Amount *</Label><Input type="number" className="h-9" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
              <div><Label className="text-xs mb-1">Currency</Label><Input className="h-9" value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value.toUpperCase().slice(0, 3) }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs mb-1">Fund</Label>
                <Select value={form.fund_id} onValueChange={v => setForm(p => ({ ...p, fund_id: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select fund" /></SelectTrigger>
                  <SelectContent>{funds.map(f => <SelectItem key={f.id} value={f.id}>{f.code} {f.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs mb-1">GL Account</Label>
                <Select value={form.gl_account_id} onValueChange={v => setForm(p => ({ ...p, gl_account_id: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} {a.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-xs mb-1">Invoice Reference</Label><Input className="h-9" value={form.invoice_ref} onChange={e => setForm(p => ({ ...p, invoice_ref: e.target.value }))} /></div>
            <div><Label className="text-xs mb-1">Notes</Label><Textarea rows={2} className="resize-none" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.title} data-testid="button-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editingPO ? 'Update' : 'Create PO'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection dialog */}
      <Dialog open={rejDialog} onOpenChange={setRejDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject Purchase Order</DialogTitle><DialogDescription>Provide a reason for rejection.</DialogDescription></DialogHeader>
          <Textarea rows={3} value={rejNote} onChange={e => setRejNote(e.target.value)} placeholder="Rejection reason..." className="resize-none" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => selected && updateStatus(selected, 'rejected')} disabled={!rejNote.trim()}>Confirm Rejection</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
