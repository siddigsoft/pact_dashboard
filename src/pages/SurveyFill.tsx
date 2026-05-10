import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, CheckCircle2, ClipboardList, Star, ChevronLeft, ChevronRight,
  AlertCircle, MapPin, Image as ImageIcon, Paperclip, ScanLine, Phone, Mail,
  Hash, Clock, CalendarClock, GitBranch, Folder,
  Crosshair, RefreshCw, Check, Copy, ExternalLink, Edit3, Keyboard, X, Save,
  FunctionSquare, Plus, Table2, Trash2, PenLine, Info, Lock,
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
  | 'gps' | 'image' | 'file' | 'barcode' | 'begin_group'
  | 'calculate' | 'begin_repeat' | 'grid_table'
  | 'likert' | 'signature' | 'note' | 'acknowledge';

interface SkipCondition {
  question_id: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'answered' | 'not_answered' | 'greater_than' | 'less_than';
  value?: string;
}

interface SkipLogic {
  condition_question_id?: string;
  operator?: 'equals' | 'not_equals' | 'contains' | 'answered' | 'not_answered' | 'greater_than' | 'less_than';
  value?: string;
  logic?: 'AND' | 'OR';
  conditions?: SkipCondition[];
}

interface Survey {
  id: string;
  short_code: string | null;
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

// ── Calculated field formula evaluator ────────────────────────────────────────
function evaluateFormula(formula: string, questions: Question[], answers: Record<string, AnswerValue>): string {
  try {
    // Replace ${variable_name} or ${question_id} with answer values
    let expr = formula.replace(/\$\{([^}]+)\}/g, (_, key) => {
      const q = questions.find(q => (q.settings?.variable_name === key) || q.id === key);
      if (!q) return '0';
      const val = answers[q.id];
      if (val === null || val === undefined || val === '') return '0';
      return String(val);
    });
    // Safe eval via Function (no window/document access)
    // eslint-disable-next-line no-new-func
    const result = new Function('"use strict"; return (' + expr + ')')();
    if (result === null || result === undefined || isNaN(result as number)) return '';
    return typeof result === 'number' ? (Number.isInteger(result) ? String(result) : result.toFixed(2)) : String(result);
  } catch {
    return '';
  }
}

// ── Skip logic evaluation ─────────────────────────────────────────────────────
function evalOneCond(cond: SkipCondition, answers: Record<string, AnswerValue>): boolean {
  const trigger = answers[cond.question_id];
  const triggerStr = Array.isArray(trigger) ? trigger.join(',') : String(trigger ?? '');
  switch (cond.operator) {
    case 'answered':     return trigger !== null && trigger !== undefined && trigger !== '' && !(Array.isArray(trigger) && trigger.length === 0);
    case 'not_answered': return trigger === null || trigger === undefined || trigger === '' || (Array.isArray(trigger) && trigger.length === 0);
    case 'equals':       return triggerStr === (cond.value ?? '');
    case 'not_equals':   return triggerStr !== (cond.value ?? '');
    case 'contains':     return triggerStr.toLowerCase().includes((cond.value ?? '').toLowerCase());
    case 'greater_than': return Number(trigger) > Number(cond.value ?? 0);
    case 'less_than':    return Number(trigger) < Number(cond.value ?? 0);
    default:             return true;
  }
}

function isVisible(q: Question, allQuestions: Question[], answers: Record<string, AnswerValue>): boolean {
  if (q.group_id) {
    const parent = allQuestions.find(g => g.id === q.group_id);
    if (parent && !isVisible(parent, allQuestions, answers)) return false;
  }
  const sl = q.settings?.skip_logic as SkipLogic | undefined;
  if (!sl) return true;

  // Multi-condition format
  if (sl.conditions && sl.conditions.length > 0) {
    const results = sl.conditions.map(c => evalOneCond(c, answers));
    return sl.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  }
  // Legacy single-condition format
  if (!sl.condition_question_id) return true;
  return evalOneCond({ question_id: sl.condition_question_id, operator: sl.operator ?? 'equals', value: sl.value }, answers);
}

// ── Answer piping ─────────────────────────────────────────────────────────────
function pipeLabel(label: string, questions: Question[], answers: Record<string, AnswerValue>): string {
  return label.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const q = questions.find(q => (String(q.settings?.variable_name ?? '')) === key || q.id === key);
    if (!q) return `$\{${key}}`;
    const val = answers[q.id];
    if (val === null || val === undefined || val === '') return `$\{${key}}`;
    return Array.isArray(val) ? val.join(', ') : String(val);
  });
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

function SignaturePad({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const getCtx = () => canvasRef.current?.getContext('2d');

  const startDraw = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = getCtx(); if (!ctx) return;
    const r = canvasRef.current!.getBoundingClientRect();
    ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
    canvasRef.current!.setPointerCapture(e.pointerId);
  };
  const draw = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = getCtx(); if (!ctx) return;
    const r = canvasRef.current!.getBoundingClientRect();
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1e293b';
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke();
  };
  const endDraw = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current?.toDataURL('image/png') ?? '');
  };
  const clear = () => {
    const ctx = getCtx(); if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    onChange('');
  };
  useEffect(() => {
    if (value && canvasRef.current) {
      const img = new Image(); img.src = value;
      img.onload = () => getCtx()?.drawImage(img, 0, 0);
    }
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border-2 border-slate-200 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600} height={160}
          className="w-full touch-none cursor-crosshair"
          style={{ height: 160 }}
          onPointerDown={startDraw} onPointerMove={draw} onPointerUp={endDraw} onPointerLeave={endDraw}
        />
        {!value && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-1 text-slate-300">
              <PenLine className="w-6 h-6" />
              <span className="text-xs">Sign here</span>
            </div>
          </div>
        )}
        <div className="absolute bottom-2 right-2">
          <button type="button" onClick={clear} className="text-[10px] text-slate-400 hover:text-red-500 bg-white/80 px-2 py-0.5 rounded border border-slate-200">
            Clear
          </button>
        </div>
        <div className="absolute bottom-0 left-4 right-4 h-px bg-slate-200" style={{ bottom: 32 }} />
      </div>
      {value && (
        <p className="text-xs text-emerald-600 flex items-center gap-1">
          <Check className="w-3 h-3" />Signature captured
        </p>
      )}
    </div>
  );
}

// ── Main fill page ─────────────────────────────────────────────────────────────
export default function SurveyFill() {
  const { id } = useParams<{ id: string }>();
  const { currentUser } = useUser();
  const { toast } = useToast();

  const [answers, setAnswers]         = useState<Record<string, AnswerValue>>({});
  const [submitted, setSubmitted]     = useState(false);
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [lang, setLang]               = useState<'en' | 'ar'>('en');
  const [currentPage, setCurrentPage] = useState(0);
  const [respondentName, setRespondentName]   = useState('');
  const [respondentEmail, setRespondentEmail] = useState('');
  const [hasDraft, setHasDraft]       = useState(false);
  const startTimeRef = useState(() => Date.now())[0];
  const [fillPasswordUnlocked, setFillPasswordUnlocked] = useState(false);
  const [fillPasswordInput, setFillPasswordInput]       = useState('');
  const [fillPasswordError, setFillPasswordError]       = useState(false);
  // Repeat group rows: { [groupId]: [{ [childQId]: AnswerValue }, ...] }
  const [repeatRows, setRepeatRows] = useState<Record<string, Array<Record<string, AnswerValue>>>>({});
  // Grid table rows: { [questionId]: [{ [colId]: string }, ...] }
  const [gridTableRows, setGridTableRows] = useState<Record<string, Array<Record<string, string>>>>({});

  const draftKey = id ? `survey_draft_${id}` : null;

  // URL prefill — ?name=Ahmed&email=ahmed@example.com
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nameParam  = params.get('name')  || params.get('respondent_name');
    const emailParam = params.get('email') || params.get('respondent_email');
    if (nameParam)  setRespondentName(nameParam);
    if (emailParam) setRespondentEmail(emailParam);
  }, []);

  // Restore saved draft on mount
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft?.answers && Object.keys(draft.answers).length > 0) setHasDraft(true);
    } catch { /* ignore */ }
  }, [draftKey]);

  // Auto-save draft every time answers change
  useEffect(() => {
    if (!draftKey || Object.keys(answers).length === 0) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ answers, savedAt: Date.now() }));
    } catch { /* ignore quota errors */ }
  }, [answers, draftKey]);

  const loadDraft = () => {
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft?.answers) { setAnswers(draft.answers); setHasDraft(false); }
    } catch { /* ignore */ }
  };

  const clearDraft = () => {
    if (draftKey) try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    setHasDraft(false);
  };

  // Detect whether the URL param is a full UUID or a short_code
  const isUuidParam = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? '');

  const { data: survey, isLoading: surveyLoading } = useQuery<Survey>({
    queryKey: ['survey-fill', id],
    enabled: !!id,
    queryFn: async () => {
      const base = supabase.from('surveys').select('*');
      const { data, error } = await (isUuidParam ? base.eq('id', id!) : base.eq('short_code', id!)).single();
      if (error) throw error;
      return data as Survey;
    },
  });

  // The real UUID — used for all child table queries
  const surveyId = survey?.id;

  const { data: questions = [], isLoading: qLoading } = useQuery<Question[]>({
    queryKey: ['survey-fill-questions', surveyId],
    enabled: !!surveyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('survey_questions').select('*').eq('survey_id', surveyId!).order('order_index');
      if (error) throw error;
      return (data ?? []) as Question[];
    },
  });

  // Sync calculate fields: recompute all formula questions whenever answers or
  // questions change.  MUST appear after the questions declaration to avoid a
  // temporal dead-zone crash ("Cannot access 'questions' before initialization").
  useEffect(() => {
    const calcQs = questions.filter(q => q.type === 'calculate');
    if (calcQs.length === 0) return;
    const updates: Record<string, AnswerValue> = {};
    for (const q of calcQs) {
      const formula = String(q.settings?.formula ?? '');
      if (!formula) continue;
      const computed = evaluateFormula(formula, questions, answers);
      if (computed !== '' && answers[q.id] !== computed) {
        updates[q.id] = computed;
      }
    }
    if (Object.keys(updates).length > 0) {
      setAnswers(prev => ({ ...prev, ...updates }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, answers]);

  const responseLimit = survey ? Number(survey.settings?.response_limit || 0) : 0;
  const { data: responseCount = 0 } = useQuery<number>({
    queryKey: ['survey-fill-count', surveyId],
    enabled: !!surveyId && responseLimit > 0,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('survey_responses')
        .select('*', { count: 'exact', head: true })
        .eq('survey_id', surveyId!);
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 10_000,
  });

  // All questions visible to this respondent (skip logic + group visibility)
  const visibleIds = new Set(
    questions.filter(q => isVisible(q, questions, answers)).map(q => q.id)
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      const newErrors: Record<string, string> = {};

      // Required + min/max/pattern validation
      for (const q of questions.filter(q => visibleIds.has(q.id) && !['section_header','begin_group','note'].includes(q.type))) {
        if (q.type === 'grid_table') {
          if (q.required) {
            const rows = gridTableRows[q.id] ?? [];
            const hasAnyValue = rows.some(row => Object.values(row).some(v => v !== ''));
            if (!hasAnyValue) newErrors[q.id] = 'This question is required';
          }
          continue;
        }
        const val = answers[q.id];
        const missing = val === null || val === undefined || val === '' ||
          (Array.isArray(val) && val.length === 0) ||
          (typeof val === 'object' && !Array.isArray(val) && Object.keys(val as object).length === 0);
        if (q.required && missing) { newErrors[q.id] = 'This question is required'; continue; }
        if (!missing && typeof val === 'string') {
          const minLen = q.settings?.min_length ? Number(q.settings.min_length) : null;
          const maxLen = q.settings?.max_length ? Number(q.settings.max_length) : null;
          const pat    = q.settings?.pattern    ? String(q.settings.pattern)    : null;
          if (minLen && val.length < minLen) { newErrors[q.id] = `Minimum ${minLen} characters required`; continue; }
          if (maxLen && val.length > maxLen) { newErrors[q.id] = `Maximum ${maxLen} characters allowed`; continue; }
          if (pat) { try { if (!new RegExp(pat).test(val)) newErrors[q.id] = `Value does not match required format`; } catch { /* ignore bad pattern */ } }
        }
      }
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        throw new Error('Please answer all required questions');
      }
      setErrors({});

      // Duplicate response detection (same respondent + same survey in last 24h)
      if (currentUser?.id && surveyId) {
        const { data: dupCheck } = await supabase
          .from('survey_responses')
          .select('id')
          .eq('survey_id', surveyId)
          .eq('respondent_id', currentUser.id)
          .gte('submitted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);
        if (dupCheck && dupCheck.length > 0) {
          throw new Error('You have already submitted a response to this survey in the last 24 hours.');
        }
      }

      // Generate ID client-side so anon users don't need SELECT permission after insert
      const responseId = crypto.randomUUID();
      const durationSeconds = Math.round((Date.now() - startTimeRef) / 1000);
      const { error: rErr } = await supabase.from('survey_responses').insert({
        id: responseId,
        survey_id: surveyId,
        respondent_id: currentUser?.id ?? null,
        respondent_name: currentUser?.fullName ?? (respondentName.trim() || null),
        respondent_email: currentUser?.email ?? (respondentEmail.trim() || null),
        duration_seconds: durationSeconds > 0 ? durationSeconds : null,
        form_version: survey?.form_version ?? 1,
      });
      if (rErr) throw rErr;

      const jsonTypes = ['checkbox', 'rating', 'scale', 'image', 'file'];

      // Flatten repeat group rows into individual answer rows
      const repeatAnswerRows: { response_id: string; question_id: string; answer_text: string | null; answer_json: unknown }[] = [];
      for (const [groupId, rows] of Object.entries(repeatRows)) {
        rows.forEach((row, rowIdx) => {
          Object.entries(row).forEach(([qid, val]) => {
            if (val === null || val === undefined || val === '') return;
            repeatAnswerRows.push({
              response_id: responseId,
              question_id: qid,
              answer_text: `[row:${rowIdx}] ${String(val)}`,
              answer_json: null,
            });
          });
        });
      }

      // Grid table rows: stored as answer_json array of row objects
      const gridTableAnswerRows: { response_id: string; question_id: string; answer_text: string | null; answer_json: unknown }[] = [];
      for (const [qid, rows] of Object.entries(gridTableRows)) {
        if (!visibleIds.has(qid)) continue;
        const filledRows = rows.filter(row => Object.values(row).some(v => v !== ''));
        if (filledRows.length === 0) continue;
        gridTableAnswerRows.push({
          response_id: responseId,
          question_id: qid,
          answer_text: null,
          answer_json: filledRows,
        });
      }

      const answerRows = questions
        .filter(q => visibleIds.has(q.id) && !['section_header','begin_group','begin_repeat','grid_table','note'].includes(q.type))
        .map(q => {
          const val = answers[q.id] ?? null;
          const jsonTypes2 = [...jsonTypes, 'likert', 'signature'];
          const isJson = jsonTypes2.includes(q.type);
          return {
            response_id: responseId,
            question_id: q.id,
            answer_text: isJson ? null : (val as string | null),
            answer_json: isJson ? val : null,
          };
        })
        .filter(a => a.answer_text !== null || a.answer_json !== null);

      const allRows = [...answerRows, ...repeatAnswerRows, ...gridTableAnswerRows].filter(a => a.answer_text !== null || a.answer_json !== null);
      if (allRows.length) {
        const { error: aErr } = await supabase.from('survey_answers').insert(allRows);
        if (aErr) throw aErr;
      }
    },
    onSuccess: () => { setSubmitted(true); clearDraft(); },
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

  // Survey settings
  const surveySettings = (survey?.settings ?? {}) as Record<string, unknown>;
  const multiPage      = Boolean(surveySettings.multi_page);
  const showProgress   = surveySettings.show_progress !== false;
  const thankYouMsg    = surveySettings.thank_you_message as string | null | undefined;
  const thankYouMsgAr  = surveySettings.thank_you_message_ar as string | null | undefined;
  const expiresAt      = surveySettings.expires_at ? new Date(String(surveySettings.expires_at)) : null;
  const isFull         = responseLimit > 0 && responseCount >= responseLimit;
  const isExpired      = expiresAt ? new Date() > expiresAt : false;

  // Top-level items (moved up for pages computation)
  const topLevelItems = questions
    .filter(q => (q.group_id ?? null) === null)
    .sort((a, b) => a.order_index - b.order_index);

  // Multi-page computation: split at section_headers
  const pages = useMemo(() => {
    if (!multiPage) return [{ title: null as string | null, titleAr: null as string | null, questions: topLevelItems }];
    const result: { title: string | null; titleAr: string | null; questions: Question[] }[] = [];
    let current: { title: string | null; titleAr: string | null; questions: Question[] } = { title: null, titleAr: null, questions: [] };
    for (const q of topLevelItems) {
      if (q.type === 'section_header') {
        if (current.questions.length > 0 || current.title) result.push(current);
        current = { title: q.label, titleAr: q.label_ar, questions: [] };
      } else {
        current.questions.push(q);
      }
    }
    if (current.questions.length > 0 || current.title) result.push(current);
    return result.length > 0 ? result : [{ title: null, titleAr: null, questions: topLevelItems }];
  }, [topLevelItems, multiPage]);

  const safeCurrentPage = Math.min(currentPage, pages.length - 1);
  const currentPageQuestions = pages[safeCurrentPage]?.questions ?? [];

  const handleNextPage = () => {
    const newErrors: Record<string, string> = {};
    for (const q of currentPageQuestions) {
      if (!visibleIds.has(q.id) || q.required === false || ['section_header','begin_group'].includes(q.type)) continue;
      const val = answers[q.id];
      if (val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) {
        newErrors[q.id] = 'This question is required';
      }
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});
    setCurrentPage(p => p + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  // Password gate — must be checked before status gate
  const fillPassword = (surveySettings as Record<string, unknown>)?.fill_password as string | null | undefined;
  if (fillPassword?.trim() && !fillPasswordUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-lg p-8 space-y-5">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <Lock className="w-6 h-6 text-indigo-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Password Required</h2>
            <p className="text-sm text-slate-500">"{survey.title}" is password-protected. Enter the password to continue.</p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={fillPasswordInput}
              onChange={e => { setFillPasswordInput(e.target.value); setFillPasswordError(false); }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (fillPasswordInput === fillPassword.trim()) { setFillPasswordUnlocked(true); }
                  else { setFillPasswordError(true); setFillPasswordInput(''); }
                }
              }}
              placeholder="Enter password…"
              autoFocus
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            {fillPasswordError && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />Incorrect password. Please try again.
              </p>
            )}
            <button
              onClick={() => {
                if (fillPasswordInput === fillPassword.trim()) { setFillPasswordUnlocked(true); }
                else { setFillPasswordError(true); setFillPasswordInput(''); }
              }}
              className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Unlock Survey
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (survey.status !== 'active') return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white">
      <div className="text-center max-w-sm px-6">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <ClipboardList className="w-8 h-8 text-slate-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">
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

  if (isExpired) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-white">
      <div className="text-center max-w-sm px-6">
        <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-4">
          <ClipboardList className="w-8 h-8 text-orange-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">Survey Expired</h2>
        <p className="text-slate-500 text-sm">
          This survey closed on {expiresAt ? expiresAt.toLocaleDateString() : ''} and is no longer accepting responses.
        </p>
      </div>
    </div>
  );

  if (isFull) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-white">
      <div className="text-center max-w-sm px-6">
        <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-4">
          <ClipboardList className="w-8 h-8 text-violet-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">Survey Full</h2>
        <p className="text-slate-500 text-sm">
          This survey has reached its maximum number of responses and is no longer accepting new submissions.
        </p>
        <p className="text-xs text-slate-400 mt-3">{responseCount} / {responseLimit} responses collected</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-indigo-50">
      <div className="text-center max-w-sm px-6">
        <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-100">
          <CheckCircle2 className="w-12 h-12 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">
          {lang === 'ar'
            ? (thankYouMsgAr ? thankYouMsgAr.split('\n')[0] : 'شكراً لك!')
            : (thankYouMsg  ? thankYouMsg.split('\n')[0]   : 'Thank you!')}
        </h2>
        <p className="text-slate-500 text-sm leading-relaxed">
          {lang === 'ar'
            ? (thankYouMsgAr && thankYouMsgAr.includes('\n')
                ? thankYouMsgAr.split('\n').slice(1).join('\n')
                : `تم تسجيل ردك على "${survey.title_ar || survey.title}".`)
            : (thankYouMsg && thankYouMsg.includes('\n')
                ? thankYouMsg.split('\n').slice(1).join('\n')
                : `Your response to "${survey.title}" has been recorded.`)}
        </p>
        {currentUser && (
          <a href="/surveys" className="mt-6 inline-flex items-center gap-1.5 text-indigo-600 text-sm hover:underline">
            <ChevronLeft className="w-3.5 h-3.5" />Back to Surveys
          </a>
        )}
      </div>
    </div>
  );

  // ── Recursive question renderer ─────────────────────────────────────────────
  const renderQuestion = (q: Question, depth = 0): React.ReactNode => {
    if (!visibleIds.has(q.id)) return null;

    // Repeat group — ODK-style begin_repeat
    if (q.type === 'begin_repeat') {
      const children = questions
        .filter(c => (c.group_id ?? null) === q.id)
        .sort((a, b) => a.order_index - b.order_index);
      if (children.length === 0) return null;
      const rows = repeatRows[q.id] ?? [{}];

      const setRowAnswer = (rowIdx: number, qid: string, val: AnswerValue) => {
        setRepeatRows(prev => {
          const curRows = prev[q.id] ?? [{}];
          const newRows = curRows.map((row, i) => i === rowIdx ? { ...row, [qid]: val } : row);
          return { ...prev, [q.id]: newRows };
        });
      };
      const addRow = () => setRepeatRows(prev => ({ ...prev, [q.id]: [...(prev[q.id] ?? [{}]), {}] }));
      const removeRow = (rowIdx: number) => setRepeatRows(prev => {
        const curRows = prev[q.id] ?? [{}];
        if (curRows.length <= 1) return prev;
        return { ...prev, [q.id]: curRows.filter((_, i) => i !== rowIdx) };
      });

      return (
        <div key={q.id} className="rounded-2xl border-2 border-violet-200 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-violet-50 border-b border-violet-100">
            <RefreshCw className="w-4 h-4 text-violet-500 shrink-0" />
            <p className="text-sm font-semibold text-violet-700 flex-1">
              {lang === 'ar' && q.label_ar ? q.label_ar : q.label}
            </p>
            <span className="text-[10px] text-violet-400 bg-violet-100 px-2 py-0.5 rounded-full">
              {rows.length} row{rows.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-violet-100">
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="p-4 bg-white/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide">Row {rowIdx + 1}</span>
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(rowIdx)} className="text-[10px] text-red-400 hover:text-red-600 flex items-center gap-0.5">
                      <X className="w-3 h-3" />Remove
                    </button>
                  )}
                </div>
                {children.map(child => {
                  const rowVal = row[child.id] ?? null;
                  return (
                    <div key={child.id} className="space-y-1">
                      <p className="text-xs font-medium text-slate-700">
                        {lang === 'ar' && child.label_ar ? child.label_ar : child.label}
                        {child.required && <span className="text-red-400 ml-0.5">*</span>}
                      </p>
                      {(child.type === 'text' || child.type === 'barcode' || child.type === 'phone' || child.type === 'email') && (
                        <Input value={String(rowVal ?? '')} onChange={e => setRowAnswer(rowIdx, child.id, e.target.value)} className="h-8 text-sm" />
                      )}
                      {child.type === 'textarea' && (
                        <Textarea value={String(rowVal ?? '')} onChange={e => setRowAnswer(rowIdx, child.id, e.target.value)} rows={2} />
                      )}
                      {(child.type === 'number' || child.type === 'integer') && (
                        <Input type="number" value={String(rowVal ?? '')} onChange={e => setRowAnswer(rowIdx, child.id, e.target.value)} className="h-8 text-sm" />
                      )}
                      {child.type === 'date' && (
                        <Input type="date" value={String(rowVal ?? '')} onChange={e => setRowAnswer(rowIdx, child.id, e.target.value)} className="h-8 text-sm" />
                      )}
                      {['radio','dropdown'].includes(child.type) && (
                        <Select value={String(rowVal ?? '')} onValueChange={v => setRowAnswer(rowIdx, child.id, v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            {(child.options ?? []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-violet-50/50 border-t border-violet-100">
            <button onClick={addRow} className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors">
              <Plus className="w-3.5 h-3.5" />Add Another Row
            </button>
          </div>
        </div>
      );
    }

    // Grid / Table question
    if (q.type === 'grid_table') {
      type GridCol = { id: string; label: string; type: 'text' | 'number' | 'date' | 'dropdown'; options?: string[] };
      const cols = (q.settings?.grid_columns as GridCol[] | undefined) ?? [];
      if (cols.length === 0) return null;
      const minRows = Number(q.settings?.min_rows ?? 1);
      const maxRows = Number(q.settings?.max_rows ?? 10);
      const rows = gridTableRows[q.id] ?? Array.from({ length: Math.max(minRows, 1) }, () => ({}));

      const setCell = (rowIdx: number, colId: string, val: string) => {
        setGridTableRows(prev => {
          const cur = prev[q.id] ?? Array.from({ length: Math.max(minRows, 1) }, () => ({}));
          const next = cur.map((row, i) => i === rowIdx ? { ...row, [colId]: val } : row);
          return { ...prev, [q.id]: next };
        });
        setErrors(prev => { const n = { ...prev }; delete n[q.id]; return n; });
      };
      const addRow = () => {
        if (rows.length >= maxRows) return;
        setGridTableRows(prev => ({ ...prev, [q.id]: [...(prev[q.id] ?? [{}]), {}] }));
      };
      const removeRow = (rowIdx: number) => {
        setGridTableRows(prev => {
          const cur = prev[q.id] ?? [{}];
          if (cur.length <= Math.max(minRows, 1)) return prev;
          return { ...prev, [q.id]: cur.filter((_, i) => i !== rowIdx) };
        });
      };

      const err = errors[q.id];
      return (
        <div key={q.id} className="space-y-2">
          <div className="flex items-start gap-2">
            <Table2 className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">
                {lang === 'ar' && q.label_ar ? q.label_ar : q.label}
                {q.required && <span className="text-red-400 ml-1">*</span>}
              </p>
              {(q.description || q.description_ar) && (
                <div className="mt-0.5 space-y-0.5">
                  {q.description && (
                    <p className="text-xs text-slate-500 italic leading-relaxed">{q.description}</p>
                  )}
                  {q.description_ar && (
                    <p className="text-xs text-slate-500 italic leading-relaxed text-right" dir="rtl">{q.description_ar}</p>
                  )}
                </div>
              )}
            </div>
          </div>
          {err && <p className="text-xs text-red-500 pl-6">{err}</p>}
          <div className="overflow-x-auto rounded-xl border border-teal-200">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-teal-50">
                  <th className="px-2 py-2 text-left text-[10px] font-bold text-teal-600 uppercase tracking-wide border-b border-teal-200 w-8">#</th>
                  {cols.map(col => (
                    <th key={col.id} className="px-3 py-2 text-left text-[10px] font-bold text-teal-700 uppercase tracking-wide border-b border-teal-200 whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                  {rows.length > Math.max(minRows, 1) && (
                    <th className="w-8 border-b border-teal-200 bg-teal-50" />
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <td className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-400 border-b border-slate-100">
                      {rowIdx + 1}
                    </td>
                    {cols.map(col => {
                      const cellVal = row[col.id] ?? '';
                      return (
                        <td key={col.id} className="px-1.5 py-1 border-b border-slate-100 min-w-[100px]">
                          {col.type === 'dropdown' ? (
                            <Select value={cellVal} onValueChange={v => setCell(rowIdx, col.id, v)}>
                              <SelectTrigger className="h-7 text-xs border-0 shadow-none bg-transparent focus:ring-1 focus:ring-teal-300">
                                <SelectValue placeholder="Select…" />
                              </SelectTrigger>
                              <SelectContent>
                                {(col.options ?? []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <input
                              type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                              value={cellVal}
                              onChange={e => setCell(rowIdx, col.id, e.target.value)}
                              className="w-full h-7 px-2 text-xs rounded border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-teal-300 focus:bg-white transition-colors"
                              placeholder={col.type === 'date' ? '' : '—'}
                            />
                          )}
                        </td>
                      );
                    })}
                    {rows.length > Math.max(minRows, 1) && (
                      <td className="px-1 py-1 border-b border-slate-100">
                        <button
                          onClick={() => removeRow(rowIdx)}
                          className="p-1 text-slate-300 hover:text-red-400 transition-colors"
                          title="Remove row"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length < maxRows && (
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-800 transition-colors pl-1"
            >
              <Plus className="w-3.5 h-3.5" />Add Row
            </button>
          )}
        </div>
      );
    }

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
              {(q.description || q.description_ar) && (
                <div className="mt-0.5 space-y-0.5">
                  {q.description && (
                    <p className="text-xs text-slate-400 italic leading-relaxed">{q.description}</p>
                  )}
                  {q.description_ar && (
                    <p className="text-xs text-slate-400 italic leading-relaxed text-right" dir="rtl">{q.description_ar}</p>
                  )}
                </div>
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

    // Note / Text Block — read-only informational display
    if (q.type === 'note') {
      return (
        <div key={q.id} className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-sky-800 leading-snug">
              {lang === 'ar' && q.label_ar ? q.label_ar : q.label}
            </p>
            {(q.description || q.description_ar) && (
              <div className="space-y-0.5">
                {q.description && <p className="text-xs text-sky-700 leading-relaxed">{q.description}</p>}
                {q.description_ar && <p className="text-xs text-sky-700 leading-relaxed text-right" dir="rtl">{q.description_ar}</p>}
              </div>
            )}
          </div>
        </div>
      );
    }

    // Acknowledgement — respondent must check a box to confirm
    if (q.type === 'acknowledge') {
      const checked = answers[q.id] === 'true';
      const err = errors[q.id];
      return (
        <div key={q.id} className={cn('bg-white rounded-2xl border p-5 space-y-3 transition-colors', err ? 'border-red-300' : 'border-amber-200')} data-testid={`question-${q.id}`}>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-1">
            <p className="text-sm font-semibold text-amber-900 leading-snug">
              {lang === 'ar' && q.label_ar ? q.label_ar : q.label}
              {q.required && <span className="text-red-500 ml-1">*</span>}
            </p>
            {(q.description || q.description_ar) && (
              <div className="space-y-0.5">
                {q.description && <p className="text-xs text-amber-700 leading-relaxed">{q.description}</p>}
                {q.description_ar && <p className="text-xs text-amber-700 leading-relaxed text-right" dir="rtl">{q.description_ar}</p>}
              </div>
            )}
          </div>
          <label className="flex items-start gap-3 cursor-pointer select-none group">
            <div className={cn(
              'mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
              checked ? 'bg-amber-500 border-amber-500' : 'border-slate-300 group-hover:border-amber-400'
            )}>
              {checked && <Check className="w-3 h-3 text-white" />}
            </div>
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              onChange={e => setAnswer(q.id, String(e.target.checked))}
              data-testid={`acknowledge-${q.id}`}
            />
            <span className="text-sm text-slate-700 font-medium leading-snug">
              {lang === 'ar' ? 'أقر بالاطلاع على ما سبق وأوافق عليه' : 'I have read and acknowledge the above'}
            </span>
          </label>
          {err && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{err}</p>}
        </div>
      );
    }

    // Regular question
    const err = errors[q.id];
    const slQ = q.settings?.skip_logic as SkipLogic | undefined;
    const hasSkip = !!(slQ?.condition_question_id || (slQ?.conditions && slQ.conditions.length > 0));

    // Conditional options: filter options based on prior answers
    type CondOptRule = { option: string; depends_on: string; depends_value: string };
    const condOptRules = (q.settings?.conditional_options as CondOptRule[] | undefined) ?? [];
    const filteredOptions = (q.options ?? []).filter((opt) => {
      const rule = condOptRules.find(r => r.option === opt);
      if (!rule) return true;
      const triggerVal = answers[rule.depends_on];
      const tv = Array.isArray(triggerVal) ? triggerVal : [String(triggerVal ?? '')];
      return tv.includes(rule.depends_value);
    });

    const rawLabel = lang === 'ar' && q.label_ar ? q.label_ar : q.label;
    const displayLabel = pipeLabel(rawLabel, questions, answers);

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
                {displayLabel}
              </p>
              {q.required && <span className="text-red-500 text-sm leading-none shrink-0 mt-0.5">*</span>}
            </div>
            {hasSkip && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-600 shrink-0 ml-2">
                <GitBranch className="w-2.5 h-2.5" />{lang === 'ar' ? 'مشروط' : 'conditional'}
              </span>
            )}
          </div>
          {(q.description || q.description_ar) && (
            <div className="mt-1 space-y-0.5">
              {q.description && (
                <p className="text-xs text-slate-500 italic leading-relaxed">{q.description}</p>
              )}
              {q.description_ar && (
                <p className="text-xs text-slate-500 italic leading-relaxed text-right" dir="rtl">{q.description_ar}</p>
              )}
            </div>
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
            {filteredOptions.map((opt) => {
              const i = (q.options ?? []).indexOf(opt);
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
            {filteredOptions.map((opt) => {
              const i = (q.options ?? []).indexOf(opt);
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
              {filteredOptions.map((opt) => {
                const i = (q.options ?? []).indexOf(opt);
                const displayOpt = lang === 'ar' && q.options_ar?.[i] ? q.options_ar[i] : opt;
                return <SelectItem key={opt} value={opt}>{displayOpt}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        )}

        {q.type === 'likert' && (() => {
          const rows = (q.settings?.likert_rows as string[] | undefined) ?? ['Row 1', 'Row 2', 'Row 3'];
          const cols = (q.settings?.likert_cols as string[] | undefined) ?? ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
          const val = (answers[q.id] as Record<string, string>) ?? {};
          return (
            <div className="overflow-x-auto rounded-xl border border-indigo-100">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-indigo-50">
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-indigo-600 uppercase tracking-wide border-b border-indigo-100 min-w-[120px]" />
                    {cols.map(col => (
                      <th key={col} className="px-2 py-2 text-center text-[10px] font-semibold text-indigo-700 border-b border-indigo-100 min-w-[80px] whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={row} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                      <td className="px-3 py-2.5 text-xs font-medium text-slate-700 border-b border-slate-100">{row}</td>
                      {cols.map(col => (
                        <td key={col} className="px-2 py-2.5 text-center border-b border-slate-100">
                          <input
                            type="radio"
                            name={`likert-${q.id}-${row}`}
                            checked={val[row] === col}
                            onChange={() => setAnswer(q.id, { ...val, [row]: col })}
                            className="accent-indigo-600 w-4 h-4"
                            data-testid={`likert-${q.id}-${ri}-${col}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

        {q.type === 'signature' && (
          <SignaturePad value={(answers[q.id] as string) ?? null} onChange={v => setAnswer(q.id, v)} />
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

        {q.type === 'calculate' && (() => {
          const formula = String(q.settings?.formula ?? '');
          const computed = formula ? evaluateFormula(formula, questions, answers) : '';
          // Keep computed value in sync
          if (computed !== '' && answers[q.id] !== computed) {
            setTimeout(() => setAnswer(q.id, computed), 0);
          }
          return (
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2.5">
              <FunctionSquare className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="text-sm font-mono text-indigo-700 flex-1">{computed || <span className="text-slate-300 italic">—</span>}</span>
              <span className="text-[10px] text-slate-400">auto-calculated</span>
            </div>
          );
        })()}

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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <ClipboardList className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">
              {lang === 'ar' && survey.title_ar ? survey.title_ar : survey.title}
            </p>
            {showProgress && requiredVisible.length > 0 && (
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{progress}%</span>
              </div>
            )}
          </div>
          {/* Page indicator for multi-page */}
          {multiPage && pages.length > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              {pages.map((_, i) => (
                <span key={i} className={cn(
                  'w-2 h-2 rounded-full transition-colors',
                  i === safeCurrentPage ? 'bg-indigo-600' : i < safeCurrentPage ? 'bg-emerald-500' : 'bg-slate-200',
                )} />
              ))}
            </div>
          )}
          {/* Language toggle */}
          {(survey.title_ar || survey.description_ar) && (
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden shrink-0">
              <button onClick={() => setLang('en')} data-testid="btn-lang-en"
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${lang === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >EN</button>
              <button onClick={() => setLang('ar')} data-testid="btn-lang-ar"
                className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-slate-200 ${lang === 'ar' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >عربي</button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>

        {/* Page title header (multi-page) */}
        {multiPage && pages.length > 1 && pages[safeCurrentPage].title && (
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-indigo-600">{safeCurrentPage + 1}</span>
            </div>
            <div>
              <p className="font-bold text-slate-800">
                {lang === 'ar' && pages[safeCurrentPage].titleAr
                  ? pages[safeCurrentPage].titleAr
                  : pages[safeCurrentPage].title}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {lang === 'ar' ? `صفحة ${safeCurrentPage + 1} من ${pages.length}` : `Page ${safeCurrentPage + 1} of ${pages.length}`}
              </p>
            </div>
          </div>
        )}

        {/* Description — only on first page */}
        {(safeCurrentPage === 0) && (lang === 'ar' ? (survey.description_ar || survey.description) : survey.description) && (
          <div className="bg-white rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-5">
            <p className="text-slate-700 text-sm leading-relaxed">
              {lang === 'ar' ? (survey.description_ar || survey.description) : survey.description}
            </p>
          </div>
        )}

        {/* Draft restore banner */}
        {hasDraft && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <Save className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800">You have a saved draft</p>
              <p className="text-[11px] text-amber-600">You started filling this survey before — restore your progress?</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={loadDraft} className="text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors">
                Restore
              </button>
              <button onClick={clearDraft} className="text-xs text-amber-500 hover:text-amber-700 px-2 py-1.5 rounded-lg transition-colors">
                Discard
              </button>
            </div>
          </div>
        )}

        {/* About You — respondent info capture, first page only */}
        {safeCurrentPage === 0 && (
          currentUser ? (
            <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-indigo-200 flex items-center justify-center shrink-0 text-indigo-800 text-xs font-bold">
                {(currentUser.fullName || currentUser.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-indigo-800 truncate">
                  {currentUser.fullName ?? currentUser.email}
                </p>
                {currentUser.fullName && currentUser.email && (
                  <p className="text-[11px] text-indigo-500 truncate">{currentUser.email}</p>
                )}
              </div>
              <span className="text-[10px] font-medium bg-indigo-200 text-indigo-700 rounded-full px-2 py-0.5 shrink-0">
                {lang === 'ar' ? 'تقديم بوصفك' : 'Submitting as'}
              </span>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
                  <svg className="w-3 h-3 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <span className="text-xs font-semibold text-slate-600">
                  {lang === 'ar' ? 'معلوماتك (اختياري)' : 'Your information (optional)'}
                </span>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {lang === 'ar' ? 'الاسم الكامل' : 'Full name'}
                  </label>
                  <input
                    type="text"
                    value={respondentName}
                    onChange={e => setRespondentName(e.target.value)}
                    placeholder={lang === 'ar' ? 'أدخل اسمك' : 'Enter your name'}
                    className="w-full h-9 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"
                    data-testid="input-respondent-name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {lang === 'ar' ? 'البريد الإلكتروني' : 'Email address'}
                  </label>
                  <input
                    type="email"
                    value={respondentEmail}
                    onChange={e => setRespondentEmail(e.target.value)}
                    placeholder={lang === 'ar' ? 'أدخل بريدك الإلكتروني' : 'Enter your email'}
                    className="w-full h-9 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"
                    data-testid="input-respondent-email"
                  />
                </div>
              </div>
            </div>
          )
        )}

        {/* Response limit banner */}
        {responseLimit > 0 && responseCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
            <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.min((responseCount / responseLimit) * 100, 100)}%` }} />
            </div>
            <span className="shrink-0">{responseCount}/{responseLimit} responses</span>
          </div>
        )}

        {/* Questions for current page */}
        {currentPageQuestions.map(q => renderQuestion(q, 0))}

        {/* Navigation / Submit */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          {Object.keys(errors).length > 0 && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {lang === 'ar' ? 'يرجى الإجابة على جميع الأسئلة المطلوبة.' : 'Please answer all required questions before continuing.'}
            </div>
          )}

          {multiPage && pages.length > 1 ? (
            <div className="flex items-center gap-3">
              {safeCurrentPage > 0 && (
                <Button variant="outline" onClick={() => { setCurrentPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex-1 gap-2">
                  <ChevronLeft className="w-4 h-4" />{lang === 'ar' ? 'السابق' : 'Previous'}
                </Button>
              )}
              {safeCurrentPage < pages.length - 1 ? (
                <Button onClick={handleNextPage} className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="btn-next-page">
                  {lang === 'ar' ? 'التالي' : 'Next'}<ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
                  className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="btn-submit-survey">
                  {submitMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />{lang === 'ar' ? 'جارٍ الإرسال…' : 'Submitting…'}</>
                    : <><CheckCircle2 className="w-4 h-4" />{lang === 'ar' ? 'إرسال الردود' : 'Submit Response'}</>}
                </Button>
              )}
            </div>
          ) : (
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
              className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="btn-submit-survey">
              {submitMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" />{lang === 'ar' ? 'جارٍ الإرسال…' : 'Submitting…'}</>
                : <><ChevronRight className="w-4 h-4" />{lang === 'ar' ? 'إرسال الردود' : 'Submit Response'}</>}
            </Button>
          )}

          {visibleNonStructural.length > 0 && (
            <p className="text-center text-[11px] text-slate-400">
              {answeredRequired.length} of {visibleNonStructural.length} question{visibleNonStructural.length !== 1 ? 's' : ''} answered
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
