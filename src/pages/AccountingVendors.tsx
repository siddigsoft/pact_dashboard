import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Building2, Plus, Download, RefreshCw, Pencil, ToggleLeft, ToggleRight, Search, Receipt, Phone, Mail, MapPin, CreditCard, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface Vendor { id: string; vendor_code: string | null; name_en: string; name_ar: string | null; vendor_type: string; tax_id: string | null; country_id: string | null; gl_account_id: string | null; payment_terms: number; currency: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; address: string | null; bank_name: string | null; bank_account_no: string | null; swift_code: string | null; is_active: boolean; notes: string | null; created_at: string }
interface JournalLine { id: string; entry_id: string; line_no: number; debit_credit: string; functional_amount: number; functional_currency: string; description: string | null; acct_journal_entries: { entry_no: number; posting_date: string; description_en: string; status: string } | null }
interface GLAccount { id: string; code: string; name_en: string }
interface Country { id: string; code: string; name_en: string; flag_emoji: string | null; currency_code: string }

const VENDOR_TYPES = ['supplier', 'service_provider', 'consultant', 'ngo_partner', 'government', 'utility'];
const BLANK_VENDOR: Partial<Vendor> = { name_en: '', name_ar: '', vendor_type: 'supplier', payment_terms: 30, currency: 'USD', tax_id: '', contact_name: '', contact_email: '', contact_phone: '', address: '', bank_name: '', bank_account_no: '', swift_code: '', notes: '' };

export default function AccountingVendors() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canEdit = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);
  const { toast } = useToast();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vendorLines, setVendorLines] = useState<JournalLine[]>([]);
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [linesLoading, setLinesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog
  const [dialog, setDialog] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState<Partial<Vendor>>(BLANK_VENDOR);
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showInactive, setShowInactive] = useState(false);
  const [countryFilter, setCountryFilter] = useState('all');

  const loadVendors = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [vRes, glRes, cRes] = await Promise.all([
      supabase.from('acct_vendors').select('*').order('name_en'),
      supabase.from('acct_accounts').select('id, code, name_en').eq('is_active', true).order('code'),
      supabase.from('countries').select('id, code, name_en, flag_emoji, currency_code').eq('is_active', true).order('name_en'),
    ]);
    if (vRes.error && vRes.error.code !== '42P01') setError(vRes.error.message);
    setVendors((vRes.data ?? []) as Vendor[]);
    setGlAccounts((glRes.data ?? []) as GLAccount[]);
    setCountries((cRes.data ?? []) as Country[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadVendors(); }, [loadVendors]);

  const loadVendorLines = useCallback(async (vendorId: string) => {
    setLinesLoading(true);
    const { data } = await supabase
      .from('acct_journal_lines')
      .select('id, entry_id, line_no, debit_credit, functional_amount, functional_currency, description, acct_journal_entries!inner(entry_no, posting_date, description_en, status)')
      .eq('vendor_id', vendorId)
      .order('entry_id')
      .order('line_no')
      .limit(200);
    setVendorLines((data ?? []) as any[]);
    setLinesLoading(false);
  }, []);

  useEffect(() => { if (selectedId) void loadVendorLines(selectedId); else setVendorLines([]); }, [selectedId, loadVendorLines]);

  const selectedVendor = useMemo(() => vendors.find(v => v.id === selectedId) ?? null, [vendors, selectedId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return vendors.filter(v => {
      if (!showInactive && !v.is_active) return false;
      if (typeFilter !== 'all' && v.vendor_type !== typeFilter) return false;
      if (countryFilter !== 'all' && v.country_id !== countryFilter) return false;
      if (q) return v.name_en.toLowerCase().includes(q) || (v.name_ar ?? '').includes(q) || (v.vendor_code ?? '').toLowerCase().includes(q) || (v.tax_id ?? '').toLowerCase().includes(q);
      return true;
    });
  }, [vendors, search, typeFilter, showInactive, countryFilter]);

  const openDialog = (v?: Vendor) => {
    setEditingVendor(v ?? null);
    setForm(v ? { ...v } : { ...BLANK_VENDOR, country_id: '', gl_account_id: '' });
    setDialog(true);
  };

  const save = async () => {
    if (!form.name_en) return;
    setSaving(true);
    const payload: any = { name_en: form.name_en, name_ar: form.name_ar || null, vendor_type: form.vendor_type ?? 'supplier', tax_id: form.tax_id || null, country_id: form.country_id || null, gl_account_id: form.gl_account_id || null, payment_terms: Number(form.payment_terms ?? 30), currency: form.currency || 'USD', contact_name: form.contact_name || null, contact_email: form.contact_email || null, contact_phone: form.contact_phone || null, address: form.address || null, bank_name: form.bank_name || null, bank_account_no: form.bank_account_no || null, swift_code: form.swift_code || null, notes: form.notes || null };
    let err: any;
    if (editingVendor) {
      ({ error: err } = await supabase.from('acct_vendors').update(payload).eq('id', editingVendor.id));
    } else {
      ({ error: err } = await supabase.from('acct_vendors').insert(payload));
    }
    if (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); setSaving(false); return; }
    toast({ title: editingVendor ? 'Vendor updated' : 'Vendor added' });
    setDialog(false);
    await loadVendors();
    setSaving(false);
  };

  const toggleActive = async (v: Vendor) => {
    await supabase.from('acct_vendors').update({ is_active: !v.is_active }).eq('id', v.id);
    await loadVendors();
    if (selectedId === v.id && v.is_active) setSelectedId(null);
  };

  const exportCsv = () => {
    const header = ['Code', 'Name (EN)', 'Name (AR)', 'Type', 'Country', 'Currency', 'Payment Terms', 'Contact', 'Email', 'Active'];
    const rows = filtered.map(v => {
      const c = countries.find(x => x.id === v.country_id);
      return [v.vendor_code ?? '', v.name_en, v.name_ar ?? '', v.vendor_type, c?.name_en ?? '', v.currency, String(v.payment_terms), v.contact_name ?? '', v.contact_email ?? '', v.is_active ? 'Yes' : 'No'];
    });
    downloadCsv(`vendors-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  // Vendor ledger summary
  const ledgerSummary = useMemo(() => {
    let totalDR = 0, totalCR = 0;
    for (const l of vendorLines) {
      const amt = Number(l.functional_amount) || 0;
      if (l.debit_credit === 'DR') totalDR += amt;
      else totalCR += amt;
    }
    return { totalDR, totalCR, net: totalCR - totalDR };
  }, [vendorLines]);

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const typeBadge = (t: string) => {
    const map: Record<string, string> = { supplier: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30', service_provider: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30', consultant: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30', ngo_partner: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30', government: 'bg-slate-100 text-slate-800', utility: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30' };
    return map[t] ?? 'bg-slate-100 text-slate-800';
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="vendors-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-600 text-white shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Vendor Registry</h1>
            <p className="text-muted-foreground text-sm">سجل الموردين — Suppliers, consultants, and service providers</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadVendors} disabled={loading} data-testid="button-refresh"><RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} data-testid="button-export"><Download className="h-4 w-4 mr-1" />CSV</Button>
          {canEdit && <Button size="sm" onClick={() => openDialog()} data-testid="button-add"><Plus className="h-4 w-4 mr-1" />Add Vendor</Button>}
        </div>
      </div>

      <PageInfoBanner
        title="Vendor Registry"
        description="Central register of all suppliers, consultants, service providers, and NGO partners. Each vendor can be linked to a GL payables account so journal entries are tagged automatically. Run supabase/vendors_migration.sql first to create the required tables."
        descriptionAr="سجل مركزي لجميع الموردين والمستشارين ومزودي الخدمات وشركاء المنظمات. يمكن ربط كل مورد بحساب دفع في دفتر الأستاذ العام لتصنيف القيود المحاسبية تلقائياً."
      />

      {error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-4">{error}</div>}

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-9 text-sm" placeholder="Search name, code, tax ID..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44 h-9" data-testid="select-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {VENDOR_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="w-44 h-9" data-testid="select-country"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant={showInactive ? 'default' : 'outline'} size="sm" onClick={() => setShowInactive(p => !p)} data-testid="button-show-inactive">
              {showInactive ? <ToggleRight className="h-4 w-4 mr-1" /> : <ToggleLeft className="h-4 w-4 mr-1" />}Show Inactive
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Vendor list */}
        <div className={cn('lg:col-span-2 space-y-2', loading && 'opacity-50')}>
          {loading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">No vendors found. {canEdit && <><br /><Button className="mt-2" onClick={() => openDialog()}>Add the first vendor</Button></>}</div>
          ) : filtered.map(v => {
            const c = countries.find(x => x.id === v.country_id);
            return (
              <div key={v.id} onClick={() => setSelectedId(v.id === selectedId ? null : v.id)} className={cn('border rounded-lg p-3 cursor-pointer transition-all hover:shadow-sm', selectedId === v.id ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/20' : 'hover:border-slate-300', !v.is_active && 'opacity-50')} data-testid={`vendor-card-${v.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{v.name_en}</span>
                      {v.vendor_code && <span className="text-[10px] text-muted-foreground font-mono">{v.vendor_code}</span>}
                    </div>
                    {v.name_ar && <div className="text-[11px] text-muted-foreground" dir="rtl">{v.name_ar}</div>}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', typeBadge(v.vendor_type))}>{v.vendor_type.replace('_', ' ')}</span>
                      {c && <span className="text-[10px] text-muted-foreground">{c.flag_emoji ?? ''} {c.name_en}</span>}
                      {v.payment_terms && <span className="text-[10px] text-muted-foreground">Net {v.payment_terms}d</span>}
                    </div>
                  </div>
                  {!v.is_active && <Badge variant="outline" className="text-[10px] shrink-0 border-slate-300 text-slate-500">Inactive</Badge>}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground text-center pt-1">{filtered.length} vendor{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Vendor detail */}
        <div className="lg:col-span-3">
          {!selectedVendor ? (
            <div className="flex items-center justify-center h-full min-h-64 text-muted-foreground text-sm border rounded-lg bg-muted/20">Select a vendor to view details</div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{selectedVendor.name_en}</CardTitle>
                    {selectedVendor.name_ar && <div className="text-sm text-muted-foreground mt-0.5" dir="rtl">{selectedVendor.name_ar}</div>}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => openDialog(selectedVendor)} data-testid="button-edit"><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                      <Button variant="outline" size="sm" onClick={() => toggleActive(selectedVendor)} data-testid="button-toggle-active">
                        {selectedVendor.is_active ? <ToggleRight className="h-3.5 w-3.5 mr-1 text-emerald-600" /> : <ToggleLeft className="h-3.5 w-3.5 mr-1" />}
                        {selectedVendor.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="details">
                  <TabsList className="mb-4">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="ledger">Ledger <Badge variant="outline" className="ml-1 text-[10px]">{vendorLines.length}</Badge></TabsTrigger>
                  </TabsList>
                  <TabsContent value="details">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        { icon: Building2, label: 'Type', value: selectedVendor.vendor_type.replace('_', ' ') },
                        { icon: CreditCard, label: 'Tax ID', value: selectedVendor.tax_id || '—' },
                        { icon: Receipt, label: 'Currency', value: selectedVendor.currency },
                        { icon: Calendar, label: 'Payment Terms', value: `Net ${selectedVendor.payment_terms} days` },
                        { icon: Phone, label: 'Contact', value: selectedVendor.contact_name || '—' },
                        { icon: Phone, label: 'Phone', value: selectedVendor.contact_phone || '—' },
                        { icon: Mail, label: 'Email', value: selectedVendor.contact_email || '—' },
                        { icon: MapPin, label: 'Address', value: selectedVendor.address || '—' },
                      ].map(item => (
                        <div key={item.label} className="flex items-start gap-2">
                          <item.icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <div className="text-[10px] text-muted-foreground">{item.label}</div>
                            <div className="font-medium text-xs">{item.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {(selectedVendor.bank_name || selectedVendor.bank_account_no) && (
                      <div className="mt-3 p-3 rounded-md bg-muted/30 border text-xs">
                        <div className="font-semibold mb-1 text-muted-foreground">Banking Details</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div><span className="text-muted-foreground">Bank: </span>{selectedVendor.bank_name || '—'}</div>
                          <div><span className="text-muted-foreground">Account: </span>{selectedVendor.bank_account_no ? `****${selectedVendor.bank_account_no.slice(-4)}` : '—'}</div>
                          {selectedVendor.swift_code && <div><span className="text-muted-foreground">SWIFT: </span>{selectedVendor.swift_code}</div>}
                        </div>
                      </div>
                    )}
                    {selectedVendor.notes && (
                      <div className="mt-3 text-xs text-muted-foreground italic border-t pt-2">{selectedVendor.notes}</div>
                    )}
                  </TabsContent>
                  <TabsContent value="ledger">
                    {linesLoading ? (
                      <div className="flex items-center justify-center h-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : vendorLines.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8 text-sm">No journal lines tagged to this vendor yet.<br />Tag entries by selecting this vendor when creating journal entries.</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          {[
                            { label: 'Total Debits', v: ledgerSummary.totalDR, color: 'text-rose-700' },
                            { label: 'Total Credits', v: ledgerSummary.totalCR, color: 'text-emerald-700' },
                            { label: 'Net Balance (owed)', v: ledgerSummary.net, color: ledgerSummary.net > 0 ? 'text-rose-700' : 'text-emerald-700' },
                          ].map(s => (
                            <div key={s.label} className="rounded-md border p-2 text-center">
                              <div className="text-[10px] text-muted-foreground">{s.label}</div>
                              <div className={cn('font-bold text-sm', s.color)}>{formatNumber(s.v)}</div>
                            </div>
                          ))}
                        </div>
                        <div className="border rounded-md overflow-hidden">
                          <table className="w-full text-xs">
                            <thead><tr className="border-b bg-muted/40"><th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Entry</th><th className="text-left px-3 py-2">Description</th><th className="text-right px-3 py-2">Amount</th></tr></thead>
                            <tbody>
                              {vendorLines.map(l => (
                                <tr key={l.id} className="border-b last:border-b-0 hover:bg-muted/20">
                                  <td className="px-3 py-1.5">{l.acct_journal_entries ? format(parseISO(l.acct_journal_entries.posting_date), 'MMM d, yyyy') : '—'}</td>
                                  <td className="px-3 py-1.5 font-mono text-indigo-600 dark:text-indigo-400">{l.acct_journal_entries ? `JE-${String(l.acct_journal_entries.entry_no).padStart(4, '0')}` : '—'}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground truncate max-w-32">{l.description ?? l.acct_journal_entries?.description_en ?? '—'}</td>
                                  <td className={cn('px-3 py-1.5 text-right font-medium tabular-nums', l.debit_credit === 'CR' ? 'text-emerald-700' : 'text-rose-700')}>
                                    {l.debit_credit === 'CR' ? '+' : '-'}{formatNumber(l.functional_amount)} {l.functional_currency}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendor ? 'Edit' : 'Add'} Vendor</DialogTitle>
            <DialogDescription>Register a supplier, consultant, or service provider.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs mb-1">Name (English) *</Label>
              <Input className="h-9" value={form.name_en ?? ''} onChange={e => setForm(p => ({ ...p, name_en: e.target.value }))} placeholder="Vendor full name" data-testid="input-name-en" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs mb-1">Name (Arabic)</Label>
              <Input className="h-9" value={form.name_ar ?? ''} onChange={e => setForm(p => ({ ...p, name_ar: e.target.value }))} placeholder="اسم المورد" dir="rtl" data-testid="input-name-ar" />
            </div>
            <div>
              <Label className="text-xs mb-1">Vendor Type</Label>
              <Select value={form.vendor_type ?? 'supplier'} onValueChange={v => setForm(p => ({ ...p, vendor_type: v }))}>
                <SelectTrigger className="h-9" data-testid="select-vendor-type"><SelectValue /></SelectTrigger>
                <SelectContent>{VENDOR_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1">Country</Label>
              <Select value={form.country_id ?? ''} onValueChange={v => setForm(p => ({ ...p, country_id: v }))}>
                <SelectTrigger className="h-9" data-testid="select-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>{countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1">Linked GL Account (AP)</Label>
              <Select value={form.gl_account_id ?? ''} onValueChange={v => setForm(p => ({ ...p, gl_account_id: v }))}>
                <SelectTrigger className="h-9" data-testid="select-gl"><SelectValue placeholder="Select GL account" /></SelectTrigger>
                <SelectContent>{glAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1">Currency</Label>
              <Input className="h-9" value={form.currency ?? 'USD'} onChange={e => setForm(p => ({ ...p, currency: e.target.value.toUpperCase().slice(0, 3) }))} data-testid="input-currency" />
            </div>
            <div>
              <Label className="text-xs mb-1">Tax / VAT ID</Label>
              <Input className="h-9" value={form.tax_id ?? ''} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))} placeholder="Tax registration number" data-testid="input-tax-id" />
            </div>
            <div>
              <Label className="text-xs mb-1">Payment Terms (days)</Label>
              <Input type="number" className="h-9" value={form.payment_terms ?? 30} onChange={e => setForm(p => ({ ...p, payment_terms: Number(e.target.value) }))} data-testid="input-payment-terms" />
            </div>
            <div className="col-span-2 border-t pt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Contact</p>
              <div className="grid grid-cols-3 gap-2">
                {[{ k: 'contact_name', label: 'Name', placeholder: 'Primary contact' }, { k: 'contact_email', label: 'Email', placeholder: 'email@example.com' }, { k: 'contact_phone', label: 'Phone', placeholder: '+1 234 567 8900' }].map(f => (
                  <div key={f.k}>
                    <Label className="text-xs mb-1">{f.label}</Label>
                    <Input className="h-9" value={(form as any)[f.k] ?? ''} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} placeholder={f.placeholder} data-testid={`input-${f.k}`} />
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <Label className="text-xs mb-1">Address</Label>
                <Input className="h-9" value={form.address ?? ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Full address" data-testid="input-address" />
              </div>
            </div>
            <div className="col-span-2 border-t pt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Banking</p>
              <div className="grid grid-cols-3 gap-2">
                {[{ k: 'bank_name', label: 'Bank Name', placeholder: 'Commercial Bank' }, { k: 'bank_account_no', label: 'Account No', placeholder: '1234567890' }, { k: 'swift_code', label: 'SWIFT / BIC', placeholder: 'CBKSUSD' }].map(f => (
                  <div key={f.k}>
                    <Label className="text-xs mb-1">{f.label}</Label>
                    <Input className="h-9" value={(form as any)[f.k] ?? ''} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} placeholder={f.placeholder} data-testid={`input-${f.k}`} />
                  </div>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-xs mb-1">Notes</Label>
              <Input className="h-9" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Internal notes" data-testid="input-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name_en} data-testid="button-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editingVendor ? 'Update' : 'Add Vendor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
