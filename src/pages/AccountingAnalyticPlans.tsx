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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2, RefreshCw, Download, LayoutGrid, Tag } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';

interface AnalyticPlan {
  id: string; name_en: string; name_ar: string | null; code: string | null;
  company_id: string | null; default_applicability: string; color: string;
  sequence: number; is_active: boolean;
}
interface AnalyticAccount {
  id: string; name_en: string; name_ar: string | null; code: string | null;
  plan_id: string; company_id: string | null; balance: number; debit: number;
  credit: number; currency_code: string; is_active: boolean;
}
interface Company { id: string; name_en: string }

const APPLICABILITY = ['optional','mandatory','unavailable'];
const COLORS = ['#6366f1','#0284c7','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#db2777'];

const BLANK_PLAN: Omit<AnalyticPlan,'id'> = {
  name_en:'', name_ar:null, code:null, company_id:null,
  default_applicability:'optional', color:'#6366f1', sequence:10, is_active:true,
};
const BLANK_ACCOUNT = { name_en:'', name_ar:'', code:'', plan_id:'', company_id:'', currency_code:'USD', is_active:true };

export default function AccountingAnalyticPlans() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const { toast } = useToast();
  const canManage = hasAnyRole(['super_admin','admin','financialAdmin']);
  const allowed   = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [plans, setPlans]         = useState<AnalyticPlan[]>([]);
  const [accounts, setAccounts]   = useState<AnalyticAccount[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<'plans'|'accounts'>('plans');
  const [selectedPlan, setSelectedPlan] = useState<string>('all');

  // Plan dialog
  const [planOpen, setPlanOpen]   = useState(false);
  const [editingPlan, setEditingPlan] = useState<AnalyticPlan | null>(null);
  const [planForm, setPlanForm]   = useState({ ...BLANK_PLAN });
  const [savingPlan, setSavingPlan] = useState(false);

  // Account dialog
  const [accOpen, setAccOpen]     = useState(false);
  const [editingAcc, setEditingAcc] = useState<AnalyticAccount | null>(null);
  const [accForm, setAccForm]     = useState({ ...BLANK_ACCOUNT });
  const [savingAcc, setSavingAcc] = useState(false);

  const load = async () => {
    setLoading(true);
    const [pRes, aRes, cRes] = await Promise.all([
      supabase.from('acct_analytic_plans' as any).select('*').order('sequence').order('name_en'),
      supabase.from('acct_analytic_accounts' as any).select('*').order('name_en'),
      supabase.from('companies' as any).select('id,name_en').eq('is_active',true).order('name_en'),
    ]);
    setPlans((pRes.data??[]) as AnalyticPlan[]);
    setAccounts((aRes.data??[]) as AnalyticAccount[]);
    setCompanies((cRes.data??[]) as Company[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const sp = (k: keyof typeof BLANK_PLAN, v: any) => setPlanForm(p=>({...p,[k]:v}));
  const sa = (k: keyof typeof BLANK_ACCOUNT, v: any) => setAccForm(p=>({...p,[k]:v}));

  const openNewPlan = () => { setEditingPlan(null); setPlanForm({...BLANK_PLAN}); setPlanOpen(true); };
  const openEditPlan = (pl: AnalyticPlan) => {
    setEditingPlan(pl);
    setPlanForm({ name_en:pl.name_en, name_ar:pl.name_ar, code:pl.code, company_id:pl.company_id, default_applicability:pl.default_applicability, color:pl.color, sequence:pl.sequence, is_active:pl.is_active });
    setPlanOpen(true);
  };
  const openNewAcc = () => { setEditingAcc(null); setAccForm({...BLANK_ACCOUNT, plan_id: selectedPlan !== 'all' ? selectedPlan : (plans[0]?.id??'')}); setAccOpen(true); };
  const openEditAcc = (a: AnalyticAccount) => {
    setEditingAcc(a);
    setAccForm({ name_en:a.name_en, name_ar:a.name_ar??'', code:a.code??'', plan_id:a.plan_id, company_id:a.company_id??'', currency_code:a.currency_code, is_active:a.is_active });
    setAccOpen(true);
  };

  const savePlan = async () => {
    if (!planForm.name_en.trim()) { toast({title:'Name required',variant:'destructive'}); return; }
    setSavingPlan(true);
    const payload = { ...planForm, name_en:planForm.name_en.trim(), company_id:planForm.company_id||null, code:planForm.code||null, created_by:currentUser?.id };
    const { error } = editingPlan
      ? await supabase.from('acct_analytic_plans' as any).update(payload).eq('id',editingPlan.id)
      : await supabase.from('acct_analytic_plans' as any).insert(payload);
    if (error) toast({title:'Error',description:error.message,variant:'destructive'});
    else { toast({title:'Saved'}); setPlanOpen(false); void load(); }
    setSavingPlan(false);
  };

  const saveAcc = async () => {
    if (!accForm.name_en.trim() || !accForm.plan_id) { toast({title:'Name and Plan required',variant:'destructive'}); return; }
    setSavingAcc(true);
    const payload = { name_en:accForm.name_en.trim(), name_ar:accForm.name_ar||null, code:accForm.code||null, plan_id:accForm.plan_id, company_id:accForm.company_id||null, currency_code:accForm.currency_code, is_active:accForm.is_active, created_by:currentUser?.id };
    const { error } = editingAcc
      ? await supabase.from('acct_analytic_accounts' as any).update(payload).eq('id',editingAcc.id)
      : await supabase.from('acct_analytic_accounts' as any).insert(payload);
    if (error) toast({title:'Error',description:error.message,variant:'destructive'});
    else { toast({title:'Saved'}); setAccOpen(false); void load(); }
    setSavingAcc(false);
  };

  const filteredAccounts = selectedPlan === 'all' ? accounts : accounts.filter(a => a.plan_id === selectedPlan);
  const getPlanName = (id: string) => plans.find(p=>p.id===id)?.name_en ?? '—';

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <LayoutGrid className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Analytic Plans & Accounts</h2>
        <div className="flex gap-1 ml-2 border rounded-md overflow-hidden">
          {(['plans','accounts'] as const).map(t => (
            <button key={t} onClick={()=>setActiveTab(t)} className={`px-3 py-1 text-xs font-medium transition-colors ${activeTab===t?'bg-primary text-primary-foreground':'hover:bg-muted'}`}>
              {t==='plans'?`Plans (${plans.length})`:`Accounts (${accounts.length})`}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {activeTab === 'accounts' && (
          <Select value={selectedPlan} onValueChange={setSelectedPlan}>
            <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All Plans" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              {plans.map(p=><SelectItem key={p.id} value={p.id}><span style={{color:p.color}}>●</span> {p.name_en}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        {canManage && (
          <Button size="sm" onClick={activeTab==='plans'?openNewPlan:openNewAcc}>
            <Plus className="h-4 w-4 mr-1" />New {activeTab==='plans'?'Plan':'Account'}
          </Button>
        )}
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : activeTab === 'plans' ? (
        plans.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
            <LayoutGrid className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>No analytic plans yet</p>
            {canManage && <Button size="sm" className="mt-4" onClick={openNewPlan}><Plus className="h-4 w-4 mr-1" />Add Plan</Button>}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {plans.map(pl => (
              <Card key={pl.id} className="overflow-hidden" style={{borderTopColor:pl.color,borderTopWidth:3}}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{pl.name_en}</div>
                      {pl.code && <div className="text-xs text-muted-foreground font-mono">{pl.code}</div>}
                    </div>
                    {canManage && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={()=>openEditPlan(pl)}><Pencil className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{pl.default_applicability}</Badge>
                    <Badge variant={pl.is_active?'default':'outline'} className="text-[10px]">{pl.is_active?'Active':'Inactive'}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{accounts.filter(a=>a.plan_id===pl.id).length} accounts</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        filteredAccounts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
            <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>No analytic accounts</p>
            {canManage && <Button size="sm" className="mt-4" onClick={openNewAcc}><Plus className="h-4 w-4 mr-1" />Add Account</Button>}
          </div>
        ) : (
          <Card><CardContent className="p-0"><Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Plan</TableHead>
              <TableHead className="text-right">Balance</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>
              <TableHead>Status</TableHead>{canManage&&<TableHead className="w-16"/>}
            </TableRow></TableHeader>
            <TableBody>
              {filteredAccounts.map(a=>(
                <TableRow key={a.id} data-testid={`row-analytic-${a.id}`}>
                  <TableCell className="font-mono text-xs">{a.code??'—'}</TableCell>
                  <TableCell className="font-medium">{a.name_en}</TableCell>
                  <TableCell>
                    <span className="text-xs" style={{color:plans.find(p=>p.id===a.plan_id)?.color}}>●</span>{' '}{getPlanName(a.plan_id)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums text-sm font-medium ${(a.balance??0)>=0?'text-emerald-700':'text-red-700'}`}>{(a.balance??0).toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{(a.debit??0).toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{(a.credit??0).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={a.is_active?'default':'outline'} className="text-xs">{a.is_active?'Active':'Inactive'}</Badge></TableCell>
                  {canManage&&<TableCell><Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>openEditAcc(a)}><Pencil className="h-3.5 w-3.5"/></Button></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table></CardContent></Card>
        )
      )}

      {/* Plan dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingPlan?'Edit':'New'} Analytic Plan</DialogTitle><DialogDescription>Analytic plans organize analytic accounts into logical groups.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Name *</Label><Input value={planForm.name_en} onChange={e=>sp('name_en',e.target.value)} /></div>
              <div className="space-y-1"><Label>Code</Label><Input value={planForm.code??''} onChange={e=>sp('code',e.target.value||null)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Default Applicability</Label>
                <Select value={planForm.default_applicability} onValueChange={v=>sp('default_applicability',v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{APPLICABILITY.map(a=><SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Sequence</Label><Input type="number" value={planForm.sequence} onChange={e=>sp('sequence',Number(e.target.value))} /></div>
            </div>
            <div className="space-y-1"><Label>Color</Label>
              <div className="flex gap-2 flex-wrap">{COLORS.map(c=><button key={c} onClick={()=>sp('color',c)} className={`w-7 h-7 rounded-full transition-all ${planForm.color===c?'ring-2 ring-offset-2 ring-foreground scale-110':''}`} style={{backgroundColor:c}} />)}</div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={planForm.is_active} onCheckedChange={v=>sp('is_active',v)} id="plan-active" /><Label htmlFor="plan-active">Active</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setPlanOpen(false)}>Cancel</Button>
            <Button onClick={savePlan} disabled={savingPlan}>{savingPlan&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account dialog */}
      <Dialog open={accOpen} onOpenChange={setAccOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingAcc?'Edit':'New'} Analytic Account</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Plan *</Label>
              <Select value={accForm.plan_id} onValueChange={v=>sa('plan_id',v)}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>{plans.map(p=><SelectItem key={p.id} value={p.id}>{p.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Code</Label><Input value={accForm.code} onChange={e=>sa('code',e.target.value)} /></div>
              <div className="space-y-1"><Label>Name *</Label><Input value={accForm.name_en} onChange={e=>sa('name_en',e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Currency</Label>
                <Select value={accForm.currency_code} onValueChange={v=>sa('currency_code',v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['USD','SDG','EUR','GBP','SAR','AED','EGP'].map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2"><Switch checked={accForm.is_active} onCheckedChange={v=>sa('is_active',v)} id="acc-active" /><Label htmlFor="acc-active">Active</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setAccOpen(false)}>Cancel</Button>
            <Button onClick={saveAcc} disabled={savingAcc}>{savingAcc&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
