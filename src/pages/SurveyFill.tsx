import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, CheckCircle2, ClipboardList, Star, ChevronLeft, ChevronRight,
  AlertCircle,
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
  | 'rating' | 'scale' | 'date' | 'dropdown' | 'section_header';

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
          <Star
            className={cn(
              'w-8 h-8 transition-colors',
              n <= (hover || value) ? 'fill-amber-400 text-amber-400' : 'text-slate-200',
            )}
          />
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

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Validate required
      const newErrors: Record<string, string> = {};
      for (const q of questions.filter(q => q.required && q.type !== 'section_header')) {
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

      // Insert response
      const { data: resp, error: rErr } = await supabase.from('survey_responses').insert({
        survey_id: id,
        respondent_id: currentUser?.id ?? null,
        respondent_name: currentUser?.fullName ?? null,
        respondent_email: currentUser?.email ?? null,
      }).select().single();
      if (rErr || !resp) throw rErr ?? new Error('Failed to submit');

      // Insert answers
      const answerRows = questions
        .filter(q => q.type !== 'section_header')
        .map(q => {
          const val = answers[q.id] ?? null;
          const isJson = ['checkbox', 'rating', 'scale'].includes(q.type);
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

  const answeredCount = questions.filter(q => q.type !== 'section_header').filter(q => {
    const v = answers[q.id];
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  }).length;
  const totalRequired = questions.filter(q => q.required && q.type !== 'section_header').length;
  const progress = totalRequired > 0
    ? Math.round((questions.filter(q => q.required && q.type !== 'section_header').filter(q => {
        const v = answers[q.id];
        return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
      }).length / totalRequired) * 100)
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
            {totalRequired > 0 && (
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
        {/* Survey description */}
        {survey.description && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-slate-700 text-sm leading-relaxed">{survey.description}</p>
          </div>
        )}

        {/* Questions */}
        {questions.map(q => {
          if (q.type === 'section_header') {
            return (
              <div key={q.id} className="pt-4 pb-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">{q.label}</p>
              </div>
            );
          }
          const err = errors[q.id];
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
                <div className="flex items-start gap-1">
                  <p className="text-sm font-semibold text-slate-800 leading-snug">{q.label}</p>
                  {q.required && <span className="text-red-500 text-sm leading-none shrink-0 mt-0.5">*</span>}
                </div>
                {q.description && <p className="text-xs text-slate-500 mt-1">{q.description}</p>}
              </div>

              {/* Text */}
              {q.type === 'text' && (
                <Input
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  placeholder={(q.settings?.placeholder as string) ?? 'Your answer…'}
                  data-testid={`input-answer-${q.id}`}
                />
              )}

              {/* Textarea */}
              {q.type === 'textarea' && (
                <Textarea
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  placeholder={(q.settings?.placeholder as string) ?? 'Your answer…'}
                  rows={4}
                  data-testid={`textarea-answer-${q.id}`}
                />
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
                <StarRating
                  value={(answers[q.id] as number) ?? 0}
                  onChange={v => setAnswer(q.id, v)}
                />
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

              {/* Date */}
              {q.type === 'date' && (
                <Input
                  type="date"
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  data-testid={`date-answer-${q.id}`}
                />
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
          {totalRequired > 0 && (
            <p className="text-center text-[11px] text-slate-400 mt-2">
              {answeredCount} of {questions.filter(q => q.type !== 'section_header').length} questions answered
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
