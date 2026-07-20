import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  HeartPulse, Plus, Loader2, CalendarRange, CheckCircle2, UserPlus, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isWithinInterval, parseISO } from 'date-fns';

interface Plan {
  id: string; name: string; plan_type: string; plan_tier: 'basic' | 'standard' | 'premium';
  coverage_type: string; provider: string | null; employer_cost: number; employee_cost: number;
  currency: string; is_active: boolean; max_dependents: number;
}
interface Enrollment {
  id: string; plan_id: string; user_id: string;
  status: 'pending' | 'active' | 'terminated';
  dependents_count: number; dependents_json: any[];
  enrolled_at: string; effective_date: string | null;
  approved_at: string | null; notes: string | null; enrollment_period_id: string | null;
}
interface EnrollmentPeriod {
  id: string; title: string; description: string | null;
  starts_at: string; ends_at: string; eligible_plan_ids: string[]; is_active: boolean;
}
interface Dependent { id: string; full_name: string; relationship: string; date_of_birth?: string; gender?: string; national_id_no?: string; is_beneficiary?: boolean; }

const PLAN_TYPE_LABEL: Record<string, string> = {
  health_insurance: 'Health Insurance', pension: 'Pension',
  social_security: 'Social Security', life_insurance: 'Life Insurance', other: 'Other',
};
const TIER_COLORS: Record<string, string> = {
  basic: 'bg-gray-100 text-gray-700', standard: 'bg-blue-100 text-blue-700', premium: 'bg-amber-100 text-amber-700',
};

interface Props { userId: string; viewedBySelf?: boolean; }

export default function EmployeeBenefitsTab({ userId, viewedBySelf = false }: Props) {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const isAdmin = hasAnyRole(['super_admin', 'superAdmin', 'SuperAdmin', 'admin', 'Admin', 'hr', 'hr_manager']);
  const canSelfEnroll = viewedBySelf || currentUser?.id === userId;

  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);
  const [enrollNotes, setEnrollNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: enrollments = [], refetch: refetchEnrollments } = useQuery({
    queryKey: ['employee-benefits', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_benefit_enrollments' as any)
        .select('*')
        .eq('user_id', userId)
        .order('enrolled_at', { ascending: false });
      if (error?.code === '42P01') return [];
      return (data ?? []) as unknown as Enrollment[];
    },
    staleTime: 30_000,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['benefit-plans-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_benefit_plans' as any).select('*').eq('is_active', true).order('name');
      if (error?.code === '42P01') return [];
      return (data ?? []) as unknown as Plan[];
    },
    staleTime: 120_000,
  });

  const { data: periods = [] } = useQuery({
    queryKey: ['open-enrollment-periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_open_enrollment_periods' as any).select('*').eq('is_active', true);
      if (error?.code === '42P01') return [];
      return (data ?? []) as unknown as EnrollmentPeriod[];
    },
    staleTime: 60_000,
  });

  const { data: dependents = [] } = useQuery({
    queryKey: ['employee-dependents-benefits', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('hr_employee_dependents').select('*').eq('profile_id', userId).order('full_name');
      return (data ?? []) as Dependent[];
    },
    staleTime: 60_000,
  });

  const activeOpenPeriod = useMemo(() => {
    const today = new Date();
    return periods.find(p => {
      try { return isWithinInterval(today, { start: parseISO(p.starts_at), end: parseISO(p.ends_at) }); }
      catch { return false; }
    }) ?? null;
  }, [periods]);

  const enrolledPlanIds = useMemo(
    () => new Set(enrollments.filter(e => e.status !== 'terminated').map(e => e.plan_id)),
    [enrollments]
  );

  const availableToEnroll = useMemo(() => {
    if (!activeOpenPeriod) return [];
    const eligibleIds = activeOpenPeriod.eligible_plan_ids;
    return plans.filter(p =>
      (eligibleIds.length === 0 || eligibleIds.includes(p.id)) && !enrolledPlanIds.has(p.id)
    );
  }, [plans, activeOpenPeriod, enrolledPlanIds]);

  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const maxDepsAllowed = selectedPlan?.max_dependents ?? 0;

  function openEnrollDialog() {
    setSelectedPlanId('');
    setSelectedDeps([]);
    setEnrollNotes('');
    setEnrollDialogOpen(true);
  }

  function toggleDependent(id: string) {
    setSelectedDeps(prev => {
      if (prev.includes(id)) return prev.filter(d => d !== id);
      if (prev.length >= maxDepsAllowed) {
        toast({ title: `Max ${maxDepsAllowed} dependent${maxDepsAllowed === 1 ? '' : 's'} allowed for this plan`, variant: 'destructive' });
        return prev;
      }
      return [...prev, id];
    });
  }

  async function submitEnrollment() {
    if (!selectedPlanId) { toast({ title: 'Select a plan', variant: 'destructive' }); return; }
    setSubmitting(true);
    const depsData = dependents.filter(d => selectedDeps.includes(d.id)).map(d => ({
      id: d.id, full_name: d.full_name, relationship: d.relationship,
      date_of_birth: d.date_of_birth ?? null,
    }));
    const period = activeOpenPeriod;
    const { error } = await supabase.from('hr_benefit_enrollments' as any).upsert({
      plan_id: selectedPlanId,
      user_id: userId,
      status: 'pending',
      dependents_count: selectedDeps.length,
      dependents_json: depsData,
      notes: enrollNotes || null,
      enrollment_period_id: period?.id ?? null,
    }, { onConflict: 'plan_id,user_id' });
    setSubmitting(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Enrollment request submitted', description: 'HR will review your request.' });
    setEnrollDialogOpen(false);
    refetchEnrollments();
  }

  const activeEnrollments = enrollments.filter(e => e.status === 'active');
  const pendingEnrollments = enrollments.filter(e => e.status === 'pending');

  return (
    <div className="space-y-4" data-testid="tab-employee-benefits">
      {/* Summary */}
      {activeEnrollments.length === 0 && pendingEnrollments.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <HeartPulse className="h-8 w-8 mx-auto mb-2 text-rose-300" />
            <p>No active benefit enrollments.</p>
            {activeOpenPeriod && (canSelfEnroll || isAdmin) && (
              <p className="mt-1 text-xs">Open enrollment is active — enroll in a plan below.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activeEnrollments.map(e => {
            const plan = plans.find(p => p.id === e.plan_id);
            return (
              <Card key={e.id} data-testid={`row-benefit-${e.id}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm flex items-center gap-1.5"><HeartPulse className="h-3.5 w-3.5 text-rose-500" />{plan?.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{plan ? PLAN_TYPE_LABEL[plan.plan_type] : ''} · {plan?.plan_tier} tier · {plan?.coverage_type?.replace(/_/g, ' ')}</p>
                    </div>
                    <Badge variant="outline" className="border-emerald-300 text-emerald-700">Active</Badge>
                  </div>
                  {plan && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs bg-muted/40 rounded p-2">
                      <div><span className="text-muted-foreground">Employer: </span>{plan.employer_cost.toLocaleString()} {plan.currency}/mo</div>
                      <div><span className="text-muted-foreground">Employee: </span>{plan.employee_cost.toLocaleString()} {plan.currency}/mo</div>
                    </div>
                  )}
                  {e.dependents_json && Array.isArray(e.dependents_json) && e.dependents_json.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Covered dependents: {(e.dependents_json as any[]).map((d: any) => d.full_name).join(', ')}
                    </div>
                  )}
                  {e.effective_date && <p className="text-xs text-muted-foreground mt-1">Effective: {format(parseISO(e.effective_date), 'PP')}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {pendingEnrollments.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700"><AlertTriangle className="h-4 w-4" />Pending Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {pendingEnrollments.map(e => {
              const plan = plans.find(p => p.id === e.plan_id);
              return (
                <div key={e.id} className="flex items-center justify-between text-sm py-1">
                  <span>{plan?.name ?? '—'}</span>
                  <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px]">Awaiting HR approval</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Open Enrollment Banner + Enroll Button */}
      {activeOpenPeriod && (
        <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10">
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <CalendarRange className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-700">Open Enrollment: {activeOpenPeriod.title}</p>
                <p className="text-xs text-emerald-600">
                  {format(parseISO(activeOpenPeriod.starts_at), 'MMM d')} – {format(parseISO(activeOpenPeriod.ends_at), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
            {(canSelfEnroll || isAdmin) && availableToEnroll.length > 0 && (
              <Button size="sm" onClick={openEnrollDialog} data-testid="button-open-enroll-dialog">
                <UserPlus className="h-3.5 w-3.5 mr-1" />Enroll
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Enrollment Dialog */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Benefit Enrollment</DialogTitle>
            <DialogDescription>Your request will be reviewed by HR before becoming active.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Plan *</Label>
              <Select value={selectedPlanId} onValueChange={v => { setSelectedPlanId(v); setSelectedDeps([]); }}>
                <SelectTrigger data-testid="select-enroll-plan"><SelectValue placeholder="Choose a plan…" /></SelectTrigger>
                <SelectContent>
                  {availableToEnroll.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.plan_tier} tier ({p.employee_cost.toLocaleString()} {p.currency}/mo)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedPlan && (
              <div className="text-xs bg-muted/40 rounded p-2 space-y-1">
                <div><span className="text-muted-foreground">Type: </span>{PLAN_TYPE_LABEL[selectedPlan.plan_type]}</div>
                <div><span className="text-muted-foreground">Coverage: </span>{selectedPlan.coverage_type.replace(/_/g, ' ')}</div>
                <div><span className="text-muted-foreground">Employer contribution: </span>{selectedPlan.employer_cost.toLocaleString()} {selectedPlan.currency}/mo</div>
                <div><span className="text-muted-foreground">Your contribution: </span>{selectedPlan.employee_cost.toLocaleString()} {selectedPlan.currency}/mo</div>
                {maxDepsAllowed > 0 && <div><span className="text-muted-foreground">Max dependents: </span>{maxDepsAllowed}</div>}
              </div>
            )}

            {/* Dependent selection from structured records */}
            {selectedPlan && maxDepsAllowed > 0 && dependents.length > 0 && (
              <div>
                <Label>Select Dependents to Cover</Label>
                <p className="text-xs text-muted-foreground mb-2">Up to {maxDepsAllowed} dependent{maxDepsAllowed !== 1 ? 's' : ''} from your registered dependents.</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto border rounded-md p-2">
                  {dependents.map(d => {
                    const checked = selectedDeps.includes(d.id);
                    const disabled = !checked && selectedDeps.length >= maxDepsAllowed;
                    return (
                      <label key={d.id} className={cn('flex items-center gap-2.5 text-sm cursor-pointer rounded px-2 py-1.5 hover:bg-muted/60 transition-colors', disabled && 'opacity-50 cursor-not-allowed')} data-testid={`dep-checkbox-${d.id}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleDependent(d.id)}
                          className="h-3.5 w-3.5"
                        />
                        <div>
                          <span className="font-medium">{d.full_name}</span>
                          <span className="text-muted-foreground ml-2 capitalize">{d.relationship}</span>
                          {d.date_of_birth && <span className="text-muted-foreground ml-2">{d.date_of_birth}</span>}
                        </div>
                      </label>
                    );
                  })}
                </div>
                {selectedDeps.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{selectedDeps.length} dependent{selectedDeps.length !== 1 ? 's' : ''} selected</p>
                )}
              </div>
            )}

            {selectedPlan && maxDepsAllowed > 0 && dependents.length === 0 && (
              <div className="text-xs text-muted-foreground p-2 border rounded bg-muted/30">
                No registered dependents on file. Add dependents in the Dependents tab to cover them under this plan.
              </div>
            )}

            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={enrollNotes} onChange={e => setEnrollNotes(e.target.value)} rows={2} placeholder="Any special requests…" data-testid="input-enroll-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitEnrollment} disabled={submitting || !selectedPlanId} data-testid="button-submit-enrollment">
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
