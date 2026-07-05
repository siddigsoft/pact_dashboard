import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HeartPulse, Plus, Loader2, Edit2, Trash2, Users, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Plan {
  id: string; name: string; plan_type: 'health_insurance' | 'pension' | 'social_security' | 'life_insurance' | 'other';
  provider: string | null; employer_cost: number; employee_cost: number; currency: string; is_active: boolean; notes: string | null;
}
interface Enrollment {
  id: string; plan_id: string; user_id: string; status: 'pending' | 'active' | 'terminated';
  dependents_count: number; enrolled_at: string; terminated_at: string | null; notes: string | null;
}
interface Profile { id: string; full_name: string; }

const PLAN_TYPE_LABEL: Record<Plan['plan_type'], string> = {
  health_insurance: 'Health Insurance', pension: 'Pension', social_security: 'Social Security', life_insurance: 'Life Insurance', other: 'Other',
};

const BLANK_PLAN = { name: '', plan_type: 'health_insurance' as Plan['plan_type'], provider: '', employer_cost: '', employee_cost: '', currency: 'SDG', is_active: true, notes: '' };
const BLANK_ENROLL = { plan_id: '', user_id: '', status: 'active' as Enrollment['status'], dependents_count: '0', notes: '' };

export default function BenefitsAdministration() {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr', 'hr_manager']);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState({ ...BLANK_PLAN });
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ ...BLANK_ENROLL });
  const [missingTable, setMissingTable] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [planRes, enrollRes, profRes] = await Promise.all([
      supabase.from('hr_benefit_plans' as any).select('*').order('name'),
      supabase.from('hr_benefit_enrollments' as any).select('*').order('enrolled_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    if (planRes.error?.code === '42P01') { setMissingTable(true); setLoading(false); return; }
    if (planRes.data) setPlans(planRes.data as unknown as Plan[]);
    if (enrollRes.data) setEnrollments(enrollRes.data as unknown as Enrollment[]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    setLoading(false);
  }

  const enrollmentsFor = (planId: string) => enrollments.filter(e => e.plan_id === planId);
  const activePlan = plans.find(p => p.id === selectedPlan) ?? null;

  function openNewPlan() { setEditingPlan(null); setPlanForm({ ...BLANK_PLAN }); setPlanDialogOpen(true); }
  function openEditPlan(p: Plan) {
    setEditingPlan(p);
    setPlanForm({ name: p.name, plan_type: p.plan_type, provider: p.provider ?? '', employer_cost: String(p.employer_cost), employee_cost: String(p.employee_cost), currency: p.currency, is_active: p.is_active, notes: p.notes ?? '' });
    setPlanDialogOpen(true);
  }

  async function savePlan() {
    if (!planForm.name.trim()) { toast({ title: 'Plan name is required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload: any = {
      name: planForm.name.trim(), plan_type: planForm.plan_type, provider: planForm.provider || null,
      employer_cost: parseFloat(planForm.employer_cost) || 0, employee_cost: parseFloat(planForm.employee_cost) || 0,
      currency: planForm.currency || 'SDG', is_active: planForm.is_active, notes: planForm.notes || null,
    };
    const { error } = editingPlan
      ? await supabase.from('hr_benefit_plans' as any).update(payload).eq('id', editingPlan.id)
      : await supabase.from('hr_benefit_plans' as any).insert({ ...payload, created_by: currentUser?.id ?? null });
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: editingPlan ? 'Plan updated' : 'Plan created' }); setPlanDialogOpen(false); fetchAll(); }
  }

  async function deletePlan(p: Plan) {
    if (!confirm(`Delete plan "${p.name}"? This removes all enrollments too.`)) return;
    const { error } = await supabase.from('hr_benefit_plans' as any).delete().eq('id', p.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Plan deleted' }); if (selectedPlan === p.id) setSelectedPlan(null); fetchAll(); }
  }

  function openNewEnroll() { setEnrollForm({ ...BLANK_ENROLL, plan_id: selectedPlan ?? '' }); setEnrollDialogOpen(true); }

  async function saveEnroll() {
    if (!enrollForm.user_id || !enrollForm.plan_id) { toast({ title: 'Select a staff member', variant: 'destructive' }); return; }
    setSaving(true);
    const payload: any = {
      plan_id: enrollForm.plan_id, user_id: enrollForm.user_id, status: enrollForm.status,
      dependents_count: parseInt(enrollForm.dependents_count, 10) || 0, notes: enrollForm.notes || null,
    };
    const { error } = await supabase.from('hr_benefit_enrollments' as any).upsert(payload, { onConflict: 'plan_id,user_id' });
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Enrollment saved' }); setEnrollDialogOpen(false); fetchAll(); }
  }

  async function removeEnroll(e: Enrollment) {
    if (!confirm('Remove this enrollment?')) return;
    const { error } = await supabase.from('hr_benefit_enrollments' as any).delete().eq('id', e.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Enrollment removed' }); fetchAll(); }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (missingTable) {
    return (
      <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="py-10 text-center text-sm text-amber-700 dark:text-amber-400">
          Apply <code className="font-mono text-xs">supabase/migrations/20260705_hr_recruitment_disciplinary_benefits_headcount.sql</code> to enable Benefits Administration.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="page-benefits">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage benefit plans and staff enrollments.</p>
        {isAdmin && <Button onClick={openNewPlan} data-testid="button-new-plan"><Plus className="h-4 w-4 mr-1" />New Plan</Button>}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-2">
          {plans.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No benefit plans yet.</p>}
          {plans.map(p => (
            <Card key={p.id} onClick={() => setSelectedPlan(p.id)} data-testid={`card-plan-${p.id}`}
              className={cn('cursor-pointer hover:border-primary/50 transition-colors', selectedPlan === p.id && 'border-primary ring-1 ring-primary/30')}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm flex items-center gap-1"><HeartPulse className="h-3.5 w-3.5" />{p.name}</p>
                    <p className="text-xs text-muted-foreground">{PLAN_TYPE_LABEL[p.plan_type]}{p.provider ? ` · ${p.provider}` : ''}</p>
                  </div>
                  {!p.is_active && <Badge variant="outline" className="text-gray-500">Inactive</Badge>}
                </div>
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />{enrollmentsFor(p.id).filter(e => e.status === 'active').length} enrolled
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="md:col-span-2">
          {!activePlan ? (
            <Card className="h-full"><CardContent className="py-16 text-center text-sm text-muted-foreground">Select a plan to view enrollments.</CardContent></Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{activePlan.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Employer: {activePlan.employer_cost.toLocaleString()} {activePlan.currency} · Employee: {activePlan.employee_cost.toLocaleString()} {activePlan.currency}
                  </p>
                </div>
                <div className="flex gap-2">
                  {isAdmin && <Button size="sm" variant="outline" onClick={() => openEditPlan(activePlan)}><Edit2 className="h-3.5 w-3.5" /></Button>}
                  {isAdmin && <Button size="sm" variant="outline" className="text-red-600" onClick={() => deletePlan(activePlan)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                  {isAdmin && <Button size="sm" onClick={openNewEnroll} data-testid="button-enroll-staff"><UserPlus className="h-3.5 w-3.5 mr-1" />Enroll Staff</Button>}
                </div>
              </CardHeader>
              <CardContent>
                {activePlan.notes && <p className="text-sm text-muted-foreground mb-4">{activePlan.notes}</p>}
                <div className="space-y-2">
                  {enrollmentsFor(activePlan.id).length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No one enrolled yet.</p>}
                  {enrollmentsFor(activePlan.id).map(e => (
                    <div key={e.id} className="border rounded-lg p-3 flex items-center justify-between gap-3" data-testid={`row-enrollment-${e.id}`}>
                      <div>
                        <p className="text-sm font-medium">{profiles.find(p => p.id === e.user_id)?.full_name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{e.dependents_count} dependent{e.dependents_count === 1 ? '' : 's'} · since {e.enrolled_at}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn(e.status === 'active' && 'border-emerald-300 text-emerald-700', e.status === 'pending' && 'border-amber-300 text-amber-700', e.status === 'terminated' && 'border-gray-300 text-gray-500')}>{e.status}</Badge>
                        {isAdmin && <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600" onClick={() => removeEnroll(e)}><Trash2 className="h-3 w-3" /></Button>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingPlan ? 'Edit Plan' : 'New Benefit Plan'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} data-testid="input-plan-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={planForm.plan_type} onValueChange={v => setPlanForm(f => ({ ...f, plan_type: v as Plan['plan_type'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(PLAN_TYPE_LABEL) as Plan['plan_type'][]).map(k => <SelectItem key={k} value={k}>{PLAN_TYPE_LABEL[k]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Provider</Label><Input value={planForm.provider} onChange={e => setPlanForm(f => ({ ...f, provider: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Employer Cost</Label><Input type="number" value={planForm.employer_cost} onChange={e => setPlanForm(f => ({ ...f, employer_cost: e.target.value }))} /></div>
              <div><Label>Employee Cost</Label><Input type="number" value={planForm.employee_cost} onChange={e => setPlanForm(f => ({ ...f, employee_cost: e.target.value }))} /></div>
              <div>
                <Label>Currency</Label>
                <Select value={planForm.currency} onValueChange={v => setPlanForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="SDG">SDG</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <Label className="mb-0">Active</Label>
              <Switch checked={planForm.is_active} onCheckedChange={v => setPlanForm(f => ({ ...f, is_active: v }))} />
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={planForm.notes} onChange={e => setPlanForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={savePlan} disabled={saving} data-testid="button-save-plan">{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enroll Staff Member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Staff Member</Label>
              <Select value={enrollForm.user_id} onValueChange={v => setEnrollForm(f => ({ ...f, user_id: v }))}>
                <SelectTrigger data-testid="select-enroll-user"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={enrollForm.status} onValueChange={v => setEnrollForm(f => ({ ...f, status: v as Enrollment['status'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="terminated">Terminated</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Dependents</Label><Input type="number" min={0} value={enrollForm.dependents_count} onChange={e => setEnrollForm(f => ({ ...f, dependents_count: e.target.value }))} /></div>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={enrollForm.notes} onChange={e => setEnrollForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={saveEnroll} disabled={saving} data-testid="button-save-enrollment">{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
