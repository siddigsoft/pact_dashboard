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
import { Loader2, Plus, Search, Download, RefreshCw, FileText, DollarSign, Clock, CheckCircle2, Pencil, Eye, Printer } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Invoice {
  id: string; invoice_number: string; invoice_date: string; due_date: string | null;
  customer_name: string; customer_ref: string | null; currency: string;
  subtotal: number; tax_amount: number; total_amount: number; amount_paid: number;
  status: string; notes: string | null; project_id: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  sent: 'bg-blue-50 text-blue-700 border-blue-300',
  partial: 'bg-amber-50 text-amber-700 border-amber-300',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  overdue: 'bg-rose-50 text-rose-700 border-rose-300',
  cancelled: 'bg-zinc-100 text-zinc-500 border-zinc-300',
  void: 'bg-zinc-100 text-zinc-400 border-zinc-200',
};

const fmtN = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n ?? 0);
const fmt = (n: number | null | undefined, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n ?? 0);

function generateInvoicePDF(inv: Invoice) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const w = 210; const margin = 18;

  // Header bar
  doc.setFillColor(37, 99, 235); doc.rect(0, 0, w, 28, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('PACT COMMAND CENTER', margin, 12);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('Customer Invoice', margin, 20);

  // Invoice metadata right side
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(inv.invoice_number, w - margin, 12, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${inv.invoice_date}`, w - margin, 19, { align: 'right' });
  if (inv.due_date) doc.text(`Due: ${inv.due_date}`, w - margin, 24, { align: 'right' });

  // Customer block
  doc.setTextColor(30, 41, 59); let y = 38;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('BILL TO', margin, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(inv.customer_name, margin, y); y += 5;
  if (inv.customer_ref) { doc.setFontSize(9); doc.setTextColor(100, 116, 139); doc.text(`Ref: ${inv.customer_ref}`, margin, y); y += 5; }

  // Status badge
  doc.setTextColor(30, 41, 59);
  const statusBg: Record<string, number[]> = { draft: [229,231,235], sent: [219,234,254], partial: [254,243,199], paid: [209,250,229], overdue: [254,226,226] };
  const bg = statusBg[inv.status] ?? [229,231,235];
  doc.setFillColor(bg[0], bg[1], bg[2]);
  doc.roundedRect(w - margin - 28, 34, 28, 7, 1, 1, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text(inv.status.toUpperCase(), w - margin - 14, 39.5, { align: 'center' });

  // Line items table
  y = 60;
  autoTable(doc, {
    startY: y,
    head: [['Description', 'Amount']],
    body: [
      ['Subtotal', `${inv.currency} ${fmtN(inv.subtotal)}`],
      ['Tax', `${inv.currency} ${fmtN(inv.tax_amount)}`],
    ],
    foot: [['TOTAL', `${inv.currency} ${fmtN(inv.total_amount)}`]],
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 11 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: margin, right: margin },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // Payment summary
  doc.setFillColor(241, 245, 249); doc.rect(margin, finalY, w - margin * 2, 22, 'F');
  doc.setTextColor(30, 41, 59); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('Amount Paid:', margin + 4, finalY + 8);
  doc.text(`${inv.currency} ${fmtN(inv.amount_paid)}`, w - margin - 4, finalY + 8, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Balance Due:', margin + 4, finalY + 17);
  const balance = inv.total_amount - inv.amount_paid;
  doc.setTextColor(balance > 0 ? 220 : 16, balance > 0 ? 38 : 185, balance > 0 ? 38 : 129);
  doc.text(`${inv.currency} ${fmtN(balance)}`, w - margin - 4, finalY + 17, { align: 'right' });

  // Notes
  if (inv.notes) {
    const ny = finalY + 30;
    doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.setFont('helvetica', 'italic');
    doc.text(`Notes: ${inv.notes}`, margin, ny);
  }

  // Footer
  doc.setFillColor(241, 245, 249); doc.rect(0, 280, w, 17, 'F');
  doc.setTextColor(100, 116, 139); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('Generated by PACT Command Center · Confidential', w / 2, 289, { align: 'center' });

  doc.save(`Invoice-${inv.invoice_number}.pdf`);
}

export default function AccountingCustomerInvoices() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [editTarget, setEditTarget] = useState<Invoice | null>(null);
  const [saving, setSaving] = useState(false);

  const BLANK = { invoice_number: '', invoice_date: new Date().toISOString().slice(0, 10), due_date: '', customer_name: '', customer_ref: '', currency: 'USD', subtotal: '', tax_amount: '', total_amount: '', notes: '', status: 'draft' };
  const [form, setForm] = useState<Record<string, string>>(BLANK);
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('acct_customer_invoices' as any).select('*').order('invoice_date', { ascending: false }).limit(500);
    setRows((data ?? []) as Invoice[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (q) return r.invoice_number.toLowerCase().includes(q) || r.customer_name.toLowerCase().includes(q) || (r.customer_ref ?? '').toLowerCase().includes(q);
      return true;
    });
  }, [rows, search, statusFilter]);

  const totals = useMemo(() => ({
    total: filtered.reduce((s, r) => s + r.total_amount, 0),
    paid: filtered.reduce((s, r) => s + r.amount_paid, 0),
    outstanding: filtered.reduce((s, r) => s + (r.total_amount - r.amount_paid), 0),
    overdue: filtered.filter(r => r.status === 'overdue').length,
  }), [filtered]);

  const openAdd = () => { setEditTarget(null); setForm(BLANK); setFormOpen(true); };
  const openEdit = (r: Invoice) => {
    setEditTarget(r);
    setForm({ invoice_number: r.invoice_number, invoice_date: r.invoice_date, due_date: r.due_date ?? '', customer_name: r.customer_name, customer_ref: r.customer_ref ?? '', currency: r.currency, subtotal: String(r.subtotal), tax_amount: String(r.tax_amount), total_amount: String(r.total_amount), notes: r.notes ?? '', status: r.status });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.invoice_number.trim() || !form.customer_name.trim()) { toast({ title: 'Invoice number and customer are required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { invoice_number: form.invoice_number.trim(), invoice_date: form.invoice_date, due_date: form.due_date || null, customer_name: form.customer_name.trim(), customer_ref: form.customer_ref || null, currency: form.currency, subtotal: parseFloat(form.subtotal) || 0, tax_amount: parseFloat(form.tax_amount) || 0, total_amount: parseFloat(form.total_amount) || parseFloat(form.subtotal) || 0, notes: form.notes || null, status: form.status };
    const { error } = editTarget
      ? await supabase.from('acct_customer_invoices' as any).update(payload).eq('id', editTarget.id)
      : await supabase.from('acct_customer_invoices' as any).insert({ ...payload, amount_paid: 0 });
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else { toast({ title: editTarget ? 'Invoice updated' : 'Invoice created' }); setFormOpen(false); void load(); }
    setSaving(false);
  };

  if (!authReady || !isAuthenticated) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6 text-blue-600" /> Customer Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">AR invoices for donors, partners, and governments — with branded PDF export</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> New Invoice</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered, 'customer-invoices')} disabled={!filtered.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Invoiced', value: fmt(totals.total), icon: DollarSign, color: 'text-blue-600' },
          { label: 'Total Collected', value: fmt(totals.paid), icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Outstanding', value: fmt(totals.outstanding), icon: Clock, color: 'text-amber-600' },
          { label: 'Overdue', value: totals.overdue, icon: FileText, color: 'text-rose-600' },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4 flex items-center gap-3">
            <k.icon className={cn('w-8 h-8', k.color)} />
            <div><div className="text-xs text-muted-foreground">{k.label}</div><div className="text-lg font-bold">{k.value}</div></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Invoices ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search invoice #, customer…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No invoices found.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Invoice #</th>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Due</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/30 group" data-testid={`row-invoice-${r.id}`}>
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{r.invoice_number}</td>
                      <td className="px-3 py-2">{r.customer_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.invoice_date}</td>
                      <td className={cn('px-3 py-2', r.due_date && new Date(r.due_date) < new Date() && r.status !== 'paid' ? 'text-rose-600 font-medium' : 'text-muted-foreground')}>{r.due_date ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(r.total_amount, r.currency)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{fmt(r.amount_paid, r.currency)}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{fmt(r.total_amount - r.amount_paid, r.currency)}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[r.status] ?? '')}>{r.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setSelected(r); setViewOpen(true); }} className="p-1 rounded hover:bg-blue-50 text-blue-600" title="View"><Eye className="w-3.5 h-3.5" /></button>
                          <button onClick={() => generateInvoicePDF(r)} className="p-1 rounded hover:bg-purple-50 text-purple-600" title="Download PDF"><Printer className="w-3.5 h-3.5" /></button>
                          {canManage && <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-blue-50 text-blue-600" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>}
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

      {/* Add/Edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Invoice' : 'New Customer Invoice'}</DialogTitle>
            <DialogDescription>Fill in the invoice details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Invoice Number *</Label><Input value={form.invoice_number} onChange={e => sf('invoice_number', e.target.value)} placeholder="INV-2026-001" /></div>
              <div className="space-y-1"><Label>Status</Label>
                <Select value={form.status} onValueChange={v => sf('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Customer Name *</Label><Input value={form.customer_name} onChange={e => sf('customer_name', e.target.value)} placeholder="UNHCR / WFP / MoH…" /></div>
            <div className="space-y-1"><Label>Customer Reference</Label><Input value={form.customer_ref} onChange={e => sf('customer_ref', e.target.value)} placeholder="Their PO or ref number" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Invoice Date</Label><Input type="date" value={form.invoice_date} onChange={e => sf('invoice_date', e.target.value)} /></div>
              <div className="space-y-1"><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={e => sf('due_date', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => sf('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['USD','SDG','EUR','GBP','SAR'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Subtotal</Label><Input type="number" value={form.subtotal} onChange={e => { sf('subtotal', e.target.value); sf('total_amount', String((parseFloat(e.target.value) || 0) + (parseFloat(form.tax_amount) || 0))); }} placeholder="0.00" /></div>
              <div className="space-y-1"><Label>Tax</Label><Input type="number" value={form.tax_amount} onChange={e => { sf('tax_amount', e.target.value); sf('total_amount', String((parseFloat(form.subtotal) || 0) + (parseFloat(e.target.value) || 0))); }} placeholder="0.00" /></div>
            </div>
            <div className="space-y-1"><Label>Total Amount</Label><Input type="number" value={form.total_amount} onChange={e => sf('total_amount', e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-1"><Label>Notes</Label><Input value={form.notes} onChange={e => sf('notes', e.target.value)} placeholder="Optional notes…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{editTarget ? 'Save Changes' : 'Create Invoice'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View + PDF Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Invoice {selected?.invoice_number}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{selected.customer_name}</span></div>
              {selected.customer_ref && <div className="flex justify-between"><span className="text-muted-foreground">Ref</span><span className="font-mono text-xs">{selected.customer_ref}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{selected.invoice_date}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span className={selected.due_date && new Date(selected.due_date) < new Date() && selected.status !== 'paid' ? 'text-rose-600 font-medium' : ''}>{selected.due_date ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(selected.subtotal, selected.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmt(selected.tax_amount, selected.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold">{fmt(selected.total_amount, selected.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="text-emerald-700">{fmt(selected.amount_paid, selected.currency)}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground font-semibold">Balance Due</span><span className="font-bold text-amber-700">{fmt(selected.total_amount - selected.amount_paid, selected.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[selected.status])}>{selected.status}</Badge></div>
              {selected.notes && <div className="pt-1 text-muted-foreground text-xs">{selected.notes}</div>}
              <div className="pt-3 flex justify-end">
                <Button size="sm" onClick={() => generateInvoicePDF(selected)} className="gap-1.5">
                  <Printer className="w-4 h-4" /> Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
