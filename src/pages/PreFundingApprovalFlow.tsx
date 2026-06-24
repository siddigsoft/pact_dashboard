import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  GitBranch, Plus, Trash2, ChevronUp, ChevronDown, RefreshCw,
  AlertTriangle, CheckCircle2, Clock, Users, ArrowRight, Edit2,
  X, Search, CheckCircle, XCircle, ShieldCheck,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface PreFundSummary {
  id: string; name: string; status: string;
  currency: string; amount: number;
  project_id: string | null; project_name?: string;
}
interface Project { id: string; name: string }

interface StepVote {
  id: string;
  step_id: string;
  user_id: string;
  user_name?: string;
  action: 'approved' | 'rejected';
  notes: string | null;
  created_at: string;
}

interface ApprovalStep {
  id: string;
  pre_fund_request_id: string;
  step_order: number;
  step_label: string;
  assigned_user_id: string | null;        // legacy (kept for compat)
  assigned_user_ids: string[];            // multi-user array
  assigned_user_names?: string[];
  required_approvals: number;             // quorum: how many must approve
  is_required: boolean;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  notes: string | null;
  votes?: StepVote[];                     // individual votes
}

type StepForm = {
  step_label: string;
  assigned_user_ids: string[];
  required_approvals: number;
  is_required: boolean;
};
const EMPTY_STEP_FORM: StepForm = { step_label: '', assigned_user_ids: [], required_approvals: 1, is_required: true };

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pending:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-700 border-amber-200',       icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-700 border-rose-200',          icon: AlertTriangle },
  skipped:  { label: 'Skipped',  cls: 'bg-slate-100 text-slate-500 border-slate-200',       icon: ArrowRight },
};
const FUND_STATUS_CFG: Record<string, string> = {
  draft:            'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-100 text-amber-700',
  awaiting_receipt: 'bg-sky-100 text-sky-700',
  active:           'bg-emerald-100 text-emerald-700',
  low_balance:      'bg-orange-100 text-orange-700',
  closed:           'bg-slate-100 text-slate-500',
};

const APPROVER_ROLE_KEYS = new Set([
  'superadmin', 'super_admin', 'admin',
  'employee',
  'datateam', 'data_team',
  'fieldoperationmanagerfom', 'fom', 'field operation manager (fom)', 'field operation manager',
  'countrydirector', 'country_director', 'cd',
]);
function isApproverRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return APPROVER_ROLE_KEYS.has(role.toLowerCase().replace(/[\s\-]/g, ''));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreFundingApprovalFlow() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useAppContext();
  const { users } = useUser();
  const { toast } = useToast();
  const canAccess = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);
  const isAdmin   = hasAnyRole(['super_admin', 'admin']);

  const [funds, setFunds]                 = useState<PreFundSummary[]>([]);
  const [projects, setProjects]           = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>('__all__');
  const [steps, setSteps]                 = useState<ApprovalStep[]>([]);
  const [selectedFund, setSelected]       = useState<PreFundSummary | null>(null);
  const [loading, setLoading]             = useState(true);
  const [stepsLoading, setStepsLoading]   = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // Step dialog (add + edit unified)
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [editingStep, setEditingStep]       = useState<ApprovalStep | null>(null);
  const [stepForm, setStepForm]             = useState<StepForm>(EMPTY_STEP_FORM);
  const [userSearch, setUserSearch]         = useState('');
  const [saving, setSaving]                 = useState(false);

  const [processing, setProcessing]         = useState<string | null>(null);
  const [actionDialog, setActionDialog]     = useState<{ step: ApprovalStep; action: 'approve' | 'reject' } | null>(null);
  const [actionNotes, setActionNotes]       = useState('');

  // Eligible approvers
  const eligibleUsers = useMemo(() =>
    users.filter(u => (u.profileStatus === 'approved' || u.isApproved) && isApproverRole(u.role)),
    [users]
  );
  const filteredEligibleUsers = useMemo(() =>
    eligibleUsers.filter(u =>
      !userSearch || (u.fullName ?? u.name ?? u.email ?? '').toLowerCase().includes(userSearch.toLowerCase())
    ),
    [eligibleUsers, userSearch]
  );

  // ─── Data loaders ───────────────────────────────────────────────────────────

  const loadFunds = useCallback(async () => {
    setLoading(true);
    try {
      const [fundsRes, projectsRes] = await Promise.all([
        supabase.from('pre_fund_requests')
          .select('id,name,status,currency,amount,project_id').order('created_at', { ascending: false }),
        supabase.from('projects').select('id,name').order('name'),
      ]);
      if (fundsRes.error && !fundsRes.error.message.includes('does not exist')) throw fundsRes.error;
      const projMap = new Map<string, string>((projectsRes.data ?? []).map((p: Project) => [p.id, p.name]));
      setFunds(((fundsRes.data as any) ?? []).map((f: PreFundSummary) => ({
        ...f,
        project_name: f.project_id ? (projMap.get(f.project_id) ?? 'Unknown Project') : null,
      })));
      setProjects(projectsRes.data ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadSteps = useCallback(async (fundId: string) => {
    setStepsLoading(true);
    try {
      const [stepsRes, votesRes] = await Promise.all([
        supabase.from('pre_fund_approval_steps')
          .select('*').eq('pre_fund_request_id', fundId).order('step_order'),
        supabase.from('pre_fund_step_approvals' as any)
          .select('*')
          .in('step_id',
            // we'll set this properly after first query; use a sub-approach
            ['__placeholder__']
          ).limit(0),    // placeholder — overridden below
      ]);

      if (stepsRes.error) throw stepsRes.error;
      const rawSteps = (stepsRes.data as any) ?? [];
      const stepIds: string[] = rawSteps.map((s: any) => s.id);

      // Load votes for all steps in one query
      let votes: StepVote[] = [];
      if (stepIds.length > 0) {
        const { data: vData } = await supabase
          .from('pre_fund_step_approvals' as any)
          .select('*')
          .in('step_id', stepIds);
        votes = (vData as any) ?? [];
      }

      const enriched = rawSteps.map((s: any): ApprovalStep => {
        const ids: string[] = Array.isArray(s.assigned_user_ids) && s.assigned_user_ids.length > 0
          ? s.assigned_user_ids
          : (s.assigned_user_id ? [s.assigned_user_id] : []);
        const names = ids.map((uid: string) =>
          users.find(u => u.id === uid)?.fullName ?? users.find(u => u.id === uid)?.name ?? uid
        );
        const stepVotes: StepVote[] = votes
          .filter((v: any) => v.step_id === s.id)
          .map((v: any) => ({
            ...v,
            user_name: users.find(u => u.id === v.user_id)?.fullName ?? users.find(u => u.id === v.user_id)?.name ?? v.user_id,
          }));
        return {
          ...s,
          assigned_user_ids: ids,
          assigned_user_names: names,
          required_approvals: s.required_approvals ?? 1,
          votes: stepVotes,
        };
      });
      setSteps(enriched);
    } catch (e: any) { toast({ title: 'Failed to load steps', description: e.message, variant: 'destructive' }); }
    finally { setStepsLoading(false); }
    void votesRes;
  }, [users, toast]);

  useEffect(() => { loadFunds(); }, [loadFunds]);
  useEffect(() => { if (selectedFund) loadSteps(selectedFund.id); }, [selectedFund, loadSteps]);

  // ─── Dialog open helpers ────────────────────────────────────────────────────

  const openNewStep = () => {
    setEditingStep(null);
    setStepForm(EMPTY_STEP_FORM);
    setUserSearch('');
    setShowStepDialog(true);
  };

  const openEditStep = (step: ApprovalStep) => {
    setEditingStep(step);
    setStepForm({
      step_label: step.step_label,
      assigned_user_ids: step.assigned_user_ids ?? (step.assigned_user_id ? [step.assigned_user_id] : []),
      required_approvals: step.required_approvals ?? 1,
      is_required: step.is_required,
    });
    setUserSearch('');
    setShowStepDialog(true);
  };

  const toggleUser = (uid: string) => {
    setStepForm(p => {
      const next = p.assigned_user_ids.includes(uid)
        ? p.assigned_user_ids.filter(id => id !== uid)
        : [...p.assigned_user_ids, uid];
      // keep required_approvals <= new length (min 1)
      const maxQ = Math.max(next.length, 1);
      return { ...p, assigned_user_ids: next, required_approvals: Math.min(p.required_approvals, maxQ) };
    });
  };

  // ─── Save step (add or edit) ─────────────────────────────────────────────

  const handleSaveStep = async () => {
    if (!selectedFund || !stepForm.step_label.trim()) {
      toast({ title: 'Step label required', variant: 'destructive' }); return;
    }
    const requiredApprovals = Math.max(1, Math.min(stepForm.required_approvals, Math.max(stepForm.assigned_user_ids.length, 1)));
    setSaving(true);
    try {
      const payload = {
        step_label: stepForm.step_label.trim(),
        assigned_user_ids: stepForm.assigned_user_ids,
        assigned_user_id: stepForm.assigned_user_ids[0] ?? null,
        required_approvals: requiredApprovals,
        is_required: stepForm.is_required,
      };
      if (editingStep) {
        const { error: e } = await supabase.from('pre_fund_approval_steps').update(payload).eq('id', editingStep.id);
        if (e) throw e;
        toast({ title: 'Step updated' });
      } else {
        const maxOrder = steps.length > 0 ? Math.max(...steps.map(s => s.step_order)) : 0;
        const { error: e } = await supabase.from('pre_fund_approval_steps').insert({
          pre_fund_request_id: selectedFund.id,
          step_order: maxOrder + 1,
          status: 'pending',
          ...payload,
        });
        if (e) throw e;
        toast({ title: 'Step added' });
      }
      setShowStepDialog(false);
      setEditingStep(null);
      setStepForm(EMPTY_STEP_FORM);
      await loadSteps(selectedFund.id);
    } catch (e: any) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  // ─── Delete / reorder ───────────────────────────────────────────────────────

  const handleDelete = async (stepId: string) => {
    if (!selectedFund) return;
    setProcessing(stepId);
    try {
      const { error: e } = await supabase.from('pre_fund_approval_steps').delete().eq('id', stepId);
      if (e) throw e;
      await loadSteps(selectedFund.id);
    } catch (e: any) { toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }); }
    finally { setProcessing(null); }
  };

  const handleReorder = async (stepId: string, direction: 'up' | 'down') => {
    if (!selectedFund) return;
    const idx = steps.findIndex(s => s.id === stepId);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === steps.length - 1)) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const updated = [...steps];
    const temp = updated[idx].step_order;
    updated[idx] = { ...updated[idx], step_order: updated[swapIdx].step_order };
    updated[swapIdx] = { ...updated[swapIdx], step_order: temp };
    try {
      await Promise.all([
        supabase.from('pre_fund_approval_steps').update({ step_order: updated[idx].step_order }).eq('id', updated[idx].id),
        supabase.from('pre_fund_approval_steps').update({ step_order: updated[swapIdx].step_order }).eq('id', updated[swapIdx].id),
      ]);
      await loadSteps(selectedFund.id);
    } catch (e: any) { toast({ title: 'Reorder failed', description: e.message, variant: 'destructive' }); }
  };

  // ─── Approve / Reject with quorum logic ─────────────────────────────────────

  const handleAction = async () => {
    if (!actionDialog || !selectedFund) return;
    const { step, action } = actionDialog;
    setProcessing(step.id);
    try {
      const now = new Date().toISOString();

      // Record the individual vote (upsert — one vote per user per step)
      const { error: vErr } = await supabase.from('pre_fund_step_approvals' as any).upsert({
        step_id: step.id,
        user_id: currentUser?.id,
        action: action === 'approve' ? 'approved' : 'rejected',
        notes: actionNotes || null,
        created_at: now,
      }, { onConflict: 'step_id,user_id' });
      if (vErr && !vErr.message.includes('does not exist')) throw vErr;

      // Count how many approvals now exist for this step
      const { data: voteData } = await supabase
        .from('pre_fund_step_approvals' as any)
        .select('action')
        .eq('step_id', step.id);
      const votes = (voteData as any) ?? [];
      const approvalCount   = votes.filter((v: any) => v.action === 'approved').length;
      const anyRejected     = votes.some((v: any) => v.action === 'rejected');
      const quorumMet       = approvalCount >= (step.required_approvals ?? 1);

      // Determine new step status
      let newStepStatus: string | null = null;
      if (anyRejected && step.is_required) {
        newStepStatus = 'rejected';
      } else if (quorumMet) {
        newStepStatus = 'approved';
      }
      // else: still pending (more approvals needed)

      if (newStepStatus) {
        const { error: sErr } = await supabase.from('pre_fund_approval_steps').update({
          status: newStepStatus,
          approved_at: now,
          approved_by: currentUser?.id,
          notes: actionNotes || null,
        }).eq('id', step.id);
        if (sErr) throw sErr;
      }

      // If step is now resolved, check if fund status should change
      if (newStepStatus) {
        const { data: allStepsData } = await supabase.from('pre_fund_approval_steps')
          .select('id,status,is_required').eq('pre_fund_request_id', selectedFund.id);
        const allSteps = (allStepsData as any) ?? [];
        const withUpdate = allSteps.map((s: any) =>
          s.id === step.id ? { ...s, status: newStepStatus } : s
        );
        const anyRequiredRejected = withUpdate.some((s: any) => s.status === 'rejected' && s.is_required);
        const allDone = withUpdate.every((s: any) => s.status === 'approved' || !s.is_required);

        if (anyRequiredRejected) {
          await supabase.from('pre_fund_requests').update({
            status: 'rejected',
            rejection_reason: actionNotes || 'Step rejected in Approval Flow',
          }).eq('id', selectedFund.id);
          toast({ title: 'Step rejected — Fund is now Rejected' });
        } else if (allDone) {
          await supabase.from('pre_fund_requests').update({
            status: 'awaiting_receipt',
            approved_by: currentUser?.id ?? null,
            approved_at: now,
          }).eq('id', selectedFund.id);
          toast({ title: 'All steps approved — fund is now Awaiting Receipt' });
        } else {
          toast({ title: newStepStatus === 'approved' ? 'Step approved ✓' : 'Step rejected' });
        }
      } else {
        const needed = (step.required_approvals ?? 1) - approvalCount;
        toast({ title: `Vote recorded`, description: `${approvalCount} of ${step.required_approvals ?? 1} approvals — ${needed} more needed.` });
      }

      setActionDialog(null);
      setActionNotes('');
      await Promise.all([loadSteps(selectedFund.id), loadFunds()]);
    } catch (e: any) { toast({ title: 'Action failed', description: e.message, variant: 'destructive' }); }
    finally { setProcessing(null); }
  };

  // ─── Permission helpers ──────────────────────────────────────────────────────

  const canActOnStep = (step: ApprovalStep) => {
    if (step.status !== 'pending') return false;
    const prevRequired = steps.filter(s => s.step_order < step.step_order && s.is_required);
    if (prevRequired.some(s => s.status !== 'approved' && s.status !== 'skipped')) return false;
    const alreadyVoted = step.votes?.some(v => v.user_id === currentUser?.id);
    if (alreadyVoted) return false;
    if (!step.assigned_user_ids?.length) return canAccess;
    return step.assigned_user_ids.includes(currentUser?.id ?? '') || isAdmin;
  };

  // ─── Filtered funds ──────────────────────────────────────────────────────────

  const filteredFunds = funds.filter(f =>
    projectFilter === '__all__' ? true :
    projectFilter === '__none__' ? !f.project_id :
    f.project_id === projectFilter
  );

  if (!canAccess) return (
    <div className="p-8 text-center">
      <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
      <p className="text-muted-foreground">Access denied.</p>
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 p-4 md:p-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
            <GitBranch className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Approval Flow Manager</h1>
            <p className="text-sm text-muted-foreground">Configure per-fund approval chains and process pending approvals</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadFunds} className="shrink-0">
          <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error} — run pre_funding_migration.sql</AlertDescription></Alert>}

      {/* Project filter */}
      {projects.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">Filter by project:</span>
          {[
            { key: '__all__', label: 'All Projects' },
            { key: '__none__', label: 'No Project' },
            ...projects.map(p => ({ key: p.id, label: p.name })),
          ].map(({ key, label }) => (
            <button key={key}
              onClick={() => { setProjectFilter(key); setSelected(null); }}
              className={cn('px-3 py-1 rounded-md text-xs font-medium border transition-all',
                projectFilter === key
                  ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                  : 'bg-background text-muted-foreground border-border hover:border-sky-400 hover:text-sky-700'
              )}
            >{label}</button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Fund selector ───────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Funds</h3>
            <span className="text-[11px] text-muted-foreground">{filteredFunds.length} fund{filteredFunds.length !== 1 ? 's' : ''}</span>
          </div>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
          ) : filteredFunds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-xl bg-muted/20">
              {funds.length === 0 ? 'No funds yet — create one in Fund Registry.' : 'No funds match this filter.'}
            </div>
          ) : filteredFunds.map(f => (
            <button key={f.id} onClick={() => setSelected(f)}
              className={cn(
                'w-full text-left p-3 rounded-lg border transition-all',
                selectedFund?.id === f.id ? 'bg-primary/5 border-primary ring-1 ring-primary' : 'bg-card hover:bg-muted/40'
              )}
              data-testid={`button-fund-${f.id}`}
            >
              <div className="font-medium text-sm truncate">{f.name}</div>
              {f.project_name && <div className="text-[10px] text-sky-600 truncate mt-0.5">{f.project_name}</div>}
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={cn('text-[10px]', FUND_STATUS_CFG[f.status] ?? 'bg-muted text-muted-foreground')}>
                  {f.status.replace(/_/g, ' ')}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{f.currency} {f.amount.toLocaleString()}</span>
              </div>
            </button>
          ))}
        </div>

        {/* ── Approval chain panel ────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-3">
          {!selectedFund ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm border rounded-xl bg-muted/20">
              Select a fund to manage its approval chain
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Approval Chain — <span className="text-primary">{selectedFund.name}</span>
                </h3>
                <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white" onClick={openNewStep} data-testid="button-add-step">
                  <Plus className="h-4 w-4 mr-1.5" />Add Step
                </Button>
              </div>

              {stepsLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
              ) : steps.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-xl bg-muted/20">
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No approval steps yet</p>
                  <Button size="sm" className="mt-3 bg-sky-600 hover:bg-sky-700 text-white" onClick={openNewStep}>+ Add First Step</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {[...steps].sort((a, b) => a.step_order - b.step_order).map((step, idx) => {
                    const Icon = STATUS_CFG[step.status]?.icon ?? Clock;
                    const isActing = processing === step.id;
                    const approvalVotes  = step.votes?.filter(v => v.action === 'approved') ?? [];
                    const rejectionVotes = step.votes?.filter(v => v.action === 'rejected') ?? [];
                    const approvalCount  = approvalVotes.length;
                    const required       = step.required_approvals ?? 1;
                    const hasMultiUsers  = (step.assigned_user_ids?.length ?? 0) > 1;
                    const alreadyVoted   = step.votes?.some(v => v.user_id === currentUser?.id);

                    return (
                      <Card key={step.id} className={cn('border', step.status === 'approved' ? 'opacity-80' : '')} data-testid={`card-step-${step.id}`}>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">

                            {/* Reorder controls */}
                            <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                              <span className="text-[10px] text-muted-foreground font-mono w-4 text-center">{step.step_order}</span>
                              <div className="flex flex-col gap-0.5">
                                <button onClick={() => handleReorder(step.id, 'up')} disabled={idx === 0}
                                  className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30">
                                  <ChevronUp className="h-3 w-3" />
                                </button>
                                <button onClick={() => handleReorder(step.id, 'down')} disabled={idx === steps.length - 1}
                                  className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30">
                                  <ChevronDown className="h-3 w-3" />
                                </button>
                              </div>
                            </div>

                            {/* Step content */}
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm">{step.step_label}</span>
                                    {!step.is_required && <span className="text-[10px] text-muted-foreground">(optional)</span>}
                                  </div>

                                  {/* Assignees + quorum badge */}
                                  <div className="flex items-start gap-1.5 mt-1 flex-wrap">
                                    <Users className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                                    {step.assigned_user_names?.length ? (
                                      step.assigned_user_names.map((name, i) => (
                                        <span key={i} className="text-[11px] bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded-md">
                                          {name}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground italic">Any authorized approver</span>
                                    )}
                                    {/* Quorum label — only show if > 1 user and threshold > 1 */}
                                    {hasMultiUsers && (
                                      <span className={cn(
                                        'text-[11px] px-1.5 py-0.5 rounded-md font-medium',
                                        required < (step.assigned_user_ids?.length ?? 1)
                                          ? 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                                          : 'bg-slate-100 text-slate-600'
                                      )}>
                                        <ShieldCheck className="inline h-3 w-3 mr-0.5" />
                                        {required} of {step.assigned_user_ids?.length} must approve
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <Badge variant="outline" className={cn('text-[10px] shrink-0', STATUS_CFG[step.status]?.cls)}>
                                  <Icon className="h-3 w-3 mr-1" />{STATUS_CFG[step.status]?.label ?? step.status}
                                </Badge>
                              </div>

                              {/* Approval progress bar (only when multi-user quorum) */}
                              {step.status === 'pending' && hasMultiUsers && (
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] text-muted-foreground">
                                      {approvalCount} / {required} approval{required !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className={cn('h-full rounded-full transition-all', approvalCount >= required ? 'bg-emerald-500' : 'bg-sky-400')}
                                      style={{ width: `${Math.min((approvalCount / required) * 100, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Individual votes */}
                              {(step.votes?.length ?? 0) > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {approvalVotes.map(v => (
                                    <span key={v.id} className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 px-1.5 py-0.5 rounded-md">
                                      <CheckCircle className="h-3 w-3" />{v.user_name}
                                    </span>
                                  ))}
                                  {rejectionVotes.map(v => (
                                    <span key={v.id} className="inline-flex items-center gap-1 text-[10px] bg-rose-50 dark:bg-rose-900/20 text-rose-700 px-1.5 py-0.5 rounded-md">
                                      <XCircle className="h-3 w-3" />{v.user_name}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Approved at */}
                              {step.approved_at && step.status !== 'pending' && (
                                <div className="text-[10px] text-muted-foreground">
                                  {step.status === 'approved' ? 'Completed' : 'Acted'} {format(parseISO(step.approved_at), 'MMM d, yyyy HH:mm')}
                                </div>
                              )}

                              {/* Already voted notice */}
                              {alreadyVoted && step.status === 'pending' && (
                                <p className="text-[11px] text-muted-foreground italic">You have already voted on this step.</p>
                              )}

                              {/* Approve / Reject buttons */}
                              {canActOnStep(step) && (
                                <div className="flex gap-2">
                                  <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" disabled={isActing}
                                    onClick={() => setActionDialog({ step, action: 'approve' })} data-testid={`button-approve-step-${step.id}`}>
                                    Approve
                                  </Button>
                                  <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={isActing}
                                    onClick={() => setActionDialog({ step, action: 'reject' })} data-testid={`button-reject-step-${step.id}`}>
                                    Reject
                                  </Button>
                                </div>
                              )}
                            </div>

                            {/* Edit + Delete */}
                            <div className="flex flex-col gap-1 shrink-0">
                              <Button variant="outline" size="sm" className="h-7 w-7 p-0 text-sky-600 border-sky-200 hover:bg-sky-50"
                                title="Edit step" onClick={() => openEditStep(step)} disabled={isActing} data-testid={`button-edit-step-${step.id}`}>
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="outline" size="sm" className="h-7 w-7 p-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                                title="Delete step" onClick={() => handleDelete(step.id)} disabled={isActing} data-testid={`button-delete-step-${step.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Add / Edit Step Dialog ─────────────────────────────────────────── */}
      <Dialog open={showStepDialog} onOpenChange={o => { if (!o) { setShowStepDialog(false); setEditingStep(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStep ? 'Edit Approval Step' : 'Add Approval Step'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Label */}
            <div>
              <Label>Step Label *</Label>
              <Input value={stepForm.step_label} onChange={e => setStepForm(p => ({ ...p, step_label: e.target.value }))}
                placeholder="e.g. Finance Manager Review" data-testid="input-step-label" />
            </div>

            {/* Multi-user picker */}
            <div>
              <Label className="mb-1 block">
                Assigned Approvers
                <span className="text-muted-foreground font-normal text-[11px] ml-1">(leave empty = any authorized user)</span>
              </Label>

              {/* Selected chips */}
              {stepForm.assigned_user_ids.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2 p-2 rounded-lg bg-muted/30 border">
                  {stepForm.assigned_user_ids.map(uid => {
                    const u = users.find(u => u.id === uid);
                    return (
                      <span key={uid} className="inline-flex items-center gap-1 text-xs bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded-full border border-sky-200">
                        {u?.fullName ?? u?.name ?? uid}
                        <button onClick={() => toggleUser(uid)} className="hover:text-destructive" data-testid={`button-remove-user-${uid}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Search */}
              <div className="relative mb-1">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search users…" className="pl-8 h-8 text-sm" data-testid="input-user-search" />
              </div>

              {/* Checkbox list */}
              <div className="max-h-40 overflow-y-auto border rounded-lg divide-y bg-background">
                {filteredEligibleUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No users found</p>
                ) : filteredEligibleUsers.map(u => {
                  const checked = stepForm.assigned_user_ids.includes(u.id);
                  return (
                    <label key={u.id}
                      className={cn('flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors', checked ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-muted/40')}
                      data-testid={`checkbox-user-${u.id}`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleUser(u.id)}
                        className="h-4 w-4 rounded border-border accent-sky-600" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{u.fullName ?? u.name ?? u.email}</div>
                        {u.email && <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">{u.role}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {stepForm.assigned_user_ids.length} user{stepForm.assigned_user_ids.length !== 1 ? 's' : ''} selected
                {' '}· {eligibleUsers.length} eligible
              </p>
            </div>

            {/* Quorum — only shown when 2+ users selected */}
            {stepForm.assigned_user_ids.length >= 2 && (
              <div className="rounded-lg border bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800 p-3 space-y-2">
                <Label className="text-violet-800 dark:text-violet-300 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  Required Approvals (Quorum)
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={stepForm.assigned_user_ids.length}
                    value={stepForm.required_approvals}
                    onChange={e => {
                      const v = Math.max(1, Math.min(parseInt(e.target.value) || 1, stepForm.assigned_user_ids.length));
                      setStepForm(p => ({ ...p, required_approvals: v }));
                    }}
                    className="w-20 h-8 text-center text-sm"
                    data-testid="input-required-approvals"
                  />
                  <span className="text-sm text-muted-foreground">
                    of {stepForm.assigned_user_ids.length} assigned users must approve
                  </span>
                </div>
                <p className="text-[11px] text-violet-700 dark:text-violet-400">
                  {stepForm.required_approvals === stepForm.assigned_user_ids.length
                    ? 'All assigned users must approve (unanimous).'
                    : stepForm.required_approvals === 1
                    ? 'Any one of the assigned users can approve.'
                    : `${stepForm.required_approvals} of ${stepForm.assigned_user_ids.length} approvals needed — ${stepForm.assigned_user_ids.length - stepForm.required_approvals} abstention${stepForm.assigned_user_ids.length - stepForm.required_approvals !== 1 ? 's' : ''} allowed.`
                  }
                </p>
              </div>
            )}

            {/* Required toggle */}
            <div className="flex items-center gap-3">
              <Switch checked={stepForm.is_required} onCheckedChange={v => setStepForm(p => ({ ...p, is_required: v }))} id="switch-required" />
              <Label htmlFor="switch-required">Required step (fund won't proceed if rejected)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowStepDialog(false); setEditingStep(null); }}>Cancel</Button>
            <Button onClick={handleSaveStep} disabled={saving} className="bg-sky-600 hover:bg-sky-700 text-white" data-testid="button-save-step">
              {saving ? (editingStep ? 'Saving…' : 'Adding…') : (editingStep ? 'Save Changes' : 'Add Step')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Approve / Reject confirm ───────────────────────────────────────── */}
      <Dialog open={!!actionDialog} onOpenChange={o => !o && setActionDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{actionDialog?.action === 'approve' ? 'Approve' : 'Reject'} Step</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Step: <strong>{actionDialog?.step.step_label}</strong>
            </p>
            {actionDialog?.step && (actionDialog.step.required_approvals ?? 1) > 1 && (
              <p className="text-xs text-sky-600 bg-sky-50 dark:bg-sky-900/20 px-3 py-2 rounded-lg">
                This step requires <strong>{actionDialog.step.required_approvals}</strong> of{' '}
                <strong>{actionDialog.step.assigned_user_ids?.length}</strong> approvals.
                Current: <strong>{actionDialog.step.votes?.filter(v => v.action === 'approved').length ?? 0}</strong> approved.
              </p>
            )}
            <div>
              <Label>Notes (optional)</Label>
              <Input value={actionNotes} onChange={e => setActionNotes(e.target.value)}
                placeholder="Add a note…" data-testid="input-action-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button onClick={handleAction} disabled={!!processing}
              variant={actionDialog?.action === 'approve' ? 'default' : 'destructive'}
              data-testid="button-confirm-action">
              {processing ? 'Processing…' : actionDialog?.action === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
