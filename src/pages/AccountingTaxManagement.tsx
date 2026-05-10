import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, Plus, Pencil, Search, Download,
  CheckCircle2, AlertTriangle, Info, ReceiptText, Percent,
  Globe, Building2, FileText,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface TaxCode {
  id: string; code: string; name_en: string; name_ar: string | null;
  tax_type: string; rate_pct: number; country_id: string | null;
  applicable_to: string; gl_account_id: string | null; is_active: boolean;
  description: string | null; created_at: string;
}
interface Account { id: string; code: string; name_en: string }
interface TaxSummaryRow { tax_code: string; tax_type: string; rate_pct: number; base_amount: number; tax_amount: number; invoice_count: number }

const TAX_TYPES = [
  { value: 'vat',    label: 'VAT — Value Added Tax' },
  { value: 'wht',    label: 'WHT — Withholding Tax' },
  { value: 'customs', label: 'Customs / Import Duty' },
  { value: 'stamp',  label: 'Stamp Duty' },
  { value: 'other',  label: 'Other' },
];

const APPLICABLE_TO = ['invoices', 'purchases', 'payroll', 'all'];

const TYPE_COLOR: Record<string, string> = {
  vat:     'bg-blue-100 text-blue-800 dark:bg-blue-900/30',
  wht:     'bg-amber-100 text-amber-800 dark:bg-amber-900/30',
  customs: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30',
  stamp:   'bg-teal-100 text-teal-800 dark:bg-teal-900/30',
  other:   'bg-slate-100 text-slate-700',
};

const BLANK = {
  code: '', name_en: '', name_ar: '', tax_type: 'vat', rate_pct: '',
  country_id: '', applicable_to: 'invoices', gl_account_id: '', description: '', is_active: true,
};

export default function AccountingTaxManagement() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canEdit  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const { toast } = useToast();

  const [taxCodes, setTaxCodes]   = useState<TaxCode[]>([]);
  const [countries, setCountries] = useState<{id:string;name_en:string;flag_emoji?:string|null}[]>([]);
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [summary, setSummary]     = useState<TaxSummaryRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tableExists, setTableExists] = useState<boolean | null>(null);
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [tab, setTab]             = useState('codes');

  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState<TaxCode | null>(null);
  const [form, setForm]           = useState(BLANK);
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: taxData, error: taxErr } = await supabase
      .from('acct_tax_codes')
      .select('*')
      .order('code');
    if (taxErr?.code === '42P01') { setTableExists(false); setLoading(false); return; }
    setTableExists(true);
    setTaxCodes((taxData ?? []) as TaxCode[]);

    const [{ data: aData }, { data: sumData }, { data: cData }] = await Promise.all([
      supabase.from('acct_accounts').select('id, code, name_en').order('code'),
      supabase.rpc('acct_tax_summary').catch(() => ({ data: [] })),
      supabase.from('countries').select('id, name_en, flag_emoji').eq('is_active', true).order('name_en'),
    ]);
    setAccounts((aData ?? []) as Account[]);
    setSummary((sumData ?? []) as TaxSummaryRow[]);
    setCountries((cData ?? []) as {id:string;name_en:string;flag_emoji?:string|null}[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => taxCodes.filter(t => {
    if (typeFilter !== 'all' && t.tax_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.code.toLowerCase().includes(q) && !t.name_en.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [taxCodes, typeFilter, search]);

  const stats = useMemo(() => ({
    total: taxCodes.length,
    active: taxCodes.filter(t => t.is_active).length,
    vat: taxCodes.filter(t => t.tax_type === 'vat').length,
    wht: taxCodes.filter(t => t.tax_type === 'wht').length,
  }), [taxCodes]);

  const openCreate = () => { setEditing(null); setForm(BLANK); setOpen(true); };
  const openEdit   = (t: TaxCode) => {
    setEditing(t);
    setForm({
      code: t.code, name_en: t.name_en, name_ar: t.name_ar ?? '',
      tax_type: t.tax_type, rate_pct: String(t.rate_pct),
      country_id: t.country_id ?? '', applicable_to: t.applicable_to,
      gl_account_id: t.gl_account_id ?? '', description: t.description ?? '',
      is_active: t.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name_en.trim()) { toast({ title: 'Code and name are required', variant: 'destructive' }); return; }
    if (Number(form.rate_pct) < 0 || Number(form.rate_pct) > 100) { toast({ title: 'Rate must be 0–100', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = {
      code: form.code.trim().toUpperCase(), name_en: form.name_en.trim(),
      name_ar: form.name_ar || null, tax_type: form.tax_type,
      rate_pct: Number(form.rate_pct), country_id: form.country_id || null,
      applicable_to: form.applicable_to, gl_account_id: form.gl_account_id || null,
      description: form.description || null, is_active: form.is_active,
    };
    if (editing) {
      const { error } = await supabase.from('acct_tax_codes').update(payload).eq('id', editing.id);
      if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Tax code updated' }); setOpen(false); void load(); }
    } else {
      const { error } = await supabase.from('acct_tax_codes').insert(payload);
      if (error) toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Tax code created' }); setOpen(false); void load(); }
    }
    setSaving(false);
  };

  const toggleActive = async (t: TaxCode) => {
    const { error } = await supabase.from('acct_tax_codes').update({ is_active: !t.is_active }).eq('id', t.id);
    if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    else { toast({ title: `${t.code} ${!t.is_active ? 'activated' : 'deactivated'}` }); void load(); }
  };

  const exportCsv = () => {
    downloadCsv('tax_codes.csv', [
      ['Code', 'Name', 'Type', 'Rate %', 'Applicable To', 'Active', 'Country'],
      ...filtered.map(t => {
        const country = countries.find(c => c.id === t.country_id);
        return [t.code, t.name_en, t.tax_type, t.rate_pct, t.applicable_to, t.is_active ? 'Yes' : 'No', country?.name_en ?? ''];
      }),
    ]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed)   return <Navigate to="/" replace />;

  if (tableExists === false) {
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-[900px] space-y-5">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ReceiptText className="w-6 h-6 text-blue-600" /> Tax Management
        </h1>
        <Card className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-5 flex gap-4">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="font-medium text-amber-800 dark:text-amber-400">Phase 4 Migration Required</p>
              <p className="text-sm text-amber-700 dark:text-amber-500">
                The <code className="font-mono text-xs">acct_tax_codes</code> table does not exist yet.
                Apply the Phase 4 SQL migration to your Supabase project:
              </p>
              <code className="block text-xs font-mono bg-white/60 dark:bg-black/20 rounded p-2 border border-amber-200">
                supabase/migrations/20260520_acct_phase4_advanced.sql
              </code>
              <p className="text-xs text-amber-600">This file has been written to your project directory.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1100px]">
      <PageInfoBanner
        title="Tax Management"
        description="Define tax codes (VAT, WHT, customs) with rates and GL account mappings. Tax codes are applied to AP invoices and purchase orders for automatic tax calculation and reporting."
        workflowSteps={[
          { step: 1, role: 'Finance Admin', action: 'Define Tax Codes',        description: 'Create tax codes with rates, types and applicable countries.' },
          { step: 2, role: 'Finance Admin', action: 'Map to GL Account',       description: 'Link each tax code to a dedicated GL liability account.' },
          { step: 3, role: 'System',        action: 'Apply Tax',               description: 'Tax codes are automatically applied when entering invoices or POs.' },
          { step: 4, role: 'Finance Admin', action: 'Generate Tax Report',     description: 'Run tax reports by period for compliance filing.' },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ReceiptText className="w-6 h-6 text-blue-600" /> Tax Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">VAT, WHT, and customs tax code registry with GL mapping.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh-tax"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-tax"><Download className="w-4 h-4 mr-1" /> Export</Button>
          {canEdit && <Button size="sm" onClick={openCreate} data-testid="button-create-tax"><Plus className="w-4 h-4 mr-1" /> New Tax Code</Button>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Codes', value: stats.total,  color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Active',      value: stats.active, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'VAT Codes',  value: stats.vat,    color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
          { label: 'WHT Codes',  value: stats.wht,    color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-950/30' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-xl border p-3', s.bg)}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn('text-2xl font-bold mt-1', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="codes" data-testid="tab-tax-codes">Tax Codes</TabsTrigger>
          {summary.length > 0 && <TabsTrigger value="summary" data-testid="tab-tax-summary">Tax Summary</TabsTrigger>}
        </TabsList>

        <TabsContent value="codes" className="space-y-3 mt-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search code or name…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-tax" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px] h-9" data-testid="select-type-tax"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {TAX_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <ReceiptText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No tax codes found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b">
                      <tr>
                        {['Code', 'Name', 'Type', 'Rate', 'Applicable To', 'GL Account', 'Country', 'Active', ''].map(h => (
                          <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filtered.map(t => {
                        const country = countries.find(c => c.id === t.country_id);
                        const account = accounts.find(a => a.id === t.gl_account_id);
                        return (
                          <tr key={t.id} className="hover:bg-muted/30" data-testid={`row-tax-${t.id}`}>
                            <td className="px-4 py-3 font-mono text-xs font-semibold">{t.code}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-sm">{t.name_en}</p>
                              {t.name_ar && <p className="text-xs text-muted-foreground" dir="rtl">{t.name_ar}</p>}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={cn('text-[10px]', TYPE_COLOR[t.tax_type] ?? TYPE_COLOR.other)}>
                                {t.tax_type.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 font-mono text-sm font-semibold">{t.rate_pct}%</td>
                            <td className="px-4 py-3 text-xs capitalize">{t.applicable_to}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{account ? `${account.code}` : '—'}</td>
                            <td className="px-4 py-3 text-xs">{country ? `${country.flag_emoji ?? ''} ${country.name_en}` : '—'}</td>
                            <td className="px-4 py-3">
                              {canEdit ? (
                                <Switch checked={t.is_active} onCheckedChange={() => void toggleActive(t)} data-testid={`switch-tax-${t.id}`} />
                              ) : (
                                t.is_active
                                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                  : <div className="w-4 h-4 rounded-full border-2 border-muted" />
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {canEdit && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)} data-testid={`btn-edit-tax-${t.id}`}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              )}
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
        </TabsContent>

        {summary.length > 0 && (
          <TabsContent value="summary" className="mt-3">
            <Card className="border shadow-sm">
              <CardHeader className="p-4 border-b">
                <CardTitle className="text-base">Tax Collection Summary</CardTitle>
                <CardDescription className="text-xs">Aggregated tax amounts by tax code from posted AP invoices.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b">
                      <tr>
                        {['Tax Code', 'Type', 'Rate', 'Invoices', 'Base Amount', 'Tax Collected'].map(h => (
                          <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {summary.map(s => (
                        <tr key={s.tax_code} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-mono text-xs font-semibold">{s.tax_code}</td>
                          <td className="px-4 py-3"><Badge variant="outline" className={cn('text-[10px]', TYPE_COLOR[s.tax_type] ?? TYPE_COLOR.other)}>{s.tax_type.toUpperCase()}</Badge></td>
                          <td className="px-4 py-3 font-mono text-sm">{s.rate_pct}%</td>
                          <td className="px-4 py-3 text-center">{s.invoice_count}</td>
                          <td className="px-4 py-3 font-mono text-xs">{formatNumber(s.base_amount)}</td>
                          <td className="px-4 py-3 font-mono text-sm font-semibold text-blue-600">{formatNumber(s.tax_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Tax Code' : 'New Tax Code'}</DialogTitle>
            <DialogDescription>Define a tax code with its rate and GL account mapping.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Code * <span className="text-xs text-muted-foreground">(auto-uppercased)</span></Label>
              <Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. VAT17, WHT10" data-testid="input-tax-code" />
            </div>
            <div className="space-y-1.5">
              <Label>Tax Type *</Label>
              <Select value={form.tax_type} onValueChange={v => setForm(p => ({ ...p, tax_type: v }))}>
                <SelectTrigger data-testid="select-tax-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAX_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Name (English) *</Label>
              <Input value={form.name_en} onChange={e => setForm(p => ({ ...p, name_en: e.target.value }))} placeholder="e.g. Standard VAT 17%" data-testid="input-tax-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Name (Arabic)</Label>
              <Input value={form.name_ar} onChange={e => setForm(p => ({ ...p, name_ar: e.target.value }))} placeholder="اسم الضريبة" dir="rtl" data-testid="input-tax-name-ar" />
            </div>
            <div className="space-y-1.5">
              <Label>Rate % *</Label>
              <div className="relative">
                <Input type="number" min={0} max={100} step={0.01} value={form.rate_pct}
                  onChange={e => setForm(p => ({ ...p, rate_pct: e.target.value }))}
                  placeholder="e.g. 17" className="pr-8" data-testid="input-tax-rate" />
                <Percent className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Applicable To</Label>
              <Select value={form.applicable_to} onValueChange={v => setForm(p => ({ ...p, applicable_to: v }))}>
                <SelectTrigger data-testid="select-tax-applicable"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPLICABLE_TO.map(a => <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>GL Liability Account</Label>
              <Select value={form.gl_account_id} onValueChange={v => setForm(p => ({ ...p, gl_account_id: v }))}>
                <SelectTrigger data-testid="select-tax-gl"><SelectValue placeholder="Select GL account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} – {a.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Select value={form.country_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, country_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger data-testid="select-tax-country"><SelectValue placeholder="All countries" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">All countries</SelectItem>
                  {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional notes…" data-testid="input-tax-desc" />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <Switch id="tax-active" checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} data-testid="switch-tax-active" />
              <Label htmlFor="tax-active">Active (available for selection on invoices and POs)</Label>
            </div>
            {form.rate_pct && (
              <div className="sm:col-span-2 rounded-lg bg-muted/40 p-3 text-sm">
                <p className="text-muted-foreground text-xs mb-1">Preview calculation on 1,000 base amount</p>
                <div className="flex gap-4">
                  <span>Base: <strong>1,000.00</strong></span>
                  <span className="text-blue-600">{form.tax_type?.toUpperCase()}: <strong>{formatNumber(1000 * Number(form.rate_pct) / 100)}</strong></span>
                  <span>Total: <strong>{formatNumber(1000 + 1000 * Number(form.rate_pct) / 100)}</strong></span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="button-save-tax">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
