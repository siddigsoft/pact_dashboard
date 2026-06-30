import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import {
  FileSignature, Plus, Loader2, RefreshCw, CheckCircle, XCircle,
  RotateCcw, Inbox, LayoutList, Users, PenTool, Filter,
  ChevronRight, MessageSquare, Clock, AlertTriangle, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type TabId = 'queue' | 'all' | 'bulk' | 'signatures';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'queue',      label: 'My Queue',       icon: <Inbox className="w-3.5 h-3.5" /> },
  { id: 'all',        label: 'All Reviews',    icon: <LayoutList className="w-3.5 h-3.5" /> },
  { id: 'bulk',       label: 'Bulk Review',    icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'signatures', label: 'Signatures',     icon: <PenTool className="w-3.5 h-3.5" /> },
];

const REVIEW_STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'correction_requested', 'resubmitted'] as const;
const STATUS_CFG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:              { label: 'Pending',             cls: 'bg-slate-100 text-slate-600',    icon: <Clock className="w-3 h-3" /> },
  under_review:         { label: 'Under Review',        cls: 'bg-blue-100 text-blue-700',      icon: <Filter className="w-3 h-3" /> },
  approved:             { label: 'Approved',            cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
  rejected:             { label: 'Rejected',            cls: 'bg-red-100 text-red-600',        icon: <XCircle className="w-3 h-3" /> },
  correction_requested: { label: 'Needs Correction',    cls: 'bg-amber-100 text-amber-700',    icon: <AlertTriangle className="w-3 h-3" /> },
  resubmitted:          { label: 'Resubmitted',         cls: 'bg-purple-100 text-purple-700',  icon: <RotateCcw className="w-3 h-3" /> },
};

interface FdForm { id: string; name: string; }
interface FdReview {
  id: string; form_id: string; submission_id: string | null;
  submission_ref: string | null; submitter_name: string | null;
  stage: string; status: string; reviewer_name: string | null;
  reviewer_id: string | null; notes: string | null;
  submitted_at: string; reviewed_at: string | null; created_at: string;
}
interface FdAction {
  id: string; review_id: string; action_type: string;
  actor_name: string | null; notes: string | null; performed_at: string;
  signature_text: string | null;
  fd_submission_reviews?: { submission_ref: string | null; form_id: string } | null;
}

export default function FieldDataWorkflow() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<TabId>('queue');
  const [selectedForm, setSelectedForm] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Action dialog (single)
  const [actionDialog, setActionDialog] = useState(false);
  const [actionReview, setActionReview] = useState<FdReview | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'request_correction' | 'sign'>('approve');
  const [actionNotes, setActionNotes] = useState('');
  const [sigText, setSigText] = useState('');

  // Bulk action
  const [bulkAction, setBulkAction] = useState<'approve' | 'reject'>('approve');
  const [bulkNotes, setBulkNotes] = useState('');
  const [bulkDialog, setBulkDialog] = useState(false);

  // New review dialog
  const [newDialog, setNewDialog] = useState(false);
  const [nFormId, setNFormId] = useState('');
  const [nRef, setNRef] = useState('');
  const [nSubmitter, setNSubmitter] = useState('');
  const [nStage, setNStage] = useState('Data Review');
  const [nReviewer, setNReviewer] = useState('');

  const { data: forms = [] } = useQuery<FdForm[]>({
    queryKey: ['fd_forms_workflow'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('field_data_forms').select('id,name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: reviews = [], isLoading: reviewsLoading, refetch: refetchReviews } = useQuery<FdReview[]>({
    queryKey: ['fd_submission_reviews', selectedForm, statusFilter],
    queryFn: async () => {
      let q = (supabase as any).from('fd_submission_reviews').select('*')
        .order('created_at', { ascending: false }).limit(300);
      if (selectedForm !== 'all') q = q.eq('form_id', selectedForm);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
  });

  const { data: actions = [], refetch: refetchActions } = useQuery<FdAction[]>({
    queryKey: ['fd_review_actions', selectedForm],
    queryFn: async () => {
      let q = (supabase as any).from('fd_review_actions')
        .select('*, fd_submission_reviews(submission_ref, form_id)')
        .order('performed_at', { ascending: false }).limit(200);
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
  });

  const myQueue = useMemo(() =>
    reviews.filter(r =>
      ['pending', 'under_review', 'resubmitted'].includes(r.status) &&
      (r.reviewer_id === user?.id || r.reviewer_name === (user as any)?.full_name || r.reviewer_name === user?.email)
    ), [reviews, user]);

  const signatures = useMemo(() =>
    actions.filter(a => a.action_type === 'sign'), [actions]);

  const pendingForBulk = useMemo(() =>
    reviews.filter(r => ['pending', 'under_review', 'resubmitted'].includes(r.status)), [reviews]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === pendingForBulk.length) setSelected(new Set());
    else setSelected(new Set(pendingForBulk.map(r => r.id)));
  };

  const logAction = async (reviewId: string, type: string, notes: string, sig?: string) => {
    const { error } = await (supabase as any).from('fd_review_actions').insert({
      review_id: reviewId,
      action_type: type,
      actor_name: (user as any)?.full_name ?? user?.email ?? 'Unknown',
      actor_id: user?.id ?? null,
      notes: notes || null,
      signature_text: sig ?? null,
    });
    if (error) throw error;
  };

  const performActionMutation = useMutation({
    mutationFn: async () => {
      if (!actionReview) return;
      const statusMap: Record<string, string> = {
        approve: 'approved', reject: 'rejected',
        request_correction: 'correction_requested', sign: 'approved',
      };
      await logAction(actionReview.id, actionType, actionNotes, actionType === 'sign' ? sigText : undefined);
      const { error } = await (supabase as any).from('fd_submission_reviews').update({
        status: statusMap[actionType],
        reviewer_id: user?.id ?? null,
        reviewer_name: (user as any)?.full_name ?? user?.email ?? 'Unknown',
        reviewed_at: new Date().toISOString(),
        notes: actionNotes || null,
      }).eq('id', actionReview.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_submission_reviews'] });
      qc.invalidateQueries({ queryKey: ['fd_review_actions'] });
      setActionDialog(false);
      setActionReview(null); setActionNotes(''); setSigText('');
      toast({ title: 'Review action recorded' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const bulkActionMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      const statusMap = { approve: 'approved', reject: 'rejected' };
      for (const id of ids) {
        await logAction(id, bulkAction, bulkNotes);
      }
      const { error } = await (supabase as any).from('fd_submission_reviews')
        .update({
          status: statusMap[bulkAction],
          reviewer_id: user?.id ?? null,
          reviewer_name: (user as any)?.full_name ?? user?.email ?? 'Unknown',
          reviewed_at: new Date().toISOString(),
          notes: bulkNotes || null,
        })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_submission_reviews'] });
      qc.invalidateQueries({ queryKey: ['fd_review_actions'] });
      setBulkDialog(false); setSelected(new Set()); setBulkNotes('');
      toast({ title: `${selected.size} submissions ${bulkAction}d` });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const createReviewMutation = useMutation({
    mutationFn: async () => {
      if (!nFormId || !nRef.trim()) throw new Error('Form and submission reference required.');
      const { error } = await (supabase as any).from('fd_submission_reviews').insert({
        form_id: nFormId,
        submission_ref: nRef.trim(),
        submitter_name: nSubmitter.trim() || null,
        stage: nStage.trim() || 'Data Review',
        reviewer_name: nReviewer.trim() || null,
        status: 'pending',
        submitted_at: new Date().toISOString(),
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_submission_reviews'] });
      setNewDialog(false);
      setNFormId(''); setNRef(''); setNSubmitter(''); setNStage('Data Review'); setNReviewer('');
      toast({ title: 'Submission added to review queue' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const openAction = (review: FdReview, type: 'approve' | 'reject' | 'request_correction' | 'sign') => {
    setActionReview(review);
    setActionType(type);
    setActionNotes('');
    setSigText('');
    setActionDialog(true);
  };

  const approvedCount  = reviews.filter(r => r.status === 'approved').length;
  const pendingCount   = reviews.filter(r => r.status === 'pending').length;
  const correctionCount = reviews.filter(r => r.status === 'correction_requested').length;

  const ReviewCard = ({ r, showActions = true }: { r: FdReview; showActions?: boolean }) => {
    const st = STATUS_CFG[r.status] ?? STATUS_CFG.pending;
    const formName = forms.find(f => f.id === r.form_id)?.name ?? r.form_id;
    const canAct = ['pending', 'under_review', 'resubmitted'].includes(r.status);
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3.5 space-y-2" data-testid={`card-review-${r.id}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">{r.submission_ref ?? '—'}</span>
              <Badge variant="secondary" className={cn('text-xs flex items-center gap-1', st.cls)}>
                {st.icon}{st.label}
              </Badge>
              <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-500">{r.stage}</Badge>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              <span>Form: {formName}</span>
              {r.submitter_name && <span className="ml-3">Submitter: {r.submitter_name}</span>}
              {r.reviewer_name && <span className="ml-3">Reviewer: {r.reviewer_name}</span>}
            </div>
            {r.notes && <p className="text-xs text-slate-500 italic mt-1">{r.notes}</p>}
          </div>
          <div className="text-xs text-slate-400 shrink-0">{format(parseISO(r.created_at), 'dd MMM yy')}</div>
        </div>
        {showActions && canAct && (
          <div className="flex gap-1.5 pt-1 border-t border-slate-50 dark:border-slate-800">
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              onClick={() => openAction(r, 'approve')} data-testid={`button-approve-${r.id}`}>
              <CheckCircle className="w-3 h-3" /> Approve
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1 text-amber-600 border-amber-200 hover:bg-amber-50"
              onClick={() => openAction(r, 'request_correction')} data-testid={`button-correct-${r.id}`}>
              <AlertTriangle className="w-3 h-3" /> Request Correction
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1 text-red-500 border-red-200 hover:bg-red-50"
              onClick={() => openAction(r, 'reject')} data-testid={`button-reject-${r.id}`}>
              <XCircle className="w-3 h-3" /> Reject
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              onClick={() => openAction(r, 'sign')} data-testid={`button-sign-${r.id}`}>
              <PenTool className="w-3 h-3" /> Sign
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-50 dark:bg-violet-900/30 rounded-lg">
                <FileSignature className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h1 className="font-semibold text-slate-800 dark:text-slate-100">Workflow & Review</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Multi-stage review · correction loop · bulk review · digital signatures
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedForm} onValueChange={setSelectedForm}>
                <SelectTrigger className="w-48 text-sm" data-testid="select-workflow-form">
                  <SelectValue placeholder="All forms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All forms</SelectItem>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => { refetchReviews(); refetchActions(); }} data-testid="button-refresh-workflow">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setNewDialog(true)} data-testid="button-add-review">
                <Plus className="w-4 h-4" /> Add to Queue
              </Button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="flex flex-wrap items-center gap-6 pb-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Inbox className="w-3.5 h-3.5 text-violet-500" />
              <span className={cn('font-medium', myQueue.length > 0 ? 'text-violet-700' : 'text-slate-400')}>{myQueue.length}</span> in my queue
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-medium text-slate-700">{pendingCount}</span> pending
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-medium text-emerald-700">{approvedCount}</span> approved
            </span>
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span className={cn('font-medium', correctionCount > 0 ? 'text-amber-700' : 'text-slate-400')}>{correctionCount}</span> need correction
            </span>
            <span className="flex items-center gap-1.5">
              <PenTool className="w-3.5 h-3.5 text-indigo-500" />
              <span className="font-medium text-slate-700">{signatures.length}</span> signed
            </span>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mb-px">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                  tab === t.id
                    ? 'border-violet-600 text-violet-700 dark:text-violet-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
                data-testid={`tab-workflow-${t.id}`}>
                {t.icon} {t.label}
                {t.id === 'queue' && myQueue.length > 0 && (
                  <span className="ml-1 bg-violet-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{myQueue.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ══════════════════════════ MY QUEUE ══════════════════════════════ */}
        {tab === 'queue' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-medium text-slate-800 dark:text-slate-100">My Review Queue</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Submissions assigned to you that are waiting for a review action.
              </p>
            </div>
            {reviewsLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : myQueue.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Queue is empty</p>
                <p className="text-sm text-slate-400">No submissions are waiting for your review.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myQueue.map(r => <ReviewCard key={r.id} r={r} />)}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ ALL REVIEWS ═══════════════════════════ */}
        {tab === 'all' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-medium text-slate-800 dark:text-slate-100">All Reviews</h2>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44 text-sm" data-testid="select-status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {REVIEW_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {reviewsLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : reviews.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <FileSignature className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No submissions in review</p>
                <p className="text-sm text-slate-400 mb-4">
                  Add submissions to the review queue to start the workflow.
                </p>
                <Button size="sm" className="gap-1.5" onClick={() => setNewDialog(true)}>
                  <Plus className="w-4 h-4" /> Add to Queue
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {reviews.map(r => <ReviewCard key={r.id} r={r} showActions={['pending','under_review','resubmitted'].includes(r.status)} />)}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ BULK REVIEW ═══════════════════════════ */}
        {tab === 'bulk' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-medium text-slate-800 dark:text-slate-100">Bulk Review</h2>
                <p className="text-xs text-slate-500 mt-0.5">Select multiple pending submissions and approve or reject them together.</p>
              </div>
              {selected.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">{selected.size} selected</span>
                  <Button size="sm" variant="outline" className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                    onClick={() => { setBulkAction('approve'); setBulkDialog(true); }} data-testid="button-bulk-approve">
                    <CheckCircle className="w-3.5 h-3.5" /> Approve All
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-red-500 border-red-200 hover:bg-red-50"
                    onClick={() => { setBulkAction('reject'); setBulkDialog(true); }} data-testid="button-bulk-reject">
                    <XCircle className="w-3.5 h-3.5" /> Reject All
                  </Button>
                </div>
              )}
            </div>

            {pendingForBulk.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No pending submissions</p>
                <p className="text-sm text-slate-400">All submissions have been reviewed.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                  <Checkbox
                    checked={selected.size === pendingForBulk.length && pendingForBulk.length > 0}
                    onCheckedChange={toggleAll}
                    data-testid="checkbox-select-all"
                  />
                  <span className="text-xs text-slate-500">Select all ({pendingForBulk.length})</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {['', 'Submission Ref', 'Form', 'Submitter', 'Stage', 'Status', 'Date'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingForBulk.map((r, i) => {
                      const st = STATUS_CFG[r.status] ?? STATUS_CFG.pending;
                      return (
                        <tr key={r.id}
                          className={cn('border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40',
                            selected.has(r.id) && 'bg-violet-50 dark:bg-violet-900/10',
                            i % 2 === 1 && !selected.has(r.id) && 'bg-slate-50/30')}
                          onClick={() => toggleSelect(r.id)}
                          data-testid={`row-bulk-${r.id}`}>
                          <td className="px-4 py-3">
                            <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} data-testid={`checkbox-${r.id}`} />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-600">{r.submission_ref ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[140px] truncate">{forms.find(f => f.id === r.form_id)?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{r.submitter_name ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{r.stage}</td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className={cn('text-xs flex items-center gap-1 w-fit', st.cls)}>
                              {st.icon}{st.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {format(parseISO(r.created_at), 'dd MMM yy')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ SIGNATURES ════════════════════════════ */}
        {tab === 'signatures' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-medium text-slate-800 dark:text-slate-100">Digital Signatures</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Log of all signed-off submissions. Signatures are name-based attestations recorded with timestamp and reviewer identity.
              </p>
            </div>
            {signatures.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <PenTool className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No signatures yet</p>
                <p className="text-sm text-slate-400">Use the Sign button on any submission in the review queue to add a digital attestation.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {signatures.map(sig => {
                  const formId = sig.fd_submission_reviews?.form_id;
                  const formName = forms.find(f => f.id === formId)?.name ?? '—';
                  return (
                    <div key={sig.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-start gap-4" data-testid={`card-sig-${sig.id}`}>
                      <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                        <PenTool className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-sm font-semibold text-indigo-600">{sig.fd_submission_reviews?.submission_ref ?? '—'}</span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs text-slate-500">{formName}</span>
                        </div>
                        {sig.signature_text && (
                          <div className="text-sm font-medium text-slate-700 dark:text-slate-200 italic border-l-2 border-indigo-300 pl-3 mb-1">
                            "{sig.signature_text}"
                          </div>
                        )}
                        <div className="text-xs text-slate-400">
                          Signed by <span className="font-medium text-slate-600">{sig.actor_name ?? 'Unknown'}</span>
                          {' · '}{format(parseISO(sig.performed_at), 'HH:mm dd MMM yyyy')}
                        </div>
                        {sig.notes && <p className="text-xs text-slate-400 italic mt-1">{sig.notes}</p>}
                      </div>
                      <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 shrink-0">
                        <CheckCircle className="w-3 h-3 mr-1" /> Signed
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Review Action Dialog ──────────────────────────────────────────── */}
      <Dialog open={actionDialog} onOpenChange={setActionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' && 'Approve Submission'}
              {actionType === 'reject' && 'Reject Submission'}
              {actionType === 'request_correction' && 'Request Correction'}
              {actionType === 'sign' && 'Sign Submission'}
            </DialogTitle>
          </DialogHeader>
          {actionReview && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500">
                <span className="font-mono font-semibold text-indigo-600">{actionReview.submission_ref}</span>
                {' · '}{actionReview.stage}{' · '}{actionReview.submitter_name ?? '—'}
              </div>
              {actionType === 'sign' && (
                <div>
                  <Label>Signature / Attestation <span className="text-red-500">*</span></Label>
                  <Input className="mt-1" placeholder="e.g. I confirm this submission is accurate — John Doe"
                    value={sigText} onChange={e => setSigText(e.target.value)} data-testid="input-signature" />
                </div>
              )}
              <div>
                <Label>{actionType === 'sign' ? 'Notes (optional)' : 'Notes / Reason'}</Label>
                <Textarea className="mt-1" rows={3}
                  placeholder={actionType === 'request_correction' ? 'Describe what needs to be corrected…' : 'Optional notes…'}
                  value={actionNotes} onChange={e => setActionNotes(e.target.value)}
                  data-testid="input-action-notes" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(false)}>Cancel</Button>
            <Button
              onClick={() => performActionMutation.mutate()}
              disabled={performActionMutation.isPending || (actionType === 'sign' && !sigText.trim())}
              className={cn(
                actionType === 'approve' || actionType === 'sign' ? 'bg-emerald-600 hover:bg-emerald-700' :
                actionType === 'reject' ? 'bg-red-600 hover:bg-red-700' : ''
              )}
              data-testid="button-confirm-action">
              {performActionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {actionType === 'approve' && <><CheckCircle className="w-4 h-4 mr-2" />Approve</>}
              {actionType === 'reject' && <><XCircle className="w-4 h-4 mr-2" />Reject</>}
              {actionType === 'request_correction' && <><AlertTriangle className="w-4 h-4 mr-2" />Request Correction</>}
              {actionType === 'sign' && <><PenTool className="w-4 h-4 mr-2" />Sign</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Action Dialog ────────────────────────────────────────────── */}
      <Dialog open={bulkDialog} onOpenChange={setBulkDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{bulkAction === 'approve' ? 'Bulk Approve' : 'Bulk Reject'} {selected.size} submission{selected.size !== 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Notes (applied to all)</Label>
              <Textarea className="mt-1" rows={3} placeholder="Optional bulk review notes…"
                value={bulkNotes} onChange={e => setBulkNotes(e.target.value)} data-testid="input-bulk-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(false)}>Cancel</Button>
            <Button
              onClick={() => bulkActionMutation.mutate()}
              disabled={bulkActionMutation.isPending}
              className={bulkAction === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
              data-testid="button-confirm-bulk">
              {bulkActionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm {bulkAction === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add to Queue Dialog ────────────────────────────────────────────── */}
      <Dialog open={newDialog} onOpenChange={setNewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Submission to Review Queue</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Form <span className="text-red-500">*</span></Label>
              <Select value={nFormId} onValueChange={setNFormId}>
                <SelectTrigger className="mt-1" data-testid="select-review-form"><SelectValue placeholder="Select form…" /></SelectTrigger>
                <SelectContent>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Submission Ref <span className="text-red-500">*</span></Label>
                <Input className="mt-1" placeholder="e.g. uuid or #042" value={nRef} onChange={e => setNRef(e.target.value)} data-testid="input-review-ref" />
              </div>
              <div>
                <Label>Submitter Name</Label>
                <Input className="mt-1" placeholder="Enumerator name" value={nSubmitter} onChange={e => setNSubmitter(e.target.value)} data-testid="input-review-submitter" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Review Stage</Label>
                <Input className="mt-1" placeholder="e.g. Data Review" value={nStage} onChange={e => setNStage(e.target.value)} data-testid="input-review-stage" />
              </div>
              <div>
                <Label>Assign Reviewer</Label>
                <Input className="mt-1" placeholder="Reviewer name" value={nReviewer} onChange={e => setNReviewer(e.target.value)} data-testid="input-review-reviewer" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialog(false)}>Cancel</Button>
            <Button onClick={() => createReviewMutation.mutate()} disabled={!nFormId || !nRef.trim() || createReviewMutation.isPending} data-testid="button-save-review">
              {createReviewMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Send className="w-4 h-4 mr-2" /> Add to Queue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
