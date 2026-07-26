import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Upload, FileText, AlertTriangle, CheckCircle2, XCircle, Users,
  Clock, MapPin, Filter, Download, RefreshCw, ChevronRight,
  Search, Eye, BarChart3, Table2, Map, Layers, Info, Trash2,
  CalendarDays, Home, Repeat2, List, ArrowLeft, CheckSquare, Square,
  Sparkles, BookOpen, Globe2, FileSpreadsheet, TrendingUp, AlertCircle,
  Zap, X as XIcon, ChevronDown, Copy,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  parseCSV, autoDetectColumns, runQC,
  parseXLSForm, checkSectionCoverage,
  FLAG_META, QCFlagType, ParsedRow, EnumeratorStats, DatasetSummary, DetectedColumns,
  XLSFormSchema, XLSFormGroup, CoverageRow,
} from '@/utils/dqcUtils';

// ── Types ──────────────────────────────────────────────────────────────────
type WizardStep = 'xlsform' | 'sections' | 'csv' | 'results';

interface Dataset {
  name: string;
  uploadedAt: Date;
  headers: string[];
  rawRows: Record<string, string>[];
  cols: DetectedColumns;
  rows: ParsedRow[];
  summary: DatasetSummary;
  byEnumerator: Map<string, EnumeratorStats>;
}

// ── Constants ──────────────────────────────────────────────────────────────
const FLAG_COLORS: Record<string, string> = {
  red:    'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
  orange: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400',
};
const CHART_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];
const PAGE_SIZE = 25;

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtMin(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}
function cleanRateBadge(rate: number) {
  const cls = rate >= 90 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : rate >= 70 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  return <span className={cn('px-2 py-0.5 rounded text-xs font-semibold border', cls)}>{rate}%</span>;
}

// Guess a section icon from its name/label
function sectionIcon(group: XLSFormGroup) {
  const txt = `${group.name} ${group.label}`.toLowerCase();
  if (/gps|geo|location|coordinate|point/.test(txt)) return MapPin;
  if (/consent/.test(txt)) return CheckCircle2;
  if (/admin|area|region|state|district|locality/.test(txt)) return Map;
  if (/household|hh|family|house/.test(txt)) return Home;
  if (/roster|member|individual|person/.test(txt)) return Users;
  if (/repeat|loop/.test(txt) || group.type === 'repeat') return Repeat2;
  if (/time|date|duration|start|end/.test(txt)) return Clock;
  return List;
}

// ── Reusable UI pieces ─────────────────────────────────────────────────────
function DropZone({ onFile, accept, label, sub, icon: Icon, disabled }: {
  onFile: (f: File) => void;
  accept: string;
  label: string;
  sub?: string;
  icon: React.ElementType;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onClick={() => !disabled && ref.current?.click()}
      onDragOver={e => { if (disabled) return; e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); if (disabled) return; const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      className={cn(
        'border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 transition-colors',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30'
      )}
    >
      <Icon className="w-10 h-10 text-muted-foreground" />
      <div className="text-center">
        <p className="text-sm font-semibold">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      <p className="text-xs text-muted-foreground">{accept.replace(/\./g, '').toUpperCase()} · drag & drop or click</p>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-4 flex gap-3 items-start shadow-sm">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function FlagBadge({ flag }: { flag: QCFlagType }) {
  const m = FLAG_META[flag];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('text-xs px-1.5 py-0.5 rounded border font-medium', FLAG_COLORS[m.color])}>
            {m.label}
          </span>
        </TooltipTrigger>
        <TooltipContent><p className="max-w-xs text-xs">{m.desc}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Wizard step progress bar ───────────────────────────────────────────────
function WizardProgress({ step, hasXls }: { step: WizardStep; hasXls: boolean }) {
  const steps = [
    { id: 'xlsform',  label: 'Upload XLSForm',  num: 1 },
    { id: 'sections', label: 'Select Sections',  num: 2 },
    { id: 'csv',      label: 'Upload Data',      num: 3 },
    { id: 'results',  label: 'QC Results',       num: 4 },
  ];
  const activeIdx = steps.findIndex(s => s.id === step);
  return (
    <div className="flex items-center gap-0 bg-card border rounded-xl px-6 py-4">
      {steps.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        const skip = !hasXls && (s.id === 'xlsform' || s.id === 'sections');
        return (
          <div key={s.id} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors',
                done  ? 'bg-primary border-primary text-primary-foreground' :
                active ? 'border-primary text-primary bg-primary/10' :
                         'border-muted-foreground/30 text-muted-foreground/50'
              )}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : s.num}
              </div>
              <span className={cn(
                'text-xs font-medium whitespace-nowrap hidden sm:block',
                active ? 'text-primary' : done ? 'text-primary/70' : 'text-muted-foreground/50'
              )}>
                {skip ? <span className="line-through">{s.label}</span> : s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-2 mt-[-12px] transition-colors', done ? 'bg-primary' : 'bg-muted-foreground/20')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── AI Insights type ───────────────────────────────────────────────────────
interface AiInsights {
  formPurpose: string;
  keyIndicators: string[];
  focusAreas: Array<{ title: string; description: string; priority: 'high'|'medium'|'low'; sections: string[] }>;
  crossChecks: Array<{ title: string; description: string; sections: string[] }>;
  reportSections: string[];
  redFlags: string[];
}

// ── GPS Submission Map ─────────────────────────────────────────────────────
// Fix Leaflet default icon path (same fix as MapComponent.tsx)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const ENUM_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6'];

function GpsSubmissionMap({ rows, cols, enumerators, filterEnumerator, onFilterChange }: {
  rows: ParsedRow[];
  cols: DetectedColumns;
  enumerators: string[];
  filterEnumerator: string;
  onFilterChange: (e: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  const enumColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    enumerators.forEach((e, i) => { m[e] = ENUM_COLORS[i % ENUM_COLORS.length]; });
    return m;
  }, [enumerators]);

  // Helpers: read actual CSV column values from row
  const getEnum = (row: ParsedRow) => cols.enumerator ? String(row[cols.enumerator] ?? 'Unknown') : 'Unknown';
  const getLat  = (row: ParsedRow) => cols.gpsLat ? parseFloat(String(row[cols.gpsLat] ?? '')) : NaN;
  const getLon  = (row: ParsedRow) => cols.gpsLon ? parseFloat(String(row[cols.gpsLon] ?? '')) : NaN;
  const getPrec = (row: ParsedRow) => cols.gpsPrecision ? String(row[cols.gpsPrecision] ?? '') : '';
  const getA1   = (row: ParsedRow) => cols.admin1 ? String(row[cols.admin1] ?? '') : '';
  const getA2   = (row: ParsedRow) => cols.admin2 ? String(row[cols.admin2] ?? '') : '';
  const getA3   = (row: ParsedRow) => cols.admin3 ? String(row[cols.admin3] ?? '') : '';
  const hasGps  = (row: ParsedRow) => { const lat = getLat(row); const lon = getLon(row); return !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0 && Math.abs(lat) <= 90 && Math.abs(lon) <= 180; };

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapInstance.current = L.map(mapRef.current, { zoomControl: false }).setView([15.5, 32.5], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(mapInstance.current);
    L.control.zoom({ position: 'topright' }).addTo(mapInstance.current);
    return () => {
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    const filtered = filterEnumerator === '__all__' ? rows : rows.filter(r => getEnum(r) === filterEnumerator);
    const points: L.LatLng[] = [];
    filtered.forEach(row => {
      if (!hasGps(row)) return;
      const lat = getLat(row);
      const lon = getLon(row);
      const enu = getEnum(row);
      const prec = getPrec(row);
      const area = [getA1(row), getA2(row), getA3(row)].filter(Boolean).join(' › ');
      const color = enumColorMap[enu] || '#6b7280';
      const marker = L.circleMarker([lat, lon], {
        radius: 6, fillColor: color, color: '#fff', weight: 1.5, opacity: 1, fillOpacity: 0.85,
      }).bindPopup(`<div style="font-size:12px;line-height:1.7">
        <b>${enu}</b><br/>
        ${area ? area + '<br/>' : ''}
        ${lat.toFixed(5)}, ${lon.toFixed(5)}
        ${prec ? `<br/>GPS precision: ${prec}m` : ''}
        ${row._flags.length > 0 ? `<br/><span style="color:#ea580c">⚠ ${row._flags.length} flag(s)</span>` : ''}
      </div>`).addTo(mapInstance.current!);
      markersRef.current.push(marker);
      points.push(L.latLng(lat, lon));
    });
    if (points.length > 1) {
      try { mapInstance.current.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 12 }); }
      catch { /* ignore fitBounds errors for identical points */ }
    } else if (points.length === 1) {
      mapInstance.current.setView(points[0], 10);
    }
  }, [rows, filterEnumerator, enumColorMap, cols]);

  const gpsCount = rows.filter(hasGps).length;
  const noGpsRows = rows.length - gpsCount;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterEnumerator} onValueChange={onFilterChange}>
          <SelectTrigger className="h-9 text-xs w-56">
            <SelectValue placeholder="All Enumerators" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Enumerators ({gpsCount} GPS points)</SelectItem>
            {enumerators.map(e => {
              const cnt = rows.filter(r => getEnum(r) === e && hasGps(r)).length;
              return <SelectItem key={e} value={e}>{e} ({cnt} pts)</SelectItem>;
            })}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="w-3.5 h-3.5 text-green-600" />
          <span><strong>{gpsCount}</strong> with GPS</span>
          {noGpsRows > 0 && <Badge variant="destructive" className="text-xs">{noGpsRows} missing GPS</Badge>}
        </div>
      </div>
      {filterEnumerator === '__all__' && enumerators.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {enumerators.slice(0, 14).map(e => (
            <button key={e} onClick={() => onFilterChange(e)}
              className="flex items-center gap-1.5 text-xs bg-muted/60 hover:bg-muted border rounded-full px-2.5 py-1 transition-colors">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: enumColorMap[e] }} />
              {e.split(' ').slice(0, 2).join(' ')}
            </button>
          ))}
          {enumerators.length > 14 && <span className="text-xs text-muted-foreground self-center">+{enumerators.length - 14} more</span>}
        </div>
      )}
      {filterEnumerator !== '__all__' && (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: enumColorMap[filterEnumerator] }} />
            {filterEnumerator}
          </span>
          <button onClick={() => onFilterChange('__all__')} className="text-xs text-muted-foreground hover:text-foreground underline ml-1">
            ← Show all
          </button>
        </div>
      )}
      {gpsCount === 0 ? (
        <div className="border rounded-xl p-10 text-center text-muted-foreground text-sm">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No GPS coordinates detected in this dataset.</p>
          <p className="text-xs mt-1">Check <strong>Column Map</strong> to verify GPS Latitude/Longitude columns are detected.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden shadow-sm" style={{ height: '480px' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        </div>
      )}
    </div>
  );
}

// ── Form Preview Dialog ────────────────────────────────────────────────────
function FormPreviewDialog({ schema, open, onClose }: {
  schema: XLSFormSchema;
  open: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(schema.groups.map(g => g.name)));
  const totalQ = schema.allQuestions.length;
  const required = schema.allQuestions.filter(q => q.required).length;
  const typeCount = schema.allQuestions.reduce<Record<string,number>>((acc, q) => {
    acc[q.type] = (acc[q.type] || 0) + 1; return acc;
  }, {});
  const topTypes = Object.entries(typeCount).sort((a,b) => b[1]-a[1]).slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            {schema.formTitle}
          </DialogTitle>
          <DialogDescription>
            {schema.groups.length} sections · {totalQ} questions · {required} required
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 border-b pb-3">
          {topTypes.map(([type, count]) => (
            <Badge key={type} variant="outline" className="text-xs font-mono">{type} ×{count}</Badge>
          ))}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded(new Set(schema.groups.map(g => g.name)))}>
              Expand all
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded(new Set())}>
              Collapse all
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-2 py-2">
            {schema.topLevelQuestions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ungrouped</p>
                {schema.topLevelQuestions.map(q => (
                  <div key={q.name} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-muted/30 text-sm">
                    <Badge variant="outline" className="text-xs font-mono shrink-0 mt-0.5">{q.type}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="leading-tight">{q.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">{q.name}</p>
                    </div>
                    {q.required && <Badge className="text-xs shrink-0 bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400">req</Badge>}
                  </div>
                ))}
              </div>
            )}
            {schema.groups.map(group => {
              const Icon = sectionIcon(group);
              const isExpanded = expanded.has(group.name);
              return (
                <div key={group.name} className="border rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => setExpanded(prev => {
                      const next = new Set(prev);
                      if (next.has(group.name)) next.delete(group.name); else next.add(group.name);
                      return next;
                    })}
                  >
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold">{group.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground font-mono">{group.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">{group.questions.length}q</Badge>
                    {group.type === 'repeat' && <Badge variant="outline" className="text-xs">repeat</Badge>}
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', isExpanded && 'rotate-180')} />
                  </button>
                  {isExpanded && group.questions.length > 0 && (
                    <div className="divide-y">
                      {group.questions.map((q, idx) => (
                        <div key={q.name} className="flex items-start gap-3 px-5 py-2.5 text-sm hover:bg-muted/10">
                          <span className="text-xs text-muted-foreground w-6 shrink-0 mt-0.5">{idx + 1}</span>
                          <Badge variant="outline" className="text-xs font-mono shrink-0 mt-0.5">{q.type}</Badge>
                          <div className="flex-1 min-w-0">
                            <p className="leading-tight">{q.label}</p>
                            <p className="text-xs text-muted-foreground font-mono">{q.name}</p>
                          </div>
                          {q.required && <Badge className="text-xs shrink-0 bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400">req</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════
export default function DataQualityPage() {
  // ── Wizard state ────────────────────────────────────────────────────────
  const [wizardStep, setWizardStep] = useState<WizardStep>('xlsform');
  const [xlsSchema, setXlsSchema] = useState<XLSFormSchema | null>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Derived: a group counts as "selected" if ≥1 of its questions are selected
  const selectedGroups = useMemo(() => {
    if (!xlsSchema) return new Set<string>();
    return new Set(xlsSchema.groups.filter(g => g.questions.some(q => selectedQuestions.has(q.name))).map(g => g.name));
  }, [selectedQuestions, xlsSchema]);
  const [xlsLoading, setXlsLoading] = useState(false);
  const [xlsError, setXlsError] = useState<string | null>(null);
  const [xlsFile, setXlsFile] = useState<string>('');
  const skippedXls = xlsSchema === null && wizardStep !== 'xlsform';

  // ── Dataset state ────────────────────────────────────────────────────────
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showColMapper, setShowColMapper] = useState(false);
  const [colOverrides, setColOverrides] = useState<Partial<DetectedColumns>>({});
  const reUploadRef = useRef<HTMLInputElement>(null);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filterEnumerator, setFilterEnumerator] = useState('__all__');
  const [filterAdmin1, setFilterAdmin1] = useState('__all__');
  const [filterAdmin2, setFilterAdmin2] = useState('__all__');
  const [filterAdmin3, setFilterAdmin3] = useState('__all__');
  const [filterFlag, setFilterFlag] = useState<QCFlagType | '__all__'>('__all__');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [search, setSearch] = useState('');

  // ── Pagination ────────────────────────────────────────────────────────────
  const [flagPage, setFlagPage] = useState(1);
  const [rawPage, setRawPage] = useState(1);

  // ── AI Insights state ────────────────────────────────────────────────────
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // ── Form preview state ────────────────────────────────────────────────────
  const [showFormPreview, setShowFormPreview] = useState(false);

  // ── GPS map enumerator filter ────────────────────────────────────────────
  const [mapEnumFilter, setMapEnumFilter] = useState('__all__');
  const [activeResultsTab, setActiveResultsTab] = useState('overview');
  const [varSearch, setVarSearch] = useState('');
  const [varView, setVarView] = useState<'cards'|'table'>('cards');

  // ── Section coverage ─────────────────────────────────────────────────────
  const coverageRows = useMemo((): CoverageRow[] => {
    if (!xlsSchema || !dataset || selectedGroups.size === 0) return [];
    return checkSectionCoverage(dataset.headers, xlsSchema, selectedGroups, selectedQuestions);
  }, [xlsSchema, dataset, selectedGroups, selectedQuestions]);

  // ── XLSForm upload handler ───────────────────────────────────────────────
  const handleXLSForm = useCallback((file: File) => {
    setXlsLoading(true);
    setXlsError(null);
    setXlsFile(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const schema = parseXLSForm(e.target!.result as ArrayBuffer);
        setXlsSchema(schema);
        setSelectedQuestions(new Set(schema.allQuestions.map(q => q.name)));
        setExpandedGroups(new Set());
        setWizardStep('sections');
      } catch (err) {
        setXlsError(err instanceof Error ? err.message : 'Failed to parse XLSForm.');
      } finally {
        setXlsLoading(false);
      }
    };
    reader.onerror = () => { setXlsError('Failed to read file.'); setXlsLoading(false); };
    reader.readAsArrayBuffer(file);
  }, []);

  // ── CSV upload handler ───────────────────────────────────────────────────
  const handleCSV = useCallback((file: File) => {
    setLoading(true); setError(null); setLoadProgress(10);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        setLoadProgress(30);
        const text = e.target?.result as string;
        setLoadProgress(50);
        const { headers, rows } = parseCSV(text);
        if (headers.length === 0 || rows.length === 0) throw new Error('CSV appears empty or could not be parsed.');
        setLoadProgress(70);
        const cols = autoDetectColumns(headers);
        const { rows: parsed, summary, byEnumerator } = runQC(rows, cols);
        setLoadProgress(95);
        setDataset({ name: file.name, uploadedAt: new Date(), headers, rawRows: rows, cols, rows: parsed, summary, byEnumerator });
        setColOverrides({});
        setFilterEnumerator('__all__'); setFilterAdmin1('__all__'); setFilterAdmin2('__all__');
        setFilterAdmin3('__all__'); setFilterFlag('__all__'); setFilterDateFrom(''); setFilterDateTo(''); setSearch('');
        setFlagPage(1); setRawPage(1);
        setWizardStep('results');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file.');
      } finally {
        setLoadProgress(100);
        setTimeout(() => setLoading(false), 300);
      }
    };
    reader.onerror = () => { setError('Failed to read file.'); setLoading(false); };
    reader.readAsText(file);
  }, []);

  // ── Reset everything ─────────────────────────────────────────────────────
  const resetAll = () => {
    setWizardStep('xlsform');
    setXlsSchema(null);
    setSelectedQuestions(new Set());
    setExpandedGroups(new Set());
    setXlsFile('');
    setXlsError(null);
    setDataset(null);
    setColOverrides({});
    setError(null);
    setAiInsights(null);
    setAiError(null);
    setMapEnumFilter('__all__');
  };

  // ── AI Insights fetch ────────────────────────────────────────────────────
  const fetchAiInsights = useCallback(async (schema: XLSFormSchema) => {
    setAiLoading(true);
    setAiError(null);
    try {
      const sampleQuestions = schema.allQuestions.slice(0, 30).map(q => q.label);
      const res = await fetch('/api/dqc-ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formTitle: schema.formTitle,
          groups: schema.groups.map(g => ({ label: g.label, name: g.name, questionCount: g.questions.length })),
          totalQuestions: schema.allQuestions.length,
          sampleQuestions,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'AI analysis failed');
      setAiInsights(data.insights);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI analysis failed');
    } finally {
      setAiLoading(false);
    }
  }, []);

  // ── AI Report Download (text) ────────────────────────────────────────────
  // Build the full combined report text (AI narrative + real data points)
  const buildFullReportText = useCallback((): string => {
    if (!aiInsights || !dataset) return '';
    const { summary, byEnumerator, cols } = dataset;
    const total = dataset.rows.length;
    const pct = (n: number) => total > 0 ? ` (${Math.round((n / total) * 100)}%)` : '';
    const sep  = '═══════════════════════════════════════════════════════════════';
    const dash = '───────────────────────────────────────────────────────────────';

    // Flag counts
    const fc = summary.flagCounts;
    const flagLines = [
      fc.MISSING_GPS      ? `  Missing GPS              : ${fc.MISSING_GPS}${pct(fc.MISSING_GPS)}` : '',
      fc.POOR_GPS         ? `  Poor GPS precision (>10m): ${fc.POOR_GPS}${pct(fc.POOR_GPS)}` : '',
      fc.SHORT_DURATION   ? `  Short interview (<10 min) : ${fc.SHORT_DURATION}${pct(fc.SHORT_DURATION)}` : '',
      fc.LONG_DURATION    ? `  Long interview (>4 hrs)   : ${fc.LONG_DURATION}${pct(fc.LONG_DURATION)}` : '',
      fc.HIGH_NA_RATE     ? `  High N/A rate (>50%)      : ${fc.HIGH_NA_RATE}${pct(fc.HIGH_NA_RATE)}` : '',
      fc.DUPLICATE_QN     ? `  Duplicate questionnaire # : ${fc.DUPLICATE_QN}${pct(fc.DUPLICATE_QN)}` : '',
      fc.NO_CONSENT       ? `  No consent recorded       : ${fc.NO_CONSENT}${pct(fc.NO_CONSENT)}` : '',
      fc.TEST_SUBMISSION  ? `  Test/demo submissions     : ${fc.TEST_SUBMISSION}${pct(fc.TEST_SUBMISSION)}` : '',
      fc.NIGHT_SUBMISSION ? `  Night submissions          : ${fc.NIGHT_SUBMISSION}${pct(fc.NIGHT_SUBMISSION)}` : '',
      fc.FAST_SEQUENCE    ? `  Fast sequence (<5 min gap): ${fc.FAST_SEQUENCE}${pct(fc.FAST_SEQUENCE)}` : '',
      fc.ADMIN_MISMATCH   ? `  Admin area mismatch       : ${fc.ADMIN_MISMATCH}${pct(fc.ADMIN_MISMATCH)}` : '',
    ].filter(Boolean);

    // Enumerator rows (sorted by flagged desc)
    const enumRows = [...byEnumerator.values()]
      .sort((a, b) => b.flagged - a.flagged)
      .map(e => {
        const pads = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n);
        return (
          `  ${pads(e.name, 30)} Total:${String(e.total).padStart(5)}  Flagged:${String(e.flagged).padStart(5)}  Clean:${String(e.cleanRate).padStart(4)}%` +
          (e.missingGps   ? `  GPS:${e.missingGps}` : '') +
          (e.shortDuration ? `  Short:${e.shortDuration}` : '') +
          (e.noConsent    ? `  NoConsent:${e.noConsent}` : '')
        );
      });

    // Section coverage
    const covLines = coverageRows.length > 0 ? [
      dash,
      'SECTION / FORM COVERAGE',
      dash,
      `  Questions in selected scope : ${coverageRows.length}`,
      `  Found in CSV                : ${coverageRows.filter(r => r.found).length}`,
      `  Missing from CSV            : ${coverageRows.filter(r => !r.found).length}`,
      '',
      ...coverageRows.filter(r => !r.found).map(r => `  ✗ MISSING  [${r.groupLabel}] ${r.label} (${r.type})`),
      ...coverageRows.filter(r => r.found).map(r => `  ✓ found    [${r.groupLabel}] ${r.label} → ${r.csvCol}`),
    ] : [];

    const lines = [
      sep,
      '     PACT DATA QUALITY CONTROL — FULL COMBINED REPORT',
      sep,
      `Form          : ${xlsSchema?.formTitle ?? 'N/A'}`,
      `Dataset       : ${dataset.name}`,
      `Generated     : ${new Date().toLocaleString()}`,
      `Date range    : ${summary.dateRange.min || 'N/A'} → ${summary.dateRange.max || 'N/A'}`,
      `Enumerators   : ${summary.enumerators.length}`,
      `Admin areas   : ${summary.admin3Values.length} localities`,
      '',
      dash,
      'DATASET SUMMARY',
      dash,
      `  Total submissions : ${total.toLocaleString()}`,
      `  Flagged           : ${summary.flaggedRows.toLocaleString()}${pct(summary.flaggedRows)}`,
      `  Clean             : ${(total - summary.flaggedRows).toLocaleString()} (${summary.cleanRate}%)`,
      `  Avg duration      : ${summary.avgDurationMin != null ? summary.avgDurationMin + ' min' : 'N/A'}`,
      `  Missing GPS       : ${summary.missingGpsPct}%`,
      '',
      dash,
      'QC FLAG BREAKDOWN',
      dash,
      ...flagLines,
      '',
      dash,
      'ENUMERATOR PERFORMANCE',
      dash,
      `  ${'Enumerator'.padEnd(30)} ${'Total'.padStart(5)}   ${'Flagged'.padStart(7)}   ${'Clean'.padStart(5)}%`,
      `  ${'-'.repeat(62)}`,
      ...enumRows,
      '',
      dash,
      'AI ANALYSIS — FORM PURPOSE',
      dash,
      aiInsights.formPurpose,
      '',
      `Key Indicators: ${aiInsights.keyIndicators.join(' · ')}`,
      '',
      dash,
      'AI ANALYSIS — QC FOCUS AREAS',
      dash,
      ...aiInsights.focusAreas.flatMap(fa => {
        // Try to attach a real count for this focus area based on matching flag
        const relevantCount = Object.entries(fc)
          .filter(([k]) => fa.title.toLowerCase().includes(k.toLowerCase().replace(/_/g, ' '))
            || fa.description.toLowerCase().includes(k.toLowerCase().replace(/_/g, ' ')))
          .reduce((s, [, v]) => s + (v ?? 0), 0);
        return [
          `[${fa.priority.toUpperCase()}] ${fa.title}${relevantCount > 0 ? ` — ${relevantCount} submission(s) affected` : ''}`,
          `  ${fa.description}`,
          fa.sections.length ? `  Form sections: ${fa.sections.join(', ')}` : '',
          '',
        ].filter(l => l !== undefined) as string[];
      }),
      dash,
      'AI ANALYSIS — CROSS-SECTION CHECKS',
      dash,
      ...aiInsights.crossChecks.flatMap(cc => [
        `• ${cc.title}`,
        `  ${cc.description}`,
        cc.sections.length ? `  Involves: ${cc.sections.join(', ')}` : '',
        '',
      ]),
      ...covLines,
      '',
      dash,
      'AI ANALYSIS — RECOMMENDED REPORT STRUCTURE',
      dash,
      ...aiInsights.reportSections.map((s, i) => `  ${i + 1}. ${s}`),
      '',
      dash,
      'AI ANALYSIS — RED FLAGS TO WATCH  (with data)',
      dash,
      ...aiInsights.redFlags.map(rf => {
        // Try to find a matching real count
        const matchCount = Object.entries(fc).find(([k]) =>
          rf.toLowerCase().includes(k.toLowerCase().replace(/_/g, ' '))
          || rf.toLowerCase().includes(k.toLowerCase().replace(/_/g,' ').split(' ').slice(0,2).join(' '))
        );
        const note = matchCount && matchCount[1] ? ` [${matchCount[1]} rows affected${pct(matchCount[1])}]` : '';
        return `  ⚑ ${rf}${note}`;
      }),
      '',
      sep,
      'ENUMERATORS LISTED IN THIS DATASET',
      sep,
      ...summary.enumerators.map((e, i) => {
        const st = byEnumerator.get(e);
        return `  ${String(i + 1).padStart(3)}. ${e}${st ? `  (${st.total} submissions, ${st.flagged} flagged, ${st.cleanRate}% clean)` : ''}`;
      }),
      '',
      sep,
      `PACT Command Center — ${new Date().toLocaleString()}`,
      sep,
    ];
    return lines.join('\n');
  }, [aiInsights, dataset, xlsSchema, coverageRows]);

  const downloadAiReport = useCallback(() => {
    if (!aiInsights || !dataset) return;
    const text = buildFullReportText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `QC_Full_Report_${dataset.name.replace(/\.[^.]+$/, '')}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [aiInsights, dataset, buildFullReportText]);

  const copyAiReport = useCallback(async () => {
    if (!aiInsights || !dataset) return;
    await navigator.clipboard.writeText(buildFullReportText());
  }, [aiInsights, dataset, buildFullReportText]);

  // ── Excel Report Export ──────────────────────────────────────────────────
  const exportFullReport = useCallback(async () => {
    if (!dataset) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryData = [
      ['PACT Data Quality Control Report'],
      ['Generated', new Date().toLocaleString()],
      ['Form', xlsSchema?.formTitle ?? 'N/A'],
      ['Dataset', dataset.name],
      ['Total Submissions', dataset.rows.length],
      ['Flagged', dataset.summary.flaggedRows],
      ['Clean Rate %', dataset.summary.cleanRate],
      ['Enumerators', dataset.summary.enumerators.length],
      ['Avg Duration (min)', dataset.summary.avgDurationMin ?? 'N/A'],
      ['Missing GPS %', dataset.summary.missingGpsPct],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    // Sheet 2: By Enumerator
    const enumHeaders = ['Enumerator','Total','Flagged','Clean %','Avg Duration','Missing GPS','Short Duration','Night','No Consent','High N/A','Test Sub'];
    const enumData = [enumHeaders, ...[...dataset.byEnumerator.values()].map(s => [
      s.name, s.total, s.flagged, s.cleanRate, s.avgDurationMin ?? '', s.missingGps,
      s.shortDuration, s.nightSubmissions, s.noConsent, s.highNaRate, s.testSubmissions,
    ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(enumData), 'By Enumerator');

    // Sheet 3: QC Flags
    const flagHeaders = ['#','Enumerator','QN No','Date','Flags','Admin 1','Admin 2','Admin 3'];
    const { cols } = dataset;
    const getVal = (r: ParsedRow, col: string) => col ? String(r[col] ?? '') : '';
    const flagData = [flagHeaders, ...dataset.rows
      .filter(r => r._flags.length > 0)
      .map((r, i) => [
        i + 1,
        getVal(r, cols.enumerator),
        getVal(r, cols.questionnaireNo),
        getVal(r, cols.today),
        r._flags.join(', '),
        getVal(r, cols.admin1),
        getVal(r, cols.admin2),
        getVal(r, cols.admin3),
      ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(flagData), 'QC Flags');

    // Sheet 4: Section Coverage (if available) — one row per question
    if (coverageRows.length > 0) {
      const covHeaders = ['Section','Question','Type','Found in CSV','CSV Column'];
      const covData = [covHeaders, ...coverageRows.map(r => [
        r.groupLabel, r.label, r.type, r.found ? 'Yes' : 'No', r.csvCol ?? '',
      ])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(covData), 'Section Coverage');
    }

    // Sheet 5: GPS Data
    const gpsHeaders = ['Enumerator','Latitude','Longitude','Precision (m)','Admin 1','Admin 2','Admin 3','Flags'];
    const gpsData = [gpsHeaders, ...dataset.rows
      .filter(r => {
        const lat = cols.gpsLat ? parseFloat(String(r[cols.gpsLat] ?? '')) : NaN;
        const lon = cols.gpsLon ? parseFloat(String(r[cols.gpsLon] ?? '')) : NaN;
        return !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0 && Math.abs(lat) <= 90;
      })
      .map(r => [
        getVal(r, cols.enumerator),
        cols.gpsLat ? String(r[cols.gpsLat] ?? '') : '',
        cols.gpsLon ? String(r[cols.gpsLon] ?? '') : '',
        cols.gpsPrecision ? String(r[cols.gpsPrecision] ?? '') : '',
        getVal(r, cols.admin1),
        getVal(r, cols.admin2),
        getVal(r, cols.admin3),
        r._flags.join(', '),
      ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gpsData), 'GPS Data');

    // Sheet 6: AI Analysis (if available)
    if (aiInsights) {
      const aiRows: (string | number)[][] = [
        ['PACT DQC — AI Analysis Report'],
        ['Form', xlsSchema?.formTitle ?? 'N/A'],
        ['Dataset', dataset.name],
        ['Generated', new Date().toLocaleString()],
        [],
        ['FORM PURPOSE'],
        [aiInsights.formPurpose],
        [],
        ['KEY INDICATORS', aiInsights.keyIndicators.join(', ')],
        [],
        ['QC FOCUS AREAS'],
        ['Priority', 'Title', 'Description', 'Sections'],
        ...aiInsights.focusAreas.map(fa => [fa.priority.toUpperCase(), fa.title, fa.description, fa.sections.join(', ')]),
        [],
        ['CROSS-SECTION CHECKS'],
        ['Title', 'Description', 'Sections'],
        ...aiInsights.crossChecks.map(cc => [cc.title, cc.description, cc.sections.join(', ')]),
        [],
        ['RECOMMENDED REPORT STRUCTURE'],
        ...aiInsights.reportSections.map((s, i) => [`${i + 1}. ${s}`]),
        [],
        ['RED FLAGS TO WATCH'],
        ...aiInsights.redFlags.map(rf => [`⚑ ${rf}`]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aiRows), 'AI Analysis');
    }

    XLSX.writeFile(wb, `QC_Report_${dataset.name.replace('.csv','')}_${new Date().toISOString().slice(0,10)}.xlsx`);
  }, [dataset, xlsSchema, coverageRows, aiInsights]);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!dataset) return [];
    const { cols } = dataset;
    return dataset.rows.filter(r => {
      if (filterEnumerator !== '__all__' && String(r[cols.enumerator] ?? '') !== filterEnumerator) return false;
      if (filterAdmin1 !== '__all__' && String(r[cols.admin1] ?? '').trim() !== filterAdmin1) return false;
      if (filterAdmin2 !== '__all__' && String(r[cols.admin2] ?? '').trim() !== filterAdmin2) return false;
      if (filterAdmin3 !== '__all__' && String(r[cols.admin3] ?? '').trim() !== filterAdmin3) return false;
      if (filterFlag !== '__all__' && !r._flags.includes(filterFlag)) return false;
      const date = cols.today ? String(r[cols.today] ?? '') : '';
      if (filterDateFrom && date && date < filterDateFrom) return false;
      if (filterDateTo && date && date > filterDateTo) return false;
      if (search) {
        const s = search.toLowerCase();
        const qn = cols.questionnaireNo ? String(r[cols.questionnaireNo] ?? '') : '';
        const enu = cols.enumerator ? String(r[cols.enumerator] ?? '') : '';
        const a3 = cols.admin3 ? String(r[cols.admin3] ?? '') : '';
        if (!qn.toLowerCase().includes(s) && !enu.toLowerCase().includes(s) && !a3.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [dataset, filterEnumerator, filterAdmin1, filterAdmin2, filterAdmin3, filterFlag, filterDateFrom, filterDateTo, search]);

  const flaggedFiltered = useMemo(() => filteredRows.filter(r => r._flags.length > 0), [filteredRows]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const enumeratorChartData = useMemo(() => {
    if (!dataset) return [];
    return [...dataset.byEnumerator.values()]
      .filter(st => filterEnumerator === '__all__' || st.name === filterEnumerator)
      .map(st => ({ name: st.name, total: st.total, flagged: st.flagged, clean: st.total - st.flagged, cleanRate: st.cleanRate }))
      .sort((a, b) => b.total - a.total);
  }, [dataset, filterEnumerator]);

  const flagBreakdownData = useMemo(() => {
    if (!dataset) return [];
    const counts: Partial<Record<QCFlagType, number>> = {};
    filteredRows.forEach(r => r._flags.forEach(f => { counts[f] = (counts[f] ?? 0) + 1; }));
    return Object.entries(counts).map(([k, v]) => ({ name: FLAG_META[k as QCFlagType].label, count: v })).sort((a, b) => b.count - a.count);
  }, [filteredRows]);

  const dailyData = useMemo(() => {
    if (!dataset) return [];
    const map: Record<string, { date: string; total: number; flagged: number }> = {};
    filteredRows.forEach(r => {
      const d = dataset.cols.today ? String(r[dataset.cols.today] ?? '') : '';
      if (!d) return;
      if (!map[d]) map[d] = { date: d, total: 0, flagged: 0 };
      map[d].total++;
      if (r._flags.length > 0) map[d].flagged++;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredRows, dataset]);

  const samplingData = useMemo(() => {
    if (!dataset) return [];
    const map: Record<string, { area: string; count: number; flagged: number }> = {};
    filteredRows.forEach(r => {
      const a3 = dataset.cols.admin3 ? String(r[dataset.cols.admin3] ?? '').trim() : '';
      if (!a3) return;
      if (!map[a3]) map[a3] = { area: a3, count: 0, flagged: 0 };
      map[a3].count++;
      if (r._flags.length > 0) map[a3].flagged++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 30);
  }, [filteredRows, dataset]);

  const durationBins = useMemo(() => {
    if (!dataset) return [];
    const bins: Record<string, number> = { '<10m': 0, '10-30m': 0, '30-60m': 0, '1-2h': 0, '2-4h': 0, '>4h': 0 };
    filteredRows.forEach(r => {
      const d = r._durationMin;
      if (d === null) return;
      if (d < 10) bins['<10m']++;
      else if (d < 30) bins['10-30m']++;
      else if (d < 60) bins['30-60m']++;
      else if (d < 120) bins['1-2h']++;
      else if (d < 240) bins['2-4h']++;
      else bins['>4h']++;
    });
    return Object.entries(bins).map(([name, count]) => ({ name, count }));
  }, [filteredRows]);

  // ── Per-column / Variable statistics (ONA.io / STATA style) ─────────────
  const colStats = useMemo(() => {
    if (!dataset) return [];
    const totalRows = dataset.rawRows.length;
    const isNAVal = (v: string) => !v || v === 'n/a' || v === 'N/A' || v === 'NA' || v === 'na' || v === '-' || v === '' || v === 'none';

    return dataset.headers.map(col => {
      const vals = dataset.rawRows.map(r => String(r[col] ?? '')).filter(v => !isNAVal(v));
      const missing = totalRows - vals.length;
      const completeness = totalRows > 0 ? Math.round((vals.length / totalRows) * 100) : 0;
      const unique = new Set(vals).size;

      // Detect type
      const numericVals = vals.map(v => parseFloat(v.replace(/,/g, ''))).filter(n => !isNaN(n));
      const isNumeric = numericVals.length >= vals.length * 0.8 && vals.length > 0;
      const isDate = !isNumeric && vals.length > 0 && vals.slice(0, 20).some(v => /^\d{4}-\d{2}-\d{2}/.test(v));
      const isBoolean = !isNumeric && !isDate && unique <= 3 && ['0','1','yes','no','true','false','oui','non'].some(b => vals.some(v => v.toLowerCase() === b));
      const type: 'numeric'|'date'|'boolean'|'text' = isNumeric ? 'numeric' : isDate ? 'date' : isBoolean ? 'boolean' : 'text';

      if (isNumeric && numericVals.length > 0) {
        const sorted = [...numericVals].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const mean = numericVals.reduce((s, n) => s + n, 0) / numericVals.length;
        const median = sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
        const variance = numericVals.reduce((s, n) => s + (n - mean) ** 2, 0) / numericVals.length;
        const stdDev = Math.sqrt(variance);
        // Histogram: 8 bins
        const bins = 8;
        const step = (max - min) / bins || 1;
        const hist = Array.from({ length: bins }, (_, i) => ({ x: (min + i * step).toFixed(1), n: 0 }));
        numericVals.forEach(v => {
          const idx = Math.min(Math.floor((v - min) / step), bins - 1);
          hist[idx].n++;
        });
        return { col, type, total: vals.length, missing, completeness, unique, min, max, mean: parseFloat(mean.toFixed(2)), median: parseFloat(median.toFixed(2)), stdDev: parseFloat(stdDev.toFixed(2)), histogram: hist, topValues: undefined };
      } else {
        // Top values
        const freq: Record<string, number> = {};
        vals.forEach(v => { freq[v] = (freq[v] ?? 0) + 1; });
        const topValues = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([v, n]) => ({ v, n }));
        const isLikelySelect = unique <= 20;
        return { col, type, total: vals.length, missing, completeness, unique, min: undefined, max: undefined, mean: undefined, median: undefined, stdDev: undefined, histogram: undefined, topValues, isLikelySelect };
      }
    });
  }, [dataset]);

  // ── Exports ───────────────────────────────────────────────────────────────
  function exportFlagsCSV() {
    if (!dataset) return;
    const cols = dataset.cols;
    const headers = ['#', 'Enumerator', 'Date', 'QN', 'Admin3', 'Duration(min)', 'Flags', 'N/A Rate%'];
    const lines = [headers.join(',')];
    flaggedFiltered.forEach((r, i) => {
      lines.push([
        i + 1, `"${String(r[cols.enumerator] ?? '')}"`,
        String(r[cols.today] ?? ''), String(r[cols.questionnaireNo] ?? ''),
        `"${String(r[cols.admin3] ?? '').trim()}"`,
        r._durationMin !== null ? Math.round(r._durationMin) : '',
        `"${r._flags.join('; ')}"`, Math.round(r._naRate * 100),
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `qc_flags_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  function exportEnumeratorCSV() {
    if (!dataset) return;
    const headers = ['Enumerator','Total','Flagged','Clean%','AvgDuration','MissingGPS','ShortDuration','LongDuration','NoConsent','HighNA','DuplicateQN','TestSubs','NightSubs','FastSeq','ActiveDays','Areas'];
    const lines = [headers.join(',')];
    enumeratorChartData.forEach(({ name }) => {
      const st = dataset.byEnumerator.get(name)!;
      lines.push([
        `"${st.name}"`, st.total, st.flagged, st.cleanRate,
        st.avgDurationMin !== null ? Math.round(st.avgDurationMin) : '',
        st.missingGps, st.shortDuration, st.longDuration, st.noConsent,
        st.highNaRate, st.duplicateQn, st.testSubmissions, st.nightSubmissions,
        st.fastSequence, st.activeDates.length, st.admin3Areas.size,
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `qc_enumerators_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Data Quality Control
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            XLSForm-guided QC analysis for ODK / KoBoCollect submissions
          </p>
        </div>
        {wizardStep !== 'xlsform' && (
          <Button variant="outline" size="sm" onClick={resetAll}>
            <Trash2 className="w-4 h-4 mr-1.5" /> Start Over
          </Button>
        )}
      </div>

      {/* ── Wizard progress ──────────────────────────────────────────────── */}
      <WizardProgress step={wizardStep} hasXls={!!xlsSchema} />

      {/* ════════════════════════════════════════════════════════════════
          STEP 1 — Upload XLSForm
      ════════════════════════════════════════════════════════════════ */}
      {wizardStep === 'xlsform' && (
        <div className="bg-card border rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Step 1: Upload Your XLSForm
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              The XLSForm defines how your questionnaire was designed. We'll read the sections and questions so you can focus your QC on what matters.
            </p>
          </div>

          {xlsError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> {xlsError}
            </div>
          )}

          {xlsLoading ? (
            <div className="space-y-2 py-6">
              <p className="text-sm text-muted-foreground text-center">Reading XLSForm structure…</p>
              <Progress className="h-2" value={undefined} />
            </div>
          ) : (
            <DropZone
              onFile={handleXLSForm}
              accept=".xlsx,.xls"
              label="Drop your XLSForm here"
              sub="The Excel file downloaded from ODK Central / KoBoToolbox"
              icon={FileText}
            />
          )}

          {/* Privacy note */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400 space-y-1">
            <p className="font-semibold flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> All processing happens in your browser — nothing is uploaded to any server.</p>
            <p>The XLSForm is read to extract section groups and question names. Your form design stays private.</p>
          </div>

          {/* Skip option */}
          <div className="flex items-center gap-3 pt-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => { setXlsSchema(null); setSelectedQuestions(new Set()); setExpandedGroups(new Set()); setWizardStep('csv'); }}
            >
              Skip XLSForm → Analyze CSV directly
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
            <p className="text-xs text-muted-foreground mt-1">Column auto-detection will still run, but without section grouping or coverage checks.</p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 2 — Section Picker
      ════════════════════════════════════════════════════════════════ */}
      {wizardStep === 'sections' && xlsSchema && (
        <div className="bg-card border rounded-xl p-6 space-y-5">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <List className="w-5 h-5 text-primary" /> Step 2: Select Focus Areas
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Found <strong>{xlsSchema.groups.length} sections</strong> and{' '}
                <strong>{xlsSchema.allQuestions.length} questions</strong> in{' '}
                <em>"{xlsSchema.formTitle}"</em>. Select whole sections or individual questions to include in QC.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setShowFormPreview(true)}>
                <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Preview Form
              </Button>
              <Button variant="outline" size="sm"
                disabled={aiLoading}
                onClick={() => fetchAiInsights(xlsSchema)}
              >
                {aiLoading
                  ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Analyzing…</>
                  : <><Sparkles className="w-3.5 h-3.5 mr-1.5 text-purple-500" /> AI Analysis</>}
              </Button>
            </div>
          </div>

          {/* AI insights quick panel (if loaded) */}
          {aiInsights && (
            <div className="rounded-xl border border-purple-200 bg-purple-50/50 dark:bg-purple-900/10 dark:border-purple-900/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">AI Form Analysis</span>
                <button onClick={() => setAiInsights(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">{aiInsights.formPurpose}</p>
              <div className="flex flex-wrap gap-1.5">
                {aiInsights.keyIndicators.map(ind => (
                  <Badge key={ind} className="text-xs bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400">{ind}</Badge>
                ))}
              </div>
              {aiInsights.focusAreas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">RECOMMENDED FOCUS AREAS FOR QC</p>
                  <div className="space-y-1.5">
                    {aiInsights.focusAreas.map(fa => (
                      <div key={fa.title} className={cn(
                        'flex items-start gap-2 rounded-lg px-3 py-2 text-xs border',
                        fa.priority === 'high' ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-900/30'
                        : fa.priority === 'medium' ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-900/30'
                        : 'bg-muted border-border'
                      )}>
                        <AlertCircle className={cn('w-3.5 h-3.5 mt-0.5 shrink-0',
                          fa.priority === 'high' ? 'text-red-600' : fa.priority === 'medium' ? 'text-orange-600' : 'text-muted-foreground')} />
                        <div>
                          <span className="font-semibold">{fa.title}</span>
                          <span className="text-muted-foreground ml-1">— {fa.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Full analysis available in the AI Insights tab after uploading your data.</p>
            </div>
          )}
          {aiError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              AI analysis failed: {aiError}
            </div>
          )}

          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm">
            <span className="font-medium text-primary">{selectedQuestions.size} of {xlsSchema.allQuestions.length} questions selected</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{selectedGroups.size} of {xlsSchema.groups.length} sections</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{xlsSchema.groups.reduce((n,g) => n + g.questions.length, 0)} questions in groups</span>
            {xlsSchema.topLevelQuestions.length > 0 && (
              <><span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{xlsSchema.topLevelQuestions.length} ungrouped</span></>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedQuestions(new Set(xlsSchema.allQuestions.map(q => q.name)))}>
              <CheckSquare className="w-3.5 h-3.5 mr-1.5" /> Select All Questions
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedQuestions(new Set())}>
              <Square className="w-3.5 h-3.5 mr-1.5" /> Deselect All
            </Button>
            <div className="w-px bg-border mx-1" />
            <Button variant="ghost" size="sm" onClick={() => setExpandedGroups(new Set(xlsSchema.groups.map(g => g.name)))}>
              <Eye className="w-3.5 h-3.5 mr-1.5" /> Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setExpandedGroups(new Set())}>
              <Filter className="w-3.5 h-3.5 mr-1.5" /> Collapse All
            </Button>
          </div>

          {/* Group rows */}
          <div className="space-y-2">
            {xlsSchema.groups.map(group => {
              const Icon = sectionIcon(group);
              const expanded = expandedGroups.has(group.name);
              const selCount = group.questions.filter(q => selectedQuestions.has(q.name)).length;
              const isAll = selCount === group.questions.length && group.questions.length > 0;
              const isPartial = selCount > 0 && selCount < group.questions.length;
              const isNone = selCount === 0;

              const toggleGroupAll = (e: React.MouseEvent) => {
                e.stopPropagation();
                setSelectedQuestions(prev => {
                  const next = new Set(prev);
                  if (isAll) { group.questions.forEach(q => next.delete(q.name)); }
                  else { group.questions.forEach(q => next.add(q.name)); }
                  return next;
                });
              };

              return (
                <div key={group.name} className={cn(
                  'border rounded-xl overflow-hidden transition-all',
                  isAll ? 'border-primary/60 bg-primary/3 dark:bg-primary/5'
                  : isPartial ? 'border-amber-400/60 bg-amber-50/50 dark:bg-amber-900/10'
                  : 'border-border'
                )}>
                  {/* Group header row */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
                    onClick={() => setExpandedGroups(prev => {
                      const next = new Set(prev);
                      if (next.has(group.name)) next.delete(group.name);
                      else next.add(group.name);
                      return next;
                    })}
                  >
                    {/* Group checkbox — click toggles all questions in group */}
                    <div
                      onClick={toggleGroupAll}
                      className={cn(
                        'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer',
                        isAll ? 'bg-primary border-primary text-primary-foreground'
                        : isPartial ? 'bg-amber-100 border-amber-500 dark:bg-amber-900/30'
                        : 'border-input bg-background'
                      )}
                    >
                      {isAll && <CheckCircle2 className="w-3 h-3" />}
                      {isPartial && <span className="w-2 h-0.5 bg-amber-600 rounded-full block" />}
                    </div>

                    {/* Icon */}
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                      isAll ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {/* Labels */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">{group.label}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{group.name}</p>
                    </div>

                    {/* Counts */}
                    <div className="flex items-center gap-2 shrink-0">
                      {group.type === 'repeat' && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">repeat</Badge>
                      )}
                      <span className={cn(
                        'text-xs font-semibold px-2 py-0.5 rounded-full',
                        isAll ? 'bg-primary/15 text-primary'
                        : isPartial ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-muted text-muted-foreground'
                      )}>
                        {selCount} / {group.questions.length}
                      </span>
                      <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
                    </div>
                  </div>

                  {/* Expanded question list */}
                  {expanded && group.questions.length > 0 && (
                    <div className="border-t">
                      {/* Within-group toolbar */}
                      <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b">
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2"
                          onClick={() => setSelectedQuestions(prev => { const next = new Set(prev); group.questions.forEach(q => next.add(q.name)); return next; })}>
                          ✓ All in section
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2"
                          onClick={() => setSelectedQuestions(prev => { const next = new Set(prev); group.questions.forEach(q => next.delete(q.name)); return next; })}>
                          ✗ None in section
                        </Button>
                        <span className="ml-auto text-xs text-muted-foreground">{group.questions.length} questions total</span>
                      </div>

                      {/* Questions */}
                      <div className="divide-y max-h-72 overflow-y-auto">
                        {group.questions.map((q, idx) => {
                          const qSelected = selectedQuestions.has(q.name);
                          return (
                            <div
                              key={q.name}
                              className={cn(
                                'flex items-start gap-3 px-6 py-2.5 cursor-pointer transition-colors hover:bg-muted/20',
                                qSelected && 'bg-primary/3 dark:bg-primary/5'
                              )}
                              onClick={() => setSelectedQuestions(prev => {
                                const next = new Set(prev);
                                if (next.has(q.name)) next.delete(q.name);
                                else next.add(q.name);
                                return next;
                              })}
                            >
                              <Checkbox
                                checked={qSelected}
                                onCheckedChange={() => {}}
                                className="pointer-events-none mt-0.5 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm leading-tight">{q.label}</p>
                                <p className="text-xs text-muted-foreground font-mono mt-0.5">{q.name}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 font-mono">
                                  {q.type}
                                </Badge>
                                {q.required && (
                                  <Badge className="text-xs px-1.5 py-0 h-5 bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400">
                                    required
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Top-level questions (ungrouped) */}
            {xlsSchema.topLevelQuestions.length > 0 && (
              <div className="border-2 border-dashed rounded-xl p-4 opacity-70">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Ungrouped questions</p>
                  <Badge variant="secondary" className="text-xs">{xlsSchema.topLevelQuestions.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Not inside any section — always included in QC.</p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button variant="outline" onClick={() => setWizardStep('xlsform')}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                <strong className="text-foreground">{selectedQuestions.size}</strong> questions selected across{' '}
                <strong className="text-foreground">{selectedGroups.size}</strong> section{selectedGroups.size !== 1 ? 's' : ''}
              </span>
              <Button onClick={() => setWizardStep('csv')} disabled={selectedQuestions.size === 0}>
                Continue → Upload Data
                <ChevronRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 3 — Upload CSV
      ════════════════════════════════════════════════════════════════ */}
      {wizardStep === 'csv' && (
        <div className="bg-card border rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Table2 className="w-5 h-5 text-primary" /> Step 3: Upload Raw Data (CSV)
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upload the CSV export from ODK Central / KoBoCollect. This is the actual collected submission data.
            </p>
          </div>

          {/* Selected sections chips */}
          {xlsSchema && selectedGroups.size > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground self-center">Focusing on:</span>
              {xlsSchema.groups.filter(g => selectedGroups.has(g.name)).map(g => {
                const Icon = sectionIcon(g);
                return (
                  <span key={g.name} className="flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5">
                    <Icon className="w-3 h-3" /> {g.label}
                  </span>
                );
              })}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-2 py-6">
              <p className="text-sm text-muted-foreground text-center">Parsing CSV and running QC checks…</p>
              <Progress value={loadProgress} className="h-2" />
            </div>
          ) : (
            <DropZone
              onFile={handleCSV}
              accept=".csv"
              label="Drop your CSV data file here"
              sub="The submission export from ODK Central / KoBoCollect / Enketo"
              icon={Table2}
            />
          )}

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400 space-y-1">
            <p className="font-semibold">Supported formats</p>
            <p>Any ODK / KoBoCollect / Enketo CSV export. Column names are auto-detected — group-prefixed names like <code>GPS/latitude</code> are handled automatically.</p>
          </div>

          {xlsSchema && (
            <Button variant="outline" onClick={() => setWizardStep('sections')}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Sections
            </Button>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 4 — Results
      ════════════════════════════════════════════════════════════════ */}
      {wizardStep === 'results' && dataset && (
        <>
          {/* Dataset chip + re-upload */}
          <div className="flex flex-wrap items-center gap-3 bg-card border rounded-xl px-4 py-3">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{dataset.name}</p>
              <p className="text-xs text-muted-foreground">
                Loaded {dataset.uploadedAt.toLocaleTimeString()} · {dataset.rows.length.toLocaleString()} submissions
                {xlsSchema && ` · Form: ${xlsSchema.formTitle}`}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowColMapper(v => !v)}>
              <Layers className="w-3.5 h-3.5 mr-1.5" /> Column Map
            </Button>
            {xlsSchema && (
              <Button variant="outline" size="sm" onClick={() => setShowFormPreview(true)}>
                <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Form
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportFullReport}>
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Export Report
            </Button>
            <Button variant="outline" size="sm" onClick={() => reUploadRef.current?.click()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> New CSV
            </Button>
            <input ref={reUploadRef} type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { e.target.value = ''; handleCSV(f); } }} />
          </div>

          {/* Section focus chips */}
          {xlsSchema && selectedGroups.size > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-muted-foreground">QC scope:</span>
              {xlsSchema.groups.filter(g => selectedGroups.has(g.name)).map(g => {
                const Icon = sectionIcon(g);
                const sectionCovRows = coverageRows.filter(r => r.groupName === g.name);
                const missing = sectionCovRows.filter(r => !r.found).length;
                return (
                  <span key={g.name} className={cn(
                    'flex items-center gap-1 text-xs border rounded-full px-2.5 py-0.5',
                    missing > 0
                      ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400'
                      : 'bg-primary/10 text-primary border-primary/20'
                  )}>
                    <Icon className="w-3 h-3" /> {g.label}
                    {missing > 0 && <span className="font-bold">·{missing} missing</span>}
                  </span>
                );
              })}
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs text-muted-foreground" onClick={() => setWizardStep('sections')}>
                Edit sections
              </Button>
            </div>
          )}

          {/* Column Mapper */}
          {showColMapper && (
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" /> Auto-detected Columns
                </h3>
                <p className="text-xs text-muted-foreground">Override if auto-detection missed a column</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(Object.entries({
                  enumerator: 'Enumerator Name', supervisor: 'Supervisor Name',
                  start: 'Start Time', end: 'End Time', today: 'Survey Date', deviceId: 'Device ID',
                  gpsLat: 'GPS Latitude', gpsLon: 'GPS Longitude', gpsPrecision: 'GPS Precision',
                  admin1: 'Admin Level 1', admin2: 'Admin Level 2', admin3: 'Admin Level 3', admin3Code: 'Admin 3 Code',
                  questionnaireNo: 'Questionnaire No.', householdNo: 'Household No.', consent: 'Consent', phone: 'Phone',
                }) as [keyof DetectedColumns, string][]).map(([key, label]) => {
                  const detected = dataset.cols[key];
                  const override = colOverrides[key] ?? detected;
                  return (
                    <div key={key} className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">{label}</p>
                      <Select value={override || '__none__'} onValueChange={val => {
                        const newOverrides = { ...colOverrides, [key]: val === '__none__' ? '' : val };
                        setColOverrides(newOverrides);
                        const merged = { ...dataset.cols, ...newOverrides } as DetectedColumns;
                        const { rows: parsed, summary, byEnumerator } = runQC(dataset.rawRows, merged);
                        setDataset(d => d ? { ...d, cols: merged, rows: parsed, summary, byEnumerator } : d);
                      }}>
                        <SelectTrigger className={cn('h-8 text-xs', !override ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/20' : detected !== override ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20' : '')}>
                          <SelectValue placeholder="Not detected" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">(none)</SelectItem>
                          {dataset.headers.map(h => <SelectItem key={h} value={h} className="text-xs">{h.split('/').pop()}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {!override && <p className="text-xs text-orange-600">Not detected</p>}
                      {override && override !== detected && <p className="text-xs text-blue-600">Overridden</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Global Filters */}
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
              {(filterEnumerator !== '__all__' || filterAdmin1 !== '__all__' || filterAdmin2 !== '__all__' ||
                filterAdmin3 !== '__all__' || filterFlag !== '__all__' || filterDateFrom || filterDateTo || search) && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => {
                  setFilterEnumerator('__all__'); setFilterAdmin1('__all__'); setFilterAdmin2('__all__');
                  setFilterAdmin3('__all__'); setFilterFlag('__all__'); setFilterDateFrom(''); setFilterDateTo(''); setSearch('');
                }}>Clear all</Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{filteredRows.length.toLocaleString()} / {dataset.rows.length.toLocaleString()} rows</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
              <div className="relative col-span-2 sm:col-span-1">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input className="pl-7 h-9 text-xs" placeholder="Search QN / enumerator / area…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={filterEnumerator} onValueChange={setFilterEnumerator}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All Enumerators" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Enumerators</SelectItem>
                  {dataset.summary.enumerators.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterAdmin1} onValueChange={setFilterAdmin1}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All States" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All States</SelectItem>
                  {dataset.summary.admin1Values.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterAdmin2} onValueChange={setFilterAdmin2}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All Districts" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Districts</SelectItem>
                  {dataset.summary.admin2Values.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterAdmin3} onValueChange={setFilterAdmin3}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All Localities" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Localities</SelectItem>
                  {dataset.summary.admin3Values.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterFlag} onValueChange={v => setFilterFlag(v as QCFlagType | '__all__')}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All Flags" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Flags</SelectItem>
                  {Object.entries(FLAG_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-1 col-span-2 sm:col-span-1">
                <Input type="date" className="h-9 text-xs flex-1" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                <Input type="date" className="h-9 text-xs flex-1" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeResultsTab} onValueChange={setActiveResultsTab} className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="overview" className="text-xs"><BarChart3 className="w-3.5 h-3.5 mr-1" />Overview</TabsTrigger>
              <TabsTrigger value="enumerators" className="text-xs"><Users className="w-3.5 h-3.5 mr-1" />By Enumerator</TabsTrigger>
              <TabsTrigger value="flags" className="text-xs">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />QC Flags
                {flaggedFiltered.length > 0 && <Badge variant="destructive" className="ml-1.5 text-xs px-1.5 py-0">{flaggedFiltered.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="sampling" className="text-xs"><Map className="w-3.5 h-3.5 mr-1" />Sampling</TabsTrigger>
              <TabsTrigger value="timing" className="text-xs"><Clock className="w-3.5 h-3.5 mr-1" />Timing</TabsTrigger>
              {xlsSchema && coverageRows.length > 0 && (
                <TabsTrigger value="coverage" className="text-xs">
                  <Eye className="w-3.5 h-3.5 mr-1" />Section Coverage
                  {coverageRows.filter(r => !r.found).length > 0 && (
                    <Badge variant="destructive" className="ml-1.5 text-xs px-1.5 py-0">{coverageRows.filter(r => !r.found).length} missing</Badge>
                  )}
                </TabsTrigger>
              )}
              <TabsTrigger value="variables" className="text-xs"><Layers className="w-3.5 h-3.5 mr-1" />Variables</TabsTrigger>
              <TabsTrigger value="rawdata" className="text-xs"><Table2 className="w-3.5 h-3.5 mr-1" />Raw Data</TabsTrigger>
              <TabsTrigger value="gpsmap" className="text-xs"><Globe2 className="w-3.5 h-3.5 mr-1" />GPS Map</TabsTrigger>
              {xlsSchema && (
                <TabsTrigger value="aiinsights" className="text-xs">
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-purple-500" />AI Insights
                  {aiInsights && <span className="ml-1 w-1.5 h-1.5 bg-purple-500 rounded-full inline-block" />}
                </TabsTrigger>
              )}
            </TabsList>

            {/* ── TAB: Overview ── */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard label="Total Submissions" value={filteredRows.length.toLocaleString()} icon={FileText} color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" />
                <KpiCard label="Flagged" value={flaggedFiltered.length.toLocaleString()} sub={`${filteredRows.length > 0 ? Math.round((flaggedFiltered.length / filteredRows.length) * 100) : 0}% of total`} icon={AlertTriangle} color="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" />
                <KpiCard label="Clean Rate" value={filteredRows.length > 0 ? `${Math.round(((filteredRows.length - flaggedFiltered.length) / filteredRows.length) * 100)}%` : '—'} icon={CheckCircle2} color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" />
                <KpiCard label="Enumerators" value={filterEnumerator === '__all__' ? dataset.summary.enumerators.length : 1} icon={Users} color="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" />
                <KpiCard label="Avg Duration" value={fmtMin((() => { const d = filteredRows.map(r => r._durationMin).filter((v): v is number => v !== null); return d.length ? Math.round(d.reduce((a,b)=>a+b,0)/d.length) : null; })())} icon={Clock} color="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" />
                <KpiCard label="Missing GPS" value={`${filteredRows.length > 0 ? Math.round((filteredRows.filter(r=>r._flags.includes('MISSING_GPS')).length/filteredRows.length)*100) : 0}%`} sub={`${filteredRows.filter(r=>r._flags.includes('MISSING_GPS')).length} rows`} icon={MapPin} color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" />
              </div>

              {dataset.summary.dateRange.min && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="w-4 h-4" />
                  Data from <strong>{dataset.summary.dateRange.min}</strong> to <strong>{dataset.summary.dateRange.max}</strong>
                </div>
              )}

              <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-card border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Daily Submissions</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dailyData} barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RTooltip contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="clean" stackId="a" name="Clean" fill="#10b981" />
                      <Bar dataKey="flagged" stackId="a" name="Flagged" fill="#f59e0b" radius={[3,3,0,0]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-card border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Flag Breakdown</h3>
                  {flagBreakdownData.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                      <CheckCircle2 className="w-5 h-5 mr-2 text-green-500" /> No flags in current filter
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={flagBreakdownData} layout="vertical" barSize={14}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                        <RTooltip contentStyle={{ fontSize: 12 }} />
                        <Bar dataKey="count" name="Count" radius={[0,3,3,0]}>
                          {flagBreakdownData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="bg-card border rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-3">Clean Rate by Enumerator</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={enumeratorChartData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <RTooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`${v}%`, 'Clean Rate']} />
                    <Bar dataKey="cleanRate" name="Clean Rate" radius={[4,4,0,0]}>
                      {enumeratorChartData.map((d, i) => (
                        <Cell key={i} fill={d.cleanRate >= 90 ? '#10b981' : d.cleanRate >= 70 ? '#f59e0b' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            {/* ── TAB: By Enumerator ── */}
            <TabsContent value="enumerators" className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={exportEnumeratorCSV}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                </Button>
              </div>
              <div className="bg-card border rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Enumerator</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Flagged</TableHead>
                      <TableHead>Clean %</TableHead>
                      <TableHead className="text-right">Avg Duration</TableHead>
                      <TableHead className="text-right hidden md:table-cell">No GPS</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Short</TableHead>
                      <TableHead className="text-right hidden md:table-cell">No Consent</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">High N/A</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Test</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Night</TableHead>
                      <TableHead className="text-right hidden xl:table-cell">Days</TableHead>
                      <TableHead className="text-right hidden xl:table-cell">Areas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...dataset.byEnumerator.values()]
                      .filter(st => filterEnumerator === '__all__' || st.name === filterEnumerator)
                      .sort((a, b) => a.cleanRate - b.cleanRate)
                      .map(st => (
                        <TableRow key={st.name} className="text-xs">
                          <TableCell className="font-medium">{st.name}</TableCell>
                          <TableCell className="text-right">{st.total}</TableCell>
                          <TableCell className="text-right">{st.flagged > 0 ? <span className="text-orange-600 font-semibold">{st.flagged}</span> : <span className="text-green-600">0</span>}</TableCell>
                          <TableCell>{cleanRateBadge(st.cleanRate)}</TableCell>
                          <TableCell className="text-right">{fmtMin(st.avgDurationMin)}</TableCell>
                          <TableCell className="text-right hidden md:table-cell">{st.missingGps > 0 ? <span className="text-red-600">{st.missingGps}</span> : '0'}</TableCell>
                          <TableCell className="text-right hidden md:table-cell">{st.shortDuration > 0 ? <span className="text-orange-600">{st.shortDuration}</span> : '0'}</TableCell>
                          <TableCell className="text-right hidden md:table-cell">{st.noConsent > 0 ? <span className="text-red-600">{st.noConsent}</span> : '0'}</TableCell>
                          <TableCell className="text-right hidden lg:table-cell">{st.highNaRate}</TableCell>
                          <TableCell className="text-right hidden lg:table-cell">{st.testSubmissions > 0 ? <span className="text-red-600 font-semibold">{st.testSubmissions}</span> : '0'}</TableCell>
                          <TableCell className="text-right hidden lg:table-cell">{st.nightSubmissions}</TableCell>
                          <TableCell className="text-right hidden xl:table-cell">{st.activeDates.length}</TableCell>
                          <TableCell className="text-right hidden xl:table-cell">{st.admin3Areas.size}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── TAB: QC Flags ── */}
            <TabsContent value="flags" className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{flaggedFiltered.length.toLocaleString()} flagged submissions</p>
                <Button variant="outline" size="sm" onClick={exportFlagsCSV}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                </Button>
              </div>
              {flaggedFiltered.length === 0 ? (
                <div className="bg-card border rounded-xl py-16 flex flex-col items-center gap-3 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                  <p className="font-medium">No flagged submissions in current filter</p>
                </div>
              ) : (
                <>
                  <div className="bg-card border rounded-xl overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead>#</TableHead>
                          <TableHead>Enumerator</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>QN</TableHead>
                          <TableHead className="hidden md:table-cell">Admin3</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Duration</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">N/A%</TableHead>
                          <TableHead>Flags</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {flaggedFiltered.slice((flagPage - 1) * PAGE_SIZE, flagPage * PAGE_SIZE).map((row, i) => {
                          const cols = dataset.cols;
                          return (
                            <TableRow key={i} className="text-xs">
                              <TableCell className="text-muted-foreground">{(flagPage - 1) * PAGE_SIZE + i + 1}</TableCell>
                              <TableCell className="font-medium">{cols.enumerator ? String(row[cols.enumerator] ?? '') : '—'}</TableCell>
                              <TableCell>{cols.today ? String(row[cols.today] ?? '') : '—'}</TableCell>
                              <TableCell>{cols.questionnaireNo ? String(row[cols.questionnaireNo] ?? '') : '—'}</TableCell>
                              <TableCell className="hidden md:table-cell">{cols.admin3 ? String(row[cols.admin3] ?? '').trim() : '—'}</TableCell>
                              <TableCell className="text-right hidden md:table-cell">{fmtMin(row._durationMin)}</TableCell>
                              <TableCell className="text-right hidden sm:table-cell">{Math.round(row._naRate * 100)}%</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">{row._flags.map(f => <FlagBadge key={f} flag={f} />)}</div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Page {flagPage} of {Math.ceil(flaggedFiltered.length / PAGE_SIZE)}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={flagPage === 1} onClick={() => setFlagPage(p => p - 1)} className="h-7 px-2 text-xs">Prev</Button>
                      <Button size="sm" variant="outline" disabled={flagPage >= Math.ceil(flaggedFiltered.length / PAGE_SIZE)} onClick={() => setFlagPage(p => p + 1)} className="h-7 px-2 text-xs">Next</Button>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ── TAB: Sampling ── */}
            <TabsContent value="sampling" className="space-y-4">
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-card border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Submissions by Locality (top 30)</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={samplingData} layout="vertical" barSize={12}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="area" tick={{ fontSize: 9 }} width={120} />
                      <RTooltip contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="count" name="Total" fill="#3b82f6" radius={[0,3,3,0]} />
                      <Bar dataKey="flagged" name="Flagged" fill="#f59e0b" radius={[0,3,3,0]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-card border rounded-xl overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Locality</TableHead>
                        <TableHead className="text-right">Submissions</TableHead>
                        <TableHead className="text-right">Flagged</TableHead>
                        <TableHead>Clean %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {samplingData.map(d => (
                        <TableRow key={d.area} className="text-xs">
                          <TableCell>{d.area}</TableCell>
                          <TableCell className="text-right">{d.count}</TableCell>
                          <TableCell className="text-right">{d.flagged > 0 ? <span className="text-orange-600">{d.flagged}</span> : '0'}</TableCell>
                          <TableCell>{cleanRateBadge(d.count > 0 ? Math.round(((d.count - d.flagged) / d.count) * 100) : 100)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              {(() => {
                const mm = filteredRows.filter(r => r._flags.includes('ADMIN_MISMATCH'));
                if (mm.length === 0) return null;
                return (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 text-sm">
                    <p className="font-semibold text-yellow-700 dark:text-yellow-400 mb-1 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> {mm.length} submissions have inconsistent locality name spelling
                    </p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-500">The same admin3 code is used with different name spellings. Review and standardise names.</p>
                  </div>
                );
              })()}
            </TabsContent>

            {/* ── TAB: Timing ── */}
            <TabsContent value="timing" className="space-y-4">
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-card border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Interview Duration Distribution</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={durationBins} barSize={36}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RTooltip contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="count" name="Submissions" radius={[4,4,0,0]}>
                        {durationBins.map((d, i) => (
                          <Cell key={i} fill={d.name === '<10m' ? '#ef4444' : d.name === '>4h' ? '#f59e0b' : '#3b82f6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-muted-foreground mt-2 text-center">Red = too short (&lt;10m) · Yellow = too long (&gt;4h)</p>
                </div>
                <div className="bg-card border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Daily Submission Trend</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RTooltip contentStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="total" name="Total" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="flagged" name="Flagged" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { flag: 'NIGHT_SUBMISSION' as QCFlagType, label: 'Night Submissions (before 06:00 or after 19:00)', color: 'yellow' },
                  { flag: 'FAST_SEQUENCE' as QCFlagType, label: 'Fast Sequence (< 5 min between consecutive)', color: 'orange' },
                ].map(({ flag, label, color }) => {
                  const count = filteredRows.filter(r => r._flags.includes(flag)).length;
                  return (
                    <div key={flag} className={cn(
                      'rounded-xl p-4 border text-sm',
                      count > 0
                        ? color === 'yellow' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800' : 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
                        : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                    )}>
                      <p className={cn('font-semibold flex items-center gap-2', count > 0 ? color === 'yellow' ? 'text-yellow-700 dark:text-yellow-400' : 'text-orange-700 dark:text-orange-400' : 'text-green-700 dark:text-green-400')}>
                        {count > 0 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                        {count > 0 ? `${count} submission${count !== 1 ? 's' : ''}` : 'None found'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{label}</p>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* ── TAB: Section Coverage (XLSForm only) ── */}
            {xlsSchema && coverageRows.length > 0 && (
              <TabsContent value="coverage" className="space-y-4">
                {/* Summary */}
                <div className="grid sm:grid-cols-3 gap-3">
                  <KpiCard
                    label="Expected Questions"
                    value={coverageRows.length}
                    sub={`from ${selectedGroups.size} selected section${selectedGroups.size !== 1 ? 's' : ''}`}
                    icon={List}
                    color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  />
                  <KpiCard
                    label="Found in CSV"
                    value={coverageRows.filter(r => r.found).length}
                    sub={`${Math.round((coverageRows.filter(r => r.found).length / coverageRows.length) * 100)}% coverage`}
                    icon={CheckCircle2}
                    color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  />
                  <KpiCard
                    label="Missing Columns"
                    value={coverageRows.filter(r => !r.found).length}
                    sub="not found in uploaded CSV"
                    icon={XCircle}
                    color={coverageRows.filter(r => !r.found).length > 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}
                  />
                </div>

                {/* Coverage progress bar */}
                <div className="bg-card border rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Column Coverage</span>
                    <span>{Math.round((coverageRows.filter(r => r.found).length / coverageRows.length) * 100)}%</span>
                  </div>
                  <Progress
                    value={Math.round((coverageRows.filter(r => r.found).length / coverageRows.length) * 100)}
                    className="h-3"
                  />
                  <p className="text-xs text-muted-foreground">
                    {coverageRows.filter(r => r.found).length} of {coverageRows.length} expected question columns were found in the uploaded CSV.
                    Missing columns will not be analysed by QC checks.
                  </p>
                </div>

                {/* Per-section breakdown */}
                {xlsSchema.groups.filter(g => selectedGroups.has(g.name)).map(group => {
                  const rows = coverageRows.filter(r => r.groupName === group.name);
                  const found = rows.filter(r => r.found).length;
                  const Icon = sectionIcon(group);
                  return (
                    <div key={group.name} className="bg-card border rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
                        <Icon className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold">{group.label}</span>
                          <span className="text-xs text-muted-foreground ml-2 font-mono">{group.name}</span>
                        </div>
                        <span className={cn(
                          'text-xs font-semibold px-2 py-0.5 rounded-full',
                          found === rows.length ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        )}>
                          {found}/{rows.length} found
                        </span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead>Status</TableHead>
                            <TableHead>Question Label</TableHead>
                            <TableHead>Variable Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>CSV Column</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map(row => (
                            <TableRow key={row.qName} className="text-xs">
                              <TableCell>
                                {row.found
                                  ? <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> Found</span>
                                  : <span className="flex items-center gap-1 text-red-600"><XCircle className="w-3.5 h-3.5" /> Missing</span>
                                }
                              </TableCell>
                              <TableCell className="font-medium max-w-[200px] truncate">{row.label}</TableCell>
                              <TableCell className="font-mono text-muted-foreground">{row.qName}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs px-1.5 py-0">{row.type}</Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground font-mono">
                                {row.csvCol ? row.csvCol.split('/').pop() : <span className="text-red-500 italic">—</span>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </TabsContent>
            )}

            {/* ── TAB: GPS Map — only mount when tab is active so Leaflet has a sized container ── */}
            <TabsContent value="gpsmap" className="space-y-3">
              {activeResultsTab === 'gpsmap' && (
                <GpsSubmissionMap
                  rows={filteredRows}
                  cols={dataset.cols}
                  enumerators={dataset.summary.enumerators}
                  filterEnumerator={mapEnumFilter}
                  onFilterChange={setMapEnumFilter}
                />
              )}
            </TabsContent>

            {/* ── TAB: AI Insights ── */}
            {xlsSchema && (
              <TabsContent value="aiinsights" className="space-y-4">
                {!aiInsights && !aiLoading && !aiError && (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-purple-600" />
                    </div>
                    <div className="text-center">
                      <p className="text-base font-semibold">Get AI-powered QC analysis</p>
                      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                        Gemini will analyze your XLSForm structure and suggest what to focus on, cross-checks between sections, and a recommended report structure.
                      </p>
                    </div>
                    <Button onClick={() => fetchAiInsights(xlsSchema)}>
                      <Sparkles className="w-4 h-4 mr-2" /> Analyze with AI
                    </Button>
                  </div>
                )}
                {aiLoading && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
                    <p className="text-sm text-muted-foreground">Analyzing form structure with Gemini…</p>
                  </div>
                )}
                {aiError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 px-4 py-3 flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-400">{aiError}</p>
                    <Button variant="outline" size="sm" className="ml-auto" onClick={() => fetchAiInsights(xlsSchema)}>Retry</Button>
                  </div>
                )}
                {aiInsights && (
                  <div className="space-y-5">
                    {/* Form purpose */}
                    <div className="rounded-xl border border-purple-200 bg-purple-50/50 dark:bg-purple-900/10 dark:border-purple-900/40 p-4">
                      <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-1.5">Form Purpose</p>
                      <p className="text-sm">{aiInsights.formPurpose}</p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {aiInsights.keyIndicators.map(ind => (
                          <Badge key={ind} className="text-xs bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400">
                            <TrendingUp className="w-3 h-3 mr-1" />{ind}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Focus Areas */}
                      <div className="space-y-2">
                        <p className="text-sm font-semibold flex items-center gap-1.5">
                          <Zap className="w-4 h-4 text-orange-500" /> QC Focus Areas
                        </p>
                        {aiInsights.focusAreas.map(fa => (
                          <div key={fa.title} className={cn(
                            'rounded-lg border p-3 space-y-1',
                            fa.priority === 'high' ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-900/30'
                            : fa.priority === 'medium' ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-900/30'
                            : 'bg-muted border-border'
                          )}>
                            <div className="flex items-center gap-2">
                              <AlertCircle className={cn('w-3.5 h-3.5 shrink-0',
                                fa.priority === 'high' ? 'text-red-600' : fa.priority === 'medium' ? 'text-orange-600' : 'text-muted-foreground')} />
                              <span className="text-sm font-semibold">{fa.title}</span>
                              <Badge variant="outline" className={cn('text-xs ml-auto capitalize',
                                fa.priority === 'high' ? 'border-red-300 text-red-700' : fa.priority === 'medium' ? 'border-orange-300 text-orange-700' : '')}>
                                {fa.priority}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground pl-5">{fa.description}</p>
                            {fa.sections.length > 0 && (
                              <div className="flex flex-wrap gap-1 pl-5">
                                {fa.sections.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Cross-checks */}
                      <div className="space-y-2">
                        <p className="text-sm font-semibold flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-blue-500" /> Section Cross-Checks
                        </p>
                        {aiInsights.crossChecks.map(cc => (
                          <div key={cc.title} className="rounded-lg border bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-900/30 p-3 space-y-1">
                            <p className="text-sm font-semibold">{cc.title}</p>
                            <p className="text-xs text-muted-foreground">{cc.description}</p>
                            <div className="flex flex-wrap gap-1 pt-1">
                              {cc.sections.map(s => <Badge key={s} className="text-xs bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400">{s}</Badge>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Report sections */}
                      <div className="rounded-xl border bg-card p-4">
                        <p className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                          <FileSpreadsheet className="w-4 h-4 text-green-600" /> Recommended Report Structure
                        </p>
                        <ol className="space-y-1.5">
                          {aiInsights.reportSections.map((s, i) => (
                            <li key={s} className="flex items-center gap-2.5 text-sm">
                              <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold flex items-center justify-center shrink-0">{i+1}</span>
                              {s}
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Red flags */}
                      <div className="rounded-xl border bg-card p-4">
                        <p className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                          <AlertTriangle className="w-4 h-4 text-red-500" /> Red Flags to Watch
                        </p>
                        <ul className="space-y-1.5">
                          {aiInsights.redFlags.map(rf => (
                            <li key={rf} className="flex items-start gap-2 text-sm">
                              <span className="text-red-500 shrink-0 mt-0.5">⚑</span>
                              {rf}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* ── Export toolbar ── */}
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Export this analysis</p>
                      <div className="flex flex-wrap gap-2">
                        {/* Text report — AI narrative + all real data points */}
                        <Button size="sm" onClick={downloadAiReport}
                          className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5">
                          <Download className="w-3.5 h-3.5" />
                          Download Full Report (.txt)
                        </Button>
                        {/* Excel — all 6 sheets including AI Analysis sheet */}
                        <Button size="sm" variant="outline" onClick={exportFullReport}
                          className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400">
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          Export Excel (all sheets)
                        </Button>
                        {/* Copy to clipboard */}
                        <Button size="sm" variant="outline" onClick={async () => {
                          await copyAiReport();
                          const btn = document.getElementById('ai-copy-btn');
                          if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { if (btn) btn.textContent = 'Copy to Clipboard'; }, 2000); }
                        }} className="gap-1.5">
                          <Copy className="w-3.5 h-3.5" /><span id="ai-copy-btn">Copy to Clipboard</span>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Full Report includes: AI narrative + flag counts + enumerator stats + section coverage + all enumerator names.
                        Excel includes 6 sheets: Summary, By Enumerator, QC Flags, Section Coverage, GPS Data, AI Analysis.
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => fetchAiInsights(xlsSchema)} className="text-muted-foreground">
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh Analysis
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            )}

            {/* ── TAB: Variables (ONA.io / STATA-style per-column analytics) ── */}
            <TabsContent value="variables" className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    className="w-full pl-8 pr-3 h-9 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Search variables…"
                    value={varSearch}
                    onChange={e => setVarSearch(e.target.value)}
                  />
                </div>
                <div className="flex rounded-lg border overflow-hidden">
                  <button onClick={() => setVarView('cards')}
                    className={cn('px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors',
                      varView === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}>
                    <Layers className="w-3.5 h-3.5" /> Cards
                  </button>
                  <button onClick={() => setVarView('table')}
                    className={cn('px-3 py-1.5 text-xs flex items-center gap-1.5 border-l transition-colors',
                      varView === 'table' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}>
                    <Table2 className="w-3.5 h-3.5" /> Table
                  </button>
                </div>
                <p className="text-xs text-muted-foreground ml-auto">
                  {colStats.filter(s => !varSearch || s.col.toLowerCase().includes(varSearch.toLowerCase())).length} / {colStats.length} variables
                </p>
              </div>

              {varView === 'table' ? (
                /* ── STATA-style summary table ── */
                <div className="border rounded-xl overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="text-xs w-[220px]">Variable</TableHead>
                        <TableHead className="text-xs text-center">Type</TableHead>
                        <TableHead className="text-xs text-right">Obs</TableHead>
                        <TableHead className="text-xs text-right">Missing</TableHead>
                        <TableHead className="text-xs text-right">Complete %</TableHead>
                        <TableHead className="text-xs text-right">Unique</TableHead>
                        <TableHead className="text-xs text-right">Min</TableHead>
                        <TableHead className="text-xs text-right">Max</TableHead>
                        <TableHead className="text-xs text-right">Mean</TableHead>
                        <TableHead className="text-xs text-right">Median</TableHead>
                        <TableHead className="text-xs text-right">Std Dev</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {colStats
                        .filter(s => !varSearch || s.col.toLowerCase().includes(varSearch.toLowerCase()))
                        .map(s => (
                          <TableRow key={s.col} className="text-xs">
                            <TableCell className="font-mono text-xs max-w-[220px] truncate" title={s.col}>{s.col}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={cn('text-xs px-1.5 py-0',
                                s.type === 'numeric' ? 'border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-900/20' :
                                s.type === 'date'    ? 'border-green-300 text-green-700 bg-green-50 dark:bg-green-900/20' :
                                s.type === 'boolean' ? 'border-orange-300 text-orange-700 bg-orange-50 dark:bg-orange-900/20' :
                                                       'border-gray-300 text-gray-700 bg-gray-50 dark:bg-gray-800/50')}>
                                {s.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{s.total.toLocaleString()}</TableCell>
                            <TableCell className={cn('text-right tabular-nums', s.missing > 0 ? 'text-red-600 font-medium' : '')}>{s.missing > 0 ? s.missing.toLocaleString() : '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span className={cn(s.completeness < 70 ? 'text-red-600 font-bold' : s.completeness < 90 ? 'text-amber-600 font-medium' : 'text-green-700 font-medium')}>
                                {s.completeness}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{s.unique.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.min != null ? s.min : '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.max != null ? s.max : '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.mean != null ? s.mean : '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.median != null ? s.median : '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.stdDev != null ? s.stdDev : '—'}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                /* ── ONA.io card view ── */
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {colStats
                    .filter(s => !varSearch || s.col.toLowerCase().includes(varSearch.toLowerCase()))
                    .map(s => (
                      <div key={s.col} className="border rounded-xl p-3 bg-card space-y-2 hover:shadow-md transition-shadow">
                        {/* Completeness bar */}
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all',
                            s.completeness >= 90 ? 'bg-green-500' : s.completeness >= 70 ? 'bg-amber-400' : 'bg-red-500')}
                            style={{ width: `${s.completeness}%` }} />
                        </div>
                        {/* Header */}
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono font-medium truncate" title={s.col}>{s.col}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {s.total.toLocaleString()} filled · {s.missing > 0 ? <span className="text-red-500">{s.missing} missing</span> : <span className="text-green-600">no missing</span>}
                            </p>
                          </div>
                          <Badge variant="outline" className={cn('text-xs px-1.5 py-0 shrink-0',
                            s.type === 'numeric' ? 'border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-900/20' :
                            s.type === 'date'    ? 'border-green-300 text-green-700 bg-green-50 dark:bg-green-900/20' :
                            s.type === 'boolean' ? 'border-orange-300 text-orange-700 bg-orange-50 dark:bg-orange-900/20' :
                                                   'border-gray-300 text-gray-600')}>
                            {s.type}
                          </Badge>
                        </div>

                        {/* Numeric stats + histogram */}
                        {s.type === 'numeric' && s.histogram && (
                          <>
                            <div className="grid grid-cols-3 gap-1.5 text-center">
                              {[
                                { label: 'Min', val: s.min },
                                { label: 'Mean', val: s.mean },
                                { label: 'Max', val: s.max },
                                { label: 'Median', val: s.median },
                                { label: 'Std Dev', val: s.stdDev },
                                { label: 'Unique', val: s.unique },
                              ].map(({ label, val }) => (
                                <div key={label} className="bg-muted/50 rounded-lg p-1.5">
                                  <p className="text-xs text-muted-foreground leading-none">{label}</p>
                                  <p className="text-xs font-semibold tabular-nums mt-0.5">{val ?? '—'}</p>
                                </div>
                              ))}
                            </div>
                            <div style={{ height: 60 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={s.histogram} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barSize={14}>
                                  <Bar dataKey="n" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                                  <RTooltip
                                    contentStyle={{ fontSize: 10 }}
                                    formatter={(v: number) => [v, 'count']}
                                    labelFormatter={(l: string) => `≥ ${l}`}
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </>
                        )}

                        {/* Text / select top values */}
                        {s.type !== 'numeric' && s.topValues && s.topValues.length > 0 && (
                          s.isLikelySelect ? (
                            <div style={{ height: Math.min(s.topValues.length * 20 + 8, 120) }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={s.topValues} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }} barSize={10}>
                                  <XAxis type="number" hide />
                                  <YAxis type="category" dataKey="v" width={80} tick={{ fontSize: 9 }} tickLine={false} />
                                  <Bar dataKey="n" fill="#10b981" radius={[0, 2, 2, 0]} />
                                  <RTooltip contentStyle={{ fontSize: 10 }} formatter={(v: number) => [v, 'responses']} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="space-y-0.5 max-h-24 overflow-y-auto">
                              {s.topValues.slice(0, 6).map(({ v, n }) => (
                                <div key={v} className="flex items-center gap-2 text-xs">
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.round((n / s.total) * 100)}%` }} />
                                  </div>
                                  <span className="w-6 text-right tabular-nums text-muted-foreground">{n}</span>
                                  <span className="font-mono truncate max-w-[90px]" title={v}>{v}</span>
                                </div>
                              ))}
                              {s.unique > 6 && <p className="text-xs text-muted-foreground">+{s.unique - 6} more unique values</p>}
                            </div>
                          )
                        )}

                        {/* Date: just show unique count */}
                        {s.type === 'date' && (
                          <p className="text-xs text-muted-foreground">{s.unique} distinct dates · {s.topValues?.[0]?.v ?? ''} → {s.topValues?.[s.topValues.length - 1]?.v ?? ''}</p>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </TabsContent>

            {/* ── TAB: Raw Data ── */}
            <TabsContent value="rawdata" className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{filteredRows.length.toLocaleString()} rows · {dataset.headers.length} columns</p>
              </div>
              <div className="bg-card border rounded-xl overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="sticky left-0 bg-card">#</TableHead>
                      <TableHead>Flags</TableHead>
                      {dataset.headers.slice(0, 15).map(h => (
                        <TableHead key={h} className="whitespace-nowrap max-w-[120px] truncate">
                          {h.split('/').pop()}
                        </TableHead>
                      ))}
                      {dataset.headers.length > 15 && <TableHead>…+{dataset.headers.length - 15} cols</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.slice((rawPage - 1) * PAGE_SIZE, rawPage * PAGE_SIZE).map((row, i) => (
                      <TableRow key={i} className={cn('text-xs', row._flags.length > 0 && 'bg-orange-50/50 dark:bg-orange-900/10')}>
                        <TableCell className="sticky left-0 bg-inherit text-muted-foreground">{(rawPage - 1) * PAGE_SIZE + i + 1}</TableCell>
                        <TableCell>
                          {row._flags.length > 0
                            ? <span className="text-xs font-bold text-orange-600">{row._flags.length}</span>
                            : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                        </TableCell>
                        {dataset.headers.slice(0, 15).map(h => (
                          <TableCell key={h} className="max-w-[120px] truncate">{String(row[h] ?? '')}</TableCell>
                        ))}
                        {dataset.headers.length > 15 && <TableCell className="text-muted-foreground">…</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Page {rawPage} of {Math.ceil(filteredRows.length / PAGE_SIZE)}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={rawPage === 1} onClick={() => setRawPage(p => p - 1)} className="h-7 px-2 text-xs">Prev</Button>
                  <Button size="sm" variant="outline" disabled={rawPage >= Math.ceil(filteredRows.length / PAGE_SIZE)} onClick={() => setRawPage(p => p + 1)} className="h-7 px-2 text-xs">Next</Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Form Preview Dialog */}
      {xlsSchema && showFormPreview && (
        <FormPreviewDialog
          schema={xlsSchema}
          open={showFormPreview}
          onClose={() => setShowFormPreview(false)}
        />
      )}
    </div>
  );
}
