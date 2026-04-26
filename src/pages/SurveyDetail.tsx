import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  ArrowLeft, Plus, Trash2, Loader2, ChevronUp, ChevronDown, ExternalLink,
  BarChart2, Edit3, Save, Copy,
  AlignLeft, AlignJustify, List, CheckSquare, Star, Sliders,
  Calendar, ChevronDown as ChevronDownIcon, Minus, Hash, Type,
  Users, FileText, Clock, MapPin, Image as ImageIcon, Paperclip,
  Phone, Mail, ScanLine, CalendarClock, GitBranch, Link2, Download,
  Folder, FolderOpen, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

type SurveyStatus = 'draft' | 'active' | 'closed';

type QuestionType =
  | 'text' | 'textarea' | 'radio' | 'checkbox'
  | 'rating' | 'scale' | 'date' | 'dropdown' | 'section_header'
  | 'number' | 'integer' | 'phone' | 'email' | 'time' | 'datetime'
  | 'gps' | 'image' | 'file' | 'barcode' | 'begin_group';

interface SkipLogic {
  condition_question_id: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'answered' | 'not_answered' | 'greater_than' | 'less_than';
  value?: string;
}

interface Survey {
  id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  settings: Record<string, unknown>;
}

interface Question {
  id: string;
  survey_id: string;
  type: QuestionType;
  label: string;
  description: string | null;
  required: boolean;
  options: string[] | null;
  order_index: number;
  settings: Record<string, unknown>;
  group_id: string | null;
}

interface Response {
  id: string;
  respondent_id: string | null;
  respondent_name: string | null;
  respondent_email: string | null;
  submitted_at: string;
}

interface Answer {
  id: string;
  response_id: string;
  question_id: string;
  answer_text: string | null;
  answer_json: unknown;
}

interface QTreeNode {
  q: Question;
  children: QTreeNode[];
}

function buildQTree(questions: Question[], parentId: string | null = null): QTreeNode[] {
  return [...questions]
    .filter(q => (q.group_id ?? null) === parentId)
    .sort((a, b) => a.order_index - b.order_index)
    .map(q => ({
      q,
      children: q.type === 'begin_group' ? buildQTree(questions, q.id) : [],
    }));
}

const STATUS_CFG: Record<SurveyStatus, { label: string; color: string }> = {
  draft:  { label: 'Draft',  color: 'bg-slate-100 text-slate-600 border-slate-200'   },
  active: { label: 'Active', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  closed: { label: 'Closed', color: 'bg-orange-50 text-orange-700 border-orange-200'  },
};

type QTypeEntry = { type: QuestionType; label: string; icon: React.ComponentType<{ className?: string }> };

const Q_TYPE_GROUPS: { label: string; types: QTypeEntry[] }[] = [
  {
    label: 'Text & Numbers',
    types: [
      { type: 'text',    label: 'Short Text',  icon: Type },
      { type: 'textarea',label: 'Long Text',   icon: AlignJustify },
      { type: 'number',  label: 'Number',      icon: Hash },
      { type: 'integer', label: 'Integer',     icon: Hash },
      { type: 'phone',   label: 'Phone',       icon: Phone },
      { type: 'email',   label: 'Email',       icon: Mail },
    ],
  },
  {
    label: 'Choice',
    types: [
      { type: 'radio',    label: 'Multiple Choice', icon: List },
      { type: 'checkbox', label: 'Checkboxes',      icon: CheckSquare },
      { type: 'dropdown', label: 'Dropdown',        icon: ChevronDownIcon },
    ],
  },
  {
    label: 'Date & Time',
    types: [
      { type: 'date',     label: 'Date',        icon: Calendar },
      { type: 'time',     label: 'Time',        icon: Clock },
      { type: 'datetime', label: 'Date & Time', icon: CalendarClock },
    ],
  },
  {
    label: 'Scale & Rating',
    types: [
      { type: 'rating', label: 'Star Rating (1–5)', icon: Star },
      { type: 'scale',  label: 'Scale (1–10)',      icon: Sliders },
    ],
  },
  {
    label: 'Location & Media',
    types: [
      { type: 'gps',     label: 'GPS Location',  icon: MapPin },
      { type: 'image',   label: 'Photo',         icon: ImageIcon },
      { type: 'file',    label: 'File Upload',   icon: Paperclip },
      { type: 'barcode', label: 'Barcode / QR',  icon: ScanLine },
    ],
  },
  {
    label: 'Layout & Structure',
    types: [
      { type: 'section_header', label: 'Section Header', icon: Minus },
      { type: 'begin_group',    label: 'Group / Repeat',  icon: Folder },
    ],
  },
];

const ALL_Q_TYPES: QTypeEntry[] = Q_TYPE_GROUPS.flatMap(g => g.types);

const CHART_COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#14b8a6','#8b5cf6','#f97316','#0ea5e9'];

export default function SurveyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser, hasRole } = useUser();
  const { isSuperAdmin } = useSuperAdmin();
  const { toast } = useToast();

  const isAdmin = isSuperAdmin || hasRole('admin') || hasRole('super_admin');
  const canManage = isAdmin || hasRole('hub_manager') || hasRole('fom') || hasRole('sr_program_officer') || hasRole('country_director');

  const [tab, setTab] = useState<'builder' | 'responses' | 'analytics'>('builder');
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [addTypeOpen, setAddTypeOpen] = useState(false);
  const [addToGroupId, setAddToGroupId] = useState<string | null>(null);
  const [editQId, setEditQId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null);

  const { data: survey, isLoading: surveyLoading } = useQuery<Survey>({
    queryKey: ['survey', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('surveys').select('*').eq('id', id!).single();
      if (error) throw error;
      setEditTitle(data.title);
      setEditDesc(data.description ?? '');
      return data as Survey;
    },
  });

  const { data: questions = [], isLoading: qLoading } = useQuery<Question[]>({
    queryKey: ['survey-questions', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('survey_questions').select('*').eq('survey_id', id!).order('order_index');
      if (error) throw error;
      return (data ?? []) as Question[];
    },
  });

  const { data: responses = [], isLoading: rLoading } = useQuery<Response[]>({
    queryKey: ['survey-responses', id],
    enabled: !!id && tab !== 'builder',
    queryFn: async () => {
      const { data, error } = await supabase.from('survey_responses').select('*').eq('survey_id', id!).order('submitted_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Response[];
    },
  });

  const { data: allAnswers = [] } = useQuery<Answer[]>({
    queryKey: ['survey-answers', id],
    enabled: !!id && tab === 'analytics' && responses.length > 0,
    queryFn: async () => {
      const rIds = responses.map(r => r.id);
      if (!rIds.length) return [];
      const { data, error } = await supabase.from('survey_answers').select('*').in('response_id', rIds);
      if (error) throw error;
      return (data ?? []) as Answer[];
    },
  });

  const saveMeta = async () => {
    if (!id || !editTitle.trim()) return;
    setSavingMeta(true);
    try {
      const { error } = await supabase.from('surveys').update({
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['survey', id] });
      qc.invalidateQueries({ queryKey: ['surveys'] });
      toast({ title: 'Survey saved' });
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally { setSavingMeta(false); }
  };

  const changeStatus = useMutation({
    mutationFn: async (status: SurveyStatus) => {
      const { error } = await supabase.from('surveys').update({ status, updated_at: new Date().toISOString() }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['survey', id] });
      qc.invalidateQueries({ queryKey: ['surveys'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const addQuestion = useMutation({
    mutationFn: async ({ type, groupId }: { type: QuestionType; groupId?: string | null }) => {
      const resolvedGroupId = groupId ?? null;
      const siblings = questions.filter(q => (q.group_id ?? null) === resolvedGroupId);
      const nextIndex = siblings.length > 0 ? Math.max(...siblings.map(q => q.order_index)) + 1 : questions.length;
      const defaultLabel =
        type === 'section_header' ? 'Section Title' :
        type === 'begin_group'    ? 'Group Name'    : 'Untitled question';
      const defaultSettings: Record<string, unknown> = type === 'scale' ? { min: 1, max: 10 } : {};
      const { error } = await supabase.from('survey_questions').insert({
        survey_id: id,
        type,
        label: defaultLabel,
        required: false,
        order_index: nextIndex,
        options: ['radio','checkbox','dropdown'].includes(type) ? ['Option 1', 'Option 2'] : null,
        settings: defaultSettings,
        group_id: resolvedGroupId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['survey-questions', id] });
      setAddTypeOpen(false);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateQuestion = useMutation({
    mutationFn: async (q: Partial<Question> & { id: string }) => {
      const { id: qid, ...rest } = q;
      const { error } = await supabase.from('survey_questions').update(rest).eq('id', qid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['survey-questions', id] }),
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteQuestion = useMutation({
    mutationFn: async (qid: string) => {
      // First ungroup any children of this group
      await supabase.from('survey_questions').update({ group_id: null }).eq('group_id', qid);
      const { error } = await supabase.from('survey_questions').delete().eq('id', qid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['survey-questions', id] }),
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const reorderQuestion = async (qid: string, direction: 'up' | 'down') => {
    const q = questions.find(x => x.id === qid);
    if (!q) return;
    const siblings = [...questions]
      .filter(x => (x.group_id ?? null) === (q.group_id ?? null))
      .sort((a, b) => a.order_index - b.order_index);
    const idx = siblings.findIndex(x => x.id === qid);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === siblings.length - 1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const a = siblings[idx], b = siblings[swapIdx];
    await Promise.all([
      supabase.from('survey_questions').update({ order_index: b.order_index }).eq('id', a.id),
      supabase.from('survey_questions').update({ order_index: a.order_index }).eq('id', b.id),
    ]);
    qc.invalidateQueries({ queryKey: ['survey-questions', id] });
  };

  const duplicateQuestion = useMutation({
    mutationFn: async (q: Question) => {
      const siblings = questions.filter(x => (x.group_id ?? null) === (q.group_id ?? null));
      const { error } = await supabase.from('survey_questions').insert({
        survey_id: id,
        type: q.type,
        label: `${q.label} (Copy)`,
        description: q.description,
        required: q.required,
        options: q.options,
        order_index: siblings.length > 0 ? Math.max(...siblings.map(x => x.order_index)) + 1 : questions.length,
        settings: { ...q.settings, skip_logic: undefined },
        group_id: q.group_id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['survey-questions', id] }),
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const copyFillLink = () => {
    const url = `${window.location.origin}/surveys/${id}/fill`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: 'Link copied!', description: 'Share this link with your respondents.' });
    }).catch(() => {
      toast({ title: 'Link', description: url });
    });
  };

  const exportCSV = async () => {
    if (!responses.length) return;
    const rIds = responses.map(r => r.id);
    const { data: ans } = await supabase.from('survey_answers').select('*').in('response_id', rIds);
    const cols = questions.filter(q => !['section_header','begin_group'].includes(q.type));
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ['Respondent Name','Respondent Email','Submitted At',...cols.map(q => esc(q.label))].join(',');
    const rows = responses.map(r => {
      const ra = (ans ?? []).filter(a => a.response_id === r.id);
      const cells = cols.map(q => {
        const a = ra.find(x => x.question_id === q.id);
        if (!a) return '""';
        if (Array.isArray(a.answer_json)) return esc((a.answer_json as string[]).join('; '));
        if (a.answer_text) return esc(a.answer_text);
        if (a.answer_json !== null && a.answer_json !== undefined) return esc(String(a.answer_json));
        return '""';
      });
      return [esc(r.respondent_name ?? ''), esc(r.respondent_email ?? ''), esc(format(new Date(r.submitted_at), 'yyyy-MM-dd HH:mm:ss')), ...cells].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${survey?.title ?? 'survey'}_responses.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const getChartData = (q: Question) => {
    const qAnswers = allAnswers.filter(a => a.question_id === q.id);
    if (['radio', 'dropdown'].includes(q.type)) {
      const counts: Record<string, number> = {};
      for (const a of qAnswers) if (a.answer_text) counts[a.answer_text] = (counts[a.answer_text] ?? 0) + 1;
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }
    if (q.type === 'checkbox') {
      const counts: Record<string, number> = {};
      for (const a of qAnswers) {
        const arr = Array.isArray(a.answer_json) ? a.answer_json as string[] : [];
        for (const v of arr) counts[v] = (counts[v] ?? 0) + 1;
      }
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }
    if (q.type === 'rating') {
      const counts: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
      for (const a of qAnswers) {
        const v = String(a.answer_json ?? a.answer_text ?? '');
        if (v in counts) counts[v]++;
      }
      return Object.entries(counts).map(([name, value]) => ({ name: `★${name}`, value }));
    }
    if (q.type === 'scale') {
      const counts: Record<string, number> = {};
      for (const a of qAnswers) {
        const v = String(a.answer_json ?? a.answer_text ?? '');
        if (v) counts[v] = (counts[v] ?? 0) + 1;
      }
      return Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0])).map(([name, value]) => ({ name, value }));
    }
    return [];
  };

  const getTextAnswers = (q: Question) =>
    allAnswers.filter(a => a.question_id === q.id && (a.answer_text ?? '').trim()).map(a => a.answer_text!);

  const getAvgRating = (q: Question) => {
    const qAnswers = allAnswers.filter(a => a.question_id === q.id);
    const nums = qAnswers.map(a => Number(a.answer_json ?? a.answer_text)).filter(n => !isNaN(n) && n > 0);
    return nums.length ? (nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(1) : null;
  };

  const toggleCollapsed = (gid: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  // ── Tree renderer (defined here to close over component state) ──────────────
  const renderQTree = (nodes: QTreeNode[], depth = 0): React.ReactNode => {
    return nodes.map(node => {
      if (node.q.type === 'begin_group') {
        const collapsed = collapsedGroups.has(node.q.id);
        const groupLabel = ALL_Q_TYPES.find(t => t.type === 'begin_group')?.label ?? 'Group';
        const childCount = node.children.length;
        return (
          <GroupPanel
            key={node.q.id}
            group={node.q}
            depth={depth}
            collapsed={collapsed}
            onToggleCollapse={() => toggleCollapsed(node.q.id)}
            allQuestions={questions}
            canManage={canManage}
            isEditing={editQId === node.q.id}
            onEdit={() => setEditQId(editQId === node.q.id ? null : node.q.id)}
            onUpdate={(patch) => updateQuestion.mutate({ id: node.q.id, ...patch })}
            onDelete={() => deleteQuestion.mutate(node.q.id)}
            onMoveUp={() => reorderQuestion(node.q.id, 'up')}
            onMoveDown={() => reorderQuestion(node.q.id, 'down')}
            saving={updateQuestion.isPending}
            deleting={deleteQuestion.isPending}
            onAddToGroup={() => { setAddToGroupId(node.q.id); setAddTypeOpen(true); }}
          >
            {!collapsed && (
              <div className="space-y-2">
                {node.children.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-slate-400 gap-1 bg-white/60 rounded-lg border border-dashed border-slate-300">
                    <Folder className="w-5 h-5 opacity-30" />
                    <p className="text-xs">Empty group — add questions below</p>
                  </div>
                ) : (
                  renderQTree(node.children, depth + 1)
                )}
                {canManage && (
                  <button
                    onClick={() => { setAddToGroupId(node.q.id); setAddTypeOpen(true); }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-indigo-200 text-indigo-500 text-xs font-medium hover:bg-indigo-50 hover:border-indigo-400 transition-colors"
                    data-testid={`btn-add-to-group-${node.q.id}`}
                  >
                    <Plus className="w-3 h-3" />Add question to this group
                  </button>
                )}
              </div>
            )}
          </GroupPanel>
        );
      }

      const siblings = questions
        .filter(x => (x.group_id ?? null) === (node.q.group_id ?? null))
        .sort((a, b) => a.order_index - b.order_index);
      const sibIdx = siblings.findIndex(x => x.id === node.q.id);

      return (
        <QuestionCard
          key={node.q.id}
          q={node.q}
          idx={sibIdx}
          total={siblings.length}
          allQuestions={questions}
          canManage={canManage}
          isEditing={editQId === node.q.id}
          onEdit={() => setEditQId(editQId === node.q.id ? null : node.q.id)}
          onUpdate={(patch) => updateQuestion.mutate({ id: node.q.id, ...patch })}
          onDelete={() => deleteQuestion.mutate(node.q.id)}
          onDuplicate={() => duplicateQuestion.mutate(node.q)}
          onMoveUp={() => reorderQuestion(node.q.id, 'up')}
          onMoveDown={() => reorderQuestion(node.q.id, 'down')}
          saving={updateQuestion.isPending}
          deleting={deleteQuestion.isPending}
        />
      );
    });
  };

  if (surveyLoading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading survey…
    </div>
  );
  if (!survey) return (
    <div className="max-w-2xl mx-auto p-8 text-center">
      <p className="text-slate-500">Survey not found.</p>
      <Link to="/surveys" className="text-indigo-600 underline mt-2 block">Back to Surveys</Link>
    </div>
  );

  const scfg = STATUS_CFG[survey.status];
  const nonStructural = questions.filter(q => !['section_header','begin_group'].includes(q.type));

  const addGroupLabel = addToGroupId
    ? questions.find(q => q.id === addToGroupId)?.label ?? 'group'
    : null;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/surveys')} className="p-2 rounded-lg hover:bg-slate-100 mt-0.5" data-testid="btn-back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 border', scfg.color)}>{scfg.label}</Badge>
            {survey.status === 'active' && (
              <>
                <a href={`/surveys/${survey.id}/fill`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline">
                  <ExternalLink className="w-3 h-3" />Fill Link
                </a>
                <button
                  onClick={copyFillLink}
                  className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
                  title="Copy fill link to clipboard"
                >
                  <Link2 className="w-3 h-3" />Copy Link
                </button>
              </>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-800 mt-1">{survey.title}</h1>
          {survey.description && <p className="text-sm text-slate-500 mt-0.5">{survey.description}</p>}
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Select value={survey.status} onValueChange={v => changeStatus.mutate(v as SurveyStatus)}>
              <SelectTrigger className="h-8 text-xs w-[110px]" data-testid="select-survey-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-0">
        {([
          { id: 'builder',   label: 'Builder',   icon: Edit3,     badge: nonStructural.length },
          { id: 'responses', label: 'Responses', icon: Users,     badge: responses.length },
          { id: 'analytics', label: 'Analytics', icon: BarChart2, badge: 0 },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            <t.icon className="w-3.5 h-3.5" />{t.label}
            {t.badge > 0 && (
              <span className="ml-0.5 px-1.5 py-0 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── BUILDER TAB ─────────────────────────────────────────────────────── */}
      {tab === 'builder' && (
        <div className="space-y-4">
          {canManage && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Survey Details</h3>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-title">Title</Label>
                  <Input id="edit-title" value={editTitle} onChange={e => setEditTitle(e.target.value)} data-testid="input-survey-title" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-desc">Description</Label>
                  <Textarea id="edit-desc" value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} data-testid="input-survey-desc" />
                </div>
              </div>
              <Button size="sm" onClick={saveMeta} disabled={savingMeta || !editTitle.trim()} data-testid="btn-save-meta">
                {savingMeta ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                Save Details
              </Button>
            </div>
          )}

          {nonStructural.length > 0 && !qLoading && (() => {
            const reqCount = nonStructural.filter(q => q.required).length;
            const condCount = nonStructural.filter(q => !!(q.settings?.skip_logic as SkipLogic | undefined)?.condition_question_id).length;
            const groupCount = questions.filter(q => q.type === 'begin_group').length;
            return (
              <div className="flex items-center gap-3 text-[11px] text-slate-400 px-1 flex-wrap">
                <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{nonStructural.length} question{nonStructural.length !== 1 ? 's' : ''}</span>
                {groupCount > 0 && <span className="flex items-center gap-1 text-indigo-400"><Folder className="w-3 h-3" />{groupCount} group{groupCount !== 1 ? 's' : ''}</span>}
                {reqCount > 0 && <span className="flex items-center gap-1 text-red-400"><span className="font-bold">*</span>{reqCount} required</span>}
                {condCount > 0 && <span className="flex items-center gap-1 text-amber-500"><GitBranch className="w-3 h-3" />{condCount} conditional</span>}
              </div>
            );
          })()}

          <div className="space-y-2">
            {qLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading questions…
              </div>
            ) : questions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2 bg-white rounded-xl border border-dashed border-slate-300">
                <FileText className="w-8 h-8 opacity-30" />
                <p className="text-sm">No questions yet. Add your first question below.</p>
              </div>
            ) : (
              renderQTree(buildQTree(questions))
            )}
          </div>

          {canManage && (
            <Button variant="outline" onClick={() => { setAddToGroupId(null); setAddTypeOpen(true); }} className="w-full gap-1.5" data-testid="btn-add-question">
              <Plus className="w-4 h-4" />Add Question
            </Button>
          )}
        </div>
      )}

      {/* ── RESPONSES TAB ───────────────────────────────────────────────────── */}
      {tab === 'responses' && (
        <div className="space-y-3">
          {responses.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{responses.length} response{responses.length !== 1 ? 's' : ''}</p>
              <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5 text-xs" data-testid="btn-export-csv">
                <Download className="w-3.5 h-3.5" />Export CSV
              </Button>
            </div>
          )}
          {rLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div>
          ) : responses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <Users className="w-10 h-10 opacity-20" />
              <p className="text-sm">No responses yet</p>
            </div>
          ) : (
            responses.map(r => (
              <ResponseRow
                key={r.id}
                r={r}
                questions={questions}
                isExpanded={expandedResponse === r.id}
                onToggle={() => setExpandedResponse(expandedResponse === r.id ? null : r.id)}
              />
            ))
          )}
        </div>
      )}

      {/* ── ANALYTICS TAB ───────────────────────────────────────────────────── */}
      {tab === 'analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Responses', value: responses.length, icon: Users },
              { label: 'Questions', value: nonStructural.length, icon: FileText },
              { label: 'Avg completion', value: responses.length > 0 ? '100%' : '—', icon: BarChart2 },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium uppercase tracking-wide">
                  <s.icon className="w-3.5 h-3.5" />{s.label}
                </div>
                <p className="text-2xl font-bold text-slate-800 mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          {nonStructural.map(q => {
            const chartData = getChartData(q);
            const textAnswers = getTextAnswers(q);
            const avg = getAvgRating(q);
            const answerCount = allAnswers.filter(a => a.question_id === q.id).length;
            const QIcon = ALL_Q_TYPES.find(t => t.type === q.type)?.icon ?? FileText;
            const parentGroup = q.group_id ? questions.find(g => g.id === q.group_id) : null;

            return (
              <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <QIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-800">{q.label}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 capitalize">
                        {q.type.replace(/_/g, ' ')} · {answerCount} answer{answerCount !== 1 ? 's' : ''}
                        {parentGroup && <> · <span className="text-indigo-400"><Folder className="w-2.5 h-2.5 inline" /> {parentGroup.label}</span></>}
                      </p>
                    </div>
                  </div>
                  {avg && (
                    <div className="text-right">
                      <p className="text-2xl font-bold text-indigo-600">{avg}</p>
                      <p className="text-[10px] text-slate-400">{q.type === 'rating' ? 'avg / 5' : 'avg / 10'}</p>
                    </div>
                  )}
                </div>

                {chartData.length > 0 && (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                      <Tooltip formatter={(v: number) => [`${v} response${v !== 1 ? 's' : ''}`, '']} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {['text','textarea','phone','email','number','integer','barcode','gps'].includes(q.type) && textAnswers.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {textAnswers.map((t, i) => (
                      <div key={i} className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">"{t}"</div>
                    ))}
                  </div>
                )}

                {answerCount === 0 && (
                  <p className="text-sm text-slate-400 italic">No answers yet</p>
                )}
              </div>
            );
          })}

          {responses.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <BarChart2 className="w-10 h-10 opacity-20" />
              <p className="text-sm">Analytics will appear once there are responses</p>
            </div>
          )}
        </div>
      )}

      {/* Add question type picker */}
      <Dialog open={addTypeOpen} onOpenChange={setAddTypeOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {addGroupLabel ? `Add to "${addGroupLabel}"` : 'Choose Question Type'}
            </DialogTitle>
          </DialogHeader>
          {addGroupLabel && (
            <p className="text-xs text-indigo-600 flex items-center gap-1 -mt-1">
              <Folder className="w-3 h-3" />Questions will be added inside this group
            </p>
          )}
          <div className="space-y-4 py-2">
            {Q_TYPE_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{group.label}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.types.map(qt => (
                    <button
                      key={qt.type}
                      onClick={() => addQuestion.mutate({ type: qt.type, groupId: addToGroupId })}
                      disabled={addQuestion.isPending}
                      data-testid={`btn-add-type-${qt.type}`}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-sm font-medium text-slate-700 transition-colors text-left"
                    >
                      <qt.icon className="w-4 h-4 text-indigo-500 shrink-0" />
                      {qt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── GroupPanel ────────────────────────────────────────────────────────────────
function GroupPanel({
  group, depth, collapsed, onToggleCollapse,
  allQuestions, canManage,
  isEditing, onEdit, onUpdate, onDelete, onMoveUp, onMoveDown,
  saving, deleting, onAddToGroup, children,
}: {
  group: Question; depth: number; collapsed: boolean; onToggleCollapse: () => void;
  allQuestions: Question[]; canManage: boolean;
  isEditing: boolean; onEdit: () => void;
  onUpdate: (p: Partial<Question>) => void;
  onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
  saving: boolean; deleting: boolean; onAddToGroup: () => void;
  children?: React.ReactNode;
}) {
  const [labelDraft, setLabelDraft] = useState(group.label);
  const [descDraft, setDescDraft] = useState(group.description ?? '');
  const existingSkip = group.settings?.skip_logic as SkipLogic | undefined;
  const [skipEnabled, setSkipEnabled] = useState(!!existingSkip?.condition_question_id);
  const [skipQId, setSkipQId] = useState(existingSkip?.condition_question_id ?? '');
  const [skipOp, setSkipOp] = useState<SkipLogic['operator']>(existingSkip?.operator ?? 'equals');
  const [skipVal, setSkipVal] = useState(existingSkip?.value ?? '');

  const prevQuestions = allQuestions.filter(pq =>
    pq.order_index < group.order_index && !['section_header','begin_group'].includes(pq.type)
  );
  const valueNeeded = !['answered','not_answered'].includes(skipOp);
  const hasSkip = !!existingSkip?.condition_question_id;

  const siblings = allQuestions
    .filter(x => (x.group_id ?? null) === (group.group_id ?? null) && x.type === 'begin_group')
    .sort((a, b) => a.order_index - b.order_index);
  const sibIdx = siblings.findIndex(x => x.id === group.id);

  const indentColors = [
    'border-indigo-200 bg-indigo-50/20',
    'border-violet-200 bg-violet-50/20',
    'border-sky-200 bg-sky-50/20',
  ];
  const headerColors = [
    'bg-indigo-50 border-b border-indigo-100',
    'bg-violet-50 border-b border-violet-100',
    'bg-sky-50 border-b border-sky-100',
  ];
  const textColors = ['text-indigo-700', 'text-violet-700', 'text-sky-700'];
  const colorIdx = depth % 3;

  const save = () => {
    const skipLogic: SkipLogic | undefined = skipEnabled && skipQId
      ? { condition_question_id: skipQId, operator: skipOp, value: valueNeeded ? skipVal : undefined }
      : undefined;
    onUpdate({
      label: labelDraft.trim() || group.label,
      description: descDraft.trim() || null,
      settings: { ...group.settings, skip_logic: skipLogic },
    });
    onEdit();
  };

  return (
    <div className={cn('rounded-xl border-2 overflow-hidden', indentColors[colorIdx])}>
      {/* Group header bar */}
      <div className={cn('flex items-center gap-2 px-3 py-2', headerColors[colorIdx])}>
        <button
          onClick={onToggleCollapse}
          className={cn('p-0.5 rounded text-slate-500 hover:bg-white/60 transition-colors shrink-0')}
          title={collapsed ? 'Expand group' : 'Collapse group'}
        >
          <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', !collapsed && 'rotate-90')} />
        </button>
        {collapsed ? (
          <Folder className={cn('w-4 h-4 shrink-0', textColors[colorIdx])} />
        ) : (
          <FolderOpen className={cn('w-4 h-4 shrink-0', textColors[colorIdx])} />
        )}
        <div className="flex-1 min-w-0">
          <span className={cn('text-sm font-semibold truncate', textColors[colorIdx])}>{group.label}</span>
          {group.description && <span className="text-xs text-slate-400 ml-2 truncate">{group.description}</span>}
          {hasSkip && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1 rounded border border-amber-200">
              <GitBranch className="w-2 h-2" />conditional
            </span>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={onMoveUp} disabled={sibIdx === 0} className="p-1 rounded hover:bg-white/60 text-slate-400 disabled:opacity-30" title="Move up"><ChevronUp className="w-3 h-3" /></button>
            <button onClick={onMoveDown} disabled={sibIdx === siblings.length - 1} className="p-1 rounded hover:bg-white/60 text-slate-400 disabled:opacity-30" title="Move down"><ChevronDown className="w-3 h-3" /></button>
            <button onClick={onEdit} className={cn('p-1 rounded text-slate-400', isEditing ? 'bg-white/80 text-indigo-600' : 'hover:bg-white/60')} title="Edit group"><Edit3 className="w-3 h-3" /></button>
            <button onClick={onDelete} disabled={deleting} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500" title="Delete group"><Trash2 className="w-3 h-3" /></button>
          </div>
        )}
      </div>

      {/* Edit panel */}
      {isEditing && (
        <div className="border-b border-indigo-100 p-4 space-y-3 bg-white/80">
          <div className="space-y-1">
            <Label className="text-xs">Group name</Label>
            <Input value={labelDraft} onChange={e => setLabelDraft(e.target.value)} placeholder="Group label…" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Input value={descDraft} onChange={e => setDescDraft(e.target.value)} placeholder="Shown to respondents above the group…" />
          </div>
          {/* Skip logic for the group */}
          <div className="border border-amber-200 rounded-xl p-3 space-y-3 bg-amber-50/40">
            <div className="flex items-center gap-2">
              <input type="checkbox" id={`gskip-${group.id}`} checked={skipEnabled} onChange={e => setSkipEnabled(e.target.checked)} className="rounded" />
              <Label htmlFor={`gskip-${group.id}`} className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                <GitBranch className="w-3 h-3" />Show this group only if…
              </Label>
            </div>
            {skipEnabled && (
              <div className="space-y-2 pl-5">
                {prevQuestions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No previous questions available for conditions.</p>
                ) : (
                  <>
                    <Select value={skipQId} onValueChange={setSkipQId}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select a question…" /></SelectTrigger>
                      <SelectContent>
                        {prevQuestions.map(pq => (
                          <SelectItem key={pq.id} value={pq.id} className="text-xs">
                            {pq.label.length > 40 ? pq.label.slice(0, 40) + '…' : pq.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={skipOp} onValueChange={v => setSkipOp(v as SkipLogic['operator'])}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SKIP_OPERATORS.map(op => <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {valueNeeded && (
                      <Input value={skipVal} onChange={e => setSkipVal(e.target.value)} placeholder="Expected answer…" className="h-7 text-xs" />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Children slot */}
      {!collapsed && (
        <div className="p-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ── QuestionCard ─────────────────────────────────────────────────────────────
const SKIP_OPERATORS: { value: SkipLogic['operator']; label: string }[] = [
  { value: 'equals',       label: 'equals' },
  { value: 'not_equals',   label: 'does not equal' },
  { value: 'contains',     label: 'contains' },
  { value: 'greater_than', label: 'is greater than' },
  { value: 'less_than',    label: 'is less than' },
  { value: 'answered',     label: 'has any answer' },
  { value: 'not_answered', label: 'has no answer' },
];

function QuestionCard({
  q, idx, total, allQuestions, canManage, isEditing, onEdit, onUpdate, onDelete, onDuplicate, onMoveUp, onMoveDown, saving, deleting,
}: {
  q: Question; idx: number; total: number; allQuestions: Question[]; canManage: boolean;
  isEditing: boolean; onEdit: () => void;
  onUpdate: (p: Partial<Question>) => void;
  onDelete: () => void; onDuplicate: () => void; onMoveUp: () => void; onMoveDown: () => void;
  saving: boolean; deleting: boolean;
}) {
  const [labelDraft, setLabelDraft] = useState(q.label);
  const [descDraft, setDescDraft] = useState(q.description ?? '');
  const [reqDraft, setReqDraft] = useState(q.required);
  const [optsDraft, setOptsDraft] = useState<string[]>(q.options ?? []);
  const [newOpt, setNewOpt] = useState('');
  const [scaleMin, setScaleMin] = useState(Number(q.settings?.min ?? 1));
  const [scaleMax, setScaleMax] = useState(Number(q.settings?.max ?? 10));

  const existingSkip = q.settings?.skip_logic as SkipLogic | undefined;
  const [skipEnabled, setSkipEnabled] = useState(!!existingSkip?.condition_question_id);
  const [skipQId, setSkipQId] = useState(existingSkip?.condition_question_id ?? '');
  const [skipOp, setSkipOp] = useState<SkipLogic['operator']>(existingSkip?.operator ?? 'equals');
  const [skipVal, setSkipVal] = useState(existingSkip?.value ?? '');

  const QIcon = ALL_Q_TYPES.find(t => t.type === q.type)?.icon ?? FileText;
  const hasOptions = ['radio','checkbox','dropdown'].includes(q.type);
  const isSection = q.type === 'section_header';

  const prevQuestions = allQuestions.filter((pq, i) => pq.order_index < q.order_index && !['section_header','begin_group'].includes(pq.type));
  const valueNeeded = !['answered','not_answered'].includes(skipOp);

  const save = () => {
    const skipLogic: SkipLogic | undefined = skipEnabled && skipQId
      ? { condition_question_id: skipQId, operator: skipOp, value: valueNeeded ? skipVal : undefined }
      : undefined;
    const scaleSettings = q.type === 'scale' ? { min: scaleMin, max: scaleMax } : {};
    onUpdate({
      label: labelDraft.trim() || q.label,
      description: descDraft.trim() || null,
      required: reqDraft,
      options: hasOptions ? optsDraft.filter(Boolean) : null,
      settings: { ...q.settings, ...scaleSettings, skip_logic: skipLogic },
    });
    onEdit();
  };

  if (isSection) {
    return (
      <div className="flex items-center gap-2 py-2 px-4 bg-slate-50 rounded-xl border border-slate-200">
        <Minus className="w-4 h-4 text-slate-400 shrink-0" />
        {isEditing ? (
          <Input value={labelDraft} onChange={e => setLabelDraft(e.target.value)} className="h-7 text-sm font-semibold" />
        ) : (
          <p className="text-sm font-bold text-slate-600 uppercase tracking-wide flex-1">{q.label}</p>
        )}
        {canManage && (
          <div className="flex items-center gap-1 ml-auto">
            {isEditing
              ? <Button size="sm" onClick={save} className="h-6 px-2 text-xs">Save</Button>
              : <button onClick={onEdit} className="p-1 rounded hover:bg-slate-200 text-slate-400"><Edit3 className="w-3 h-3" /></button>
            }
            <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
          </div>
        )}
      </div>
    );
  }

  const hasSkip = !!(q.settings?.skip_logic as SkipLogic | undefined)?.condition_question_id;

  return (
    <div className={cn('bg-white rounded-xl border transition-colors', isEditing ? 'border-indigo-300' : 'border-slate-200')}>
      {/* Question header */}
      <div className="flex items-center gap-3 p-3">
        <span className="text-[11px] font-mono text-slate-400 w-5 text-center shrink-0">{idx + 1}</span>
        <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
          <QIcon className="w-3.5 h-3.5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{q.label}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[10px] text-slate-400 capitalize">{q.type.replace(/_/g, ' ')}{q.required ? ' · Required' : ''}</p>
            {hasSkip && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                <GitBranch className="w-2.5 h-2.5" />Conditional
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-0.5">
            <button onClick={onMoveUp} disabled={idx === 0} className="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-30" title="Move up"><ChevronUp className="w-3.5 h-3.5" /></button>
            <button onClick={onMoveDown} disabled={idx === total - 1} className="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-30" title="Move down"><ChevronDown className="w-3.5 h-3.5" /></button>
            <button onClick={onDuplicate} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600" title="Duplicate question"><Copy className="w-3.5 h-3.5" /></button>
            <button onClick={onEdit} className={cn('p-1 rounded text-slate-400', isEditing ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-100')} title="Edit"><Edit3 className="w-3.5 h-3.5" /></button>
            <button onClick={onDelete} disabled={deleting} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>

      {/* Edit panel */}
      {isEditing && (
        <div className="border-t border-indigo-100 p-4 space-y-4 bg-indigo-50/30">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Question text</Label>
              <Input value={labelDraft} onChange={e => setLabelDraft(e.target.value)} data-testid={`input-label-${q.id}`} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Helper text <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input value={descDraft} onChange={e => setDescDraft(e.target.value)} placeholder="Shown below the question…" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id={`req-${q.id}`} checked={reqDraft} onChange={e => setReqDraft(e.target.checked)} className="rounded" />
              <Label htmlFor={`req-${q.id}`} className="text-xs font-medium">Required</Label>
            </div>
          </div>

          {hasOptions && (
            <div className="space-y-1.5">
              <Label className="text-xs">Answer options</Label>
              {optsDraft.map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={opt}
                    onChange={e => { const next = [...optsDraft]; next[i] = e.target.value; setOptsDraft(next); }}
                    className="h-7 text-sm flex-1"
                  />
                  <button onClick={() => setOptsDraft(optsDraft.filter((_, j) => j !== i))} className="p-1 text-slate-400 hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <Input value={newOpt} onChange={e => setNewOpt(e.target.value)} placeholder="Add option…" className="h-7 text-sm flex-1"
                  onKeyDown={e => { if (e.key === 'Enter' && newOpt.trim()) { setOptsDraft([...optsDraft, newOpt.trim()]); setNewOpt(''); } }} />
                <button
                  onClick={() => { if (newOpt.trim()) { setOptsDraft([...optsDraft, newOpt.trim()]); setNewOpt(''); } }}
                  className="p-1 text-indigo-600 hover:bg-indigo-100 rounded"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {q.type === 'scale' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Scale range</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Min</Label>
                  <Input type="number" value={scaleMin} onChange={e => setScaleMin(Number(e.target.value))} className="h-7 text-sm" min={0} max={scaleMax - 1} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Max</Label>
                  <Input type="number" value={scaleMax} onChange={e => setScaleMax(Number(e.target.value))} className="h-7 text-sm" min={scaleMin + 1} max={20} />
                </div>
              </div>
            </div>
          )}

          <div className="border border-amber-200 rounded-xl p-3 space-y-3 bg-amber-50/40">
            <div className="flex items-center gap-2">
              <input type="checkbox" id={`skip-${q.id}`} checked={skipEnabled} onChange={e => setSkipEnabled(e.target.checked)} className="rounded" />
              <Label htmlFor={`skip-${q.id}`} className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                <GitBranch className="w-3 h-3" />Show this question only if…
              </Label>
            </div>

            {skipEnabled && (
              <div className="space-y-2 pl-5">
                {prevQuestions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No previous questions available for conditions.</p>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500">Question</Label>
                      <Select value={skipQId} onValueChange={setSkipQId}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Select a question…" />
                        </SelectTrigger>
                        <SelectContent>
                          {prevQuestions.map(pq => (
                            <SelectItem key={pq.id} value={pq.id} className="text-xs">
                              {pq.label.length > 40 ? pq.label.slice(0, 40) + '…' : pq.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500">Condition</Label>
                      <Select value={skipOp} onValueChange={v => setSkipOp(v as SkipLogic['operator'])}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SKIP_OPERATORS.map(op => (
                            <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {valueNeeded && (
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500">Value</Label>
                        <Input
                          value={skipVal}
                          onChange={e => setSkipVal(e.target.value)}
                          placeholder="Enter expected answer…"
                          className="h-7 text-xs"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={save} disabled={saving} data-testid={`btn-save-q-${q.id}`}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ResponseRow ───────────────────────────────────────────────────────────────
function ResponseRow({
  r, questions, isExpanded, onToggle,
}: {
  r: Response; questions: Question[]; isExpanded: boolean; onToggle: () => void;
}) {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const expand = async () => {
    onToggle();
    if (!loaded && !isExpanded) {
      setLoading(true);
      const { data } = await supabase.from('survey_answers').select('*').eq('response_id', r.id);
      setAnswers((data ?? []) as Answer[]);
      setLoaded(true);
      setLoading(false);
    }
  };

  const displayName = r.respondent_name ?? r.respondent_email ?? 'Anonymous';

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={expand}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
        data-testid={`btn-response-${r.id}`}
      >
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-indigo-700">{displayName.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800">{displayName}</p>
          <p className="text-[11px] text-slate-400">{format(new Date(r.submitted_at), 'dd MMM yyyy, HH:mm')}</p>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform shrink-0', isExpanded && 'rotate-180')} />
      </button>
      {isExpanded && (
        <div className="border-t border-slate-100 p-4 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Loading answers…</div>
          ) : (
            questions.filter(q => !['section_header','begin_group'].includes(q.type)).map(q => {
              const ans = answers.find(a => a.question_id === q.id);
              let displayValue: React.ReactNode = <span className="text-slate-300 italic">No answer</span>;
              if (ans) {
                if (q.type === 'image' && ans.answer_json) {
                  displayValue = <img src={String(ans.answer_json)} className="max-h-32 rounded-lg border border-slate-200" alt="Response" />;
                } else if (q.type === 'file' && ans.answer_json) {
                  const meta = (() => { try { return JSON.parse(String(ans.answer_json)); } catch { return null; } })();
                  displayValue = meta ? `${meta.name} (${(meta.size / 1024).toFixed(1)} KB)` : String(ans.answer_json);
                } else if (q.type === 'gps' && ans.answer_text) {
                  const parts = ans.answer_text.split(',');
                  displayValue = parts.length >= 2 ? `Lat: ${parts[0]}, Lng: ${parts[1]}${parts[2] ? `, ±${parts[2]}m` : ''}` : ans.answer_text;
                } else {
                  const value = ans.answer_text ?? (Array.isArray(ans.answer_json) ? (ans.answer_json as string[]).join(', ') : ans.answer_json != null ? String(ans.answer_json) : null);
                  if (value) displayValue = value;
                }
              }
              return (
                <div key={q.id}>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{q.label}{q.required ? ' *' : ''}</p>
                  <p className="text-sm text-slate-700 mt-0.5">{displayValue}</p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
