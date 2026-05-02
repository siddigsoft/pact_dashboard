import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Loader2, CreditCard, Plus, Download, RefreshCw, Search,
  CheckCircle2, XCircle, Clock, FileText, Pencil, ChevronRight,
  AlertTriangle, DollarSign, Landmark, Building2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface BankAccount { id: string; account_name: string; account_number: string | null; bank_name: string | null }
interface APInvoice { id: string; invoice_number: string; total_amount: number; currency: string }
interface Vendor { id: string; name_en: string; vendor_code: string | null }
interface Fund { id: string; code: string; name_en: string }

interface Cheque {
  id: string; cheque_number: string; payment_type: string;
  bank_account_id: string | null; vendor_id: string | null; ap_invoice_id: string | null;
  fund_id: string | null; country_id: string | null;
  payee_name: string; amount: number; currency: string;
  issue_date: string; clearance_date: string | null; value_date: string | null;
  status: string; memo: string | null; void_reason: string | null;
  bank_reference: string | null; created_at: string;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: FileText },
  issued:    { label: 'Issued',    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30',                     icon: CreditCard },
  presented: { label: 'Presented', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30',                  icon: Clock },
  cleared:   { label: 'Cleared',   color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30',            icon: CheckCircle2 },
  bounced:   { label: 'Bounced',   color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30',                     icon: AlertTriangle },
  voided:    { label: 'Voided',    color: 'bg-gray-100 text-gray-500',                                         icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500',                                         icon: XCircle },
};

const PAYMENT_TYPES = ['cheque', 'bank_transfer', 'cash', 'mobile_money', 'card'];
const TYPE_LABELS: Record<string, string> = {
  cheque: 'Cheque', bank_transfer: 'Bank Transfer', cash: 'Cash',
  mobile_money: 'Mobile Money', card: 'Card',
};

const STATUS_FLOW: Record<string, string[]> = {
  draft:     ['issued', 'cancelled'],
  issued:    ['presented', 'voided'],
  presented: ['cleared', 'bounced'],
  bounced:   ['voided'],
};

const BLANK = {
  payment_type: 'cheque', bank_account_id: '', vendor_id: '', ap_invoice_id: '',
  fund_id: '', country_id: '', payee_name: '', amount: '',
  currency: 'USD', issue_date: new Date().toISOString().slice(0, 10),
  value_date: '', clearance_date: '', memo: '', bank_reference: '',
};

export default function AccountingChequeRegister() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed    = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canAction  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const { countries } = useAppContext();
  const { toast } = useToast();

  const [cheques, setCheques]         = useState<Cheque[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [apInvoices, setAPInvoices]   = useState<APInvoice[]>([]);
  const [vendors, setVendors]         = useState<Vendor[]>([]);
  const [funds, setFunds]             = useState<Fund[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter]   = useState('all');

  const [open, setOpen]               = useState(false);
  const [editing, setEditing]         = useState<Cheque | null>(null);
  const [form, setForm]               = useState(BLANK);
  const [saving, setSaving]           = useState(false);

  const [detailCheque, setDetailCheque] = useState<Cheque | null>(null);
  const [voidReason, setVoidReason]   = useState('');
  const [actioning, setActioning]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: chequeData }, { data: bankData }, { data: invData }, { data: vData }, { data: fData }] = await Promise.all([
      supabase.from('acct_cheque_register').select('*').order('created_at', { ascending: false }),
      supabase.from('acct_bank_accounts').select('id, account_name, account_number, bank_name').order('account_name'),
      supabase.from('acct_invoices').select('id, invoice_number, total_amount, currency').order('created_at', { ascending: false }),
      supabase.from('acct_vendors').select('id, name_en, vendor_code').order('name_en'),
      supabase.from('acct_funds').select('id, code, name_en').order('code'),
    ]);
    setCheques((chequeData ?? []) as Cheque[]);
    setBankAccounts((bankData ?? []) as BankAccount[]);
    setAPInvoices((invData ?? []) as APInvoice[]);
    setVendors((vData ?? []) as Vendor[]);
    setFunds((fData ?? []) as Fund[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => cheques.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (typeFilter !== 'all' && c.payment_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.cheque_number.toLowerCase().includes(q) &&
          !c.payee_name.toLowerCase().includes(q) &&
          !(c.memo ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [cheques, statusFilter, typeFilter, search]);

  const stats = useMemo(() => ({
    total: cheques.length,
    issued: cheques.filter(c => ['issued', 'presented'].includes(c.status)).length,
    cleared: cheques.filter(c => c.status === 'cleared').length,
    bounced: cheques.filter(c => c.status === 'bounced').length,
    totalIssued: cheques.filter(c => !['voided', 'cancelled', 'draft'].includes(c.status)).reduce((s, c) => s + Number(c.amount), 0),
  }), [cheques]);

  const openCreate = () => { setEditing(null); setForm(BLANK); setOpen(true); };
  const openEdit   = (c: Cheque) => {
    setEditing(c);
    setForm({
      payment_type: c.payment_type, bank_account_id: c.bank_account_id ?? '',
      vendor_id: c.vendor_id ?? '', ap_invoice_id: c.ap_invoice_id ?? '',
      fund_id: c.fund_id ?? '', country_id: c.country_id ?? '',
      payee_name: c.payee_name, amount: String(c.amount), currency: c.currency,
      issue_date: c.issue_date, value_date: c.value_date ?? '', clearance_date: c.clearance_date ?? '',
      memo: c.memo ?? '', bank_reference: c.bank_reference ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.payee_name.trim()) { toast({ title: 'Payee name is required', variant: 'destructive' }); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast({ title: 'Amount must be greater than 0', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = {
      payment_type: form.payment_type, bank_account_id: form.bank_account_id || null,
      vendor_id: form.vendor_id || null, ap_invoice_id: form.ap_invoice_id || null,
      fund_id: form.fund_id || null, country_id: form.country_id || null,
      payee_name: form.payee_name.trim(), amount: Number(form.amount), currency: form.currency,
      issue_date: form.issue_date, value_date: form.value_date || null,
      clearance_date: form.clearance_date || null, memo: form.memo || null,
      bank_reference: form.bank_reference || null,
    };
    if (editing) {
      const { error } = await supabase.from('acct_cheque_register').update(payload).eq('id', editing.id);
      if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Payment updated' }); setOpen(false); void load(); }
    } else {
      const cheque_number = form.payment_type === 'cheque'
        ? `CHQ-${Date.now()}`
        : `PAY-${Date.now()}`;
      const { error } = await supabase.from('acct_cheque_register').insert({ ...payload, status: 'draft', cheque_number });
      if (error) toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Payment created' }); setOpen(false); void load(); }
    }
    setSaving(false);
  };

  const doAction = async (c: Cheque, newStatus: string) => {
    setActioning(true);
    const extra: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'voided') extra.void_reason = voidReason;
    if (newStatus === 'cleared') extra.clearance_date = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('acct_cheque_register').update(extra).eq('id', c.id);
    setActioning(false);
    if (error) toast({ title: 'Action failed', description: error.message, variant: 'destructive' });
    else { toast({ title: `Payment ${STATUS_CFG[newStatus]?.label ?? newStatus}` }); setDetailCheque(null); setVoidReason(''); void load(); }
  };

  const exportCsv = () => {
    downloadCsv('cheque_register.csv', [
      ['Cheque #', 'Type', 'Payee', 'Status', 'Amount', 'Currency', 'Issue Date', 'Clearance Date', 'Bank Ref', 'Memo'],
      ...filtered.map(c => [
        c.cheque_number, TYPE_LABELS[c.payment_type] ?? c.payment_type, c.payee_name,
        c.status, c.amount, c.currency, format(parseISO(c.issue_date), 'yyyy-MM-dd'),
        c.clearance_date ? format(parseISO(c.clearance_date), 'yyyy-MM-dd') : '',
        c.bank_reference ?? '', c.memo ?? '',
      ]),
    ]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed)   return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1200px]">
      <PageInfoBanner
        title="Cheque & Payment Register"
        description="Track all outgoing payments — cheques, bank transfers, cash, and mobile money. Link payments to AP invoices and bank accounts for full reconciliation."
        workflowSteps={['Create Payment', 'Issue / Authorize', 'Present to Bank', 'Cleared / Bounced / Voided']}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-indigo-600" /> Cheque & Payment Register
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Full payment register with clearance tracking.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh-cheque"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-cheque"><Download className="w-4 h-4 mr-1" /> Export</Button>
          {canAction && <Button size="sm" onClick={openCreate} data-testid="button-create-cheque"><Plus className="w-4 h-4 mr-1" /> New Payment</Button>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Payments', value: stats.total,           color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'In Transit',     value: stats.issued,          color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Cleared',        value: stats.cleared,         color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Bounced',        value: stats.bounced,         color: 'text-rose-600',    bg: 'bg-rose-50 dark:bg-rose-950/30' },
          { label: 'Total Issued',   value: `$${formatNumber(stats.totalIssued)}`, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/30', isText: true },
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
          <Input placeholder="Search cheque# or payee…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-cheque" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9" data-testid="select-status-cheque"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px] h-9" data-testid="select-type-cheque"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {PAYMENT_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
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
              <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No payments found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {['Number', 'Type', 'Payee', 'Status', 'Amount', 'Issue Date', 'Cleared', 'Bank Ref', ''].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(c => {
                    const scfg = STATUS_CFG[c.status] ?? STATUS_CFG.draft;
                    return (
                      <tr key={c.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setDetailCheque(c)} data-testid={`row-cheque-${c.id}`}>
                        <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{c.cheque_number}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{TYPE_LABELS[c.payment_type] ?? c.payment_type}</Badge></td>
                        <td className="px-4 py-3 text-xs max-w-[140px] truncate font-medium">{c.payee_name}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', scfg.color)}>
                            <scfg.icon className="w-3 h-3" />{scfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-medium">{c.currency} {formatNumber(c.amount)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{format(parseISO(c.issue_date), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{c.clearance_date ? format(parseISO(c.clearance_date), 'dd MMM yyyy') : '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{c.bank_reference ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {c.status === 'draft' && canAction && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetailCheque(c)}><ChevronRight className="w-3.5 h-3.5" /></Button>
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
            <DialogTitle>{editing ? 'Edit Payment' : 'New Payment / Cheque'}</DialogTitle>
            <DialogDescription>Record a payment or cheque. Link to AP invoice for automatic reconciliation.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Payment Type</Label>
              <Select value={form.payment_type} onValueChange={v => setForm(p => ({ ...p, payment_type: v }))}>
                <SelectTrigger data-testid="select-cheque-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bank Account</Label>
              <Select value={form.bank_account_id} onValueChange={v => setForm(p => ({ ...p, bank_account_id: v }))}>
                <SelectTrigger data-testid="select-cheque-bank"><SelectValue placeholder="Select bank account" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(b => <SelectItem key={b.id} value={b.id}>{b.account_name} {b.bank_name ? `(${b.bank_name})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Payee Name *</Label>
              <Input value={form.payee_name} onChange={e => setForm(p => ({ ...p, payee_name: e.target.value }))} placeholder="Full name of payee / vendor" data-testid="input-cheque-payee" />
            </div>
            <div className="space-y-1.5">
              <Label>Vendor (optional)</Label>
              <Select value={form.vendor_id} onValueChange={v => setForm(p => ({ ...p, vendor_id: v }))}>
                <SelectTrigger data-testid="select-cheque-vendor"><SelectValue placeholder="Link to vendor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No vendor</SelectItem>
                  {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.vendor_code ? `[${v.vendor_code}] ` : ''}{v.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Linked AP Invoice</Label>
              <Select value={form.ap_invoice_id} onValueChange={v => setForm(p => ({ ...p, ap_invoice_id: v }))}>
                <SelectTrigger data-testid="select-cheque-invoice"><SelectValue placeholder="Link to invoice" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No invoice</SelectItem>
                  {apInvoices.map(i => <SelectItem key={i.id} value={i.id}>{i.invoice_number} — {i.currency} {formatNumber(i.total_amount)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" min={0} step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} data-testid="input-cheque-amount" />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                <SelectTrigger data-testid="select-cheque-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['USD', 'SDG', 'EUR', 'GBP', 'SAR', 'AED'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Issue Date *</Label>
              <Input type="date" value={form.issue_date} onChange={e => setForm(p => ({ ...p, issue_date: e.target.value }))} data-testid="input-cheque-issue-date" />
            </div>
            <div className="space-y-1.5">
              <Label>Value Date</Label>
              <Input type="date" value={form.value_date} onChange={e => setForm(p => ({ ...p, value_date: e.target.value }))} data-testid="input-cheque-value-date" />
            </div>
            <div className="space-y-1.5">
              <Label>Bank Reference</Label>
              <Input value={form.bank_reference} onChange={e => setForm(p => ({ ...p, bank_reference: e.target.value }))} placeholder="Wire ref / IBAN" data-testid="input-cheque-bank-ref" />
            </div>
            <div className="space-y-1.5">
              <Label>Fund</Label>
              <Select value={form.fund_id} onValueChange={v => setForm(p => ({ ...p, fund_id: v }))}>
                <SelectTrigger data-testid="select-cheque-fund"><SelectValue placeholder="Select fund" /></SelectTrigger>
                <SelectContent>
                  {funds.map(f => <SelectItem key={f.id} value={f.id}>[{f.code}] {f.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Select value={form.country_id} onValueChange={v => setForm(p => ({ ...p, country_id: v }))}>
                <SelectTrigger data-testid="select-cheque-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>
                  {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Memo / Description</Label>
              <Textarea value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} rows={2} data-testid="input-cheque-memo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="button-save-cheque">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {editing ? 'Update Payment' : 'Create Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailCheque} onOpenChange={v => { if (!v) { setDetailCheque(null); setVoidReason(''); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {detailCheque && (() => {
            const scfg = STATUS_CFG[detailCheque.status] ?? STATUS_CFG.draft;
            const bank = bankAccounts.find(b => b.id === detailCheque.bank_account_id);
            const vendor = vendors.find(v => v.id === detailCheque.vendor_id);
            const invoice = apInvoices.find(i => i.id === detailCheque.ap_invoice_id);
            const transitions = canAction ? (STATUS_FLOW[detailCheque.status] ?? []) : [];
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> {detailCheque.cheque_number}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium', scfg.color)}>
                      <scfg.icon className="w-3.5 h-3.5" /> {scfg.label}
                    </span>
                    <Badge variant="outline" className="text-xs">{TYPE_LABELS[detailCheque.payment_type]}</Badge>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{detailCheque.currency} {formatNumber(detailCheque.amount)}</p>
                    <p className="text-sm text-muted-foreground">Payee: {detailCheque.payee_name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-xs text-muted-foreground">Issue Date</span><br />{format(parseISO(detailCheque.issue_date), 'dd MMM yyyy')}</div>
                    <div><span className="text-xs text-muted-foreground">Clearance Date</span><br />{detailCheque.clearance_date ? format(parseISO(detailCheque.clearance_date), 'dd MMM yyyy') : '—'}</div>
                    <div><span className="text-xs text-muted-foreground">Bank Account</span><br />{bank?.account_name ?? '—'}</div>
                    <div><span className="text-xs text-muted-foreground">Bank Ref</span><br /><span className="font-mono text-xs">{detailCheque.bank_reference ?? '—'}</span></div>
                    {vendor && <div><span className="text-xs text-muted-foreground">Vendor</span><br />{vendor.name_en}</div>}
                    {invoice && <div><span className="text-xs text-muted-foreground">Invoice</span><br /><span className="font-mono text-xs text-violet-600">{invoice.invoice_number}</span></div>}
                  </div>
                  {detailCheque.memo && (
                    <div className="rounded border bg-muted/30 p-3 text-sm">
                      <p className="text-xs text-muted-foreground mb-1">Memo</p>
                      <p>{detailCheque.memo}</p>
                    </div>
                  )}
                  {detailCheque.void_reason && (
                    <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                      <p className="font-medium mb-0.5">Void Reason</p>
                      <p>{detailCheque.void_reason}</p>
                    </div>
                  )}
                  {transitions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</p>
                      {transitions.includes('voided') && (
                        <Input value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Void reason (required)…" data-testid="input-void-reason" />
                      )}
                      <div className="flex flex-wrap gap-2">
                        {transitions.map(t => (
                          <Button key={t} size="sm" variant="outline"
                            className={cn(t === 'cleared' && 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
                                         t === 'bounced' && 'border-rose-300 text-rose-700 hover:bg-rose-50',
                                         t === 'voided'  && 'border-gray-300 text-gray-700 hover:bg-gray-50')}
                            disabled={actioning || (t === 'voided' && !voidReason.trim())}
                            onClick={() => doAction(detailCheque, t)}
                            data-testid={`btn-cheque-action-${t}`}>
                            {actioning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                            {STATUS_CFG[t]?.label ?? t}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setDetailCheque(null); setVoidReason(''); }}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
