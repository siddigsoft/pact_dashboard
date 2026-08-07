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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  HeartPulse, Plus, Loader2, Edit2, Trash2, Users, UserPlus, FileDown,
  CheckCircle2, XCircle, CalendarRange, AlertTriangle, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { exportMultiSheetExcel } from '@/utils/report-export';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { PageLoader } from '@/components/ui/page-loader';

interface Plan {
  id: string; name: string;
  plan_type: 'health_insurance' | 'pension' | 'social_security' | 'life_insurance' | 'other';
  plan_tier: 'basic' | 'standard' | 'premium';
  coverage_type: 'individual' | 'family' | 'individual_plus_one';
  provider: string | null; employer_cost: number; employee_cost: number;
  currency: string; is_active: boolean; notes: string | null; max_dependents: number;
}
interface Enrollment {
  id: string; plan_id: string; user_id: string;
  status: 'pending' | 'active' | 'terminated';
  dependents_count: number; dependents_json: any[];
  enrolled_at: string; terminated_at: string | null;
  effective_date: string | null; approved_by: string | null; approved_at: string | null;
  hub_id: string | null; enrollment_period_id: string | null; notes: string | null;
}
interface Profile { id: string; full_name: string; department_id?: string | null; hub_id?: string | null; }
interface Dept { id: string; name: string; }
interface Hub { id: string; name: string; }
interface EnrollmentPeriod {
  id: string; title: string; description: string | null;
  starts_at: string; ends_at: string;
  eligible_plan_ids: string[]; is_active: boolean; created_at: string;
}

const PLAN_TYPE_LABEL: Record<Plan['plan_type'], string> = {
  health_insurance: 'Health Insurance', pension: 'Pension',
  social_security: 'Social Security', life_insurance: 'Life Insurance', other: 'Other',
};
const TIER_COLORS: Record<Plan['plan_tier'], string> = {
  basic: 'bg-gray-100 text-gray-700', standard: 'bg-blue-100 text-blue-700', premium: 'bg-amber-100 text-amber-700',
};

const BLANK_PLAN = {
  name: '', plan_type: 'health_insurance' as Plan['plan_type'],
  plan_tier: 'standard' as Plan['plan_tier'], coverage_type: 'individual' as Plan['coverage_type'],
  provider: '', employer_cost: '', employee_cost: '', currency: 'SDG',
  is_active: true, notes: '', max_dependents: '4',
};
const BLANK_ENROLL = {
  plan_id: '', user_id: '', dependents_count: '0', notes: '', effective_date: '', hub_id: '',
};
const BLANK_PERIOD = {
  title: '', description: '', starts_at: '', ends_at: '', eligible_plan_ids: [] as string[], is_active: true,
};

export default function BenefitsAdministration() {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const isAdmin = hasAnyRole(['super_admin', 'superAdmin', 'SuperAdmin', 'admin', 'Admin', 'hr', 'hr_manager']);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [periods, setPeriods] = useState<EnrollmentPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missingTable, setMissingTable] = useState(false);

  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState({ ...BLANK_PLAN });

  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ ...BLANK_ENROLL });

  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<EnrollmentPeriod | null>(null);
  const [periodForm, setPeriodForm] = useState({ ...BLANK_PERIOD });

  const [selfEnrollPlanId, setSelfEnrollPlanId] = useState<string | null>(null);
  const [selfNotes, setSelfNotes] = useState('');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [planRes, enrollRes, profRes, deptRes, hubRes, periodRes] = await Promise.all([
      supabase.from('hr_benefit_plans' as any).select('*').order('name'),
      supabase.from('hr_benefit_enrollments' as any).select('*').order('enrolled_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, department_id, hub_id').order('full_name'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('hubs').select('id, name').order('name'),
      supabase.from('hr_open_enrollment_periods' as any).select('*').order('starts_at', { ascending: false }),
    ]);
    if (planRes.error?.code === '42P01') { setMissingTable(true); setLoading(false); return; }
    if (planRes.data) setPlans(planRes.data as unknown as Plan[]);
    if (enrollRes.data) setEnrollments(enrollRes.data as unknown as Enrollment[]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    if (deptRes.data) setDepts(deptRes.data as Dept[]);
    if (hubRes.data) setHubs(hubRes.data as Hub[]);
    if (periodRes.data) setPeriods(periodRes.data as unknown as EnrollmentPeriod[]);
    setLoading(false);
  }

  const profileMap = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p.full_name])), [profiles]);
  const deptMap = useMemo(() => Object.fromEntries(depts.map(d => [d.id, d.name])), [depts]);
  const hubMap = useMemo(() => Object.fromEntries(hubs.map(h => [h.id, h.name])), [hubs]);

  const myEnrollments = useMemo(
    () => enrollments.filter(e => e.user_id === currentUser?.id && e.status !== 'terminated'),
    [enrollments, currentUser]
  );
  const pendingEnrollments = useMemo(() => enrollments.filter(e => e.status === 'pending'), [enrollments]);

  const activeOpenPeriods = useMemo(() => {
    const today = new Date();
    return periods.filter(p => {
      if (!p.is_active) return false;
      try {
        return isWithinInterval(today, { start: parseISO(p.starts_at), end: parseISO(p.ends_at) });
      } catch { return false; }
    });
  }, [periods]);

  const enrolledPlanIds = useMemo(
    () => new Set(myEnrollments.map(e => e.plan_id)),
    [myEnrollments]
  );

  // ── Plan CRUD ──────────────────────────────────────────────────────────────
  function openNewPlan() { setEditingPlan(null); setPlanForm({ ...BLANK_PLAN }); setPlanDialogOpen(true); }
  function openEditPlan(p: Plan) {
    setEditingPlan(p);
    setPlanForm({
      name: p.name, plan_type: p.plan_type, plan_tier: p.plan_tier, coverage_type: p.coverage_type,
      provider: p.provider ?? '', employer_cost: String(p.employer_cost), employee_cost: String(p.employee_cost),
      currency: p.currency, is_active: p.is_active, notes: p.notes ?? '', max_dependents: String(p.max_dependents ?? 4),
    });
    setPlanDialogOpen(true);
  }
  async function savePlan() {
    if (!planForm.name.trim()) { toast({ title: 'Plan name is required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload: any = {
      name: planForm.name.trim(), plan_type: planForm.plan_type, plan_tier: planForm.plan_tier,
      coverage_type: planForm.coverage_type, provider: planForm.provider || null,
      employer_cost: parseFloat(planForm.employer_cost) || 0, employee_cost: parseFloat(planForm.employee_cost) || 0,
      currency: planForm.currency || 'SDG', is_active: planForm.is_active, notes: planForm.notes || null,
      max_dependents: parseInt(planForm.max_dependents) || 4,
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
    else { toast({ title: 'Plan deleted' }); fetchAll(); }
  }

  // ── Admin Enrollment CRUD ─────────────────────────────────────────────────
  function openNewEnroll() { setEnrollForm({ ...BLANK_ENROLL }); setEnrollDialogOpen(true); }
  async function saveAdminEnroll() {
    if (!enrollForm.user_id || !enrollForm.plan_id) { toast({ title: 'Select a staff member and plan', variant: 'destructive' }); return; }
    setSaving(true);
    const payload: any = {
      plan_id: enrollForm.plan_id, user_id: enrollForm.user_id, status: 'active',
      dependents_count: parseInt(enrollForm.dependents_count, 10) || 0,
      effective_date: enrollForm.effective_date || null,
      hub_id: enrollForm.hub_id || null, notes: enrollForm.notes || null,
      approved_by: currentUser?.id ?? null, approved_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('hr_benefit_enrollments' as any).upsert(payload, { onConflict: 'plan_id,user_id' });
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Enrollment saved' });
    setEnrollDialogOpen(false);
    const plan = plans.find(p => p.id === enrollForm.plan_id);
    try {
      await NotificationTriggerService.send({
        userId: enrollForm.user_id, title: 'Benefit Enrollment Confirmed',
        message: `You have been enrolled in "${plan?.name ?? 'a benefit'}" plan.`,
        type: 'success', category: 'team', priority: 'normal', link: '/hr?tab=benefits',
      });
    } catch { /* non-fatal */ }
    fetchAll();
  }

  // ── Approve / Reject pending enrollment ──────────────────────────────────
  async function approveEnrollment(e: Enrollment) {
    const { error } = await supabase.from('hr_benefit_enrollments' as any)
      .update({ status: 'active', approved_by: currentUser?.id, approved_at: new Date().toISOString() })
      .eq('id', e.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Enrollment approved' });
    const plan = plans.find(p => p.id === e.plan_id);
    try {
      await NotificationTriggerService.send({
        userId: e.user_id, title: 'Benefit Enrollment Approved',
        message: `Your enrollment request for "${plan?.name}" has been approved.`,
        type: 'success', category: 'team', priority: 'normal', link: '/hr?tab=benefits',
      });
    } catch { /* non-fatal */ }
    fetchAll();
  }
  async function rejectEnrollment(e: Enrollment) {
    if (!confirm('Reject this enrollment request?')) return;
    const { error } = await supabase.from('hr_benefit_enrollments' as any)
      .update({ status: 'terminated', approved_by: currentUser?.id, approved_at: new Date().toISOString() })
      .eq('id', e.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Enrollment rejected' });
    const plan = plans.find(p => p.id === e.plan_id);
    try {
      await NotificationTriggerService.send({
        userId: e.user_id, title: 'Benefit Enrollment Not Approved',
        message: `Your enrollment request for "${plan?.name}" was not approved. Contact HR for details.`,
        type: 'error', category: 'team', priority: 'normal', link: '/hr?tab=benefits',
      });
    } catch { /* non-fatal */ }
    fetchAll();
  }

  // ── Employee Self-Service Enrollment ──────────────────────────────────────
  async function submitSelfEnroll() {
    if (!selfEnrollPlanId || !currentUser?.id) return;
    if (enrolledPlanIds.has(selfEnrollPlanId)) {
      toast({ title: 'Already enrolled in this plan', variant: 'destructive' }); return;
    }
    setSaving(true);
    const period = activeOpenPeriods[0];
    const { error } = await supabase.from('hr_benefit_enrollments' as any).upsert({
      plan_id: selfEnrollPlanId, user_id: currentUser.id, status: 'pending',
      dependents_count: 0, notes: selfNotes || null,
      enrollment_period_id: period?.id ?? null,
    }, { onConflict: 'plan_id,user_id' });
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Enrollment request submitted', description: 'HR will review your request.' });
    setSelfEnrollPlanId(null); setSelfNotes('');
    fetchAll();
  }

  // ── Open Enrollment Periods ───────────────────────────────────────────────
  function openNewPeriod() { setEditingPeriod(null); setPeriodForm({ ...BLANK_PERIOD }); setPeriodDialogOpen(true); }
  function openEditPeriod(p: EnrollmentPeriod) {
    setEditingPeriod(p);
    setPeriodForm({
      title: p.title, description: p.description ?? '',
      starts_at: p.starts_at, ends_at: p.ends_at,
      eligible_plan_ids: p.eligible_plan_ids ?? [], is_active: p.is_active,
    });
    setPeriodDialogOpen(true);
  }
  async function savePeriod() {
    if (!periodForm.title.trim() || !periodForm.starts_at || !periodForm.ends_at) {
      toast({ title: 'Title, start and end dates are required', variant: 'destructive' }); return;
    }
    setSaving(true);
    const payload: any = {
      title: periodForm.title.trim(), description: periodForm.description || null,
      starts_at: periodForm.starts_at, ends_at: periodForm.ends_at,
      eligible_plan_ids: periodForm.eligible_plan_ids, is_active: periodForm.is_active,
    };
    const { error } = editingPeriod
      ? await supabase.from('hr_open_enrollment_periods' as any).update(payload).eq('id', editingPeriod.id)
      : await supabase.from('hr_open_enrollment_periods' as any).insert({ ...payload, created_by: currentUser?.id ?? null });
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Enrollment period saved' }); setPeriodDialogOpen(false); fetchAll(); }
  }
  async function deletePeriod(p: EnrollmentPeriod) {
    if (!confirm(`Delete period "${p.title}"?`)) return;
    const { error } = await supabase.from('hr_open_enrollment_periods' as any).delete().eq('id', p.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Period deleted' }); fetchAll(); }
  }

  // ── Cost Report Export ────────────────────────────────────────────────────
  function handleExport() {
    const activeEnrollments = enrollments.filter(e => e.status === 'active');
    const byPlan = plans.map(pl => {
      const enr = activeEnrollments.filter(e => e.plan_id === pl.id);
      return {
        'Plan Name': pl.name, 'Type': PLAN_TYPE_LABEL[pl.plan_type], 'Tier': pl.plan_tier,
        'Enrolled Count': enr.length,
        'Employer Cost / Person': pl.employer_cost, 'Employee Cost / Person': pl.employee_cost,
        'Total Employer Cost': pl.employer_cost * enr.length,
        'Total Employee Cost': pl.employee_cost * enr.length,
        'Grand Total': (pl.employer_cost + pl.employee_cost) * enr.length,
        'Currency': pl.currency,
      };
    });

    const byDept: Record<string, { employer: number; employee: number; count: number; currency: string }> = {};
    activeEnrollments.forEach(e => {
      const prof = profiles.find(p => p.id === e.user_id);
      const plan = plans.find(p => p.id === e.plan_id);
      if (!prof || !plan) return;
      const dept = deptMap[prof.department_id ?? ''] ?? 'Unassigned';
      if (!byDept[dept]) byDept[dept] = { employer: 0, employee: 0, count: 0, currency: plan.currency };
      byDept[dept].employer += plan.employer_cost;
      byDept[dept].employee += plan.employee_cost;
      byDept[dept].count += 1;
    });
    const byDeptRows = Object.entries(byDept).map(([dept, v]) => ({
      'Department': dept, 'Enrolled Count': v.count,
      'Employer Cost': v.employer, 'Employee Cost': v.employee,
      'Total': v.employer + v.employee, 'Currency': v.currency,
    }));

    const byHub: Record<string, { employer: number; employee: number; count: number; currency: string }> = {};
    activeEnrollments.forEach(e => {
      const prof = profiles.find(p => p.id === e.user_id);
      const plan = plans.find(p => p.id === e.plan_id);
      if (!prof || !plan) return;
      const hub = hubMap[e.hub_id ?? prof.hub_id ?? ''] ?? 'Unassigned';
      if (!byHub[hub]) byHub[hub] = { employer: 0, employee: 0, count: 0, currency: plan.currency };
      byHub[hub].employer += plan.employer_cost;
      byHub[hub].employee += plan.employee_cost;
      byHub[hub].count += 1;
    });
    const byHubRows = Object.entries(byHub).map(([hub, v]) => ({
      'Hub': hub, 'Enrolled Count': v.count,
      'Employer Cost': v.employer, 'Employee Cost': v.employee,
      'Total': v.employer + v.employee, 'Currency': v.currency,
    }));

    exportMultiSheetExcel([
      { sheetName: 'By Plan', data: byPlan },
      { sheetName: 'By Department', data: byDeptRows },
      { sheetName: 'By Hub', data: byHubRows },
    ], `Benefit_Cost_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }

  if (loading) return <PageLoader compact />;

  if (missingTable) {
    return (
      <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="py-10 text-center text-sm text-amber-700 dark:text-amber-400">
          Apply <code className="font-mono text-xs">supabase/migrations/20260720_hr_benefits_succession_pulse_surveys.sql</code> to enable Benefits Administration.
        </CardContent>
      </Card>
    );
  }

  // ── Employee self-service view ─────────────────────────────────────────────
  if (!isAdmin) {
    const openPeriod = activeOpenPeriods[0] ?? null;
    const availablePlans = openPeriod
      ? plans.filter(p => p.is_active && (openPeriod.eligible_plan_ids.length === 0 || openPeriod.eligible_plan_ids.includes(p.id)))
      : [];

    return (
      <div className="space-y-4 max-w-3xl" data-testid="page-benefits-employee">
        {openPeriod && (
          <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10">
            <CardContent className="py-3 px-4 flex items-start gap-3">
              <CalendarRange className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-700">Open Enrollment: {openPeriod.title}</p>
                <p className="text-xs text-emerald-600">
                  {format(parseISO(openPeriod.starts_at), 'MMM d')} – {format(parseISO(openPeriod.ends_at), 'MMM d, yyyy')}
                  {openPeriod.description && ` · ${openPeriod.description}`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><HeartPulse className="h-4 w-4" />My Active Benefits</CardTitle></CardHeader>
          <CardContent>
            {myEnrollments.filter(e => e.status === 'active').length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">You have no active benefit enrollments yet.</p>
            ) : (
              <div className="space-y-2">
                {myEnrollments.filter(e => e.status === 'active').map(e => {
                  const plan = plans.find(p => p.id === e.plan_id);
                  return (
                    <div key={e.id} className="border rounded-lg p-3" data-testid={`row-my-enrollment-${e.id}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">{plan?.name ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">
                            {plan && PLAN_TYPE_LABEL[plan.plan_type]} · {plan?.plan_tier} tier
                          </p>
                        </div>
                        <Badge variant="outline" className="border-emerald-300 text-emerald-700">Active</Badge>
                      </div>
                      {plan && (
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs bg-muted/40 rounded p-2">
                          <div><span className="text-muted-foreground">Employer contribution: </span><strong>{plan.employer_cost.toLocaleString()} {plan.currency}/mo</strong></div>
                          <div><span className="text-muted-foreground">Your contribution: </span><strong>{plan.employee_cost.toLocaleString()} {plan.currency}/mo</strong></div>
                        </div>
                      )}
                      {e.effective_date && <p className="text-xs text-muted-foreground mt-1">Effective: {format(parseISO(e.effective_date), 'PP')}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {myEnrollments.filter(e => e.status === 'pending').length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-amber-700"><AlertTriangle className="h-4 w-4" />Pending Requests</CardTitle></CardHeader>
            <CardContent>
              {myEnrollments.filter(e => e.status === 'pending').map(e => {
                const plan = plans.find(p => p.id === e.plan_id);
                return (
                  <div key={e.id} className="flex items-center justify-between py-1.5">
                    <span className="text-sm">{plan?.name ?? '—'}</span>
                    <Badge variant="outline" className="border-amber-300 text-amber-700">Awaiting HR approval</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {openPeriod && availablePlans.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Enroll in a Plan</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {availablePlans.map(plan => {
                const already = enrolledPlanIds.has(plan.id);
                return (
                  <div key={plan.id} className={cn('border rounded-lg p-3', already && 'opacity-60')} data-testid={`card-enroll-option-${plan.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{plan.name}</p>
                        <p className="text-xs text-muted-foreground">{PLAN_TYPE_LABEL[plan.plan_type]} · {plan.coverage_type.replace(/_/g, ' ')}</p>
                        <p className="text-xs mt-1">
                          <span className="text-muted-foreground">Your cost: </span>
                          <strong>{plan.employee_cost.toLocaleString()} {plan.currency}/mo</strong>
                          <span className="text-muted-foreground ml-2">Employer pays: </span>
                          <strong>{plan.employer_cost.toLocaleString()} {plan.currency}/mo</strong>
                        </p>
                      </div>
                      <Badge className={cn('text-[10px]', TIER_COLORS[plan.plan_tier])}>{plan.plan_tier}</Badge>
                    </div>
                    {!already && (
                      <Button size="sm" variant="outline" className="mt-2"
                        onClick={() => { setSelfEnrollPlanId(plan.id); setSelfNotes(''); }}
                        data-testid={`button-request-enroll-${plan.id}`}>
                        <UserPlus className="h-3.5 w-3.5 mr-1" />Request Enrollment
                      </Button>
                    )}
                    {already && <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" />Already enrolled</p>}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Dialog open={!!selfEnrollPlanId} onOpenChange={v => !v && setSelfEnrollPlanId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Enrollment</DialogTitle>
              <DialogDescription>
                {plans.find(p => p.id === selfEnrollPlanId)?.name} — your request will be reviewed by HR.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={selfNotes} onChange={e => setSelfNotes(e.target.value)} rows={2} placeholder="Any special requests or dependents info…" data-testid="input-self-enroll-notes" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelfEnrollPlanId(null)}>Cancel</Button>
              <Button onClick={submitSelfEnroll} disabled={saving} data-testid="button-submit-self-enroll">
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Submit Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Admin view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4" data-testid="page-benefits-admin">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">Manage benefit plans, enrollments, and open enrollment periods.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} data-testid="button-export-cost-report">
            <FileDown className="h-4 w-4 mr-1" />Cost Report (Excel)
          </Button>
        </div>
      </div>

      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">Benefit Plans ({plans.length})</TabsTrigger>
          <TabsTrigger value="approvals" data-testid="tab-approvals">
            Approval Queue
            {pendingEnrollments.length > 0 && (
              <Badge className="ml-1.5 h-4 px-1 text-[10px] bg-amber-500">{pendingEnrollments.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="periods">Open Enrollment Periods</TabsTrigger>
          <TabsTrigger value="all-enrollments">All Enrollments</TabsTrigger>
        </TabsList>

        {/* ── Plans Tab ── */}
        <TabsContent value="plans" className="space-y-3 pt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewPlan} data-testid="button-new-plan"><Plus className="h-4 w-4 mr-1" />New Plan</Button>
          </div>
          {plans.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No benefit plans yet.</CardContent></Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {plans.map(p => {
                const active = enrollments.filter(e => e.plan_id === p.id && e.status === 'active').length;
                const pending = enrollments.filter(e => e.plan_id === p.id && e.status === 'pending').length;
                return (
                  <Card key={p.id} data-testid={`card-plan-${p.id}`} className={cn(!p.is_active && 'opacity-70')}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm flex items-center gap-1.5">
                            <HeartPulse className="h-3.5 w-3.5 text-rose-500" />{p.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{PLAN_TYPE_LABEL[p.plan_type]}{p.provider ? ` · ${p.provider}` : ''}</p>
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <Badge className={cn('text-[10px]', TIER_COLORS[p.plan_tier])}>{p.plan_tier}</Badge>
                          {!p.is_active && <Badge variant="outline" className="text-[10px] text-gray-500">Inactive</Badge>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs bg-muted/40 rounded p-2">
                        <div><span className="text-muted-foreground">Employer: </span>{p.employer_cost.toLocaleString()} {p.currency}</div>
                        <div><span className="text-muted-foreground">Employee: </span>{p.employee_cost.toLocaleString()} {p.currency}</div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{active} enrolled</span>
                        {pending > 0 && <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />{pending} pending</span>}
                      </div>
                      <div className="flex gap-1 pt-1">
                        <Button size="sm" variant="outline" onClick={() => openEditPlan(p)} data-testid={`button-edit-plan-${p.id}`}><Edit2 className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => deletePlan(p)} data-testid={`button-delete-plan-${p.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="outline" className="ml-auto" onClick={() => { setEnrollForm({ ...BLANK_ENROLL, plan_id: p.id }); setEnrollDialogOpen(true); }} data-testid={`button-enroll-${p.id}`}>
                          <UserPlus className="h-3.5 w-3.5 mr-1" />Enroll Staff
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Approval Queue Tab ── */}
        <TabsContent value="approvals" className="pt-3">
          {pendingEnrollments.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p>No pending enrollment requests.</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {pendingEnrollments.map(e => {
                const plan = plans.find(p => p.id === e.plan_id);
                const staff = profiles.find(p => p.id === e.user_id);
                return (
                  <Card key={e.id} data-testid={`row-pending-${e.id}`}>
                    <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm">{staff?.full_name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          Requesting: <strong>{plan?.name ?? '—'}</strong>
                          {plan && ` (${PLAN_TYPE_LABEL[plan.plan_type]}, ${plan.plan_tier})`}
                          {e.notes && ` · "${e.notes}"`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Submitted: {format(new Date(e.enrolled_at), 'PP')}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300"
                          onClick={() => approveEnrollment(e)} data-testid={`button-approve-${e.id}`}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200"
                          onClick={() => rejectEnrollment(e)} data-testid={`button-reject-${e.id}`}>
                          <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Open Enrollment Periods Tab ── */}
        <TabsContent value="periods" className="space-y-3 pt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewPeriod} data-testid="button-new-period"><Plus className="h-4 w-4 mr-1" />New Period</Button>
          </div>
          {periods.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No open enrollment periods defined.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {periods.map(p => {
                const isCurrentlyOpen = activeOpenPeriods.some(a => a.id === p.id);
                return (
                  <Card key={p.id} data-testid={`card-period-${p.id}`}>
                    <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{p.title}</p>
                          {isCurrentlyOpen && <Badge className="text-[10px] bg-emerald-600">Open Now</Badge>}
                          {!p.is_active && <Badge variant="outline" className="text-[10px] text-gray-500">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          <CalendarRange className="h-3 w-3 inline mr-1" />
                          {format(parseISO(p.starts_at), 'PP')} – {format(parseISO(p.ends_at), 'PP')}
                          {p.eligible_plan_ids.length > 0 && ` · ${p.eligible_plan_ids.length} plan${p.eligible_plan_ids.length !== 1 ? 's' : ''} eligible`}
                        </p>
                        {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditPeriod(p)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => deletePeriod(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── All Enrollments Tab ── */}
        <TabsContent value="all-enrollments" className="pt-3">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Staff</th>
                      <th className="text-left p-3">Plan</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Effective</th>
                      <th className="text-left p-3">Approved By</th>
                      <th className="text-left p-3">Hub / Dept</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-10 text-sm text-muted-foreground">No enrollments yet.</td></tr>
                    )}
                    {enrollments.map(e => {
                      const plan = plans.find(p => p.id === e.plan_id);
                      const prof = profiles.find(p => p.id === e.user_id);
                      const approver = e.approved_by ? profileMap[e.approved_by] : null;
                      return (
                        <tr key={e.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-900/50" data-testid={`row-enrollment-${e.id}`}>
                          <td className="p-3 font-medium">{prof?.full_name ?? '—'}</td>
                          <td className="p-3 text-xs">
                            <div>{plan?.name ?? '—'}</div>
                            {plan && <div className="text-muted-foreground">{PLAN_TYPE_LABEL[plan.plan_type]}</div>}
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className={cn(
                              e.status === 'active' && 'border-emerald-300 text-emerald-700',
                              e.status === 'pending' && 'border-amber-300 text-amber-700',
                              e.status === 'terminated' && 'border-gray-300 text-gray-500',
                            )}>{e.status}</Badge>
                          </td>
                          <td className="p-3 text-xs">{e.effective_date ? format(parseISO(e.effective_date), 'PP') : '—'}</td>
                          <td className="p-3 text-xs">{approver ?? '—'}</td>
                          <td className="p-3 text-xs">
                            {e.hub_id ? <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{hubMap[e.hub_id] ?? '—'}</span> : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Plan Dialog ── */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingPlan ? 'Edit Benefit Plan' : 'New Benefit Plan'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} data-testid="input-plan-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={planForm.plan_type} onValueChange={v => setPlanForm(f => ({ ...f, plan_type: v as Plan['plan_type'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(PLAN_TYPE_LABEL) as Plan['plan_type'][]).map(k => <SelectItem key={k} value={k}>{PLAN_TYPE_LABEL[k]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tier</Label>
                <Select value={planForm.plan_tier} onValueChange={v => setPlanForm(f => ({ ...f, plan_tier: v as Plan['plan_tier'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Coverage Type</Label>
                <Select value={planForm.coverage_type} onValueChange={v => setPlanForm(f => ({ ...f, coverage_type: v as Plan['coverage_type'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="individual_plus_one">Individual + 1</SelectItem>
                    <SelectItem value="family">Family</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Provider</Label><Input value={planForm.provider} onChange={e => setPlanForm(f => ({ ...f, provider: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Employer Cost</Label><Input type="number" min={0} value={planForm.employer_cost} onChange={e => setPlanForm(f => ({ ...f, employer_cost: e.target.value }))} /></div>
              <div><Label>Employee Cost</Label><Input type="number" min={0} value={planForm.employee_cost} onChange={e => setPlanForm(f => ({ ...f, employee_cost: e.target.value }))} /></div>
              <div>
                <Label>Currency</Label>
                <Select value={planForm.currency} onValueChange={v => setPlanForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="SDG">SDG</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Max Dependents</Label><Input type="number" min={0} max={20} value={planForm.max_dependents} onChange={e => setPlanForm(f => ({ ...f, max_dependents: e.target.value }))} /></div>
              <div className="flex items-center gap-3 mt-5">
                <Switch checked={planForm.is_active} onCheckedChange={v => setPlanForm(f => ({ ...f, is_active: v }))} id="plan-active" />
                <Label htmlFor="plan-active">Active</Label>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={planForm.notes} onChange={e => setPlanForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>Cancel</Button>
            <Button onClick={savePlan} disabled={saving} data-testid="button-save-plan">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Admin Enroll Dialog ── */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enroll Staff Member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Plan</Label>
              <Select value={enrollForm.plan_id} onValueChange={v => setEnrollForm(f => ({ ...f, plan_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>{plans.filter(p => p.is_active).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Staff Member</Label>
              <Select value={enrollForm.user_id} onValueChange={v => setEnrollForm(f => ({ ...f, user_id: v }))}>
                <SelectTrigger data-testid="select-enroll-user"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Effective Date</Label><Input type="date" value={enrollForm.effective_date} onChange={e => setEnrollForm(f => ({ ...f, effective_date: e.target.value }))} /></div>
              <div>
                <Label>Hub</Label>
                <Select value={enrollForm.hub_id || 'none'} onValueChange={v => setEnrollForm(f => ({ ...f, hub_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {hubs.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={enrollForm.notes} onChange={e => setEnrollForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveAdminEnroll} disabled={saving} data-testid="button-save-enrollment">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Enroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Open Enrollment Period Dialog ── */}
      <Dialog open={periodDialogOpen} onOpenChange={setPeriodDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingPeriod ? 'Edit Enrollment Period' : 'New Enrollment Period'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={periodForm.title} onChange={e => setPeriodForm(f => ({ ...f, title: e.target.value }))} data-testid="input-period-title" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date *</Label><Input type="date" value={periodForm.starts_at} onChange={e => setPeriodForm(f => ({ ...f, starts_at: e.target.value }))} /></div>
              <div><Label>End Date *</Label><Input type="date" value={periodForm.ends_at} onChange={e => setPeriodForm(f => ({ ...f, ends_at: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Eligible Plans (leave empty for all active plans)</Label>
              <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto border rounded p-2">
                {plans.filter(p => p.is_active).map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox"
                      checked={periodForm.eligible_plan_ids.includes(p.id)}
                      onChange={e => setPeriodForm(f => ({
                        ...f,
                        eligible_plan_ids: e.target.checked
                          ? [...f.eligible_plan_ids, p.id]
                          : f.eligible_plan_ids.filter(id => id !== p.id),
                      }))}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
            <div><Label>Description</Label><Textarea rows={2} value={periodForm.description} onChange={e => setPeriodForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={periodForm.is_active} onCheckedChange={v => setPeriodForm(f => ({ ...f, is_active: v }))} id="period-active" />
              <Label htmlFor="period-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodDialogOpen(false)}>Cancel</Button>
            <Button onClick={savePeriod} disabled={saving} data-testid="button-save-period">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
