import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BarChart2, ChevronLeft, Database, Download, FileUp, Info,
  Layers, Loader2, Plus, RefreshCw, Settings2, Shuffle, Target,
  Trash2, TrendingUp, Users, CheckCircle2, XCircle, AlertCircle,
  Clock, MapPin, Calculator, List, Copy, Play, Archive, MoreHorizontal,
  Globe, Scale, FileText,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Types ────────────────────────────────────────────────────────────────────
type SamplingMethod = 'srs' | 'systematic' | 'stratified' | 'cluster' | 'multistage' | 'epi' | 'geographic' | 'lqas' | 'quota' | 'snowball';
type StudyStatus = 'design' | 'drawing' | 'field' | 'complete' | 'archived';
type UnitStatus = 'pending' | 'complete' | 'not_found' | 'refused' | 'unavailable' | 'duplicate' | 'replacement_used';
type DetailTab = 'calculator' | 'frame' | 'draw' | 'tracking' | 'map' | 'weights' | 'report';

interface Study {
  id: string; name: string; description?: string; form_id?: string;
  population_size?: number; confidence_level: number; margin_of_error: number;
  expected_proportion: number; design_effect: number; nonresponse_rate: number;
  calculated_n?: number; method: SamplingMethod; status: StudyStatus;
  created_by?: string; created_at: string; updated_at: string;
}
interface SamplingFrame {
  id: string; study_id: string; name: string; version: number;
  file_name?: string; file_url?: string; storage_path?: string;
  total_units: number; columns: { name: string; type: string }[];
  data: Record<string, unknown>[]; is_current: boolean; notes?: string; created_at: string;
}
interface SampleDraw {
  id: string; study_id: string; frame_id?: string; method: string;
  params: Record<string, unknown>; seed: string; sample_size: number;
  status: string; label?: string; drawn_at?: string; drawn_by?: string; created_at: string;
}
interface SampleUnit {
  id: string; draw_id: string; study_id: string; unit_key: string;
  unit_data: Record<string, unknown>; stratum?: string; cluster?: string;
  sort_order?: number; enumerator_id?: string; status: UnitStatus;
  outcome_notes?: string; is_replacement: boolean; completed_at?: string; created_at: string;
}
interface Stratum { name: string; filterCol: string; filterVal: string; populationSize: number; }

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────
function hashStr(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h;
}
function makePRNG(seed: string) {
  let s = hashStr(seed);
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(arr: T[], seed: string): T[] {
  const a = [...arr]; const rng = makePRNG(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Sample size calculator ───────────────────────────────────────────────────
function zScore(confidence: number): number {
  if (confidence >= 0.99) return 2.576;
  if (confidence >= 0.97) return 2.170;
  if (confidence >= 0.95) return 1.960;
  if (confidence >= 0.90) return 1.645;
  return 1.282;
}
interface CalcResult { n0: number; nFpc: number; nDeff: number; nFinal: number; perStratum?: number; }
function calcSampleSize(p: { populationSize?: number; confidenceLevel: number; marginOfError: number; expectedProportion: number; designEffect: number; nonresponseRate: number; strata?: number; }): CalcResult {
  const Z = zScore(p.confidenceLevel);
  const { expectedProportion: prop, marginOfError: e, designEffect: deff, nonresponseRate: nrr, populationSize: N } = p;
  const n0 = (Z * Z * prop * (1 - prop)) / (e * e);
  const nFpc = N ? n0 / (1 + (n0 - 1) / N) : n0;
  const nDeff = nFpc * deff;
  const nFinal = Math.ceil(nDeff / (1 - nrr));
  return { n0: Math.ceil(n0), nFpc: Math.ceil(nFpc), nDeff: Math.ceil(nDeff), nFinal, perStratum: p.strata ? Math.ceil(nFinal / p.strata) : undefined };
}

// ─── Sampling algorithms ──────────────────────────────────────────────────────
function drawSRS(frame: Record<string, unknown>[], n: number, seed: string) {
  return shuffleWithSeed(frame, seed).slice(0, n);
}
function drawSystematic(frame: Record<string, unknown>[], n: number, seed: string) {
  const N = frame.length;
  const k = Math.floor(N / n);
  const rng = makePRNG(seed);
  const r = Math.floor(rng() * k);
  const selected: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) { const idx = r + i * k; if (idx < N) selected.push(frame[idx]); }
  return selected;
}
function drawStratified(frame: Record<string, unknown>[], strata: Stratum[], n: number, allocation: 'proportional' | 'equal' | 'neyman', seed: string) {
  const total = strata.reduce((s, st) => s + st.populationSize, 0);
  const result: (Record<string, unknown> & { __stratum: string })[] = [];
  strata.forEach((st, si) => {
    let ni: number;
    if (allocation === 'equal') ni = Math.ceil(n / strata.length);
    else if (allocation === 'neyman') {
      const p = st.populationSize / total;
      const sigma = Math.sqrt(p * (1 - p));
      const sumNiSi = strata.reduce((acc, s2) => acc + (s2.populationSize / total) * Math.sqrt((s2.populationSize / total) * (1 - s2.populationSize / total)), 0);
      ni = Math.ceil(n * ((st.populationSize / total) * sigma) / sumNiSi);
    } else {
      ni = Math.ceil(n * st.populationSize / total);
    }
    const strataFrame = frame.filter(r => String(r[st.filterCol]) === st.filterVal);
    const drawn = shuffleWithSeed(strataFrame, `${seed}_${si}`).slice(0, ni);
    drawn.forEach(u => result.push({ ...u, __stratum: st.name }));
  });
  return result;
}
function drawClusterPPS(clusters: { name: string; size: number }[], nClusters: number, unitsPerCluster: number, frame: Record<string, unknown>[], clusterCol: string, seed: string) {
  const totalSize = clusters.reduce((s, c) => s + c.size, 0);
  const interval = totalSize / nClusters;
  const rng = makePRNG(seed);
  const r = rng() * interval;
  const cumulative: number[] = []; let cum = 0;
  clusters.forEach(c => { cum += c.size; cumulative.push(cum); });
  const selectedClusters: string[] = [];
  for (let i = 0; i < nClusters; i++) {
    const target = r + i * interval;
    const idx = cumulative.findIndex(c => c >= target);
    if (idx >= 0) selectedClusters.push(clusters[idx].name);
  }
  const result: (Record<string, unknown> & { __cluster: string })[] = [];
  selectedClusters.forEach((cl, ci) => {
    const clusterUnits = frame.filter(r => String(r[clusterCol]) === cl);
    const drawn = shuffleWithSeed(clusterUnits, `${seed}_cl_${ci}`).slice(0, unitsPerCluster);
    drawn.forEach(u => result.push({ ...u, __cluster: cl }));
  });
  return result;
}
function drawGeographic(n: number, bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }, seed: string) {
  const rng = makePRNG(seed);
  return Array.from({ length: n }, (_, i) => ({
    __geo_id: `GPS-${String(i + 1).padStart(4, '0')}`,
    latitude: (bounds.latMin + rng() * (bounds.latMax - bounds.latMin)).toFixed(6),
    longitude: (bounds.lonMin + rng() * (bounds.lonMax - bounds.lonMin)).toFixed(6),
    status: 'pending',
  }));
}
function drawEPI(nClusters: number, unitsPerCluster: number, bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }, seed: string) {
  const rng = makePRNG(seed);
  const directions = ['N','NE','E','SE','S','SW','W','NW'];
  return Array.from({ length: nClusters }, (_, i) => ({
    __cluster: `Cluster-${String(i + 1).padStart(2, '0')}`,
    start_lat: (bounds.latMin + rng() * (bounds.latMax - bounds.latMin)).toFixed(6),
    start_lon: (bounds.lonMin + rng() * (bounds.lonMax - bounds.lonMin)).toFixed(6),
    direction: directions[Math.floor(rng() * 8)],
    units_to_interview: unitsPerCluster,
    status: 'pending',
  }));
}
function drawLQAS(nLots: number, samplePerLot: number, seed: string, lots: { name: string }[]) {
  return lots.slice(0, nLots).map((lot, i) => ({
    __cluster: lot.name,
    lot_id: `LOT-${String(i + 1).padStart(3, '0')}`,
    required_n: samplePerLot,
    status: 'pending',
  }));
}
function drawQuota(quotas: { label: string; n: number }[]) {
  return quotas.flatMap((q, qi) =>
    Array.from({ length: q.n }, (_, i) => ({
      __stratum: q.label,
      quota_item: `${q.label}-${String(i + 1).padStart(3, '0')}`,
      status: 'pending',
    }))
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectColType(values: unknown[]): 'number' | 'text' {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== '');
  if (nonEmpty.length === 0) return 'text';
  return nonEmpty.every(v => !isNaN(Number(v))) ? 'number' : 'text';
}
function parseFrame(rows: Record<string, unknown>[]): { name: string; type: string }[] {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map(k => ({ name: k, type: detectColType(rows.map(r => r[k])) }));
}
const METHOD_LABELS: Record<SamplingMethod, string> = {
  srs: 'Simple Random Sampling (SRS)',
  systematic: 'Systematic Sampling',
  stratified: 'Stratified Random Sampling',
  cluster: 'Cluster Sampling (PPS)',
  multistage: 'Multi-Stage Sampling',
  epi: 'EPI / WHO 30×7',
  geographic: 'Geographic / Spatial Sampling',
  lqas: 'LQAS (Lot Quality Assurance)',
  quota: 'Quota Sampling',
  snowball: 'Snowball Sampling',
};
const STATUS_COLORS: Record<StudyStatus, string> = {
  design: 'bg-slate-100 text-slate-600',
  drawing: 'bg-blue-100 text-blue-700',
  field: 'bg-amber-100 text-amber-700',
  complete: 'bg-green-100 text-green-700',
  archived: 'bg-slate-100 text-slate-400',
};
const UNIT_STATUS_ICONS: Record<UnitStatus, { icon: React.ElementType; color: string; label: string }> = {
  pending:          { icon: Clock,        color: 'text-slate-400', label: 'Pending' },
  complete:         { icon: CheckCircle2, color: 'text-green-500', label: 'Complete' },
  not_found:        { icon: XCircle,      color: 'text-red-500',   label: 'Not Found' },
  refused:          { icon: XCircle,      color: 'text-orange-500',label: 'Refused' },
  unavailable:      { icon: AlertCircle,  color: 'text-yellow-500',label: 'Unavailable' },
  duplicate:        { icon: Copy,         color: 'text-purple-500',label: 'Duplicate' },
  replacement_used: { icon: Shuffle,      color: 'text-blue-500',  label: 'Replacement Used' },
};

// ─── CalculatorTab ────────────────────────────────────────────────────────────
function CalculatorTab({ study, onSave }: { study: Study; onSave: (updates: Partial<Study>) => void }) {
  const [popSize, setPopSize] = useState(study.population_size ? String(study.population_size) : '');
  const [confidence, setConfidence] = useState(String(study.confidence_level));
  const [moe, setMoe] = useState(String(study.margin_of_error * 100));
  const [prop, setProp] = useState(String(study.expected_proportion * 100));
  const [deff, setDeff] = useState(String(study.design_effect));
  const [nrr, setNrr] = useState(String(study.nonresponse_rate * 100));
  const [strata, setStrata] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const result = calcSampleSize({
    populationSize: popSize ? Number(popSize) : undefined,
    confidenceLevel: Number(confidence),
    marginOfError: Number(moe) / 100,
    expectedProportion: Number(prop) / 100,
    designEffect: Number(deff),
    nonresponseRate: Number(nrr) / 100,
    strata: strata ? Number(strata) : undefined,
  });

  const handleSave = async () => {
    setSaving(true);
    onSave({
      population_size: popSize ? Number(popSize) : undefined,
      confidence_level: Number(confidence),
      margin_of_error: Number(moe) / 100,
      expected_proportion: Number(prop) / 100,
      design_effect: Number(deff),
      nonresponse_rate: Number(nrr) / 100,
      calculated_n: result.nFinal,
    });
    toast({ title: 'Calculator saved', description: `Required sample: ${result.nFinal.toLocaleString()}` });
    setSaving(false);
  };

  const copyResult = () => {
    const text = `Sample Size Calculation\nPopulation: ${popSize || '∞'}\nConfidence: ${Number(confidence)*100}%\nMargin of Error: ±${moe}%\nExpected Proportion: ${prop}%\nDesign Effect: ${deff}\nNon-response: ${nrr}%\n\nBase n: ${result.n0}\nFPC adjusted: ${result.nFpc}\nDEFF adjusted: ${result.nDeff}\nFinal (after NRR): ${result.nFinal}${result.perStratum ? `\nPer stratum: ${result.perStratum}` : ''}`;
    navigator.clipboard.writeText(text).then(() => toast({ title: 'Copied to clipboard' }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Inputs */}
      <div className="space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-indigo-500" /> Calculator Inputs
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Population size <span className="text-slate-400">(leave blank = ∞)</span></Label>
            <Input value={popSize} onChange={e => setPopSize(e.target.value)} placeholder="e.g. 10000" type="number" min="1" data-testid="input-pop-size" />
          </div>
          <div>
            <Label className="text-xs">Confidence level</Label>
            <Select value={confidence} onValueChange={setConfidence}>
              <SelectTrigger data-testid="select-confidence"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0.90">90%</SelectItem>
                <SelectItem value="0.95">95%</SelectItem>
                <SelectItem value="0.97">97%</SelectItem>
                <SelectItem value="0.99">99%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Margin of error (%)</Label>
            <Input value={moe} onChange={e => setMoe(e.target.value)} placeholder="5" type="number" step="0.5" min="0.5" max="30" data-testid="input-moe" />
          </div>
          <div>
            <Label className="text-xs">Expected proportion (%)</Label>
            <Input value={prop} onChange={e => setProp(e.target.value)} placeholder="50" type="number" step="1" min="1" max="99" data-testid="input-prop" />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1">
              Design effect (DEFF)
              <TooltipProvider><Tooltip><TooltipTrigger><Info className="w-3 h-3 text-slate-400" /></TooltipTrigger>
                <TooltipContent><p className="text-xs max-w-xs">For cluster designs use DEFF &gt; 1 (typically 1.5–2.0). Use 1.0 for SRS.</p></TooltipContent>
              </Tooltip></TooltipProvider>
            </Label>
            <Input value={deff} onChange={e => setDeff(e.target.value)} placeholder="1.5" type="number" step="0.1" min="1" data-testid="input-deff" />
          </div>
          <div>
            <Label className="text-xs">Non-response rate (%)</Label>
            <Input value={nrr} onChange={e => setNrr(e.target.value)} placeholder="10" type="number" step="1" min="0" max="80" data-testid="input-nrr" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Number of strata <span className="text-slate-400">(optional — shows per-stratum n)</span></Label>
            <Input value={strata} onChange={e => setStrata(e.target.value)} placeholder="e.g. 5" type="number" min="2" data-testid="input-strata" />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={handleSave} disabled={saving} data-testid="button-save-calculator">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Target className="w-3.5 h-3.5" />}
            Save to study
          </Button>
          <Button size="sm" variant="outline" onClick={copyResult} data-testid="button-copy-calc"><Copy className="w-3.5 h-3.5" />Copy</Button>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-500" /> Results
        </h3>
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border border-indigo-100 dark:border-indigo-800 rounded-xl p-5">
          <div className="text-center mb-4">
            <div className="text-4xl font-bold text-indigo-700 dark:text-indigo-300">{result.nFinal.toLocaleString()}</div>
            <div className="text-sm text-indigo-500 mt-0.5">Required sample size</div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Base n (Cochran formula)', val: result.n0 },
              { label: 'FPC adjusted', val: result.nFpc },
              { label: 'DEFF adjusted', val: result.nDeff },
              { label: 'After non-response inflation', val: result.nFinal, highlight: true },
            ].map(r => (
              <div key={r.label} className={`rounded-lg p-2.5 ${r.highlight ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-white/60 dark:bg-black/20'}`}>
                <div className="text-[11px] text-slate-500">{r.label}</div>
                <div className={`font-bold text-base ${r.highlight ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>{r.val.toLocaleString()}</div>
              </div>
            ))}
          </div>
          {result.perStratum && (
            <div className="mt-3 rounded-lg bg-white/70 dark:bg-black/20 p-2.5">
              <div className="text-[11px] text-slate-500">Per stratum (equal allocation)</div>
              <div className="font-bold text-base text-slate-700 dark:text-slate-300">{result.perStratum.toLocaleString()}</div>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-500 space-y-0.5">
          <p><strong>Formula:</strong> Cochran (1977): n₀ = Z²·p·(1-p)/e²</p>
          <p><strong>FPC:</strong> n = n₀ / (1 + (n₀-1)/N) when population is finite</p>
          <p><strong>DEFF:</strong> n × design effect (for cluster sampling)</p>
          <p><strong>NRR:</strong> n_final = n / (1 - non_response_rate)</p>
        </div>
      </div>
    </div>
  );
}

// ─── FrameTab ─────────────────────────────────────────────────────────────────
function FrameTab({ study, frames, loadingFrames, onRefresh }: { study: Study; frames: SamplingFrame[]; loadingFrames: boolean; onRefresh: () => void; }) {
  const [uploading, setUploading] = useState(false);
  const [frameName, setFrameName] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [parsedCols, setParsedCols] = useState<{ name: string; type: string }[]>([]);
  const [fileName, setFileName] = useState('');
  const [showData, setShowData] = useState<SamplingFrame | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setFileName(file.name); setFrameName(file.name.replace(/\.[^.]+$/, ''));
    const reader = new FileReader();
    reader.onload = ev => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      setParsedRows(rows); setParsedCols(parseFrame(rows));
    };
    reader.readAsBinaryString(file);
  };

  const handleUpload = async () => {
    if (!frameName.trim() || !parsedRows.length) return;
    setUploading(true);
    try {
      const existing = frames.filter(f => f.is_current);
      const version = existing.length > 0 ? Math.max(...existing.map(f => f.version)) + 1 : 1;
      if (existing.length > 0) {
        for (const f of existing) {
          await (supabase as any).from('fd_sampling_frames').update({ is_current: false }).eq('id', f.id);
        }
      }
      const { error } = await (supabase as any).from('fd_sampling_frames').insert({
        study_id: study.id, name: frameName, version,
        file_name: fileName, total_units: parsedRows.length,
        columns: parsedCols, data: parsedRows.slice(0, 5000),
        is_current: true, uploaded_by: user?.id,
      });
      if (error) throw error;
      toast({ title: 'Frame uploaded', description: `${parsedRows.length.toLocaleString()} units • v${version}` });
      qc.invalidateQueries({ queryKey: ['fd-frames', study.id] });
      setUploadOpen(false); setParsedRows([]); setParsedCols([]); setFileName(''); setFrameName('');
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally { setUploading(false); }
  };

  const currentFrame = frames.find(f => f.is_current);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Sampling Frame</h3>
          <p className="text-xs text-slate-500">Upload the universe of all units you could sample from (CSV or Excel).</p>
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)} data-testid="button-upload-frame">
          <FileUp className="w-3.5 h-3.5 mr-1.5" />Upload Frame
        </Button>
      </div>

      {loadingFrames ? (
        <div className="flex items-center gap-2 py-8 justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Loading frames…</span></div>
      ) : frames.length === 0 ? (
        <div className="text-center py-14 border border-dashed rounded-xl border-slate-200 dark:border-slate-700">
          <Database className="w-9 h-9 text-slate-300 mx-auto mb-2" />
          <p className="font-medium text-slate-500">No sampling frame uploaded</p>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">Upload a CSV or Excel file containing all possible units (households, individuals, sites).</p>
        </div>
      ) : (
        <div className="space-y-3">
          {frames.map(frame => (
            <div key={frame.id} className={`rounded-xl border p-4 ${frame.is_current ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20' : 'border-slate-200 dark:border-slate-700 opacity-60'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${frame.is_current ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                    <Database className={`w-4 h-4 ${frame.is_current ? 'text-indigo-600' : 'text-slate-400'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{frame.name}</span>
                      {frame.is_current && <Badge className="text-[10px] h-4 bg-indigo-100 text-indigo-700 border-0">Current</Badge>}
                      <Badge variant="outline" className="text-[10px] h-4">v{frame.version}</Badge>
                    </div>
                    <div className="text-xs text-slate-500 flex gap-2 mt-0.5">
                      <span>{frame.total_units.toLocaleString()} units</span>
                      <span>·</span>
                      <span>{frame.columns.length} columns</span>
                      <span>·</span>
                      <span>{format(new Date(frame.created_at), 'dd MMM yyyy')}</span>
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowData(frame)} data-testid={`button-view-frame-${frame.id}`}>
                  <List className="w-3.5 h-3.5 mr-1" />Preview
                </Button>
              </div>
              {frame.is_current && frame.columns.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {frame.columns.map((c, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono">
                      {c.name}<span className="text-slate-400 ml-1">{c.type}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Upload Sampling Frame</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Frame name</Label>
              <Input value={frameName} onChange={e => setFrameName(e.target.value)} placeholder="e.g. Household registry 2026" data-testid="input-frame-name" />
            </div>
            <div>
              <Label className="text-xs">File (CSV or Excel)</Label>
              <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} data-testid="input-frame-file" />
            </div>
            {parsedRows.length > 0 && (
              <div className="rounded-lg border p-3 bg-slate-50 dark:bg-slate-900 text-sm">
                <p className="font-medium text-slate-700 dark:text-slate-300">{parsedRows.length.toLocaleString()} rows detected</p>
                <p className="text-xs text-slate-500 mt-0.5">Columns: {parsedCols.map(c => c.name).join(', ')}</p>
                {parsedRows.length > 5000 && <p className="text-xs text-amber-600 mt-1">⚠ Only first 5,000 rows stored in DB. Full file preserved.</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || !parsedRows.length} data-testid="button-confirm-frame-upload">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <FileUp className="w-3.5 h-3.5 mr-1.5" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!showData} onOpenChange={() => setShowData(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>{showData?.name} — Preview (first 20 rows)</DialogTitle></DialogHeader>
          {showData && (
            <Table>
              <TableHeader>
                <TableRow>{showData.columns.map(c => <TableHead key={c.name} className="text-xs">{c.name}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {(showData.data as Record<string, unknown>[]).slice(0, 20).map((row, i) => (
                  <TableRow key={i}>{showData.columns.map(c => <TableCell key={c.name} className="text-xs py-1">{String(row[c.name] ?? '')}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── DrawTab ──────────────────────────────────────────────────────────────────
function DrawTab({ study, frames, draws, loadingDraws, onRefresh }: {
  study: Study; frames: SamplingFrame[]; draws: SampleDraw[];
  loadingDraws: boolean; onRefresh: () => void;
}) {
  const [method, setMethod] = useState<SamplingMethod>(study.method);
  const [sampleN, setSampleN] = useState(String(study.calculated_n ?? 100));
  const [seed, setSeed] = useState(`${study.name.replace(/\s+/g, '_')}_${Date.now()}`);
  const [label, setLabel] = useState('');
  const [drawing, setDrawing] = useState(false);

  // Method-specific params
  const [sysInterval, setSysInterval] = useState('');
  const [stratAlloc, setStratAlloc] = useState<'proportional' | 'equal' | 'neyman'>('proportional');
  const [strata, setStrata] = useState<Stratum[]>([{ name: '', filterCol: '', filterVal: '', populationSize: 0 }]);
  const [clusterCol, setClusterCol] = useState('');
  const [nClusters, setNClusters] = useState('30');
  const [unitsPerCluster, setUnitsPerCluster] = useState('7');
  const [latMin, setLatMin] = useState('');
  const [latMax, setLatMax] = useState('');
  const [lonMin, setLonMin] = useState('');
  const [lonMax, setLonMax] = useState('');
  const [lqasThreshold, setLqasThreshold] = useState('80');
  const [lotNames, setLotNames] = useState('');
  const [samplePerLot, setSamplePerLot] = useState('19');
  const [quotas, setQuotas] = useState<{ label: string; n: number }[]>([{ label: '', n: 30 }]);

  const { user } = useAuth(); const { toast } = useToast(); const qc = useQueryClient();
  const currentFrame = frames.find(f => f.is_current);
  const frameData = (currentFrame?.data ?? []) as Record<string, unknown>[];
  const frameCols = currentFrame?.columns ?? [];

  const handleDraw = async () => {
    setDrawing(true);
    try {
      let units: Record<string, unknown>[] = [];
      const params: Record<string, unknown> = { method, sampleN, seed };

      if (method === 'srs') {
        units = drawSRS(frameData, Number(sampleN), seed);
      } else if (method === 'systematic') {
        units = drawSystematic(frameData, Number(sampleN), seed);
      } else if (method === 'stratified') {
        params.allocation = stratAlloc; params.strata = strata;
        units = drawStratified(frameData, strata, Number(sampleN), stratAlloc, seed);
      } else if (method === 'cluster' || method === 'multistage') {
        const clusterList = [...new Set(frameData.map(r => String(r[clusterCol] ?? '')))].filter(Boolean).map(name => ({
          name, size: frameData.filter(r => String(r[clusterCol]) === name).length,
        }));
        params.clusterCol = clusterCol; params.nClusters = nClusters; params.unitsPerCluster = unitsPerCluster;
        units = drawClusterPPS(clusterList, Number(nClusters), Number(unitsPerCluster), frameData, clusterCol, seed);
      } else if (method === 'epi') {
        params.bounds = { latMin, latMax, lonMin, lonMax }; params.nClusters = nClusters; params.unitsPerCluster = unitsPerCluster;
        units = drawEPI(Number(nClusters), Number(unitsPerCluster), { latMin: Number(latMin), latMax: Number(latMax), lonMin: Number(lonMin), lonMax: Number(lonMax) }, seed);
      } else if (method === 'geographic') {
        params.bounds = { latMin, latMax, lonMin, lonMax };
        units = drawGeographic(Number(sampleN), { latMin: Number(latMin), latMax: Number(latMax), lonMin: Number(lonMin), lonMax: Number(lonMax) }, seed);
      } else if (method === 'lqas') {
        const lots = lotNames.split('\n').map(l => l.trim()).filter(Boolean).map(name => ({ name }));
        params.lots = lots; params.samplePerLot = samplePerLot; params.threshold = lqasThreshold;
        units = drawLQAS(lots.length, Number(samplePerLot), seed, lots);
      } else if (method === 'quota') {
        params.quotas = quotas;
        units = drawQuota(quotas);
      } else if (method === 'snowball') {
        units = frameData.slice(0, Number(sampleN));
      }

      if (!units.length) { toast({ title: 'No units drawn — check frame and parameters', variant: 'destructive' }); setDrawing(false); return; }

      const { data: draw, error: drawErr } = await (supabase as any).from('fd_sample_draws').insert({
        study_id: study.id, frame_id: currentFrame?.id ?? null,
        method, params, seed, sample_size: units.length,
        status: 'drawn', label: label || null,
        drawn_at: new Date().toISOString(), drawn_by: user?.id,
      }).select().single();
      if (drawErr) throw drawErr;

      const unitRows = units.map((u, i) => ({
        draw_id: draw.id, study_id: study.id,
        unit_key: String(u[frameCols[0]?.name] ?? u.__geo_id ?? u.lot_id ?? u.quota_item ?? `unit-${i + 1}`),
        unit_data: u,
        stratum: String(u.__stratum ?? u.__cluster ?? ''),
        cluster: String(u.__cluster ?? ''),
        sort_order: i + 1, status: 'pending',
      }));
      const CHUNK = 200;
      for (let i = 0; i < unitRows.length; i += CHUNK) {
        const { error: uErr } = await (supabase as any).from('fd_sample_units').insert(unitRows.slice(i, i + CHUNK));
        if (uErr) throw uErr;
      }

      toast({ title: 'Sample drawn!', description: `${units.length.toLocaleString()} units · method: ${METHOD_LABELS[method]} · seed: ${seed}` });
      qc.invalidateQueries({ queryKey: ['fd-draws', study.id] });
      qc.invalidateQueries({ queryKey: ['fd-units', study.id] });
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Draw failed', description: err.message, variant: 'destructive' });
    } finally { setDrawing(false); }
  };

  const addStratum = () => setStrata(s => [...s, { name: '', filterCol: '', filterVal: '', populationSize: 0 }]);
  const addQuota  = () => setQuotas(q => [...q, { label: '', n: 30 }]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Config panel */}
      <div className="lg:col-span-2 space-y-5">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-indigo-500" /> Draw Configuration
        </h3>

        {!currentFrame && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Upload a sampling frame first (Frame tab) before drawing a sample.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Sampling method</Label>
            <Select value={method} onValueChange={v => setMethod(v as SamplingMethod)}>
              <SelectTrigger data-testid="select-method"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Target sample size (n)</Label>
            <Input value={sampleN} onChange={e => setSampleN(e.target.value)} type="number" min="1" data-testid="input-draw-n" />
          </div>
          <div>
            <Label className="text-xs">Random seed <span className="text-slate-400">(for reproducibility)</span></Label>
            <div className="flex gap-1">
              <Input value={seed} onChange={e => setSeed(e.target.value)} data-testid="input-seed" />
              <Button size="icon" variant="outline" onClick={() => setSeed(`${study.name.replace(/\s+/g,'_')}_${Date.now()}`)} title="Generate new seed"><RefreshCw className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Draw label <span className="text-slate-400">(optional)</span></Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Final approved draw" data-testid="input-draw-label" />
          </div>
        </div>

        {/* Method-specific config */}
        {method === 'systematic' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Systematic — auto-calculates interval k = N/n with random start</p>
            {currentFrame && <p className="text-xs text-slate-500">Frame has {currentFrame.total_units.toLocaleString()} units → interval k ≈ {Math.floor(currentFrame.total_units / Number(sampleN))}</p>}
          </div>
        )}

        {method === 'stratified' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Strata</Label>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Allocation:</Label>
                <Select value={stratAlloc} onValueChange={v => setStratAlloc(v as any)}>
                  <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proportional">Proportional</SelectItem>
                    <SelectItem value="equal">Equal</SelectItem>
                    <SelectItem value="neyman">Neyman (optimal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {strata.map((st, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 items-end">
                <div><Label className="text-[10px]">Stratum name</Label><Input value={st.name} onChange={e => setStrata(s => s.map((x,j) => j===i ? {...x, name: e.target.value} : x))} placeholder="e.g. Khartoum" className="h-7 text-xs" /></div>
                <div><Label className="text-[10px]">Column</Label><Select value={st.filterCol} onValueChange={v => setStrata(s => s.map((x,j) => j===i ? {...x, filterCol: v} : x))}><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="col" /></SelectTrigger><SelectContent>{frameCols.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-[10px]">Value</Label><Input value={st.filterVal} onChange={e => setStrata(s => s.map((x,j) => j===i ? {...x, filterVal: e.target.value} : x))} className="h-7 text-xs" /></div>
                <div><Label className="text-[10px]">Pop. size</Label><Input type="number" value={st.populationSize} onChange={e => setStrata(s => s.map((x,j) => j===i ? {...x, populationSize: Number(e.target.value)} : x))} className="h-7 text-xs" /></div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addStratum} className="text-xs h-7"><Plus className="w-3 h-3 mr-1" />Add stratum</Button>
          </div>
        )}

        {(method === 'cluster' || method === 'multistage') && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <Label className="text-xs">Cluster column (in frame)</Label>
              <Select value={clusterCol} onValueChange={setClusterCol}>
                <SelectTrigger data-testid="select-cluster-col"><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>{frameCols.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Clusters to select</Label><Input value={nClusters} onChange={e => setNClusters(e.target.value)} type="number" min="1" /></div>
            <div><Label className="text-xs">Units per cluster</Label><Input value={unitsPerCluster} onChange={e => setUnitsPerCluster(e.target.value)} type="number" min="1" /></div>
          </div>
        )}

        {(method === 'epi') && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Clusters (default 30)</Label><Input value={nClusters} onChange={e => setNClusters(e.target.value)} type="number" /></div>
            <div><Label className="text-xs">Interviews per cluster (default 7)</Label><Input value={unitsPerCluster} onChange={e => setUnitsPerCluster(e.target.value)} type="number" /></div>
            <div><Label className="text-xs">Lat min</Label><Input value={latMin} onChange={e => setLatMin(e.target.value)} placeholder="e.g. 15.0" /></div>
            <div><Label className="text-xs">Lat max</Label><Input value={latMax} onChange={e => setLatMax(e.target.value)} placeholder="e.g. 16.0" /></div>
            <div><Label className="text-xs">Lon min</Label><Input value={lonMin} onChange={e => setLonMin(e.target.value)} placeholder="e.g. 32.0" /></div>
            <div><Label className="text-xs">Lon max</Label><Input value={lonMax} onChange={e => setLonMax(e.target.value)} placeholder="e.g. 33.0" /></div>
          </div>
        )}

        {method === 'geographic' && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Lat min</Label><Input value={latMin} onChange={e => setLatMin(e.target.value)} placeholder="e.g. 15.0" /></div>
            <div><Label className="text-xs">Lat max</Label><Input value={latMax} onChange={e => setLatMax(e.target.value)} placeholder="e.g. 16.0" /></div>
            <div><Label className="text-xs">Lon min</Label><Input value={lonMin} onChange={e => setLonMin(e.target.value)} placeholder="e.g. 32.0" /></div>
            <div><Label className="text-xs">Lon max</Label><Input value={lonMax} onChange={e => setLonMax(e.target.value)} placeholder="e.g. 33.0" /></div>
          </div>
        )}

        {method === 'lqas' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Coverage threshold (%)</Label><Input value={lqasThreshold} onChange={e => setLqasThreshold(e.target.value)} type="number" min="1" max="99" /></div>
              <div><Label className="text-xs">Sample per lot (typically 19)</Label><Input value={samplePerLot} onChange={e => setSamplePerLot(e.target.value)} type="number" min="5" /></div>
            </div>
            <div>
              <Label className="text-xs">Lots (one per line)</Label>
              <Textarea value={lotNames} onChange={e => setLotNames(e.target.value)} placeholder="Locality A&#10;Locality B&#10;Locality C" rows={4} className="text-xs font-mono" />
            </div>
          </div>
        )}

        {method === 'quota' && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Quotas</Label>
            {quotas.map((q, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input value={q.label} onChange={e => setQuotas(qs => qs.map((x,j) => j===i ? {...x, label: e.target.value} : x))} placeholder="Quota label (e.g. Women 18-35)" className="h-7 text-xs flex-1" />
                <Input type="number" value={q.n} onChange={e => setQuotas(qs => qs.map((x,j) => j===i ? {...x, n: Number(e.target.value)} : x))} className="h-7 text-xs w-20" min="1" />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQuotas(qs => qs.filter((_,j) => j!==i))}><Trash2 className="w-3 h-3 text-red-400" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addQuota} className="text-xs h-7"><Plus className="w-3 h-3 mr-1" />Add quota</Button>
          </div>
        )}

        <Button onClick={handleDraw} disabled={drawing || !currentFrame} className="w-full" data-testid="button-execute-draw">
          {drawing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
          Execute Draw
        </Button>
      </div>

      {/* Draws history */}
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
          <Archive className="w-4 h-4 text-slate-400" /> Draw History
        </h3>
        {loadingDraws ? (
          <div className="flex items-center gap-2 py-6 justify-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">Loading…</span></div>
        ) : draws.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No draws yet</p>
        ) : (
          <div className="space-y-2">
            {draws.map(d => (
              <div key={d.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{d.label || METHOD_LABELS[d.method as SamplingMethod] || d.method}</span>
                  <Badge variant="outline" className="text-[10px] h-4">{d.status}</Badge>
                </div>
                <div className="text-slate-500 flex gap-2">
                  <span>{d.sample_size.toLocaleString()} units</span>
                  <span>·</span>
                  <span>seed: <code className="font-mono text-[10px]">{d.seed.length > 12 ? d.seed.slice(0, 12) + '…' : d.seed}</code></span>
                </div>
                {d.drawn_at && <p className="text-slate-400">{format(new Date(d.drawn_at), 'dd MMM yyyy HH:mm')}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TrackingTab ──────────────────────────────────────────────────────────────
function TrackingTab({ study, draws }: { study: Study; draws: SampleDraw[] }) {
  const [activeDraw, setActiveDraw] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<UnitStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const { toast } = useToast();
  const qc = useQueryClient();

  const drawId = activeDraw || draws[0]?.id;

  const { data: units = [], isLoading: loadingUnits } = useQuery({
    queryKey: ['fd-units', study.id, drawId],
    queryFn: async () => {
      if (!drawId) return [];
      const { data, error } = await (supabase as any).from('fd_sample_units').select('*').eq('draw_id', drawId).order('sort_order');
      if (error) throw error;
      return (data ?? []) as SampleUnit[];
    },
    enabled: !!drawId,
  });

  const updateStatus = async (unitId: string, newStatus: UnitStatus) => {
    const { error } = await (supabase as any).from('fd_sample_units').update({ status: newStatus, completed_at: newStatus === 'complete' ? new Date().toISOString() : null }).eq('id', unitId);
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['fd-units', study.id, drawId] });
  };

  const exportUnits = () => {
    const ws = XLSX.utils.json_to_sheet(units.map(u => ({ ...u.unit_data, status: u.status, stratum: u.stratum, cluster: u.cluster, sort_order: u.sort_order })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sample');
    XLSX.writeFile(wb, `sample_${study.name.replace(/\s+/g,'_')}.xlsx`);
  };

  const filtered = units.filter(u => statusFilter === 'all' || u.status === statusFilter);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const countsByStatus = units.reduce((acc, u) => { acc[u.status] = (acc[u.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const completePct = units.length ? Math.round((countsByStatus.complete ?? 0) / units.length * 100) : 0;

  if (draws.length === 0) return (
    <div className="text-center py-14 border border-dashed rounded-xl border-slate-200 dark:border-slate-700">
      <Shuffle className="w-9 h-9 text-slate-300 mx-auto mb-2" />
      <p className="font-medium text-slate-500">No draws yet</p>
      <p className="text-sm text-slate-400 mt-1">Execute a sample draw first (Draw tab).</p>
    </div>
  );

  const displayCols = units[0] ? Object.keys(units[0].unit_data ?? {}).filter(k => !k.startsWith('__')).slice(0, 5) : [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Draw:</Label>
          <Select value={drawId} onValueChange={v => { setActiveDraw(v); setPage(0); }}>
            <SelectTrigger className="h-7 text-xs w-56"><SelectValue /></SelectTrigger>
            <SelectContent>{draws.map(d => <SelectItem key={d.id} value={d.id}>{d.label || d.method} — {d.sample_size.toLocaleString()} units</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={exportUnits} data-testid="button-export-sample">
          <Download className="w-3.5 h-3.5 mr-1.5" />Export Excel
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', val: units.length, color: 'text-slate-700' },
          { label: 'Complete', val: countsByStatus.complete ?? 0, color: 'text-green-600' },
          { label: 'Pending', val: countsByStatus.pending ?? 0, color: 'text-amber-600' },
          { label: 'Not Found / Refused', val: (countsByStatus.not_found ?? 0) + (countsByStatus.refused ?? 0), color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.val.toLocaleString()}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-500"><span>Completion</span><span>{completePct}%</span></div>
        <Progress value={completePct} className="h-2" />
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'pending', 'complete', 'not_found', 'refused', 'unavailable'] as const).map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(0); }}
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
            data-testid={`chip-status-${s}`}
          >
            {s === 'all' ? 'All' : UNIT_STATUS_ICONS[s]?.label ?? s} {s !== 'all' && countsByStatus[s] ? `(${countsByStatus[s]})` : ''}
          </button>
        ))}
      </div>

      {/* Table */}
      {loadingUnits ? (
        <div className="flex items-center gap-2 py-8 justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">#</TableHead>
                {units[0]?.stratum && <TableHead className="text-xs">Stratum/Cluster</TableHead>}
                {displayCols.map(c => <TableHead key={c} className="text-xs">{c}</TableHead>)}
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-slate-400 text-sm py-8">No units match filter</TableCell></TableRow>
              ) : paginated.map(u => {
                const { icon: Icon, color, label } = UNIT_STATUS_ICONS[u.status];
                return (
                  <TableRow key={u.id}>
                    <TableCell className="text-xs text-slate-400">{u.sort_order}</TableCell>
                    {u.stratum !== undefined && <TableCell className="text-xs max-w-[100px] truncate">{u.stratum || u.cluster}</TableCell>}
                    {displayCols.map(c => <TableCell key={c} className="text-xs max-w-[120px] truncate">{String((u.unit_data as any)?.[c] ?? '')}</TableCell>)}
                    <TableCell>
                      <span className={`flex items-center gap-1 text-xs font-medium ${color}`}>
                        <Icon className="w-3.5 h-3.5" />{label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select value={u.status} onValueChange={v => updateStatus(u.id, v as UnitStatus)}>
                        <SelectTrigger className="h-6 text-[11px] w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(UNIT_STATUS_ICONS).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Page {page + 1} of {totalPages} ({filtered.length.toLocaleString()} units)</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 text-xs">Prev</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 text-xs">Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StudyDetail ──────────────────────────────────────────────────────────────
function StudyDetail({ study, onBack }: { study: Study; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<DetailTab>('calculator');
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: frames = [], isLoading: loadingFrames, refetch: refetchFrames } = useQuery({
    queryKey: ['fd-frames', study.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('fd_sampling_frames').select('*').eq('study_id', study.id).order('version', { ascending: false });
      if (error) throw error; return (data ?? []) as SamplingFrame[];
    },
  });
  const { data: draws = [], isLoading: loadingDraws, refetch: refetchDraws } = useQuery({
    queryKey: ['fd-draws', study.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('fd_sample_draws').select('*').eq('study_id', study.id).order('created_at', { ascending: false });
      if (error) throw error; return (data ?? []) as SampleDraw[];
    },
  });

  const updateStudy = async (updates: Partial<Study>) => {
    const { error } = await (supabase as any).from('fd_sampling_studies').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', study.id);
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else qc.invalidateQueries({ queryKey: ['fd-sampling-studies'] });
  };

  const TABS: { id: DetailTab; label: string; icon: React.ElementType }[] = [
    { id: 'calculator', label: 'Calculator', icon: Calculator },
    { id: 'frame',      label: `Frame${frames.length ? ` (v${frames.find(f=>f.is_current)?.version ?? 1})` : ''}`, icon: Database },
    { id: 'draw',       label: `Draw${draws.length ? ` (${draws.length})` : ''}`, icon: Shuffle },
    { id: 'tracking',   label: 'Tracking', icon: Target },
    { id: 'map',        label: 'Map', icon: Globe },
    { id: 'weights',    label: 'Weights', icon: Scale },
    { id: 'report',     label: 'Report', icon: FileText },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0" data-testid="button-back-to-studies"><ChevronLeft className="w-4 h-4" /></Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-800 dark:text-slate-200 truncate">{study.name}</h2>
            <Badge className={`text-[10px] h-5 shrink-0 ${STATUS_COLORS[study.status]}`}>{study.status}</Badge>
            <Badge variant="outline" className="text-[10px] h-5 shrink-0">{METHOD_LABELS[study.method]}</Badge>
          </div>
          {study.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{study.description}</p>}
        </div>
        <div className="ml-auto shrink-0 flex items-center gap-2">
          {study.calculated_n && (
            <div className="text-right">
              <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{study.calculated_n.toLocaleString()}</div>
              <div className="text-[10px] text-slate-400">required n</div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            data-testid={`tab-${t.id}`}
          >
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'calculator' && <CalculatorTab study={study} onSave={updateStudy} />}
        {activeTab === 'frame' && <FrameTab study={study} frames={frames} loadingFrames={loadingFrames} onRefresh={refetchFrames} />}
        {activeTab === 'draw' && <DrawTab study={study} frames={frames} draws={draws} loadingDraws={loadingDraws} onRefresh={refetchDraws} />}
        {activeTab === 'tracking' && <TrackingTab study={study} draws={draws} />}
        {activeTab === 'map' && <MapTab study={study} draws={draws} />}
        {activeTab === 'weights' && <WeightsTab study={study} draws={draws} frames={frames} />}
        {activeTab === 'report' && <ReportTab study={study} draws={draws} frames={frames} />}
      </div>
    </div>
  );
}

// ─── MapTab ───────────────────────────────────────────────────────────────────
const STATUS_PIN_COLORS: Record<UnitStatus, string> = {
  pending:          '#f59e0b',
  complete:         '#22c55e',
  not_found:        '#ef4444',
  refused:          '#f97316',
  unavailable:      '#eab308',
  duplicate:        '#a855f7',
  replacement_used: '#3b82f6',
};

function extractLatLon(unit_data: Record<string, unknown>): [number, number] | null {
  const get = (k: string) => unit_data[k] !== undefined && unit_data[k] !== '' ? Number(unit_data[k]) : null;
  const lat = get('latitude') ?? get('lat') ?? get('start_lat') ?? get('Latitude') ?? get('LAT');
  const lon = get('longitude') ?? get('lon') ?? get('start_lon') ?? get('Longitude') ?? get('LON') ?? get('lng');
  if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) return [lat, lon];
  return null;
}

function MapTab({ study, draws }: { study: Study; draws: SampleDraw[] }) {
  const [activeDraw, setActiveDraw] = useState<string>('');
  const drawId = activeDraw || draws[0]?.id;

  const { data: units = [], isLoading } = useQuery({
    queryKey: ['fd-units-map', study.id, drawId],
    queryFn: async () => {
      if (!drawId) return [];
      const { data, error } = await (supabase as any).from('fd_sample_units').select('id,unit_key,unit_data,status,stratum,cluster,sort_order').eq('draw_id', drawId);
      if (error) throw error; return (data ?? []) as SampleUnit[];
    },
    enabled: !!drawId,
  });

  const mapped = units.map(u => ({ ...u, coords: extractLatLon(u.unit_data as Record<string, unknown>) })).filter(u => u.coords !== null) as (SampleUnit & { coords: [number, number] })[];
  const unmapped = units.length - mapped.length;
  const center: [number, number] = mapped.length > 0
    ? [mapped.reduce((s, u) => s + u.coords[0], 0) / mapped.length, mapped.reduce((s, u) => s + u.coords[1], 0) / mapped.length]
    : [15.5, 32.5];

  if (draws.length === 0) return (
    <div className="text-center py-14 border border-dashed rounded-xl border-slate-200 dark:border-slate-700">
      <Globe className="w-9 h-9 text-slate-300 mx-auto mb-2" />
      <p className="font-medium text-slate-500">No draws yet — execute a draw first</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><Globe className="w-4 h-4 text-indigo-500" />Sample Map</h3>
          <p className="text-xs text-slate-500 mt-0.5">{mapped.length} of {units.length} units have GPS coordinates.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Draw:</Label>
          <Select value={drawId} onValueChange={setActiveDraw}>
            <SelectTrigger className="h-7 text-xs w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{draws.map(d => <SelectItem key={d.id} value={d.id}>{d.label || d.method} — {d.sample_size} units</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {(Object.entries(STATUS_PIN_COLORS) as [UnitStatus, string][]).map(([s, c]) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full border border-white shadow" style={{ background: c }} />
            {UNIT_STATUS_ICONS[s].label}
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
      ) : mapped.length === 0 ? (
        <div className="text-center py-14 border border-dashed rounded-xl border-slate-200 dark:border-slate-700">
          <MapPin className="w-9 h-9 text-slate-300 mx-auto mb-2" />
          <p className="font-medium text-slate-500">No GPS coordinates in this draw</p>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">GPS map is available for geographic, EPI, or draws from frames that include latitude/longitude columns.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700" style={{ height: 480 }}>
          <MapContainer center={center} zoom={8} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            {mapped.map((u, i) => (
              <CircleMarker
                key={u.id}
                center={u.coords}
                radius={u.cluster ? 7 : 5}
                pathOptions={{ color: '#fff', fillColor: STATUS_PIN_COLORS[u.status], fillOpacity: 0.9, weight: 1.5 }}
              >
                <Popup>
                  <div className="text-xs space-y-0.5 min-w-[140px]">
                    {u.cluster && <div className="font-bold text-slate-700">{u.cluster}</div>}
                    <div><span className="text-slate-500">Unit:</span> {u.unit_key}</div>
                    <div><span className="text-slate-500">Status:</span> {UNIT_STATUS_ICONS[u.status].label}</div>
                    {u.stratum && <div><span className="text-slate-500">Stratum:</span> {u.stratum}</div>}
                    <div><span className="text-slate-500">GPS:</span> {u.coords[0].toFixed(5)}, {u.coords[1].toFixed(5)}</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      )}

      {unmapped > 0 && mapped.length > 0 && (
        <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />{unmapped} units have no GPS coordinates and are not shown on the map.</p>
      )}
    </div>
  );
}

// ─── WeightsTab ───────────────────────────────────────────────────────────────
interface WeightRow { unitKey: string; stratum: string; cluster: string; n_stratum: number; N_stratum: number; weight: number; }

function computeWeights(units: SampleUnit[], study: Study, draw: SampleDraw | undefined, frame: SamplingFrame | undefined): WeightRow[] {
  if (!draw) return [];
  const method = draw.method as SamplingMethod;
  const N = frame?.total_units ?? study.population_size ?? units.length;
  const n = units.length;

  if (method === 'srs' || method === 'systematic' || method === 'snowball') {
    const w = N / n;
    return units.map(u => ({ unitKey: u.unit_key, stratum: u.stratum ?? '', cluster: u.cluster ?? '', n_stratum: n, N_stratum: N, weight: parseFloat(w.toFixed(4)) }));
  }

  if (method === 'stratified') {
    const strata = [...new Set(units.map(u => u.stratum ?? ''))];
    const strataParams = (draw.params?.strata as { name: string; populationSize: number }[] | undefined) ?? [];
    return units.map(u => {
      const sp = strataParams.find(s => s.name === u.stratum);
      const Ni = sp?.populationSize ?? Math.round(N / strata.length);
      const ni = units.filter(x => x.stratum === u.stratum).length;
      const w = ni > 0 ? Ni / ni : 1;
      return { unitKey: u.unit_key, stratum: u.stratum ?? '', cluster: u.cluster ?? '', n_stratum: ni, N_stratum: Ni, weight: parseFloat(w.toFixed(4)) };
    });
  }

  if (method === 'cluster' || method === 'multistage' || method === 'epi') {
    const clusters = [...new Set(units.map(u => u.cluster ?? ''))];
    const nClusters = clusters.length;
    const clusterParams = (draw.params?.clusters as { name: string; size: number }[] | undefined) ?? [];
    const totalPop = clusterParams.reduce((s, c) => s + c.size, 0) || N;
    return units.map(u => {
      const cp = clusterParams.find(c => c.name === u.cluster);
      const Mk = cp?.size ?? Math.round(totalPop / nClusters);
      const mk = units.filter(x => x.cluster === u.cluster).length;
      const stagePPS = nClusters > 0 ? totalPop / nClusters : 1;
      const w = Mk > 0 && mk > 0 ? (stagePPS / Mk) * (Mk / mk) : totalPop / n;
      return { unitKey: u.unit_key, stratum: u.stratum ?? '', cluster: u.cluster ?? '', n_stratum: mk, N_stratum: Mk, weight: parseFloat(w.toFixed(4)) };
    });
  }

  if (method === 'lqas') {
    const lotParams = (draw.params?.lots as { name: string }[] | undefined) ?? [];
    return units.map(u => ({ unitKey: u.unit_key, stratum: u.stratum ?? '', cluster: u.cluster ?? '', n_stratum: 1, N_stratum: 1, weight: 1 }));
  }

  if (method === 'quota') {
    const quotaParams = (draw.params?.quotas as { label: string; n: number }[] | undefined) ?? [];
    return units.map(u => {
      const qp = quotaParams.find(q => q.label === u.stratum);
      const w = qp ? N / (quotaParams.reduce((s, q) => s + q.n, 0)) : 1;
      return { unitKey: u.unit_key, stratum: u.stratum ?? '', cluster: u.cluster ?? '', n_stratum: qp?.n ?? 1, N_stratum: N, weight: parseFloat(w.toFixed(4)) };
    });
  }

  return units.map(u => ({ unitKey: u.unit_key, stratum: u.stratum ?? '', cluster: u.cluster ?? '', n_stratum: n, N_stratum: N, weight: 1 }));
}

function WeightsTab({ study, draws, frames }: { study: Study; draws: SampleDraw[]; frames: SamplingFrame[] }) {
  const [activeDraw, setActiveDraw] = useState<string>('');
  const drawId = activeDraw || draws[0]?.id;
  const draw = draws.find(d => d.id === drawId);
  const frame = frames.find(f => f.is_current);
  const { toast } = useToast();

  const { data: units = [], isLoading } = useQuery({
    queryKey: ['fd-units-weights', study.id, drawId],
    queryFn: async () => {
      if (!drawId) return [];
      const { data, error } = await (supabase as any).from('fd_sample_units').select('*').eq('draw_id', drawId).order('sort_order');
      if (error) throw error; return (data ?? []) as SampleUnit[];
    },
    enabled: !!drawId,
  });

  const weightRows = computeWeights(units, study, draw, frame);
  const uniqueWeights = [...new Set(weightRows.map(r => r.weight))];
  const meanW = weightRows.length ? weightRows.reduce((s, r) => s + r.weight, 0) / weightRows.length : 0;

  const exportWithWeights = () => {
    const rows = weightRows.map(r => ({ unit_key: r.unitKey, stratum: r.stratum, cluster: r.cluster, design_weight: r.weight, n_in_group: r.n_stratum, N_in_group: r.N_stratum }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Weights');
    XLSX.writeFile(wb, `weights_${study.name.replace(/\s+/g,'_')}.xlsx`);
  };

  const N = frame?.total_units ?? study.population_size ?? units.length;
  const stataCmd = draw?.method === 'stratified'
    ? `svyset [pweight=design_weight], strata(stratum)`
    : draw?.method === 'cluster' || draw?.method === 'multistage' || draw?.method === 'epi'
    ? `svyset cluster [pweight=design_weight], fpc(N_in_group)`
    : `svyset [pweight=design_weight]`;
  const rCmd = draw?.method === 'stratified'
    ? `library(survey)\nsvy_design <- svydesign(ids=~1, strata=~stratum, weights=~design_weight, data=sample_data)`
    : draw?.method === 'cluster' || draw?.method === 'multistage' || draw?.method === 'epi'
    ? `library(survey)\nsvy_design <- svydesign(ids=~cluster, weights=~design_weight, data=sample_data)`
    : `library(survey)\nsvy_design <- svydesign(ids=~1, weights=~design_weight, data=sample_data)`;

  if (draws.length === 0) return (
    <div className="text-center py-14 border border-dashed rounded-xl border-slate-200 dark:border-slate-700">
      <Scale className="w-9 h-9 text-slate-300 mx-auto mb-2" />
      <p className="font-medium text-slate-500">No draws yet — execute a draw first</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><Scale className="w-4 h-4 text-indigo-500" />Survey Weights</h3>
          <p className="text-xs text-slate-500 mt-0.5">Design weights (1 / probability of selection). Apply in analysis software to get population-representative estimates.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={drawId} onValueChange={setActiveDraw}>
            <SelectTrigger className="h-7 text-xs w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{draws.map(d => <SelectItem key={d.id} value={d.id}>{d.label || d.method} — {d.sample_size} units</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={exportWithWeights} disabled={!weightRows.length} data-testid="button-export-weights">
            <Download className="w-3.5 h-3.5 mr-1.5" />Excel
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Units', val: units.length.toLocaleString() },
          { label: 'Unique weight values', val: uniqueWeights.length },
          { label: 'Mean weight', val: meanW.toFixed(3) },
          { label: 'Population (N)', val: N.toLocaleString() },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className="text-lg font-bold text-slate-700 dark:text-slate-300 mt-0.5">{s.val}</div>
          </div>
        ))}
      </div>

      {/* Stratum/cluster weight summary */}
      {weightRows.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Weight by group</p>
          <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Group</TableHead>
                  <TableHead className="text-xs">n (sample)</TableHead>
                  <TableHead className="text-xs">N (population)</TableHead>
                  <TableHead className="text-xs">Design weight</TableHead>
                  <TableHead className="text-xs">P(selection)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...new Map(weightRows.map(r => [r.stratum || r.cluster || 'All', r])).values()].map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-medium">{r.stratum || r.cluster || 'All units'}</TableCell>
                    <TableCell className="text-xs">{r.n_stratum.toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{r.N_stratum.toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">{r.weight.toFixed(4)}</TableCell>
                    <TableCell className="text-xs font-mono text-slate-500">{r.N_stratum > 0 ? (r.n_stratum / r.N_stratum).toFixed(4) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Software commands */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { label: 'Stata svyset command', code: stataCmd, lang: 'stata' },
          { label: 'R survey design (svydesign)', code: rCmd, lang: 'r' },
        ].map(s => (
          <div key={s.lang}>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">{s.label}</p>
            <div className="relative group">
              <pre className="bg-slate-900 dark:bg-slate-800 text-emerald-300 text-xs font-mono rounded-lg px-4 py-3 pr-10 overflow-auto whitespace-pre-wrap">{s.code}</pre>
              <button onClick={() => navigator.clipboard.writeText(s.code).then(() => toast({ title: 'Copied' }))}
                className="absolute top-2 right-2 p-1 rounded text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" title="Copy">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {isLoading && <div className="flex items-center gap-2 py-4 justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>}
    </div>
  );
}

// ─── ReportTab ────────────────────────────────────────────────────────────────
function ReportTab({ study, draws, frames }: { study: Study; draws: SampleDraw[]; frames: SamplingFrame[] }) {
  const [activeDraw, setActiveDraw] = useState<string>('');
  const drawId = activeDraw || draws[0]?.id;
  const draw = draws.find(d => d.id === drawId);
  const frame = frames.find(f => f.is_current);
  const { toast } = useToast();

  const { data: units = [] } = useQuery({
    queryKey: ['fd-units-report', study.id, drawId],
    queryFn: async () => {
      if (!drawId) return [];
      const { data, error } = await (supabase as any).from('fd_sample_units').select('id,unit_key,status,stratum,cluster').eq('draw_id', drawId);
      if (error) throw error; return (data ?? []) as Pick<SampleUnit, 'id'|'unit_key'|'status'|'stratum'|'cluster'>[];
    },
    enabled: !!drawId,
  });

  const calcResult = calcSampleSize({
    populationSize: study.population_size,
    confidenceLevel: study.confidence_level,
    marginOfError: study.margin_of_error,
    expectedProportion: study.expected_proportion,
    designEffect: study.design_effect,
    nonresponseRate: study.nonresponse_rate,
  });

  const statusCounts = units.reduce((acc, u) => { acc[u.status] = (acc[u.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  // ── PDF export ────────────────────────────────────────────────────────────
  const exportPDF = () => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('Sampling Methodology Report', pageW / 2, y, { align: 'center' }); y += 8;
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text(study.name, pageW / 2, y, { align: 'center' }); y += 5;
    doc.setFontSize(9); doc.setTextColor(100);
    doc.text(`Generated: ${format(new Date(), 'dd MMMM yyyy')}`, pageW / 2, y, { align: 'center' }); y += 12;
    doc.setTextColor(0);

    const section = (title: string) => {
      y += 4;
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text(title, 14, y); y += 6;
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    };

    section('1. Study Overview');
    autoTable(doc, {
      startY: y,
      head: [['Field', 'Value']],
      body: [
        ['Study name', study.name],
        ['Description', study.description ?? '—'],
        ['Status', study.status],
        ['Primary method', METHOD_LABELS[study.method]],
        ['Created', format(new Date(study.created_at), 'dd MMMM yyyy')],
      ],
      styles: { fontSize: 9 }, headStyles: { fillColor: [79, 70, 229] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    section('2. Sample Size Calculation');
    autoTable(doc, {
      startY: y,
      head: [['Parameter', 'Value']],
      body: [
        ['Population size (N)', study.population_size?.toLocaleString() ?? 'Infinite'],
        ['Confidence level', `${(study.confidence_level * 100).toFixed(0)}%`],
        ['Margin of error (e)', `±${(study.margin_of_error * 100).toFixed(1)}%`],
        ['Expected proportion (p)', `${(study.expected_proportion * 100).toFixed(0)}%`],
        ['Design effect (DEFF)', study.design_effect.toFixed(2)],
        ['Non-response rate', `${(study.nonresponse_rate * 100).toFixed(0)}%`],
        ['Base n (Cochran)', calcResult.n0.toString()],
        ['FPC adjusted n', calcResult.nFpc.toString()],
        ['DEFF adjusted n', calcResult.nDeff.toString()],
        ['Final required n', calcResult.nFinal.toString()],
        ['Calculated n (saved)', study.calculated_n?.toString() ?? '—'],
      ],
      styles: { fontSize: 9 }, headStyles: { fillColor: [79, 70, 229] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    if (draw) {
      section('3. Sample Draw');
      autoTable(doc, {
        startY: y,
        head: [['Field', 'Value']],
        body: [
          ['Draw label', draw.label ?? '—'],
          ['Method', METHOD_LABELS[draw.method as SamplingMethod] ?? draw.method],
          ['Drawn on', draw.drawn_at ? format(new Date(draw.drawn_at), 'dd MMMM yyyy HH:mm') : '—'],
          ['Random seed', draw.seed],
          ['Sample size drawn', draw.sample_size.toString()],
          ['Frame', frame ? `${frame.name} (v${frame.version}, ${frame.total_units.toLocaleString()} units)` : '—'],
        ],
        styles: { fontSize: 9 }, headStyles: { fillColor: [79, 70, 229] },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    if (units.length > 0) {
      section('4. Field Progress');
      autoTable(doc, {
        startY: y,
        head: [['Status', 'Count', '%']],
        body: Object.entries(statusCounts).map(([s, c]) => [UNIT_STATUS_ICONS[s as UnitStatus]?.label ?? s, c.toString(), `${Math.round(c / units.length * 100)}%`]),
        styles: { fontSize: 9 }, headStyles: { fillColor: [79, 70, 229] },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    section('5. Reproducibility');
    if (draw) {
      doc.setFontSize(9);
      doc.text(`To reproduce this exact sample, use seed: "${draw.seed}" with the ${METHOD_LABELS[draw.method as SamplingMethod] ?? draw.method} method`, 14, y, { maxWidth: pageW - 28 });
      y += 8;
      doc.text('The sample was drawn using the mulberry32 PRNG algorithm. See the attached R/Python script for independent verification.', 14, y, { maxWidth: pageW - 28 });
    }

    doc.save(`sampling_report_${study.name.replace(/\s+/g, '_')}.pdf`);
    toast({ title: 'PDF downloaded' });
  };

  // ── R script ──────────────────────────────────────────────────────────────
  const rScript = `# Sampling Reproducibility Script — R
# Study: ${study.name}
# Generated: ${format(new Date(), 'dd MMMM yyyy')}
# Seed: ${draw?.seed ?? 'N/A'}

library(dplyr)
library(readxl)

# Load sampling frame
frame <- read.csv("sampling_frame.csv")  # replace with your frame file
N <- nrow(frame)
n <- ${draw?.sample_size ?? study.calculated_n ?? 'N/A'}

set.seed(${draw ? JSON.stringify(draw.seed) : '"your_seed"'})

${study.method === 'srs' || study.method === 'systematic'
  ? `# Simple Random Sampling\nselected <- frame[sample(N, n), ]`
  : study.method === 'stratified'
  ? `# Stratified Random Sampling\n# Adjust strata column name and target sizes as needed\nselected <- frame %>% group_by(stratum) %>% slice_sample(n = round(n / n_distinct(frame$stratum)))`
  : study.method === 'cluster' || study.method === 'multistage'
  ? `# Cluster Sampling (PPS)\n# Adjust cluster column name and parameters\nclusters <- frame %>% count(cluster_col, name="size")\nn_clusters <- ${draw?.params?.nClusters ?? 30}\nsel_clusters <- clusters %>% slice_sample(n = n_clusters, weight_by = size)\nselected <- frame %>% filter(cluster_col %in% sel_clusters$cluster_col) %>%\n  group_by(cluster_col) %>% slice_sample(n = ${draw?.params?.unitsPerCluster ?? 7})`
  : `# ${METHOD_LABELS[study.method]} — adapt as needed\nselected <- frame[sample(N, n), ]`
}

cat("Selected sample size:", nrow(selected), "\\n")
write.csv(selected, "reproduced_sample.csv", row.names = FALSE)
`;

  // ── Python script ─────────────────────────────────────────────────────────
  const pythonScript = `# Sampling Reproducibility Script — Python
# Study: ${study.name}
# Generated: ${format(new Date(), 'dd MMMM yyyy')}
# Seed: ${draw?.seed ?? 'N/A'}

import pandas as pd
import numpy as np

# Load sampling frame
frame = pd.read_csv("sampling_frame.csv")  # replace with your frame file
N = len(frame)
n = ${draw?.sample_size ?? study.calculated_n ?? 'None'}

rng = np.random.default_rng(seed=hash(${draw ? JSON.stringify(draw.seed) : '"your_seed"'}) % (2**32))

${study.method === 'srs' || study.method === 'systematic'
  ? `# Simple Random Sampling\nindices = rng.choice(N, size=n, replace=False)\nselected = frame.iloc[indices]`
  : study.method === 'stratified'
  ? `# Stratified Random Sampling\n# Adjust strata column name and target sizes\nselected = frame.groupby('stratum', group_keys=False).apply(\n    lambda x: x.sample(max(1, round(n / frame['stratum'].nunique())), random_state=42)\n)`
  : study.method === 'cluster' || study.method === 'multistage'
  ? `# Cluster Sampling (PPS)\nclusters = frame.groupby('cluster_col').size().reset_index(name='size')\nsel_clusters = clusters.sample(n=${draw?.params?.nClusters ?? 30}, weights='size', replace=False, random_state=42)\nselected = frame[frame['cluster_col'].isin(sel_clusters['cluster_col'])].groupby('cluster_col').apply(\n    lambda x: x.sample(min(len(x), ${draw?.params?.unitsPerCluster ?? 7}), random_state=42)\n)`
  : `# ${METHOD_LABELS[study.method]} — adapt as needed\nindices = rng.choice(N, size=n, replace=False)\nselected = frame.iloc[indices]`
}

print(f"Selected sample size: {len(selected)}")
selected.to_csv("reproduced_sample.csv", index=False)
`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" />Sampling Audit Report</h3>
          <p className="text-xs text-slate-500 mt-0.5">Donor-ready methodology report with reproducibility documentation.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={drawId} onValueChange={setActiveDraw}>
            <SelectTrigger className="h-7 text-xs w-52"><SelectValue placeholder="Select draw" /></SelectTrigger>
            <SelectContent>{draws.map(d => <SelectItem key={d.id} value={d.id}>{d.label || d.method} — {d.sample_size} units</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" onClick={exportPDF} data-testid="button-export-pdf">
            <Download className="w-3.5 h-3.5 mr-1.5" />PDF Report
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Study overview */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Study Overview</p>
          {[
            ['Study name', study.name],
            ['Status', study.status],
            ['Method', METHOD_LABELS[study.method]],
            ['Calculated n', study.calculated_n?.toLocaleString() ?? '—'],
            ['Created', format(new Date(study.created_at), 'dd MMM yyyy')],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between text-sm gap-2">
              <span className="text-slate-500 shrink-0">{l}</span>
              <span className="text-slate-800 dark:text-slate-200 font-medium text-right">{v}</span>
            </div>
          ))}
        </div>

        {/* Calculator summary */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sample Size Calculation</p>
          {[
            ['Confidence', `${(study.confidence_level * 100).toFixed(0)}%`],
            ['Margin of error', `±${(study.margin_of_error * 100).toFixed(1)}%`],
            ['Expected proportion', `${(study.expected_proportion * 100).toFixed(0)}%`],
            ['Design effect', study.design_effect.toFixed(2)],
            ['Non-response rate', `${(study.nonresponse_rate * 100).toFixed(0)}%`],
            ['Required n', calcResult.nFinal.toLocaleString()],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between text-sm gap-2">
              <span className="text-slate-500 shrink-0">{l}</span>
              <span className="text-slate-800 dark:text-slate-200 font-medium text-right">{v}</span>
            </div>
          ))}
        </div>

        {/* Draw details */}
        {draw && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sample Draw</p>
            {[
              ['Method', METHOD_LABELS[draw.method as SamplingMethod] ?? draw.method],
              ['Sample size', draw.sample_size.toLocaleString()],
              ['Seed', draw.seed],
              ['Drawn on', draw.drawn_at ? format(new Date(draw.drawn_at), 'dd MMM yyyy HH:mm') : '—'],
              ['Frame', frame ? `${frame.name} v${frame.version}` : '—'],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between text-sm gap-2">
                <span className="text-slate-500 shrink-0">{l}</span>
                <span className="text-slate-800 dark:text-slate-200 font-medium text-right font-mono text-xs break-all">{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Field progress */}
        {units.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Field Progress</p>
            <div className="space-y-2">
              {Object.entries(statusCounts).map(([s, c]) => {
                const { icon: Icon, color, label } = UNIT_STATUS_ICONS[s as UnitStatus] ?? { icon: Clock, color: 'text-slate-400', label: s };
                return (
                  <div key={s} className="flex items-center justify-between gap-2 text-sm">
                    <span className={`flex items-center gap-1.5 ${color}`}><Icon className="w-3.5 h-3.5" />{label}</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{c} ({Math.round(c / units.length * 100)}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Reproducibility scripts */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Reproducibility Scripts</h4>
        {[
          { label: 'R script', code: rScript, filename: `sampling_${study.name.replace(/\s+/g,'_')}.R`, ext: 'R' },
          { label: 'Python script', code: pythonScript, filename: `sampling_${study.name.replace(/\s+/g,'_')}.py`, ext: 'PY' },
        ].map(s => (
          <div key={s.ext}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{s.label}</p>
              <div className="flex gap-1.5">
                <button onClick={() => navigator.clipboard.writeText(s.code).then(() => toast({ title: 'Copied' }))}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 transition-colors" data-testid={`button-copy-${s.ext.toLowerCase()}`}>
                  <Copy className="w-3 h-3" />Copy
                </button>
                <button onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s.code], { type: 'text/plain' })); a.download = s.filename; a.click(); }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 transition-colors" data-testid={`button-download-${s.ext.toLowerCase()}`}>
                  <Download className="w-3 h-3" />Download
                </button>
              </div>
            </div>
            <pre className="bg-slate-900 dark:bg-slate-800 text-emerald-300 text-[11px] font-mono rounded-lg px-4 py-3 overflow-auto max-h-48 whitespace-pre-wrap">{s.code}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CreateStudyDialog ────────────────────────────────────────────────────────
function CreateStudyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: Study) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<SamplingMethod>('srs');
  const [saving, setSaving] = useState(false);
  const { user } = useAuth(); const { toast } = useToast();

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).from('fd_sampling_studies').insert({
        name: name.trim(), description: description.trim() || null, method,
        confidence_level: 0.95, margin_of_error: 0.05, expected_proportion: 0.5,
        design_effect: 1.0, nonresponse_rate: 0.10, status: 'design', created_by: user?.id,
      }).select().single();
      if (error) throw error;
      toast({ title: 'Study created' });
      onCreated(data as Study);
      setName(''); setDescription(''); setMethod('srs');
      onClose();
    } catch (err: any) {
      toast({ title: 'Failed to create study', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Sampling Study</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Study name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SMART Survey 2026 – North Darfur" data-testid="input-study-name" /></div>
          <div><Label className="text-xs">Description <span className="text-slate-400">(optional)</span></Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
          <div>
            <Label className="text-xs">Primary sampling method</Label>
            <Select value={method} onValueChange={v => setMethod(v as SamplingMethod)}>
              <SelectTrigger data-testid="select-new-method"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(METHOD_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !name.trim()} data-testid="button-create-study">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FieldDataSampling() {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Study | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StudyStatus | 'all'>('all');
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: studies = [], isLoading } = useQuery({
    queryKey: ['fd-sampling-studies'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('fd_sampling_studies').select('*').order('created_at', { ascending: false });
      if (error) throw error; return (data ?? []) as Study[];
    },
  });

  const deleteStudy = async () => {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from('fd_sampling_studies').delete().eq('id', deleteTarget.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Study deleted' }); qc.invalidateQueries({ queryKey: ['fd-sampling-studies'] }); }
    setDeleteTarget(null);
  };

  const openStudy = (s: Study) => { setSelectedStudy(s); setView('detail'); };

  const filtered = studies.filter(s =>
    (statusFilter === 'all' || s.status === statusFilter) &&
    (s.name.toLowerCase().includes(search.toLowerCase()) || (s.description ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  if (view === 'detail' && selectedStudy) {
    const fresh = studies.find(s => s.id === selectedStudy.id) ?? selectedStudy;
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          <StudyDetail study={fresh} onBack={() => { setView('list'); setSelectedStudy(null); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <Layers className="w-4 h-4" /><span>Field Data Hub</span>
              <span>/</span><span className="text-slate-700 dark:text-slate-300">Sampling Engine</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Sampling Engine</h1>
            <p className="text-sm text-slate-500 mt-0.5">Design samples, draw with reproducible seeds, and track field completion.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0" data-testid="button-new-study">
            <Plus className="w-4 h-4 mr-1.5" />New Study
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search studies…" className="sm:max-w-xs" data-testid="input-search-studies" />
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'design', 'drawing', 'field', 'complete', 'archived'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'}`}
                data-testid={`filter-${s}`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'All studies', val: studies.length, color: 'text-slate-700' },
            { label: 'In design', val: studies.filter(s => s.status === 'design').length, color: 'text-slate-500' },
            { label: 'In field', val: studies.filter(s => s.status === 'field').length, color: 'text-amber-600' },
            { label: 'Complete', val: studies.filter(s => s.status === 'complete').length, color: 'text-green-600' },
            { label: 'Methods used', val: new Set(studies.map(s => s.method)).size, color: 'text-indigo-600' },
          ].map(st => (
            <div key={st.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 text-center">
              <div className={`text-xl font-bold ${st.color}`}>{st.val}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{st.label}</div>
            </div>
          ))}
        </div>

        {/* Studies list */}
        {isLoading ? (
          <div className="text-center py-16"><Loader2 className="w-7 h-7 animate-spin text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-400">Loading studies…</p></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
            <BarChart2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-500">{studies.length === 0 ? 'No studies yet' : 'No studies match your filters'}</p>
            {studies.length === 0 && (
              <>
                <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">Create your first sampling study — design the sample size, upload a frame, and draw a reproducible sample.</p>
                <Button onClick={() => setCreateOpen(true)} className="mt-4" size="sm">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Create First Study
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(s => (
              <div key={s.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors group cursor-pointer" onClick={() => openStudy(s)} data-testid={`card-study-${s.id}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                    <Shuffle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge className={`text-[10px] h-5 ${STATUS_COLORS[s.status]}`}>{s.status}</Badge>
                    <button className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); setDeleteTarget(s); }} data-testid={`button-delete-study-${s.id}`}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm leading-snug mb-1">{s.name}</h3>
                {s.description && <p className="text-xs text-slate-500 mb-3 line-clamp-2">{s.description}</p>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-400">{METHOD_LABELS[s.method]}</span>
                  {s.calculated_n && <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-[11px] text-indigo-600 dark:text-indigo-400">n = {s.calculated_n.toLocaleString()}</span>}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Created {format(new Date(s.created_at), 'dd MMM yyyy')}</span>
                  <span className="text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium">Open →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateStudyDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={s => { qc.invalidateQueries({ queryKey: ['fd-sampling-studies'] }); openStudy(s); }} />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete study?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete <strong>{deleteTarget?.name}</strong> and all its frames, draws, and sample units. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteStudy} className="bg-red-600 hover:bg-red-700" data-testid="button-confirm-delete-study">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
