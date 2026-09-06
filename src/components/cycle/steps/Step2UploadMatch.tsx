
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
  ChevronDown, ChevronUp, Plus, X as XIcon,
  FileSpreadsheet, ShieldCheck,
} from 'lucide-react';
import type { WizardState } from '../CycleCloseWizard';
import { runMatchingChunked, type MatchCandidate, type MatchPair, type MatchResult } from '@/utils/fuzzyMatcher';
import { exportFormattedMatchingReport } from '@/utils/cycleCloseExport';
import { autoDetectPairs, getPairSemanticIssues, sanitizeMatchingPairs } from '../matchAliases';

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

const identityColumn = (columns: string[], terms: string[]) =>
  columns.find(c => terms.some(t => c.toLowerCase().replace(/[^a-z0-9]/g, '').includes(t)));

function detectWfpIdentityColumns(columns: string[]) {
  return {
    deviceId: identityColumn(columns, ['deviceid', 'deviceuuid', 'device']),
    rawName: identityColumn(columns, ['nameofinterviewer', 'interviewername', 'enumeratorname', 'datacollectorname', 'collectorname']),
    submissionUuid: identityColumn(columns, ['submissionuuid', 'submissionid', 'uuid', 'instanceid']),
    submissionDate: identityColumn(columns, ['submissiondate', 'submittedat', 'submissiontime', 'starttime', 'date']),
  };
}

const IDENTITY_NONE = '__none__';

type WfpIdentitySelection = {
  deviceId: string;
  submissionDate: string;
  rawName: string;
  submissionUuid: string;
};

function normalizeSubmissionDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // XLSX returns unformatted Excel dates as serial numbers. SSF handles the
  // workbook epoch and fractional (date-time) serials without locale parsing.
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (!Number.isFinite(serial) || serial <= 0) return null;
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (!parsed || !Number.isInteger(parsed.y) || !Number.isInteger(parsed.m) || !Number.isInteger(parsed.d)) {
      return null;
    }
    const normalized = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    if (
      normalized.getUTCFullYear() !== parsed.y ||
      normalized.getUTCMonth() !== parsed.m - 1 ||
      normalized.getUTCDate() !== parsed.d
    ) return null;
    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }

  // Validate an already date-only value strictly so values such as 2025-02-31
  // cannot be silently rolled into March by the Date constructor.
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      parsed.getUTCFullYear() !== Number(year) ||
      parsed.getUTCMonth() !== Number(month) - 1 ||
      parsed.getUTCDate() !== Number(day)
    ) return null;
    return `${year}-${month}-${day}`;
  }

  // Locale-formatted dates (01/02/2025) are ambiguous across spreadsheet
  // producers. Do not silently choose month-first or day-first.
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s|$)/.test(raw)) return null;

  // Date-time and standard JavaScript date strings are converted to their UTC
  // calendar date. Invalid strings are rejected rather than passed to SQL.
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function validateIdentityColumns(
  rows: Record<string, string>[],
  selection: WfpIdentitySelection,
): string[] {
  const issues: string[] = [];
  if (selection.deviceId !== IDENTITY_NONE) {
    const missing = rows.filter(row => !String(row[selection.deviceId] ?? '').trim()).length;
    if (missing) issues.push(`${missing} row${missing === 1 ? '' : 's'} have no Device ID`);
  }
  if (selection.submissionDate !== IDENTITY_NONE) {
    const invalid = rows.filter(row => !normalizeSubmissionDate(row[selection.submissionDate])).length;
    if (invalid) issues.push(`${invalid} submission date value${invalid === 1 ? '' : 's'} is missing, invalid, or ambiguous`);
  }
  if (selection.rawName !== IDENTITY_NONE) {
    const missing = rows.filter(row => !String(row[selection.rawName] ?? '').trim()).length;
    if (missing) issues.push(`${missing} interviewer/name value${missing === 1 ? '' : 's'} is missing`);
  }
  if (selection.submissionUuid !== IDENTITY_NONE) {
    const invalid = rows.filter(row => {
      const value = String(row[selection.submissionUuid] ?? '').trim();
      return value !== '' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    }).length;
    if (invalid) issues.push(`${invalid} Submission UUID value${invalid === 1 ? '' : 's'} is not a valid UUID`);
  }
  return issues;
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
  const [running, setRunning]           = useState(false);
  const [matchProgress, setMatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [manualSearch, setManualSearch] = useState<Record<number, string>>({});
  const [manualCandidates, setManualCandidates] = useState<Record<number, MatchCandidate[]>>({});
  const [showReviewTable, setShowReviewTable] = useState(true);
  const [expandedReviewRows, setExpandedReviewRows] = useState<Set<number>>(new Set());
  const [candidates, setCandidates]     = useState<MatchCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [profileNameMap, setProfileNameMap] = useState<Record<string, string>>({});

  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  // Track whether pairs have been auto-initialised for the current MMP + file combo
  const [pairsInitialized, setPairsInitialized] = useState(false);

  // ── WFP-covered site persistence (before advancing to Step 3) ────────────
  const [persistError, setPersistError] = useState<string | null>(null);
  const [persisting, setPersisting] = useState(false);
  const [selectedIdentityColumns, setSelectedIdentityColumns] = useState<WfpIdentitySelection>({
    deviceId: IDENTITY_NONE,
    submissionDate: IDENTITY_NONE,
    rawName: IDENTITY_NONE,
    submissionUuid: IDENTITY_NONE,
  });
  const [identityColumnsConfirmed, setIdentityColumnsConfirmed] = useState(false);
  const [matchingPairsConfirmed, setMatchingPairsConfirmed] = useState(false);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'review' | 'unmatched' | 'actioned'>('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [reviewPage, setReviewPage] = useState(1);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const lastColumnsKey = useRef('');
  const matchCancelledRef = useRef(false);

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
      const detected = detectWfpIdentityColumns(wizardState.fileColumns);
      setSelectedIdentityColumns({
        deviceId: detected.deviceId ?? IDENTITY_NONE,
        submissionDate: detected.submissionDate ?? IDENTITY_NONE,
        rawName: detected.rawName ?? IDENTITY_NONE,
        submissionUuid: detected.submissionUuid ?? IDENTITY_NONE,
      });
      setIdentityColumnsConfirmed(false);
      setMatchingPairsConfirmed(false);
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

  // Resume data can predate the semantic guard. Repair it before the user can
  // confirm or run matching, and persist the repaired mapping through the
  // wizard's normal safe-session save.
  useEffect(() => {
    if (!wizardState.matchingPairs.length || !wizardState.fileColumns.length) return;
    const sanitized = sanitizeMatchingPairs(
      wizardState.mmpColumns,
      wizardState.fileColumns,
      wizardState.matchingPairs,
    );
    if (sanitized.some((pair, index) =>
      pair.mmpColumn !== wizardState.matchingPairs[index]?.mmpColumn ||
      pair.wfpColumn !== wizardState.matchingPairs[index]?.wfpColumn
    )) {
      setMatchingPairsConfirmed(false);
      updateWizardState({ matchingPairs: sanitized });
    }
  }, [wizardState.fileColumns, wizardState.mmpColumns, wizardState.matchingPairs]);

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

    // Show the table immediately — profile names resolve in the background
    setCandidatesLoading(false);
    setPairsInitialized(false);

    // Resolve UUID-shaped accepted_by values to profile names (non-blocking —
    // table is already visible; names patch in when the lookup returns).
    // No FK exists so we can't join directly.
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
  };

  // ── Parse uploaded WFP file ───────────────────────────────────────────────
  const parseFile = (file: File) => {
    setFileError(null);
    if (file.size > 20 * 1024 * 1024) {
      setFileError('This workbook is larger than 20 MB. Split it into smaller files before upload.');
      return;
    }
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
        if (json.length > 10000) {
          setFileError(`This workbook contains ${json.length.toLocaleString()} rows. The review limit is 10,000 rows; split the file before upload.`);
          return;
        }
        const columns = Object.keys(json[0]);
        const allRows = json.map(r =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))
        );
        const detectedIdentity = detectWfpIdentityColumns(columns);

        // Reset pair initialisation so pairs re-detect with new file columns
        setPairsInitialized(false);
        setPreviewCollapsed(false);
        setSelectedIdentityColumns({
          deviceId: detectedIdentity.deviceId ?? IDENTITY_NONE,
          submissionDate: detectedIdentity.submissionDate ?? IDENTITY_NONE,
          rawName: detectedIdentity.rawName ?? IDENTITY_NONE,
          submissionUuid: detectedIdentity.submissionUuid ?? IDENTITY_NONE,
        });
        setIdentityColumnsConfirmed(false);
        setMatchingPairsConfirmed(false);

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
    setMatchingPairsConfirmed(false);
  };
  const removePair = (idx: number) => {
    updateWizardState({ matchingPairs: wizardState.matchingPairs.filter((_, i) => i !== idx) });
    setMatchingPairsConfirmed(false);
  };
  const addPair = () => {
    updateWizardState({ matchingPairs: [...wizardState.matchingPairs, { mmpColumn: '', wfpColumn: '' }] });
    setMatchingPairsConfirmed(false);
  };

  // ── Run the matching algorithm ────────────────────────────────────────────
  const runMatch = async () => {
    if (!matchingPairsConfirmed || !identityColumnsConfirmed) return;
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
    matchCancelledRef.current = false;
    setMatchProgress({ done: 0, total: wizardState.fileRows.length });
    let results: MatchResult[];
    try {
      results = await runMatchingChunked(wizardState.fileRows, wizardState.matchingPairs, activeCandidates, {
        chunkSize: 8,
        isCancelled: () => matchCancelledRef.current,
        onProgress: (done, total) => setMatchProgress({ done, total }),
      });
    } catch (error) {
      if (!matchCancelledRef.current) {
        setFileError(error instanceof Error && error.message === 'Fuzzy workload exceeds the safe processing budget'
          ? 'This file needs too many fuzzy comparisons to review safely. Add or refine an exact site key, or split the workbook and try again.'
          : 'Matching could not complete. Review the file and try again.');
      }
      setRunning(false);
      setMatchProgress(null);
      return;
    }

    // Detect MMP sites that were never matched by any WFP row — these are "Not in clean data"
    // and must flow into Step 4 as uncovered sites needing a reason.
    const confirmedSiteIds = new Set(
      results.filter(r => r.status === 'auto' || r.action === 'confirm')
        .map(r => r.matchedSiteId).filter(Boolean) as string[]
    );
    const unmatchedMmpSiteIds = activeCandidates
      .filter(c => !confirmedSiteIds.has(c.siteId))
      .map(c => c.siteId);

    updateWizardState({ matchResults: results, unmatchedMmpSiteIds });
    setRunning(false);
    setMatchProgress(null);
  };

  // ── Row action handlers ───────────────────────────────────────────────────
  const handleAction = (rowIndex: number, action: 'confirm' | 'link' | 'extra' | 'reject') => {
    const current = wizardState.matchResults.find(r => r.rowIndex === rowIndex);
    if (action === 'confirm' && !current?.matchedSiteId) return;
    const updated = wizardState.matchResults.map(r =>
      r.rowIndex === rowIndex ? {
        ...r,
        ...(action === 'extra' || action === 'reject'
          ? { matchedSiteId: null, matchedSiteName: null, matchScore: 0, matchLevel: 'none' as const }
          : {}),
        action,
        status: 'actioned' as const,
      } : r
    );
    // Recompute unmatchedMmpSiteIds so confirmed/linked sites leave the "Not in clean data" list
    const matchedSiteIds = new Set(updated
      .filter(r => r.status === 'auto' || r.action === 'confirm')
      .map(r => r.matchedSiteId).filter(Boolean) as string[]);
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
        status: 'review' as const,
        action: undefined,
        manualMatchSiteId: candidate.siteId,
        manualMatchBy: currentUser?.full_name ?? 'User',
        manualMatchAt: new Date().toISOString(),
      } : r
    );
    // Recompute unmatchedMmpSiteIds so the newly linked site leaves the "Not in clean data" list
    const matchedSiteIds = new Set(updated
      .filter(r => r.status === 'auto' || r.action === 'confirm')
      .map(r => r.matchedSiteId).filter(Boolean) as string[]);
    const unmatchedMmpSiteIds = candidates
      .filter(c => !matchedSiteIds.has(c.siteId))
      .map(c => c.siteId);
    updateWizardState({ matchResults: updated, unmatchedMmpSiteIds });
    setManualSearch(prev => ({ ...prev, [rowIndex]: '' }));
    setManualCandidates(prev => ({ ...prev, [rowIndex]: [] }));
  };

  const exportMatchingReport = () => {
    void exportFormattedMatchingReport(wizardState);
  };

  // ── WFP-confirmed site IDs: auto matches + confirmed/manual links only.
  //    Never rejects, never extras (extras have no MMP site), never unmatched.
  const collectWfpConfirmedSiteIds = (): string[] => {
    const ids = new Set<string>();
    for (const r of wizardState.matchResults) {
      if (!r.matchedSiteId) continue;
      const isAuto = r.status === 'auto';
      const isConfirmed = r.action === 'confirm'; // covers manual links (they set action='confirm')
      if (isAuto || isConfirmed) ids.add(r.matchedSiteId);
    }
    return [...ids];
  };

  // ── Persist WFP-covered sites, then advance to Step 3. If persistence fails
  //    we surface a visible error and DO NOT advance.
  const handleNextWithPersist = async () => {
    setPersistError(null);
    if (
      !identityColumnsConfirmed ||
      selectedIdentityColumns.deviceId === IDENTITY_NONE ||
      selectedIdentityColumns.submissionDate === IDENTITY_NONE
    ) {
      setPersistError(
        'Confirm the WFP identity columns and select both Device ID and Submission date before continuing.'
      );
      return;
    }

    const siteIds = collectWfpConfirmedSiteIds();
    const confirmedSiteIds = wizardState.matchResults
      .filter(r => r.matchedSiteId && (r.status === 'auto' || r.action === 'confirm'))
      .map(r => r.matchedSiteId as string);
    const duplicateSiteIds = [...new Set(
      confirmedSiteIds.filter((siteId, index) => confirmedSiteIds.indexOf(siteId) !== index)
    )];
    if (duplicateSiteIds.length > 0) {
      setPersistError(
        `${duplicateSiteIds.length} Command Center site${duplicateSiteIds.length === 1 ? ' has' : 's have'} ` +
        'more than one WFP submission matched to it. Resolve the duplicate submissions before continuing.'
      );
      return;
    }

    const evidenceRows = wizardState.matchResults
      .filter(r => r.matchedSiteId && (r.status === 'auto' || r.action === 'confirm'));
    const normalizedEvidence = evidenceRows.map(r => ({
      result: r,
      submissionDate: normalizeSubmissionDate(r.wfpRow[selectedIdentityColumns.submissionDate]),
    }));
    const invalidDateRows = normalizedEvidence
      .filter(({ submissionDate }) => !submissionDate)
      .map(({ result }) => result.rowIndex + 1);
    if (invalidDateRows.length > 0) {
      const shownRows = invalidDateRows.slice(0, 10).join(', ');
      const remainder = invalidDateRows.length > 10 ? ` and ${invalidDateRows.length - 10} more` : '';
      setPersistError(
        `Invalid or missing submission date in WFP row${invalidDateRows.length === 1 ? '' : 's'} ` +
        `${shownRows}${remainder}. Correct the selected date column or the source values before continuing.`
      );
      return;
    }

    // Nothing to persist (e.g. all rejected/uncovered) — still allowed to advance.
    if (siteIds.length === 0) {
      onNext();
      return;
    }

    setPersisting(true);
    try {
      const { error } = await (supabase as any).rpc('persist_wfp_covered_sites', {
        p_mmp_file_id: wizardState.selectedMmpId,
        p_site_ids: siteIds,
      });
      if (error) {
        console.error('persist_wfp_covered_sites error:', error);
        setPersistError(
          'Could not save the WFP-confirmed sites. Please try again before continuing. ' +
          (error.message ?? '')
        );
        setPersisting(false);
        return;
      }
      const evidence = [...new Map(
        normalizedEvidence
          .map(({ result: r, submissionDate }) => [r.matchedSiteId, {
            site_id: r.matchedSiteId,
            wfp_raw_device_id: r.wfpRow[selectedIdentityColumns.deviceId] ?? null,
            wfp_raw_interviewer_name: selectedIdentityColumns.rawName !== IDENTITY_NONE
              ? r.wfpRow[selectedIdentityColumns.rawName] ?? null
              : null,
            submission_uuid: selectedIdentityColumns.submissionUuid !== IDENTITY_NONE
              ? r.wfpRow[selectedIdentityColumns.submissionUuid] ?? null
              : null,
            submission_date: submissionDate,
            source_row_index: r.rowIndex,
          }])
      ).values()];
      if (evidence.length) {
        const { error: evidenceError } = await (supabase as any).rpc('persist_cycle_attribution_evidence', {
          p_mmp_id: wizardState.selectedMmpId,
          p_rows: evidence,
        });
        if (evidenceError) {
          throw new Error(`Attribution evidence could not be saved: ${evidenceError.message ?? evidenceError}`);
        }
      }
    } catch (err: any) {
      console.error('persist_wfp_covered_sites threw:', err);
      setPersistError(
        `Could not save the WFP-confirmed sites. Please try again before continuing. ${err?.message ?? ''}`
      );
      setPersisting(false);
      return;
    }

    setPersisting(false);
    onNext();
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const matchResults   = wizardState.matchResults;
  const reviewCount    = matchResults.filter(r => r.status === 'review').length;
  const unmatchedCount = matchResults.filter(r => r.status === 'unmatched').length;
  const needsReview    = matchResults.filter(r => r.status === 'review');
  const unmatchedRows  = matchResults.filter(r => r.status === 'unmatched');
  const confirmedRows = matchResults.filter(r => r.status === 'auto' || r.action === 'confirm');
  const duplicateSiteIds = new Set(
    confirmedRows
      .map(row => row.matchedSiteId)
      .filter((siteId, index, ids): siteId is string => !!siteId && ids.indexOf(siteId) !== index)
  );
  const duplicateRows = matchResults.filter(row => !!row.matchedSiteId && duplicateSiteIds.has(row.matchedSiteId));
  const queueRows = matchResults.filter(row =>
    row.status === 'review' || row.status === 'unmatched' || duplicateRows.some(duplicate => duplicate.rowIndex === row.rowIndex)
  );
  const wfpConfirmedCount = matchResults.filter(row =>
    (row.status === 'auto' || row.action === 'confirm') && !duplicateSiteIds.has(row.matchedSiteId ?? '')
  ).length;
  const wfpAnomalyCount = matchResults.filter(row => row.action === 'extra' || row.action === 'reject').length;
  const wfpPendingCount = matchResults.filter(row => row.status === 'review' || row.status === 'unmatched').length;
  const pendingUncoveredCount = (wizardState.unmatchedMmpSiteIds ?? []).filter(siteId =>
    !wizardState.resolvedSites[siteId] || wizardState.resolvedSites[siteId] === 'resubmit'
  ).length;
  const semanticPairIssues = getPairSemanticIssues(wizardState.matchingPairs);
  const hasValidPairs  = wizardState.matchingPairs.some(p => p.mmpColumn && p.wfpColumn)
    && semanticPairIssues.length === 0;
  const identityIssues = wizardState.fileRows.length > 0
    ? validateIdentityColumns(wizardState.fileRows, selectedIdentityColumns)
    : [];
  const isReadyToAdvance = canAdvance
    && identityColumnsConfirmed
    && selectedIdentityColumns.deviceId !== IDENTITY_NONE
    && selectedIdentityColumns.submissionDate !== IDENTITY_NONE
    && identityIssues.length === 0;
  const primaryPair = wizardState.matchingPairs.find(p => p.mmpColumn && p.wfpColumn);
  const secondaryPairs = wizardState.matchingPairs
    .filter(p => p.mmpColumn && p.wfpColumn && p !== primaryPair)
    .slice(0, 2);
  const actionableRows = (reviewFilter === 'actioned' ? matchResults.filter(r => r.status === 'actioned') : queueRows).filter(r => {
    const candidate = r.matchedSiteId ? candidates.find(c => c.siteId === r.matchedSiteId) : undefined;
    const haystack = [
      String(r.rowIndex + 1),
      r.matchedSiteName ?? '',
      ...Object.values(r.wfpRow),
      ...Object.values(candidate?.data ?? {}),
    ].join(' ').toLowerCase();
    const state = candidate?.data.state ?? '';
    const confidence = r.matchScore >= 78 ? 'high' : r.matchScore >= 50 ? 'medium' : 'low';
    return (!reviewSearch.trim() || haystack.includes(reviewSearch.toLowerCase()))
      && (reviewFilter === 'all' || r.status === reviewFilter)
      && (stateFilter === 'all' || state === stateFilter)
      && (confidenceFilter === 'all' || confidence === confidenceFilter);
  });
  const reviewPageSize = 50;
  const reviewPageCount = Math.max(1, Math.ceil(actionableRows.length / reviewPageSize));
  const visibleActionRows = actionableRows.slice((reviewPage - 1) * reviewPageSize, reviewPage * reviewPageSize);
  useEffect(() => {
    setReviewPage(page => Math.min(page, reviewPageCount));
  }, [reviewPageCount]);
  // Derive "not in clean data" live from current matchResults so any manual
  // confirm/link immediately removes the site from this list (fixes stale count).
  const matchedSiteIdsLive = new Set(
    matchResults.filter(r => r.status === 'auto' || r.action === 'confirm')
      .map(r => r.matchedSiteId).filter(Boolean) as string[]
  );
  const notInCleanCands = candidates.filter(c => !matchedSiteIdsLive.has(c.siteId));

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Step 2 — WFP review cockpit</h2>
        <p className="text-sm text-muted-foreground mt-0.5" dir="rtl">الخطوة ٢ — رفع الملف والمطابقة مع بيانات برنامج الغذاء</p>
        <p className="text-muted-foreground text-sm">
          Upload and validate the file, confirm site fields, then resolve every exception before continuing.
        </p>
      </div>

      {wizardState.fileColumns.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-teal-700 mt-0.5 shrink-0" />
            <div className="min-w-0">
            <p className="text-sm font-semibold">Identity evidence (separate from site matching)</p>
              <p className="text-xs text-muted-foreground mt-1">
                These WFP columns are preserved as evidence for reconciliation. They do not determine the site match.
              </p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  ['Device ID', 'deviceId', true],
                  ['Submission date', 'submissionDate', true],
                  ['Interviewer / enumerator', 'rawName', false],
                  ['Submission UUID', 'submissionUuid', false],
                ] as const).map(([label, field, required]) => (
                  <div key={field} className="space-y-1">
                    <label className="text-xs font-medium">
                      {label}{required ? ' *' : ' (optional)'}
                    </label>
                    <Select
                      value={selectedIdentityColumns[field]}
                      onValueChange={value => {
                        setSelectedIdentityColumns(current => ({ ...current, [field]: value }));
                        setIdentityColumnsConfirmed(false);
                      }}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={IDENTITY_NONE}>None</SelectItem>
                        {wizardState.fileColumns.map(column => (
                          <SelectItem key={column} value={column}>{column}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <label className="mt-4 flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={identityColumnsConfirmed}
                  onCheckedChange={checked => setIdentityColumnsConfirmed(checked === true)}
                />
                <span>I reviewed and confirm these WFP identity columns are correct.</span>
              </label>
              {identityIssues.length > 0 && (
                <Alert variant="destructive" className="mt-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium">Fix identity evidence before matching</p>
                    <ul className="list-disc pl-4 mt-1">{identityIssues.slice(0, 4).map(issue => <li key={issue}>{issue}</li>)}</ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </div>
      )}

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
        <h3 className="font-medium text-sm">Phase 1 — Upload &amp; validate</h3>
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
                <p className="text-sm font-semibold">Validated WFP file preview</p>
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
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewCollapsed(true)}>
                      Hide preview
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
            <h3 className="font-medium text-sm">Phase 2 — Configure site matching</h3>
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

           <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
             Examples below are independent format checks only — they are not row-to-row matches.
           </p>
           {/* Pair cards */}
           <div className="space-y-4">
            {wizardState.matchingPairs.map((pair, idx) => (
               <div key={idx} className="rounded-lg border bg-background p-4 shadow-sm">
                 <div className="flex items-start justify-between gap-3">
                   <div>
                     <p className="text-sm font-semibold">{idx === 0 ? 'Primary match' : 'Additional check'}</p>
                     <p className="text-xs text-muted-foreground">Both columns must match the same site information.</p>
                   </div>
                   <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removePair(idx)} data-testid={`button-remove-pair-${idx}`} aria-label="Remove matching pair">
                     <XIcon className="h-3.5 w-3.5" />
                   </Button>
                 </div>
                 <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
                   <div className="space-y-1.5">
                     <label className="text-xs font-semibold">Command Center field</label>
                     <Select value={pair.mmpColumn || '__none__'} onValueChange={v => updatePair(idx, 'mmpColumn', v === '__none__' ? '' : v)}>
                       <SelectTrigger className="h-auto min-h-11 w-full items-start py-2 text-left text-sm [&>span]:whitespace-normal [&>span]:break-words" data-testid={`select-mmp-col-${idx}`}><SelectValue placeholder="Choose a Command Center field…" /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="__none__">— Choose Command Center field —</SelectItem>
                         {(wizardState.mmpColumns.length > 0 ? wizardState.mmpColumns : Object.keys(MMP_COL_LABELS)).map(c => <SelectItem key={c} value={c} className="whitespace-normal">{c}{MMP_COL_LABELS[c] ? ` (${MMP_COL_LABELS[c]})` : ''}</SelectItem>)}
                       </SelectContent>
                     </Select>
                   </div>
                   <span className="hidden text-xs font-semibold text-muted-foreground md:block">must match</span>
                   <div className="space-y-1.5">
                     <label className="text-xs font-semibold">WFP spreadsheet column</label>
                     <Select value={pair.wfpColumn || '__none__'} onValueChange={v => updatePair(idx, 'wfpColumn', v === '__none__' ? '' : v)}>
                       <SelectTrigger className="h-auto min-h-11 w-full items-start py-2 text-left text-sm [&>span]:whitespace-normal [&>span]:break-words" data-testid={`select-wfp-col-${idx}`}><SelectValue placeholder="Choose a WFP spreadsheet column…" /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="__none__">— Choose WFP spreadsheet column —</SelectItem>
                         {wizardState.fileColumns.map(c => <SelectItem key={c} value={c} className="whitespace-normal">{c}</SelectItem>)}
                       </SelectContent>
                     </Select>
                   </div>
                 </div>
                 <div className="mt-4 grid gap-3 border-t pt-3 sm:grid-cols-2">
                   <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Command Center examples</p><ul className="mt-1 space-y-1 text-xs">{candidates.slice(0, 3).map((c, i) => <li key={i} className="break-words">{c.data[pair.mmpColumn] || '—'}</li>)}</ul></div>
                   <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">WFP examples</p><ul className="mt-1 space-y-1 text-xs">{wizardState.fileRows.slice(0, 3).map((row, i) => <li key={i} className="break-words">{pair.wfpColumn ? (row[pair.wfpColumn] || '—') : '—'}</li>)}</ul></div>
                 </div>
                 {semanticPairIssues.some(issue => issue.index === idx) && (
                   <Alert variant="destructive" className="mt-3">
                     <AlertCircle className="h-4 w-4" /><AlertDescription>
                       <p className="font-medium">{semanticPairIssues.find(issue => issue.index === idx)?.message}</p>
                       <p className="mt-1">{semanticPairIssues.find(issue => issue.index === idx)?.suggestion}</p>
                     </AlertDescription>
                   </Alert>
                 )}
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

           <label className={`flex items-start gap-2 border-t pt-3 text-xs ${semanticPairIssues.length ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
             <Checkbox disabled={semanticPairIssues.length > 0} checked={matchingPairsConfirmed} onCheckedChange={v => setMatchingPairsConfirmed(v === true)} />
            <span><strong>Confirm site matching fields.</strong> I checked the sample values above and these pairs represent the same site information. Identity evidence is not used for this match.</span>
          </label>

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
             disabled={!hasValidPairs || semanticPairIssues.length > 0 || !matchingPairsConfirmed || !identityColumnsConfirmed || identityIssues.length > 0 || running || candidatesLoading}
            data-testid="button-run-match"
          >
            {(running || candidatesLoading) ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            {running ? 'Running match…' : candidatesLoading ? 'Loading site data…' : 'Run Matching'}
          </Button>
           {running && matchProgress && (
             <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
               <div className="h-1.5 w-40 overflow-hidden rounded bg-muted">
                 <div className="h-full bg-primary transition-transform" style={{ width: `${Math.round((matchProgress.done / Math.max(matchProgress.total, 1)) * 100)}%` }} />
               </div>
               <span>Checking {matchProgress.done.toLocaleString()} of {matchProgress.total.toLocaleString()} rows</span>
               <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { matchCancelledRef.current = true; }}>Cancel match</Button>
             </div>
           )}
        </div>
      )}

       {/* Phase 3 — Exceptions review */}
       {matchResults.length > 0 && (
         <div className="space-y-4">
          {(queueRows.length > 0 || reviewFilter === 'actioned') && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                  Phase 3 — Exceptions review ({queueRows.length})
                  </span>
                  {duplicateRows.length > 0 && (
                    <Badge variant="outline" className="border-destructive/40 text-destructive">
                      {duplicateRows.length} duplicate submission{duplicateRows.length === 1 ? '' : 's'}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <Input
                    className="col-span-2 h-8 w-full text-xs sm:w-52"
                    placeholder="Search rows or sites"
                    value={reviewSearch}
                    onChange={e => { setReviewSearch(e.target.value); setReviewPage(1); }}
                  />
                  <Select value={reviewFilter} onValueChange={v => { setReviewFilter(v as typeof reviewFilter); setReviewPage(1); }}>
                    <SelectTrigger className="h-8 w-full text-xs sm:w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All states</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="unmatched">Unmatched</SelectItem>
                      <SelectItem value="actioned">Actioned</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={stateFilter} onValueChange={v => { setStateFilter(v); setReviewPage(1); }}>
                    <SelectTrigger className="h-8 w-full text-xs sm:w-28"><SelectValue placeholder="State" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All states</SelectItem>
                      {[...new Set(candidates.map(c => c.data.state).filter(Boolean))].sort().map(state => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={confidenceFilter} onValueChange={v => { setConfidenceFilter(v as typeof confidenceFilter); setReviewPage(1); }}>
                    <SelectTrigger className="h-8 w-full text-xs sm:w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All confidence</SelectItem>
                      <SelectItem value="high">High ≥78%</SelectItem>
                      <SelectItem value="medium">Medium 50–77%</SelectItem>
                      <SelectItem value="low">Low &lt;50%</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReviewTable(p => !p)}
                    className="h-8 justify-self-end sm:ml-auto"
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
                      {visibleActionRows.map(r => {
                        const isExpanded = expandedReviewRows.has(r.rowIndex);
                        const toggleExpand = () => setExpandedReviewRows(prev => {
                          const n = new Set(prev);
                          if (isExpanded) {
                            n.delete(r.rowIndex);
                          } else {
                            n.add(r.rowIndex);
                          }
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
                                 {r.matchedSiteId && duplicateSiteIds.has(r.matchedSiteId) && (
                                   <p className="mt-1 text-[10px] font-medium text-destructive">Duplicate site conflict — keep one confirmed</p>
                                 )}
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
                                         disabled={!r.matchedSiteId}
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
              {showReviewTable && (
                <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
                  <span>Showing {visibleActionRows.length} of {actionableRows.length} rows · 50 per page</span>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={reviewPage <= 1} onClick={() => setReviewPage(p => p - 1)}>Previous</Button>
                    <span>Page {reviewPage} of {reviewPageCount}</span>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={reviewPage >= reviewPageCount} onClick={() => setReviewPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {reviewCount > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                 {reviewCount + unmatchedCount} WFP row{reviewCount + unmatchedCount !== 1 ? 's' : ''} still block advance.
                 Every unmatched WFP row must be confirmed to a selected site, marked WFP-only Extra, or rejected.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {matchResults.length > 0 && (
        <section className="rounded-lg border bg-muted/20 px-4 py-3">
          <p className="text-sm font-semibold">MMP sites not confirmed by WFP</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {notInCleanCands.length} of {candidates.length} MMP sites have no confirmed WFP link. They require coverage reasons in Step 3 — Mark Uncovered. This handoff does not block Step 2 once every WFP row has a disposition.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...new Map(notInCleanCands.map(site => [site.data.state || 'State not recorded', 0])).keys()].sort().map(state => {
              const count = notInCleanCands.filter(site => (site.data.state || 'State not recorded') === state).length;
              return <Badge key={state} variant="outline">{state}: {count}</Badge>;
            })}
          </div>
        </section>
      )}

       {matchResults.length > 0 && (
         <section className="space-y-3 border-t pt-5" aria-label="Final match summary">
           <div className="flex items-baseline justify-between gap-3">
             <div>
               <h3 className="text-sm font-semibold">Phase 4 — Final summary</h3>
               <p className="text-xs text-muted-foreground">This is the authoritative advance gate. Every WFP submission must have one disposition, with no duplicate confirmed site links.</p>
             </div>
             <Badge variant={isReadyToAdvance ? 'default' : 'destructive'}>{isReadyToAdvance ? 'Ready to continue' : 'Advance blocked'}</Badge>
           </div>
           <div className="grid gap-3 md:grid-cols-2">
             <div className="rounded-lg border bg-slate-50/70 p-3">
               <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">WFP submissions · {matchResults.length.toLocaleString()} total</p>
               <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                 <dt>Confirmed match</dt><dd className="text-right font-semibold">{wfpConfirmedCount}</dd>
                 <dt>WFP-only anomaly (Extra / Reject)</dt><dd className="text-right font-semibold">{wfpAnomalyCount}</dd>
                 <dt>Pending review or unmatched</dt><dd className="text-right font-semibold text-amber-700">{wfpPendingCount}</dd>
                 <dt>Duplicate site conflict</dt><dd className="text-right font-semibold text-destructive">{duplicateRows.length}</dd>
               </dl>
             </div>
             <div className="rounded-lg border bg-slate-50/70 p-3">
               <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">MMP sites · {candidates.length.toLocaleString()} total</p>
               <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                 <dt>Confirmed site links</dt><dd className="text-right font-semibold">{matchedSiteIdsLive.size}</dd>
                 <dt>Not found in WFP file</dt><dd className="text-right font-semibold">{notInCleanCands.length}</dd>
                 <dt>Pending uncovered decision</dt><dd className="text-right font-semibold text-amber-700">{pendingUncoveredCount}</dd>
               </dl>
             </div>
           </div>
         </section>
       )}

      {persistError && (
        <Alert variant="destructive" data-testid="alert-persist-wfp-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{persistError}</AlertDescription>
        </Alert>
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
          onClick={handleNextWithPersist}
           disabled={!isReadyToAdvance || persisting}
          data-testid="button-next-step2"
        >
          {persisting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Next: Mark Uncovered →
        </Button>
      </div>
    </div>
  );
}
