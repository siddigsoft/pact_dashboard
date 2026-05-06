import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, CheckCircle2, ClipboardList, Star, ChevronLeft, ChevronRight,
  AlertCircle, MapPin, Image as ImageIcon, Paperclip, ScanLine, Phone, Mail,
  Hash, Clock, CalendarClock, GitBranch, Folder,
  Crosshair, RefreshCw, Check, Copy, ExternalLink, Edit3, Keyboard, X,
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
  | 'gps' | 'image' | 'file' | 'barcode' | 'begin_group';

interface SkipLogic {
  condition_question_id: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'answered' | 'not_answered' | 'greater_than' | 'less_than';
  value?: string;
}

interface Survey {
  id: string;
  title: string;
  title_ar: string | null;
  description: string | null;
  description_ar: string | null;
  status: 'draft' | 'active' | 'closed';
  settings: Record<string, unknown>;
}

interface Question {
  id: string;
  survey_id: string;
  type: QuestionType;
  label: string;
  label_ar: string | null;
  description: string | null;
  description_ar: string | null;
  options: string[] | null;
  options_ar: string[] | null;
  order_index: number;
  settings: Record<string, unknown>;
  group_id: string | null;
}

type AnswerValue = string | string[] | number | null;

// ── Skip logic evaluation ─────────────────────────────────────────────────────
function isVisible(q: Question, allQuestions: Question[], answers: Record<string, AnswerValue>): boolean {
  // Check parent group visibility first (if inside a group)
  if (q.group_id) {
    const parent = allQuestions.find(g => g.id === q.group_id);
    if (parent && !isVisible(parent, allQuestions, answers)) return false;
  }
  // Check own skip logic
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

// ── GPS coordinate helpers ────────────────────────────────────────────────────
interface GpsCoords { lat: number; lng: number; alt: number | null; acc: number }

function parseGpsValue(v: string | null): GpsCoords | null {
  if (!v) return null;
  const p = v.split(',');
  if (p.length >= 4) {
    // New format: lat,lng,alt,acc
    return { lat: parseFloat(p[0]), lng: parseFloat(p[1]), alt: p[2] !== '' ? parseFloat(p[2]) : null, acc: parseFloat(p[3]) };
  } else if (p.length === 3) {
    // Legacy format: lat,lng,acc
    return { lat: parseFloat(p[0]), lng: parseFloat(p[1]), alt: null, acc: parseFloat(p[2]) };
  }
  return null;
}

function getSignalLevel(acc: number) {
  if (acc <= 5) return 4;
  if (acc <= 10) return 3;
  if (acc <= 20) return 2;
  if (acc <= 50) return 1;
  return 0;
}

function SignalBars({ acc }: { acc: number }) {
  const level = getSignalLevel(acc);
  const color = level >= 3 ? 'bg-emerald-500' : level >= 2 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="flex items-end gap-0.5 h-4" title={`Accuracy: ±${acc.toFixed(0)}m`}>
      {[1, 2, 3, 4].map(b => (
        <div key={b} className={cn('w-1.5 rounded-sm transition-colors', b <= level ? color : 'bg-slate-200')} style={{ height: `${b * 4}px` }} />
      ))}
    </div>
  );
}

// ── Enhanced GPS Capture (ODK / Ona.io feature parity) ───────────────────────
function GpsCapture({
  value, onChange, settings,
}: { value: string | null; onChange: (v: string) => void; settings?: Record<string, unknown> }) {
  const accuracyThreshold = Number(settings?.accuracy_threshold ?? 10);
  const captureAlt        = settings?.capture_altitude !== false;
  const allowManual       = settings?.allow_manual !== false;

  const [status, setStatus]         = useState<'idle' | 'acquiring' | 'captured'>(() => value ? 'captured' : 'idle');
  const [liveCoords, setLiveCoords] = useState<GpsCoords | null>(null);
  const [gpsError, setGpsError]     = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualLat, setManualLat]   = useState('');
  const [manualLng, setManualLng]   = useState('');
  const [manualAlt, setManualAlt]   = useState('');
  const [copied, setCopied]         = useState(false);
  const watchRef                    = useRef<number | null>(null);

  const stored = parseGpsValue(value);

  const stopWatch = () => {
    if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
  };

  const startWatch = () => {
    if (!navigator.geolocation) { setGpsError('Geolocation is not supported by your browser.'); return; }
    setStatus('acquiring'); setGpsError(null); setLiveCoords(null);
    watchRef.current = navigator.geolocation.watchPosition(
      pos => setLiveCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, alt: pos.coords.altitude, acc: pos.coords.accuracy }),
      err => { setGpsError(err.message); setStatus('idle'); stopWatch(); },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
    );
  };

  const captureNow = () => {
    if (!liveCoords) return;
    const altStr = captureAlt && liveCoords.alt !== null ? liveCoords.alt.toFixed(1) : '';
    onChange(`${liveCoords.lat.toFixed(6)},${liveCoords.lng.toFixed(6)},${altStr},${liveCoords.acc.toFixed(1)}`);
    setStatus('captured'); stopWatch();
  };

  const captureManual = () => {
    const lat = parseFloat(manualLat), lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setGpsError('Invalid coordinates. Latitude: −90 to 90, Longitude: −180 to 180.'); return;
    }
    const altStr = manualAlt ? parseFloat(manualAlt).toFixed(1) : '';
    onChange(`${lat.toFixed(6)},${lng.toFixed(6)},${altStr},0`);
    setStatus('captured'); setManualMode(false); setGpsError(null);
  };

  const reset = () => { stopWatch(); setStatus('idle'); setLiveCoords(null); setGpsError(null); setManualMode(false); onChange(''); };

  const copyCoords = () => {
    if (!stored) return;
    const txt = `${stored.lat.toFixed(6)}, ${stored.lng.toFixed(6)}${stored.alt !== null ? `, ${stored.alt.toFixed(1)}m` : ''} ±${stored.acc.toFixed(0)}m`;
    navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  useEffect(() => () => stopWatch(), []);

  // ── Captured ──────────────────────────────────────────────────────────────
  if (status === 'captured' && stored) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-100">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold text-emerald-800">Location captured</p>
            <span className="ml-auto text-[10px] text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full font-medium">
              ±{stored.acc.toFixed(0)}m accuracy
            </span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-emerald-100">
            {[
              { label: 'Latitude',  value: `${stored.lat.toFixed(6)}°` },
              { label: 'Longitude', value: `${stored.lng.toFixed(6)}°` },
              ...(stored.alt !== null ? [{ label: 'Altitude', value: `${stored.alt.toFixed(1)} m` }] : []),
              { label: 'Accuracy',  value: `±${stored.acc.toFixed(1)} m` },
            ].map(row => (
              <div key={row.label} className="bg-white px-3 py-2">
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{row.label}</p>
                <p className="text-sm font-mono font-semibold text-slate-800">{row.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Mini map */}
        <div className="rounded-xl overflow-hidden border border-slate-200" style={{ height: 160 }}>
          <iframe
            title="GPS location"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${stored.lng - 0.006},${stored.lat - 0.006},${stored.lng + 0.006},${stored.lat + 0.006}&layer=mapnik&marker=${stored.lat},${stored.lng}`}
            className="w-full h-full border-0"
            loading="lazy"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button type="button" size="sm" variant="outline" onClick={reset} className="gap-1.5 text-xs h-8">
            <RefreshCw className="w-3 h-3" />Recapture
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={copyCoords} className="gap-1.5 text-xs h-8">
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy coords'}
          </Button>
          <a
            href={`https://www.google.com/maps?q=${stored.lat},${stored.lng}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs h-8 px-3 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />Open in Maps
          </a>
        </div>
      </div>
    );
  }

  // ── Acquiring ─────────────────────────────────────────────────────────────
  if (status === 'acquiring') {
    const thresholdMet = liveCoords ? liveCoords.acc <= accuracyThreshold : false;
    const level = liveCoords ? getSignalLevel(liveCoords.acc) : 0;
    return (
      <div className="space-y-3">
        <div className={cn('rounded-xl border p-4 space-y-3', thresholdMet ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn('w-2 h-2 rounded-full animate-pulse', thresholdMet ? 'bg-emerald-500' : 'bg-amber-500')} />
              <span className="text-sm font-semibold text-slate-700">
                {!liveCoords ? 'Waiting for GPS signal…' : thresholdMet ? 'Ready to capture' : 'Acquiring better signal…'}
              </span>
            </div>
            {liveCoords && <SignalBars acc={liveCoords.acc} />}
          </div>

          {liveCoords && (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: 'Accuracy', value: `±${liveCoords.acc.toFixed(0)}m` },
                  { label: 'Target',   value: `≤${accuracyThreshold}m` },
                  { label: 'Latitude', value: `${liveCoords.lat.toFixed(5)}°` },
                  { label: 'Longitude',value: `${liveCoords.lng.toFixed(5)}°` },
                  ...(liveCoords.alt !== null ? [{ label: 'Altitude', value: `${liveCoords.alt.toFixed(1)} m` }] : []),
                ].map(row => (
                  <div key={row.label} className="bg-white/70 rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-slate-400">{row.label}</p>
                    <p className="font-mono font-semibold text-slate-700">{row.value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', thresholdMet ? 'bg-emerald-500' : level >= 2 ? 'bg-amber-400' : 'bg-red-400')}
                    style={{ width: `${Math.min(100, Math.max(4, (accuracyThreshold / liveCoords.acc) * 100))}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  {thresholdMet ? `✓ Threshold met (≤${accuracyThreshold}m)` : `Waiting for ≤${accuracyThreshold}m accuracy…`}
                </p>
              </div>
            </>
          )}

          {!liveCoords && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />Searching for satellite signal…
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button type="button" onClick={captureNow} disabled={!liveCoords} className="gap-2">
            <Crosshair className="w-4 h-4" />{thresholdMet ? 'Capture Location' : 'Capture Anyway'}
          </Button>
          <Button type="button" variant="outline" onClick={() => { stopWatch(); setStatus('idle'); setLiveCoords(null); }} className="gap-2">
            <X className="w-4 h-4" />Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── Manual entry ──────────────────────────────────────────────────────────
  if (manualMode) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-semibold text-blue-800">Enter coordinates manually</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Latitude <span className="text-red-500">*</span></Label>
              <Input type="number" value={manualLat} onChange={e => setManualLat(e.target.value)} placeholder="e.g. 15.55123" step="any" min={-90} max={90} className="h-8 text-sm font-mono" data-testid="gps-manual-lat" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Longitude <span className="text-red-500">*</span></Label>
              <Input type="number" value={manualLng} onChange={e => setManualLng(e.target.value)} placeholder="e.g. 32.54321" step="any" min={-180} max={180} className="h-8 text-sm font-mono" data-testid="gps-manual-lng" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs text-slate-600">Altitude (m) <span className="text-slate-400 font-normal">optional</span></Label>
              <Input type="number" value={manualAlt} onChange={e => setManualAlt(e.target.value)} placeholder="e.g. 380" step="any" className="h-8 text-sm font-mono" data-testid="gps-manual-alt" />
            </div>
          </div>
          {gpsError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{gpsError}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={captureManual} className="gap-2">
            <Check className="w-4 h-4" />Accept Coordinates
          </Button>
          <Button type="button" variant="outline" onClick={() => { setManualMode(false); setGpsError(null); }}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {stored && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-sm">
          <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-emerald-800">Location saved</p>
            <p className="text-xs text-emerald-600 font-mono">
              {stored.lat.toFixed(5)}°, {stored.lng.toFixed(5)}°
              {stored.alt !== null ? ` · ${stored.alt.toFixed(0)}m alt` : ''}
              {' '}· ±{stored.acc.toFixed(0)}m
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" onClick={startWatch} className="gap-2" data-testid="btn-gps-capture">
          <Crosshair className="w-4 h-4" />{stored ? 'Recapture GPS' : 'Capture GPS Location'}
        </Button>
        {allowManual && (
          <Button type="button" variant="outline" onClick={() => setManualMode(true)} className="gap-2 text-sm" data-testid="btn-gps-manual">
            <Keyboard className="w-4 h-4" />Enter Manually
          </Button>
        )}
        {stored && (
          <Button type="button" variant="ghost" size="sm" onClick={reset} className="text-slate-400 hover:text-red-500 gap-1 text-xs">
            <X className="w-3 h-3" />Clear
          </Button>
        )}
      </div>
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

  const [answers, setAnswers]     = useState<Record<string, AnswerValue>>({});
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [lang, setLang]           = useState<'en' | 'ar'>('en');

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

  // All questions visible to this respondent (skip logic + group visibility)
  const visibleIds = new Set(
    questions.filter(q => isVisible(q, questions, answers)).map(q => q.id)
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      const newErrors: Record<string, string> = {};
      for (const q of questions.filter(q => visibleIds.has(q.id) && q.required && !['section_header','begin_group'].includes(q.type))) {
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

      const answerRows = questions
        .filter(q => visibleIds.has(q.id) && !['section_header','begin_group'].includes(q.type))
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

  // Count stats for progress bar
  const visibleNonStructural = questions.filter(q => visibleIds.has(q.id) && !['section_header','begin_group'].includes(q.type));
  const requiredVisible = visibleNonStructural.filter(q => q.required);
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

  // ── Recursive question renderer ─────────────────────────────────────────────
  const renderQuestion = (q: Question, depth = 0): React.ReactNode => {
    if (!visibleIds.has(q.id)) return null;

    // Group container
    if (q.type === 'begin_group') {
      const children = questions
        .filter(c => (c.group_id ?? null) === q.id)
        .sort((a, b) => a.order_index - b.order_index);
      const visibleChildren = children.filter(c => visibleIds.has(c.id));
      if (visibleChildren.length === 0) return null;

      const groupColors = [
        'border-indigo-200',
        'border-violet-200',
        'border-sky-200',
      ];
      const headerColors = [
        'bg-indigo-50 border-b border-indigo-100',
        'bg-violet-50 border-b border-violet-100',
        'bg-sky-50 border-b border-sky-100',
      ];
      const iconColors = ['text-indigo-500', 'text-violet-500', 'text-sky-500'];
      const titleColors = ['text-indigo-700', 'text-violet-700', 'text-sky-700'];
      const ci = depth % 3;

      return (
        <div key={q.id} className={cn('rounded-2xl border-2 overflow-hidden', groupColors[ci])}>
          <div className={cn('flex items-center gap-2 px-5 py-3', headerColors[ci])}>
            <Folder className={cn('w-4 h-4 shrink-0', iconColors[ci])} />
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-semibold', titleColors[ci])}>
                {lang === 'ar' && q.label_ar ? q.label_ar : q.label}
              </p>
              {(lang === 'ar' ? (q.description_ar || q.description) : q.description) && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {lang === 'ar' ? (q.description_ar || q.description) : q.description}
                </p>
              )}
            </div>
          </div>
          <div className="p-4 space-y-4 bg-white/50">
            {visibleChildren.map(child => renderQuestion(child, depth + 1))}
          </div>
        </div>
      );
    }

    // Section header (flat divider)
    if (q.type === 'section_header') {
      return (
        <div key={q.id} className="pt-4 pb-1">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">
            {lang === 'ar' && q.label_ar ? q.label_ar : q.label}
          </p>
        </div>
      );
    }

    // Regular question
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
              <p className="text-sm font-semibold text-slate-800 leading-snug">
                {lang === 'ar' && q.label_ar ? q.label_ar : q.label}
              </p>
              {q.required && <span className="text-red-500 text-sm leading-none shrink-0 mt-0.5">*</span>}
            </div>
            {hasSkip && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-600 shrink-0 ml-2">
                <GitBranch className="w-2.5 h-2.5" />{lang === 'ar' ? 'مشروط' : 'conditional'}
              </span>
            )}
          </div>
          {(lang === 'ar' ? (q.description_ar || q.description) : q.description) && (
            <p className="text-xs text-slate-500 mt-1">
              {lang === 'ar' ? (q.description_ar || q.description) : q.description}
            </p>
          )}
        </div>

        {q.type === 'text' && (
          <Input
            value={(answers[q.id] as string) ?? ''}
            onChange={e => setAnswer(q.id, e.target.value)}
            placeholder="Your answer…"
            data-testid={`input-answer-${q.id}`}
          />
        )}

        {q.type === 'textarea' && (
          <Textarea
            value={(answers[q.id] as string) ?? ''}
            onChange={e => setAnswer(q.id, e.target.value)}
            placeholder="Your answer…"
            rows={4}
            data-testid={`textarea-answer-${q.id}`}
          />
        )}

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

        {q.type === 'date' && (
          <Input
            type="date"
            value={(answers[q.id] as string) ?? ''}
            onChange={e => setAnswer(q.id, e.target.value)}
            data-testid={`date-answer-${q.id}`}
          />
        )}

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

        {q.type === 'radio' && (
          <div className="space-y-2">
            {(q.options ?? []).map((opt, i) => {
              const displayOpt = lang === 'ar' && q.options_ar?.[i] ? q.options_ar[i] : opt;
              return (
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
                  <span className="text-sm text-slate-700">{displayOpt}</span>
                </label>
              );
            })}
          </div>
        )}

        {q.type === 'checkbox' && (
          <div className="space-y-2">
            {(q.options ?? []).map((opt, i) => {
              const checked = ((answers[q.id] as string[]) ?? []).includes(opt);
              const displayOpt = lang === 'ar' && q.options_ar?.[i] ? q.options_ar[i] : opt;
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
                  <span className="text-sm text-slate-700">{displayOpt}</span>
                </label>
              );
            })}
          </div>
        )}

        {q.type === 'dropdown' && (
          <Select value={(answers[q.id] as string) ?? ''} onValueChange={v => setAnswer(q.id, v)}>
            <SelectTrigger data-testid={`select-answer-${q.id}`}>
              <SelectValue placeholder={lang === 'ar' ? 'اختر خياراً…' : 'Select an option…'} />
            </SelectTrigger>
            <SelectContent>
              {(q.options ?? []).map((opt, i) => {
                const displayOpt = lang === 'ar' && q.options_ar?.[i] ? q.options_ar[i] : opt;
                return <SelectItem key={opt} value={opt}>{displayOpt}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        )}

        {q.type === 'rating' && (
          <StarRating value={(answers[q.id] as number) ?? 0} onChange={v => setAnswer(q.id, v)} />
        )}

        {q.type === 'scale' && (
          <ScaleSelector
            value={(answers[q.id] as number) ?? null}
            onChange={v => setAnswer(q.id, v)}
            min={Number(q.settings?.min ?? 1)}
            max={Number(q.settings?.max ?? 10)}
          />
        )}

        {q.type === 'gps' && (
          <GpsCapture value={(answers[q.id] as string) ?? null} onChange={v => setAnswer(q.id, v)} settings={q.settings} />
        )}

        {q.type === 'image' && (
          <ImageCapture value={(answers[q.id] as string) ?? null} onChange={v => setAnswer(q.id, v)} />
        )}

        {q.type === 'file' && (
          <FileAttachment value={(answers[q.id] as string) ?? null} onChange={v => setAnswer(q.id, v)} />
        )}

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
  };

  // Top-level items: questions with no parent group
  const topLevelItems = questions
    .filter(q => (q.group_id ?? null) === null)
    .sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-indigo-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">
              {lang === 'ar' && survey.title_ar ? survey.title_ar : survey.title}
            </p>
            {requiredVisible.length > 0 && (
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{progress}%</span>
              </div>
            )}
          </div>
          {/* Language toggle — only shown if the survey has Arabic content */}
          {(survey.title_ar || survey.description_ar) && (
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden shrink-0">
              <button
                onClick={() => setLang('en')}
                data-testid="btn-lang-en"
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${lang === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >EN</button>
              <button
                onClick={() => setLang('ar')}
                data-testid="btn-lang-ar"
                className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-slate-200 ${lang === 'ar' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >عربي</button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {(lang === 'ar' ? (survey.description_ar || survey.description) : survey.description) && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-slate-700 text-sm leading-relaxed">
              {lang === 'ar' ? (survey.description_ar || survey.description) : survey.description}
            </p>
          </div>
        )}

        {/* Render questions from top-level down (groups render their children) */}
        {topLevelItems.map(q => renderQuestion(q, 0))}

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
          {visibleNonStructural.length > 0 && (
            <p className="text-center text-[11px] text-slate-400 mt-2">
              {answeredRequired.length} of {visibleNonStructural.length} question{visibleNonStructural.length !== 1 ? 's' : ''} answered
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
