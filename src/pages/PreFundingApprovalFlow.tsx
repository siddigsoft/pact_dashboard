import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  GitBranch, Plus, Trash2, ChevronUp, ChevronDown, RefreshCw,
  AlertTriangle, CheckCircle2, Clock, User, ArrowRight, Edit2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface PreFundSummary { id: string; name: string; status: string; currency: string; amount: number }
interface ApprovalStep {
  id: string;
  pre_fund_request_id: string;
  step_order: number;
  step_label: string;
  assigned_user_id: string | null;
  assigned_user_name?: string;
  is_required: boolean;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  notes: string | null;
}

const STATUS_CFG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pending:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-700 border-amber-200',   icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-700 border-rose-200',      icon: AlertTriangle },
  skipped:  { label: 'Skipped',  cls: 'bg-slate-100 text-slate-500 border-slate-200',   icon: ArrowRight },
};

const FUND_STATUS_CFG: Record<string, string> = {
  draft:            'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-100 text-amber-700',
  awaiting_receipt: 'bg-sky-100 text-sky-700',
  active:           'bg-emerald-100 text-emerald-700',
  low_balance:      'bg-orange-100 text-orange-700',
  closed:           'bg-slate-100 text-slate-500',
};

export default function PreFundingApprovalFlow() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useAppContext();
  const { users } = useUser();
  const { toast } = useToast();
  const canAccess = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);

  const [funds, setFunds]       = useState<PreFundSummary[]>([]);
  const [steps, setSteps]       = useState<ApprovalStep[]>([]);
  const [selectedFund, setSelected] = useState<PreFundSummary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [showAddStep, setShowAddStep] = useState(false);
  const [stepForm, setStepForm] = useState({ step_label: '', assigned_user_id: '', is_required: true });
  const [saving, setSaving]     = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<{ step: ApprovalStep; action: 'approve' | 'reject' } | null>(null);
  const [actionNotes, setActionNotes] = useState('');

  const loadFunds = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: e } = await supabase.from('pre_fund_requests' as any)
        .select('id,name,status,currency,amount').order('created_at', { ascending: false });
      if (e && !e.message.includes('does not exist')) throw e;
      setFunds((data as any) ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadSteps = useCallback(async (fundId: string) => {
    setStepsLoading(true);
    try {
      const { data, error: e } = await supabase.from('pre_fund_approval_steps' as any)
        .select('*').eq('pre_fund_request_id', fundId).order('step_order');
      if (e) throw e;
      const stepsWithNames = ((data as any) ?? []).map((s: ApprovalStep) => ({
        ...s,
        assigned_user_name: s.assigned_user_id
          ? (users.find(u => u.id === s.assigned_user_id)?.fullName ?? users.find(u => u.id === s.assigned_user_id)?.name ?? s.assigned_user_id)
          : 'Unassigned',
      }));
      setSteps(stepsWithNames);
    } catch (e: any) { toast({ title: 'Failed to load steps', description: e.message, variant: 'destructive' }); }
    finally { setStepsLoading(false); }
  }, [users, toast]);

  useEffect(() => { loadFunds(); }, [loadFunds]);
  useEffect(() => { if (selectedFund) loadSteps(selectedFund.id); }, [selectedFund, loadSteps]);

  const handleAddStep = async () => {
    if (!selectedFund || !stepForm.step_label.trim()) { toast({ title: 'Step label required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const maxOrder = steps.length > 0 ? Math.max(...steps.map(s => s.step_order)) : 0;
      const { error: e } = await supabase.from('pre_fund_approval_steps' as any).insert({
        pre_fund_request_id: selectedFund.id,
        step_order: maxOrder + 1,
        step_label: stepForm.step_label.trim(),
        assigned_user_id: stepForm.assigned_user_id || null,
        is_required: stepForm.is_required,
        status: 'pending',
      });
      if (e) throw e;
      toast({ title: 'Step added' });
      setShowAddStep(false);
      setStepForm({ step_label: '', assigned_user_id: '', is_required: true });
      await loadSteps(selectedFund.id);
    } catch (e: any) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (stepId: string) => {
    if (!selectedFund) return;
    setProcessing(stepId);
    try {
      const { error: e } = await supabase.from('pre_fund_approval_steps' as any).delete().eq('id', stepId);
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
        supabase.from('pre_fund_approval_steps' as any).update({ step_order: updated[idx].step_order }).eq('id', updated[idx].id),
        supabase.from('pre_fund_approval_steps' as any).update({ step_order: updated[swapIdx].step_order }).eq('id', updated[swapIdx].id),
      ]);
      await loadSteps(selectedFund.id);
    } catch (e: any) { toast({ title: 'Reorder failed', description: e.message, variant: 'destructive' }); }
  };

  const handleAction = async () => {
    if (!actionDialog || !selectedFund) return;
    const { step, action } = actionDialog;
    setProcessing(step.id);
    try {
      const now = new Date().toISOString();
      const updates: any = {
        status: action === 'approve' ? 'approved' : 'rejected',
        approved_at: now,
        approved_by: currentUser?.id,
        notes: actionNotes || null,
      };
      const { error: e } = await supabase.from('pre_fund_approval_steps' as any).update(updates).eq('id', step.id);
      if (e) throw e;

      const allSteps = await supabase.from('pre_fund_approval_steps' as any)
        .select('status,is_required').eq('pre_fund_request_id', selectedFund.id);
      const allApproved = (allSteps.data as any)?.every((s: any) => s.status === 'approved' || !s.is_required);
      if (allApproved && action === 'approve') {
        await supabase.from('pre_fund_requests' as any).update({ status: 'awaiting_receipt' }).eq('id', selectedFund.id);
        toast({ title: 'All steps approved — fund is now Awaiting Receipt' });
      } else {
        toast({ title: `Step ${action === 'approve' ? 'approved' : 'rejected'}` });
      }
      setActionDialog(null);
      setActionNotes('');
      await Promise.all([loadSteps(selectedFund.id), loadFunds()]);
    } catch (e: any) { toast({ title: 'Action failed', description: e.message, variant: 'destructive' }); }
    finally { setProcessing(null); }
  };

  const canActOnStep = (step: ApprovalStep) => {
    if (step.status !== 'pending') return false;
    if (!step.assigned_user_id) return canAccess;
    return step.assigned_user_id === currentUser?.id || hasAnyRole(['super_admin', 'admin']);
  };

  if (!canAccess) return (
    <div className="p-8 text-center"><AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" /><p className="text-muted-foreground">Access denied.</p></div>
  );

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><GitBranch className="h-5 w-5 text-sky-600" />Approval Flow Manager</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Configure per-fund approval chains and process pending approvals</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadFunds}><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error} — run pre_funding_migration.sql</AlertDescription></Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Fund selector */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Funds</h3>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
          ) : funds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No funds yet — create one in Fund Registry.</div>
          ) : funds.map(f => (
            <button
              key={f.id}
              onClick={() => setSelected(f)}
              className={cn(
                'w-full text-left p-3 rounded-lg border transition-all',
                selectedFund?.id === f.id ? 'bg-primary/5 border-primary ring-1 ring-primary' : 'bg-card hover:bg-muted/40'
              )}
              data-testid={`button-fund-${f.id}`}
            >
              <div className="font-medium text-sm truncate">{f.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={cn('text-[10px]', FUND_STATUS_CFG[f.status] ?? 'bg-muted text-muted-foreground')}>{f.status.replace('_', ' ')}</Badge>
                <span className="text-[11px] text-muted-foreground">{f.currency} {f.amount.toLocaleString()}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Steps panel */}
        <div className="lg:col-span-2 space-y-3">
          {!selectedFund ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm border rounded-xl bg-muted/20">Select a fund to manage its approval chain</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Approval Chain — <span className="text-primary">{selectedFund.name}</span></h3>
                <Button size="sm" onClick={() => setShowAddStep(true)} data-testid="button-add-step">
                  <Plus className="h-4 w-4 mr-1.5" />Add Step
                </Button>
              </div>

              {stepsLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
              ) : steps.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-xl bg-muted/20">
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No approval steps yet</p>
                  <Button size="sm" className="mt-3" onClick={() => setShowAddStep(true)}>+ Add First Step</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {[...steps].sort((a, b) => a.step_order - b.step_order).map((step, idx) => {
                    const Icon = STATUS_CFG[step.status]?.icon ?? Clock;
                    const isActing = processing === step.id;
                    return (
                      <Card key={step.id} className={cn('border', step.status === 'approved' ? 'opacity-75' : '')} data-testid={`card-step-${step.id}`}>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center gap-1 pt-0.5">
                              <span className="text-[10px] text-muted-foreground font-mono w-4 text-center">{step.step_order}</span>
                              <div className="flex flex-col gap-0.5">
                                <button onClick={() => handleReorder(step.id, 'up')} disabled={idx === 0} className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30">
                                  <ChevronUp className="h-3 w-3" />
                                </button>
                                <button onClick={() => handleReorder(step.id, 'down')} disabled={idx === steps.length - 1} className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30">
                                  <ChevronDown className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="font-medium text-sm">{step.step_label}</span>
                                  {!step.is_required && <span className="ml-2 text-[10px] text-muted-foreground">(optional)</span>}
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <User className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-[11px] text-muted-foreground">{step.assigned_user_name}</span>
                                  </div>
                                  {step.approved_at && (
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {step.status === 'approved' ? 'Approved' : 'Acted'} {format(parseISO(step.approved_at), 'MMM d, yyyy HH:mm')}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Badge variant="outline" className={cn('text-[10px]', STATUS_CFG[step.status]?.cls)}>
                                    <Icon className="h-3 w-3 mr-1" />{STATUS_CFG[step.status]?.label ?? step.status}
                                  </Badge>
                                </div>
                              </div>
                              {canActOnStep(step) && (
                                <div className="flex gap-2 mt-2">
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
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => handleDelete(step.id)} disabled={isActing} data-testid={`button-delete-step-${step.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

      {/* Add Step Dialog */}
      <Dialog open={showAddStep} onOpenChange={setShowAddStep}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Approval Step</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Step Label *</Label>
              <Input value={stepForm.step_label} onChange={e => setStepForm(p => ({ ...p, step_label: e.target.value }))} placeholder="e.g. Finance Manager Review" data-testid="input-step-label" />
            </div>
            <div>
              <Label>Assign To (User)</Label>
              <Select value={stepForm.assigned_user_id} onValueChange={v => setStepForm(p => ({ ...p, assigned_user_id: v }))}>
                <SelectTrigger data-testid="select-step-user"><SelectValue placeholder="Any approver with access…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any approver with access</SelectItem>
                  {users.filter(u => u.profileStatus === 'approved' || u.isApproved).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.fullName ?? u.name ?? u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={stepForm.is_required} onCheckedChange={v => setStepForm(p => ({ ...p, is_required: v }))} id="switch-required" />
              <Label htmlFor="switch-required">Required step (fund won't proceed if rejected)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStep(false)}>Cancel</Button>
            <Button onClick={handleAddStep} disabled={saving} data-testid="button-save-step">{saving ? 'Adding…' : 'Add Step'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={o => !o && setActionDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{actionDialog?.action === 'approve' ? 'Approve' : 'Reject'} Step</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Step: <strong>{actionDialog?.step.step_label}</strong></p>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={actionNotes} onChange={e => setActionNotes(e.target.value)} placeholder="Add a note…" data-testid="input-action-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              onClick={handleAction}
              disabled={!!processing}
              variant={actionDialog?.action === 'approve' ? 'default' : 'destructive'}
              data-testid="button-confirm-action"
            >
              {processing ? 'Processing…' : actionDialog?.action === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
