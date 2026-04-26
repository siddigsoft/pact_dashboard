import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  Plus, ClipboardList, BarChart2, Users, CheckCircle2, Clock,
  Trash2, ExternalLink, Edit3, Copy, Loader2, Search, Archive,
  PlayCircle, FileText, ChevronRight,
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

type SurveyStatus = 'draft' | 'active' | 'closed';

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

const STATUS_CFG: Record<SurveyStatus, { label: string; color: string; dot: string }> = {
  draft:  { label: 'Draft',  color: 'bg-slate-100 text-slate-600 border-slate-200',  dot: 'bg-slate-400' },
  active: { label: 'Active', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  closed: { label: 'Closed', color: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-400' },
};

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

  const filtered = surveys.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false;
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
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5" data-testid="page-surveys">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-600" />
            Surveys
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Create, distribute, and analyse surveys across your teams</p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)} data-testid="btn-new-survey" className="gap-1.5">
            <Plus className="w-4 h-4" />New Survey
          </Button>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total,    icon: ClipboardList, color: 'text-slate-600' },
          { label: 'Active',   value: stats.active,   icon: PlayCircle,    color: 'text-emerald-600' },
          { label: 'Draft',    value: stats.draft,    icon: Edit3,         color: 'text-slate-500' },
          { label: 'Closed',   value: stats.closed,   icon: Archive,       color: 'text-orange-500' },
          { label: 'Responses',value: stats.responses, icon: Users,         color: 'text-indigo-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <s.icon className={cn('w-3.5 h-3.5', s.color)} />
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search surveys…"
            className="pl-8 h-8 text-sm"
            data-testid="input-survey-search"
          />
        </div>
        <div className="flex items-center gap-1">
          {(['all','active','draft','closed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              data-testid={`btn-filter-${f}`}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize',
                statusFilter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {f === 'all' ? 'All' : STATUS_CFG[f].label}
            </button>
          ))}
        </div>
      </div>

      {/* Survey list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading surveys…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <ClipboardList className="w-12 h-12 opacity-20" />
          <p className="text-sm font-medium">{surveys.length === 0 ? 'No surveys yet — create your first one' : 'No surveys match your filters'}</p>
          {canManage && surveys.length === 0 && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />Create Survey
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(survey => {
            const cfg = STATUS_CFG[survey.status];
            return (
              <div
                key={survey.id}
                className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:border-indigo-200 hover:shadow-sm transition-all group cursor-pointer"
                onClick={() => navigate(`/surveys/${survey.id}`)}
                data-testid={`card-survey-${survey.id}`}
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-5 h-5 text-indigo-600" />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-800 truncate">{survey.title}</p>
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 shrink-0 border', cfg.color)}>
                      <span className={cn('w-1.5 h-1.5 rounded-full mr-1', cfg.dot)} />
                      {cfg.label}
                    </Badge>
                  </div>
                  {survey.description && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{survey.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {survey._q_count ?? 0} question{(survey._q_count ?? 0) !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {survey._r_count ?? 0} response{(survey._r_count ?? 0) !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(survey.created_at), 'dd MMM yyyy')}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  {survey.status === 'active' && (
                    <a
                      href={`/surveys/${survey.id}/fill`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open fill page"
                      className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors"
                      data-testid={`btn-open-fill-${survey.id}`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {canManage && (
                    <>
                      <button
                        onClick={() => duplicateSurvey.mutate(survey)}
                        title="Duplicate"
                        disabled={duplicateSurvey.isPending}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                        data-testid={`btn-duplicate-${survey.id}`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(survey)}
                        title="Delete"
                        className="p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
                        data-testid={`btn-delete-survey-${survey.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Survey</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-title">Title <span className="text-red-500">*</span></Label>
              <Input
                id="new-title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Staff Satisfaction Q2 2026"
                data-testid="input-new-survey-title"
                onKeyDown={e => { if (e.key === 'Enter' && newTitle.trim()) createSurvey.mutate(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-desc">Description <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Textarea
                id="new-desc"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Brief description shown to respondents…"
                rows={3}
                data-testid="input-new-survey-desc"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createSurvey.mutate()} disabled={!newTitle.trim() || createSurvey.isPending} data-testid="btn-create-survey-confirm">
              {createSurvey.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Create & Build
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Survey?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Deleting <strong>"{deleteTarget?.title}"</strong> will permanently remove all its questions and <strong>{deleteTarget?._r_count ?? 0} response{(deleteTarget?._r_count ?? 0) !== 1 ? 's' : ''}</strong>. This cannot be undone.
          </p>
          <DialogFooter>
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

      {/* Analytics quick info */}
      {stats.responses > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center gap-3">
          <BarChart2 className="w-5 h-5 text-indigo-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-indigo-800">
              {stats.responses} total response{stats.responses !== 1 ? 's' : ''} across {stats.active} active survey{stats.active !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-indigo-600 mt-0.5">Click a survey to see detailed analytics and responses</p>
          </div>
          <CheckCircle2 className="w-4 h-4 text-indigo-400 ml-auto shrink-0" />
        </div>
      )}
    </div>
  );
}
