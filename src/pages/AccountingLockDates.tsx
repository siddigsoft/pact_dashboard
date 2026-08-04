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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Lock, Unlock, RefreshCw, AlertTriangle, Shield } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Company { id: string; name_en: string }
interface LockDate {
  id: string; company_id: string | null; lock_type: string; lock_date: string;
  description: string | null; locked_by: string | null; locked_at: string;
  unlocked_at: string | null; is_active: boolean;
}

const LOCK_TYPES = [
  { value:'all',  label:'All Users Lock',  desc:'Prevents all users from posting before this date.' },
  { value:'tax',  label:'Tax Lock Date',   desc:'Locks tax entries only — accounting entries remain open.' },
  { value:'hard', label:'Hard Lock',       desc:'Prevents even administrators from modifying past entries.' },
];

const BLANK = { company_id:'', lock_type:'all', lock_date:new Date().toISOString().slice(0,10), description:'' };

export default function AccountingLockDates() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const { toast } = useToast();
  const canManage = hasAnyRole(['super_admin','admin','financialAdmin']);
  const allowed   = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [locks, setLocks]         = useState<LockDate[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading]     = useState(true);
  const [formOpen, setFormOpen]   = useState(false);
  const [form, setForm]           = useState({ ...BLANK });
  const [saving, setSaving]       = useState(false);
  const [unlocking, setUnlocking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [lRes, cRes] = await Promise.all([
      supabase.from('acct_lock_dates' as any).select('*').order('lock_date', { ascending: false }),
      supabase.from('companies' as any).select('id,name_en').eq('is_active',true).order('name_en'),
    ]);
    setLocks((lRes.data??[]) as LockDate[]);
    setCompanies((cRes.data??[]) as Company[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const sf = (k: keyof typeof BLANK, v: string) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    if (!form.lock_date) { toast({title:'Lock date required',variant:'destructive'}); return; }
    setSaving(true);
    const payload = {
      company_id: form.company_id || null, lock_type: form.lock_type, lock_date: form.lock_date,
      description: form.description || null, locked_by: currentUser?.id, is_active: true,
    };
    const { error } = await supabase.from('acct_lock_dates' as any).insert(payload);
    if (error) toast({title:'Failed',description:error.message,variant:'destructive'});
    else { toast({title:'Lock date set ✓', description:`All postings before ${form.lock_date} are now locked.`}); setFormOpen(false); void load(); }
    setSaving(false);
  };

  const handleUnlock = async (lock: LockDate) => {
    if (!window.confirm(`Remove lock date ${lock.lock_date}? This will allow posting to previously locked periods.`)) return;
    setUnlocking(lock.id);
    await supabase.from('acct_lock_dates' as any).update({ is_active:false, unlocked_by:currentUser?.id, unlocked_at:new Date().toISOString() }).eq('id',lock.id);
    toast({title:'Lock removed'}); void load();
    setUnlocking(null);
  };

  const activeLocks = locks.filter(l => l.is_active);
  const getCompany  = (id: string | null) => companies.find(c=>c.id===id)?.name_en ?? 'All Companies';

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <Lock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Lock Dates</h2>
        <p className="text-xs text-muted-foreground">Prevent posting to closed accounting periods</p>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        {canManage && <Button size="sm" onClick={()=>{ setForm({...BLANK}); setFormOpen(true); }}><Plus className="h-4 w-4 mr-1" />Set Lock Date</Button>}
      </div>

      {activeLocks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeLocks.map(l => (
            <div key={l.id} className="flex items-center gap-2 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-sm">
              <Shield className="h-4 w-4 text-amber-600" />
              <div>
                <span className="font-medium text-amber-800">{LOCK_TYPES.find(t=>t.value===l.lock_type)?.label}</span>
                <span className="text-amber-700 mx-2">→</span>
                <span className="font-mono text-amber-800">{l.lock_date}</span>
                <span className="text-amber-600 ml-2 text-xs">({getCompany(l.company_id)})</span>
              </div>
              {canManage && (
                <Button size="icon" variant="ghost" className="h-6 w-6 text-amber-600 hover:text-amber-800 ml-1" onClick={()=>handleUnlock(l)} disabled={unlocking===l.id}>
                  {unlocking===l.id?<Loader2 className="h-3 w-3 animate-spin"/>:<Unlock className="h-3 w-3"/>}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <PageLoader compact />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lock Type</TableHead>
                <TableHead>Lock Date</TableHead>
                <TableHead>Company Scope</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Set On</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {locks.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  <Lock className="h-6 w-6 mx-auto mb-2 opacity-30" />No lock dates configured
                </TableCell></TableRow>
              ) : locks.map(l => (
                <TableRow key={l.id} className={l.is_active?'':'opacity-50'} data-testid={`row-lock-${l.id}`}>
                  <TableCell>
                    <Badge variant={l.lock_type==='hard'?'destructive':l.lock_type==='tax'?'outline':'secondary'} className="text-xs">
                      {LOCK_TYPES.find(t=>t.value===l.lock_type)?.label??l.lock_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono font-medium">{l.lock_date}</TableCell>
                  <TableCell className="text-sm">{getCompany(l.company_id)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{l.description??'—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.locked_at ? format(parseISO(l.locked_at),'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={l.is_active?'default':'outline'} className={l.is_active?'bg-red-100 text-red-700 border-red-200':''}>
                      {l.is_active?'🔒 Active':'Unlocked'}
                    </Badge>
                  </TableCell>
                  {canManage && <TableCell>
                    {l.is_active && (
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={()=>handleUnlock(l)} disabled={unlocking===l.id}>
                        {unlocking===l.id?<Loader2 className="h-3 w-3 animate-spin mr-1"/>:<Unlock className="h-3 w-3 mr-1"/>}Unlock
                      </Button>
                    )}
                  </TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Lock Date</DialogTitle>
            <DialogDescription>Lock dates prevent posting or editing entries before the specified date. This is irreversible without explicit unlock.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2 p-3 border border-amber-200 bg-amber-50 rounded-lg text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Setting a lock date immediately prevents any user from posting journal entries before that date. Only administrators can unlock it.</span>
            </div>
            <div className="space-y-1"><Label>Lock Type *</Label>
              <Select value={form.lock_type} onValueChange={v=>sf('lock_type',v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LOCK_TYPES.map(t=><SelectItem key={t.value} value={t.value}><div><div className="font-medium">{t.label}</div><div className="text-xs text-muted-foreground">{t.desc}</div></div></SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Lock Date (no posting before this date) *</Label>
              <Input type="date" value={form.lock_date} onChange={e=>sf('lock_date',e.target.value)} data-testid="input-lock-date" />
            </div>
            <div className="space-y-1"><Label>Company Scope</Label>
              <Select value={form.company_id||'__all'} onValueChange={v=>sf('company_id',v==='__all'?'':v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All Companies</SelectItem>
                  {companies.map(c=><SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Description / Reason</Label>
              <Input value={form.description} onChange={e=>sf('description',e.target.value)} placeholder="e.g. Year-end close 2025" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-amber-600 hover:bg-amber-700" data-testid="button-save-lock">
              {saving&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}<Lock className="h-4 w-4 mr-2" />Set Lock Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
