import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Upload, FileText, AlertTriangle, CheckCircle2, XCircle, Users,
  Clock, MapPin, Filter, Download, RefreshCw, ChevronDown, ChevronUp,
  Search, Eye, BarChart3, Table2, Map, Layers, Info, Trash2,
  TrendingUp, TrendingDown, Minus, CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  parseCSV, autoDetectColumns, runQC,
  FLAG_META, QCFlagType, ParsedRow, EnumeratorStats, DatasetSummary, DetectedColumns,
} from '@/utils/dqcUtils';

// ── Types ──────────────────────────────────────────────────────────────────
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

// ── Palette ────────────────────────────────────────────────────────────────
const FLAG_COLORS: Record<string, string> = {
  red: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
  orange: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400',
};
const CHART_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];

// ── Small helpers ──────────────────────────────────────────────────────────
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

// ── Upload dropzone ────────────────────────────────────────────────────────
function DropZone({ onFile, accept, label, icon: Icon }: {
  onFile: (f: File) => void;
  accept: string;
  label: string;
  icon: React.ElementType;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      className={cn(
        'border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30'
      )}
    >
      <Icon className="w-8 h-8 text-muted-foreground" />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{accept.replace(/\./g, '').toUpperCase()} · drag & drop or click</p>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────
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

// ── Flag badge ─────────────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════
export default function DataQualityPage() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterEnumerator, setFilterEnumerator] = useState('__all__');
  const [filterAdmin1, setFilterAdmin1] = useState('__all__');
  const [filterAdmin2, setFilterAdmin2] = useState('__all__');
  const [filterAdmin3, setFilterAdmin3] = useState('__all__');
  const [filterFlag, setFilterFlag] = useState<QCFlagType | '__all__'>('__all__');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [search, setSearch] = useState('');

  // Table pagination
  const [flagPage, setFlagPage] = useState(1);
  const [rawPage, setRawPage] = useState(1);
  const PAGE_SIZE = 25;

  // ── CSV load ────────────────────────────────────────────────────────────
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
        // Reset filters
        setFilterEnumerator('__all__'); setFilterAdmin1('__all__'); setFilterAdmin2('__all__');
        setFilterAdmin3('__all__'); setFilterFlag('__all__'); setFilterDateFrom(''); setFilterDateTo(''); setSearch('');
        setFlagPage(1); setRawPage(1);
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

  // ── Filtered rows ────────────────────────────────────────────────────────
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

  // ── Derived chart data ───────────────────────────────────────────────────
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

  // ── Export helpers ────────────────────────────────────────────────────────
  function exportFlagsCSV() {
    if (!dataset) return;
    const cols = dataset.cols;
    const rows = flaggedFiltered;
    const headers = ['#', 'Enumerator', 'Date', 'QN', 'Admin3', 'Duration(min)', 'Flags', 'N/A Rate%'];
    const lines = [headers.join(',')];
    rows.forEach((r, i) => {
      lines.push([
        i + 1,
        `"${String(r[cols.enumerator] ?? '')}"`,
        String(r[cols.today] ?? ''),
        String(r[cols.questionnaireNo] ?? ''),
        `"${String(r[cols.admin3] ?? '').trim()}"`,
        r._durationMin !== null ? Math.round(r._durationMin) : '',
        `"${r._flags.join('; ')}"`,
        Math.round(r._naRate * 100),
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

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Data Quality Control
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload any ODK / KoBoCollect CSV export for instant QC analysis
          </p>
        </div>
        <div className="flex gap-2">
          {dataset && (
            <Button variant="outline" size="sm" onClick={() => setDataset(null)}>
              <Trash2 className="w-4 h-4 mr-1.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* ── Upload panel ───────────────────────────────────────────────── */}
      {!dataset && (
        <div className="bg-card border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><Upload className="w-4 h-4" /> Load Dataset</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}
          {loading ? (
            <div className="space-y-2 py-4">
              <p className="text-sm text-muted-foreground">Parsing and running QC checks…</p>
              <Progress value={loadProgress} className="h-2" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <DropZone
                onFile={handleCSV}
                accept=".csv"
                label="Raw Data (CSV)"
                icon={Table2}
              />
              <div className="border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 opacity-50 cursor-not-allowed">
                <FileText className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm font-medium">XLSForm (optional)</p>
                <p className="text-xs text-muted-foreground">Coming soon — for enhanced label & constraint checks</p>
              </div>
            </div>
          )}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400 space-y-1">
            <p className="font-semibold">Supported formats</p>
            <p>Any ODK / KoBoCollect / Enketo CSV export. The system auto-detects enumerator, GPS, timestamps, consent, and admin columns from the headers.</p>
            <p>All processing happens in your browser — no data is sent anywhere.</p>
          </div>
        </div>
      )}

      {/* ── Dataset loaded ─────────────────────────────────────────────── */}
      {dataset && (
        <>
          {/* Dataset chip + re-upload */}
          <div className="flex flex-wrap items-center gap-3 bg-card border rounded-xl px-4 py-3">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{dataset.name}</p>
              <p className="text-xs text-muted-foreground">
                Loaded {dataset.uploadedAt.toLocaleTimeString()} · {dataset.rows.length.toLocaleString()} submissions
              </p>
            </div>
            <label className="cursor-pointer">
              <Button variant="outline" size="sm" asChild>
                <span><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Upload new data</span>
              </Button>
              <input type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCSV(f); }} />
            </label>
          </div>

          {/* ── Global Filters ─────────────────────────────────────────── */}
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
                <Input type="date" className="h-9 text-xs flex-1" placeholder="From" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                <Input type="date" className="h-9 text-xs flex-1" placeholder="To" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Tabs ─────────────────────────────────────────────────────── */}
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="overview" className="text-xs"><BarChart3 className="w-3.5 h-3.5 mr-1" />Overview</TabsTrigger>
              <TabsTrigger value="enumerators" className="text-xs"><Users className="w-3.5 h-3.5 mr-1" />By Enumerator</TabsTrigger>
              <TabsTrigger value="flags" className="text-xs">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />QC Flags
                {flaggedFiltered.length > 0 && <Badge variant="destructive" className="ml-1.5 text-xs px-1.5 py-0">{flaggedFiltered.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="sampling" className="text-xs"><Map className="w-3.5 h-3.5 mr-1" />Sampling</TabsTrigger>
              <TabsTrigger value="timing" className="text-xs"><Clock className="w-3.5 h-3.5 mr-1" />Timing</TabsTrigger>
              <TabsTrigger value="rawdata" className="text-xs"><Table2 className="w-3.5 h-3.5 mr-1" />Raw Data</TabsTrigger>
            </TabsList>

            {/* ════════════════════════════════════════════════════════════
                TAB 1 — OVERVIEW
            ════════════════════════════════════════════════════════════ */}
            <TabsContent value="overview" className="space-y-4">
              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard label="Total Submissions" value={filteredRows.length.toLocaleString()} icon={FileText} color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" />
                <KpiCard label="Flagged" value={flaggedFiltered.length.toLocaleString()} sub={`${filteredRows.length > 0 ? Math.round((flaggedFiltered.length / filteredRows.length) * 100) : 0}% of total`} icon={AlertTriangle} color="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" />
                <KpiCard label="Clean Rate" value={filteredRows.length > 0 ? `${Math.round(((filteredRows.length - flaggedFiltered.length) / filteredRows.length) * 100)}%` : '—'} icon={CheckCircle2} color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" />
                <KpiCard label="Enumerators" value={filterEnumerator === '__all__' ? dataset.summary.enumerators.length : 1} icon={Users} color="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" />
                <KpiCard label="Avg Duration" value={fmtMin((() => { const d = filteredRows.map(r => r._durationMin).filter((v): v is number => v !== null); return d.length ? Math.round(d.reduce((a,b)=>a+b,0)/d.length) : null; })())} icon={Clock} color="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" />
                <KpiCard label="Missing GPS" value={`${filteredRows.length > 0 ? Math.round((filteredRows.filter(r=>r._flags.includes('MISSING_GPS')).length/filteredRows.length)*100) : 0}%`} sub={`${filteredRows.filter(r=>r._flags.includes('MISSING_GPS')).length} rows`} icon={MapPin} color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" />
              </div>

              {/* Date range badge */}
              {dataset.summary.dateRange.min && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="w-4 h-4" />
                  Data from <strong>{dataset.summary.dateRange.min}</strong> to <strong>{dataset.summary.dateRange.max}</strong>
                </div>
              )}

              {/* Charts row */}
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Daily submissions */}
                <div className="bg-card border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Daily Submissions</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dailyData} barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RTooltip contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="clean" stackId="a" name="Clean" fill="#10b981" radius={[0,0,0,0]} />
                      <Bar dataKey="flagged" stackId="a" name="Flagged" fill="#f59e0b" radius={[3,3,0,0]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Flag breakdown */}
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

              {/* Clean rate per enumerator sparkline */}
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

            {/* ════════════════════════════════════════════════════════════
                TAB 2 — BY ENUMERATOR
            ════════════════════════════════════════════════════════════ */}
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
                      <TableHead className="text-right hidden xl:table-cell">Days Active</TableHead>
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

            {/* ════════════════════════════════════════════════════════════
                TAB 3 — QC FLAGS
            ════════════════════════════════════════════════════════════ */}
            <TabsContent value="flags" className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {flaggedFiltered.length.toLocaleString()} flagged submissions
                </p>
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
                          const enu = cols.enumerator ? String(row[cols.enumerator] ?? '') : '';
                          const date = cols.today ? String(row[cols.today] ?? '') : '';
                          const qn = cols.questionnaireNo ? String(row[cols.questionnaireNo] ?? '') : '';
                          const a3 = cols.admin3 ? String(row[cols.admin3] ?? '').trim() : '';
                          return (
                            <TableRow key={i} className="text-xs">
                              <TableCell className="text-muted-foreground">{(flagPage - 1) * PAGE_SIZE + i + 1}</TableCell>
                              <TableCell className="font-medium">{enu}</TableCell>
                              <TableCell>{date}</TableCell>
                              <TableCell>{qn}</TableCell>
                              <TableCell className="hidden md:table-cell">{a3}</TableCell>
                              <TableCell className="text-right hidden md:table-cell">{fmtMin(row._durationMin)}</TableCell>
                              <TableCell className="text-right hidden sm:table-cell">{Math.round(row._naRate * 100)}%</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {row._flags.map(f => <FlagBadge key={f} flag={f} />)}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Pagination */}
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

            {/* ════════════════════════════════════════════════════════════
                TAB 4 — SAMPLING COVERAGE
            ════════════════════════════════════════════════════════════ */}
            <TabsContent value="sampling" className="space-y-4">
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Area bar chart */}
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

                {/* Table */}
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

              {/* Admin mismatch alert */}
              {(() => {
                const mm = filteredRows.filter(r => r._flags.includes('ADMIN_MISMATCH'));
                if (mm.length === 0) return null;
                return (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 text-sm">
                    <p className="font-semibold text-yellow-700 dark:text-yellow-400 mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> {mm.length} submissions have inconsistent locality name spelling
                    </p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-500">The same admin3 code is used with different name spellings. This affects grouping and coverage calculation. Review and standardise names.</p>
                  </div>
                );
              })()}
            </TabsContent>

            {/* ════════════════════════════════════════════════════════════
                TAB 5 — TIMING
            ════════════════════════════════════════════════════════════ */}
            <TabsContent value="timing" className="space-y-4">
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Duration histogram */}
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
                  <p className="text-xs text-muted-foreground mt-2 text-center">Red = too short (&lt;10m), yellow = too long (&gt;4h)</p>
                </div>

                {/* Submissions over time line chart */}
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

              {/* Night / fast-sequence alerts */}
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { flag: 'NIGHT_SUBMISSION' as QCFlagType, label: 'Night Submissions (before 06:00 or after 19:00)', color: 'yellow' },
                  { flag: 'FAST_SEQUENCE' as QCFlagType, label: 'Fast Sequence (< 5 min between consecutive submissions)', color: 'orange' },
                ].map(({ flag, label, color }) => {
                  const count = filteredRows.filter(r => r._flags.includes(flag)).length;
                  return (
                    <div key={flag} className={cn('rounded-xl border p-4', color === 'yellow' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800')}>
                      <p className={cn('font-semibold text-sm mb-1', color === 'yellow' ? 'text-yellow-700 dark:text-yellow-400' : 'text-orange-700 dark:text-orange-400')}>
                        {count} {label}
                      </p>
                      {count > 0 && (
                        <p className="text-xs text-muted-foreground">Use the QC Flags tab to review these submissions.</p>
                      )}
                      {count === 0 && <p className="text-xs text-green-600">None detected ✓</p>}
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* ════════════════════════════════════════════════════════════
                TAB 6 — RAW DATA
            ════════════════════════════════════════════════════════════ */}
            <TabsContent value="rawdata" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Showing {Math.min(rawPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length.toLocaleString()} rows · first 10 columns visible
              </p>
              <div className="bg-card border rounded-xl overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="sticky left-0 bg-card z-10">Flags</TableHead>
                      {dataset.headers.slice(0, 10).map(h => (
                        <TableHead key={h} className="whitespace-nowrap max-w-[140px] truncate" title={h}>{h.split('/').pop()}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.slice((rawPage - 1) * PAGE_SIZE, rawPage * PAGE_SIZE).map((row, i) => (
                      <TableRow key={i} className={cn('text-xs', row._flags.length > 0 ? 'bg-orange-50/50 dark:bg-orange-900/10' : '')}>
                        <TableCell className="sticky left-0 bg-card z-10">
                          {row._flags.length > 0
                            ? <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                            : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                        </TableCell>
                        {dataset.headers.slice(0, 10).map(h => (
                          <TableCell key={h} className="max-w-[140px] truncate" title={String(row[h] ?? '')}>
                            <span className={String(row[h] ?? '').toLowerCase() === 'n/a' ? 'text-muted-foreground/50' : ''}>
                              {String(row[h] ?? '')}
                            </span>
                          </TableCell>
                        ))}
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
    </div>
  );
}
