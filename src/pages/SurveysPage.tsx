import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import {
  Plus, ClipboardList, Users, Clock,
  Trash2, ExternalLink, Edit3, Copy, Loader2, Search, Archive,
  PlayCircle, FileText, Link2, LayoutGrid, List, TrendingUp,
  ChevronRight, AlertCircle, ArrowUpDown,
  Share2, QrCode, CheckCircle2, XCircle, Send, AlarmClock,
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type SurveyStatus = 'draft' | 'active' | 'closed';
type ViewMode = 'grid' | 'list';
type SortKey = 'newest' | 'oldest' | 'responses' | 'name';

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

/* ── Deadline helper ────────────────────────────────────────────────────── */
function getDeadlineInfo(survey: Survey) {
  const raw = survey.settings?.expires_at;
  if (!raw) return null;
  const dl = new Date(String(raw));
  if (isNaN(dl.getTime())) return null;
  const diffMs = dl.getTime() - Date.now();
  if (diffMs < 0) return { label: 'Deadline passed', badgeCls: 'bg-orange-50 text-[#B94B13] border-orange-200', passed: true };
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);
  if (diffH < 24) return { label: `Closes in ${diffH}h`, badgeCls: 'bg-orange-50 text-[#B94B13] border-orange-200', passed: false };
  if (diffD <= 2) return { label: `Closes in ${diffD}d`, badgeCls: 'bg-orange-50 text-[#B94B13] border-orange-200', passed: false };
  if (diffD <= 7) return { label: `Closes in ${diffD}d`, badgeCls: 'bg-orange-50 text-[#B94B13] border-orange-200', passed: false };
  return { label: `Closes ${format(dl, 'dd MMM')}`, badgeCls: 'bg-slate-100 text-slate-500 border-slate-200', passed: false };
}

const STATUS_CFG: Record<SurveyStatus, {
  label: string;
  badgeClass: string;
  dot: string;
  accent: string;
  icon: React.ElementType;
  hover: string;
}> = {
  draft: {
    label: 'Draft',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
    accent: 'border-l-slate-300 bg-white',
    icon: Edit3,
    hover: 'hover:border-l-slate-400',
  },
  active: {
    label: 'Active',
    badgeClass: 'bg-[#F0F2FA] text-[#273677] border-[#D5DBED]',
    dot: 'bg-[#273677]',
    accent: 'border-l-[#273677] bg-white',
    icon: PlayCircle,
    hover: 'hover:border-l-[#1B2758]',
  },
  closed: {
    label: 'Closed',
    badgeClass: 'bg-orange-50 text-[#B94B13] border-orange-200',
    dot: 'bg-[#EC6A1F]',
    accent: 'border-l-[#EC6A1F] bg-white',
    icon: Archive,
    hover: 'hover:border-l-[#B94B13]',
  },
};

const STAT_CARDS = [
  { key: 'total' as const, label: 'Total surveys', icon: ClipboardList },
  { key: 'active' as const, label: 'Active', icon: PlayCircle },
  { key: 'draft' as const, label: 'Drafts', icon: Edit3 },
  { key: 'closed' as const, label: 'Closed', icon: Archive },
  { key: 'responses' as const, label: 'Responses', icon: Users },
];

function sortSurveys(surveys: Survey[], key: SortKey): Survey[] {
  return [...surveys].sort((a, b) => {
    if (key === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (key === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (key === 'responses') return (b._r_count ?? 0) - (a._r_count ?? 0);
    if (key === 'name') return a.title.localeCompare(b.title);
    return 0;
  });
}

export default function SurveysPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { checkPermission } = useAuthorization();

  // Role names remain a compatibility fallback for the page shell, but every
  // mutating control is governed by the effective action manifest.
  const canManage = checkPermission('surveys', 'create') ||
    checkPermission('surveys', 'update') ||
    checkPermission('surveys', 'delete');
  const canChangeStatus = checkPermission('surveys', 'status') ||
    false;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SurveyStatus>('all');
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Survey | null>(null);
  const [shareTarget, setShareTarget] = useState<Survey | null>(null);

  const { data: surveys = [], isLoading } = useQuery<Survey[]>({
    queryKey: ['surveys'],
    // Single round-trip: PostgREST embedded counts replace 3 sequential queries
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surveys')
        .select('*, survey_questions(count), survey_responses(count)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        _q_count: s.survey_questions?.[0]?.count ?? 0,
        _r_count: s.survey_responses?.[0]?.count ?? 0,
        survey_questions: undefined,
        survey_responses: undefined,
      })) as Survey[];
    },
    staleTime: 2 * 60 * 1000,
    gcTime:    10 * 60 * 1000,
  });

  // Auto-close any active survey whose deadline has passed
  useEffect(() => {
    if (!checkPermission('surveys', 'status')) return;
    if (!surveys.length) return;
    const now = new Date();
    const expired = surveys.filter(s => {
      if (s.status !== 'active') return false;
      const raw = s.settings?.expires_at;
      if (!raw) return false;
      return new Date(String(raw)) < now;
    });
    if (!expired.length) return;
    Promise.all(
      expired.map(s => supabase.from('surveys').update({ status: 'closed' }).eq('id', s.id))
    ).then(() => qc.invalidateQueries({ queryKey: ['surveys'] }));
  }, [surveys, checkPermission]);

  const createSurvey = useMutation({
    mutationFn: async () => {
      if (!checkPermission('surveys', 'create')) {
        throw new Error('You are not authorized to create surveys');
      }
      if (!newTitle.trim()) throw new Error('Title is required');
      const { data, error } = await supabase.from('surveys').insert({
        title: newTitle.trim(), description: newDesc.trim() || null,
        created_by: currentUser?.id, status: 'draft',
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['surveys'] });
      setCreateOpen(false); setNewTitle(''); setNewDesc('');
      toast({ title: 'Survey created', description: 'Opening the builder…' });
      navigate(`/surveys/${s.id}`);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteSurvey = useMutation({
    mutationFn: async (id: string) => {
      if (!checkPermission('surveys', 'delete')) {
        throw new Error('You are not authorized to delete surveys');
      }
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
      if (!checkPermission('surveys', 'create')) {
        throw new Error('You are not authorized to duplicate surveys');
      }
      const { data: newSurvey, error: sErr } = await supabase.from('surveys').insert({
        title: `${survey.title} (Copy)`, description: survey.description,
        status: 'draft', created_by: currentUser?.id, settings: survey.settings,
      }).select().single();
      if (sErr || !newSurvey) throw sErr ?? new Error('Failed');
      const { data: qs } = await supabase.from('survey_questions').select('*').eq('survey_id', survey.id).order('order_index');
      if (qs?.length) {
        await supabase.from('survey_questions').insert(qs.map(q => ({ ...q, id: undefined, survey_id: newSurvey.id })));
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

  const changeStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SurveyStatus }) => {
      if (!canChangeStatus) throw new Error('You are not authorized to change survey status');
      const { error } = await supabase.from('surveys').update({ status }).eq('id', id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      qc.invalidateQueries({ queryKey: ['surveys'] });
      const label = status === 'active' ? 'Survey is now live' : status === 'closed' ? 'Survey closed' : 'Survey set to draft';
      toast({ title: label });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const copyLink = (survey: Survey) => {
    const url = `${window.location.origin}/s/${survey.id}`;
    navigator.clipboard.writeText(url).then(() =>
      toast({ title: 'Link copied!', description: 'Share this link with respondents.' })
    );
  };

  const filtered = sortSurveys(
    surveys.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (search && !s.title.toLowerCase().includes(search.toLowerCase()) &&
          !(s.description ?? '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
    sortBy,
  );

  const stats = {
    total:     surveys.length,
    active:    surveys.filter(s => s.status === 'active').length,
    draft:     surveys.filter(s => s.status === 'draft').length,
    closed:    surveys.filter(s => s.status === 'closed').length,
    responses: surveys.reduce((acc, sv) => acc + (sv._r_count ?? 0), 0),
  };

  const cardProps = (survey: Survey) => ({
    survey,
    canCreate: checkPermission('surveys', 'create'),
    canUpdate: checkPermission('surveys', 'update'),
    canDelete: checkPermission('surveys', 'delete'),
    canChangeStatus,
    onOpen:      () => navigate(`/surveys/${survey.id}`),
    onDuplicate: () => duplicateSurvey.mutate(survey),
    onDelete:    () => setDeleteTarget(survey),
    onCopyLink:  () => copyLink(survey),
    onShare:     () => setShareTarget(survey),
    onChangeStatus: (status: SurveyStatus) => changeStatus.mutate({ id: survey.id, status }),
    duplicating: duplicateSurvey.isPending,
    statusChanging: changeStatus.isPending,
  });

  // ── Fill-only view for users without manage permission ──────────────────────
  if (!canManage && !canChangeStatus) {
    const activeSurveys = surveys
      .filter(s => s.status === 'active')
      .filter(s => {
        if (!search) return true;
        return s.title.toLowerCase().includes(search.toLowerCase()) ||
               (s.description ?? '').toLowerCase().includes(search.toLowerCase());
      });

    return (
      <div className="min-h-screen bg-[#F7F8FB]">
        {/* Header */}
        <div className="border-b border-[#DDE2ED] bg-white px-5 py-7 md:px-10">
          <div className="max-w-5xl mx-auto border-l-[3px] border-[#EC6A1F] pl-4">
            <h1 className="text-2xl font-semibold tracking-tight text-[#1B2758]">Available Forms</h1>
            <p className="mt-1 text-sm text-slate-600">Select a form to fill and submit your response.</p>
            {!isLoading && activeSurveys.length > 0 && (
              <div className="mt-2 text-xs font-medium text-[#273677]">
                  {activeSurveys.length} form{activeSurveys.length !== 1 ? 's' : ''} available
              </div>
            )}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search forms…"
              className="pl-8 h-9 text-sm bg-white border-slate-200"
              data-testid="input-fill-search"
            />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 h-24 animate-pulse">
                  <div className="h-4 w-1/2 rounded bg-slate-200 mb-3" />
                  <div className="h-3 w-1/3 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : activeSurveys.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <ClipboardList className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-slate-600 font-medium">No forms available</p>
              <p className="text-sm text-slate-400 mt-1">
                {search ? 'No forms match your search.' : 'There are no active forms to fill right now.'}
              </p>
              {search && (
                <button onClick={() => setSearch('')} className="mt-3 text-sm text-[#273677] hover:underline">
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {activeSurveys.map(survey => {
                const draft = getLocalDraft(survey.id);
                return (
                  <a
                    key={survey.id}
                    href={`/s/${survey.id}`}
                    className={cn(
                      'group flex items-start justify-between gap-4 bg-white rounded-lg',
                      'border border-l-[3px] border-[#DDE2ED] border-l-[#273677] p-5',
                      'hover:border-[#B6C1DE] transition-colors no-underline',
                    )}
                    data-testid={`card-fill-${survey.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#273677] shrink-0" />
                        <h3 className="font-semibold text-slate-800 text-[15px] leading-snug">{survey.title}</h3>
                      </div>
                      {survey.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 mb-1.5 ml-3.5">{survey.description}</p>
                      )}
                      <div className="flex items-center gap-3 ml-3.5 flex-wrap">
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <FileText className="w-3 h-3" />
                          {survey._q_count ?? 0} question{(survey._q_count ?? 0) !== 1 ? 's' : ''}
                        </span>
                        {draft.hasDraft && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#B94B13]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#EC6A1F]" />
                            Draft saved{draft.savedAt ? ` · ${formatDistanceToNow(draft.savedAt, { addSuffix: true })}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={cn(
                      'shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors',
                      draft.hasDraft
                        ? 'bg-orange-50 text-[#B94B13] border border-orange-200 group-hover:bg-orange-100'
                        : 'bg-[#273677] text-white group-hover:bg-[#1B2758]',
                    )}>
                      {draft.hasDraft ? 'Continue' : 'Fill Form'}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-[#F7F8FB]" data-testid="page-surveys">

      {/* ── Page heading ── */}
      <div className="border-b border-[#DDE2ED] bg-white px-5 py-7 md:px-10">
        <div className="max-w-5xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="border-l-[3px] border-[#EC6A1F] pl-4">
            <h1 className="text-2xl font-semibold tracking-tight text-[#1B2758]">Surveys</h1>
            <p className="mt-1 text-sm text-slate-600">Create surveys, track responses, and manage publication.</p>
            {stats.active > 0 && (
              <div className="mt-2 text-xs font-medium text-[#273677]">
                  {stats.active} active survey{stats.active !== 1 ? 's' : ''} collecting responses
              </div>
            )}
          </div>
          {canManage && (
            <Button
              onClick={() => setCreateOpen(true)}
              data-testid="btn-new-survey"
              className="bg-[#273677] text-white hover:bg-[#1B2758] font-medium gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" />New Survey
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-5">

        {/* ── One quiet metrics strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 overflow-hidden rounded-lg border border-[#DDE2ED] bg-white divide-x divide-y divide-[#DDE2ED] sm:divide-y-0">
          {STAT_CARDS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key === 'responses' || key === 'total' ? 'all' : key)}
              className={cn(
                'min-w-0 p-4 text-left transition-colors hover:bg-[#F5F6FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#273677]',
                (statusFilter === key || (key === 'total' && statusFilter === 'all')) && 'bg-[#F0F2FA] border-t-[3px] border-t-[#273677]',
              )}
              data-testid={`kpi-${key}`}
            >
              <div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4" /><span className="truncate text-xs font-medium">{label}</span></div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-[#1B2758]">{stats[key]}</p>
            </button>
          ))}
        </div>

        {/* ── Filters + Sort + View Toggle ── */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search surveys…"
              className="pl-8 h-9 text-sm bg-white border-[#DDE2ED] focus:border-[#273677]"
              data-testid="input-survey-search"
            />
          </div>

          {/* Status pills */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            {(['all', 'active', 'draft', 'closed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                data-testid={`btn-filter-${f}`}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize',
                  statusFilter === f ? 'bg-[#273677] text-white' : 'text-slate-600 hover:text-[#273677] hover:bg-[#F0F2FA]',
                )}
              >
                {f === 'all' ? 'All' : STATUS_CFG[f as SurveyStatus].label}
                {f !== 'all' && (
                  <span className={cn(
                    'ml-1.5 px-1 rounded-full text-[10px] font-semibold',
                    statusFilter === f ? 'bg-white/20' : 'bg-slate-100 text-slate-500',
                  )}>
                    {stats[f as keyof typeof stats]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <Select value={sortBy} onValueChange={v => setSortBy(v as SortKey)}>
              <SelectTrigger className="h-9 w-36 text-xs bg-white border-slate-200" data-testid="select-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="responses">Most responses</SelectItem>
                <SelectItem value="name">A → Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => setViewMode('grid')} data-testid="btn-view-grid"
                  className={cn('p-1.5 rounded-md transition-colors', viewMode === 'grid' ? 'bg-[#273677] text-white' : 'text-slate-500 hover:text-[#273677]')}>
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Grid view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => setViewMode('list')} data-testid="btn-view-list"
                  className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-[#273677] text-white' : 'text-slate-500 hover:text-[#273677]')}>
                  <List className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>List view</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Result count */}
        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-slate-400 -mt-2">
            Showing <span className="font-medium text-slate-600">{filtered.length}</span> of {surveys.length} surveys
            {search && <> matching <span className="font-medium text-[#273677]">"{search}"</span></>}
          </p>
        )}

        {/* ── Survey Grid / List ── */}
        {isLoading ? (
          <div className={viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
            : 'space-y-2'}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={cn(
                'rounded-2xl border border-slate-200 bg-white animate-pulse',
                viewMode === 'grid' ? 'p-5 h-44' : 'p-4 h-20 flex items-center gap-4',
              )}>
                {viewMode === 'grid' ? (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-slate-200" />
                      <div className="h-3 w-16 rounded bg-slate-200" />
                    </div>
                    <div className="h-4 w-3/4 rounded bg-slate-200 mb-2" />
                    <div className="h-3 w-1/2 rounded bg-slate-100 mb-4" />
                    <div className="flex gap-3 mt-auto">
                      <div className="h-3 w-16 rounded bg-slate-100" />
                      <div className="h-3 w-16 rounded bg-slate-100" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-lg bg-slate-200 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 rounded bg-slate-200" />
                      <div className="h-2.5 w-1/4 rounded bg-slate-100" />
                    </div>
                    <div className="w-16 h-3 rounded bg-slate-100" />
                  </>
                )}
              </div>
            ))}
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
            {filtered.map(survey => <SurveyCard key={survey.id} {...cardProps(survey)} />)}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(survey => <SurveyRow key={survey.id} {...cardProps(survey)} />)}
          </div>
        )}

        {/* Analytics tip */}
        {stats.responses > 0 && (
          <div className="rounded-lg border border-[#DDE2ED] bg-white p-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-md bg-[#F0F2FA] flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-[#273677]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1B2758]">
                {stats.responses.toLocaleString()} total response{stats.responses !== 1 ? 's' : ''} collected
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Click any survey and open the Analytics tab to view response breakdowns, charts, and insights.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-md bg-[#F0F2FA] flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-[#273677]" />
              </div>
              <div>
                <DialogTitle className="text-lg">New Survey</DialogTitle>
                <p className="text-xs text-slate-500 mt-0.5">You'll be taken to the builder right away</p>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="new-title">Title <span className="text-[#B94B13]">*</span></Label>
              <Input id="new-title" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Staff Satisfaction Q2 2026" data-testid="input-new-survey-title"
                onKeyDown={e => { if (e.key === 'Enter' && newTitle.trim()) createSurvey.mutate(); }}
                className="focus:border-[#273677]" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-desc">Description <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
              <Textarea id="new-desc" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Brief description shown to respondents…" rows={3}
                data-testid="input-new-survey-desc" className="resize-none focus:border-[#273677]" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createSurvey.mutate()} disabled={!newTitle.trim() || createSurvey.isPending}
              data-testid="btn-create-survey-confirm" className="bg-[#273677] hover:bg-[#1B2758]">
              {createSurvey.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
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
              <div className="w-10 h-10 rounded-md bg-orange-50 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-[#B94B13]" />
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
            <Button variant="destructive" onClick={() => deleteTarget && deleteSurvey.mutate(deleteTarget.id)}
              disabled={deleteSurvey.isPending} data-testid="btn-delete-confirm">
              {deleteSurvey.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Share Dialog ── */}
      {shareTarget && (
        <ShareDialog
          survey={shareTarget}
          onClose={() => setShareTarget(null)}
          onCopy={() => copyLink(shareTarget)}
        />
      )}

    </div>
    </TooltipProvider>
  );
}

/* ─────────────────────────────────────────────
   Local-draft detector (reads localStorage)
───────────────────────────────────────────── */
function getLocalDraft(surveyId: string): { hasDraft: boolean; savedAt: number | null; answeredCount: number } {
  try {
    const raw = localStorage.getItem(`survey_draft_${surveyId}`);
    if (!raw) return { hasDraft: false, savedAt: null, answeredCount: 0 };
    const d = JSON.parse(raw);
    const age = d?.savedAt ? Date.now() - d.savedAt : Infinity;
    if (age > 90 * 24 * 60 * 60 * 1000) return { hasDraft: false, savedAt: null, answeredCount: 0 };
    const answered = d?.answers ? Object.keys(d.answers).length : 0;
    return { hasDraft: true, savedAt: d?.savedAt ?? null, answeredCount: answered };
  } catch { return { hasDraft: false, savedAt: null, answeredCount: 0 }; }
}

/* ─────────────────────────────────────────────
   Shared card/row props
───────────────────────────────────────────── */
interface CardProps {
  survey: Survey;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canChangeStatus: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onShare: () => void;
  onChangeStatus: (s: SurveyStatus) => void;
  duplicating: boolean;
  statusChanging: boolean;
}

/* ─────────────────────────────────────────────
   Survey Card (grid)
───────────────────────────────────────────── */
function SurveyCard({ survey, canCreate, canUpdate, canDelete, canChangeStatus, onOpen, onDuplicate, onDelete, onCopyLink, onShare, onChangeStatus, duplicating, statusChanging }: CardProps) {
  const cfg = STATUS_CFG[survey.status];
  const StatusIcon = cfg.icon;
  const hasResponses = (survey._r_count ?? 0) > 0;
  const localDraft = getLocalDraft(survey.id);

  return (
    <div
      className={cn(
        'group rounded-lg border border-l-[3px] border-[#DDE2ED] p-5 cursor-pointer',
        'hover:border-[#B6C1DE] transition-colors flex flex-col',
        cfg.accent, cfg.hover,
      )}
      onClick={onOpen}
      data-testid={`card-survey-${survey.id}`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'w-9 h-9 rounded-md flex items-center justify-center shrink-0',
            survey.status === 'active' ? 'bg-[#F0F2FA]' : survey.status === 'closed' ? 'bg-orange-50' : 'bg-slate-100',
          )}>
            <StatusIcon className={cn('w-[18px] h-[18px]',
              survey.status === 'active' ? 'text-[#273677]' : survey.status === 'closed' ? 'text-[#B94B13]' : 'text-slate-500',
            )} />
          </div>
          <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5 border font-medium', cfg.badgeClass)}>
            <span className={cn('w-1.5 h-1.5 rounded-full mr-1.5 inline-block', cfg.dot)} />
            {cfg.label}
          </Badge>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#273677] transition-colors shrink-0 mt-0.5" />
      </div>

      {/* Deadline badge */}
      {(() => {
        const dl = getDeadlineInfo(survey);
        if (!dl) return null;
        return (
          <div className={cn('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit mb-2', dl.badgeCls)}>
            <AlarmClock className="w-3 h-3" />
            {dl.label}
          </div>
        );
      })()}

      {/* Title + desc */}
      <h3 className="font-semibold text-slate-800 text-[15px] leading-snug line-clamp-2 mb-1">{survey.title}</h3>
      {survey.description && (
        <p className="text-xs text-slate-500 line-clamp-2 mb-2">{survey.description}</p>
      )}

      {/* Draft-in-progress banner */}
      {localDraft.hasDraft && (
        <div
          className="flex items-center justify-between gap-2 bg-orange-50 border border-orange-200 rounded-md px-2.5 py-1.5 mb-2"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EC6A1F] shrink-0" />
            <span className="text-[11px] text-[#B94B13] font-medium truncate">
              Draft saved
              {localDraft.savedAt && (
                <span className="font-normal text-[#B94B13]"> · {formatDistanceToNow(localDraft.savedAt, { addSuffix: true })}</span>
              )}
            </span>
            {localDraft.answeredCount > 0 && (
              <span className="text-[10px] text-[#B94B13] shrink-0">{localDraft.answeredCount}q answered</span>
            )}
          </div>
          <a
            href={`/s/${survey.id}`}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#B94B13] hover:text-[#8C380A] shrink-0"
            data-testid={`btn-continue-draft-${survey.id}`}
          >
            Continue <ChevronRight className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center gap-3 mt-auto pt-2 mb-3">
        <span className="flex items-center gap-1 text-[11px] text-slate-500">
          <FileText className="w-3 h-3 text-slate-400" />
          {survey._q_count ?? 0}q
        </span>
        <span className={cn('flex items-center gap-1 text-[11px]', hasResponses ? 'text-[#273677] font-medium' : 'text-slate-400')}>
          <Users className="w-3 h-3" />
          {survey._r_count ?? 0} response{(survey._r_count ?? 0) !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-slate-400 ml-auto">
          <Clock className="w-3 h-3" />
          {formatDistanceToNow(new Date(survey.updated_at ?? survey.created_at), { addSuffix: true })}
        </span>
      </div>

      {/* Quick status buttons */}
      {canChangeStatus && (
        <div className="flex items-center gap-1.5 mb-3" onClick={e => e.stopPropagation()}>
          {survey.status === 'draft' && (
            <button
              onClick={() => onChangeStatus('active')}
              disabled={statusChanging}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#F0F2FA] text-[#273677] hover:bg-[#E4E9F7] border border-[#D5DBED] transition-colors"
              data-testid={`btn-publish-${survey.id}`}
            >
              <Send className="w-3 h-3" />Publish
            </button>
          )}
          {survey.status === 'active' && (
            <button
              onClick={() => onChangeStatus('closed')}
              disabled={statusChanging}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors"
              data-testid={`btn-close-${survey.id}`}
            >
              <XCircle className="w-3 h-3" />Close
            </button>
          )}
          {survey.status === 'closed' && (
            <button
              onClick={() => onChangeStatus('active')}
              disabled={statusChanging}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#F0F2FA] text-[#273677] hover:bg-[#E4E9F7] border border-[#D5DBED] transition-colors"
              data-testid={`btn-reopen-${survey.id}`}
            >
              <CheckCircle2 className="w-3 h-3" />Re-open
            </button>
          )}
          {survey.status !== 'draft' && (
            <button
              onClick={() => onChangeStatus('draft')}
              disabled={statusChanging}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
              data-testid={`btn-draft-${survey.id}`}
            >
              <Edit3 className="w-3 h-3" />Draft
            </button>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-1 border-t border-slate-100 pt-3 -mx-1" onClick={e => e.stopPropagation()}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onOpen}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-[#273677] hover:bg-[#F0F2FA] transition-colors"
                data-testid={`btn-edit-${survey.id}`}>
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
                  <button onClick={onShare}
                    className="flex items-center justify-center p-1.5 rounded-md text-slate-500 hover:text-[#273677] hover:bg-[#F0F2FA] transition-colors"
                    data-testid={`btn-share-${survey.id}`}>
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Share / QR code</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href={`/s/${survey.id}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center p-1.5 rounded-md text-slate-500 hover:text-[#273677] hover:bg-[#F0F2FA] transition-colors"
                    data-testid={`btn-open-fill-${survey.id}`}>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Open fill page</TooltipContent>
              </Tooltip>
            </>
          )}

          {(canCreate || canDelete) && (
            <>
              {canCreate && <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={onDuplicate} disabled={duplicating}
                    className="flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    data-testid={`btn-duplicate-${survey.id}`}>
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Duplicate</TooltipContent>
              </Tooltip>}
              {canDelete && <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={onDelete}
                    className="flex items-center justify-center p-1.5 rounded-md text-slate-500 hover:text-[#B94B13] hover:bg-orange-50 transition-colors"
                    data-testid={`btn-delete-survey-${survey.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>}
            </>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Survey Row (list)
───────────────────────────────────────────── */
function SurveyRow({ survey, canCreate, canUpdate, canDelete, canChangeStatus, onOpen, onDuplicate, onDelete, onCopyLink, onShare, onChangeStatus, duplicating, statusChanging }: CardProps) {
  const cfg = STATUS_CFG[survey.status];
  const localDraft = getLocalDraft(survey.id);

  return (
    <div
      className={cn(
        'group bg-white rounded-lg border border-l-[3px] border-[#DDE2ED] px-4 py-3.5',
        'flex items-center gap-4 cursor-pointer hover:border-[#B6C1DE] transition-colors',
        cfg.accent, cfg.hover,
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
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <FileText className="w-3 h-3" />{survey._q_count ?? 0}q
          </span>
          <span className={cn('flex items-center gap-1 text-[11px]', (survey._r_count ?? 0) > 0 ? 'text-[#273677] font-medium' : 'text-slate-400')}>
            <Users className="w-3 h-3" />{survey._r_count ?? 0} responses
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <Clock className="w-3 h-3" />{format(new Date(survey.created_at), 'dd MMM yyyy')}
          </span>
          {localDraft.hasDraft && (
            <a
              href={`/s/${survey.id}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#B94B13] hover:text-[#8C380A]"
              data-testid={`btn-continue-draft-row-${survey.id}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#EC6A1F]" />
              Draft saved · Continue
            </a>
          )}
          {(() => {
            const dl = getDeadlineInfo(survey);
            if (!dl) return null;
            return (
              <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', dl.badgeCls)}>
                <AlarmClock className="w-3 h-3" />
                {dl.label}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Quick status */}
      {canChangeStatus && (
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {survey.status === 'draft' && (
            <button onClick={() => onChangeStatus('active')} disabled={statusChanging}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-[#F0F2FA] text-[#273677] hover:bg-[#E4E9F7] border border-[#D5DBED] transition-colors"
              data-testid={`btn-publish-row-${survey.id}`}>
              <Send className="w-3 h-3" />Publish
            </button>
          )}
          {survey.status === 'active' && (
            <button onClick={() => onChangeStatus('closed')} disabled={statusChanging}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors"
              data-testid={`btn-close-row-${survey.id}`}>
              <XCircle className="w-3 h-3" />Close
            </button>
          )}
          {survey.status === 'closed' && (
            <button onClick={() => onChangeStatus('active')} disabled={statusChanging}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-[#F0F2FA] text-[#273677] hover:bg-[#E4E9F7] border border-[#D5DBED] transition-colors"
              data-testid={`btn-reopen-row-${survey.id}`}>
              <CheckCircle2 className="w-3 h-3" />Re-open
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        {survey.status === 'active' && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={onShare}
                  className="p-2 rounded-md hover:bg-[#F0F2FA] text-slate-500 hover:text-[#273677] transition-colors"
                  data-testid={`btn-share-row-${survey.id}`}>
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Share / QR code</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <a href={`/s/${survey.id}`} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-md hover:bg-[#F0F2FA] text-slate-500 hover:text-[#273677] transition-colors"
                  data-testid={`btn-open-fill-row-${survey.id}`}>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Open fill page</TooltipContent>
            </Tooltip>
          </>
        )}
        {(canCreate || canDelete) && (
          <>
              {canCreate && <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={onDuplicate} disabled={duplicating}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  data-testid={`btn-duplicate-row-${survey.id}`}>
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Duplicate</TooltipContent>
              </Tooltip>}
              {canDelete && <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={onDelete}
                  className="p-2 rounded-md hover:bg-orange-50 text-slate-500 hover:text-[#B94B13] transition-colors"
                  data-testid={`btn-delete-row-${survey.id}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
              </Tooltip>}
          </>
        )}
        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#273677] transition-colors ml-1" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Share Dialog with QR code
───────────────────────────────────────────── */
function ShareDialog({ survey, onClose, onCopy }: { survey: Survey; onClose: () => void; onCopy: () => void }) {
  const fillUrl = `${window.location.origin}/s/${survey.id}`;
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(fillUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    onCopy();
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById('survey-qr-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${survey.title.replace(/\s+/g, '-')}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-[#F0F2FA] flex items-center justify-center shrink-0">
              <Share2 className="w-5 h-5 text-[#273677]" />
            </div>
            <div>
              <DialogTitle className="text-base">Share Survey</DialogTitle>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{survey.title}</p>
            </div>
          </div>
        </DialogHeader>

        {/* QR Code */}
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="p-4 bg-white rounded-md border border-[#DDE2ED]">
            <QRCodeSVG
              id="survey-qr-svg"
              value={fillUrl}
              size={180}
              bgColor="#ffffff"
              fgColor="#273677"
              level="M"
              includeMargin={false}
            />
          </div>
          <p className="text-xs text-slate-500 text-center">
            Scan this QR code or share the link below
          </p>
        </div>

        {/* URL copy row */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
          <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
          <p className="text-xs text-slate-600 flex-1 truncate font-mono">{fillUrl}</p>
          <button
            onClick={handleCopy}
            className={cn(
              'shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
              copied
                ? 'bg-[#F0F2FA] text-[#273677]'
                : 'bg-[#273677] text-white hover:bg-[#1B2758]',
            )}
            data-testid="btn-share-copy-link"
          >
            {copied ? <><CheckCircle2 className="w-3 h-3" />Copied!</> : <><Copy className="w-3 h-3" />Copy</>}
          </button>
        </div>

        <DialogFooter className="gap-2 mt-1">
          <Button variant="outline" size="sm" onClick={handleDownloadQR} data-testid="btn-download-qr">
            <QrCode className="w-3.5 h-3.5 mr-1.5" />Download QR
          </Button>
          <Button size="sm" onClick={onClose} className="bg-[#273677] hover:bg-[#1B2758]">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────
   Empty State
───────────────────────────────────────────── */
function EmptyState({ hasSearch, canManage, onClear, onCreate }: {
  hasSearch: boolean; canManage: boolean; onClear: () => void; onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#C8D0E3] bg-white px-6 py-16 text-center gap-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-md bg-[#F0F2FA] flex items-center justify-center">
          <ClipboardList className="w-6 h-6 text-[#273677]" />
        </div>
        {hasSearch && (
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-orange-50 rounded-full flex items-center justify-center border border-white">
            <Search className="w-3 h-3 text-[#B94B13]" />
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
        {hasSearch && <Button variant="outline" size="sm" onClick={onClear}>Clear filters</Button>}
        {canManage && !hasSearch && (
          <Button size="sm" onClick={onCreate} className="bg-[#273677] hover:bg-[#1B2758]">
            <Plus className="w-3.5 h-3.5 mr-1.5" />Create Survey
          </Button>
        )}
      </div>
    </div>
  );
}
