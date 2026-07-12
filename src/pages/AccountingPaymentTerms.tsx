import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2, RefreshCw, CreditCard, X } from 'lucide-react';

interface PaymentTerm {
  id: string; name_en: string; name_ar: string | null; note: string | null;
  is_active: boolean; created_at: string;
  lines?: PaymentTermLine[];
}
interface PaymentTermLine {
  id: string; payment_term_id: string; sequence: number; value_type: string;
  value: number; days: number; days_after: string; discount_pct: number;
}

const BLANK_TERM = { name_en:'', name_ar:'', note:'', is_active:true };
const BLANK_LINE = { sequence:10, value_type:'balance', value:100, days:30, days_after:'invoice_date', discount_pct:0 };

export default function AccountingPaymentTerms() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const { toast } = useToast();
  const canManage = hasAnyRole(['super_admin','admin','financialAdmin']);
  const allowed   = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [terms, setTerms]       = useState<PaymentTerm[]>([]);
  const [loading, setLoading]   = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState<PaymentTerm | null>(null);
  const [form, setForm]         = useState({ ...BLANK_TERM });
  const [lines, setLines]       = useState<Omit<PaymentTermLine,'id'|'payment_term_id'>[]>([{ ...BLANK_LINE }]);
  const [saving, setSaving]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaymentTerm | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('acct_payment_terms' as any).select('*, acct_payment_term_lines(*)').order('name_en');
    setTerms((data??[]) as PaymentTerm[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const sf = (k: keyof typeof BLANK_TERM, v: any) => setForm(p=>({...p,[k]:v}));
  const sl = (i: number, k: string, v: any) => setLines(prev => prev.map((l,idx)=>idx===i?{...l,[k]:v}:l));

  const openNew = () => {
    setEditing(null); setForm({...BLANK_TERM}); setLines([{...BLANK_LINE}]); setFormOpen(true);
  };
  const openEdit = (t: PaymentTerm) => {
    setEditing(t);
    setForm({ name_en:t.name_en, name_ar:t.name_ar??'', note:t.note??'', is_active:t.is_active });
    setLines((t.lines??[]).map(l=>({ sequence:l.sequence, value_type:l.value_type, value:l.value, days:l.days, days_after:l.days_after, discount_pct:l.discount_pct })));
    if (!t.lines?.length) setLines([{...BLANK_LINE}]);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name_en.trim()) { toast({title:'Name required',variant:'destructive'}); return; }
    setSaving(true);
    const payload = { name_en:form.name_en.trim(), name_ar:form.name_ar||null, note:form.note||null, is_active:form.is_active, created_by:currentUser?.id };
    let termId = editing?.id;
    if (editing) {
      await supabase.from('acct_payment_terms' as any).update(payload).eq('id',editing.id);
      await supabase.from('acct_payment_term_lines' as any).delete().eq('payment_term_id',editing.id);
    } else {
      const { data, error } = await supabase.from('acct_payment_terms' as any).insert(payload).select('id').single();
      if (error) { toast({title:'Failed',description:error.message,variant:'destructive'}); setSaving(false); return; }
      termId = (data as any).id;
    }
    if (termId && lines.length) {
      await supabase.from('acct_payment_term_lines' as any).insert(lines.map(l=>({...l,payment_term_id:termId})));
    }
    toast({title: editing?'Updated':'Created'}); setFormOpen(false); void load();
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('acct_payment_terms' as any).delete().eq('id',deleteTarget.id);
    toast({title:'Deleted'}); setDeleteTarget(null); void load();
  };

  const formatLine = (l: Omit<PaymentTermLine,'id'|'payment_term_id'>) => {
    const base = l.value_type === 'percent' ? `${l.value}%` : l.value_type === 'fixed' ? `Fixed ${l.value}` : 'Balance';
    return `${base} due in ${l.days} days (from ${l.days_after.replace(/_/g,' ')})${l.discount_pct>0?` — ${l.discount_pct}% discount`:''}`;
  };

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Payment Terms</h2>
        <Badge variant="outline">{terms.length} terms</Badge>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        {canManage && <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />New Payment Term</Button>}
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> :
      terms.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>No payment terms defined</p>
          <p className="text-sm mt-1">Payment terms control how invoice due dates and discount windows are calculated.</p>
          {canManage && <Button size="sm" className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-1"/>Add Term</Button>}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {terms.map(t => (
            <Card key={t.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="font-medium">{t.name_en}</div>
                  <div className="flex gap-1">
                    <Badge variant={t.is_active?'default':'outline'} className="text-xs">{t.is_active?'Active':'Inactive'}</Badge>
                    {canManage && <>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={()=>openEdit(t)}><Pencil className="h-3 w-3"/></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={()=>setDeleteTarget(t)}><Trash2 className="h-3 w-3"/></Button>
                    </>}
                  </div>
                </div>
                {t.note && <p className="text-xs text-muted-foreground mb-2">{t.note}</p>}
                <div className="space-y-1">
                  {(t.lines??[]).sort((a,b)=>a.sequence-b.sequence).map((l,i) => (
                    <div key={l.id} className="text-xs bg-muted/30 rounded px-2 py-1">
                      {i+1}. {formatLine(l)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?'Edit':'New'} Payment Term</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Name (EN) *</Label><Input value={form.name_en} onChange={e=>sf('name_en',e.target.value)} /></div>
              <div className="space-y-1"><Label>Name (AR)</Label><Input value={form.name_ar} onChange={e=>sf('name_ar',e.target.value)} dir="rtl" /></div>
            </div>
            <div className="space-y-1"><Label>Note</Label><Input value={form.note} onChange={e=>sf('note',e.target.value)} placeholder="e.g. Net 30 days" /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v=>sf('is_active',v)} id="pt-active"/><Label htmlFor="pt-active">Active</Label></div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Payment Lines</Label>
                <Button size="sm" variant="outline" onClick={()=>setLines(p=>[...p,{...BLANK_LINE,sequence:(p.length+1)*10}])} className="h-6 text-xs"><Plus className="h-3 w-3 mr-1"/>Add Line</Button>
              </div>
              <div className="space-y-2">
                {lines.map((l,i) => (
                  <div key={i} className="grid grid-cols-5 gap-2 items-end border rounded-md p-2 bg-muted/20">
                    <div className="col-span-2 space-y-1 text-xs">
                      <Label className="text-xs">Type</Label>
                      <Select value={l.value_type} onValueChange={v=>sl(i,'value_type',v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="percent">Percent %</SelectItem><SelectItem value="fixed">Fixed Amount</SelectItem><SelectItem value="balance">Balance</SelectItem></SelectContent>
                      </Select>
                    </div>
                    {l.value_type !== 'balance' && (
                      <div className="space-y-1"><Label className="text-xs">Value</Label><Input type="number" value={l.value} onChange={e=>sl(i,'value',Number(e.target.value))} className="h-7 text-xs" /></div>
                    )}
                    <div className="space-y-1"><Label className="text-xs">Days</Label><Input type="number" value={l.days} onChange={e=>sl(i,'days',Number(e.target.value))} className="h-7 text-xs" /></div>
                    <div className="space-y-1"><Label className="text-xs">From</Label>
                      <Select value={l.days_after} onValueChange={v=>sl(i,'days_after',v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="invoice_date">Invoice Date</SelectItem><SelectItem value="end_of_month">End of Month</SelectItem><SelectItem value="end_of_next_month">End of Next Month</SelectItem></SelectContent>
                      </Select>
                    </div>
                    {lines.length > 1 && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive self-end" onClick={()=>setLines(p=>p.filter((_,idx)=>idx!==i))}><X className="h-3 w-3"/></Button>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-pt">{saving&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}{editing?'Save':'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={o=>{if(!o)setDeleteTarget(null);}}>
        <DialogContent><DialogHeader><DialogTitle>Delete Payment Term</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <strong>{deleteTarget?.name_en}</strong>?</p>
          <DialogFooter><Button variant="outline" onClick={()=>setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" onClick={handleDelete}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
