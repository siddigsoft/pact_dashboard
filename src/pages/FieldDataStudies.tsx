import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  BookOpen, Plus, Search, Trash2, ChevronRight, Loader2,
  BarChart2, Users, CheckCircle, Clock, Layers, FlaskConical,
  RefreshCw, Archive, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface FdStudy {
  id: string;
  name: string;
  description: string | null;
  study_type: 'panel' | 'repeated_cross_section' | 'cohort' | 'rct';
  unique_id_field: string | null;
  target_sample: number | null;
  status: 'design' | 'active' | 'paused' | 'complete' | 'archived';
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  fd_study_rounds?: { id: string; status: string; submission_count: number }[];
}

const TYPE_LABEL: Record<string, string> = {
  panel: 'Panel',
  repeated_cross_section: 'Repeated Cross-Section',
  cohort: 'Cohort',
  rct: 'RCT',
};
const TYPE_COLOR: Record<string, string> = {
  panel: 'bg-blue-50 text-blue-700 border-blue-200',
  repeated_cross_section: 'bg-purple-50 text-purple-700 border-purple-200',
  cohort: 'bg-amber-50 text-amber-700 border-amber-200',
  rct: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
const STATUS_COLOR: Record<string, string> = {
  design: 'bg-slate-100 text-slate-600',
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  complete: 'bg-blue-100 text-blue-700',
  archived: 'bg-slate-100 text-slate-400',
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  design: <Clock className="w-3 h-3" />,
  active: <Activity className="w-3 h-3" />,
  paused: <RefreshCw className="w-3 h-3" />,
  complete: <CheckCircle className="w-3 h-3" />,
  archived: <Archive className="w-3 h-3" />,
};

export default function FieldDataStudies() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [newDialog, setNewDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<string>('panel');
  const [formUidField, setFormUidField] = useState('');
  const [formTarget, setFormTarget] = useState('');

  const { data: studies = [], isLoading, refetch } = useQuery<FdStudy[]>({
    queryKey: ['fd_studies'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fd_studies')
        .select('*, fd_study_rounds(id, status, submission_count)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('fd_studies').insert({
        name: formName.trim(),
        description: formDesc.trim() || null,
        study_type: formType,
        unique_id_field: formUidField.trim() || null,
        target_sample: formTarget ? parseInt(formTarget) : null,
        status: 'design',
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_studies'] });
      setNewDialog(false);
      setFormName(''); setFormDesc(''); setFormType('panel');
      setFormUidField(''); setFormTarget('');
      toast({ title: 'Study created' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('fd_studies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fd_studies'] }); setDeleteId(null); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const filtered = studies.filter(s => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q);
  });

  const stats = {
    total: studies.length,
    active: studies.filter(s => s.status === 'active').length,
    complete: studies.filter(s => s.status === 'complete').length,
    totalRounds: studies.reduce((n, s) => n + (s.fd_study_rounds?.length ?? 0), 0),
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="font-semibold text-slate-800 dark:text-slate-100">Multi-Round Studies</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Baseline · Midline · Endline · Panel tracking · Cross-round analysis
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh-studies">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button onClick={() => setNewDialog(true)} size="sm" className="gap-1.5" data-testid="button-new-study">
                <Plus className="w-4 h-4" /> New Study
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* ── Stats ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Studies', value: stats.total, icon: <BookOpen className="w-4 h-4 text-indigo-600" />, color: 'text-indigo-700' },
            { label: 'Active', value: stats.active, icon: <Activity className="w-4 h-4 text-emerald-600" />, color: 'text-emerald-700' },
            { label: 'Complete', value: stats.complete, icon: <CheckCircle className="w-4 h-4 text-blue-600" />, color: 'text-blue-700' },
            { label: 'Total Rounds', value: stats.totalRounds, icon: <Layers className="w-4 h-4 text-purple-600" />, color: 'text-purple-700' },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-slate-500">{s.label}</span></div>
              <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Filters ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search studies…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-studies"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36" data-testid="select-filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="design">Design</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ── Studies Grid ─────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-16 text-center">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No studies yet</p>
            <p className="text-sm text-slate-400 mb-4">Create a multi-round study to track panel data across Baseline, Midline, and Endline rounds.</p>
            <Button onClick={() => setNewDialog(true)} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" /> New Study
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(study => {
              const rounds = study.fd_study_rounds ?? [];
              const doneRounds = rounds.filter(r => r.status === 'complete').length;
              const totalSubs = rounds.reduce((n, r) => n + (r.submission_count ?? 0), 0);
              const progress = study.target_sample && totalSubs
                ? Math.min(100, Math.round((totalSubs / study.target_sample) * 100))
                : null;
              return (
                <div
                  key={study.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all group"
                  onClick={() => navigate(`/field-data/studies/${study.id}`)}
                  data-testid={`card-study-${study.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">
                        {study.name}
                      </h3>
                      {study.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{study.description}</p>
                      )}
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all shrink-0"
                      onClick={e => { e.stopPropagation(); setDeleteId(study.id); }}
                      data-testid={`button-delete-study-${study.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <Badge variant="outline" className={cn('text-xs', TYPE_COLOR[study.study_type])}>
                      {study.study_type === 'rct' ? <FlaskConical className="w-3 h-3 mr-1 inline" /> : null}
                      {TYPE_LABEL[study.study_type]}
                    </Badge>
                    <Badge variant="secondary" className={cn('text-xs flex items-center gap-1', STATUS_COLOR[study.status])}>
                      {STATUS_ICON[study.status]}
                      {study.status.charAt(0).toUpperCase() + study.status.slice(1)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center mb-4">
                    {[
                      { label: 'Rounds', value: rounds.length },
                      { label: 'Done', value: doneRounds },
                      { label: 'Submissions', value: totalSubs.toLocaleString() },
                    ].map(m => (
                      <div key={m.label} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{m.value}</div>
                        <div className="text-xs text-slate-400">{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {progress !== null && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Sample progress</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{study.start_date ? format(new Date(study.start_date), 'MMM yyyy') : 'No start date'}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── New Study Dialog ─────────────────────────────────────────────── */}
      <Dialog open={newDialog} onOpenChange={setNewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Multi-Round Study</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Study Name <span className="text-red-500">*</span></Label>
              <Input
                className="mt-1"
                placeholder="e.g. Household Food Security Study — Sudan 2025-2026"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                data-testid="input-study-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                className="mt-1"
                rows={2}
                placeholder="Brief description of the study objectives…"
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Study Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="mt-1" data-testid="select-study-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="panel">Panel (same respondents)</SelectItem>
                    <SelectItem value="repeated_cross_section">Repeated Cross-Section</SelectItem>
                    <SelectItem value="cohort">Cohort</SelectItem>
                    <SelectItem value="rct">RCT (treatment/control)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Sample</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min={1}
                  placeholder="e.g. 500"
                  value={formTarget}
                  onChange={e => setFormTarget(e.target.value)}
                  data-testid="input-target-sample"
                />
              </div>
            </div>
            <div>
              <Label>Unique ID Field</Label>
              <Input
                className="mt-1"
                placeholder="e.g. household_id  (links records across rounds)"
                value={formUidField}
                onChange={e => setFormUidField(e.target.value)}
                data-testid="input-uid-field"
              />
              <p className="text-xs text-slate-500 mt-1">
                The question variable name that uniquely identifies each unit across rounds.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!formName.trim() || createMutation.isPending}
              data-testid="button-create-study"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Study
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ───────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete study?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the study, all its rounds, and tracked unit data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
