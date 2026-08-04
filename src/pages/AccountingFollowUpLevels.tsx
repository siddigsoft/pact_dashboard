import { useEffect, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2, RefreshCw, Bell, Mail, Phone, FileText, ArrowUp, ArrowDown } from 'lucide-react';

interface FollowUpLevel {
  id: string; name_en: string; delay_days: number; action: string;
  description: string | null; email_template: string | null; sequence: number; is_active: boolean;
}

const ACTION_CONFIG: Record<string,{ label:string; icon: React.ElementType; cls:string }> = {
  email:  { label:'Email',      icon:Mail,     cls:'bg-blue-100 text-blue-700' },
  letter: { label:'Letter',     icon:FileText, cls:'bg-purple-100 text-purple-700' },
  phone:  { label:'Phone Call', icon:Phone,    cls:'bg-green-100 text-green-700' },
  manual: { label:'Manual',     icon:Bell,     cls:'bg-amber-100 text-amber-700' },
};

const BLANK = { name_en:'', delay_days:'0', action:'email', description:'', email_template:'', sequence:'10', is_active:true };

export default function AccountingFollowUpLevels() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const { toast } = useToast();
  const canManage = hasAnyRole(['super_admin','admin','financialAdmin']);
  const allowed   = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [levels, setLevels]     = useState<FollowUpLevel[]>([]);
  const [loading, setLoading]   = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState<FollowUpLevel | null>(null);
  const [form, setForm]         = useState({ ...BLANK });
  const [saving, setSaving]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FollowUpLevel | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('acct_follow_up_levels' as any).select('*').order('sequence').order('delay_days');
    setLevels((data??[]) as FollowUpLevel[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const sf = (k: keyof typeof BLANK, v: any) => setForm(p=>({...p,[k]:v}));

  const openNew = () => { setEditing(null); setForm({...BLANK}); setFormOpen(true); };
  const openEdit = (l: FollowUpLevel) => {
    setEditing(l);
    setForm({ name_en:l.name_en, delay_days:String(l.delay_days), action:l.action, description:l.description??'', email_template:l.email_template??'', sequence:String(l.sequence), is_active:l.is_active });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name_en.trim()) { toast({title:'Name required',variant:'destructive'}); return; }
    setSaving(true);
    const payload = { name_en:form.name_en.trim(), delay_days:Number(form.delay_days), action:form.action, description:form.description||null, email_template:form.email_template||null, sequence:Number(form.sequence), is_active:form.is_active, created_by:currentUser?.id };
    const { error } = editing
      ? await supabase.from('acct_follow_up_levels' as any).update(payload).eq('id',editing.id)
      : await supabase.from('acct_follow_up_levels' as any).insert(payload);
    if (error) toast({title:'Failed',description:error.message,variant:'destructive'});
    else { toast({title:'Saved'}); setFormOpen(false); void load(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('acct_follow_up_levels' as any).delete().eq('id',deleteTarget.id);
    toast({title:'Deleted'}); setDeleteTarget(null); void load();
  };

  const moveSeq = async (level: FollowUpLevel, dir: 1|-1) => {
    await supabase.from('acct_follow_up_levels' as any).update({ sequence: level.sequence + dir * 10 }).eq('id', level.id);
    void load();
  };

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Follow-up Levels</h2>
        <p className="text-xs text-muted-foreground">AR dunning — automated reminders for overdue receivables</p>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        {canManage && <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />New Level</Button>}
      </div>

      {loading ? <PageLoader compact /> :
      levels.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No follow-up levels defined</p>
          <p className="text-sm mt-1">Follow-up levels automate dunning (reminders) to customers/partners with overdue payments. Define escalating actions from email to phone calls.</p>
          {canManage && <Button size="sm" className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-1"/>Add Level</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Visual pipeline */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {levels.filter(l=>l.is_active).map((l,i,arr) => {
              const cfg = ACTION_CONFIG[l.action] ?? ACTION_CONFIG.manual;
              return (
                <div key={l.id} className="flex items-center gap-2 shrink-0">
                  <div className={`rounded-lg border px-3 py-2 text-xs ${cfg.cls}`}>
                    <div className="font-bold">Level {i+1}</div>
                    <div>{l.name_en}</div>
                    <div className="opacity-70 mt-0.5">{l.delay_days}d overdue</div>
                  </div>
                  {i < arr.length-1 && <ArrowUp className="h-4 w-4 text-muted-foreground rotate-90" />}
                </div>
              );
            })}
          </div>

          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10">Seq.</TableHead>
                <TableHead>Level Name</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="text-center">Days Overdue</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="w-28"/>}
              </TableRow></TableHeader>
              <TableBody>
                {levels.map((l,i) => {
                  const cfg = ACTION_CONFIG[l.action] ?? ACTION_CONFIG.manual;
                  const Icon = cfg.icon;
                  return (
                    <TableRow key={l.id} className={l.is_active?'':'opacity-50'} data-testid={`row-followup-${l.id}`}>
                      <TableCell className="text-center font-mono text-sm">{l.sequence}</TableCell>
                      <TableCell className="font-medium">{l.name_en}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs gap-1 ${cfg.cls}`}><Icon className="h-3 w-3"/>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono font-bold text-sm">{l.delay_days}</span>
                        <span className="text-xs text-muted-foreground ml-1">days</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{l.description??'—'}</TableCell>
                      <TableCell><Badge variant={l.is_active?'default':'outline'} className="text-xs">{l.is_active?'Active':'Inactive'}</Badge></TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={()=>moveSeq(l,-1)} disabled={i===0}><ArrowUp className="h-3 w-3"/></Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={()=>moveSeq(l,1)} disabled={i===levels.length-1}><ArrowDown className="h-3 w-3"/></Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={()=>openEdit(l)}><Pencil className="h-3 w-3"/></Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={()=>setDeleteTarget(l)}><Trash2 className="h-3 w-3"/></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?'Edit':'New'} Follow-up Level</DialogTitle><DialogDescription>Define when and how to escalate overdue receivable reminders.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Level Name *</Label><Input value={form.name_en} onChange={e=>sf('name_en',e.target.value)} placeholder="e.g. First Reminder" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Days Overdue</Label><Input type="number" min="0" value={form.delay_days} onChange={e=>sf('delay_days',e.target.value)} /></div>
              <div className="space-y-1"><Label>Sequence</Label><Input type="number" value={form.sequence} onChange={e=>sf('sequence',e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Action</Label>
              <Select value={form.action} onValueChange={v=>sf('action',v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_CONFIG).map(([v,c])=>(
                    <SelectItem key={v} value={v}><div className="flex items-center gap-2"><c.icon className="h-4 w-4"/>{c.label}</div></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Description</Label><Input value={form.description} onChange={e=>sf('description',e.target.value)} placeholder="Short note about this level" /></div>
            {form.action === 'email' && <div className="space-y-1"><Label>Email Template Body</Label><Textarea value={form.email_template} onChange={e=>sf('email_template',e.target.value)} rows={3} placeholder="Dear {partner_name}, your invoice {invoice_no} is overdue..." /></div>}
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v=>sf('is_active',v)} id="fl-active"/><Label htmlFor="fl-active">Active</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-followup">{saving&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}{editing?'Save':'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={o=>{if(!o)setDeleteTarget(null);}}>
        <DialogContent><DialogHeader><DialogTitle>Delete Level</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <strong>{deleteTarget?.name_en}</strong>?</p>
          <DialogFooter><Button variant="outline" onClick={()=>setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" onClick={handleDelete}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
