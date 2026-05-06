import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Plus, ClipboardList, BarChart2, Users, CheckCircle2, Clock,
  Trash2, ExternalLink, Edit3, Copy, Loader2, Search, Archive,
  PlayCircle, FileText, Link2, LayoutGrid, List, TrendingUp,
  Send, Globe, Sparkles, ChevronRight, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type SurveyStatus = 'draft' | 'active' | 'closed';
type ViewMode = 'grid' | 'list';

interface Survey {
  id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  settings: Record<string, unknown>;
  _q_count?: number;
  _r_count?: number;
}

const STATUS_CFG: Record<SurveyStatus, {
  label: string;
  badgeClass: string;
  dot: string;
  accent: string;
  icon: React.ElementType;
  glow: string;
}> = {
  draft:  {
    label: 'Draft',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
    accent: 'border-l-slate-300 bg-gradient-to-br from-slate-50 to-white',
    icon: Edit3,
    glow: 'hover:border-l-slate-400',
  },
  active: {
    label: 'Active',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    accent: 'border-l-emerald-400 bg-gradient-to-br from-emerald-50/40 to-white',
    icon: PlayCircle,
    glow: 'hover:border-l-emerald-500',
  },
  closed: {
    label: 'Closed',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-400',
    accent: 'border-l-orange-300 bg-gradient-to-br from-orange-50/40 to-white',
    icon: Archive,
    glow: 'hover:border-l-orange-400',
  },
};

const STAT_CARDS = [
  {
    key: 'total' as const,
    label: 'Total Surveys',
    icon: ClipboardList,
    gradient: 'from-indigo-500 to-indigo-600',
    bg: 'from-indigo-50 to-indigo-100/60',
    text: 'text-indigo-700',
    sub: 'text-indigo-500',
  },
  {
    key: 'active' as const,
    label: 'Active',
    icon: PlayCircle,
    gradient: 'from-emerald-500 to-emerald-600',
    bg: 'from-emerald-50 to-emerald-100/60',
    text: 'text-emerald-700',
    sub: 'text-emerald-500',
  },
  {
    key: 'draft' as const,
    label: 'Drafts',
    icon: Edit3,
    gradient: 'from-slate-400 to-slate-500',
    bg: 'from-slate-50 to-slate-100/60',
    text: 'text-slate-700',
    sub: 'text-slate-400',
  },
  {
    key: 'closed' as const,
    label: 'Closed',
    icon: Archive,
    gradient: 'from-orange-400 to-orange-500',
    bg: 'from-orange-50 to-orange-100/60',
    text: 'text-orange-700',
    sub: 'text-orange-400',
  },
  {
    key: 'responses' as const,
    label: 'Responses',
    icon: Users,
    gradient: 'from-violet-500 to-violet-600',
    bg: 'from-violet-50 to-violet-100/60',
    text: 'text-violet-700',
    sub: 'text-violet-500',
  },
];

export default function SurveysPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser, hasRole } = useUser();
  const { isSuperAdmin } = useSuperAdmin();
  const { toast } = useToast();

  const isAdmin = isSuperAdmin || hasRole('admin') || hasRole('super_admin');
  const canManage = isAdmin || hasRole('hub_manager') || hasRole('fom') || hasRole('sr_program_officer') || hasRole('country_director');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SurveyStatus>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Survey | null>(null);

  const { data: surveys = [], isLoading } = useQuery<Survey[]>({
    queryKey: ['surveys'],
    queryFn: async () => {
      const { data, error } = await supabase.from('surveys').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (data ?? []).map(s => s.id);
      if (!ids.length) return [];
      const [{ data: qs }, { data: rs }] = await Promise.all([
        supabase.from('survey_questions').select('id, survey_id').in('survey_id', ids),
        supabase.from('survey_responses').select('id, survey_id').in('survey_id', ids),
      ]);
      const qMap: Record<string, number> = {};
      const rMap: Record<string, number> = {};
      for (const q of qs ?? []) qMap[q.survey_id] = (qMap[q.survey_id] ?? 0) + 1;
      for (const r of rs ?? []) rMap[r.survey_id] = (rMap[r.survey_id] ?? 0) + 1;
      return (data ?? []).map(s => ({ ...s, _q_count: qMap[s.id] ?? 0, _r_count: rMap[s.id] ?? 0 }));
    },
    staleTime: 30_000,
  });

  const createSurvey = useMutation({
    mutationFn: async () => {
      if (!newTitle.trim()) throw new Error('Title is required');
      const { data, error } = await supabase.from('surveys').insert({
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        created_by: currentUser?.id,
        status: 'draft',
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['surveys'] });
      setCreateOpen(false);
      setNewTitle('');
      setNewDesc('');
      toast({ title: 'Survey created', description: 'Opening the builder…' });
      navigate(`/surveys/${s.id}`);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteSurvey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('surveys').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['surveys'] });
      setDeleteTarget(null);
      toast({ title: 'Survey deleted' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const duplicateSurvey = useMutation({
    mutationFn: async (survey: Survey) => {
      const { data: newSurvey, error: sErr } = await supabase.from('surveys').insert({
        title: `${survey.title} (Copy)`,
        description: survey.description,
        status: 'draft',
        created_by: currentUser?.id,
        settings: survey.settings,
      }).select().single();
      if (sErr || !newSurvey) throw sErr ?? new Error('Failed');
      const { data: qs } = await supabase.from('survey_questions').select('*').eq('survey_id', survey.id).order('order_index');
      if (qs?.length) {
        await supabase.from('survey_questions').insert(
          qs.map(q => ({ ...q, id: undefined, survey_id: newSurvey.id }))
        );
      }
      return newSurvey;
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['surveys'] });
      toast({ title: 'Survey duplicated', description: 'Opening the copy…' });
      navigate(`/surveys/${s.id}`);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const copyLink = (survey: Survey) => {
    const url = `${window.location.origin}/surveys/${survey.id}/fill`;
    navigator.clipboard.writeText(url).then(() =>
      toast({ title: 'Link copied!', description: 'Share this link with respondents.' })
    );
  };

  const filtered = surveys.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (search && !s.title.toLowerCase().includes(search.toLowerCase()) &&
        !(s.description ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total:    surveys.length,
    active:   surveys.filter(s => s.status === 'active').length,
    draft:    surveys.filter(s => s.status === 'draft').length,
    closed:   surveys.filter(s => s.status === 'closed').length,
    responses: surveys.reduce((s, sv) => s + (sv._r_count ?? 0), 0),
  };

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30" data-testid="page-surveys">

      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 px-6 py-8 md:px-10 md:py-10">
        {/* decorative circles */}
        <div className="absolute -top-10 -right-10 w-64 h-64 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute top-4 right-32 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute -bottom-8 left-1/3 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />

        <div className="relative max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Surveys</h1>
            </div>
            <p className="text-indigo-200 text-sm md:text-base">
              Create, distribute, and analyse surveys across your teams
            </p>
            {stats.active > 0 && (
              <div className="flex items-center gap-1.5 mt-3">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-300 font-medium">
                  {stats.active} active survey{stats.active !== 1 ? 's' : ''} collecting responses
                </span>
              </div>
            )}
          </div>

          {canManage && (
            <Button
              onClick={() => setCreateOpen(true)}
              data-testid="btn-new-survey"
              className="bg-white text-indigo-700 hover:bg-indigo-50 font-semibold gap-2 shadow-lg shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Survey
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 -mt-2">
          {STAT_CARDS.map(({ key, label, icon: Icon, bg, text, sub, gradient }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key === 'responses' || key === 'total' ? 'all' : key)}
              className={cn(
                'rounded-2xl border border-white/80 bg-gradient-to-br p-4 text-left shadow-sm',
                'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
                bg,
                statusFilter === key ? 'ring-2 ring-offset-1 ring-indigo-400' : '',
              )}
              data-testid={`kpi-${key}`}
            >
              <div className={cn(
                'w-8 h-8 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3',
                gradient,
              )}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <p className={cn('text-2xl font-bold', text)}>{stats[key]}</p>
              <p className={cn('text-[11px] font-medium mt-0.5 uppercase tracking-wide', sub)}>{label}</p>
            </button>
          ))}
        </div>

        {/* ── Filters + View Toggle ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search surveys…"
              className="pl-8 h-9 text-sm bg-white border-slate-200 focus:border-indigo-300"
              data-testid="input-survey-search"
            />
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            {(['all', 'active', 'draft', 'closed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                data-testid={`btn-filter-${f}`}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize',
                  statusFilter === f
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                )}
              >
                {f === 'all' ? 'All' : STATUS_CFG[f as SurveyStatus].label}
                {f !== 'all' && (
                  <span className={cn(
                    'ml-1.5 px-1.5 py-0 rounded-full text-[10px] font-semibold',
                    statusFilter === f ? 'bg-white/20' : 'bg-slate-100 text-slate-500',
                  )}>
                    {stats[f as keyof typeof stats]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn('p-1.5 rounded-md transition-colors', viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-600')}
                  data-testid="btn-view-grid"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Grid view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-600')}
                  data-testid="btn-view-list"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>List view</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ── Result count ── */}
        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-slate-400 -mt-2">
            Showing <span className="font-medium text-slate-600">{filtered.length}</span> of {surveys.length} surveys
            {search && <> matching <span className="font-medium text-indigo-600">"{search}"</span></>}
          </p>
        )}

        {/* ── Survey List / Grid ── */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <p className="text-sm">Loading surveys…</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasSearch={!!search || statusFilter !== 'all'}
            canManage={canManage}
            onClear={() => { setSearch(''); setStatusFilter('all'); }}
            onCreate={() => setCreateOpen(true)}
          />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(survey => (
              <SurveyCard
                key={survey.id}
                survey={survey}
                canManage={canManage}
                onOpen={() => navigate(`/surveys/${survey.id}`)}
                onDuplicate={() => duplicateSurvey.mutate(survey)}
                onDelete={() => setDeleteTarget(survey)}
                onCopyLink={() => copyLink(survey)}
                duplicating={duplicateSurvey.isPending}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(survey => (
              <SurveyRow
                key={survey.id}
                survey={survey}
                canManage={canManage}
                onOpen={() => navigate(`/surveys/${survey.id}`)}
                onDuplicate={() => duplicateSurvey.mutate(survey)}
                onDelete={() => setDeleteTarget(survey)}
                onCopyLink={() => copyLink(survey)}
                duplicating={duplicateSurvey.isPending}
              />
            ))}
          </div>
        )}

        {/* ── Analytics tip banner ── */}
        {stats.responses > 0 && (
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-indigo-800">
                {stats.responses.toLocaleString()} total response{stats.responses !== 1 ? 's' : ''} collected
              </p>
              <p className="text-xs text-indigo-500 mt-0.5">
                Click any survey and open the Analytics tab to view response breakdowns, charts, and insights.
              </p>
            </div>
            <BarChart2 className="w-5 h-5 text-indigo-300 shrink-0" />
          </div>
        )}
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <DialogTitle className="text-lg">New Survey</DialogTitle>
                <p className="text-xs text-slate-500 mt-0.5">You'll be taken to the builder right away</p>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="new-title">Title <span className="text-red-500">*</span></Label>
              <Input
                id="new-title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Staff Satisfaction Q2 2026"
                data-testid="input-new-survey-title"
                onKeyDown={e => { if (e.key === 'Enter' && newTitle.trim()) createSurvey.mutate(); }}
                className="focus:border-indigo-300"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-desc">
                Description <span className="text-slate-400 font-normal text-xs">(optional)</span>
              </Label>
              <Textarea
                id="new-desc"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Brief description shown to respondents…"
                rows={3}
                data-testid="input-new-survey-desc"
                className="resize-none focus:border-indigo-300"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createSurvey.mutate()}
              disabled={!newTitle.trim() || createSurvey.isPending}
              data-testid="btn-create-survey-confirm"
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {createSurvey.isPending
                ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                : <Plus className="w-4 h-4 mr-1.5" />}
              Create & Build
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <DialogTitle>Delete Survey?</DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-sm text-slate-600 mt-1">
            Deleting <strong>"{deleteTarget?.title}"</strong> will permanently remove all its questions
            and <strong>{deleteTarget?._r_count ?? 0} response{(deleteTarget?._r_count ?? 0) !== 1 ? 's' : ''}</strong>.
            This cannot be undone.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteSurvey.mutate(deleteTarget.id)}
              disabled={deleteSurvey.isPending}
              data-testid="btn-delete-confirm"
            >
              {deleteSurvey.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </TooltipProvider>
  );
}

/* ─────────────────────────────────────────────
   Survey Card (grid view)
───────────────────────────────────────────── */
interface CardProps {
  survey: Survey;
  canManage: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  duplicating: boolean;
}

function SurveyCard({ survey, canManage, onOpen, onDuplicate, onDelete, onCopyLink, duplicating }: CardProps) {
  const cfg = STATUS_CFG[survey.status];
  const StatusIcon = cfg.icon;
  const hasResponses = (survey._r_count ?? 0) > 0;

  return (
    <div
      className={cn(
        'group rounded-2xl border border-l-4 border-slate-200 p-5 cursor-pointer',
        'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
        cfg.accent, cfg.glow,
      )}
      onClick={onOpen}
      data-testid={`card-survey-${survey.id}`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
            survey.status === 'active' ? 'bg-emerald-100' :
            survey.status === 'closed' ? 'bg-orange-100' : 'bg-slate-100',
          )}>
            <StatusIcon className={cn(
              'w-4.5 h-4.5',
              survey.status === 'active' ? 'text-emerald-600' :
              survey.status === 'closed' ? 'text-orange-500' : 'text-slate-500',
            )} />
          </div>
          <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5 border font-medium', cfg.badgeClass)}>
            <span className={cn('w-1.5 h-1.5 rounded-full mr-1.5 inline-block', cfg.dot)} />
            {cfg.label}
          </Badge>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
      </div>

      {/* Title + description */}
      <h3 className="font-semibold text-slate-800 text-[15px] leading-snug line-clamp-2 mb-1">
        {survey.title}
      </h3>
      {survey.description && (
        <p className="text-xs text-slate-500 line-clamp-2 mb-3">{survey.description}</p>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1 text-[11px] text-slate-500">
          <FileText className="w-3 h-3 text-slate-400" />
          <span>{survey._q_count ?? 0} question{(survey._q_count ?? 0) !== 1 ? 's' : ''}</span>
        </div>
        <div className={cn(
          'flex items-center gap-1 text-[11px]',
          hasResponses ? 'text-indigo-600 font-medium' : 'text-slate-400',
        )}>
          <Users className="w-3 h-3" />
          <span>{survey._r_count ?? 0} response{(survey._r_count ?? 0) !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400 ml-auto">
          <Clock className="w-3 h-3" />
          <span>{formatDistanceToNow(new Date(survey.updated_at ?? survey.created_at), { addSuffix: true })}</span>
        </div>
      </div>

      {/* Response bar (if any) */}
      {hasResponses && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">Responses</span>
            <span className="text-[10px] font-semibold text-indigo-600">{survey._r_count}</span>
          </div>
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-400 to-violet-500 rounded-full" style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-1 border-t border-slate-100 pt-3 -mx-1" onClick={e => e.stopPropagation()}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onOpen}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                data-testid={`btn-edit-${survey.id}`}
              >
                <Edit3 className="w-3 h-3" />
                {survey.status === 'draft' ? 'Edit' : 'View'}
              </button>
            </TooltipTrigger>
            <TooltipContent>{survey.status === 'draft' ? 'Open builder' : 'View survey'}</TooltipContent>
          </Tooltip>

          {survey.status === 'active' && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={`/surveys/${survey.id}/fill`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                    data-testid={`btn-open-fill-${survey.id}`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Open fill page</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onCopyLink}
                    className="flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    data-testid={`btn-copy-link-${survey.id}`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy share link</TooltipContent>
              </Tooltip>
            </>
          )}

          {canManage && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onDuplicate}
                    disabled={duplicating}
                    className="flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    data-testid={`btn-duplicate-${survey.id}`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Duplicate</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onDelete}
                    className="flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    data-testid={`btn-delete-survey-${survey.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Survey Row (list view)
───────────────────────────────────────────── */
function SurveyRow({ survey, canManage, onOpen, onDuplicate, onDelete, onCopyLink, duplicating }: CardProps) {
  const cfg = STATUS_CFG[survey.status];

  return (
    <div
      className={cn(
        'group bg-white rounded-xl border border-l-4 border-slate-200 px-4 py-3.5',
        'flex items-center gap-4 cursor-pointer hover:shadow-sm transition-all',
        cfg.accent, cfg.glow,
      )}
      onClick={onOpen}
      data-testid={`row-survey-${survey.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-slate-800 truncate">{survey.title}</p>
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 shrink-0 border', cfg.badgeClass)}>
            <span className={cn('w-1.5 h-1.5 rounded-full mr-1', cfg.dot)} />
            {cfg.label}
          </Badge>
        </div>
        {survey.description && (
          <p className="text-xs text-slate-400 mt-0.5 truncate">{survey.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <FileText className="w-3 h-3" />{survey._q_count ?? 0}q
          </span>
          <span className={cn(
            'flex items-center gap-1 text-[11px]',
            (survey._r_count ?? 0) > 0 ? 'text-indigo-600 font-medium' : 'text-slate-400',
          )}>
            <Users className="w-3 h-3" />{survey._r_count ?? 0} responses
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <Clock className="w-3 h-3" />{format(new Date(survey.created_at), 'dd MMM yyyy')}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        {survey.status === 'active' && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={`/surveys/${survey.id}/fill`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-emerald-600 transition-colors"
                  data-testid={`btn-open-fill-row-${survey.id}`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Open fill page</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onCopyLink}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors"
                  data-testid={`btn-copy-link-row-${survey.id}`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Copy share link</TooltipContent>
            </Tooltip>
          </>
        )}
        {canManage && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onDuplicate}
                  disabled={duplicating}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  data-testid={`btn-duplicate-row-${survey.id}`}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Duplicate</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onDelete}
                  className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                  data-testid={`btn-delete-row-${survey.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </>
        )}
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors ml-1" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Empty State
───────────────────────────────────────────── */
function EmptyState({
  hasSearch, canManage, onClear, onCreate,
}: {
  hasSearch: boolean; canManage: boolean; onClear: () => void; onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
          <ClipboardList className="w-9 h-9 text-indigo-400" />
        </div>
        {hasSearch && (
          <div className="absolute -top-2 -right-2 w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center border-2 border-white">
            <Search className="w-3.5 h-3.5 text-orange-500" />
          </div>
        )}
      </div>
      <div>
        <p className="text-base font-semibold text-slate-700">
          {hasSearch ? 'No surveys match your filters' : 'No surveys yet'}
        </p>
        <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto">
          {hasSearch
            ? 'Try adjusting your search or changing the status filter.'
            : 'Create your first survey to start collecting data from your teams.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {hasSearch && (
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        )}
        {canManage && !hasSearch && (
          <Button size="sm" onClick={onCreate} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-3.5 h-3.5 mr-1.5" />Create Survey
          </Button>
        )}
      </div>
    </div>
  );
}
