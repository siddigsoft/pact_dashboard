import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MessageSquare, Plus, Loader2, Trash2, Send, CheckCircle2,
  ChevronDown, ChevronUp, Edit2, ThumbsUp, Minus, LayoutTemplate, Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isWithinInterval, parseISO } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts';
import { exportToExcel } from '@/utils/report-export';

type QuestionType = 'rating' | 'nps' | 'text' | 'yes_no';
type TargetAudience = 'all' | 'hub' | 'department';

interface Question { id: string; text: string; type: QuestionType; required: boolean; }
interface PulseSurvey {
  id: string; title: string; description: string | null;
  questions: Question[]; target_audience: TargetAudience;
  target_hub_id: string | null; target_department_id: string | null;
  starts_at: string; ends_at: string; is_active: boolean;
  enable_reminders: boolean; reminder_days: number[];
  created_by: string | null; created_at: string;
}
interface PulseResponse {
  id: string; survey_id: string; responses: Record<string, any>;
  hub_id: string | null; department_id: string | null; submitted_at: string;
}
interface Hub { id: string; name: string; }
interface Dept { id: string; name: string; }

const Q_TYPE_LABELS: Record<QuestionType, string> = {
  rating: 'Rating (1–5)', nps: 'NPS (0–10)', text: 'Open Text', yes_no: 'Yes / No',
};
const COLORS = ['#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b', '#ef4444', '#22c55e'];
const STORAGE_KEY      = 'pact_pulse_submitted_v2';
const TOKEN_PREFIX_KEY = 'pact_pulse_token_';

// ── Persistent submission tracking (survives page reloads) ──────────────────
function getPersistedSubmitted(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')); }
  catch { return new Set(); }
}
function persistSubmitted(surveyId: string) {
  const s = getPersistedSubmitted(); s.add(surveyId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
}

// ── Anonymous dedup token — random UUID, NOT derived from user identity ──────
// Stored per-survey in localStorage so the same browser cannot submit twice.
// The token is never linked to any user attribute — it is cryptographically
// random and unknowable to any admin without access to the respondent's browser.
function getOrCreateRespondentToken(surveyId: string): string {
  const key = TOKEN_PREFIX_KEY + surveyId;
  let token = localStorage.getItem(key);
  if (!token) {
    token = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, token);
  }
  return token;
}

// ── Survey templates ────────────────────────────────────────────────────────
const SURVEY_TEMPLATES = [
  {
    id: 'enps',
    label: 'eNPS Standard',
    description: 'Employee Net Promoter Score — the gold-standard engagement question.',
    questions: [
      { id: 'q1', text: 'How likely are you to recommend this organization as a great place to work?', type: 'nps' as QuestionType, required: true },
      { id: 'q2', text: 'What is the main reason for your score?', type: 'text' as QuestionType, required: false },
    ],
  },
  {
    id: 'wellbeing',
    label: 'Wellbeing Check',
    description: 'Short check-in on staff mental health and workload.',
    questions: [
      { id: 'q1', text: 'How would you rate your overall wellbeing this week?', type: 'rating' as QuestionType, required: true },
      { id: 'q2', text: 'Are you feeling supported by your manager?', type: 'yes_no' as QuestionType, required: true },
      { id: 'q3', text: 'Is your workload manageable?', type: 'yes_no' as QuestionType, required: true },
      { id: 'q4', text: 'Any additional comments or concerns?', type: 'text' as QuestionType, required: false },
    ],
  },
  {
    id: 'manager',
    label: 'Manager Effectiveness',
    description: 'Confidential feedback on direct manager.',
    questions: [
      { id: 'q1', text: 'My manager gives me clear direction and priorities.', type: 'rating' as QuestionType, required: true },
      { id: 'q2', text: 'My manager supports my professional development.', type: 'rating' as QuestionType, required: true },
      { id: 'q3', text: 'My manager recognizes and acknowledges my contributions.', type: 'rating' as QuestionType, required: true },
      { id: 'q4', text: 'How would you recommend your manager improve?', type: 'text' as QuestionType, required: false },
    ],
  },
  {
    id: 'field_ops',
    label: 'Field Operations Pulse',
    description: 'Monthly field staff check-in on safety, support, and mission clarity.',
    questions: [
      { id: 'q1', text: 'I feel safe in my current field assignment.', type: 'yes_no' as QuestionType, required: true },
      { id: 'q2', text: 'I have the resources and equipment I need to do my job.', type: 'rating' as QuestionType, required: true },
      { id: 'q3', text: 'I understand the goals and priorities of my current mission.', type: 'rating' as QuestionType, required: true },
      { id: 'q4', text: 'Any urgent concerns or suggestions for the field support team?', type: 'text' as QuestionType, required: false },
    ],
  },
];

function genId() { return Math.random().toString(36).slice(2, 9); }

function isSurveyOpen(s: PulseSurvey): boolean {
  if (!s.is_active) return false;
  try {
    return isWithinInterval(new Date(), { start: parseISO(s.starts_at), end: parseISO(s.ends_at) });
  } catch { return false; }
}

export default function PulseSurveys() {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = hasAnyRole(['super_admin', 'superAdmin', 'SuperAdmin', 'admin', 'Admin', 'hr', 'hr_manager']);

  const userHubId       = (currentUser as any)?.hubId ?? (currentUser as any)?.hub_id ?? null;
  const userDeptId      = (currentUser as any)?.departmentId ?? (currentUser as any)?.department_id ?? null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<PulseSurvey | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', starts_at: '', ends_at: '',
    target_audience: 'all' as TargetAudience,
    target_hub_id: '', target_department_id: '',
    is_active: true, enable_reminders: true,
    reminder_days_str: '3,7',
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saving, setSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const [takingSurvey, setTakingSurvey] = useState<PulseSurvey | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  // Persistent dedup: initialized from localStorage, updated on submit
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(() => getPersistedSubmitted());

  const [expandedResults, setExpandedResults] = useState<string | null>(null);

  // Sync submittedIds with localStorage on mount
  useEffect(() => {
    setSubmittedIds(getPersistedSubmitted());
  }, []);

  const { data: surveys = [], isLoading: loadSurveys } = useQuery({
    queryKey: ['hr-pulse-surveys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_pulse_surveys' as any).select('*').order('created_at', { ascending: false });
      if (error?.code === '42P01') return [];
      return (data ?? []) as unknown as PulseSurvey[];
    },
    staleTime: 30_000,
  });

  const { data: responses = [], isLoading: loadResponses } = useQuery({
    queryKey: ['hr-pulse-responses'],
    queryFn: async () => {
      if (!isAdmin) return [];
      const { data, error } = await supabase.from('hr_pulse_responses' as any).select('*');
      if (error?.code === '42P01') return [];
      return (data ?? []) as unknown as PulseResponse[];
    },
    staleTime: 30_000,
    enabled: isAdmin,
  });

  const { data: hubs = [] } = useQuery({
    queryKey: ['hubs-list'],
    queryFn: async () => {
      const { data } = await supabase.from('hubs').select('id, name').order('name');
      return (data ?? []) as Hub[];
    },
    staleTime: 300_000,
  });

  const { data: depts = [] } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id, name').order('name');
      return (data ?? []) as Dept[];
    },
    staleTime: 300_000,
  });

  const hubMap  = useMemo(() => Object.fromEntries(hubs.map(h  => [h.id,  h.name])),  [hubs]);
  const deptMap = useMemo(() => Object.fromEntries(depts.map(d => [d.id, d.name])), [depts]);

  const responsesBySurvey = useMemo(() => {
    const m: Record<string, PulseResponse[]> = {};
    responses.forEach(r => { if (!m[r.survey_id]) m[r.survey_id] = []; m[r.survey_id].push(r); });
    return m;
  }, [responses]);

  // ── AUDIENCE-SCOPED open surveys for employees ────────────────────────────
  // 'all'        → visible to every authenticated staff member
  // 'hub'        → only staff whose hub matches target_hub_id
  // 'department' → only staff whose department matches target_department_id
  const openSurveys = useMemo(() => {
    return surveys.filter(s => {
      if (!isSurveyOpen(s)) return false;
      const audience = s.target_audience ?? (s.target_hub_id ? 'hub' : 'all');
      if (audience === 'hub') {
        return s.target_hub_id && s.target_hub_id === userHubId;
      }
      if (audience === 'department') {
        return s.target_department_id && s.target_department_id === userDeptId;
      }
      return true; // 'all'
    });
  }, [surveys, userHubId, userDeptId]);

  // ── Survey CRUD ─────────────────────────────────────────────────────────────
  const blankForm = () => ({
    title: '', description: '', starts_at: '', ends_at: '',
    target_audience: 'all' as TargetAudience,
    target_hub_id: '', target_department_id: '',
    is_active: true, enable_reminders: true,
    reminder_days_str: '3,7',
  });

  function openNew() {
    setEditingSurvey(null);
    setForm(blankForm());
    setQuestions([{ id: genId(), text: '', type: 'rating', required: true }]);
    setShowTemplates(false);
    setDialogOpen(true);
  }
  function openEdit(s: PulseSurvey) {
    setEditingSurvey(s);
    setForm({
      title: s.title,
      description: s.description ?? '',
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      target_audience: s.target_audience ?? (s.target_hub_id ? 'hub' : 'all'),
      target_hub_id: s.target_hub_id ?? '',
      target_department_id: s.target_department_id ?? '',
      is_active: s.is_active,
      enable_reminders: s.enable_reminders ?? false,
      reminder_days_str: (s.reminder_days ?? [3,7]).join(','),
    });
    setQuestions(s.questions ?? []);
    setShowTemplates(false);
    setDialogOpen(true);
  }
  function applyTemplate(tpl: typeof SURVEY_TEMPLATES[0]) {
    setForm(f => ({ ...f, title: f.title || tpl.label, description: f.description || tpl.description }));
    setQuestions(tpl.questions.map(q => ({ ...q, id: genId() })));
    setShowTemplates(false);
  }

  async function saveSurvey() {
    if (!form.title.trim() || !form.starts_at || !form.ends_at) {
      toast({ title: 'Title, start and end dates are required', variant: 'destructive' }); return;
    }
    if (questions.length === 0) {
      toast({ title: 'Add at least one question', variant: 'destructive' }); return;
    }
    if (questions.some(q => !q.text.trim())) {
      toast({ title: 'All questions need text', variant: 'destructive' }); return;
    }
    if (form.target_audience === 'hub' && !form.target_hub_id) {
      toast({ title: 'Select a hub for hub-targeted surveys', variant: 'destructive' }); return;
    }
    if (form.target_audience === 'department' && !form.target_department_id) {
      toast({ title: 'Select a department for department-targeted surveys', variant: 'destructive' }); return;
    }

    const reminderDays = form.reminder_days_str
      .split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n) && n > 0);

    setSaving(true);
    const payload: any = {
      title: form.title.trim(),
      description: form.description || null,
      starts_at: form.starts_at,
      ends_at: form.ends_at,
      target_audience: form.target_audience,
      target_hub_id: form.target_audience === 'hub' ? (form.target_hub_id || null) : null,
      target_department_id: form.target_audience === 'department' ? (form.target_department_id || null) : null,
      is_active: form.is_active,
      enable_reminders: form.enable_reminders,
      reminder_days: reminderDays.length ? reminderDays : [3, 7],
      questions,
    };
    const { error } = editingSurvey
      ? await supabase.from('hr_pulse_surveys' as any).update(payload).eq('id', editingSurvey.id)
      : await supabase.from('hr_pulse_surveys' as any).insert({ ...payload, created_by: currentUser?.id ?? null });
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editingSurvey ? 'Survey updated' : 'Survey created' });
    setDialogOpen(false);
    qc.invalidateQueries({ queryKey: ['hr-pulse-surveys'] });
  }

  async function deleteSurvey(s: PulseSurvey) {
    if (!confirm(`Delete survey "${s.title}"? All responses will also be deleted.`)) return;
    await supabase.from('hr_pulse_surveys' as any).delete().eq('id', s.id);
    toast({ title: 'Survey deleted' });
    qc.invalidateQueries({ queryKey: ['hr-pulse-surveys'] });
    qc.invalidateQueries({ queryKey: ['hr-pulse-responses'] });
  }

  // ── Question builder ────────────────────────────────────────────────────────
  function addQuestion() { setQuestions(qs => [...qs, { id: genId(), text: '', type: 'rating', required: true }]); }
  function removeQuestion(id: string) { setQuestions(qs => qs.filter(q => q.id !== id)); }
  function updateQuestion(id: string, patch: Partial<Question>) { setQuestions(qs => qs.map(q => q.id === id ? { ...q, ...patch } : q)); }
  function moveQuestion(idx: number, dir: -1 | 1) {
    setQuestions(qs => {
      const next = [...qs];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return qs;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  // ── Take Survey ─────────────────────────────────────────────────────────────
  function openSurveyForTaking(s: PulseSurvey) { setTakingSurvey(s); setAnswers({}); }

  async function submitSurvey() {
    if (!takingSurvey) return;
    const required = takingSurvey.questions.filter(q => q.required);
    for (const q of required) {
      if (answers[q.id] === undefined || answers[q.id] === '') {
        toast({ title: `Please answer: "${q.text}"`, variant: 'destructive' }); return;
      }
    }

    // Anonymous dedup token — random UUID from localStorage, NOT derived from user identity.
    // Cannot be used by anyone (including admins) to link the response back to the respondent.
    const respondentToken = getOrCreateRespondentToken(takingSurvey.id);

    setSubmitting(true);
    const { error } = await supabase.from('hr_pulse_responses' as any).insert({
      survey_id: takingSurvey.id,
      responses: answers,
      hub_id: userHubId,         // coarse grouping only — no user_id for anonymity
      department_id: userDeptId, // coarse grouping only — snapshot at submission time
      respondent_hash: respondentToken,
    });
    setSubmitting(false);

    if (error) {
      if (error.code === '23505') {
        // unique constraint violation — already submitted
        toast({ title: 'Already submitted', description: 'You have already responded to this survey.' });
        persistSubmitted(takingSurvey.id);
        setSubmittedIds(getPersistedSubmitted());
        setTakingSurvey(null);
        return;
      }
      toast({ title: 'Error submitting', description: error.message, variant: 'destructive' }); return;
    }

    toast({ title: 'Thank you!', description: 'Your anonymous response has been recorded.' });
    persistSubmitted(takingSurvey.id);
    setSubmittedIds(getPersistedSubmitted());
    setTakingSurvey(null);
    qc.invalidateQueries({ queryKey: ['hr-pulse-responses'] });
  }

  // ── Analytics helpers ───────────────────────────────────────────────────────
  function getQuestionAnalytics(survey: PulseSurvey, rs: PulseResponse[]) {
    return survey.questions.map(q => {
      const vals = rs.map(r => r.responses[q.id]).filter(v => v !== undefined && v !== null && v !== '');
      if (q.type === 'rating' || q.type === 'nps') {
        const nums = vals.map(Number).filter(n => !isNaN(n));
        const avg = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
        let nps: number | null = null;
        if (q.type === 'nps' && nums.length >= 3) {
          const promoters  = nums.filter(n => n >= 9).length;
          const detractors = nums.filter(n => n <= 6).length;
          nps = Math.round(((promoters - detractors) / nums.length) * 100);
        }
        const maxScale = q.type === 'nps' ? 11 : 5;
        const startVal = q.type === 'nps' ? 0 : 1;
        const dist = Array.from({ length: maxScale }, (_, i) => i + startVal).map(score => ({
          score: String(score), count: nums.filter(n => n === score).length,
        }));
        return { q, avg, nps, dist, responses: vals.length, textValues: [] as string[], topWords: [] as [string, number][] };
      }
      if (q.type === 'yes_no') {
        const yes = vals.filter(v => v === 'yes').length;
        const no  = vals.filter(v => v === 'no').length;
        return { q, avg: null, nps: null, dist: [{ score: 'Yes', count: yes }, { score: 'No', count: no }], responses: vals.length, textValues: [] as string[], topWords: [] as [string, number][] };
      }
      // text — word-frequency map
      const textVals = vals as string[];
      const stopWords = new Set(['the','a','an','is','are','was','were','it','i','to','of','and','in','for','that','this','my','me','we','our','be','not','but','on','at','with','have','has','by','do','or','so','if','as','its']);
      const wordFreq: Record<string, number> = {};
      textVals.forEach(text => {
        text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(word => {
          if (word.length >= 3 && !stopWords.has(word)) wordFreq[word] = (wordFreq[word] ?? 0) + 1;
        });
      });
      const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 20) as [string, number][];
      return { q, avg: null, nps: null, dist: [], responses: vals.length, textValues: textVals, topWords };
    });
  }

  // Group responses by hub for geographic breakdown
  function getHubBreakdown(rs: PulseResponse[]) {
    const counts: Record<string, number> = {};
    rs.forEach(r => {
      const label = r.hub_id ? (hubMap[r.hub_id] ?? 'Unknown Hub') : 'No Hub';
      counts[label] = (counts[label] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }

  // Group responses by department for department-level breakdown
  function getDeptBreakdown(rs: PulseResponse[]) {
    const counts: Record<string, number> = {};
    rs.forEach(r => {
      const label = r.department_id ? (deptMap[r.department_id] ?? 'Unknown Dept') : 'No Department';
      counts[label] = (counts[label] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }

  function audienceLabel(s: PulseSurvey): string {
    const audience = s.target_audience ?? (s.target_hub_id ? 'hub' : 'all');
    if (audience === 'hub' && s.target_hub_id) return `${hubMap[s.target_hub_id] ?? 'Hub'} only`;
    if (audience === 'department' && s.target_department_id) return `${deptMap[s.target_department_id] ?? 'Dept'} dept only`;
    return 'All staff';
  }

  function exportResults(s: PulseSurvey) {
    const rs = responsesBySurvey[s.id] ?? [];
    const rows = rs.map((r, i) => {
      const row: Record<string, any> = { '#': i + 1, 'Submitted At': format(new Date(r.submitted_at), 'yyyy-MM-dd HH:mm'), 'Hub': r.hub_id ? (hubMap[r.hub_id] ?? r.hub_id) : '' };
      s.questions.forEach(q => { row[q.text] = r.responses[q.id] ?? ''; });
      return row;
    });
    exportToExcel(rows, s.title, `PulseSurvey_${s.title.slice(0, 20)}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  }

  if (loadSurveys) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-5xl mx-auto" data-testid="page-pulse-surveys">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4" />Engagement Pulse Surveys</h2>
          <p className="text-sm text-muted-foreground">Anonymous staff pulse checks. Responses are never linked to individuals.</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openNew} data-testid="button-new-survey">
            <Plus className="h-4 w-4 mr-1" />New Survey
          </Button>
        )}
      </div>

      {isAdmin ? (
        <Tabs defaultValue="surveys">
          <TabsList>
            <TabsTrigger value="surveys">All Surveys ({surveys.length})</TabsTrigger>
            <TabsTrigger value="results">Results & Analytics</TabsTrigger>
          </TabsList>

          {/* ── Admin: survey list ── */}
          <TabsContent value="surveys" className="space-y-3 pt-3">
            {surveys.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
                No surveys created yet. Click "New Survey" to get started.
              </CardContent></Card>
            ) : surveys.map(s => {
              const open  = isSurveyOpen(s);
              const count = (responsesBySurvey[s.id] ?? []).length;
              return (
                <Card key={s.id} data-testid={`card-survey-${s.id}`}>
                  <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{s.title}</p>
                        {open
                          ? <Badge className="text-[10px] bg-emerald-600">Open Now</Badge>
                          : !s.is_active
                          ? <Badge variant="outline" className="text-[10px] text-gray-500">Inactive</Badge>
                          : <Badge variant="outline" className="text-[10px]">Scheduled</Badge>}
                        <Badge variant="outline" className="text-[10px]">{audienceLabel(s)}</Badge>
                        {s.enable_reminders && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300"><Bell className="h-2.5 w-2.5 mr-0.5 inline" />{(s.reminder_days ?? [3,7]).join('/')}d reminders</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(parseISO(s.starts_at), 'PP')} – {format(parseISO(s.ends_at), 'PP')}
                        {' · '}{s.questions.length} question{s.questions.length !== 1 ? 's' : ''}
                        {' · '}<strong>{count}</strong> response{count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => exportResults(s)} data-testid={`button-export-${s.id}`}>Export</Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteSurvey(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* ── Admin: results & analytics ── */}
          <TabsContent value="results" className="space-y-4 pt-3">
            {loadResponses ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin opacity-30" /></div>
            ) : surveys.filter(s => (responsesBySurvey[s.id] ?? []).length > 0).length === 0 ? (
              <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No responses yet.</CardContent></Card>
            ) : surveys.filter(s => (responsesBySurvey[s.id] ?? []).length > 0).map(s => {
              const rs           = responsesBySurvey[s.id] ?? [];
              const analytics    = getQuestionAnalytics(s, rs);
              const hubBreakdown = getHubBreakdown(rs);
              const deptBreakdown = getDeptBreakdown(rs);
              const npsQ         = analytics.find(a => a.q.type === 'nps');
              const isExpanded = expandedResults === s.id;

              return (
                <Card key={s.id}>
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">{s.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {rs.length} responses · {format(parseISO(s.starts_at), 'PP')} – {format(parseISO(s.ends_at), 'PP')}
                          {' · '}{audienceLabel(s)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {npsQ?.nps != null && (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">eNPS</p>
                            <p className={cn('text-lg font-bold', npsQ.nps >= 50 ? 'text-emerald-600' : npsQ.nps >= 0 ? 'text-amber-600' : 'text-red-600')}>
                              {npsQ.nps > 0 ? '+' : ''}{npsQ.nps}
                            </p>
                          </div>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setExpandedResults(isExpanded ? null : s.id)}>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="space-y-5 pt-0">
                      {/* Department breakdown (primary requirement) */}
                      {deptBreakdown.length > 1 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Responses by Department</p>
                          <ResponsiveContainer width="100%" height={Math.max(80, deptBreakdown.length * 28)}>
                            <BarChart data={deptBreakdown} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                              <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                              <Tooltip contentStyle={{ fontSize: 12 }} />
                              <Bar dataKey="count" name="Responses" radius={[0, 3, 3, 0]}>
                                {deptBreakdown.map((_, ci) => <Cell key={ci} fill={COLORS[ci % COLORS.length]} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      {/* Hub geographic breakdown */}
                      {hubBreakdown.length > 1 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Responses by Hub</p>
                          <ResponsiveContainer width="100%" height={Math.max(80, hubBreakdown.length * 28)}>
                            <BarChart data={hubBreakdown} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                              <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                              <Tooltip contentStyle={{ fontSize: 12 }} />
                              <Bar dataKey="count" name="Responses" radius={[0, 3, 3, 0]}>
                                {hubBreakdown.map((_, ci) => <Cell key={ci} fill={COLORS[ci % COLORS.length]} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* Per-question analytics */}
                      {analytics.map((a, i) => (
                        <div key={a.q.id} className="border-t pt-4 first:border-t-0 first:pt-0">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                            Q{i + 1}: {a.q.text}
                            <span className="ml-2 normal-case font-normal">({a.responses} response{a.responses !== 1 ? 's' : ''})</span>
                          </p>
                          {(a.q.type === 'rating' || a.q.type === 'nps' || a.q.type === 'yes_no') && a.dist.length > 0 && (
                            <div>
                              {a.avg != null && (
                                <p className="text-sm mb-2">
                                  Avg: <strong>{a.avg.toFixed(2)}</strong>
                                  {a.q.type === 'rating' && <span className="text-muted-foreground"> / 5</span>}
                                  {a.q.type === 'nps' && <span className="text-muted-foreground"> / 10</span>}
                                  {a.nps != null && (
                                    <span className={cn('ml-3 font-bold', a.nps >= 50 ? 'text-emerald-600' : a.nps >= 0 ? 'text-amber-600' : 'text-red-600')}>
                                      eNPS: {a.nps > 0 ? '+' : ''}{a.nps}
                                    </span>
                                  )}
                                </p>
                              )}
                              <ResponsiveContainer width="100%" height={130}>
                                <BarChart data={a.dist} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                  <XAxis dataKey="score" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} allowDecimals={false} />
                                  <Tooltip contentStyle={{ fontSize: 12 }} />
                                  <Bar dataKey="count" name="Responses" radius={[3, 3, 0, 0]}>
                                    {a.dist.map((_, ci) => <Cell key={ci} fill={COLORS[ci % COLORS.length]} />)}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                          {a.q.type === 'text' && (
                            <div className="space-y-3">
                              {a.topWords.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1.5">Top keywords:</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {a.topWords.map(([word, freq], wi) => {
                                      const max   = a.topWords[0][1];
                                      const scale = 0.75 + (freq / max) * 0.75;
                                      return (
                                        <span key={wi} className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-0.5"
                                          style={{ fontSize: `${Math.round(10 * scale)}px`, fontWeight: freq === max ? 700 : 500 }}>
                                          {word}
                                          {freq > 1 && <span className="ml-1 opacity-60 text-[9px]">×{freq}</span>}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {a.textValues.length === 0 && <p className="text-xs text-muted-foreground">No text responses.</p>}
                                {a.textValues.map((v, vi) => (
                                  <p key={vi} className="text-sm bg-muted/40 rounded px-3 py-1.5 italic">"{v}"</p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      ) : (
        /* ── Employee: take audience-scoped open surveys ── */
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">All responses are fully anonymous — your identity is never stored with your answers.</p>
          {openSurveys.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              No active pulse surveys for your team right now. Check back later.
            </CardContent></Card>
          ) : openSurveys.map(s => {
            const done = submittedIds.has(s.id);
            return (
              <Card key={s.id} data-testid={`card-survey-${s.id}`}>
                <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Closes {format(parseISO(s.ends_at), 'PP')} · {s.questions.length} question{s.questions.length !== 1 ? 's' : ''}
                    </p>
                    {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                  </div>
                  {done ? (
                    <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />Submitted</span>
                  ) : (
                    <Button size="sm" onClick={() => openSurveyForTaking(s)} data-testid={`button-take-${s.id}`}>
                      <Send className="h-3.5 w-3.5 mr-1" />Take Survey
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSurvey ? 'Edit Survey' : 'New Pulse Survey'}</DialogTitle>
            <DialogDescription>Responses are anonymous — no user ID is stored with responses.</DialogDescription>
          </DialogHeader>

          {/* Template picker */}
          {!editingSurvey && (
            <div className="border rounded-lg overflow-hidden">
              <button type="button" onClick={() => setShowTemplates(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-muted/40 hover:bg-muted/70 transition-colors">
                <LayoutTemplate className="h-4 w-4 text-blue-500" />
                <span className="font-medium">Start from a template</span>
                {showTemplates ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
              </button>
              {showTemplates && (
                <div className="divide-y">
                  {SURVEY_TEMPLATES.map(tpl => (
                    <button key={tpl.id} type="button" onClick={() => applyTemplate(tpl)}
                      className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors" data-testid={`template-${tpl.id}`}>
                      <div>
                        <p className="text-sm font-medium">{tpl.label}</p>
                        <p className="text-xs text-muted-foreground">{tpl.description} · {tpl.questions.length} questions</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} data-testid="input-survey-title" /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date *</Label><Input type="date" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} /></div>
              <div><Label>End Date *</Label><Input type="date" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} /></div>
            </div>

            {/* Audience targeting */}
            <div className="border rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Audience Targeting</p>
              <div>
                <Label>Target</Label>
                <Select value={form.target_audience} onValueChange={v => setForm(f => ({ ...f, target_audience: v as TargetAudience, target_hub_id: '', target_department_id: '' }))}>
                  <SelectTrigger data-testid="select-target-audience"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                    <SelectItem value="hub">Specific Hub</SelectItem>
                    <SelectItem value="department">Specific Department</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.target_audience === 'hub' && (
                <div>
                  <Label>Hub</Label>
                  <Select value={form.target_hub_id} onValueChange={v => setForm(f => ({ ...f, target_hub_id: v }))}>
                    <SelectTrigger data-testid="select-target-hub"><SelectValue placeholder="Choose hub…" /></SelectTrigger>
                    <SelectContent>
                      {hubs.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.target_audience === 'department' && (
                <div>
                  <Label>Department</Label>
                  <Select value={form.target_department_id} onValueChange={v => setForm(f => ({ ...f, target_department_id: v }))}>
                    <SelectTrigger data-testid="select-target-dept"><SelectValue placeholder="Choose department…" /></SelectTrigger>
                    <SelectContent>
                      {depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Reminders */}
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Closing Reminders</p>
                <Switch checked={form.enable_reminders} onCheckedChange={v => setForm(f => ({ ...f, enable_reminders: v }))} id="enable-reminders" />
              </div>
              {form.enable_reminders && (
                <div>
                  <Label>Remind N days before close</Label>
                  <Input
                    value={form.reminder_days_str}
                    onChange={e => setForm(f => ({ ...f, reminder_days_str: e.target.value }))}
                    placeholder="e.g. 3,7"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Comma-separated list of days before end date. The <strong>pulse-survey-reminders</strong> edge function must be scheduled daily to dispatch these.</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} id="survey-active" />
              <Label htmlFor="survey-active">Active</Label>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-semibold">Questions</Label>
                <Button size="sm" variant="outline" type="button" onClick={addQuestion} data-testid="button-add-question">
                  <Plus className="h-3.5 w-3.5 mr-1" />Add Question
                </Button>
              </div>
              <div className="space-y-3">
                {questions.map((q, i) => (
                  <div key={q.id} className="border rounded-lg p-3 space-y-2" data-testid={`question-${q.id}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">Q{i + 1}</span>
                      <Input className="flex-1" placeholder="Question text…" value={q.text} onChange={e => updateQuestion(q.id, { text: e.target.value })} />
                      <button type="button" onClick={() => moveQuestion(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                      <button type="button" onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                      <button type="button" onClick={() => removeQuestion(q.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="flex items-center gap-3 pl-7">
                      <Select value={q.type} onValueChange={v => updateQuestion(q.id, { type: v as QuestionType })}>
                        <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(Q_TYPE_LABELS) as QuestionType[]).map(k => <SelectItem key={k} value={k}>{Q_TYPE_LABELS[k]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={q.required} onChange={e => updateQuestion(q.id, { required: e.target.checked })} />
                        Required
                      </label>
                    </div>
                  </div>
                ))}
                {questions.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Add at least one question or pick a template above.</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveSurvey} disabled={saving} data-testid="button-save-survey">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save Survey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Take Survey Dialog ── */}
      <Dialog open={!!takingSurvey} onOpenChange={v => !v && setTakingSurvey(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{takingSurvey?.title}</DialogTitle>
            <DialogDescription className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />Your response is fully anonymous. Only one response per survey is accepted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {takingSurvey?.questions.map((q, i) => (
              <div key={q.id} className="space-y-2" data-testid={`take-q-${q.id}`}>
                <Label className="text-sm font-medium">
                  {i + 1}. {q.text}
                  {q.required && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
                {q.type === 'rating' && (
                  <div className="flex gap-2">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} type="button" onClick={() => setAnswers(a => ({ ...a, [q.id]: n }))}
                        className={cn('h-9 w-9 rounded-full border-2 text-sm font-bold transition-colors',
                          answers[q.id] === n ? 'bg-primary border-primary text-primary-foreground' : 'border-border hover:border-primary/50')}>
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'nps' && (
                  <div>
                    <div className="flex gap-1 flex-wrap">
                      {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                        <button key={n} type="button" onClick={() => setAnswers(a => ({ ...a, [q.id]: n }))}
                          className={cn('h-8 w-8 rounded border text-xs font-bold transition-colors',
                            answers[q.id] === n ? 'bg-primary border-primary text-primary-foreground' : 'border-border hover:border-primary/50',
                            n <= 6 && answers[q.id] !== n && 'text-red-600',
                            n >= 9 && answers[q.id] !== n && 'text-emerald-600')}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Not likely</span><span>Very likely</span>
                    </div>
                  </div>
                )}
                {q.type === 'text' && (
                  <Textarea rows={3} placeholder="Your response…"
                    value={answers[q.id] ?? ''}
                    onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
                )}
                {q.type === 'yes_no' && (
                  <div className="flex gap-3">
                    <Button type="button" size="sm" variant={answers[q.id] === 'yes' ? 'default' : 'outline'}
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: 'yes' }))}
                      className={cn(answers[q.id] === 'yes' && 'bg-emerald-600 hover:bg-emerald-700')}>
                      <ThumbsUp className="h-3.5 w-3.5 mr-1" />Yes
                    </Button>
                    <Button type="button" size="sm" variant={answers[q.id] === 'no' ? 'default' : 'outline'}
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: 'no' }))}
                      className={cn(answers[q.id] === 'no' && 'bg-red-600 hover:bg-red-700')}>
                      <Minus className="h-3.5 w-3.5 mr-1" />No
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTakingSurvey(null)}>Cancel</Button>
            <Button onClick={submitSurvey} disabled={submitting} data-testid="button-submit-survey">
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <Send className="h-3.5 w-3.5 mr-1" />Submit Anonymously
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
