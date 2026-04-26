import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, CheckCircle2, ClipboardList, Star, ChevronLeft, ChevronRight,
  AlertCircle, MapPin, Image as ImageIcon, Paperclip, ScanLine, Phone, Mail,
  Hash, Clock, CalendarClock, GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type QuestionType =
  | 'text' | 'textarea' | 'radio' | 'checkbox'
  | 'rating' | 'scale' | 'date' | 'dropdown' | 'section_header'
  | 'number' | 'integer' | 'phone' | 'email' | 'time' | 'datetime'
  | 'gps' | 'image' | 'file' | 'barcode';

interface SkipLogic {
  condition_question_id: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'answered' | 'not_answered' | 'greater_than' | 'less_than';
  value?: string;
}

interface Survey {
  id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'active' | 'closed';
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
}

type AnswerValue = string | string[] | number | null;

// ── Skip logic evaluation ─────────────────────────────────────────────────────
function isVisible(q: Question, answers: Record<string, AnswerValue>): boolean {
  const sl = q.settings?.skip_logic as SkipLogic | undefined;
  if (!sl?.condition_question_id) return true;
  const trigger = answers[sl.condition_question_id];
  const triggerStr = Array.isArray(trigger) ? trigger.join(',') : String(trigger ?? '');
  switch (sl.operator) {
    case 'answered':
      return trigger !== null && trigger !== undefined && trigger !== '' && !(Array.isArray(trigger) && trigger.length === 0);
    case 'not_answered':
      return trigger === null || trigger === undefined || trigger === '' || (Array.isArray(trigger) && trigger.length === 0);
    case 'equals':
      return triggerStr === (sl.value ?? '');
    case 'not_equals':
      return triggerStr !== (sl.value ?? '');
    case 'contains':
      return triggerStr.toLowerCase().includes((sl.value ?? '').toLowerCase());
    case 'greater_than':
      return Number(trigger) > Number(sl.value ?? 0);
    case 'less_than':
      return Number(trigger) < Number(sl.value ?? 0);
    default:
      return true;
  }
}

// ── Helper components ─────────────────────────────────────────────────────────
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="transition-transform hover:scale-110"
          data-testid={`star-${n}`}
        >
          <Star className={cn('w-8 h-8 transition-colors', n <= (hover || value) ? 'fill-amber-400 text-amber-400' : 'text-slate-200')} />
        </button>
      ))}
      {value > 0 && <span className="ml-2 text-sm font-medium text-slate-600">{value} / 5</span>}
    </div>
  );
}

function ScaleSelector({ value, onChange, min = 1, max = 10 }: { value: number | null; onChange: (v: number) => void; min?: number; max?: number }) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 flex-wrap">
        {nums.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            data-testid={`scale-${n}`}
            className={cn(
              'w-9 h-9 rounded-lg text-sm font-semibold border-2 transition-colors',
              value === n
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 px-0.5">
        <span>Not at all</span><span>Extremely</span>
      </div>
    </div>
  );
}

function GpsCapture({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const capture = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }
    setLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)},${pos.coords.accuracy.toFixed(1)}`;
        onChange(coords);
        setLoading(false);
      },
      err => {
        setGpsError(err.message);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const parts = value ? value.split(',') : null;

  return (
    <div className="space-y-2">
      {parts && parts.length >= 2 && (
        <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-sm">
          <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-emerald-800">Location captured</p>
            <p className="text-xs text-emerald-600 font-mono">
              {parseFloat(parts[0]).toFixed(5)}°, {parseFloat(parts[1]).toFixed(5)}°
              {parts[2] ? ` · ±${parseFloat(parts[2]).toFixed(0)}m` : ''}
            </p>
          </div>
        </div>
      )}
      <Button type="button" variant="outline" onClick={capture} disabled={loading} className="gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
        {loading ? 'Getting location…' : value ? 'Update Location' : 'Capture GPS Location'}
      </Button>
      {gpsError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{gpsError}</p>}
    </div>
  );
}

function ImageCapture({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };
  return (
    <div className="space-y-2">
      {value && (
        <img src={value} className="max-h-48 rounded-xl object-cover border border-slate-200 w-full" alt="Uploaded" />
      )}
      <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
        <ImageIcon className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-600">{value ? 'Change photo' : 'Take or upload a photo'}</span>
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFile} />
      </label>
    </div>
  );
}

function FileAttachment({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(JSON.stringify({ name: file.name, size: file.size, data: reader.result }));
    reader.readAsDataURL(file);
  };
  const meta = value ? (() => { try { return JSON.parse(value); } catch { return null; } })() : null;
  return (
    <div className="space-y-2">
      {meta && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl border border-blue-200 text-sm">
          <Paperclip className="w-4 h-4 text-blue-600 shrink-0" />
          <div>
            <p className="font-medium text-blue-800">{meta.name}</p>
            <p className="text-xs text-blue-600">{(meta.size / 1024).toFixed(1)} KB</p>
          </div>
        </div>
      )}
      <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
        <Paperclip className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-600">{meta ? 'Replace file' : 'Attach a file'}</span>
        <input type="file" className="sr-only" onChange={handleFile} />
      </label>
    </div>
  );
}

// ── Main fill page ─────────────────────────────────────────────────────────────
export default function SurveyFill() {
  const { id } = useParams<{ id: string }>();
  const { currentUser } = useUser();
  const { toast } = useToast();

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: survey, isLoading: surveyLoading } = useQuery<Survey>({
    queryKey: ['survey-fill', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('surveys').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as Survey;
    },
  });

  const { data: questions = [], isLoading: qLoading } = useQuery<Question[]>({
    queryKey: ['survey-fill-questions', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('survey_questions').select('*').eq('survey_id', id!).order('order_index');
      if (error) throw error;
      return (data ?? []) as Question[];
    },
  });

  // Visible questions (respects skip logic)
  const visibleQuestions = questions.filter(q => isVisible(q, answers));

  const submitMutation = useMutation({
    mutationFn: async () => {
      const newErrors: Record<string, string> = {};
      for (const q of visibleQuestions.filter(q => q.required && q.type !== 'section_header')) {
        const val = answers[q.id];
        const missing = val === null || val === undefined || val === '' ||
          (Array.isArray(val) && val.length === 0);
        if (missing) newErrors[q.id] = 'This question is required';
      }
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        throw new Error('Please answer all required questions');
      }
      setErrors({});

      const { data: resp, error: rErr } = await supabase.from('survey_responses').insert({
        survey_id: id,
        respondent_id: currentUser?.id ?? null,
        respondent_name: currentUser?.fullName ?? null,
        respondent_email: currentUser?.email ?? null,
      }).select().single();
      if (rErr || !resp) throw rErr ?? new Error('Failed to submit');

      const jsonTypes = ['checkbox', 'rating', 'scale', 'image', 'file'];

      const answerRows = visibleQuestions
        .filter(q => q.type !== 'section_header')
        .map(q => {
          const val = answers[q.id] ?? null;
          const isJson = jsonTypes.includes(q.type);
          return {
            response_id: resp.id,
            question_id: q.id,
            answer_text: isJson ? null : (val as string | null),
            answer_json: isJson ? val : null,
          };
        })
        .filter(a => a.answer_text !== null || a.answer_json !== null);

      if (answerRows.length) {
        const { error: aErr } = await supabase.from('survey_answers').insert(answerRows);
        if (aErr) throw aErr;
      }
    },
    onSuccess: () => setSubmitted(true),
    onError: (e: Error) => {
      if (e.message !== 'Please answer all required questions') {
        toast({ title: 'Submission failed', description: e.message, variant: 'destructive' });
      }
    },
  });

  const setAnswer = (qid: string, val: AnswerValue) => {
    setAnswers(prev => ({ ...prev, [qid]: val }));
    setErrors(prev => { const n = { ...prev }; delete n[qid]; return n; });
  };

  const toggleCheckbox = (qid: string, opt: string) => {
    const curr = (answers[qid] as string[]) ?? [];
    const next = curr.includes(opt) ? curr.filter(v => v !== opt) : [...curr, opt];
    setAnswer(qid, next);
  };

  const visibleNonSection = visibleQuestions.filter(q => q.type !== 'section_header');
  const requiredVisible = visibleNonSection.filter(q => q.required);
  const answeredRequired = requiredVisible.filter(q => {
    const v = answers[q.id];
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  });
  const progress = requiredVisible.length > 0
    ? Math.round((answeredRequired.length / requiredVisible.length) * 100)
    : 100;

  if (surveyLoading || qLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mr-2" />
      <span className="text-slate-500">Loading survey…</span>
    </div>
  );

  if (!survey) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
        <p className="text-slate-600">Survey not found.</p>
      </div>
    </div>
  );

  if (survey.status !== 'active') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-sm">
        <ClipboardList className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-700 mb-1">
          {survey.status === 'draft' ? 'Survey Not Yet Open' : 'Survey Closed'}
        </h2>
        <p className="text-slate-500 text-sm">
          {survey.status === 'draft'
            ? 'This survey is not accepting responses yet.'
            : 'This survey has been closed and is no longer accepting responses.'}
        </p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white">
      <div className="text-center max-w-sm px-6">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Thank you!</h2>
        <p className="text-slate-500 text-sm">Your response to <strong>"{survey.title}"</strong> has been recorded.</p>
        <a href="/surveys" className="mt-6 inline-flex items-center gap-1.5 text-indigo-600 text-sm hover:underline">
          <ChevronLeft className="w-3.5 h-3.5" />Back to Surveys
        </a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-indigo-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{survey.title}</p>
            {requiredVisible.length > 0 && (
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{progress}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {survey.description && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-slate-700 text-sm leading-relaxed">{survey.description}</p>
          </div>
        )}

        {/* Questions — only visible ones */}
        {visibleQuestions.map(q => {
          if (q.type === 'section_header') {
            return (
              <div key={q.id} className="pt-4 pb-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">{q.label}</p>
              </div>
            );
          }

          const err = errors[q.id];
          const hasSkip = !!(q.settings?.skip_logic as SkipLogic | undefined)?.condition_question_id;

          return (
            <div
              key={q.id}
              className={cn(
                'bg-white rounded-2xl border p-5 space-y-3 transition-colors',
                err ? 'border-red-300' : 'border-slate-200',
              )}
              data-testid={`question-${q.id}`}
            >
              <div>
                <div className="flex items-start gap-1 justify-between">
                  <div className="flex items-start gap-1">
                    <p className="text-sm font-semibold text-slate-800 leading-snug">{q.label}</p>
                    {q.required && <span className="text-red-500 text-sm leading-none shrink-0 mt-0.5">*</span>}
                  </div>
                  {hasSkip && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-600 shrink-0 ml-2">
                      <GitBranch className="w-2.5 h-2.5" />conditional
                    </span>
                  )}
                </div>
                {q.description && <p className="text-xs text-slate-500 mt-1">{q.description}</p>}
              </div>

              {/* Short text */}
              {q.type === 'text' && (
                <Input
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  placeholder="Your answer…"
                  data-testid={`input-answer-${q.id}`}
                />
              )}

              {/* Long text */}
              {q.type === 'textarea' && (
                <Textarea
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  placeholder="Your answer…"
                  rows={4}
                  data-testid={`textarea-answer-${q.id}`}
                />
              )}

              {/* Number */}
              {q.type === 'number' && (
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="number"
                    value={(answers[q.id] as string) ?? ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                    placeholder="0.00"
                    className="pl-9"
                    step="any"
                    data-testid={`number-answer-${q.id}`}
                  />
                </div>
              )}

              {/* Integer */}
              {q.type === 'integer' && (
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="number"
                    value={(answers[q.id] as string) ?? ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                    placeholder="0"
                    className="pl-9"
                    step="1"
                    data-testid={`integer-answer-${q.id}`}
                  />
                </div>
              )}

              {/* Phone */}
              {q.type === 'phone' && (
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="tel"
                    value={(answers[q.id] as string) ?? ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                    placeholder="+1 (000) 000-0000"
                    className="pl-9"
                    data-testid={`phone-answer-${q.id}`}
                  />
                </div>
              )}

              {/* Email */}
              {q.type === 'email' && (
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="email"
                    value={(answers[q.id] as string) ?? ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                    placeholder="email@example.com"
                    className="pl-9"
                    data-testid={`email-answer-${q.id}`}
                  />
                </div>
              )}

              {/* Date */}
              {q.type === 'date' && (
                <Input
                  type="date"
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  data-testid={`date-answer-${q.id}`}
                />
              )}

              {/* Time */}
              {q.type === 'time' && (
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="time"
                    value={(answers[q.id] as string) ?? ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                    className="pl-9"
                    data-testid={`time-answer-${q.id}`}
                  />
                </div>
              )}

              {/* Date & Time */}
              {q.type === 'datetime' && (
                <div className="relative">
                  <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="datetime-local"
                    value={(answers[q.id] as string) ?? ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                    className="pl-9"
                    data-testid={`datetime-answer-${q.id}`}
                  />
                </div>
              )}

              {/* Radio */}
              {q.type === 'radio' && (
                <div className="space-y-2">
                  {(q.options ?? []).map(opt => (
                    <label key={opt} className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors',
                      answers[q.id] === opt ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300',
                    )}>
                      <input
                        type="radio"
                        name={q.id}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => setAnswer(q.id, opt)}
                        className="accent-indigo-600"
                        data-testid={`radio-${q.id}-${opt}`}
                      />
                      <span className="text-sm text-slate-700">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Checkbox */}
              {q.type === 'checkbox' && (
                <div className="space-y-2">
                  {(q.options ?? []).map(opt => {
                    const checked = ((answers[q.id] as string[]) ?? []).includes(opt);
                    return (
                      <label key={opt} className={cn(
                        'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors',
                        checked ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300',
                      )}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCheckbox(q.id, opt)}
                          className="accent-indigo-600"
                          data-testid={`checkbox-${q.id}-${opt}`}
                        />
                        <span className="text-sm text-slate-700">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Dropdown */}
              {q.type === 'dropdown' && (
                <Select value={(answers[q.id] as string) ?? ''} onValueChange={v => setAnswer(q.id, v)}>
                  <SelectTrigger data-testid={`select-answer-${q.id}`}>
                    <SelectValue placeholder="Select an option…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(q.options ?? []).map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Star rating */}
              {q.type === 'rating' && (
                <StarRating value={(answers[q.id] as number) ?? 0} onChange={v => setAnswer(q.id, v)} />
              )}

              {/* Scale */}
              {q.type === 'scale' && (
                <ScaleSelector
                  value={(answers[q.id] as number) ?? null}
                  onChange={v => setAnswer(q.id, v)}
                  min={Number(q.settings?.min ?? 1)}
                  max={Number(q.settings?.max ?? 10)}
                />
              )}

              {/* GPS */}
              {q.type === 'gps' && (
                <GpsCapture value={(answers[q.id] as string) ?? null} onChange={v => setAnswer(q.id, v)} />
              )}

              {/* Image / Photo */}
              {q.type === 'image' && (
                <ImageCapture value={(answers[q.id] as string) ?? null} onChange={v => setAnswer(q.id, v)} />
              )}

              {/* File upload */}
              {q.type === 'file' && (
                <FileAttachment value={(answers[q.id] as string) ?? null} onChange={v => setAnswer(q.id, v)} />
              )}

              {/* Barcode / QR */}
              {q.type === 'barcode' && (
                <div className="space-y-2">
                  <div className="relative">
                    <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={(answers[q.id] as string) ?? ''}
                      onChange={e => setAnswer(q.id, e.target.value)}
                      placeholder="Scan or type barcode / QR value…"
                      className="pl-9"
                      data-testid={`barcode-answer-${q.id}`}
                    />
                  </div>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <ScanLine className="w-3 h-3" />Use your device camera or type the code manually
                  </p>
                </div>
              )}

              {err && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{err}
                </p>
              )}
            </div>
          );
        })}

        {/* Submit */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          {Object.keys(errors).length > 0 && (
            <div className="flex items-center gap-2 mb-4 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Please answer all required questions before submitting.
            </div>
          )}
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="w-full gap-2"
            data-testid="btn-submit-survey"
          >
            {submitMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</>
              : <><ChevronRight className="w-4 h-4" />Submit Response</>}
          </Button>
          {visibleNonSection.length > 0 && (
            <p className="text-center text-[11px] text-slate-400 mt-2">
              {answeredRequired.length} of {visibleNonSection.length} question{visibleNonSection.length !== 1 ? 's' : ''} answered
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
