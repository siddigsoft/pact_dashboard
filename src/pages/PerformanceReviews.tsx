import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isValid } from 'date-fns';
import {
  Star, Plus, Edit2, Trash2, Loader2, CheckCircle2, Clock,
  User, Search, FileText, BarChart2, Send, ChevronDown, ChevronUp,
  Award, Target, BookOpen, TrendingUp, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/use-authorization';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/context/AppContext';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';

interface Profile { id: string; full_name: string; role?: string; }

interface Review {
  id: string;
  reviewee_id: string;
  reviewer_id: string | null;
  review_period: string;
  review_type: string;
  status: string;
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

const COMPETENCIES_TEMPLATE: Omit<Competency, 'rating'>[] = [
  { id: 'quality', name: 'Work Quality & Accuracy' },
  { id: 'communication', name: 'Communication & Collaboration' },
  { id: 'initiative', name: 'Initiative & Problem Solving' },
  { id: 'teamwork', name: 'Teamwork & Interpersonal Skills' },
  { id: 'leadership', name: 'Leadership & Mentoring' },
  { id: 'adaptability', name: 'Adaptability & Learning' },
];

const STATUS_CFG: Record<string, { label: string; badge: string; icon: ReactNode }> = {
  draft:     { label: 'Draft',           badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800', icon: <FileText className="h-3.5 w-3.5" /> },
  submitted: { label: 'Self-Submitted',  badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40', icon: <Send className="h-3.5 w-3.5" /> },
  in_review: { label: 'Manager Review',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40', icon: <Clock className="h-3.5 w-3.5" /> },
  completed: { label: 'Completed',       badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
};

const REVIEW_TYPES = ['annual', 'mid_year', 'probation', 'project_completion', 'quarterly'];

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

export default function PerformanceReviews() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const { hasAnyRole } = useAuthorization();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr', 'manager']);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'my' | 'all' | 'pending'>('my');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState<Review | null>(null);
  const [viewing, setViewing] = useState<Review | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    reviewee_id: '',
    review_period: '',
    review_type: 'annual',
    self_assessment: '',
    manager_comments: '',
    strengths: '',
    development_areas: '',
    next_goals: '',
    overall_rating: 0,
    goals: [] as Goal[],
    competencies: COMPETENCIES_TEMPLATE.map(c => ({ ...c, rating: 0, comments: '' })) as Competency[],
  });

  useEffect(() => { fetchReviews(); fetchProfiles(); }, []);

  // Realtime: refresh when performance_reviews change so admins/HR
  // see newly submitted reviews appear without manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel('performance-reviews-stream')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'performance_reviews' },
        () => { fetchReviews(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchReviews() {
    setLoading(true);
    const { data } = await supabase.from('performance_reviews').select('*').order('created_at', { ascending: false });
    if (data) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name');
      const pm = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
      setReviews(data.map((r: any) => ({
        ...r,
        goals: r.goals ?? [],
        competencies: r.competencies ?? [],
        reviewee_name: pm[r.reviewee_id] ?? 'Unknown',
        reviewer_name: r.reviewer_id ? (pm[r.reviewer_id] ?? 'Unknown') : null,
      })));
    }
    setLoading(false);
  }

  async function fetchProfiles() {
    const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
    if (data) setProfiles(data as Profile[]);
  }

  function openNew() {
    setEditing(null);
    setForm({
      reviewee_id: currentUser?.id ?? '',
      review_period: '',
      review_type: 'annual',
      self_assessment: '',
      manager_comments: '',
      strengths: '',
      development_areas: '',
      next_goals: '',
      overall_rating: 0,
      goals: [],
      competencies: COMPETENCIES_TEMPLATE.map(c => ({ ...c, rating: 0, comments: '' })),
    });
    setDialogOpen(true);
  }

  function openEdit(rev: Review) {
    setEditing(rev);
    setForm({
      reviewee_id: rev.reviewee_id,
      review_period: rev.review_period,
      review_type: rev.review_type,
      self_assessment: rev.self_assessment ?? '',
      manager_comments: rev.manager_comments ?? '',
      strengths: rev.strengths ?? '',
      development_areas: rev.development_areas ?? '',
      next_goals: rev.next_goals ?? '',
      overall_rating: rev.overall_rating ?? 0,
      goals: rev.goals ?? [],
      competencies: rev.competencies?.length
        ? rev.competencies
        : COMPETENCIES_TEMPLATE.map(c => ({ ...c, rating: 0, comments: '' })),
    });
    setDialogOpen(true);
  }

  async function handleSave(submitForReview = false) {
    if (!form.reviewee_id || !form.review_period) return;
    setSaving(true);

    const avgRating = form.competencies.length
      ? form.competencies.reduce((s, c) => s + (c.rating ?? 0), 0) / form.competencies.length
      : form.overall_rating;

    const payload: any = {
      reviewee_id: form.reviewee_id,
      review_period: form.review_period,
      review_type: form.review_type,
      self_assessment: form.self_assessment || null,
      manager_comments: isAdmin ? (form.manager_comments || null) : undefined,
      strengths: form.strengths || null,
      development_areas: form.development_areas || null,
      next_goals: form.next_goals || null,
      overall_rating: Number(avgRating.toFixed(1)),
      goals: form.goals,
      competencies: form.competencies,
      status: submitForReview ? 'submitted' : 'draft',
      submitted_at: submitForReview ? new Date().toISOString() : null,
      reviewer_id: isAdmin ? currentUser?.id : undefined,
      updated_at: new Date().toISOString(),
    };

    if (editing) {
      const { error } = await supabase.from('performance_reviews').update(payload).eq('id', editing.id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
      else {
        toast({ title: submitForReview ? 'Review submitted for approval' : 'Review saved' });
        if (submitForReview) {
          // Notify admins/HR that a review is ready for their action
          const revieweeName = reviews.find(r => r.id === editing.id)?.reviewee_name ?? 'Staff';
          await NotificationTriggerService.sendToRoles(
            ['super_admin', 'admin', 'hr'],
            {
              title: 'Performance Review Ready',
              message: `A ${payload.review_type ?? 'performance'} review for ${revieweeName} (${payload.review_period}) has been submitted and awaits your approval.`,
              titleAr: 'مراجعة الأداء جاهزة',
              messageAr: `تم تقديم مراجعة ${payload.review_type ?? 'الأداء'} لـ ${revieweeName} (${payload.review_period}) وتنتظر موافقتك.`,
              type: 'info',
              category: 'approvals',
              priority: 'high',
              link: '/performance-reviews',
              relatedEntityId: editing.id,
              sendEmail: true,
              emailActionUrl: '/performance-reviews',
              emailActionLabel: 'Open Performance Reviews',
            }
          );
        }
        setDialogOpen(false);
        fetchReviews();
      }
    } else {
      const { data: inserted, error } = await supabase.from('performance_reviews').insert({ ...payload, created_at: new Date().toISOString() }).select().single();
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
      else {
        toast({ title: submitForReview ? 'Review submitted for approval' : 'Review created' });
        if (submitForReview && inserted) {
          await NotificationTriggerService.sendToRoles(
            ['super_admin', 'admin', 'hr'],
            {
              title: 'Performance Review Ready',
              message: `A new ${payload.review_type ?? 'performance'} review (${payload.review_period}) has been submitted and awaits approval.`,
              titleAr: 'مراجعة أداء جديدة جاهزة',
              messageAr: `تم تقديم مراجعة ${payload.review_type ?? 'أداء'} جديدة (${payload.review_period}) وتنتظر الموافقة.`,
              type: 'info',
              category: 'approvals',
              priority: 'high',
              link: '/performance-reviews',
              relatedEntityId: inserted.id,
              sendEmail: true,
              emailActionUrl: '/performance-reviews',
              emailActionLabel: 'Open Performance Reviews',
            }
          );
        }
        setDialogOpen(false);
        fetchReviews();
      }
    }
    setSaving(false);
  }

  async function markCompleted(id: string) {
    const rev = reviews.find(r => r.id === id);
    const { error: completeErr } = await supabase.from('performance_reviews').update({ status: 'completed', reviewed_at: new Date().toISOString(), reviewer_id: currentUser?.id }).eq('id', id);
    if (completeErr) { toast({ title: 'Failed to complete review', description: completeErr.message, variant: 'destructive' }); return; }
    // Notify the reviewee that their review has been completed
    if (rev?.reviewee_id) {
      await NotificationTriggerService.send({
        userId: rev.reviewee_id,
        title: 'Performance Review Completed',
        message: `Your ${rev.review_type ?? 'performance'} review for ${rev.review_period} has been completed. You can now view your results.`,
        titleAr: 'اكتملت مراجعة الأداء',
        messageAr: `اكتملت مراجعة ${rev.review_type ?? 'الأداء'} الخاصة بك للفترة ${rev.review_period}. يمكنك الآن الاطلاع على النتائج.`,
        type: 'success',
        category: 'team',
        priority: 'high',
        link: '/performance-reviews',
        relatedEntityId: id,
        sendEmail: true,
        emailActionUrl: '/performance-reviews',
        emailActionLabel: 'View My Review',
      });
    }
    toast({ title: 'Review marked completed' });
    fetchReviews();
  }

  async function deleteReview(id: string) {
    const { error } = await supabase.from('performance_reviews').delete().eq('id', id);
    if (error) { toast({ title: 'Failed to delete review', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Review deleted' });
    setReviews(p => p.filter(r => r.id !== id));
  }

  const myReviews = reviews.filter(r => r.reviewee_id === currentUser?.id);
  const pendingReviews = reviews.filter(r => r.status === 'submitted' && isAdmin);
  const filtered = (tab === 'my' ? myReviews : tab === 'pending' ? pendingReviews : reviews)
    .filter(r => !search || r.reviewee_name?.toLowerCase().includes(search.toLowerCase()) || r.review_period.toLowerCase().includes(search.toLowerCase()));

  const stats = {
    total: myReviews.length,
    completed: myReviews.filter(r => r.status === 'completed').length,
    avgRating: myReviews.filter(r => r.overall_rating).reduce((s, r) => s + (r.overall_rating ?? 0), 0) / (myReviews.filter(r => r.overall_rating).length || 1),
    pending: pendingReviews.length,
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6 text-amber-500" />
            Performance Reviews
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Appraisals, goal tracking, and competency ratings</p>
        </div>
        <Button onClick={openNew} data-testid="btn-new-review">
          <Plus className="h-4 w-4 mr-1" /> Start Review
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'My Reviews', value: stats.total, icon: <FileText className="h-4 w-4" />, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Completed', value: stats.completed, icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Avg Rating', value: stats.avgRating ? stats.avgRating.toFixed(1) + ' ★' : '—', icon: <Star className="h-4 w-4" />, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'Pending Review', value: stats.pending, icon: <Clock className="h-4 w-4" />, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
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

      {/* Tabs + Search */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Tabs value={tab} onValueChange={v => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="my">My Reviews</TabsTrigger>
            {isAdmin && <TabsTrigger value="all">All Staff</TabsTrigger>}
            {isAdmin && <TabsTrigger value="pending">Pending ({pendingReviews.length})</TabsTrigger>}
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 w-48" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Award className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p>No reviews found.</p>
          <Button className="mt-4" variant="outline" onClick={openNew}>Start your first review</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(rev => {
            const st = STATUS_CFG[rev.status] ?? STATUS_CFG.draft;
            return (
              <Card key={rev.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setViewing(rev); setDetailOpen(true); }} data-testid={`review-card-${rev.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{rev.reviewee_name}</p>
                        <Badge variant="outline" className="capitalize text-xs">{rev.review_type.replace('_', ' ')}</Badge>
                        <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full', st.badge)}>
                          {st.icon}<span>{st.label}</span>
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{rev.review_period}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {rev.reviewer_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />Reviewer: {rev.reviewer_name}</span>}
                        {rev.overall_rating != null && (
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {rev.overall_rating.toFixed(1)} / 5
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {isAdmin && rev.status === 'submitted' && (
                        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300" onClick={e => { e.stopPropagation(); markCompleted(rev.id); }}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Complete
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={e => { e.stopPropagation(); openEdit(rev); }}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      {(isAdmin || rev.reviewee_id === currentUser?.id) && rev.status === 'draft' && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={e => { e.stopPropagation(); deleteReview(rev.id); }}>
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
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Review' : 'Start Performance Review'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              {isAdmin && (
                <div>
                  <Label>Employee *</Label>
                  <Select value={form.reviewee_id} onValueChange={v => setForm(p => ({ ...p, reviewee_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
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
                  <SelectContent>
                    {REVIEW_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Self Assessment */}
            <div>
              <Label className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />Self Assessment</Label>
              <Textarea value={form.self_assessment} onChange={e => setForm(p => ({ ...p, self_assessment: e.target.value }))} rows={3} placeholder="Describe your achievements this period..." />
            </div>

            {/* Competency Ratings */}
            <div>
              <Label className="flex items-center gap-1 mb-2"><BarChart2 className="h-3.5 w-3.5" />Competency Ratings</Label>
              <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                {form.competencies.map((comp, i) => (
                  <div key={comp.id} className="flex items-center gap-3">
                    <span className="text-sm flex-1 min-w-0">{comp.name}</span>
                    <StarRating value={comp.rating} onChange={v => setForm(p => ({ ...p, competencies: p.competencies.map((c, j) => j === i ? { ...c, rating: v } : c) }))} />
                  </div>
                ))}
              </div>
            </div>

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
                        <Input
                          value={goal.title}
                          onChange={e => setForm(p => ({ ...p, goals: p.goals.map((g, j) => j === i ? { ...g, title: e.target.value } : g) }))}
                          placeholder="Goal title"
                          className="flex-1"
                        />
                        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => setForm(p => ({ ...p, goals: p.goals.filter((_, j) => j !== i) }))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-20">Completion</span>
                        <Input type="range" min={0} max={100} value={goal.completion ?? 0}
                          onChange={e => setForm(p => ({ ...p, goals: p.goals.map((g, j) => j === i ? { ...g, completion: Number(e.target.value) } : g) }))}
                          className="flex-1 h-2" />
                        <span className="text-xs font-medium w-10 text-right">{goal.completion ?? 0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Strengths / Dev Areas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" />Strengths</Label>
                <Textarea value={form.strengths} onChange={e => setForm(p => ({ ...p, strengths: e.target.value }))} rows={3} placeholder="Key strengths demonstrated..." />
              </div>
              <div>
                <Label>Development Areas</Label>
                <Textarea value={form.development_areas} onChange={e => setForm(p => ({ ...p, development_areas: e.target.value }))} rows={3} placeholder="Areas to improve..." />
              </div>
            </div>

            {/* Next Goals */}
            <div>
              <Label>Goals for Next Period</Label>
              <Textarea value={form.next_goals} onChange={e => setForm(p => ({ ...p, next_goals: e.target.value }))} rows={2} placeholder="What do you aim to achieve next period?" />
            </div>

            {/* Manager Comments (admin only) */}
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

      {/* View Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {viewing && (() => {
            const st = STATUS_CFG[viewing.status] ?? STATUS_CFG.draft;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-amber-500" />
                    {viewing.reviewee_name} — {viewing.review_period}
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

                  {viewing.competencies?.length > 0 && (
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
                  )}

                  {viewing.goals?.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-2">Goals</p>
                      <div className="space-y-2">
                        {viewing.goals.map(g => (
                          <div key={g.id} className="text-sm">
                            <div className="flex justify-between mb-0.5">
                              <span>{g.title}</span>
                              <span className="text-muted-foreground">{g.completion ?? 0}%</span>
                            </div>
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

                  {/* H9 — Convert to Salary Increment shortcut */}
                  {viewing.status === 'completed' && viewing.overall_rating != null && viewing.overall_rating >= 3 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded p-3 border border-amber-200 dark:border-amber-800">
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">
                        Reward strong performance
                      </p>
                      <p className="text-xs text-muted-foreground mb-3">
                        Suggested increment based on rating: {(() => {
                          const r = viewing.overall_rating!;
                          if (r >= 4.5) return '10%';
                          if (r >= 4)   return '7%';
                          if (r >= 3.5) return '5%';
                          return '3%';
                        })()}
                      </p>
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white w-full"
                        data-testid={`button-convert-to-increment-${viewing.id}`}
                        onClick={() => {
                          const r = viewing.overall_rating!;
                          const pct = r >= 4.5 ? 10 : r >= 4 ? 7 : r >= 3.5 ? 5 : 3;
                          const reason = `Merit increment based on ${viewing.review_period} performance review (rating ${r.toFixed(1)}/5)`;
                          const params = new URLSearchParams({
                            prefill: viewing.reviewee_id,
                            pct: String(pct),
                            reason,
                            review_id: viewing.id,
                          });
                          window.location.href = `/salary-increments?${params.toString()}`;
                        }}
                      >
                        <TrendingUp className="h-4 w-4 mr-1.5" />
                        Convert to Salary Increment
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
