import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2, Globe, RefreshCw, Download, MapPin } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';

interface Country { id: string; code: string; name_en: string; flag_emoji: string | null }
interface Company { id: string; name_en: string }
interface FiscalPosition {
  id: string; name_en: string; name_ar: string | null;
  company_id: string | null; country_id: string | null;
  auto_apply: boolean; notes: string | null; is_active: boolean; created_at: string;
}
const BLANK = { name_en:'', name_ar:'', company_id:'', country_id:'', auto_apply:false, notes:'', is_active:true };

export default function AccountingFiscalPositions() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const { toast } = useToast();
  const canManage = hasAnyRole(['super_admin','admin','financialAdmin']);
  const allowed   = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [positions, setPositions] = useState<FiscalPosition[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading]     = useState(true);
  const [formOpen, setFormOpen]   = useState(false);
  const [editing, setEditing]     = useState<FiscalPosition | null>(null);
  const [form, setForm]           = useState({ ...BLANK });
  const [saving, setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FiscalPosition | null>(null);

  const load = async () => {
    setLoading(true);
    const [pRes, ctRes, coRes] = await Promise.all([
      supabase.from('acct_fiscal_positions' as any).select('*').order('name_en'),
      supabase.from('countries').select('id,code,name_en,flag_emoji').eq('is_active',true).order('name_en'),
      supabase.from('companies' as any).select('id,name_en').eq('is_active',true).order('name_en'),
    ]);
    setPositions((pRes.data??[]) as FiscalPosition[]);
    setCountries((ctRes.data??[]) as Country[]);
    setCompanies((coRes.data??[]) as Company[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const sf = (k: keyof typeof BLANK, v: any) => setForm(p=>({...p,[k]:v}));

  const openNew = () => { setEditing(null); setForm({...BLANK}); setFormOpen(true); };
  const openEdit = (fp: FiscalPosition) => {
    setEditing(fp);
    setForm({ name_en:fp.name_en, name_ar:fp.name_ar??'', company_id:fp.company_id??'', country_id:fp.country_id??'', auto_apply:fp.auto_apply, notes:fp.notes??'', is_active:fp.is_active });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name_en.trim()) { toast({title:'Name required',variant:'destructive'}); return; }
    setSaving(true);
    const payload = { name_en:form.name_en.trim(), name_ar:form.name_ar||null, company_id:form.company_id||null, country_id:form.country_id||null, auto_apply:form.auto_apply, notes:form.notes||null, is_active:form.is_active, created_by:currentUser?.id };
    const { error } = editing
      ? await supabase.from('acct_fiscal_positions' as any).update(payload).eq('id',editing.id)
      : await supabase.from('acct_fiscal_positions' as any).insert(payload);
    if (error) toast({title:'Save failed',description:error.message,variant:'destructive'});
    else { toast({title: editing?'Updated':'Created'}); setFormOpen(false); void load(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('acct_fiscal_positions' as any).delete().eq('id',deleteTarget.id);
    toast({title:'Deleted'}); setDeleteTarget(null); void load();
  };

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Fiscal Positions</h2>
        <p className="text-xs text-muted-foreground">Tax & account mapping rules per jurisdiction / entity type</p>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={()=>exportToExcel(positions.map(p=>({Name:p.name_en,Country:countries.find(c=>c.id===p.country_id)?.name_en??'',AutoApply:p.auto_apply?'Yes':'No',Active:p.is_active?'Yes':'No'})),'Fiscal Positions','fiscal-positions.xlsx')}>
          <Download className="h-4 w-4 mr-1" />Export
        </Button>
        {canManage && <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />New Position</Button>}
      </div>

      {loading ? (
        <PageLoader compact />
      ) : positions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No fiscal positions defined</p>
          <p className="text-sm mt-1">Fiscal positions map taxes and accounts when a vendor or customer is from a different jurisdiction.</p>
          {canManage && <Button size="sm" className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add Fiscal Position</Button>}
        </div>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Auto Apply</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map(fp => (
                <TableRow key={fp.id} data-testid={`row-fp-${fp.id}`}>
                  <TableCell className="font-medium">{fp.name_en}{fp.name_ar&&<div className="text-xs text-muted-foreground" dir="rtl">{fp.name_ar}</div>}</TableCell>
                  <TableCell className="text-sm">{companies.find(c=>c.id===fp.company_id)?.name_en??'—'}</TableCell>
                  <TableCell className="text-sm">{(() => { const ct=countries.find(c=>c.id===fp.country_id); return ct?`${ct.flag_emoji??''} ${ct.name_en}`:'All Countries'; })()}</TableCell>
                  <TableCell>{fp.auto_apply?<Badge variant="default" className="bg-green-100 text-green-700 border-green-200">Auto</Badge>:<span className="text-muted-foreground text-sm">Manual</span>}</TableCell>
                  <TableCell><Badge variant={fp.is_active?'default':'outline'}>{fp.is_active?'Active':'Inactive'}</Badge></TableCell>
                  {canManage && (
                    <TableCell><div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>openEdit(fp)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={()=>setDeleteTarget(fp)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div></TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?'Edit':'New'} Fiscal Position</DialogTitle>
          <DialogDescription>Define tax and account mapping rules for a specific jurisdiction or entity type.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Name (EN) *</Label><Input value={form.name_en} onChange={e=>sf('name_en',e.target.value)} data-testid="input-fp-name" /></div>
              <div className="space-y-1"><Label>Name (AR)</Label><Input value={form.name_ar} onChange={e=>sf('name_ar',e.target.value)} dir="rtl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Company</Label>
                <Select value={form.company_id||'__none'} onValueChange={v=>sf('company_id',v==='__none'?'':v)}>
                  <SelectTrigger><SelectValue placeholder="All companies" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">All companies</SelectItem>{companies.map(c=><SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Country</Label>
                <Select value={form.country_id||'__none'} onValueChange={v=>sf('country_id',v==='__none'?'':v)}>
                  <SelectTrigger><SelectValue placeholder="All countries" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">All countries</SelectItem>{countries.map(c=><SelectItem key={c.id} value={c.id}>{c.flag_emoji} {c.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Textarea value={form.notes} onChange={e=>sf('notes',e.target.value)} rows={2} /></div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2"><Switch checked={form.auto_apply} onCheckedChange={v=>sf('auto_apply',v)} id="fp-auto" /><Label htmlFor="fp-auto">Auto Apply</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v=>sf('is_active',v)} id="fp-active" /><Label htmlFor="fp-active">Active</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-fp">{saving&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}{editing?'Save':'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={o=>{if(!o)setDeleteTarget(null);}}>
        <DialogContent><DialogHeader><DialogTitle>Delete Fiscal Position</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <strong>{deleteTarget?.name_en}</strong>?</p>
          <DialogFooter><Button variant="outline" onClick={()=>setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
