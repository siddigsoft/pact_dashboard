import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft, BookOpen, Loader2, Plus, Trash2, Edit3, Save,
  CheckCircle, Clock, Activity, Pause, Users, BarChart2,
  TrendingDown, TrendingUp, Minus, ChevronDown, ChevronUp,
  AlertTriangle, Download, FlaskConical, Target, Layers,
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
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

type TabId = 'overview' | 'rounds' | 'panel' | 'analysis' | 'power';

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
}

interface FdRound {
  id: string;
  study_id: string;
  round_order: number;
  label: string;
  form_id: string | null;
  target_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  target_sample: number | null;
  submission_count: number;
  status: 'planned' | 'active' | 'complete' | 'paused';
  notes: string | null;
}

interface FdUnit {
  id: string;
  unit_id: string;
  unit_label: string | null;
  location_admin1: string | null;
  location_admin2: string | null;
  status: 'active' | 'dropped' | 'replaced' | 'refused' | 'not_found';
  dropout_reason: string | null;
}

const ROUND_STATUS_COLOR: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-500',
  active: 'bg-emerald-100 text-emerald-700',
  complete: 'bg-blue-100 text-blue-700',
  paused: 'bg-amber-100 text-amber-700',
};
const UNIT_STATUS_COLOR: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  dropped: 'bg-red-100 text-red-600',
  replaced: 'bg-purple-100 text-purple-700',
  refused: 'bg-orange-100 text-orange-700',
  not_found: 'bg-slate-100 text-slate-500',
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'rounds', label: 'Rounds' },
  { id: 'panel', label: 'Panel / Attrition' },
  { id: 'analysis', label: 'Cross-Round Analysis' },
  { id: 'power', label: 'Power Analysis' },
];

export default function FieldDataStudyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<TabId>('overview');
  const [roundDialog, setRoundDialog] = useState(false);
  const [editRound, setEditRound] = useState<FdRound | null>(null);
  const [deleteRoundId, setDeleteRoundId] = useState<string | null>(null);

  const [rLabel, setRLabel] = useState('');
  const [rTargetDate, setRTargetDate] = useState('');
  const [rTargetSample, setRTargetSample] = useState('');
  const [rStatus, setRStatus] = useState<string>('planned');
  const [rNotes, setRNotes] = useState('');

  const { data: study, isLoading: studyLoading } = useQuery<FdStudy>({
    queryKey: ['fd_study', id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fd_studies').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: rounds = [], isLoading: roundsLoading } = useQuery<FdRound[]>({
    queryKey: ['fd_study_rounds', id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fd_study_rounds').select('*').eq('study_id', id)
        .order('round_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: units = [] } = useQuery<FdUnit[]>({
    queryKey: ['fd_study_units', id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fd_study_unit_tracking').select('*').eq('study_id', id)
        .order('created_at', { ascending: true }).limit(500);
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const openNewRound = () => {
    setEditRound(null);
    setRLabel(''); setRTargetDate(''); setRTargetSample('');
    setRStatus('planned'); setRNotes('');
    setRoundDialog(true);
  };

  const openEditRound = (r: FdRound) => {
    setEditRound(r);
    setRLabel(r.label);
    setRTargetDate(r.target_date ?? '');
    setRTargetSample(r.target_sample?.toString() ?? '');
    setRStatus(r.status);
    setRNotes(r.notes ?? '');
    setRoundDialog(true);
  };

  const saveRoundMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        study_id: id,
        label: rLabel.trim(),
        target_date: rTargetDate || null,
        target_sample: rTargetSample ? parseInt(rTargetSample) : null,
        status: rStatus,
        notes: rNotes.trim() || null,
        round_order: editRound ? editRound.round_order : (rounds.length + 1),
      };
      if (editRound) {
        const { error } = await (supabase as any).from('fd_study_rounds').update(payload).eq('id', editRound.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('fd_study_rounds').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_study_rounds', id] });
      qc.invalidateQueries({ queryKey: ['fd_studies'] });
      setRoundDialog(false);
      toast({ title: editRound ? 'Round updated' : 'Round added' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteRoundMutation = useMutation({
    mutationFn: async (roundId: string) => {
      const { error } = await (supabase as any).from('fd_study_rounds').delete().eq('id', roundId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_study_rounds', id] });
      setDeleteRoundId(null);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const totalSubs = rounds.reduce((n, r) => n + r.submission_count, 0);
  const doneRounds = rounds.filter(r => r.status === 'complete').length;
  const progress = study?.target_sample && totalSubs
    ? Math.min(100, Math.round((totalSubs / study.target_sample) * 100)) : null;

  const attritionData = useMemo(() => {
    if (rounds.length === 0) return [];
    return rounds.map((r, i) => ({
      label: r.label,
      count: r.submission_count,
      pct: i === 0
        ? 100
        : rounds[0].submission_count > 0
          ? Math.round((r.submission_count / rounds[0].submission_count) * 100)
          : 0,
    }));
  }, [rounds]);

  const chartData = useMemo(() => {
    if (rounds.length < 2) return [];
    return rounds.map(r => ({
      name: r.label,
      Submissions: r.submission_count,
      Target: r.target_sample ?? 0,
    }));
  }, [rounds]);

  const unitStats = useMemo(() => ({
    total: units.length,
    active: units.filter(u => u.status === 'active').length,
    dropped: units.filter(u => u.status === 'dropped').length,
    replaced: units.filter(u => u.status === 'replaced').length,
    refused: units.filter(u => u.status === 'refused').length,
    not_found: units.filter(u => u.status === 'not_found').length,
  }), [units]);

  if (studyLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!study) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Study not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-3 py-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/field-data/studies')} data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg shrink-0">
              <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{study.name}</h1>
              <p className="text-xs text-slate-500">
                {study.study_type === 'rct' ? 'RCT' : study.study_type.replace(/_/g, ' ')}
                {study.unique_id_field ? ` · ID field: ${study.unique_id_field}` : ''}
              </p>
            </div>
            <Badge className={cn('text-xs capitalize', {
              'bg-slate-100 text-slate-500': study.status === 'design',
              'bg-emerald-100 text-emerald-700': study.status === 'active',
              'bg-blue-100 text-blue-700': study.status === 'complete',
              'bg-amber-100 text-amber-700': study.status === 'paused',
            })}>
              {study.status}
            </Badge>
          </div>

          {/* ── Tab Bar ──────────────────────────────────────────────────── */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-0 -mb-px">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                  tab === t.id
                    ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
                data-testid={`tab-${t.id}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ═══════════════════════════ OVERVIEW ═══════════════════════════ */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Rounds', value: rounds.length, icon: <Layers className="w-4 h-4 text-indigo-600" />, color: 'text-indigo-700' },
                { label: 'Complete', value: doneRounds, icon: <CheckCircle className="w-4 h-4 text-blue-600" />, color: 'text-blue-700' },
                { label: 'Submissions', value: totalSubs.toLocaleString(), icon: <BarChart2 className="w-4 h-4 text-emerald-600" />, color: 'text-emerald-700' },
                { label: 'Tracked Units', value: units.length.toLocaleString(), icon: <Users className="w-4 h-4 text-purple-600" />, color: 'text-purple-700' },
              ].map(s => (
                <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-slate-500">{s.label}</span></div>
                  <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Round progress bars */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-4">Round-by-Round Progress</h3>
              {rounds.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No rounds yet — add rounds in the Rounds tab.</p>
              ) : (
                <div className="space-y-4">
                  {rounds.map(r => {
                    const pct = r.target_sample && r.submission_count
                      ? Math.min(100, Math.round((r.submission_count / r.target_sample) * 100)) : null;
                    return (
                      <div key={r.id}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{r.label}</span>
                            <Badge variant="secondary" className={cn('text-xs', ROUND_STATUS_COLOR[r.status])}>
                              {r.status}
                            </Badge>
                          </div>
                          <span className="text-xs text-slate-500">
                            {r.submission_count.toLocaleString()}
                            {r.target_sample ? ` / ${r.target_sample.toLocaleString()}` : ''}
                            {pct !== null ? ` (${pct}%)` : ''}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', {
                              'bg-emerald-500': r.status === 'complete',
                              'bg-indigo-500': r.status === 'active',
                              'bg-slate-400': r.status === 'planned' || r.status === 'paused',
                            })}
                            style={{ width: `${pct ?? (r.submission_count > 0 ? 15 : 0)}%` }}
                          />
                        </div>
                        {r.target_date && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            Target: {format(parseISO(r.target_date), 'dd MMM yyyy')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Study metadata */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-4">Study Information</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {[
                  { label: 'Study Type', value: study.study_type.replace(/_/g, ' ') },
                  { label: 'Unique ID Field', value: study.unique_id_field ?? '—' },
                  { label: 'Target Sample', value: study.target_sample?.toLocaleString() ?? '—' },
                  { label: 'Start Date', value: study.start_date ? format(parseISO(study.start_date), 'dd MMM yyyy') : '—' },
                  { label: 'End Date', value: study.end_date ? format(parseISO(study.end_date), 'dd MMM yyyy') : '—' },
                  { label: 'Created', value: format(parseISO(study.created_at), 'dd MMM yyyy') },
                ].map(f => (
                  <div key={f.label}>
                    <div className="text-xs text-slate-400 mb-0.5">{f.label}</div>
                    <div className="font-medium text-slate-700 dark:text-slate-200 capitalize">{f.value}</div>
                  </div>
                ))}
              </div>
              {study.description && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <div className="text-xs text-slate-400 mb-1">Description</div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{study.description}</p>
                </div>
              )}
            </div>

            {/* Overall sample progress */}
            {study.target_sample && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-slate-800 dark:text-slate-100">Overall Sample Progress</h3>
                  <span className="text-sm font-semibold text-indigo-600">{progress ?? 0}%</span>
                </div>
                <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${progress ?? 0}%` }} />
                </div>
                <p className="text-xs text-slate-500">
                  {totalSubs.toLocaleString()} of {study.target_sample.toLocaleString()} target submissions across all rounds
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════ ROUNDS ═════════════════════════════ */}
        {tab === 'rounds' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-slate-800 dark:text-slate-100">
                Study Rounds ({rounds.length})
              </h2>
              <Button size="sm" onClick={openNewRound} className="gap-1.5" data-testid="button-add-round">
                <Plus className="w-4 h-4" /> Add Round
              </Button>
            </div>

            {roundsLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : rounds.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-16 text-center">
                <Layers className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No rounds yet</p>
                <p className="text-sm text-slate-400 mb-4">Add a Baseline round to get started, then Midline, Endline, and any follow-ups.</p>
                <Button size="sm" onClick={openNewRound} className="gap-1.5">
                  <Plus className="w-4 h-4" /> Add Round
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {rounds.map((r, i) => {
                  const pct = r.target_sample && r.submission_count
                    ? Math.min(100, Math.round((r.submission_count / r.target_sample) * 100)) : null;
                  return (
                    <div key={r.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5" data-testid={`card-round-${r.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 text-sm font-bold text-indigo-700 dark:text-indigo-400">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{r.label}</h3>
                              <Badge variant="secondary" className={cn('text-xs', ROUND_STATUS_COLOR[r.status])}>
                                {r.status}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                              {r.target_date && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  Target: {format(parseISO(r.target_date), 'dd MMM yyyy')}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <BarChart2 className="w-3.5 h-3.5" />
                                {r.submission_count.toLocaleString()} submissions
                                {r.target_sample ? ` / ${r.target_sample.toLocaleString()} target` : ''}
                              </span>
                            </div>
                            {pct !== null && (
                              <div className="mt-2">
                                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className={cn('h-full rounded-full', r.status === 'complete' ? 'bg-emerald-500' : 'bg-indigo-500')}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">{pct}% complete</p>
                              </div>
                            )}
                            {r.notes && <p className="text-xs text-slate-400 mt-1 italic">{r.notes}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditRound(r)} data-testid={`button-edit-round-${r.id}`}>
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => setDeleteRoundId(r.id)} data-testid={`button-delete-round-${r.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ PANEL ════════════════════════════ */}
        {tab === 'panel' && (
          <div className="space-y-6">
            {/* Attrition funnel */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-5">Attrition Funnel</h3>
              {attritionData.length < 2 ? (
                <div className="text-center py-8 text-slate-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Need at least 2 rounds with submission counts to show attrition.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {attritionData.map((row, i) => (
                    <div key={row.label}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{row.label}</span>
                        <span className="text-slate-500">
                          {row.count.toLocaleString()} units
                          {i > 0 && (
                            <span className={cn('ml-2 font-semibold', row.pct >= 90 ? 'text-emerald-600' : row.pct >= 75 ? 'text-amber-600' : 'text-red-600')}>
                              ({row.pct}% retained)
                            </span>
                          )}
                          {i === 0 && <span className="ml-2 font-semibold text-indigo-600">(baseline)</span>}
                        </span>
                      </div>
                      <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden">
                        <div
                          className={cn('h-full rounded-lg flex items-center pl-3 text-xs font-medium text-white transition-all', {
                            'bg-indigo-500': i === 0,
                            'bg-emerald-500': i > 0 && row.pct >= 90,
                            'bg-amber-500': i > 0 && row.pct >= 75 && row.pct < 90,
                            'bg-red-500': i > 0 && row.pct < 75,
                          })}
                          style={{ width: `${row.pct}%` }}
                        >
                          {row.pct > 20 ? `${row.count.toLocaleString()}` : ''}
                        </div>
                      </div>
                      {i < attritionData.length - 1 && (
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-1 pl-2">
                          <TrendingDown className="w-3 h-3" />
                          <span>{(attritionData[i].count - attritionData[i + 1].count).toLocaleString()} dropped out before {attritionData[i + 1].label}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unit status summary */}
            {units.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-4">Panel Unit Status</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: 'Active', value: unitStats.active, color: 'text-emerald-700' },
                    { label: 'Dropped', value: unitStats.dropped, color: 'text-red-600' },
                    { label: 'Replaced', value: unitStats.replaced, color: 'text-purple-700' },
                    { label: 'Refused', value: unitStats.refused, color: 'text-orange-600' },
                    { label: 'Not Found', value: unitStats.not_found, color: 'text-slate-500' },
                  ].map(s => (
                    <div key={s.label} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                      <div className={cn('text-xl font-bold', s.color)}>{s.value}</div>
                      <div className="text-xs text-slate-400">{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-700">
                        <th className="text-left py-2 pr-4 text-xs font-medium text-slate-500">Unit ID</th>
                        <th className="text-left py-2 pr-4 text-xs font-medium text-slate-500">Label</th>
                        <th className="text-left py-2 pr-4 text-xs font-medium text-slate-500">Location</th>
                        <th className="text-left py-2 text-xs font-medium text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.slice(0, 50).map(u => (
                        <tr key={u.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2 pr-4 font-mono text-xs text-slate-600 dark:text-slate-300">{u.unit_id}</td>
                          <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{u.unit_label ?? '—'}</td>
                          <td className="py-2 pr-4 text-slate-500">{[u.location_admin2, u.location_admin1].filter(Boolean).join(', ') || '—'}</td>
                          <td className="py-2">
                            <Badge variant="secondary" className={cn('text-xs', UNIT_STATUS_COLOR[u.status])}>
                              {u.status.replace('_', ' ')}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {units.length > 50 && (
                    <p className="text-xs text-slate-400 mt-2">Showing 50 of {units.length} units.</p>
                  )}
                </div>
              </div>
            )}

            {units.length === 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No tracked units yet</p>
                <p className="text-sm text-slate-400">Units are added when submissions are imported and matched by the unique ID field.</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════ CROSS-ROUND ANALYSIS ═══════════════════ */}
        {tab === 'analysis' && (
          <div className="space-y-6">
            {rounds.length < 2 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <BarChart2 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Need at least 2 rounds</p>
                <p className="text-sm text-slate-400">Add Baseline and Midline (or Endline) rounds to enable cross-round comparison.</p>
              </div>
            ) : (
              <>
                {/* Submission trend chart */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                  <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-4">Submissions Across Rounds</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="Submissions" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="Target" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Comparison table */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                  <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-4">Round Comparison Table</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          <th className="text-left py-2 pr-6 text-xs font-medium text-slate-500 w-40">Metric</th>
                          {rounds.map(r => (
                            <th key={r.id} className="text-center py-2 px-4 text-xs font-medium text-slate-700 dark:text-slate-200">
                              {r.label}
                            </th>
                          ))}
                          {rounds.length >= 2 && (
                            <th className="text-center py-2 px-4 text-xs font-medium text-slate-500">
                              Change ({rounds[0].label} → {rounds[rounds.length - 1].label})
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {
                            label: 'Submissions',
                            values: rounds.map(r => r.submission_count.toLocaleString()),
                            raw: rounds.map(r => r.submission_count),
                          },
                          {
                            label: 'Target Sample',
                            values: rounds.map(r => r.target_sample?.toLocaleString() ?? '—'),
                            raw: rounds.map(r => r.target_sample ?? null),
                          },
                          {
                            label: 'Completion %',
                            values: rounds.map(r => r.target_sample
                              ? `${Math.min(100, Math.round((r.submission_count / r.target_sample) * 100))}%` : '—'),
                            raw: rounds.map(r => r.target_sample
                              ? Math.min(100, Math.round((r.submission_count / r.target_sample) * 100)) : null),
                          },
                          {
                            label: 'Status',
                            values: rounds.map(r => r.status.charAt(0).toUpperCase() + r.status.slice(1)),
                            raw: null,
                          },
                          {
                            label: 'Target Date',
                            values: rounds.map(r => r.target_date ? format(parseISO(r.target_date), 'MMM yyyy') : '—'),
                            raw: null,
                          },
                        ].map((row, ri) => {
                          const first = row.raw?.[0];
                          const last = row.raw?.[row.raw.length - 1];
                          const change = first != null && last != null
                            ? last - first : null;
                          const changePct = first != null && last != null && first > 0
                            ? Math.round(((last - first) / first) * 100) : null;
                          return (
                            <tr key={row.label} className={cn('border-b border-slate-50 dark:border-slate-800', ri % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-800/20')}>
                              <td className="py-2.5 pr-6 text-xs font-medium text-slate-600 dark:text-slate-300">{row.label}</td>
                              {rounds.map((r, i) => (
                                <td key={r.id} className="text-center py-2.5 px-4 text-sm text-slate-700 dark:text-slate-200">
                                  {row.values[i]}
                                </td>
                              ))}
                              {rounds.length >= 2 && (
                                <td className="text-center py-2.5 px-4">
                                  {change !== null ? (
                                    <span className={cn('flex items-center justify-center gap-1 text-sm font-medium', change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-600' : 'text-slate-400')}>
                                      {change > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : change < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                                      {changePct !== null ? `${change > 0 ? '+' : ''}${changePct}%` : `${change > 0 ? '+' : ''}${change}`}
                                    </span>
                                  ) : '—'}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Attrition across rounds */}
                {attritionData.length >= 2 && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                    <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-4">Panel Retention Rate</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {attritionData.map((row, i) => (
                        <div key={row.label} className="flex items-center gap-1">
                          <div className="text-center px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg min-w-[80px]">
                            <div className="text-lg font-bold text-slate-700 dark:text-slate-200">{row.count.toLocaleString()}</div>
                            <div className="text-xs text-slate-400">{row.label}</div>
                            {i > 0 && (
                              <div className={cn('text-xs font-semibold mt-0.5', row.pct >= 90 ? 'text-emerald-600' : row.pct >= 75 ? 'text-amber-600' : 'text-red-600')}>
                                {row.pct}%
                              </div>
                            )}
                          </div>
                          {i < attritionData.length - 1 && (
                            <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════ POWER ANALYSIS ═══════════════════════ */}
        {tab === 'power' && (
          <PowerAnalysisTab study={study} rounds={rounds} />
        )}
      </div>

      {/* ── Round Dialog ──────────────────────────────────────────────── */}
      <Dialog open={roundDialog} onOpenChange={setRoundDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editRound ? 'Edit Round' : 'Add Round'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Round Label <span className="text-red-500">*</span></Label>
              <Input
                className="mt-1"
                placeholder="e.g. Baseline, Midline, Endline, Round 1"
                value={rLabel}
                onChange={e => setRLabel(e.target.value)}
                data-testid="input-round-label"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Target Date</Label>
                <Input className="mt-1" type="date" value={rTargetDate} onChange={e => setRTargetDate(e.target.value)} data-testid="input-round-target-date" />
              </div>
              <div>
                <Label>Target Sample</Label>
                <Input className="mt-1" type="number" min={1} placeholder="e.g. 500" value={rTargetSample} onChange={e => setRTargetSample(e.target.value)} data-testid="input-round-target-sample" />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={rStatus} onValueChange={setRStatus}>
                <SelectTrigger className="mt-1" data-testid="select-round-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1" rows={2} placeholder="Any notes about this round…" value={rNotes} onChange={e => setRNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoundDialog(false)}>Cancel</Button>
            <Button
              onClick={() => saveRoundMutation.mutate()}
              disabled={!rLabel.trim() || saveRoundMutation.isPending}
              data-testid="button-save-round"
            >
              {saveRoundMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editRound ? 'Save Changes' : 'Add Round'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Round Confirm ──────────────────────────────────────── */}
      <AlertDialog open={!!deleteRoundId} onOpenChange={v => !v && setDeleteRoundId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete round?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this round and all its linked data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteRoundId && deleteRoundMutation.mutate(deleteRoundId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ═══════════════════════════ POWER ANALYSIS TAB ═══════════════════════════ */

function PowerAnalysisTab({ study, rounds }: { study: FdStudy; rounds: FdRound[] }) {
  const [alpha, setAlpha] = useState('0.05');
  const [power, setPower] = useState('0.80');
  const [baseline, setBaseline] = useState('');
  const [delta, setDelta] = useState('');
  const [sigma, setSigma] = useState('');
  const [rho, setRho] = useState('0.5');
  const [attrition, setAttrition] = useState('10');
  const [deff, setDeff] = useState('1.5');
  const [nRounds, setNRounds] = useState(rounds.length > 0 ? String(rounds.length) : '2');
  const [result, setResult] = useState<{
    n_per_round: number;
    n_total: number;
    mdc: number | null;
    notes: string[];
  } | null>(null);

  const calculate = () => {
    const a = parseFloat(alpha) || 0.05;
    const pw = parseFloat(power) || 0.80;
    const d = parseFloat(delta);
    const s = parseFloat(sigma);
    const r = parseFloat(rho) || 0.5;
    const att = parseFloat(attrition) || 0;
    const de = parseFloat(deff) || 1;
    const rounds_n = parseInt(nRounds) || 2;

    if (!d || !s) {
      setResult(null);
      return;
    }

    const z_alpha = a === 0.01 ? 2.576 : a === 0.05 ? 1.96 : 1.645;
    const z_beta = pw === 0.90 ? 1.282 : pw === 0.80 ? 0.842 : pw === 0.95 ? 1.645 : 0.842;

    const variance_diff = 2 * s * s * (1 - r);
    const n_base = Math.ceil(((z_alpha + z_beta) ** 2 * variance_diff) / (d * d));
    const n_inflated = Math.ceil(n_base * de * (1 / (1 - att / 100)));
    const n_total = n_inflated * rounds_n;

    const mdc = (z_alpha + z_beta) * Math.sqrt(variance_diff / n_inflated);

    const notes: string[] = [];
    if (de > 1) notes.push(`Design effect of ${de}× applied (cluster sampling).`);
    if (att > 0) notes.push(`${att}% attrition inflation applied.`);
    if (r !== 0.5) notes.push(`Correlation between rounds (ρ = ${r}) reduces required sample.`);

    setResult({ n_per_round: n_inflated, n_total, mdc: Math.round(mdc * 1000) / 1000, notes });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">Power Analysis for Longitudinal Change Detection</h3>
        <p className="text-sm text-slate-500 mb-6">
          Calculate the sample size needed to detect a change between rounds, or the minimum detectable change (MDC) for a given sample.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <Label>Significance Level (α)</Label>
            <Select value={alpha} onValueChange={setAlpha}>
              <SelectTrigger className="mt-1" data-testid="select-alpha">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.01">α = 0.01 (99%)</SelectItem>
                <SelectItem value="0.05">α = 0.05 (95%)</SelectItem>
                <SelectItem value="0.10">α = 0.10 (90%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Statistical Power (1 − β)</Label>
            <Select value={power} onValueChange={setPower}>
              <SelectTrigger className="mt-1" data-testid="select-power">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.80">80% power</SelectItem>
                <SelectItem value="0.90">90% power</SelectItem>
                <SelectItem value="0.95">95% power</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Expected Change (δ) <span className="text-red-500">*</span></Label>
            <Input className="mt-1" type="number" placeholder="e.g. 0.5 (score units or pp)" value={delta} onChange={e => setDelta(e.target.value)} data-testid="input-delta" />
            <p className="text-xs text-slate-400 mt-0.5">The change you want to detect between rounds.</p>
          </div>
          <div>
            <Label>Standard Deviation (σ) <span className="text-red-500">*</span></Label>
            <Input className="mt-1" type="number" placeholder="e.g. 1.2" value={sigma} onChange={e => setSigma(e.target.value)} data-testid="input-sigma" />
            <p className="text-xs text-slate-400 mt-0.5">SD of the outcome at baseline. Use pilot data or literature.</p>
          </div>
          <div>
            <Label>Correlation Between Rounds (ρ)</Label>
            <Select value={rho} onValueChange={setRho}>
              <SelectTrigger className="mt-1" data-testid="select-rho">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.3">0.3 (low correlation)</SelectItem>
                <SelectItem value="0.5">0.5 (moderate — default)</SelectItem>
                <SelectItem value="0.7">0.7 (high correlation)</SelectItem>
                <SelectItem value="0.9">0.9 (very high)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400 mt-0.5">Expected correlation of outcome between same unit across rounds.</p>
          </div>
          <div>
            <Label>Number of Rounds</Label>
            <Input className="mt-1" type="number" min={2} max={10} value={nRounds} onChange={e => setNRounds(e.target.value)} data-testid="input-n-rounds" />
          </div>
          <div>
            <Label>Attrition Rate (%)</Label>
            <Input className="mt-1" type="number" min={0} max={50} placeholder="e.g. 10" value={attrition} onChange={e => setAttrition(e.target.value)} data-testid="input-attrition" />
          </div>
          <div>
            <Label>Design Effect (DEFF)</Label>
            <Input className="mt-1" type="number" min={1} step={0.1} placeholder="e.g. 1.5" value={deff} onChange={e => setDeff(e.target.value)} data-testid="input-deff" />
            <p className="text-xs text-slate-400 mt-0.5">1.0 for SRS, &gt;1 for cluster sampling.</p>
          </div>
        </div>

        <Button className="mt-6 gap-1.5" onClick={calculate} disabled={!delta || !sigma} data-testid="button-calculate-power">
          <FlaskConical className="w-4 h-4" /> Calculate
        </Button>
      </div>

      {result && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800 p-6">
          <h3 className="font-semibold text-indigo-800 dark:text-indigo-300 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5" /> Power Analysis Results
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-white dark:bg-slate-900 rounded-lg p-4 text-center shadow-sm">
              <div className="text-3xl font-bold text-indigo-700 dark:text-indigo-300">{result.n_per_round.toLocaleString()}</div>
              <div className="text-sm text-slate-500 mt-0.5">Required per round</div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-4 text-center shadow-sm">
              <div className="text-3xl font-bold text-indigo-700 dark:text-indigo-300">{result.n_total.toLocaleString()}</div>
              <div className="text-sm text-slate-500 mt-0.5">Total across all rounds</div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-4 text-center shadow-sm">
              <div className="text-3xl font-bold text-indigo-700 dark:text-indigo-300">{result.mdc ?? '—'}</div>
              <div className="text-sm text-slate-500 mt-0.5">Min. detectable change</div>
            </div>
          </div>
          {result.notes.length > 0 && (
            <div className="space-y-1">
              {result.notes.map((n, i) => (
                <p key={i} className="text-xs text-indigo-700 dark:text-indigo-300 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {n}
                </p>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500 mt-3">
            Formula: paired t-test with adjustment for between-round correlation, attrition, and design effect.
            n = (z_α + z_β)² × 2σ²(1−ρ) / δ² × DEFF × (1/(1−attrition))
          </p>
        </div>
      )}
    </div>
  );
}

// ChevronRight used inline above
const ChevronRight = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);
