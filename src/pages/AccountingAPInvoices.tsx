import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Loader2, FileText, Plus, Download, RefreshCw, Search,
  CheckCircle2, XCircle, Clock, Pencil, ChevronRight,
  AlertTriangle, ArrowRight, DollarSign, ShoppingCart, Package,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface PO { id: string; po_number: string; title: string; amount: number; currency: string }
interface GRN { id: string; grn_number: string; title: string }
interface Vendor { id: string; name_en: string; vendor_code: string | null }
interface Fund { id: string; code: string; name_en: string }
interface Account { id: string; code: string; name_en: string }

interface APInvoice {
  id: string; invoice_number: string; vendor_invoice_ref: string | null;
  vendor_id: string | null; po_id: string | null; grn_id: string | null;
  country_id: string | null; fund_id: string | null; gl_account_id: string | null;
  invoice_date: string; due_date: string | null;
  subtotal: number; tax_amount: number; total_amount: number; currency: string;
  status: string; payment_status: string;
  matched_po: boolean; matched_grn: boolean;
  notes: string | null; rejection_reason: string | null;
  posted_at: string | null; paid_at: string | null;
  created_at: string;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: FileText },
  submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30',                     icon: Clock },
  matched:   { label: 'Matched',   color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30',                     icon: CheckCircle2 },
  approved:  { label: 'Approved',  color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30',            icon: CheckCircle2 },
  posted:    { label: 'Posted',    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30',               icon: CheckCircle2 },
  paid:      { label: 'Paid',      color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30',                     icon: DollarSign },
  rejected:  { label: 'Rejected',  color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30',                     icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500',                                         icon: XCircle },
};

const STATUS_FLOW: Record<string, string[]> = {
  draft:     ['submitted', 'cancelled'],
  submitted: ['matched', 'rejected'],
  matched:   ['approved', 'rejected'],
  approved:  ['posted'],
  posted:    ['paid'],
};

const BLANK = {
  vendor_id: '', po_id: '', grn_id: '', country_id: '', fund_id: '', gl_account_id: '',
  vendor_invoice_ref: '', invoice_date: new Date().toISOString().slice(0, 10),
  due_date: '', subtotal: '', tax_amount: '0', currency: 'USD', notes: '',
};

export default function AccountingAPInvoices() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed    = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canApprove = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const { toast } = useToast();

  const [invoices, setInvoices]   = useState<APInvoice[]>([]);
  const [pos, setPOs]             = useState<PO[]>([]);
  const [countries, setCountries] = useState<{id:string;name_en:string}[]>([]);
  const [grns, setGRNs]           = useState<GRN[]>([]);
  const [vendors, setVendors]     = useState<Vendor[]>([]);
  const [funds, setFunds]         = useState<Fund[]>([]);
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState<APInvoice | null>(null);
  const [form, setForm]           = useState(BLANK);
  const [saving, setSaving]       = useState(false);

  const [detailInv, setDetailInv] = useState<APInvoice | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actioning, setActioning] = useState(false);
  const [glLogMap, setGlLogMap] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: invData }, { data: poData }, { data: grnData }, { data: vData }, { data: fData }, { data: aData }, { data: cData }] = await Promise.all([
      supabase.from('acct_invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('acct_purchase_orders').select('id, po_number, title, amount, currency').order('created_at', { ascending: false }),
      supabase.from('acct_grn_receipts').select('id, grn_number').order('created_at', { ascending: false }),
      supabase.from('acct_vendors').select('id, name_en, vendor_code').order('name_en'),
      supabase.from('acct_funds').select('id, code, name_en').order('code'),
      supabase.from('acct_accounts').select('id, code, name_en').order('code'),
      supabase.from('countries').select('id, name_en').eq('is_active', true).order('name_en'),
    ]);
    const loaded = (invData ?? []) as APInvoice[];
    setInvoices(loaded);
    setPOs((poData ?? []) as PO[]);
    setGRNs((grnData ?? []) as GRN[]);
    setVendors((vData ?? []) as Vendor[]);
    setFunds((fData ?? []) as Fund[]);
    setAccounts((aData ?? []) as Account[]);
    setCountries((cData ?? []) as {id:string;name_en:string}[]);

    if (loaded.length > 0) {
      const bridgeIds = loaded
        .filter(i => ['approved', 'posted', 'paid'].includes(i.status))
        .map(i => i.id);
      if (bridgeIds.length > 0) {
        const { data: logData } = await supabase
          .from('acct_gl_bridge_log' as any)
          .select('source_id, status')
          .eq('source_table', 'acct_invoices')
          .in('source_id', bridgeIds)
          .order('created_at', { ascending: false });
        const map = new Map<string, string>();
        for (const row of (logData ?? []) as { source_id: string; status: string }[]) {
          if (!map.has(row.source_id)) map.set(row.source_id, row.status);
        }
        setGlLogMap(map);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const vendor = vendors.find(v => v.id === inv.vendor_id);
      if (!inv.invoice_number.toLowerCase().includes(q) &&
          !(inv.vendor_invoice_ref ?? '').toLowerCase().includes(q) &&
          !(vendor?.name_en ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [invoices, statusFilter, search, vendors]);

  const stats = useMemo(() => {
    const outstanding = invoices.filter(i => !['paid', 'cancelled', 'rejected'].includes(i.status));
    const overdue = outstanding.filter(i => i.due_date && differenceInDays(new Date(), parseISO(i.due_date)) > 0);
    return {
      total: invoices.length,
      outstanding: outstanding.length,
      overdue: overdue.length,
      totalOutstanding: outstanding.reduce((s, i) => s + Number(i.total_amount), 0),
      paid: invoices.filter(i => i.status === 'paid').length,
    };
  }, [invoices]);

  const openCreate = () => { setEditing(null); setForm(BLANK); setOpen(true); };
  const openEdit   = (inv: APInvoice) => {
    setEditing(inv);
    setForm({
      vendor_id: inv.vendor_id ?? '', po_id: inv.po_id ?? '', grn_id: inv.grn_id ?? '',
      country_id: inv.country_id ?? '', fund_id: inv.fund_id ?? '', gl_account_id: inv.gl_account_id ?? '',
      vendor_invoice_ref: inv.vendor_invoice_ref ?? '', invoice_date: inv.invoice_date,
      due_date: inv.due_date ?? '', subtotal: String(inv.subtotal), tax_amount: String(inv.tax_amount),
      currency: inv.currency, notes: inv.notes ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.subtotal || Number(form.subtotal) <= 0) {
      toast({ title: 'Subtotal must be greater than 0', variant: 'destructive' }); return;
    }
    setSaving(true);
    const subtotal = Number(form.subtotal);
    const tax = Number(form.tax_amount) || 0;
    const payload = {
      vendor_id: form.vendor_id || null, po_id: form.po_id || null, grn_id: form.grn_id || null,
      country_id: form.country_id || null, fund_id: form.fund_id || null,
      gl_account_id: form.gl_account_id || null,
      vendor_invoice_ref: form.vendor_invoice_ref || null, invoice_date: form.invoice_date,
      due_date: form.due_date || null, subtotal, tax_amount: tax,
      total_amount: subtotal + tax, currency: form.currency, notes: form.notes || null,
      matched_po: !!form.po_id, matched_grn: !!form.grn_id,
    };
    if (editing) {
      const { error } = await supabase.from('acct_invoices').update(payload).eq('id', editing.id);
      if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Invoice updated' }); setOpen(false); void load(); }
    } else {
      const { error } = await supabase.from('acct_invoices').insert({
        ...payload, status: 'draft', payment_status: 'unpaid', invoice_number: `INV-${Date.now()}`,
      });
      if (error) toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Invoice created' }); setOpen(false); void load(); }
    }
    setSaving(false);
  };

  const doAction = async (inv: APInvoice, newStatus: string) => {
    setActioning(true);
    const extra: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'rejected') extra.rejection_reason = actionNote;
    if (newStatus === 'posted') extra.posted_at = new Date().toISOString();
    if (newStatus === 'paid') { extra.paid_at = new Date().toISOString(); extra.payment_status = 'paid'; }
    const { error } = await supabase.from('acct_invoices').update(extra).eq('id', inv.id);
    setActioning(false);
    if (error) toast({ title: 'Action failed', description: error.message, variant: 'destructive' });
    else { toast({ title: `Invoice ${STATUS_CFG[newStatus]?.label ?? newStatus}` }); setDetailInv(null); setActionNote(''); void load(); }
  };

  const exportCsv = () => {
    downloadCsv('ap_invoices.csv', [
      ['Invoice #', 'Vendor Ref', 'Vendor', 'Status', 'Subtotal', 'Tax', 'Total', 'Currency', 'Invoice Date', 'Due Date', 'Matched PO', 'Matched GRN'],
      ...filtered.map(i => {
        const vendor = vendors.find(v => v.id === i.vendor_id);
        return [i.invoice_number, i.vendor_invoice_ref ?? '', vendor?.name_en ?? '', i.status,
          i.subtotal, i.tax_amount, i.total_amount, i.currency, i.invoice_date, i.due_date ?? '',
          i.matched_po ? 'Yes' : 'No', i.matched_grn ? 'Yes' : 'No'];
      }),
    ]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed)   return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1200px]">
      <PageInfoBanner
        title="AP Invoices"
        description="Manage accounts payable invoices. Invoices go through matching (PO + GRN), approval, GL posting, and payment. 3-way matching ensures invoice integrity before payment."
        workflowSteps={[
          { step: 1, role: 'Finance Admin', action: 'Create Invoice',          description: 'Enter vendor invoice details and link to PO and GRN.' },
          { step: 2, role: 'Finance Admin', action: 'Submit',                  description: 'Submit invoice for 3-way match verification.' },
          { step: 3, role: 'System',        action: '3-Way Match',             description: 'System verifies PO, GRN and invoice quantities and amounts align.' },
          { step: 4, role: 'Finance Admin', action: 'Finance Approval',        description: 'Finance team approves the matched invoice.' },
          { step: 5, role: 'System',        action: 'Post to GL',              description: 'Invoice is automatically journalised to the general ledger.' },
          { step: 6, role: 'Finance Admin', action: 'Record Payment',          description: 'Payment is recorded and a cheque or transfer is issued.' },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-violet-600" /> AP Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Accounts payable invoice management with 3-way matching.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh-inv"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-inv"><Download className="w-4 h-4 mr-1" /> Export</Button>
          {canApprove && <Button size="sm" onClick={openCreate} data-testid="button-create-inv"><Plus className="w-4 h-4 mr-1" /> New Invoice</Button>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Invoices',  value: stats.total,                         color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Outstanding',     value: stats.outstanding,                    color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Overdue',         value: stats.overdue,                        color: 'text-rose-600',    bg: 'bg-rose-50 dark:bg-rose-950/30' },
          { label: 'Paid',            value: stats.paid,                           color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Outstanding Amt', value: `$${formatNumber(stats.totalOutstanding)}`, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/30', isText: true },
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
          <Input placeholder="Search invoice# or vendor…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-inv" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9" data-testid="select-status-inv"><SelectValue placeholder="Status" /></SelectTrigger>
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
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No AP invoices found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {['Invoice #', 'Vendor', 'Status', 'Match', 'Total', 'Currency', 'Due Date', 'Overdue', 'GL', ''].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(inv => {
                    const scfg = STATUS_CFG[inv.status] ?? STATUS_CFG.draft;
                    const vendor = vendors.find(v => v.id === inv.vendor_id);
                    const isOverdue = inv.due_date && differenceInDays(new Date(), parseISO(inv.due_date)) > 0 && !['paid', 'cancelled', 'rejected'].includes(inv.status);
                    const daysOverdue = inv.due_date ? differenceInDays(new Date(), parseISO(inv.due_date)) : 0;
                    return (
                      <tr key={inv.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setDetailInv(inv)} data-testid={`row-inv-${inv.id}`}>
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs font-medium text-violet-600">{inv.invoice_number}</p>
                          {inv.vendor_invoice_ref && <p className="text-[10px] text-muted-foreground">{inv.vendor_invoice_ref}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[140px] truncate">{vendor?.name_en ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', scfg.color)}>
                            <scfg.icon className="w-3 h-3" />{scfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <span title="PO Match" className={cn('w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold border', inv.matched_po ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-muted border-border text-muted-foreground')}>
                              PO
                            </span>
                            <span title="GRN Match" className={cn('w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold border', inv.matched_grn ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-muted border-border text-muted-foreground')}>
                              GR
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-medium">{formatNumber(inv.total_amount)}</td>
                        <td className="px-4 py-3 text-xs">{inv.currency}</td>
                        <td className="px-4 py-3 text-xs">{inv.due_date ? format(parseISO(inv.due_date), 'dd MMM yyyy') : '—'}</td>
                        <td className="px-4 py-3">
                          {isOverdue ? (
                            <Badge variant="outline" className="text-[10px] border-rose-200 text-rose-700 bg-rose-50">
                              {daysOverdue}d
                            </Badge>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {['approved', 'posted', 'paid'].includes(inv.status) && (() => {
                            const gl = glLogMap.get(inv.id);
                            if (gl === 'success') return <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 whitespace-nowrap">GL Posted</Badge>;
                            if (gl === 'error')   return <Badge variant="outline" className="text-[10px] text-rose-700 border-rose-300 whitespace-nowrap">GL Error</Badge>;
                            if (gl === 'skipped') return <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-300 whitespace-nowrap">GL Skipped</Badge>;
                            return <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200 whitespace-nowrap">GL Pending</Badge>;
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {inv.status === 'draft' && canApprove && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(inv)}><Pencil className="w-3.5 h-3.5" /></Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetailInv(inv)}><ChevronRight className="w-3.5 h-3.5" /></Button>
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
            <DialogTitle>{editing ? 'Edit AP Invoice' : 'New AP Invoice'}</DialogTitle>
            <DialogDescription>Enter vendor invoice details. Link to PO and GRN for 3-way matching.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Vendor</Label>
              <Select value={form.vendor_id} onValueChange={v => setForm(p => ({ ...p, vendor_id: v }))}>
                <SelectTrigger data-testid="select-inv-vendor"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.vendor_code ? `[${v.vendor_code}] ` : ''}{v.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vendor Invoice Ref</Label>
              <Input value={form.vendor_invoice_ref} onChange={e => setForm(p => ({ ...p, vendor_invoice_ref: e.target.value }))} placeholder="e.g. INV-2026-0042" data-testid="input-inv-vendor-ref" />
            </div>
            <div className="space-y-1.5">
              <Label>Linked PO</Label>
              <Select value={form.po_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, po_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger data-testid="select-inv-po"><SelectValue placeholder="Select PO (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No PO</SelectItem>
                  {pos.map(po => <SelectItem key={po.id} value={po.id}>{po.po_number} — {po.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Linked GRN</Label>
              <Select value={form.grn_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, grn_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger data-testid="select-inv-grn"><SelectValue placeholder="Select GRN (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No GRN</SelectItem>
                  {grns.map(g => <SelectItem key={g.id} value={g.id}>{g.grn_number} — {g.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Invoice Date *</Label>
              <Input type="date" value={form.invoice_date} onChange={e => setForm(p => ({ ...p, invoice_date: e.target.value }))} data-testid="input-inv-date" />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} data-testid="input-inv-due-date" />
            </div>
            <div className="space-y-1.5">
              <Label>Subtotal *</Label>
              <Input type="number" min={0} step="0.01" value={form.subtotal} onChange={e => setForm(p => ({ ...p, subtotal: e.target.value }))} data-testid="input-inv-subtotal" />
            </div>
            <div className="space-y-1.5">
              <Label>Tax Amount</Label>
              <Input type="number" min={0} step="0.01" value={form.tax_amount} onChange={e => setForm(p => ({ ...p, tax_amount: e.target.value }))} data-testid="input-inv-tax" />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                <SelectTrigger data-testid="select-inv-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['USD', 'SDG', 'EUR', 'GBP', 'SAR', 'AED'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fund</Label>
              <Select value={form.fund_id} onValueChange={v => setForm(p => ({ ...p, fund_id: v }))}>
                <SelectTrigger data-testid="select-inv-fund"><SelectValue placeholder="Select fund" /></SelectTrigger>
                <SelectContent>
                  {funds.map(f => <SelectItem key={f.id} value={f.id}>[{f.code}] {f.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>GL Expense Account</Label>
              <Select value={form.gl_account_id} onValueChange={v => setForm(p => ({ ...p, gl_account_id: v }))}>
                <SelectTrigger data-testid="select-inv-account"><SelectValue placeholder="Select GL account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} – {a.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Select value={form.country_id} onValueChange={v => setForm(p => ({ ...p, country_id: v }))}>
                <SelectTrigger data-testid="select-inv-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>
                  {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} data-testid="input-inv-notes" />
            </div>
            {(form.subtotal || form.tax_amount) && (
              <div className="sm:col-span-2 rounded-lg bg-muted/40 p-3 text-sm flex gap-4">
                <div><span className="text-muted-foreground">Subtotal: </span><span className="font-mono font-medium">{form.currency} {formatNumber(Number(form.subtotal) || 0)}</span></div>
                <div><span className="text-muted-foreground">Tax: </span><span className="font-mono font-medium">{form.currency} {formatNumber(Number(form.tax_amount) || 0)}</span></div>
                <div><span className="text-muted-foreground font-semibold">Total: </span><span className="font-mono font-semibold">{form.currency} {formatNumber((Number(form.subtotal) || 0) + (Number(form.tax_amount) || 0))}</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="button-save-inv">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {editing ? 'Update Invoice' : 'Create Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailInv} onOpenChange={v => { if (!v) { setDetailInv(null); setActionNote(''); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {detailInv && (() => {
            const scfg = STATUS_CFG[detailInv.status] ?? STATUS_CFG.draft;
            const vendor = vendors.find(v => v.id === detailInv.vendor_id);
            const transitions = canApprove ? (STATUS_FLOW[detailInv.status] ?? []) : [];
            const isOverdue = detailInv.due_date && differenceInDays(new Date(), parseISO(detailInv.due_date)) > 0 && !['paid', 'cancelled', 'rejected'].includes(detailInv.status);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><FileText className="w-4 h-4" /> {detailInv.invoice_number}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium', scfg.color)}>
                      <scfg.icon className="w-3.5 h-3.5" /> {scfg.label}
                    </span>
                    {isOverdue && <Badge variant="outline" className="text-xs border-rose-200 text-rose-700 bg-rose-50"><AlertTriangle className="w-3 h-3 mr-1" />Overdue</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-xs text-muted-foreground">Vendor</span><br />{vendor?.name_en ?? '—'}</div>
                    <div><span className="text-xs text-muted-foreground">Vendor Ref</span><br />{detailInv.vendor_invoice_ref ?? '—'}</div>
                    <div><span className="text-xs text-muted-foreground">Subtotal</span><br className="font-mono" />{detailInv.currency} {formatNumber(detailInv.subtotal)}</div>
                    <div><span className="text-xs text-muted-foreground">Tax</span><br />{detailInv.currency} {formatNumber(detailInv.tax_amount)}</div>
                    <div><span className="text-xs text-muted-foreground">Total</span><br /><span className="font-mono font-semibold">{detailInv.currency} {formatNumber(detailInv.total_amount)}</span></div>
                    <div><span className="text-xs text-muted-foreground">Due Date</span><br />{detailInv.due_date ? format(parseISO(detailInv.due_date), 'dd MMM yyyy') : '—'}</div>
                    <div><span className="text-xs text-muted-foreground">Invoice Date</span><br />{format(parseISO(detailInv.invoice_date), 'dd MMM yyyy')}</div>
                    <div><span className="text-xs text-muted-foreground">Payment Status</span><br /><Badge variant="outline" className="text-[10px] mt-0.5">{detailInv.payment_status}</Badge></div>
                  </div>
                  <div className="flex gap-2">
                    <div className={cn('flex-1 rounded p-2 text-center text-xs border', detailInv.matched_po ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-muted/30 text-muted-foreground')}>
                      <ShoppingCart className="w-4 h-4 mx-auto mb-1" />
                      PO Match {detailInv.matched_po ? '✓' : '○'}
                    </div>
                    <div className={cn('flex-1 rounded p-2 text-center text-xs border', detailInv.matched_grn ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-muted/30 text-muted-foreground')}>
                      <Package className="w-4 h-4 mx-auto mb-1" />
                      GRN Match {detailInv.matched_grn ? '✓' : '○'}
                    </div>
                    <div className={cn('flex-1 rounded p-2 text-center text-xs border', detailInv.status !== 'draft' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-muted/30 text-muted-foreground')}>
                      <FileText className="w-4 h-4 mx-auto mb-1" />
                      Invoice {detailInv.status !== 'draft' ? '✓' : '○'}
                    </div>
                  </div>
                  {detailInv.rejection_reason && (
                    <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                      <p className="font-medium mb-0.5">Rejection Reason</p>
                      <p>{detailInv.rejection_reason}</p>
                    </div>
                  )}
                  {transitions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</p>
                      {transitions.includes('rejected') && (
                        <Input value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder="Rejection reason…" data-testid="input-inv-reject-note" />
                      )}
                      <div className="flex flex-wrap gap-2">
                        {transitions.map(t => (
                          <Button key={t} size="sm" variant="outline"
                            className={cn(t === 'approved' && 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
                                         t === 'posted'   && 'border-purple-300 text-purple-700 hover:bg-purple-50',
                                         t === 'paid'     && 'border-teal-300 text-teal-700 hover:bg-teal-50',
                                         t === 'rejected' && 'border-rose-300 text-rose-700 hover:bg-rose-50')}
                            disabled={actioning || (t === 'rejected' && !actionNote.trim())}
                            onClick={() => doAction(detailInv, t)}
                            data-testid={`btn-inv-action-${t}`}>
                            {actioning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                            {STATUS_CFG[t]?.label ?? t}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setDetailInv(null); setActionNote(''); }}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
