import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, RefreshCw, Download, Clock4, ArrowRight } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { formatNumber } from '@/lib/accountingFormat';
import { differenceInMonths, format, parseISO, eachMonthOfInterval } from 'date-fns';

interface DeferredItem {
  id: string; name: string; deferred_type: string; original_amount: number;
  remaining_amount: number; currency: string; start_date: string; end_date: string;
  recognition_method: string; status: string; description: string | null; created_at: string;
}

const STATUS_STYLES: Record<string,string> = {
  active:'bg-emerald-100 text-emerald-700', closed:'bg-slate-100 text-slate-500', paused:'bg-amber-100 text-amber-700',
};
const BLANK = {
  name:'', deferred_type:'expense', original_amount:'', currency:'USD',
  start_date: new Date().toISOString().slice(0,10),
  end_date: new Date(new Date().setMonth(new Date().getMonth()+11)).toISOString().slice(0,10),
  recognition_method:'straight_line', description:'',
};

export default function AccountingDeferredItems() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const { toast } = useToast();
  const canManage = hasAnyRole(['super_admin','admin','financialAdmin','finance']);
  const allowed   = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [items, setItems]       = useState<DeferredItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [typeFilter, setTypeFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState<DeferredItem | null>(null);
  const [form, setForm]         = useState({ ...BLANK });
  const [saving, setSaving]     = useState(false);
  const [selected, setSelected] = useState<DeferredItem | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('acct_deferred_items' as any).select('*').order('created_at',{ascending:false}).limit(500);
    setItems((data??[]) as DeferredItem[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const sf = (k: keyof typeof BLANK, v: string) => setForm(p=>({...p,[k]:v}));

  const openNew = () => { setEditing(null); setForm({...BLANK}); setFormOpen(true); };
  const openEdit = (d: DeferredItem) => {
    setEditing(d);
    setForm({ name:d.name, deferred_type:d.deferred_type, original_amount:String(d.original_amount), currency:d.currency, start_date:d.start_date, end_date:d.end_date, recognition_method:d.recognition_method, description:d.description??'' });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.original_amount) { toast({title:'Name and amount required',variant:'destructive'}); return; }
    setSaving(true);
    const amount = Number(form.original_amount);
    const payload = { name:form.name.trim(), deferred_type:form.deferred_type, original_amount:amount, remaining_amount:editing?.remaining_amount??amount, currency:form.currency, start_date:form.start_date, end_date:form.end_date, recognition_method:form.recognition_method, description:form.description||null, status:'active', created_by:currentUser?.id };
    const { error } = editing
      ? await supabase.from('acct_deferred_items' as any).update(payload).eq('id',editing.id)
      : await supabase.from('acct_deferred_items' as any).insert(payload);
    if (error) toast({title:'Failed',description:error.message,variant:'destructive'});
    else { toast({title: editing?'Updated':'Created'}); setFormOpen(false); void load(); }
    setSaving(false);
  };

  const buildSchedule = (item: DeferredItem) => {
    const months = eachMonthOfInterval({ start: parseISO(item.start_date), end: parseISO(item.end_date) });
    const monthlyAmount = months.length > 0 ? item.original_amount / months.length : 0;
    let remaining = item.original_amount;
    return months.map(m => {
      const recognized = Math.min(monthlyAmount, remaining);
      remaining -= recognized;
      return { period: format(m,'MMM yyyy'), recognized, remaining: Math.max(0,remaining) };
    });
  };

  const filtered = useMemo(() => items.filter(i => {
    if (typeFilter !== 'all' && i.deferred_type !== typeFilter) return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    return true;
  }), [items, typeFilter, statusFilter]);

  const totals = useMemo(() => ({
    original: filtered.reduce((s,i)=>s+i.original_amount,0),
    remaining: filtered.reduce((s,i)=>s+i.remaining_amount,0),
    recognized: filtered.reduce((s,i)=>s+(i.original_amount-i.remaining_amount),0),
  }), [filtered]);

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <Clock4 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Deferred Revenue & Expense</h2>
        <div className="flex-1" />
        <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem><SelectItem value="expense">Deferred Expense</SelectItem><SelectItem value="revenue">Deferred Revenue</SelectItem></SelectContent></Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Paused</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={()=>exportToExcel(filtered.map(i=>({Name:i.name,Type:i.deferred_type,Original:i.original_amount,Remaining:i.remaining_amount,Recognized:i.original_amount-i.remaining_amount,Currency:i.currency,'Start':i.start_date,'End':i.end_date,Status:i.status})),'Deferred Items','deferred-items.xlsx')}><Download className="h-4 w-4 mr-1"/>Export</Button>
        {canManage && <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />New</Button>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{label:'Total Original Amount',val:totals.original,cls:''},{label:'Recognized to Date',val:totals.recognized,cls:'text-emerald-700'},{label:'Remaining Unrecognized',val:totals.remaining,cls:'text-amber-700'}].map(k=>(
          <Card key={k.label}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{k.label}</p><p className={`text-base font-bold mt-0.5 ${k.cls}`}>{formatNumber(k.val)}</p></CardContent></Card>
        ))}
      </div>

      {loading ? <PageLoader compact /> :
      filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <Clock4 className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>No deferred items</p>
          <p className="text-sm mt-1">Deferred items spread recognition of revenue or expense across multiple periods.</p>
          {canManage && <Button size="sm" className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-1"/>Add Item</Button>}
        </div>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Type</TableHead>
              <TableHead className="text-right">Original</TableHead><TableHead className="text-right">Recognized</TableHead><TableHead className="text-right">Remaining</TableHead>
              <TableHead>Period</TableHead><TableHead>Status</TableHead>
              {canManage && <TableHead className="w-20"/>}
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(item => {
                const recognized = item.original_amount - item.remaining_amount;
                const pct = item.original_amount > 0 ? (recognized/item.original_amount*100).toFixed(0) : '0';
                return (
                  <TableRow key={item.id} className="cursor-pointer hover:bg-muted/30" onClick={()=>setSelected(selected?.id===item.id?null:item)} data-testid={`row-deferred-${item.id}`}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{item.deferred_type}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(item.original_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700">{formatNumber(recognized)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700">{formatNumber(item.remaining_amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{item.start_date} → {item.end_date}</TableCell>
                    <TableCell><Badge className={`text-xs ${STATUS_STYLES[item.status]??''}`}>{item.status} ({pct}%)</Badge></TableCell>
                    {canManage && <TableCell onClick={e=>e.stopPropagation()}><Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>openEdit(item)}><Pencil className="h-3.5 w-3.5"/></Button></TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {selected && (
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="h-4 w-4 text-indigo-600" />
              <h3 className="font-medium text-sm">Recognition Schedule — {selected.name}</h3>
            </div>
            <div className="overflow-x-auto">
              <Table><TableHeader><TableRow className="text-xs">
                <TableHead>Period</TableHead><TableHead className="text-right">Recognized</TableHead><TableHead className="text-right">Remaining Balance</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {buildSchedule(selected).map((l,i)=>(
                  <TableRow key={l.period} className={`text-xs ${i%2!==0?'bg-muted/10':''}`}>
                    <TableCell className="py-1">{l.period}</TableCell>
                    <TableCell className="py-1 text-right tabular-nums text-emerald-700">{formatNumber(l.recognized)}</TableCell>
                    <TableCell className="py-1 text-right tabular-nums text-muted-foreground">{formatNumber(l.remaining)}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?'Edit':'New'} Deferred Item</DialogTitle><DialogDescription>Spread revenue or expense recognition across multiple accounting periods.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1"><Label>Name *</Label><Input value={form.name} onChange={e=>sf('name',e.target.value)} /></div>
            <div className="space-y-1"><Label>Type *</Label><Select value={form.deferred_type} onValueChange={v=>sf('deferred_type',v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Deferred Expense</SelectItem><SelectItem value="revenue">Deferred Revenue</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Recognition Method</Label><Select value={form.recognition_method} onValueChange={v=>sf('recognition_method',v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="straight_line">Straight Line</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Original Amount *</Label><Input type="number" value={form.original_amount} onChange={e=>sf('original_amount',e.target.value)} /></div>
            <div className="space-y-1"><Label>Currency</Label><Select value={form.currency} onValueChange={v=>sf('currency',v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['USD','SDG','EUR','GBP','SAR','AED'].map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e=>sf('start_date',e.target.value)} /></div>
            <div className="space-y-1"><Label>End Date</Label><Input type="date" value={form.end_date} onChange={e=>sf('end_date',e.target.value)} /></div>
            <div className="col-span-2 space-y-1"><Label>Description</Label><Input value={form.description} onChange={e=>sf('description',e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-deferred">{saving&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}{editing?'Save':'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
