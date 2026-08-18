
import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Upload, AlertCircle, CheckCircle2, Info, Loader2, Download, Search,
  XCircle, AlertTriangle, ChevronDown, ChevronUp, Plus, X as XIcon,
  Database, FileSpreadsheet,
} from 'lucide-react';
import type { WizardState } from '../CycleCloseWizard';
import { runMatching, type MatchCandidate, type MatchPair } from '@/utils/fuzzyMatcher';
import { exportFormattedMatchingReport } from '@/utils/cycleCloseExport';

// ─── MMP columns to fetch from the database ────────────────────────────────
// NOTE: accepted_by is a plain text / uuid column with no FK to profiles,
// so we must NOT use a join hint here — it causes a 400 and kills the load.
// Enumerator names are resolved separately after the main fetch.
const MMP_MATCH_COLS =
  'id, site_code, site_name, state, locality, hub_office, cp_name, ' +
  'activity_at_site, main_activity, monitoring_by, visit_type, visit_date, ' +
  'accepted_by';

// Human-readable labels for MMP DB columns shown in the UI
const MMP_COL_LABELS: Record<string, string> = {
  site_code:       'Site Code',
  site_name:       'Site Name',
  state:           'State',
  locality:        'Locality',
  hub_office:      'Hub / Office',
  cp_name:         'CP Name',
  activity_at_site:'Activity at Site',
  main_activity:   'Main Activity',
  monitoring_by:   'Monitoring By',
  visit_type:      'Visit Type',
  visit_date:      'Visit Date',
  enumerator_name: 'Enumerator (Claimed By)',
};

// ─── Auto-detect pairs: map MMP column → likely WFP file column ────────────
const MMP_MATCH_ALIASES: Array<{ mmpCol: string; keywords: string[] }> = [
  { mmpCol: 'site_name',       keywords: ['select the activity site', 'activity site', 'site name', 'location name', 'site', 'village', 'موقع'] },
  { mmpCol: 'state',           keywords: ['state of the site', 'state', 'governorate', 'ولاية'] },
  { mmpCol: 'locality',        keywords: ['locality of the site', 'locality', 'district', 'محلية'] },
  { mmpCol: 'activity_at_site',keywords: ['confirm the activity', 'activity of the site', 'activity', 'programme', 'النشاط'] },
  { mmpCol: 'enumerator_name', keywords: ['name of interviewer', 'enumerator name', 'enumerator', 'data collector', 'interviewer', 'المعدد', 'اسم المعدد'] },
  { mmpCol: 'monitoring_by',   keywords: ['monitoring by', 'monitored by', 'رقابة', 'مراقب'] },
  { mmpCol: 'site_code',       keywords: ['deviceid', 'device id', '_uuid', 'uuid', 'submission_id'] },
  { mmpCol: 'hub_office',      keywords: ['hub', 'office'] },
  { mmpCol: 'cp_name',         keywords: ['cp name', 'cooperating partner', 'community point'] },
];

function autoDetectPairs(mmpCols: string[], wfpCols: string[]): MatchPair[] {
  const pairs: MatchPair[] = [];
  const usedWfp = new Set<string>();
  const wfpLower = wfpCols.map(c => c.toLowerCase());

  for (const { mmpCol, keywords } of MMP_MATCH_ALIASES) {
    if (!mmpCols.includes(mmpCol)) continue;
    let matched: string | null = null;
    outer:
    for (const kw of keywords) {
      for (let i = 0; i < wfpCols.length; i++) {
        if (!usedWfp.has(wfpCols[i]) && wfpLower[i].includes(kw)) {
          matched = wfpCols[i];
          break outer;
        }
      }
    }
    if (matched) {
      pairs.push({ mmpColumn: mmpCol, wfpColumn: matched });
      usedWfp.add(matched);
    }
  }
  return pairs;
}

// ─── Component ─────────────────────────────────────────────────────────────
interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  canAdvance: boolean;
  canGoBack: boolean;
  currentUser: any;
}

export default function Step2UploadMatch({
  wizardState, updateWizardState, onNext, onBack, canAdvance, canGoBack, currentUser,
}: Props) {
  const [dragOver, setDragOver]         = useState(false);
  const [fileError, setFileError]       = useState<string | null>(null);
  const [previewRowCount, setPreviewRowCount] = useState(5);
  const [selectedPreviewCols, setSelectedPreviewCols] = useState<string[]>([]);
  const [colSearch, setColSearch]       = useState('');
  const [rememberMapping, setRememberMapping] = useState(false);
  const [running, setRunning]           = useState(false);
  const [manualSearch, setManualSearch] = useState<Record<number, string>>({});
  const [manualCandidates, setManualCandidates] = useState<Record<number, MatchCandidate[]>>({});
  const [showReviewTable, setShowReviewTable] = useState(true);
  const [showMmpPreview, setShowMmpPreview] = useState(false);
  const [showNotInClean, setShowNotInClean] = useState(false);
  const [expandedReviewRows, setExpandedReviewRows] = useState<Set<number>>(new Set());
  const [candidates, setCandidates]     = useState<MatchCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [profileNameMap, setProfileNameMap] = useState<Record<string, string>>({});

  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  // Track whether pairs have been auto-initialised for the current MMP + file combo
  const [pairsInitialized, setPairsInitialized] = useState(false);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const lastColumnsKey = useRef('');

  // ── Load MMP candidates when cycle selected ───────────────────────────────
  useEffect(() => {
    if (wizardState.selectedMmpId) loadCandidates();
  }, [wizardState.selectedMmpId]);

  // ── Guard: warn and abort if Run Matching is attempted with no candidates ──
  // (candidates is local state and can be empty on resume before DB fetch completes)

  // ── Re-initialise preview columns when new file loaded ────────────────────
  useEffect(() => {
    const key = wizardState.fileColumns.join('|||');
    if (wizardState.fileColumns.length > 0 && key !== lastColumnsKey.current) {
      lastColumnsKey.current = key;
      setSelectedPreviewCols(wizardState.fileColumns);
      setPreviewRowCount(5);
    }
  }, [wizardState.fileColumns]);

  // ── Auto-detect pairs once both MMP cols and WFP columns are available ────
  useEffect(() => {
    if (
      !pairsInitialized &&
      candidates.length > 0 &&
      wizardState.mmpColumns.length > 0 &&
      wizardState.fileColumns.length > 0
    ) {
      // Only auto-detect when there are no configured pairs yet.
      // Do NOT overwrite pairs the user already set (e.g. on resume or manual config).
      if (wizardState.matchingPairs.length === 0) {
        const pairs = autoDetectPairs(wizardState.mmpColumns, wizardState.fileColumns);
        if (pairs.length > 0) {
          updateWizardState({ matchingPairs: pairs });
        }
        // Always mark initialized — even if 0 pairs were detected — so the effect
        // stops re-running and the user can manually configure pairs.
      }
      setPairsInitialized(true);
    }
  }, [candidates.length, wizardState.mmpColumns.length, wizardState.fileColumns.length, pairsInitialized]);

  // ── Fetch all matchable columns from mmp_site_entries ────────────────────
  const loadCandidates = async () => {
    setCandidatesLoading(true);
    const { data, error } = await supabase
      .from('mmp_site_entries')
      .select(MMP_MATCH_COLS)
      .eq('mmp_file_id', wizardState.selectedMmpId!);

    if (error) {
      console.error('loadCandidates error:', error);
      setCandidatesLoading(false);
      return;
    }

    const rows = data ?? [];

    // Build candidates from plain columns (no join — see MMP_MATCH_COLS note)
    const cands: MatchCandidate[] = rows.map((e: any) => {
      const { id, ...rest } = e;
      return {
        siteId: String(id),
        data: Object.fromEntries(
          Object.entries(rest).map(([k, v]) => [k, v == null ? '' : String(v)])
        ),
      };
    });

    const mmpCols = rows.length > 0
      ? Object.keys(rows[0]).filter(k => k !== 'id')
      : Object.keys(MMP_COL_LABELS);

    setCandidates(cands);
    updateWizardState({
      mmpColumns: mmpCols,
      mmpRawRows: cands.map(c => c.data),
    });

    // Resolve UUID-shaped accepted_by values to profile names (secondary lookup —
    // no FK exists so we can't join directly).
    const isUuid = (v: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const uuids = [...new Set(
      cands.map(c => c.data['accepted_by']).filter(v => v && isUuid(v))
    )];
    if (uuids.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', uuids);
      const map: Record<string, string> = {};
      for (const p of profiles ?? []) if (p.full_name) map[p.id] = p.full_name;
      setProfileNameMap(map);
    }

    setCandidatesLoading(false);
    // Trigger pair auto-detect on next render
    setPairsInitialized(false);
  };

  // ── Parse uploaded WFP file ───────────────────────────────────────────────
  const parseFile = (file: File) => {
    setFileError(null);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
      setFileError('This file type is not supported. Upload an .xlsx, .xls, or .csv file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = e.target?.result;
        const wb = XLSX.read(new Uint8Array(raw as ArrayBuffer), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        if (!json.length) {
          setFileError('The file appears to be empty. Check the file and try again.');
          return;
        }
        const columns = Object.keys(json[0]);
        const allRows = json.map(r =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))
        );

        // Reset pair initialisation so pairs re-detect with new file columns
        setPairsInitialized(false);
        setPreviewCollapsed(false);

        updateWizardState({
          uploadedFileName: file.name,
          fileRows: allRows,
          fileColumns: columns,
          columnMapping: {},   // legacy field – cleared on new file
          fileConfirmed: false,
          matchingPairs: [],   // will re-detect via useEffect above
        });
      } catch {
        setFileError('Could not read this file. Make sure it is a valid Excel or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  };

  // ── Pair management ───────────────────────────────────────────────────────
  const updatePair = (idx: number, field: 'mmpColumn' | 'wfpColumn', value: string) => {
    const pairs = [...wizardState.matchingPairs];
    pairs[idx] = { ...pairs[idx], [field]: value };
    updateWizardState({ matchingPairs: pairs });
  };
  const removePair = (idx: number) => {
    updateWizardState({ matchingPairs: wizardState.matchingPairs.filter((_, i) => i !== idx) });
  };
  const addPair = () => {
    updateWizardState({ matchingPairs: [...wizardState.matchingPairs, { mmpColumn: '', wfpColumn: '' }] });
  };

  // ── Run the matching algorithm ────────────────────────────────────────────
  const runMatch = async () => {
    // candidates is local state — if the component mounted from a resume and
    // the DB fetch hasn't completed yet, reload before running.
    let activeCandidates = candidates;
    if (activeCandidates.length === 0 && wizardState.selectedMmpId) {
      setCandidatesLoading(true);
      const { data } = await supabase
        .from('mmp_site_entries')
        .select(MMP_MATCH_COLS)
        .eq('mmp_file_id', wizardState.selectedMmpId);
      activeCandidates = (data ?? []).map((e: any) => {
        const { id, ...rest } = e;
        return {
          siteId: String(id),
          data: Object.fromEntries(
            Object.entries(rest).map(([k, v]) => [k, v == null ? '' : String(v)])
          ),
        };
      });
      setCandidates(activeCandidates);
      setCandidatesLoading(false);
    }

    setRunning(true);
    await new Promise(r => setTimeout(r, 80));
    const results = runMatching(wizardState.fileRows, wizardState.matchingPairs, activeCandidates);

    // Detect MMP sites that were never matched by any WFP row — these are "Not in clean data"
    // and must flow into Step 4 as uncovered sites needing a reason.
    const matchedSiteIds = new Set(
      results.map(r => r.matchedSiteId).filter(Boolean) as string[]
    );
    const unmatchedMmpSiteIds = candidates
      .filter(c => !matchedSiteIds.has(c.siteId))
      .map(c => c.siteId);

    updateWizardState({ matchResults: results, unmatchedMmpSiteIds });
    setRunning(false);
  };

  // ── Row action handlers ───────────────────────────────────────────────────
  const handleAction = (rowIndex: number, action: 'confirm' | 'link' | 'extra' | 'reject') => {
    const updated = wizardState.matchResults.map(r =>
      r.rowIndex === rowIndex ? { ...r, action, status: 'actioned' as const } : r
    );
    // Recompute unmatchedMmpSiteIds so confirmed/linked sites leave the "Not in clean data" list
    const matchedSiteIds = new Set(updated.map(r => r.matchedSiteId).filter(Boolean) as string[]);
    const unmatchedMmpSiteIds = candidates
      .filter(c => !matchedSiteIds.has(c.siteId))
      .map(c => c.siteId);
    updateWizardState({ matchResults: updated, unmatchedMmpSiteIds });
  };

  const handleManualSearch = async (rowIndex: number, query: string) => {
    setManualSearch(prev => ({ ...prev, [rowIndex]: query }));
    if (!query.trim()) {
      setManualCandidates(prev => ({ ...prev, [rowIndex]: [] }));
      return;
    }
    const q = query.toLowerCase();
    const results = candidates.filter(c =>
      (c.data.site_name ?? '').toLowerCase().includes(q) ||
      (c.data.locality ?? '').toLowerCase().includes(q)
    ).slice(0, 8);
    setManualCandidates(prev => ({ ...prev, [rowIndex]: results }));
  };

  const handleManualLink = (rowIndex: number, candidate: MatchCandidate) => {
    const updated = wizardState.matchResults.map(r =>
      r.rowIndex === rowIndex ? {
        ...r,
        matchedSiteId: candidate.siteId,
        matchedSiteName: candidate.data.site_name ?? candidate.data[wizardState.matchingPairs[0]?.mmpColumn ?? ''] ?? '',
        matchScore: 100,
        matchLevel: 'exact' as const,
        status: 'actioned' as const,
        action: 'confirm' as const,
        manualMatchSiteId: candidate.siteId,
        manualMatchBy: currentUser?.full_name ?? 'User',
        manualMatchAt: new Date().toISOString(),
      } : r
    );
    // Recompute unmatchedMmpSiteIds so the newly linked site leaves the "Not in clean data" list
    const matchedSiteIds = new Set(updated.map(r => r.matchedSiteId).filter(Boolean) as string[]);
    const unmatchedMmpSiteIds = candidates
      .filter(c => !matchedSiteIds.has(c.siteId))
      .map(c => c.siteId);
    updateWizardState({ matchResults: updated, unmatchedMmpSiteIds });
    setManualSearch(prev => ({ ...prev, [rowIndex]: '' }));
    setManualCandidates(prev => ({ ...prev, [rowIndex]: [] }));
  };

  const markAllUnmatched = () => {
    const updated = wizardState.matchResults.map(r =>
      r.status === 'review' ? { ...r, action: 'reject' as const, status: 'actioned' as const } : r
    );
    updateWizardState({ matchResults: updated });
  };

  const exportMatchingReport = () => {
    void exportFormattedMatchingReport(wizardState);
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const matchResults   = wizardState.matchResults;
  const autoCount      = matchResults.filter(r => r.status === 'auto').length;
  const reviewCount    = matchResults.filter(r => r.status === 'review').length;
  const unmatchedCount = matchResults.filter(r => r.status === 'unmatched').length;
  const needsReview    = matchResults.filter(r => r.status === 'review');
  const unmatchedRows  = matchResults.filter(r => r.status === 'unmatched');
  const hasValidPairs  = wizardState.matchingPairs.some(p => p.mmpColumn && p.wfpColumn);

  // Derive "not in clean data" live from current matchResults so any manual
  // confirm/link immediately removes the site from this list (fixes stale count).
  const matchedSiteIdsLive = new Set(
    matchResults.map(r => r.matchedSiteId).filter(Boolean) as string[]
  );
  const notInCleanCands = candidates.filter(c => !matchedSiteIdsLive.has(c.siteId));

  // Primary WFP display column (first valid pair's wfp side)
  const primaryPair = wizardState.matchingPairs.find(p => p.mmpColumn && p.wfpColumn);
  const secondaryPairs = wizardState.matchingPairs
    .filter(p => p.mmpColumn && p.wfpColumn && p !== primaryPair)
    .slice(0, 2);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Step 2 — Upload &amp; Match Clean Data (WFP File)</h2>
        <p className="text-sm text-muted-foreground mt-0.5" dir="rtl">الخطوة ٢ — رفع الملف والمطابقة مع بيانات برنامج الغذاء</p>
        <p className="text-muted-foreground text-sm">
          Upload the WFP-provided clean data file and define which columns to match against the MMP site entries.
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <p className="font-medium">Why this step matters</p>
          <p className="mt-0.5">
            Nothing financial can be finalised until the WFP clean data is uploaded and matched.
            Define which column in each file represents the same field, then run the match.
          </p>
        </div>
      </div>

      {/* 2a — Upload Zone */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm">2a — Upload WFP Clean Data File</h3>
        <input
          ref={fileInputRef}
          id="wfp-file-upload"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileInput}
          data-testid="input-wfp-file"
        />
        <label
          htmlFor="wfp-file-upload"
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'}`}
          data-testid="upload-dropzone"
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="font-medium text-sm">
            {wizardState.uploadedFileName
              ? <><FileSpreadsheet className="inline h-4 w-4 mr-1 text-green-600" />{wizardState.uploadedFileName}</>
              : 'Drag & drop or click to upload'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Accepted: .xlsx, .xls, .csv</p>
        </label>
        {fileError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{fileError}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* WFP File Preview — kept in DOM always (CSS hidden) to prevent Radix unmount crash */}
      {wizardState.fileColumns.length > 0 && (() => {
        const cols = wizardState.fileColumns;
        const previewRows = wizardState.fileRows.slice(0, previewRowCount);
        const searchLower = colSearch.toLowerCase();
        const visibleCols = cols.filter(c => !searchLower || c.toLowerCase().includes(searchLower));

        return (
          <div className={`border rounded-lg overflow-hidden shadow-sm${previewCollapsed ? ' hidden' : ''}`}>
            <div className="bg-muted/40 border-b px-4 py-3 flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-semibold">WFP File Preview</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cols.length} columns · {wizardState.fileRows.length} rows · {wizardState.uploadedFileName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Preview rows:</span>
                <Select value={String(previewRowCount)} onValueChange={v => setPreviewRowCount(Number(v))}>
                  <SelectTrigger className="h-7 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 20, 50].map(n => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex divide-x" style={{ minHeight: 260 }}>
              {/* Left: column selector */}
              <div className="w-64 flex-shrink-0 flex flex-col bg-muted/10">
                <div className="px-3 pt-3 pb-2 space-y-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="h-8 pl-8 text-xs"
                      placeholder="Search columns…"
                      value={colSearch}
                      onChange={e => setColSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{selectedPreviewCols.length}/{cols.length}</span>
                    <div className="flex gap-2">
                      <button type="button" className="text-primary hover:underline text-xs" onClick={() => setSelectedPreviewCols(cols)}>All</button>
                      <button type="button" className="text-muted-foreground hover:underline text-xs" onClick={() => setSelectedPreviewCols([])}>None</button>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                  {visibleCols.map(col => (
                    <label key={col} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted/50 ${selectedPreviewCols.includes(col) ? 'bg-primary/5' : ''}`}>
                      <Checkbox
                        checked={selectedPreviewCols.includes(col)}
                        onCheckedChange={checked =>
                          setSelectedPreviewCols(prev => checked ? [...prev, col] : prev.filter(c => c !== col))
                        }
                        className="h-3.5 w-3.5"
                      />
                      <p className="text-xs leading-tight break-all min-w-0">{col}</p>
                    </label>
                  ))}
                  {visibleCols.length === 0 && (
                    <p className="px-3 py-4 text-xs text-muted-foreground italic">No columns match "{colSearch}"</p>
                  )}
                </div>
              </div>

              {/* Right: data table */}
              <div className="flex-1 min-w-0 flex flex-col">
                {selectedPreviewCols.length > 0 ? (
                  <div className="overflow-auto flex-1">
                    <table className="text-xs w-full border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr>
                          <th className="border-b border-r px-2 py-1.5 bg-muted text-center text-muted-foreground font-normal w-8">#</th>
                          {selectedPreviewCols.map(c => (
                            <th key={c} title={c} className="border-b border-r px-3 py-1.5 text-left font-semibold whitespace-nowrap bg-muted text-foreground">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                            <td className="border-b border-r px-2 py-1.5 text-center text-muted-foreground">{i + 1}</td>
                            {selectedPreviewCols.map(c => (
                              <td key={c} title={String(row[c] ?? '')} className="border-b border-r px-3 py-1.5 max-w-[180px] truncate">
                                {row[c] || <span className="text-muted-foreground/50 italic text-[10px]">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-8 text-center">
                    <div>
                      <Info className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Select columns on the left to preview data</p>
                    </div>
                  </div>
                )}

                <div className="border-t px-4 py-2.5 flex items-center justify-between bg-muted/20">
                  <p className="text-xs text-muted-foreground">
                    Showing <span className="font-medium">{previewRows.length}</span> of{' '}
                    <span className="font-medium">{wizardState.fileRows.length}</span> rows
                    {selectedPreviewCols.length > 0 && <> · <span className="font-medium">{selectedPreviewCols.length}</span> cols</>}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={e => { e.stopPropagation(); e.preventDefault(); setPreviewCollapsed(true); }}
                    data-testid="button-apply-file"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Apply File
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 2b — Column Matching Setup */}
      {wizardState.fileColumns.length > 0 && (
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-medium text-sm">2b — Column Matching Setup</h3>
            {hasValidPairs && (
              <Badge className="bg-green-100 text-green-700 border-green-300">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {wizardState.matchingPairs.filter(p => p.mmpColumn && p.wfpColumn).length} pair{wizardState.matchingPairs.filter(p => p.mmpColumn && p.wfpColumn).length !== 1 ? 's' : ''} defined
              </Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Choose which column in the <strong>MMP system data</strong> (left) should be compared against which column
            in your <strong>uploaded WFP file</strong> (right). The first pair is the primary field — give it the most weight.
            Add more pairs for higher accuracy.
          </p>

          {/* MMP ↔ WFP column overview */}
          {candidates.length > 0 && (() => {
            const usedMmp = new Set(wizardState.matchingPairs.map(p => p.mmpColumn).filter(Boolean));
            const usedWfp = new Set(wizardState.matchingPairs.map(p => p.wfpColumn).filter(Boolean));
            return (
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                {/* Header row */}
                <div className="flex items-center justify-between px-3 py-2 border-b bg-white/60 dark:bg-slate-800/60">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Column Overview</span>
                    <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-xs">
                      {candidates.length} MMP entries
                    </Badge>
                    <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-xs">
                      {wizardState.fileColumns.length} WFP cols
                    </Badge>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setShowMmpPreview(p => !p)}
                  >
                    {showMmpPreview ? 'Hide data preview' : 'Show data preview'}
                  </button>
                </div>

                {/* Two-column layout: MMP | WFP */}
                <div className="grid grid-cols-2 divide-x text-xs">
                  {/* MMP columns */}
                  <div className="p-2.5 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 mb-1.5">
                      MMP System Columns
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {wizardState.mmpColumns.map(col => {
                        const active = usedMmp.has(col);
                        return (
                          <span
                            key={col}
                            title={MMP_COL_LABELS[col] ?? col}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-mono
                              ${active
                                ? 'bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900/50 dark:border-blue-500 dark:text-blue-200'
                                : 'bg-white border-slate-200 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                              }`}
                          >
                            {active && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                            {col}
                            {MMP_COL_LABELS[col] && (
                              <span className="font-sans font-normal opacity-70">({MMP_COL_LABELS[col]})</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* WFP file columns */}
                  <div className="p-2.5 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 mb-1.5">
                      WFP File Columns
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {wizardState.fileColumns.map(col => {
                        const active = usedWfp.has(col);
                        return (
                          <span
                            key={col}
                            title={col}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-mono
                              ${active
                                ? 'bg-purple-100 border-purple-400 text-purple-800 dark:bg-purple-900/50 dark:border-purple-500 dark:text-purple-200'
                                : 'bg-white border-slate-200 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                              }`}
                          >
                            {active && <span className="h-1.5 w-1.5 rounded-full bg-purple-500 flex-shrink-0" />}
                            {col}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Active pairs summary strip */}
                {usedMmp.size > 0 && (
                  <div className="border-t px-3 py-2 bg-green-50/60 dark:bg-green-900/10 flex flex-wrap gap-2 items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400 flex-shrink-0">
                      Active pairs:
                    </span>
                    {wizardState.matchingPairs
                      .filter(p => p.mmpColumn && p.wfpColumn)
                      .map((p, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-white dark:bg-slate-700 border border-green-200 dark:border-green-700 rounded px-2 py-0.5">
                          <span className="text-blue-700 dark:text-blue-300 font-mono">{MMP_COL_LABELS[p.mmpColumn] ?? p.mmpColumn}</span>
                          <span className="text-muted-foreground">↔</span>
                          <span className="text-purple-700 dark:text-purple-300 font-mono">{p.wfpColumn}</span>
                        </span>
                      ))
                    }
                  </div>
                )}

                {/* MMP data preview table */}
                {showMmpPreview && candidates.length > 0 && (
                  <div className="overflow-x-auto border-t">
                    <table className="text-xs w-full border-collapse">
                      <thead>
                        <tr className="bg-muted">
                          {wizardState.mmpColumns.map(c => (
                            <th key={c} className={`border-b border-r px-2 py-1.5 text-left font-semibold whitespace-nowrap
                              ${usedMmp.has(c) ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200' : ''}`}>
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.slice(0, 5).map((c, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                            {wizardState.mmpColumns.map(col => (
                              <td key={col} className={`border-b border-r px-2 py-1 max-w-[160px] truncate
                                ${usedMmp.has(col) ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}
                                title={c.data[col]}>
                                {c.data[col] || <span className="text-muted-foreground/50 italic">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-t bg-muted/20">
                      Showing first 5 of {candidates.length} MMP entries · highlighted columns are active in matching pairs
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Pair rows */}
          <div className="space-y-2">
            {/* Header labels */}
            {wizardState.matchingPairs.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <span className="w-16 flex-shrink-0" />
                <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MMP System Column</span>
                <span className="w-5 flex-shrink-0" />
                <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">WFP File Column</span>
                <span className="w-7 flex-shrink-0" />
              </div>
            )}

            {wizardState.matchingPairs.map((pair, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {/* Primary / secondary badge */}
                <span className={`text-[10px] font-bold w-16 flex-shrink-0 text-right pr-1 ${idx === 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                  {idx === 0 ? 'PRIMARY' : `PAIR ${idx + 1}`}
                </span>

                {/* MMP column */}
                <Select
                  value={pair.mmpColumn || '__none__'}
                  onValueChange={v => updatePair(idx, 'mmpColumn', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="flex-1 h-8 text-xs" data-testid={`select-mmp-col-${idx}`}>
                    <SelectValue placeholder="MMP column…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Choose MMP column —</SelectItem>
                    {(wizardState.mmpColumns.length > 0 ? wizardState.mmpColumns : Object.keys(MMP_COL_LABELS)).map(c => (
                      <SelectItem key={c} value={c}>
                        {c}{MMP_COL_LABELS[c] ? ` (${MMP_COL_LABELS[c]})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="text-xs text-muted-foreground flex-shrink-0">↔</span>

                {/* WFP file column */}
                <Select
                  value={pair.wfpColumn || '__none__'}
                  onValueChange={v => updatePair(idx, 'wfpColumn', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="flex-1 h-8 text-xs" data-testid={`select-wfp-col-${idx}`}>
                    <SelectValue placeholder="WFP file column…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Choose WFP column —</SelectItem>
                    {wizardState.fileColumns.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={() => removePair(idx)}
                  data-testid={`button-remove-pair-${idx}`}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={addPair}
              data-testid="button-add-pair"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add matching column
            </Button>

            {wizardState.matchingPairs.length === 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Add at least one pair to run the match
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 border-t pt-3">
            <Checkbox
              id="remember-mapping"
              checked={rememberMapping}
              onCheckedChange={v => setRememberMapping(!!v)}
            />
            <label htmlFor="remember-mapping" className="text-xs text-muted-foreground">
              Remember this mapping for next upload
            </label>
          </div>

          {candidatesLoading && (
            <p className="text-xs text-amber-700 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading MMP site data… wait before running match
            </p>
          )}
          {!candidatesLoading && candidates.length === 0 && wizardState.selectedMmpId && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" />
              No MMP site entries found for this cycle — check the selected cycle
            </p>
          )}
          <Button
            type="button"
            size="sm"
            onClick={runMatch}
            disabled={!hasValidPairs || running || candidatesLoading}
            data-testid="button-run-match"
          >
            {(running || candidatesLoading) ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            {running ? 'Running match…' : candidatesLoading ? 'Loading site data…' : 'Run Matching'}
          </Button>
        </div>
      )}

      {/* Match Summary */}
      {matchResults.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 rounded-lg p-3 text-center">
              <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-green-700">
                {autoCount + matchResults.filter(r => r.status === 'actioned' && (r.action === 'confirm' || r.action === 'extra')).length}
              </p>
              <p className="text-xs text-green-600">Confirmed / Extra</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-lg p-3 text-center">
              <AlertTriangle className="h-5 w-5 text-amber-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-amber-700">{reviewCount}</p>
              <p className="text-xs text-amber-600">Needs review</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-lg p-3 text-center">
              <XCircle className="h-5 w-5 text-red-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-red-700">{unmatchedCount}</p>
              <p className="text-xs text-red-600">Unmatched rows</p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotInClean(p => !p)}
              className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 rounded-lg p-3 text-center hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors w-full"
            >
              <AlertCircle className="h-5 w-5 text-slate-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-slate-700">{notInCleanCands.length}</p>
              <p className="text-xs text-slate-500">Not in clean data</p>
              <p className="text-[10px] text-primary mt-0.5">{showNotInClean ? 'Hide ▲' : 'Show sites ▼'}</p>
            </button>
          </div>

          {/* Not-in-clean-data detail panel */}
          {showNotInClean && notInCleanCands.length > 0 && (() => {
            return (
              <div className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-slate-500" />
                    MMP Sites Not in WFP Clean Data ({notInCleanCands.length})
                  </span>
                  <span className="text-xs text-muted-foreground">These sites exist in the MMP system but had no matching WFP row — they will flow into Step 4 as uncovered sites</span>
                </div>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">#</th>
                        <th className="px-3 py-2 text-left font-medium">Site Name</th>
                        <th className="px-3 py-2 text-left font-medium">State</th>
                        <th className="px-3 py-2 text-left font-medium">Locality</th>
                        <th className="px-3 py-2 text-left font-medium">Hub / Office</th>
                        <th className="px-3 py-2 text-left font-medium">Site Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notInCleanCands.map((c, i) => (
                        <tr key={c.siteId} className={`border-t ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                          <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1.5 font-medium">{c.data.site_name || '—'}</td>
                          <td className="px-3 py-1.5">{c.data.state || '—'}</td>
                          <td className="px-3 py-1.5">{c.data.locality || '—'}</td>
                          <td className="px-3 py-1.5">{c.data.hub_office || '—'}</td>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{c.data.site_code || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t px-4 py-2 bg-muted/20 text-[10px] text-muted-foreground">
                  Showing all {notInCleanCands.length} sites · assign reasons in Step 4
                </div>
              </div>
            );
          })()}

          {/* Review Table */}
          {(needsReview.length > 0 || unmatchedRows.length > 0) && (
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
                <span className="text-sm font-medium">
                  Rows Needing Action ({needsReview.length + unmatchedRows.length})
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={markAllUnmatched}
                    className="text-xs h-7"
                    data-testid="button-mark-all-unmatched"
                  >
                    Mark All as Unmatched
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReviewTable(p => !p)}
                    className="h-7"
                  >
                    {showReviewTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {showReviewTable && (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">WFP Row</th>
                        <th className="px-3 py-2 text-left font-medium">System Match</th>
                        <th className="px-3 py-2 text-left font-medium">Score</th>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...needsReview, ...unmatchedRows].map(r => {
                        const isExpanded = expandedReviewRows.has(r.rowIndex);
                        const toggleExpand = () => setExpandedReviewRows(prev => {
                          const n = new Set(prev);
                          isExpanded ? n.delete(r.rowIndex) : n.add(r.rowIndex);
                          return n;
                        });
                        const matchedCandidate = r.matchedSiteId
                          ? candidates.find(c => c.siteId === r.matchedSiteId)
                          : null;
                        const wfpCols = wizardState.fileColumns;
                        return (
                          <>
                            <tr key={r.rowIndex} className="border-t hover:bg-muted/20">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground flex-shrink-0"
                                    onClick={toggleExpand}
                                    title={isExpanded ? 'Collapse details' : 'Expand full details'}
                                  >
                                    {isExpanded
                                      ? <ChevronUp className="h-3.5 w-3.5" />
                                      : <ChevronDown className="h-3.5 w-3.5" />}
                                  </button>
                                  <div>
                                    <div className="font-medium">
                                      {primaryPair ? (r.wfpRow[primaryPair.wfpColumn] ?? '—') : '—'}
                                    </div>
                                    {secondaryPairs.length > 0 && (
                                      <div className="text-muted-foreground text-[11px]">
                                        {secondaryPairs.map(p => r.wfpRow[p.wfpColumn]).filter(Boolean).join(' / ')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                {r.matchedSiteName
                                  ? <span className="text-blue-600">{r.matchedSiteName}</span>
                                  : <span className="text-muted-foreground italic">No match found</span>}
                              </td>
                              <td className="px-3 py-2">
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${r.matchScore >= 78 ? 'text-green-600' : r.matchScore >= 50 ? 'text-amber-600' : 'text-red-500'}`}
                                >
                                  {r.matchScore}%
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="text-xs capitalize">{r.matchLevel}</Badge>
                              </td>
                              <td className="px-3 py-2">
                                {r.status === 'actioned' ? (
                                  <Badge className="bg-green-100 text-green-700 text-xs">{r.action}</Badge>
                                ) : (
                                  <div className="space-y-1.5">
                                    <div className="flex gap-1">
                                      <Button
                                        type="button" size="sm" variant="outline"
                                        className="h-6 text-xs px-2"
                                        onClick={() => handleAction(r.rowIndex, 'confirm')}
                                        data-testid={`button-confirm-${r.rowIndex}`}
                                      >Confirm</Button>
                                      <Button
                                        type="button" size="sm" variant="outline"
                                        className="h-6 text-xs px-2"
                                        onClick={() => handleAction(r.rowIndex, 'extra')}
                                        data-testid={`button-extra-${r.rowIndex}`}
                                      >Extra</Button>
                                      <Button
                                        type="button" size="sm" variant="outline"
                                        className="h-6 text-xs px-2 text-red-600 border-red-200"
                                        onClick={() => handleAction(r.rowIndex, 'reject')}
                                        data-testid={`button-reject-${r.rowIndex}`}
                                      >Reject</Button>
                                    </div>
                                    <div className="relative">
                                      <Search className="absolute left-1.5 top-1 h-3 w-3 text-muted-foreground" />
                                      <Input
                                        className="h-6 text-xs pl-5"
                                        placeholder="Link to site…"
                                        value={manualSearch[r.rowIndex] ?? ''}
                                        onChange={e => handleManualSearch(r.rowIndex, e.target.value)}
                                        data-testid={`input-manual-search-${r.rowIndex}`}
                                      />
                                      {(manualCandidates[r.rowIndex] ?? []).length > 0 && (
                                        <div className="absolute z-10 bg-popover border rounded shadow-lg mt-0.5 w-64">
                                          {manualCandidates[r.rowIndex].map(c => (
                                            <div
                                              key={c.siteId}
                                              className="px-2 py-1 hover:bg-muted cursor-pointer text-xs"
                                              onClick={() => handleManualLink(r.rowIndex, c)}
                                            >
                                              <span className="font-medium">{c.data.site_name ?? '—'}</span>
                                              <span className="text-muted-foreground ml-1">
                                                {c.data.state}/{c.data.locality}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                            {/* ── Expanded detail row ── */}
                            {isExpanded && (
                              <tr key={`${r.rowIndex}-detail`} className="border-t bg-slate-50 dark:bg-slate-900/40">
                                <td colSpan={5} className="px-4 py-3">
                                  <div className="grid grid-cols-2 gap-4">
                                    {/* WFP file row — all columns */}
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 mb-2">WFP File Row (all columns)</p>
                                      <div className="space-y-0.5">
                                        {wfpCols.filter(col => r.wfpRow[col] != null && r.wfpRow[col] !== '').map(col => (
                                          <div key={col} className="flex gap-2 text-[11px]">
                                            <span className="text-muted-foreground font-mono min-w-0 flex-shrink-0 w-40 truncate" title={col}>{col}:</span>
                                            <span className="font-medium break-all">{String(r.wfpRow[col])}</span>
                                          </div>
                                        ))}
                                        {wfpCols.filter(col => r.wfpRow[col] != null && r.wfpRow[col] !== '').length === 0 && (
                                          <p className="text-xs text-muted-foreground italic">No non-empty values</p>
                                        )}
                                      </div>
                                    </div>
                                    {/* Matched MMP candidate detail */}
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-2">
                                        Matched MMP Site{matchedCandidate ? '' : ' — None'}
                                      </p>
                                      {matchedCandidate ? (
                                        <div className="space-y-0.5">
                                          {Object.entries(matchedCandidate.data)
                                            .filter(([, v]) => v !== '')
                                            .map(([k, v]) => {
                                              const isUuidVal = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
                                              const display = k === 'accepted_by' && isUuidVal
                                                ? (profileNameMap[v] ?? v)
                                                : v;
                                              return (
                                                <div key={k} className="flex gap-2 text-[11px]">
                                                  <span className="text-muted-foreground font-mono min-w-0 flex-shrink-0 w-32 truncate" title={k}>{k}:</span>
                                                  <span className="font-medium break-all">{display}</span>
                                                </div>
                                              );
                                            })}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-muted-foreground italic">No MMP site was matched for this WFP row</p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {reviewCount > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {reviewCount} row{reviewCount !== 1 ? 's' : ''} still need{reviewCount === 1 ? 's' : ''} review.
                Confirm, link to a site, or reject each before advancing.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-2">
          {canGoBack && (
            <Button type="button" variant="outline" size="sm" onClick={onBack} data-testid="button-back-step2">
              ← Back
            </Button>
          )}
          {matchResults.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportMatchingReport}
              data-testid="button-export-matching"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export Matching Report
            </Button>
          )}
        </div>
        <Button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          data-testid="button-next-step2"
        >
          Next: Resolve Unmatched →
        </Button>
      </div>
    </div>
  );
}
