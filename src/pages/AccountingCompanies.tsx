import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2, Building2, Globe, RefreshCw, Download } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';

interface Country { id: string; code: string; name_en: string; currency_code: string; flag_emoji: string | null }
interface Company {
  id: string; code: string; name_en: string; name_ar: string | null;
  country_id: string | null; currency_code: string; functional_currency: string;
  logo_url: string | null; address: string | null; phone: string | null; email: string | null;
  tax_id: string | null; is_active: boolean; is_parent: boolean;
  parent_company_id: string | null; fiscal_year_start: number; notes: string | null;
  created_at: string;
}

const CURRENCIES = ['USD','SDG','EUR','GBP','SAR','AED','EGP','ETB','KES','UGX','TZS','NGN','XAF','JPY','CNY'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const BLANK: Omit<Company,'id'|'created_at'> = {
  code:'', name_en:'', name_ar:null, country_id:null, currency_code:'USD', functional_currency:'USD',
  logo_url:null, address:null, phone:null, email:null, tax_id:null,
  is_active:true, is_parent:false, parent_company_id:null, fiscal_year_start:1, notes:null,
};

export default function AccountingCompanies() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const { toast } = useToast();
  const canManage = hasAnyRole(['super_admin','admin','financialAdmin']);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [countries, setCountries]   = useState<Country[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [formOpen, setFormOpen]     = useState(false);
  const [editing, setEditing]       = useState<Company | null>(null);
  const [form, setForm]             = useState({ ...BLANK });
  const [saving, setSaving]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const load = async () => {
    setLoading(true);
    const [cRes, ctRes] = await Promise.all([
      supabase.from('companies' as any).select('*').order('name_en'),
      supabase.from('countries').select('id,code,name_en,currency_code,flag_emoji').eq('is_active',true).order('name_en'),
    ]);
    setCompanies((cRes.data ?? []) as Company[]);
    setCountries((ctRes.data ?? []) as Country[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const openNew = () => { setEditing(null); setForm({ ...BLANK }); setFormOpen(true); };
  const openEdit = (c: Company) => {
    setEditing(c);
    setForm({ code:c.code, name_en:c.name_en, name_ar:c.name_ar, country_id:c.country_id,
      currency_code:c.currency_code, functional_currency:c.functional_currency,
      logo_url:c.logo_url, address:c.address, phone:c.phone, email:c.email, tax_id:c.tax_id,
      is_active:c.is_active, is_parent:c.is_parent, parent_company_id:c.parent_company_id,
      fiscal_year_start:c.fiscal_year_start, notes:c.notes });
    setFormOpen(true);
  };

  const sf = <K extends keyof typeof BLANK>(k: K, v: (typeof BLANK)[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.code.trim() || !form.name_en.trim()) {
      toast({ title:'Code and Name are required', variant:'destructive' }); return;
    }
    setSaving(true);
    const payload = {
      code: form.code.trim(), name_en: form.name_en.trim(),
      name_ar: form.name_ar || null, country_id: form.country_id || null,
      currency_code: form.currency_code, functional_currency: form.functional_currency,
      logo_url: form.logo_url || null, address: form.address || null,
      phone: form.phone || null, email: form.email || null, tax_id: form.tax_id || null,
      is_active: form.is_active, is_parent: form.is_parent,
      parent_company_id: form.parent_company_id || null,
      fiscal_year_start: form.fiscal_year_start,
      notes: form.notes || null, created_by: currentUser?.id,
    };
    const { error } = editing
      ? await supabase.from('companies' as any).update(payload).eq('id', editing.id)
      : await supabase.from('companies' as any).insert(payload);
    if (error) { toast({ title:'Save failed', description: error.message, variant:'destructive' }); }
    else { toast({ title: editing ? 'Company updated' : 'Company created' }); setFormOpen(false); void load(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('companies' as any).delete().eq('id', deleteTarget.id);
    if (error) toast({ title:'Delete failed', description:error.message, variant:'destructive' });
    else { toast({ title:'Company deleted' }); setDeleteTarget(null); void load(); }
    setDeleting(false);
  };

  const filtered = companies.filter(c =>
    !search || c.name_en.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase())
  );

  const getCountry = (id: string | null) => countries.find(c => c.id === id);
  const getParent  = (id: string | null) => companies.find(c => c.id === id);

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Companies</h2>
        <Badge variant="outline">{companies.length} companies</Badge>
        <div className="flex-1" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="w-52 h-8 text-sm" />
        <Button size="sm" variant="outline" onClick={load} data-testid="button-refresh-companies"><RefreshCw className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => exportToExcel(filtered.map(c => ({
          Code:c.code,'Name':c.name_en,'Country':getCountry(c.country_id)?.name_en??'','Currency':c.currency_code,'Active':c.is_active?'Yes':'No','Parent':c.is_parent?'Yes':'No',
        })),'Companies','companies.xlsx')} data-testid="button-export-companies"><Download className="h-4 w-4 mr-1" />Export</Button>
        {canManage && <Button size="sm" onClick={openNew} data-testid="button-new-company"><Plus className="h-4 w-4 mr-1" />New Company</Button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="font-medium">No companies yet</p>
          <p className="text-sm mt-1">Create companies to enable separate COA per entity</p>
          {canManage && <Button size="sm" className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add Company</Button>}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Fiscal Year Start</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => {
                  const ctr = getCountry(c.country_id);
                  const par = getParent(c.parent_company_id);
                  return (
                    <TableRow key={c.id} data-testid={`row-company-${c.id}`}>
                      <TableCell className="font-mono font-medium">{c.code}</TableCell>
                      <TableCell>
                        <div className="font-medium">{c.name_en}</div>
                        {c.name_ar && <div className="text-xs text-muted-foreground" dir="rtl">{c.name_ar}</div>}
                      </TableCell>
                      <TableCell>
                        {ctr ? <span>{ctr.flag_emoji} {ctr.name_en}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{c.currency_code}</Badge></TableCell>
                      <TableCell className="text-sm">{MONTHS[(c.fiscal_year_start ?? 1) - 1]}</TableCell>
                      <TableCell>
                        <Badge variant={c.is_parent ? 'default' : 'secondary'}>{c.is_parent ? 'Parent' : 'Subsidiary'}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{par?.name_en ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={c.is_active ? 'default' : 'outline'} className={c.is_active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500'}>
                          {c.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)} data-testid={`button-edit-company-${c.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(c)} data-testid={`button-delete-company-${c.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Company Form Dialog ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Company' : 'New Company'}</DialogTitle>
            <DialogDescription>Each company has its own Chart of Accounts, currency, and fiscal calendar.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1">
              <Label>Code *</Label>
              <Input value={form.code} onChange={e => sf('code',e.target.value)} placeholder="PACT-SDN" data-testid="input-company-code" />
            </div>
            <div className="space-y-1">
              <Label>Name (English) *</Label>
              <Input value={form.name_en} onChange={e => sf('name_en',e.target.value)} placeholder="PACT Sudan" data-testid="input-company-name-en" />
            </div>
            <div className="space-y-1">
              <Label>Name (Arabic)</Label>
              <Input value={form.name_ar ?? ''} onChange={e => sf('name_ar',e.target.value || null)} dir="rtl" data-testid="input-company-name-ar" />
            </div>
            <div className="space-y-1">
              <Label>Country</Label>
              <Select value={form.country_id ?? '__none'} onValueChange={v => { sf('country_id', v === '__none' ? null : v); const ct = countries.find(c=>c.id===v); if(ct) sf('currency_code', ct.currency_code); }}>
                <SelectTrigger data-testid="select-company-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>{countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji} {c.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Currency Code</Label>
              <Select value={form.currency_code} onValueChange={v => sf('currency_code',v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Functional Currency</Label>
              <Select value={form.functional_currency} onValueChange={v => sf('functional_currency',v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fiscal Year Start</Label>
              <Select value={String(form.fiscal_year_start)} onValueChange={v => sf('fiscal_year_start',Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m,i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tax ID / Registration No.</Label>
              <Input value={form.tax_id ?? ''} onChange={e => sf('tax_id',e.target.value||null)} data-testid="input-company-taxid" />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={form.phone ?? ''} onChange={e => sf('phone',e.target.value||null)} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ''} onChange={e => sf('email',e.target.value||null)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Address</Label>
              <Textarea value={form.address ?? ''} onChange={e => sf('address',e.target.value||null)} rows={2} />
            </div>
            <div className="space-y-1">
              <Label>Parent Company</Label>
              <Select value={form.parent_company_id ?? '__none'} onValueChange={v => sf('parent_company_id', v==='__none'?null:v)}>
                <SelectTrigger><SelectValue placeholder="None (standalone)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {companies.filter(c => !editing || c.id !== editing.id).map(c => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes ?? ''} onChange={e => sf('notes',e.target.value||null)} rows={2} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => sf('is_active',v)} id="sw-active" />
              <Label htmlFor="sw-active">Active</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_parent} onCheckedChange={v => sf('is_parent',v)} id="sw-parent" />
              <Label htmlFor="sw-parent">Parent Company</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-company">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editing ? 'Save Changes' : 'Create Company'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if(!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Company</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <strong>{deleteTarget?.name_en}</strong>? This will also unlink all accounts assigned to this company.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
