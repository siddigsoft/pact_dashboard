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
import {
  Loader2, Package, Plus, Download, RefreshCw, Search,
  CheckCircle2, XCircle, Clock, FileText, Pencil, ChevronRight,
  AlertTriangle, ShoppingCart, ArrowRight, Truck,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface PO { id: string; po_number: string; title: string; vendor_id: string | null; amount: number; currency: string }
interface Vendor { id: string; name_en: string }

interface GRN {
  id: string; grn_number: string; po_id: string | null; title: string; description: string | null;
  country_id: string | null; received_date: string; received_by: string | null;
  supplier_delivery_ref: string | null; condition: string; status: string;
  inspection_notes: string | null; rejection_reason: string | null;
  quantity_ordered: number | null; quantity_received: number; quantity_accepted: number | null;
  unit: string | null; unit_cost: number | null; currency: string;
  created_at: string;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:        { label: 'Draft',        color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',   icon: FileText },
  received:     { label: 'Received',     color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30',                       icon: Truck },
  inspecting:   { label: 'Inspecting',   color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30',                    icon: Clock },
  accepted:     { label: 'Accepted',     color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30',              icon: CheckCircle2 },
  partial:      { label: 'Partial Accept', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30',                     icon: AlertTriangle },
  rejected:     { label: 'Rejected',     color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30',                       icon: XCircle },
};

const CONDITION_CFG: Record<string, { label: string; color: string }> = {
  good:     { label: 'Good',     color: 'bg-emerald-100 text-emerald-700' },
  damaged:  { label: 'Damaged',  color: 'bg-rose-100 text-rose-700' },
  partial:  { label: 'Partial',  color: 'bg-amber-100 text-amber-700' },
  expired:  { label: 'Expired',  color: 'bg-gray-100 text-gray-600' },
};

const STATUS_FLOW: Record<string, string[]> = {
  draft:      ['received'],
  received:   ['inspecting'],
  inspecting: ['accepted', 'partial', 'rejected'],
};

const BLANK = {
  po_id: '', title: '', description: '', country_id: '', received_date: new Date().toISOString().slice(0, 10),
  supplier_delivery_ref: '', condition: 'good', quantity_ordered: '', quantity_received: '',
  quantity_accepted: '', unit: '', unit_cost: '', currency: 'USD', inspection_notes: '',
};

export default function AccountingGRN() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed    = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor', 'project_manager', 'program_manager']);
  const canInspect = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const { countries } = useAppContext();
  const { toast } = useToast();

  const [grns, setGRNs]       = useState<GRN[]>([]);
  const [pos, setPOs]         = useState<PO[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<GRN | null>(null);
  const [form, setForm]       = useState(BLANK);
  const [saving, setSaving]   = useState(false);

  const [detailGRN, setDetailGRN]     = useState<GRN | null>(null);
  const [actionNote, setActionNote]   = useState('');
  const [actioning, setActioning]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: grnData }, { data: poData }, { data: vData }] = await Promise.all([
      supabase.from('goods_receipt_notes').select('*').order('created_at', { ascending: false }),
      supabase.from('purchase_orders').select('id, po_number, title, vendor_id, amount, currency').eq('status', 'ordered').order('created_at', { ascending: false }),
      supabase.from('accounting_vendors').select('id, name_en').order('name_en'),
    ]);
    setGRNs((grnData ?? []) as GRN[]);
    setPOs((poData ?? []) as PO[]);
    setVendors((vData ?? []) as Vendor[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => grns.filter(g => {
    if (statusFilter !== 'all' && g.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!g.grn_number.toLowerCase().includes(q) && !g.title.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [grns, statusFilter, search]);

  const stats = useMemo(() => ({
    total: grns.length,
    pending: grns.filter(g => ['received', 'inspecting'].includes(g.status)).length,
    accepted: grns.filter(g => g.status === 'accepted').length,
    rejected: grns.filter(g => g.status === 'rejected').length,
    totalValue: grns.filter(g => !['rejected'].includes(g.status))
      .reduce((s, g) => s + (Number(g.unit_cost ?? 0) * Number(g.quantity_accepted ?? g.quantity_received)), 0),
  }), [grns]);

  const openCreate = () => { setEditing(null); setForm(BLANK); setOpen(true); };
  const openEdit   = (g: GRN) => {
    setEditing(g);
    setForm({
      po_id: g.po_id ?? '', title: g.title, description: g.description ?? '',
      country_id: g.country_id ?? '', received_date: g.received_date,
      supplier_delivery_ref: g.supplier_delivery_ref ?? '',
      condition: g.condition, quantity_ordered: String(g.quantity_ordered ?? ''),
      quantity_received: String(g.quantity_received), quantity_accepted: String(g.quantity_accepted ?? ''),
      unit: g.unit ?? '', unit_cost: String(g.unit_cost ?? ''), currency: g.currency,
      inspection_notes: g.inspection_notes ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = {
      po_id: form.po_id || null, title: form.title.trim(), description: form.description || null,
      country_id: form.country_id || null, received_date: form.received_date,
      supplier_delivery_ref: form.supplier_delivery_ref || null,
      condition: form.condition, quantity_ordered: form.quantity_ordered ? Number(form.quantity_ordered) : null,
      quantity_received: Number(form.quantity_received) || 0,
      quantity_accepted: form.quantity_accepted ? Number(form.quantity_accepted) : null,
      unit: form.unit || null, unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
      currency: form.currency, inspection_notes: form.inspection_notes || null,
    };
    if (editing) {
      const { error } = await supabase.from('goods_receipt_notes').update(payload).eq('id', editing.id);
      if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'GRN updated' }); setOpen(false); void load(); }
    } else {
      const { error } = await supabase.from('goods_receipt_notes').insert({
        ...payload, status: 'draft', grn_number: `GRN-${Date.now()}`,
      });
      if (error) toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'GRN created' }); setOpen(false); void load(); }
    }
    setSaving(false);
  };

  const doAction = async (grn: GRN, newStatus: string) => {
    setActioning(true);
    const extra: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'rejected') extra.rejection_reason = actionNote;
    const { error } = await supabase.from('goods_receipt_notes').update(extra).eq('id', grn.id);
    setActioning(false);
    if (error) toast({ title: 'Action failed', description: error.message, variant: 'destructive' });
    else { toast({ title: `GRN marked as ${STATUS_CFG[newStatus]?.label ?? newStatus}` }); setDetailGRN(null); setActionNote(''); void load(); }
  };

  const exportCsv = () => {
    downloadCsv('goods_receipt_notes.csv', [
      ['GRN #', 'Title', 'PO #', 'Status', 'Condition', 'Qty Received', 'Qty Accepted', 'Unit', 'Unit Cost', 'Currency', 'Received Date'],
      ...filtered.map(g => {
        const po = pos.find(p => p.id === g.po_id);
        return [g.grn_number, g.title, po?.po_number ?? '', g.status, g.condition, g.quantity_received,
          g.quantity_accepted ?? '', g.unit ?? '', g.unit_cost ?? '', g.currency,
          format(parseISO(g.received_date), 'yyyy-MM-dd')];
      }),
    ]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed)   return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1200px]">
      <PageInfoBanner
        title="Goods Receipt Notes (GRN)"
        description="Record the receipt and inspection of goods against Purchase Orders. GRNs form the basis of 3-way matching (PO + GRN + Invoice) before payment."
        workflowSteps={['Create GRN', 'Mark Received', 'Inspection', 'Accept / Partial / Reject', 'Triggers AP Invoice Match']}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-teal-600" /> Goods Receipt Notes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track delivery and inspection of purchased goods.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh-grn"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-grn"><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button size="sm" onClick={openCreate} data-testid="button-create-grn"><Plus className="w-4 h-4 mr-1" /> New GRN</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total GRNs',   value: stats.total,     color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Pending',      value: stats.pending,   color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Accepted',     value: stats.accepted,  color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Rejected',     value: stats.rejected,  color: 'text-rose-600',    bg: 'bg-rose-50 dark:bg-rose-950/30' },
          { label: 'Accepted Value', value: `$${formatNumber(stats.totalValue)}`, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-950/30', isText: true },
        ].map(s => (
          <div key={s.label} className={cn('rounded-xl border p-3', s.bg)}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn('font-bold mt-1', s.isText ? 'text-lg' : 'text-2xl', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search GRN# or title…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-grn" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9" data-testid="select-status-filter-grn"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No goods receipt notes found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {['GRN #', 'Title', 'Linked PO', 'Condition', 'Status', 'Qty Received', 'Accepted Value', 'Received Date', ''].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(grn => {
                    const scfg = STATUS_CFG[grn.status] ?? STATUS_CFG.draft;
                    const ccfg = CONDITION_CFG[grn.condition] ?? CONDITION_CFG.good;
                    const linkedPO = pos.find(p => p.id === grn.po_id);
                    const acceptedValue = Number(grn.unit_cost ?? 0) * Number(grn.quantity_accepted ?? grn.quantity_received);
                    return (
                      <tr key={grn.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setDetailGRN(grn)} data-testid={`row-grn-${grn.id}`}>
                        <td className="px-4 py-3 font-mono text-xs font-medium text-teal-600">{grn.grn_number}</td>
                        <td className="px-4 py-3 max-w-[160px]"><p className="font-medium truncate">{grn.title}</p></td>
                        <td className="px-4 py-3 text-xs">{linkedPO ? <span className="font-mono text-blue-600">{linkedPO.po_number}</span> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className={cn('text-[10px]', ccfg.color)}>{ccfg.label}</Badge></td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', scfg.color)}>
                            <scfg.icon className="w-3 h-3" />{scfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">{formatNumber(grn.quantity_received, 0)} {grn.unit ?? ''}</td>
                        <td className="px-4 py-3 text-xs font-mono">{grn.unit_cost ? `${grn.currency} ${formatNumber(acceptedValue)}` : '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{format(parseISO(grn.received_date), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {grn.status === 'draft' && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(grn)}><Pencil className="w-3.5 h-3.5" /></Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetailGRN(grn)}><ChevronRight className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit GRN' : 'New Goods Receipt Note'}</DialogTitle>
            <DialogDescription>Record receipt of goods against a PO.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Linked PO</Label>
              <Select value={form.po_id} onValueChange={v => setForm(p => ({ ...p, po_id: v }))}>
                <SelectTrigger data-testid="select-grn-po"><SelectValue placeholder="Select PO (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No PO (direct receipt)</SelectItem>
                  {pos.map(po => <SelectItem key={po.id} value={po.id}>{po.po_number} — {po.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Description / Item *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Laptops — 10 units" data-testid="input-grn-title" />
            </div>
            <div className="space-y-1.5">
              <Label>Received Date *</Label>
              <Input type="date" value={form.received_date} onChange={e => setForm(p => ({ ...p, received_date: e.target.value }))} data-testid="input-grn-received-date" />
            </div>
            <div className="space-y-1.5">
              <Label>Supplier Delivery Ref</Label>
              <Input value={form.supplier_delivery_ref} onChange={e => setForm(p => ({ ...p, supplier_delivery_ref: e.target.value }))} placeholder="Waybill / DO number" data-testid="input-grn-ref" />
            </div>
            <div className="space-y-1.5">
              <Label>Qty Ordered</Label>
              <Input type="number" min={0} value={form.quantity_ordered} onChange={e => setForm(p => ({ ...p, quantity_ordered: e.target.value }))} data-testid="input-grn-qty-ordered" />
            </div>
            <div className="space-y-1.5">
              <Label>Qty Received *</Label>
              <Input type="number" min={0} value={form.quantity_received} onChange={e => setForm(p => ({ ...p, quantity_received: e.target.value }))} data-testid="input-grn-qty-received" />
            </div>
            <div className="space-y-1.5">
              <Label>Qty Accepted</Label>
              <Input type="number" min={0} value={form.quantity_accepted} onChange={e => setForm(p => ({ ...p, quantity_accepted: e.target.value }))} data-testid="input-grn-qty-accepted" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} placeholder="e.g. pcs, kg, box" data-testid="input-grn-unit" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Cost</Label>
              <Input type="number" min={0} step="0.01" value={form.unit_cost} onChange={e => setForm(p => ({ ...p, unit_cost: e.target.value }))} data-testid="input-grn-unit-cost" />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                <SelectTrigger data-testid="select-grn-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['USD', 'SDG', 'EUR', 'GBP', 'SAR', 'AED'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={v => setForm(p => ({ ...p, condition: v }))}>
                <SelectTrigger data-testid="select-grn-condition"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONDITION_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Select value={form.country_id} onValueChange={v => setForm(p => ({ ...p, country_id: v }))}>
                <SelectTrigger data-testid="select-grn-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>
                  {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Inspection Notes</Label>
              <Textarea value={form.inspection_notes} onChange={e => setForm(p => ({ ...p, inspection_notes: e.target.value }))} rows={2} data-testid="input-grn-inspection-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="button-save-grn">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {editing ? 'Update GRN' : 'Create GRN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailGRN} onOpenChange={v => { if (!v) { setDetailGRN(null); setActionNote(''); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {detailGRN && (() => {
            const scfg = STATUS_CFG[detailGRN.status] ?? STATUS_CFG.draft;
            const transitions = canInspect ? (STATUS_FLOW[detailGRN.status] ?? []) : [];
            const po = pos.find(p => p.id === detailGRN.po_id);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Package className="w-4 h-4" /> {detailGRN.grn_number}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium', scfg.color)}>
                    <scfg.icon className="w-3.5 h-3.5" /> {scfg.label}
                  </span>
                  <p className="font-semibold">{detailGRN.title}</p>
                  {po && <p className="text-sm text-muted-foreground">Linked PO: <span className="font-mono text-blue-600">{po.po_number}</span></p>}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-xs text-muted-foreground">Qty Ordered</span><br />{detailGRN.quantity_ordered ?? '—'} {detailGRN.unit ?? ''}</div>
                    <div><span className="text-xs text-muted-foreground">Qty Received</span><br />{detailGRN.quantity_received} {detailGRN.unit ?? ''}</div>
                    <div><span className="text-xs text-muted-foreground">Qty Accepted</span><br />{detailGRN.quantity_accepted ?? '—'}</div>
                    <div><span className="text-xs text-muted-foreground">Received Date</span><br />{format(parseISO(detailGRN.received_date), 'dd MMM yyyy')}</div>
                    <div><span className="text-xs text-muted-foreground">Delivery Ref</span><br />{detailGRN.supplier_delivery_ref ?? '—'}</div>
                    <div><span className="text-xs text-muted-foreground">Unit Cost</span><br />{detailGRN.unit_cost ? `${detailGRN.currency} ${formatNumber(detailGRN.unit_cost)}` : '—'}</div>
                  </div>
                  {detailGRN.inspection_notes && (
                    <div className="rounded border bg-muted/30 p-3 text-sm">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Inspection Notes</p>
                      <p>{detailGRN.inspection_notes}</p>
                    </div>
                  )}
                  {detailGRN.rejection_reason && (
                    <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                      <p className="font-medium mb-0.5">Rejection Reason</p>
                      <p>{detailGRN.rejection_reason}</p>
                    </div>
                  )}
                  {transitions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</p>
                      {transitions.includes('rejected') && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Rejection reason</Label>
                          <Input value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder="State the reason…" data-testid="input-grn-rejection" />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {transitions.map(t => (
                          <Button key={t} size="sm" variant="outline"
                            className={cn(t === 'accepted' && 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
                                         t === 'rejected' && 'border-rose-300 text-rose-700 hover:bg-rose-50')}
                            disabled={actioning || (t === 'rejected' && !actionNote.trim())}
                            onClick={() => doAction(detailGRN, t)}
                            data-testid={`btn-grn-action-${t}`}>
                            {actioning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                            {STATUS_CFG[t]?.label ?? t}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setDetailGRN(null); setActionNote(''); }}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
