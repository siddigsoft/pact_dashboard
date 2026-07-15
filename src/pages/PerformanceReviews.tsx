import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  Star, Plus, Edit2, Trash2, Loader2, CheckCircle2, Clock,
  User, Search, FileText, BarChart2, Send, ChevronDown, ChevronUp,
  Award, Target, BookOpen, TrendingUp, X, Download, Users,
  GitMerge, Sliders, UserCheck, UserX, EyeOff, ArrowRight,
} from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/use-authorization';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/context/AppContext';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────

interface Profile { id: string; full_name: string; role?: string; }

interface Review {
  id: string;
  reviewee_id: string;
  reviewer_id: string | null;
  review_period: string;
  review_type: string;
  status: string;
  cycle_phase: string;
  self_assessment_enabled: boolean;
  peer_feedback_enabled: boolean;
  overall_rating: number | null;
  goals: Goal[];
  competencies: Competency[];
  self_assessment: string | null;
  manager_comments: string | null;
  strengths: string | null;
  development_areas: string | null;
  next_goals: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  reviewee_name?: string;
  reviewer_name?: string;
}

interface Goal { id: string; title: string; description?: string; rating?: number; completion?: number; }
interface Competency { id: string; name: string; rating: number; comments?: string; }

interface SelfAssessment {
  id: string;
  review_id: string;
  user_id: string;
  ratings: Record<string, number>;
  comments: string | null;
  submitted_at: string | null;
}

interface PeerNomination {
  id: string;
  review_id: string;
  reviewee_id: string;
  nominee_id: string;
  approved: boolean | null;
  feedback: Record<string, { rating: number; comment: string }> | null;
  submitted_at: string | null;
  reviewee_name?: string;
  review_period?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const COMPETENCIES_TEMPLATE: Omit<Competency, 'rating'>[] = [
  { id: 'quality',        name: 'Work Quality & Accuracy' },
  { id: 'communication',  name: 'Communication & Collaboration' },
  { id: 'initiative',     name: 'Initiative & Problem Solving' },
  { id: 'teamwork',       name: 'Teamwork & Interpersonal Skills' },
  { id: 'leadership',     name: 'Leadership & Mentoring' },
  { id: 'adaptability',   name: 'Adaptability & Learning' },
];

const STATUS_CFG: Record<string, { label: string; badge: string; icon: ReactNode }> = {
  draft:     { label: 'Draft',          badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800',           icon: <FileText   className="h-3.5 w-3.5" /> },
  submitted: { label: 'Self-Submitted', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40',         icon: <Send       className="h-3.5 w-3.5" /> },
  in_review: { label: 'Manager Review', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40',      icon: <Clock      className="h-3.5 w-3.5" /> },
  completed: { label: 'Completed',      badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40',icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
};

const PHASE_CFG: Record<string, { label: string; color: string }> = {
  not_started:    { label: 'Not Started',     color: 'bg-gray-100 text-gray-600' },
  self_assessment:{ label: 'Self-Assessment', color: 'bg-blue-100 text-blue-700' },
  peer_feedback:  { label: 'Peer Feedback',   color: 'bg-purple-100 text-purple-700' },
  manager_review: { label: 'Manager Review',  color: 'bg-amber-100 text-amber-700' },
  calibration:    { label: 'Calibration',     color: 'bg-orange-100 text-orange-700' },
  published:      { label: 'Published',       color: 'bg-emerald-100 text-emerald-700' },
};

const REVIEW_TYPES = ['annual', 'mid_year', 'probation', 'project_completion', 'quarterly'];

const PHASE_ORDER = ['not_started', 'self_assessment', 'peer_feedback', 'manager_review', 'calibration', 'published'];

type ReviewTab = 'my' | 'all' | 'pending' | 'self-assess' | 'peer' | 'calibrate' | 'progress';

// ── Sub-components ───────────────────────────────────────────────────────────

function StarRating({ value, onChange, readonly }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" disabled={readonly}
          onClick={() => onChange?.(n)}
          className={cn('transition-colors', readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110')}>
          <Star className={cn('h-4 w-4', n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600')} />
        </button>
      ))}
    </div>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  const cfg = PHASE_CFG[phase] ?? PHASE_CFG.not_started;
  return <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', cfg.color)}>{cfg.label}</span>;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function PerformanceReviews() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const { hasAnyRole } = useAuthorization();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr', 'hr_admin', 'manager']);

  // ── Core data ──────────────────────────────────────────────────────────────
  const [reviews, setReviews]   = useState<Review[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selfAssessments, setSelfAssessments] = useState<SelfAssessment[]>([]);
  const [nominations, setNominations]         = useState<PeerNomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]   = useState<ReviewTab>('my');
  const [search, setSearch] = useState('');

  // ── Create/edit dialog ─────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editing, setEditing]         = useState<Review | null>(null);
  const [saving, setSaving]           = useState(false);
  const [form, setForm] = useState({
    reviewee_id: '', review_period: '', review_type: 'annual',
    self_assessment: '', manager_comments: '', strengths: '',
    development_areas: '', next_goals: '', overall_rating: 0,
    goals: [] as Goal[],
    competencies: COMPETENCIES_TEMPLATE.map(c => ({ ...c, rating: 0, comments: '' })) as Competency[],
    self_assessment_enabled: false,
    peer_feedback_enabled:   false,
  });

  // ── Detail view ────────────────────────────────────────────────────────────
  const [detailOpen, setDetailOpen]   = useState(false);
  const [viewing, setViewing]         = useState<Review | null>(null);

  // ── Self-assessment dialog ─────────────────────────────────────────────────
  const [saOpen, setSaOpen]             = useState(false);
  const [saReview, setSaReview]         = useState<Review | null>(null);
  const [saRatings, setSaRatings]       = useState<Record<string, number>>({});
  const [saComments, setSaComments]     = useState('');
  const [saSubmitting, setSaSubmitting] = useState(false);

  // ── Peer nomination dialog ─────────────────────────────────────────────────
  const [nomOpen, setNomOpen]                 = useState(false);
  const [nomReview, setNomReview]             = useState<Review | null>(null);
  const [nomSearch, setNomSearch]             = useState('');
  const [selectedNominees, setSelectedNominees] = useState<string[]>([]);
  const [nomSubmitting, setNomSubmitting]     = useState(false);

  // ── Peer feedback dialog ───────────────────────────────────────────────────
  const [pfOpen, setPfOpen]           = useState(false);
  const [pfNom, setPfNom]             = useState<PeerNomination | null>(null);
  const [pfRatings, setPfRatings]     = useState<Record<string, number>>({});
  const [pfComments, setPfComments]   = useState<Record<string, string>>({});
  const [pfSubmitting, setPfSubmitting] = useState(false);

  // ── Calibration dialog ─────────────────────────────────────────────────────
  const [calibOpen, setCalibOpen]   = useState(false);
  const [calibData, setCalibData]   = useState<Record<string, { compRatings: Record<string, number>; reason: string; overall: number }>>({});
  const [calibSaving, setCalibSaving] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [revRes, saRes, nomRes, profRes] = await Promise.all([
      supabase.from('performance_reviews').select('*').order('created_at', { ascending: false }),
      supabase.from('hr_review_self_assessments').select('*'),
      supabase.from('hr_review_peer_nominations').select('*'),
      supabase.from('profiles').select('id, full_name, role').order('full_name'),
    ]);

    const pm = Object.fromEntries((profRes.data ?? []).map((p: any) => [p.id, p.full_name]));
    setProfiles((profRes.data ?? []) as Profile[]);
    setSelfAssessments((saRes.data ?? []) as SelfAssessment[]);

    const revData = (revRes.data ?? []).map((r: any) => ({
      ...r,
      goals: r.goals ?? [],
      competencies: r.competencies ?? [],
      self_assessment_enabled: r.self_assessment_enabled ?? false,
      peer_feedback_enabled:   r.peer_feedback_enabled ?? false,
      cycle_phase: r.cycle_phase ?? 'manager_review',
      reviewee_name: pm[r.reviewee_id] ?? 'Unknown',
      reviewer_name: r.reviewer_id ? (pm[r.reviewer_id] ?? 'Unknown') : null,
    }));
    setReviews(revData);

    const nomData = (nomRes.data ?? []).map((n: any) => {
      const rev = revData.find((r: Review) => r.id === n.review_id);
      return { ...n, reviewee_name: pm[n.reviewee_id] ?? 'Unknown', review_period: rev?.review_period ?? '' };
    });
    setNominations(nomData as PeerNomination[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('perf-reviews-360')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'performance_reviews' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_review_self_assessments' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_review_peer_nominations' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const myReviews     = reviews.filter(r => r.reviewee_id === currentUser?.id);
  const pendingReviews = reviews.filter(r => r.status === 'submitted' && isAdmin);

  // Reviews where the current user still needs to self-assess
  const pendingSelfAssess = myReviews.filter(r =>
    r.self_assessment_enabled &&
    r.cycle_phase === 'self_assessment' &&
    !selfAssessments.some(sa => sa.review_id === r.id && sa.submitted_at)
  );

  // Nominations where current user is the nominee, approved, and hasn't submitted feedback yet
  const pendingPeerFeedback = nominations.filter(n =>
    n.nominee_id === currentUser?.id &&
    n.approved === true &&
    !n.submitted_at
  );

  // Team reviews in calibration phase only (admin). Never re-open already-published reviews.
  const calibrationReviews = isAdmin
    ? reviews.filter(r => r.cycle_phase === 'calibration')
    : [];

  const filtered = (
    tab === 'my'     ? myReviews :
    tab === 'pending' ? pendingReviews :
    tab === 'self-assess' ? pendingSelfAssess :
    tab === 'peer'   ? [] :
    tab === 'calibrate' ? calibrationReviews :
    reviews
  ).filter(r => !search ||
    r.reviewee_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.review_period.toLowerCase().includes(search.toLowerCase())
  );

  // ── Create / Edit ──────────────────────────────────────────────────────────
  function openNew() {
    setEditing(null);
    setForm({
      reviewee_id: currentUser?.id ?? '', review_period: '', review_type: 'annual',
      self_assessment: '', manager_comments: '', strengths: '',
      development_areas: '', next_goals: '', overall_rating: 0,
      goals: [],
      competencies: COMPETENCIES_TEMPLATE.map(c => ({ ...c, rating: 0, comments: '' })),
      self_assessment_enabled: false, peer_feedback_enabled: false,
    });
    setDialogOpen(true);
  }

  function openEdit(rev: Review) {
    setEditing(rev);
    setForm({
      reviewee_id: rev.reviewee_id, review_period: rev.review_period, review_type: rev.review_type,
      self_assessment: rev.self_assessment ?? '', manager_comments: rev.manager_comments ?? '',
      strengths: rev.strengths ?? '', development_areas: rev.development_areas ?? '',
      next_goals: rev.next_goals ?? '', overall_rating: rev.overall_rating ?? 0,
      goals: rev.goals ?? [],
      competencies: rev.competencies?.length
        ? rev.competencies
        : COMPETENCIES_TEMPLATE.map(c => ({ ...c, rating: 0, comments: '' })),
      self_assessment_enabled: rev.self_assessment_enabled ?? false,
      peer_feedback_enabled:   rev.peer_feedback_enabled ?? false,
    });
    setDialogOpen(true);
  }

  async function handleSave(submitForReview = false) {
    if (!form.reviewee_id || !form.review_period) return;
    setSaving(true);
    const ratedComps = form.competencies.filter(c => (c.rating ?? 0) > 0);
    const avgRating  = ratedComps.length
      ? ratedComps.reduce((s, c) => s + c.rating, 0) / ratedComps.length
      : form.overall_rating;

    // Phase for NEW reviews only. Edits never reset cycle_phase — phase advances via explicit actions.
    const initialPhase = submitForReview
      ? (form.self_assessment_enabled ? 'self_assessment'
         : form.peer_feedback_enabled  ? 'peer_feedback'
         : 'manager_review')
      : 'not_started';

    // When editing a draft/not_started and clicking "Submit for Review", advance the phase.
    // All other edit saves preserve the existing cycle_phase and status.
    const editingDraft = editing && (editing.status === 'draft' || editing.status === 'not_started');
    const phaseForEdit = editingDraft && submitForReview ? initialPhase : undefined;

    const payload: any = {
      reviewee_id: form.reviewee_id, review_period: form.review_period, review_type: form.review_type,
      self_assessment: form.self_assessment || null,
      manager_comments: isAdmin ? (form.manager_comments || null) : undefined,
      strengths: form.strengths || null, development_areas: form.development_areas || null,
      next_goals: form.next_goals || null,
      overall_rating: Number(avgRating.toFixed(1)),
      goals: form.goals, competencies: form.competencies,
      self_assessment_enabled: form.self_assessment_enabled,
      peer_feedback_enabled:   form.peer_feedback_enabled,
      // Edits: only change status if submitting a draft; otherwise preserve existing status
      status: submitForReview ? 'submitted' : (editing ? editing.status : 'draft'),
      submitted_at: submitForReview ? new Date().toISOString() : undefined,
      reviewer_id: isAdmin ? currentUser?.id : undefined,
      updated_at: new Date().toISOString(),
    };

    const saveOp = editing
      ? supabase.from('performance_reviews').update({
          ...payload,
          ...(phaseForEdit ? { cycle_phase: phaseForEdit } : {}),
        }).eq('id', editing.id)
      : supabase.from('performance_reviews').insert({
          ...payload, cycle_phase: initialPhase, created_at: new Date().toISOString(),
        }).select().single();

    const { error } = await saveOp as any;
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: submitForReview ? 'Review submitted' : 'Review saved' });
      if (submitForReview && form.self_assessment_enabled) {
        const revieweeName = profiles.find(p => p.id === form.reviewee_id)?.full_name ?? 'Staff';
        await NotificationTriggerService.send({
          userId: form.reviewee_id,
          title: 'Self-Assessment Due',
          message: `Your ${form.review_type} self-assessment for ${form.review_period} is ready. Please complete it before your manager review.`,
          type: 'info', category: 'approvals', priority: 'high',
          link: '/performance-reviews',
          sendEmail: true, emailActionUrl: '/performance-reviews', emailActionLabel: 'Complete Self-Assessment',
        });
      }
      setDialogOpen(false);
      fetchAll();
    }
    setSaving(false);
  }

  async function markCompleted(id: string) {
    const rev = reviews.find(r => r.id === id);

    // Gate: block completion if self-assessment is required but not yet submitted
    if (rev?.self_assessment_enabled) {
      const hasSa = selfAssessments.some(sa => sa.review_id === id && sa.submitted_at);
      if (!hasSa) {
        toast({
          title: 'Cannot complete review',
          description: 'The employee must submit their self-assessment before this review can be finalised.',
          variant: 'destructive',
        });
        return;
      }
    }

    // Gate: block completion if still in peer-feedback phase (outstanding nominees)
    if (rev?.cycle_phase === 'peer_feedback') {
      const outstanding = nominations.filter(
        n => n.review_id === id && n.approved && !n.submitted_at
      );
      if (outstanding.length > 0) {
        toast({
          title: 'Cannot complete review',
          description: `${outstanding.length} approved peer(s) have not yet submitted feedback. Use "Skip peer feedback" to advance manually.`,
          variant: 'destructive',
        });
        return;
      }
    }

    const { error } = await supabase.from('performance_reviews').update({
      status: 'completed', cycle_phase: 'published', reviewed_at: new Date().toISOString(), reviewer_id: currentUser?.id,
    }).eq('id', id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    if (rev?.reviewee_id) {
      await NotificationTriggerService.send({
        userId: rev.reviewee_id,
        title: 'Performance Review Completed',
        message: `Your ${rev.review_type} review for ${rev.review_period} has been completed. View your results.`,
        type: 'success', category: 'team', priority: 'high',
        link: '/performance-reviews', sendEmail: true,
        emailActionUrl: '/performance-reviews', emailActionLabel: 'View My Review',
      });
    }
    toast({ title: 'Review marked completed' });
    fetchAll();
  }

  async function moveToCalibration(id: string) {
    const rev = reviews.find(r => r.id === id);
    if (!rev) return;
    const { error } = await supabase.from('performance_reviews')
      .update({ cycle_phase: 'calibration', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    // Notify reviewer/HR that review is ready for calibration
    await NotificationTriggerService.send({
      userId: currentUser!.id,
      title: 'Review Moved to Calibration',
      message: `${rev.reviewee_name}'s ${rev.review_period} review is now in the calibration queue.`,
      type: 'info', category: 'team', priority: 'normal',
      link: '/performance-reviews',
    });
    toast({ title: 'Moved to calibration queue' });
    fetchAll();
  }

  async function deleteReview(id: string) {
    const { error } = await supabase.from('performance_reviews').delete().eq('id', id);
    if (error) { toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Review deleted' });
    setReviews(p => p.filter(r => r.id !== id));
  }

  // ── Self-Assessment ────────────────────────────────────────────────────────
  function openSelfAssess(rev: Review) {
    setSaReview(rev);
    const existing = selfAssessments.find(sa => sa.review_id === rev.id && sa.user_id === currentUser?.id);
    setSaRatings(existing?.ratings ?? {});
    setSaComments(existing?.comments ?? '');
    setSaOpen(true);
  }

  async function submitSelfAssessment() {
    if (!saReview || !currentUser) return;
    setSaSubmitting(true);
    const existing = selfAssessments.find(sa => sa.review_id === saReview.id && sa.user_id === currentUser.id);
    const payload = {
      review_id: saReview.id, user_id: currentUser.id,
      ratings: saRatings, comments: saComments || null, submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const op = existing
      ? supabase.from('hr_review_self_assessments').update(payload).eq('id', existing.id)
      : supabase.from('hr_review_self_assessments').insert(payload);
    const { error } = await op;
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); setSaSubmitting(false); return; }

    // Advance cycle phase
    const nextPhase = saReview.peer_feedback_enabled ? 'peer_feedback' : 'manager_review';
    await supabase.from('performance_reviews').update({ cycle_phase: nextPhase }).eq('id', saReview.id);

    // Notify manager/HR
    await NotificationTriggerService.sendToRoles(['super_admin', 'admin', 'hr', 'hr_admin', 'manager'], {
      title: 'Self-Assessment Submitted',
      message: `${currentUser?.email ?? 'An employee'} submitted their self-assessment for ${saReview.review_period}. Ready for peer feedback or manager review.`,
      type: 'info', category: 'approvals', priority: 'normal',
      link: '/performance-reviews', sendEmail: true,
      emailActionUrl: '/performance-reviews', emailActionLabel: 'Open Reviews',
    });

    toast({ title: 'Self-assessment submitted' });
    setSaOpen(false);
    fetchAll();
    setSaSubmitting(false);
  }

  // ── Peer Nominations ───────────────────────────────────────────────────────
  function openNominate(rev: Review) {
    setNomReview(rev);
    setNomSearch('');
    const existingNoms = nominations.filter(n => n.review_id === rev.id && n.reviewee_id === currentUser?.id);
    setSelectedNominees(existingNoms.map(n => n.nominee_id));
    setNomOpen(true);
  }

  async function submitNominations() {
    if (!nomReview || !currentUser) return;
    if (selectedNominees.length < 2) { toast({ title: 'Nominate at least 2 peers', variant: 'destructive' }); return; }
    setNomSubmitting(true);
    const existing = nominations.filter(n => n.review_id === nomReview.id && n.reviewee_id === currentUser.id).map(n => n.nominee_id);
    const toAdd    = selectedNominees.filter(id => !existing.includes(id));
    const toRemove = existing.filter(id => !selectedNominees.includes(id));
    if (toAdd.length) {
      await supabase.from('hr_review_peer_nominations').insert(
        toAdd.map(nominee_id => ({ review_id: nomReview.id, reviewee_id: currentUser.id, nominee_id, approved: null }))
      );
    }
    if (toRemove.length) {
      for (const nid of toRemove) {
        await supabase.from('hr_review_peer_nominations')
          .delete().eq('review_id', nomReview.id).eq('reviewee_id', currentUser.id).eq('nominee_id', nid);
      }
    }
    toast({ title: 'Nominations saved', description: 'Pending HR/manager approval.' });
    setNomOpen(false);
    fetchAll();
    setNomSubmitting(false);
  }

  async function approveNomination(id: string, approved: boolean) {
    const { error } = await supabase.from('hr_review_peer_nominations').update({ approved }).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    if (approved) {
      const nom = nominations.find(n => n.id === id);
      if (nom) {
        await NotificationTriggerService.send({
          userId: nom.nominee_id,
          title: 'Peer Feedback Requested',
          message: `You have been nominated to provide peer feedback for ${nom.reviewee_name} (${nom.review_period}). Please complete your feedback.`,
          type: 'info', category: 'approvals', priority: 'high',
          link: '/performance-reviews', sendEmail: true,
          emailActionUrl: '/performance-reviews', emailActionLabel: 'Give Feedback',
        });
      }
    }
    fetchAll();
  }

  // ── Peer Feedback ──────────────────────────────────────────────────────────
  function openPeerFeedback(nom: PeerNomination) {
    setPfNom(nom);
    const fb = nom.feedback ?? {};
    const ratings: Record<string, number> = {};
    const comments: Record<string, string> = {};
    for (const comp of COMPETENCIES_TEMPLATE) {
      ratings[comp.id]  = fb[comp.id]?.rating ?? 0;
      comments[comp.id] = fb[comp.id]?.comment ?? '';
    }
    setPfRatings(ratings);
    setPfComments(comments);
    setPfOpen(true);
  }

  async function submitPeerFeedback() {
    if (!pfNom) return;
    setPfSubmitting(true);
    const feedback: Record<string, { rating: number; comment: string }> = {};
    for (const comp of COMPETENCIES_TEMPLATE) {
      feedback[comp.id] = { rating: pfRatings[comp.id] ?? 0, comment: pfComments[comp.id] ?? '' };
    }
    const { error } = await supabase.from('hr_review_peer_nominations').update({
      feedback, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', pfNom.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); setPfSubmitting(false); return; }
    toast({ title: 'Peer feedback submitted', description: 'Thank you — your response is anonymous to the reviewee.' });
    setPfOpen(false);
    fetchAll();
    setPfSubmitting(false);
  }

  // ── Calibration ────────────────────────────────────────────────────────────
  function openCalibration() {
    const initial: Record<string, { compRatings: Record<string, number>; reason: string; overall: number }> = {};
    for (const rev of calibrationReviews) {
      const compRatings: Record<string, number> = {};
      for (const c of (rev.competencies ?? [])) {
        compRatings[c.id] = c.rating ?? 0;
      }
      // Seed any missing competencies from template
      for (const c of COMPETENCIES_TEMPLATE) {
        if (!(c.id in compRatings)) compRatings[c.id] = 0;
      }
      initial[rev.id] = { compRatings, reason: '', overall: rev.overall_rating ?? 0 };
    }
    setCalibData(initial);
    setCalibOpen(true);
  }

  function updateCalibComp(revId: string, compId: string, value: number) {
    const rev = reviews.find(r => r.id === revId);
    if (!rev) return;
    setCalibData(p => {
      const existing = p[revId] ?? {
        compRatings: Object.fromEntries(COMPETENCIES_TEMPLATE.map(c => [c.id, 0])),
        reason: '', overall: rev.overall_rating ?? 0,
      };
      const newRatings = { ...existing.compRatings, [compId]: value };
      const vals = Object.values(newRatings).filter(v => (v as number) > 0) as number[];
      const newOverall = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : existing.overall;
      return { ...p, [revId]: { ...existing, compRatings: newRatings, overall: Number(newOverall.toFixed(1)) } };
    });
  }

  async function saveCalibration() {
    setCalibSaving(true);
    // Audit log: save calibration adjustments for reviews where overall changed
    const adjOps = Object.entries(calibData)
      .filter(([revId, d]) => {
        const rev = reviews.find(r => r.id === revId);
        return rev && d.overall !== rev.overall_rating;
      })
      .map(([revId, d]) => {
        const rev = reviews.find(r => r.id === revId)!;
        return supabase.from('hr_review_calibration_adjustments').upsert({
          review_id: revId, user_id: rev.reviewee_id,
          original_score: rev.overall_rating!, adjusted_score: d.overall,
          adjustment_reason: d.reason || null, adjusted_by: currentUser?.id,
          adjusted_at: new Date().toISOString(),
        }, { onConflict: 'review_id,user_id' });
      });
    await Promise.all(adjOps);

    // Update all calibrated reviews: per-competency ratings + overall + publish
    const updateOps = Object.entries(calibData).map(([revId, d]) => {
      const rev = reviews.find(r => r.id === revId)!;
      const updatedComps = (rev.competencies ?? []).map((c: any) => ({
        ...c,
        rating: d.compRatings[c.id] !== undefined ? d.compRatings[c.id] : c.rating,
      }));
      return supabase.from('performance_reviews').update({
        competencies: updatedComps,
        overall_rating: d.overall,
        cycle_phase: 'published',
        status: 'completed',
        reviewed_at: new Date().toISOString(),
      }).eq('id', revId);
    });
    await Promise.all(updateOps);

    toast({ title: 'Calibration saved', description: 'All scores updated and cycle published.' });
    setCalibOpen(false);
    fetchAll();
    setCalibSaving(false);
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function exportReviews() {
    exportToExcel(filtered.map(r => ({
      'Employee': r.reviewee_name ?? '',
      'Review Period': r.review_period,
      'Review Type': r.review_type,
      'Reviewer': r.reviewer_name ?? '',
      'Status': STATUS_CFG[r.status]?.label ?? r.status,
      'Phase': PHASE_CFG[r.cycle_phase]?.label ?? r.cycle_phase,
      'Overall Rating': r.overall_rating ?? '',
      'Self-Assess Enabled': r.self_assessment_enabled ? 'Yes' : 'No',
      'Peer Feedback Enabled': r.peer_feedback_enabled ? 'Yes' : 'No',
      'Strengths': r.strengths ?? '',
      'Development Areas': r.development_areas ?? '',
    })), 'Performance Reviews', `performance-reviews-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = {
    total:     myReviews.length,
    completed: myReviews.filter(r => r.status === 'completed').length,
    avgRating: (() => {
      const rated = myReviews.filter(r => r.overall_rating);
      return rated.length ? rated.reduce((s, r) => s + (r.overall_rating ?? 0), 0) / rated.length : 0;
    })(),
    pending: pendingReviews.length,
  };

  // ── Cycle progress board data ──────────────────────────────────────────────
  const progressBoard = useMemo(() => {
    const map: Record<string, Review[]> = {};
    for (const phase of PHASE_ORDER) map[phase] = [];
    for (const rev of reviews) {
      const p = rev.cycle_phase ?? 'not_started';
      (map[p] ?? (map['not_started'] = [])).push(rev);
    }
    return map;
  }, [reviews]);

  // ── Peer aggregate for manager view ───────────────────────────────────────
  function getPeerAggregate(reviewId: string) {
    const submitted = nominations.filter(n => n.review_id === reviewId && n.submitted_at && n.feedback);
    if (!submitted.length) return null;
    const agg: Record<string, { totalRating: number; count: number; comments: string[] }> = {};
    for (const nom of submitted) {
      for (const [cid, fb] of Object.entries(nom.feedback ?? {})) {
        if (!agg[cid]) agg[cid] = { totalRating: 0, count: 0, comments: [] };
        agg[cid].totalRating += fb.rating;
        agg[cid].count++;
        if (fb.comment) agg[cid].comments.push(fb.comment);
      }
    }
    return agg;
  }

  // ── Distribution data for calibration chart ────────────────────────────────
  const distData = useMemo(() => {
    const buckets: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const [, d] of Object.entries(calibData)) {
      const bucket = String(Math.round(d.overall));
      if (buckets[bucket] !== undefined) buckets[bucket]++;
    }
    return Object.entries(buckets).map(([score, count]) => ({ score, count }));
  }, [calibData]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6 text-amber-500" />
            Performance Reviews
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">360° appraisals, self-assessment & calibration</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && calibrationReviews.length > 0 && (
            <Button variant="outline" onClick={openCalibration} data-testid="btn-calibrate">
              <Sliders className="h-4 w-4 mr-1" />Calibrate Team
            </Button>
          )}
          <Button onClick={openNew} data-testid="btn-new-review">
            <Plus className="h-4 w-4 mr-1" />Start Review
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'My Reviews',     value: stats.total,     icon: <FileText     className="h-4 w-4" />, color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Completed',      value: stats.completed, icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Avg Rating',     value: stats.avgRating ? stats.avgRating.toFixed(1) + ' ★' : '—', icon: <Star className="h-4 w-4" />, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'Pending Review', value: stats.pending,   icon: <Clock        className="h-4 w-4" />, color: 'text-orange-600',  bg: 'bg-orange-50 dark:bg-orange-900/20' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-lg p-3 flex items-center gap-3', s.bg)}>
            <span className={s.color}>{s.icon}</span>
            <div>
              <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Tabs value={tab} onValueChange={v => setTab(v as ReviewTab)}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="my">My Reviews</TabsTrigger>
            {pendingSelfAssess.length > 0 && (
              <TabsTrigger value="self-assess" className="gap-1">
                Self-Assess
                <Badge className="h-4 px-1 text-[10px] bg-blue-500 text-white">{pendingSelfAssess.length}</Badge>
              </TabsTrigger>
            )}
            {pendingPeerFeedback.length > 0 && (
              <TabsTrigger value="peer" className="gap-1">
                Peer Feedback
                <Badge className="h-4 px-1 text-[10px] bg-purple-500 text-white">{pendingPeerFeedback.length}</Badge>
              </TabsTrigger>
            )}
            {isAdmin && <TabsTrigger value="all">All Staff</TabsTrigger>}
            {isAdmin && (
              <TabsTrigger value="pending" className="gap-1">
                Pending
                {pendingReviews.length > 0 && <Badge className="h-4 px-1 text-[10px] bg-amber-500 text-white">{pendingReviews.length}</Badge>}
              </TabsTrigger>
            )}
            {isAdmin && <TabsTrigger value="calibrate">Calibration</TabsTrigger>}
            {isAdmin && <TabsTrigger value="progress">Cycle Progress</TabsTrigger>}
          </TabsList>
        </Tabs>
        <div className="flex gap-2 items-center">
          {tab !== 'peer' && tab !== 'progress' && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 w-44" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          )}
          <Button size="sm" variant="outline" onClick={exportReviews} data-testid="button-export-reviews">
            <Download className="h-4 w-4 mr-1" />Export
          </Button>
        </div>
      </div>

      {/* ── Tab: Peer Feedback (nominee view) ──────────────────────────────── */}
      {tab === 'peer' && (
        <div className="space-y-3">
          {pendingPeerFeedback.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No pending peer feedback requests.</p>
            </div>
          ) : pendingPeerFeedback.map(nom => (
            <Card key={nom.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{nom.reviewee_name}</p>
                  <p className="text-sm text-muted-foreground">{nom.review_period}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <EyeOff className="h-3 w-3" />Your feedback is anonymous to the reviewee
                  </p>
                </div>
                <Button size="sm" onClick={() => openPeerFeedback(nom)} data-testid={`btn-peer-feedback-${nom.id}`}>
                  Give Feedback
                </Button>
              </CardContent>
            </Card>
          ))}

          {/* Admin: pending approvals */}
          {isAdmin && nominations.filter(n => n.approved === null).length > 0 && (
            <div className="mt-6 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending Nomination Approvals</p>
              {nominations.filter(n => n.approved === null).map(nom => (
                <Card key={nom.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {profiles.find(p => p.id === nom.nominee_id)?.full_name ?? '—'} →  peer of {nom.reviewee_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{nom.review_period}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300"
                        onClick={() => approveNomination(nom.id, true)} data-testid={`btn-approve-nom-${nom.id}`}>
                        <UserCheck className="h-3.5 w-3.5 mr-1" />Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-500 border-red-300"
                        onClick={() => approveNomination(nom.id, false)} data-testid={`btn-reject-nom-${nom.id}`}>
                        <UserX className="h-3.5 w-3.5 mr-1" />Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Cycle Progress (Kanban) ───────────────────────────────────── */}
      {tab === 'progress' && (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-max">
            {PHASE_ORDER.map(phase => {
              const phCfg = PHASE_CFG[phase];
              const phReviews = (progressBoard[phase] ?? []).filter(r =>
                !search || r.reviewee_name?.toLowerCase().includes(search.toLowerCase())
              );
              return (
                <div key={phase} className="w-56 flex-shrink-0">
                  <div className={cn('text-xs font-semibold px-2 py-1 rounded-md mb-2', phCfg.color)}>
                    {phCfg.label} ({phReviews.length})
                  </div>
                  <div className="space-y-2">
                    {phReviews.map(rev => (
                      <Card key={rev.id} className="hover:shadow cursor-pointer" onClick={() => { setViewing(rev); setDetailOpen(true); }}>
                        <CardContent className="p-3 space-y-1">
                          <p className="text-sm font-medium truncate">{rev.reviewee_name}</p>
                          <p className="text-xs text-muted-foreground">{rev.review_period}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs capitalize text-muted-foreground">{rev.review_type.replace('_', ' ')}</span>
                            {rev.overall_rating && (
                              <span className="text-xs font-medium text-amber-600">{rev.overall_rating.toFixed(1)}★</span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {phReviews.length === 0 && (
                      <div className="border border-dashed rounded-lg p-3 text-center text-xs text-muted-foreground">Empty</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Reviews List (my / all / pending / self-assess / calibrate) ─────── */}
      {tab !== 'peer' && tab !== 'progress' && (
        loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Award className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>{tab === 'self-assess' ? 'No self-assessments pending.' : 'No reviews found.'}</p>
            {tab === 'my' && <Button className="mt-4" variant="outline" onClick={openNew}>Start your first review</Button>}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(rev => {
              const st    = STATUS_CFG[rev.status] ?? STATUS_CFG.draft;
              const mySa  = selfAssessments.find(sa => sa.review_id === rev.id && sa.user_id === currentUser?.id);
              const myNoms = nominations.filter(n => n.review_id === rev.id && n.reviewee_id === currentUser?.id);
              return (
                <Card key={rev.id} className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => { setViewing(rev); setDetailOpen(true); }}
                  data-testid={`review-card-${rev.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{rev.reviewee_name}</p>
                          <Badge variant="outline" className="capitalize text-xs">{rev.review_type.replace('_', ' ')}</Badge>
                          <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full', st.badge)}>
                            {st.icon}<span>{st.label}</span>
                          </span>
                          <PhaseBadge phase={rev.cycle_phase} />
                          {rev.self_assessment_enabled && <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Self-Assess</Badge>}
                          {rev.peer_feedback_enabled && <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">360°</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{rev.review_period}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {rev.reviewer_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />Reviewer: {rev.reviewer_name}</span>}
                          {rev.overall_rating != null && (
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{rev.overall_rating.toFixed(1)} / 5
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0 flex-wrap justify-end" onClick={e => e.stopPropagation()}>
                        {/* Self-assess button for employee */}
                        {rev.self_assessment_enabled && rev.reviewee_id === currentUser?.id && !mySa?.submitted_at && (
                          <Button size="sm" variant="outline" className="text-blue-600 border-blue-300 text-xs"
                            onClick={() => openSelfAssess(rev)} data-testid={`btn-self-assess-${rev.id}`}>
                            <BookOpen className="h-3.5 w-3.5 mr-1" />Self-Assess
                          </Button>
                        )}
                        {/* Nominate peers button for employee */}
                        {rev.peer_feedback_enabled && rev.reviewee_id === currentUser?.id && rev.cycle_phase === 'peer_feedback' && (
                          <Button size="sm" variant="outline" className="text-purple-600 border-purple-300 text-xs"
                            onClick={() => openNominate(rev)} data-testid={`btn-nominate-${rev.id}`}>
                            <Users className="h-3.5 w-3.5 mr-1" />Nominate Peers
                          </Button>
                        )}
                        {/* Move to calibration — only for manager_review phase reviews */}
                        {isAdmin && rev.cycle_phase === 'manager_review' && rev.status === 'submitted' && (
                          <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 text-xs"
                            onClick={() => moveToCalibration(rev.id)} data-testid={`btn-calibrate-${rev.id}`}>
                            <Sliders className="h-3.5 w-3.5 mr-1" />Calibrate
                          </Button>
                        )}
                        {/* Complete — only for reviews that are NOT going through calibration */}
                        {isAdmin && rev.status === 'submitted' && rev.cycle_phase !== 'calibration' && rev.cycle_phase !== 'manager_review' && (
                          <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300 text-xs"
                            onClick={() => markCompleted(rev.id)} data-testid={`btn-complete-${rev.id}`}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Complete
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(rev)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        {(isAdmin || rev.reviewee_id === currentUser?.id) && rev.status === 'draft' && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteReview(rev.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {rev.goals?.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-2">Goals ({rev.goals.filter(g => (g.completion ?? 0) >= 100).length}/{rev.goals.length} completed)</p>
                        <Progress value={(rev.goals.filter(g => (g.completion ?? 0) >= 100).length / rev.goals.length) * 100} className="h-1.5" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          DIALOGS
      ═══════════════════════════════════════════════════════════════════════ */}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Review' : 'Start Performance Review'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 360° Toggles */}
            {isAdmin && (
              <div className="flex gap-6 p-3 bg-muted/30 rounded-lg border flex-wrap">
                <div className="flex items-center gap-2">
                  <Switch id="sa-toggle" checked={form.self_assessment_enabled}
                    onCheckedChange={v => setForm(p => ({ ...p, self_assessment_enabled: v }))} />
                  <Label htmlFor="sa-toggle" className="text-sm cursor-pointer">Enable Self-Assessment</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="pf-toggle" checked={form.peer_feedback_enabled}
                    onCheckedChange={v => setForm(p => ({ ...p, peer_feedback_enabled: v }))} />
                  <Label htmlFor="pf-toggle" className="text-sm cursor-pointer">Enable 360° Peer Feedback</Label>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {isAdmin && (
                <div>
                  <Label>Employee *</Label>
                  <Select value={form.reviewee_id} onValueChange={v => setForm(p => ({ ...p, reviewee_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Review Period *</Label>
                <Input value={form.review_period} onChange={e => setForm(p => ({ ...p, review_period: e.target.value }))} placeholder="e.g. Q2 2025 / Annual 2024" />
              </div>
              <div>
                <Label>Review Type</Label>
                <Select value={form.review_type} onValueChange={v => setForm(p => ({ ...p, review_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REVIEW_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />Self Assessment Narrative</Label>
              <Textarea value={form.self_assessment} onChange={e => setForm(p => ({ ...p, self_assessment: e.target.value }))} rows={3} placeholder="Describe your achievements this period..." />
            </div>

            {/* Competency Ratings — side-by-side Self / Peer / Manager when data exists */}
            {(() => {
              const mySa   = editing ? selfAssessments.find(sa => sa.review_id === editing.id && sa.submitted_at) : null;
              const peerAgg = editing ? getPeerAggregate(editing.id) : null;
              const show3col = isAdmin && editing && (mySa || peerAgg);
              return (
                <div>
                  <Label className="flex items-center gap-1 mb-2"><BarChart2 className="h-3.5 w-3.5" />Competency Ratings</Label>
                  {show3col ? (
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-muted/50 text-xs text-muted-foreground">
                            <th className="text-left p-2 font-medium">Competency</th>
                            {mySa  && <th className="p-2 text-center font-medium text-blue-600">Self</th>}
                            {peerAgg && <th className="p-2 text-center font-medium text-purple-600">Peers avg</th>}
                            <th className="p-2 text-center font-medium">Manager ★</th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.competencies.map((comp, i) => {
                            const saRating = mySa?.ratings?.[comp.id];
                            const peerEntry = peerAgg?.[comp.id];
                            const peerAvg = peerEntry && peerEntry.count > 0
                              ? peerEntry.totalRating / peerEntry.count : null;
                            return (
                              <tr key={comp.id} className="border-t hover:bg-muted/20">
                                <td className="p-2 text-sm">{comp.name}</td>
                                {mySa && <td className="p-2 text-center text-blue-600 font-medium">{saRating ? saRating.toFixed(1) : '—'}</td>}
                                {peerAgg && <td className="p-2 text-center text-purple-600 font-medium">{peerAvg != null ? peerAvg.toFixed(1) : '—'}</td>}
                                <td className="p-2">
                                  <div className="flex justify-center">
                                    <StarRating value={comp.rating} onChange={v => setForm(p => ({ ...p, competencies: p.competencies.map((c, j) => j === i ? { ...c, rating: v } : c) }))} />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                      {form.competencies.map((comp, i) => (
                        <div key={comp.id} className="flex items-center gap-3">
                          <span className="text-sm flex-1 min-w-0">{comp.name}</span>
                          <StarRating value={comp.rating} onChange={v => setForm(p => ({ ...p, competencies: p.competencies.map((c, j) => j === i ? { ...c, rating: v } : c) }))} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Goals */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />Goals</Label>
                <Button size="sm" variant="outline" onClick={() => setForm(p => ({ ...p, goals: [...p.goals, { id: crypto.randomUUID(), title: '', completion: 0 }] }))}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add Goal
                </Button>
              </div>
              {form.goals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg">No goals added yet.</p>
              ) : (
                <div className="space-y-2">
                  {form.goals.map((goal, i) => (
                    <div key={goal.id} className="border rounded-lg p-3 space-y-2 bg-background">
                      <div className="flex gap-2">
                        <Input value={goal.title} onChange={e => setForm(p => ({ ...p, goals: p.goals.map((g, j) => j === i ? { ...g, title: e.target.value } : g) }))} placeholder="Goal title" className="flex-1" />
                        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => setForm(p => ({ ...p, goals: p.goals.filter((_, j) => j !== i) }))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-20">Completion</span>
                        <input type="range" min={0} max={100} value={goal.completion ?? 0}
                          onChange={e => setForm(p => ({ ...p, goals: p.goals.map((g, j) => j === i ? { ...g, completion: Number(e.target.value) } : g) }))}
                          className="flex-1 h-2 accent-primary" />
                        <span className="text-xs font-medium w-10 text-right">{goal.completion ?? 0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" />Strengths</Label>
                <Textarea value={form.strengths} onChange={e => setForm(p => ({ ...p, strengths: e.target.value }))} rows={3} placeholder="Key strengths..." />
              </div>
              <div>
                <Label>Development Areas</Label>
                <Textarea value={form.development_areas} onChange={e => setForm(p => ({ ...p, development_areas: e.target.value }))} rows={3} placeholder="Areas to improve..." />
              </div>
            </div>
            <div>
              <Label>Goals for Next Period</Label>
              <Textarea value={form.next_goals} onChange={e => setForm(p => ({ ...p, next_goals: e.target.value }))} rows={2} placeholder="What do you aim to achieve next period?" />
            </div>
            {isAdmin && (
              <div>
                <Label className="flex items-center gap-1"><User className="h-3.5 w-3.5" />Manager Comments</Label>
                <Textarea value={form.manager_comments} onChange={e => setForm(p => ({ ...p, manager_comments: e.target.value }))} rows={3} placeholder="Manager's overall feedback..." />
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Save Draft
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving || !form.reviewee_id || !form.review_period} data-testid="btn-submit-review">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Submit for Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Self-Assessment Dialog ─────────────────────────────────────────── */}
      <Dialog open={saOpen} onOpenChange={setSaOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-500" />
              Self-Assessment — {saReview?.review_period}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            Rate yourself on each competency honestly. Your manager will see your ratings alongside their own when completing your review.
          </p>
          <div className="space-y-3 py-2">
            {COMPETENCIES_TEMPLATE.map(comp => (
              <div key={comp.id} className="flex items-center justify-between border rounded-lg p-3">
                <span className="text-sm font-medium">{comp.name}</span>
                <StarRating value={saRatings[comp.id] ?? 0} onChange={v => setSaRatings(p => ({ ...p, [comp.id]: v }))} />
              </div>
            ))}
            <div>
              <Label>Overall Comments (optional)</Label>
              <Textarea value={saComments} onChange={e => setSaComments(e.target.value)} rows={3} placeholder="Summarise your performance this period..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaOpen(false)}>Cancel</Button>
            <Button onClick={submitSelfAssessment} disabled={saSubmitting} data-testid="btn-submit-self-assess">
              {saSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Submit Self-Assessment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Peer Nomination Dialog ─────────────────────────────────────────── */}
      <Dialog open={nomOpen} onOpenChange={setNomOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />Nominate Peers — {nomReview?.review_period}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-1">Select 2–5 colleagues who can provide meaningful feedback on your work.</p>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search staff..." value={nomSearch} onChange={e => setNomSearch(e.target.value)} />
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto border rounded-lg p-2">
            {profiles
              .filter(p => p.id !== currentUser?.id && (!nomSearch || p.full_name.toLowerCase().includes(nomSearch.toLowerCase())))
              .map(p => (
                <div key={p.id} className={cn('flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors',
                  selectedNominees.includes(p.id) && 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700')}
                  onClick={() => setSelectedNominees(prev =>
                    prev.includes(p.id)
                      ? prev.filter(id => id !== p.id)
                      : prev.length >= 5 ? prev : [...prev, p.id]
                  )}>
                  <span className="text-sm">{p.full_name}</span>
                  {selectedNominees.includes(p.id) && <CheckCircle2 className="h-4 w-4 text-purple-600" />}
                </div>
              ))}
          </div>
          <p className="text-xs text-muted-foreground">{selectedNominees.length} / 5 selected (min 2)</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNomOpen(false)}>Cancel</Button>
            <Button onClick={submitNominations} disabled={nomSubmitting || selectedNominees.length < 2} data-testid="btn-submit-nominations">
              {nomSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Submit Nominations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Peer Feedback Dialog ───────────────────────────────────────────── */}
      <Dialog open={pfOpen} onOpenChange={setPfOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeOff className="h-5 w-5 text-purple-500" />
              Peer Feedback for {pfNom?.reviewee_name} — {pfNom?.review_period}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-1">Your response is anonymous to the reviewee. Ratings and comments are aggregated before sharing.</p>
          <div className="space-y-3 py-2">
            {COMPETENCIES_TEMPLATE.map(comp => (
              <div key={comp.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{comp.name}</span>
                  <StarRating value={pfRatings[comp.id] ?? 0} onChange={v => setPfRatings(p => ({ ...p, [comp.id]: v }))} />
                </div>
                <Input value={pfComments[comp.id] ?? ''} onChange={e => setPfComments(p => ({ ...p, [comp.id]: e.target.value }))}
                  placeholder="Optional comment..." className="text-sm" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPfOpen(false)}>Cancel</Button>
            <Button onClick={submitPeerFeedback} disabled={pfSubmitting} data-testid="btn-submit-peer-feedback">
              {pfSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Calibration Dialog ─────────────────────────────────────────────── */}
      <Dialog open={calibOpen} onOpenChange={setCalibOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-orange-500" />Team Calibration
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            Adjust individual scores before publishing. Adjusted scores override the manager's calculated rating.
          </p>

          {/* Distribution chart */}
          <div className="h-28 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="score" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Staff" radius={[4,4,0,0]}>
                  {distData.map((entry, i) => (
                    <Cell key={i} fill={['#ef4444','#f97316','#eab308','#22c55e','#10b981'][i] ?? '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Competency matrix table — rows = employees, cols = competencies */}
          <div className="overflow-x-auto border rounded-lg max-h-96">
            <table className="min-w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-muted/90">
                <tr>
                  <th className="text-left p-2 font-medium sticky left-0 bg-muted/90 border-b border-r min-w-36">Employee</th>
                  {COMPETENCIES_TEMPLATE.map(c => (
                    <th key={c.id} className="p-2 text-center font-medium border-b min-w-24">{c.name}</th>
                  ))}
                  <th className="p-2 text-center font-semibold border-b min-w-20 text-primary">Overall</th>
                  <th className="p-2 text-left font-medium border-b min-w-40">Reason</th>
                </tr>
              </thead>
              <tbody>
                {calibrationReviews.map(rev => {
                  const cd = calibData[rev.id] ?? { compRatings: {}, reason: '', overall: rev.overall_rating ?? 0 };
                  return (
                    <tr key={rev.id} className="border-t hover:bg-muted/20">
                      <td className="p-2 font-medium sticky left-0 bg-background border-r z-10 text-xs">
                        <p className="truncate max-w-32">{rev.reviewee_name}</p>
                        <p className="text-muted-foreground truncate max-w-32">{rev.review_period}</p>
                      </td>
                      {COMPETENCIES_TEMPLATE.map(c => {
                        const origComp = rev.competencies?.find((x: any) => x.id === c.id);
                        const orig = origComp?.rating ?? 0;
                        const val = cd.compRatings[c.id] !== undefined ? cd.compRatings[c.id] : orig;
                        const changed = val !== orig;
                        return (
                          <td key={c.id} className="p-1 text-center align-middle">
                            <div className="flex items-center gap-0.5 justify-center">
                              <button onClick={() => updateCalibComp(rev.id, c.id, Math.max(0, val - 0.5))}
                                className="h-5 w-5 rounded border text-muted-foreground hover:bg-muted flex items-center justify-center">−</button>
                              <span className={cn('w-7 text-center font-semibold', changed ? 'text-orange-500' : 'text-foreground')}>
                                {val > 0 ? val.toFixed(1) : '—'}
                              </span>
                              <button onClick={() => updateCalibComp(rev.id, c.id, Math.min(5, val + 0.5))}
                                className="h-5 w-5 rounded border text-muted-foreground hover:bg-muted flex items-center justify-center">+</button>
                            </div>
                            {changed && <p className="text-[9px] text-muted-foreground text-center">was {orig > 0 ? orig.toFixed(1) : '—'}</p>}
                          </td>
                        );
                      })}
                      <td className="p-2 text-center align-middle">
                        <span className={cn('font-bold', cd.overall !== (rev.overall_rating ?? 0) ? 'text-orange-500' : 'text-primary')}>
                          {cd.overall.toFixed(1)}
                        </span>
                        {cd.overall !== (rev.overall_rating ?? 0) && (
                          <p className="text-[9px] text-muted-foreground">was {rev.overall_rating?.toFixed(1) ?? '—'}</p>
                        )}
                      </td>
                      <td className="p-1 align-middle">
                        <Input className="text-xs h-7 min-w-36" value={cd.reason}
                          onChange={e => setCalibData(p => ({ ...p, [rev.id]: { ...cd, reason: e.target.value } }))}
                          placeholder="Reason..." />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCalibOpen(false)}>Cancel</Button>
            <Button onClick={saveCalibration} disabled={calibSaving} data-testid="btn-save-calibration">
              {calibSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <GitMerge className="h-4 w-4 mr-1" />}
              Save & Publish Calibration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Review Detail Dialog (3-column for manager) ────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {viewing && (() => {
            const st        = STATUS_CFG[viewing.status] ?? STATUS_CFG.draft;
            const mySa      = selfAssessments.find(sa => sa.review_id === viewing.id);
            const peerAgg   = getPeerAggregate(viewing.id);
            const show3col  = isAdmin && (mySa?.submitted_at || peerAgg);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    <Award className="h-5 w-5 text-amber-500" />
                    {viewing.reviewee_name} — {viewing.review_period}
                    <PhaseBadge phase={viewing.cycle_phase} />
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={cn('flex items-center gap-1 text-sm px-2 py-1 rounded-full', st.badge)}>{st.icon}{st.label}</span>
                    <Badge variant="outline" className="capitalize">{viewing.review_type.replace('_', ' ')}</Badge>
                    {viewing.overall_rating != null && (
                      <span className="flex items-center gap-1 text-sm font-medium">
                        <StarRating value={Math.round(viewing.overall_rating)} readonly />
                        <span className="text-muted-foreground ml-1">{viewing.overall_rating.toFixed(1)} / 5</span>
                      </span>
                    )}
                  </div>

                  {/* 3-column competencies when self-assess/peer data available */}
                  {show3col ? (
                    <div>
                      <p className="text-sm font-semibold mb-2">Competency Comparison</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr>
                              <th className="text-left py-1.5 pr-3 font-medium text-muted-foreground">Competency</th>
                              {mySa?.submitted_at && <th className="text-center py-1.5 px-2 font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded-tl">Self</th>}
                              {peerAgg && <th className="text-center py-1.5 px-2 font-medium text-purple-600 bg-purple-50 dark:bg-purple-900/20">Peers (avg)</th>}
                              <th className="text-center py-1.5 px-2 font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-tr">Manager</th>
                            </tr>
                          </thead>
                          <tbody>
                            {COMPETENCIES_TEMPLATE.map(comp => {
                              const mgrComp = viewing.competencies?.find(c => c.id === comp.id);
                              const selfRating = mySa?.ratings?.[comp.id] ?? 0;
                              const peerEntry  = peerAgg?.[comp.id];
                              const peerAvg    = peerEntry ? peerEntry.totalRating / peerEntry.count : null;
                              return (
                                <tr key={comp.id} className="border-t hover:bg-muted/20">
                                  <td className="py-2 pr-3 text-muted-foreground">{comp.name}</td>
                                  {mySa?.submitted_at && (
                                    <td className="py-2 px-2 text-center bg-blue-50/50 dark:bg-blue-900/10">
                                      <StarRating value={selfRating} readonly />
                                    </td>
                                  )}
                                  {peerAgg && (
                                    <td className="py-2 px-2 text-center bg-purple-50/50 dark:bg-purple-900/10">
                                      {peerAvg != null ? <StarRating value={Math.round(peerAvg)} readonly /> : <span className="text-muted-foreground">—</span>}
                                    </td>
                                  )}
                                  <td className="py-2 px-2 text-center bg-amber-50/50 dark:bg-amber-900/10">
                                    {mgrComp ? <StarRating value={mgrComp.rating} readonly /> : <span className="text-muted-foreground">—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {mySa?.comments && (
                        <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 rounded p-3 border border-blue-100 dark:border-blue-800">
                          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">Employee Self-Assessment Narrative</p>
                          <p className="text-sm">{mySa.comments}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    viewing.competencies?.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold mb-2">Competency Ratings</p>
                        <div className="space-y-1.5">
                          {viewing.competencies.map(c => (
                            <div key={c.id} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{c.name}</span>
                              <StarRating value={c.rating} readonly />
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  )}

                  {viewing.goals?.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-2">Goals</p>
                      <div className="space-y-2">
                        {viewing.goals.map(g => (
                          <div key={g.id} className="text-sm">
                            <div className="flex justify-between mb-0.5"><span>{g.title}</span><span className="text-muted-foreground">{g.completion ?? 0}%</span></div>
                            <Progress value={g.completion ?? 0} className="h-1.5" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {viewing.self_assessment && (
                    <div><p className="text-sm font-semibold mb-1">Self Assessment</p><p className="text-sm text-muted-foreground">{viewing.self_assessment}</p></div>
                  )}
                  {viewing.strengths && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded p-3 border border-emerald-100 dark:border-emerald-800">
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-1">Strengths</p>
                      <p className="text-sm">{viewing.strengths}</p>
                    </div>
                  )}
                  {viewing.development_areas && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded p-3 border border-amber-100 dark:border-amber-800">
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-1">Development Areas</p>
                      <p className="text-sm">{viewing.development_areas}</p>
                    </div>
                  )}
                  {viewing.manager_comments && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-3 border border-blue-100 dark:border-blue-800">
                      <p className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-1">Manager Comments</p>
                      <p className="text-sm">{viewing.manager_comments}</p>
                    </div>
                  )}

                  {/* Salary increment shortcut */}
                  {viewing.status === 'completed' && viewing.overall_rating != null && viewing.overall_rating >= 3 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded p-3 border border-amber-200 dark:border-amber-800">
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">Reward strong performance</p>
                      <p className="text-xs text-muted-foreground mb-3">
                        Suggested increment: {(() => { const r = viewing.overall_rating!; return r >= 4.5 ? '10%' : r >= 4 ? '7%' : r >= 3.5 ? '5%' : '3%'; })()}
                      </p>
                      <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white w-full"
                        data-testid={`button-convert-to-increment-${viewing.id}`}
                        onClick={() => {
                          const r = viewing.overall_rating!;
                          const pct = r >= 4.5 ? 10 : r >= 4 ? 7 : r >= 3.5 ? 5 : 3;
                          window.location.href = `/salary-increments?prefill=${viewing.reviewee_id}&pct=${pct}&reason=Merit+increment+based+on+${viewing.review_period}&review_id=${viewing.id}`;
                        }}>
                        <TrendingUp className="h-4 w-4 mr-1.5" />Convert to Salary Increment
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
