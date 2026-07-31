
import { useCallback, useEffect, useRef, useState } from 'react';
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
  XCircle, AlertTriangle, ChevronDown, ChevronUp
} from 'lucide-react';
import type { WizardState } from '../CycleCloseWizard';
import { runMatching, type MatchCandidate, type MatchResult } from '@/utils/fuzzyMatcher';

const SYSTEM_FIELDS = [
  { key: 'siteName', label: 'Site Name', aliases: ['site_name', 'site', 'location name', 'اسم الموقع', 'village', 'موقع'] },
  { key: 'state', label: 'State', aliases: ['state', 'governorate', 'ولاية'] },
  { key: 'locality', label: 'Locality', aliases: ['locality', 'district', 'محلية'] },
  { key: 'activity', label: 'Activity', aliases: ['activity', 'programme', 'النشاط'] },
  { key: 'enumeratorName', label: 'Enumerator Name', aliases: ['enumerator', 'data collector', 'المعدد', 'enumerator name'] },
  { key: 'submissionId', label: 'Submission ID', aliases: ['_uuid', 'submission_id', 'uuid', 'id'] },
  { key: 'visitStatus', label: 'Visit Status', aliases: ['status', 'verified', 'confirmed', 'الحالة'] },
];

function autoDetect(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lowerCols = columns.map(c => c.toLowerCase().trim());
  for (const field of SYSTEM_FIELDS) {
    for (const alias of field.aliases) {
      const idx = lowerCols.findIndex(c => c === alias || c.includes(alias));
      if (idx !== -1 && !mapping[field.key]) {
        mapping[field.key] = columns[idx];
        break;
      }
    }
  }
  return mapping;
}

interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  canAdvance: boolean;
  canGoBack: boolean;
  currentUser: any;
}

export default function Step2UploadMatch({ wizardState, updateWizardState, onNext, onBack, canAdvance, canGoBack, currentUser }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ columns: string[]; rows: Record<string, string>[] } | null>(null);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [rememberMapping, setRememberMapping] = useState(false);
  const [running, setRunning] = useState(false);
  const [localMapping, setLocalMapping] = useState<Record<string, string>>(wizardState.columnMapping);
  const [manualSearch, setManualSearch] = useState<Record<number, string>>({});
  const [manualCandidates, setManualCandidates] = useState<Record<number, any[]>>({});
  const [showReviewTable, setShowReviewTable] = useState(true);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wizardState.selectedMmpId) loadCandidates();
  }, [wizardState.selectedMmpId]);

  useEffect(() => {
    setLocalMapping(wizardState.columnMapping);
  }, [wizardState.columnMapping]);

  const loadCandidates = async () => {
    const { data } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, state, locality, activity, accepted_by, profiles!accepted_by(full_name)')
      .eq('mmp_file_id', wizardState.selectedMmpId!);
    const cands: MatchCandidate[] = (data ?? []).map((e: any) => ({
      siteId: e.id,
      siteName: e.site_name ?? '',
      state: e.state ?? '',
      locality: e.locality ?? '',
      activity: e.activity ?? '',
      enumeratorName: e.profiles?.full_name ?? '',
    }));
    setCandidates(cands);
  };

  const parseFile = (file: File) => {
    setFileError(null);
    setPreview(null);
    setPreviewConfirmed(false);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
      setFileError('This file type is not supported. Upload an .xlsx, .xls, or .csv file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        if (!json.length) { setFileError('The file appears to be empty. Check the file and try again.'); return; }
        const columns = Object.keys(json[0]);
        const rows = json.slice(0, 5).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])));
        const allRows = json.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])));
        const detected = autoDetect(columns);
        const missing = SYSTEM_FIELDS.filter(f => !detected[f.key]).map(f => f.label);
        if (missing.length > 3) {
          setFileError(`These required columns were not found: ${missing.join(', ')}. Check the column names or use the mapping panel below.`);
        }
        setPreview({ columns, rows });
        setLocalMapping(detected);
        updateWizardState({ uploadedFileName: file.name, fileRows: allRows, fileColumns: columns, columnMapping: detected });
      } catch {
        setFileError('Could not read this file. Make sure it is a valid Excel or CSV file.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const applyMapping = () => {
    updateWizardState({ columnMapping: localMapping });
  };

  const runMatch = async () => {
    setRunning(true);
    applyMapping();
    await new Promise(r => setTimeout(r, 100));
    const results = runMatching(wizardState.fileRows, localMapping, candidates);
    updateWizardState({ matchResults: results });
    setRunning(false);
  };

  const handleAction = (rowIndex: number, action: MatchResult['action']) => {
    const updated = wizardState.matchResults.map(r =>
      r.rowIndex === rowIndex ? { ...r, action, status: 'actioned' as const } : r
    );
    updateWizardState({ matchResults: updated });
  };

  const handleManualSearch = async (rowIndex: number, query: string) => {
    setManualSearch(prev => ({ ...prev, [rowIndex]: query }));
    if (!query.trim()) { setManualCandidates(prev => ({ ...prev, [rowIndex]: [] })); return; }
    const q = query.toLowerCase();
    const results = candidates.filter(c =>
      c.siteName.toLowerCase().includes(q) || c.locality.toLowerCase().includes(q)
    ).slice(0, 8);
    setManualCandidates(prev => ({ ...prev, [rowIndex]: results }));
  };

  const handleManualLink = (rowIndex: number, candidate: MatchCandidate) => {
    const updated = wizardState.matchResults.map(r =>
      r.rowIndex === rowIndex ? {
        ...r,
        matchedSiteId: candidate.siteId,
        matchedSiteName: candidate.siteName,
        matchScore: 100,
        matchLevel: 'exact' as const,
        status: 'actioned' as const,
        action: 'confirm' as const,
        manualMatchSiteId: candidate.siteId,
        manualMatchBy: currentUser?.full_name ?? 'User',
        manualMatchAt: new Date().toISOString(),
      } : r
    );
    updateWizardState({ matchResults: updated });
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
    const rows = wizardState.matchResults.map(r => ({
      'WFP Site': r.wfpRow[localMapping.siteName] ?? '',
      'WFP State': r.wfpRow[localMapping.state] ?? '',
      'WFP Locality': r.wfpRow[localMapping.locality] ?? '',
      'Matched Site': r.matchedSiteName ?? 'No match',
      'Match Score': r.matchScore + '%',
      'Match Type': r.matchLevel,
      'Match Method': r.manualMatchSiteId ? 'Manual' : 'Auto',
      'Matched By': r.manualMatchBy ?? 'System',
      'Action': r.action ?? r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Matching Report');
    XLSX.writeFile(wb, 'matching-report.xlsx');
  };

  const matchResults = wizardState.matchResults;
  const autoCount = matchResults.filter(r => r.status === 'auto').length;
  const reviewCount = matchResults.filter(r => r.status === 'review').length;
  const unmatchedCount = matchResults.filter(r => r.status === 'unmatched').length;
  const actionedCount = matchResults.filter(r => r.status === 'actioned').length;
  const needsReview = matchResults.filter(r => r.status === 'review');
  const unmatchedRows = matchResults.filter(r => r.status === 'unmatched');
  const allMapped = SYSTEM_FIELDS.every(f => localMapping[f.key]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Step 2 — Upload & Match Clean Data (WFP File)</h2>
        <p className="text-muted-foreground text-sm">Upload the WFP-provided clean data file and match it to MMP site entries.</p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <p className="font-medium">Why this step matters</p>
          <p className="mt-0.5">Nothing financial can be finalised until the WFP clean data is uploaded and matched. The system will try to auto-match sites, then ask you to review any uncertain or unmatched rows.</p>
        </div>
      </div>

      {/* 2a — Upload Zone */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm">2a — Upload WFP Clean Data File</h3>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'}`}
          data-testid="upload-dropzone"
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="font-medium text-sm">{wizardState.uploadedFileName ?? 'Drag & drop or click to upload'}</p>
          <p className="text-xs text-muted-foreground mt-1">Accepted: .xlsx, .xls, .csv — Max size: 10 MB</p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileInput} data-testid="input-wfp-file" />
        </div>
        {fileError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{fileError}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Preview */}
      {preview && !previewConfirmed && (
        <div className="space-y-3 border rounded-lg p-4">
          <p className="text-sm font-medium">Preview (first 5 rows) — confirm this is the correct file:</p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr>{preview.columns.slice(0, 8).map(c => <th key={c} className="border px-2 py-1 bg-muted text-left font-medium">{c}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i}>{preview.columns.slice(0, 8).map(c => <td key={c} className="border px-2 py-1">{row[c]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button size="sm" onClick={() => setPreviewConfirmed(true)} data-testid="button-apply-file">Apply File</Button>
        </div>
      )}

      {/* 2b — Column Mapping */}
      {previewConfirmed && (
        <div className="space-y-3 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">2b — Column Mapping</h3>
            {allMapped && (
              <Badge className="bg-green-100 text-green-700 border-green-300">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Columns auto-detected
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SYSTEM_FIELDS.map(field => (
              <div key={field.key} className="flex items-center gap-2">
                <span className="text-xs font-medium w-32 flex-shrink-0">{field.label}</span>
                <Select
                  value={localMapping[field.key] ?? ''}
                  onValueChange={v => setLocalMapping(prev => ({ ...prev, [field.key]: v }))}
                >
                  <SelectTrigger className="flex-1 h-8 text-xs" data-testid={`select-mapping-${field.key}`}>
                    <SelectValue placeholder="Not mapped" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— Not mapped —</SelectItem>
                    {(wizardState.fileColumns ?? []).map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {localMapping[field.key] ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Checkbox id="remember-mapping" checked={rememberMapping} onCheckedChange={v => setRememberMapping(!!v)} />
            <label htmlFor="remember-mapping" className="text-xs text-muted-foreground">Remember this mapping for next upload</label>
          </div>
          {!allMapped && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Map all required columns before running the match
            </p>
          )}
          <Button
            size="sm"
            onClick={runMatch}
            disabled={!allMapped || running}
            data-testid="button-run-match"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            {running ? 'Running match…' : 'Run Matching'}
          </Button>
        </div>
      )}

      {/* Match Summary */}
      {matchResults.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 rounded-lg p-3 text-center">
              <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-green-700">{autoCount + actionedCount}</p>
              <p className="text-xs text-green-600">Auto-confirmed</p>
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
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 rounded-lg p-3 text-center">
              <AlertCircle className="h-5 w-5 text-slate-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-slate-700">{candidates.length - autoCount}</p>
              <p className="text-xs text-slate-500">Not in clean data</p>
            </div>
          </div>

          {/* Review Table */}
          {(needsReview.length > 0 || unmatchedRows.length > 0) && (
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
                <span className="text-sm font-medium">Rows Needing Action ({needsReview.length + unmatchedRows.length})</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={markAllUnmatched} className="text-xs h-7" data-testid="button-mark-all-unmatched">
                    Mark All as Unmatched
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowReviewTable(p => !p)} className="h-7">
                    {showReviewTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {showReviewTable && (
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
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
                      {[...needsReview, ...unmatchedRows].map(r => (
                        <tr key={r.rowIndex} className="border-t hover:bg-muted/20">
                          <td className="px-3 py-2">
                            <div className="font-medium">{r.wfpRow[localMapping.siteName] ?? '—'}</div>
                            <div className="text-muted-foreground">{r.wfpRow[localMapping.state]} / {r.wfpRow[localMapping.locality]}</div>
                          </td>
                          <td className="px-3 py-2">
                            {r.matchedSiteName
                              ? <span className="text-blue-600">{r.matchedSiteName}</span>
                              : <span className="text-muted-foreground italic">No match found</span>}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={`text-xs ${r.matchScore >= 85 ? 'text-green-600' : r.matchScore >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
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
                                  <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => handleAction(r.rowIndex, 'confirm')} data-testid={`button-confirm-${r.rowIndex}`}>Confirm</Button>
                                  <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => handleAction(r.rowIndex, 'extra')} data-testid={`button-extra-${r.rowIndex}`}>Extra</Button>
                                  <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-red-600 border-red-200" onClick={() => handleAction(r.rowIndex, 'reject')} data-testid={`button-reject-${r.rowIndex}`}>Reject</Button>
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
                                        <div key={c.siteId} className="px-2 py-1 hover:bg-muted cursor-pointer text-xs" onClick={() => handleManualLink(r.rowIndex, c)}>
                                          <span className="font-medium">{c.siteName}</span>
                                          <span className="text-muted-foreground ml-1">{c.state}/{c.locality}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
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
                {reviewCount} row{reviewCount !== 1 ? 's' : ''} still need{reviewCount === 1 ? 's' : ''} review. Confirm, link to a site, or reject each row before advancing.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-2">
          {canGoBack && <Button variant="outline" size="sm" onClick={onBack} data-testid="button-back-step2">← Back</Button>}
          {matchResults.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportMatchingReport} data-testid="button-export-matching">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export Matching Report
            </Button>
          )}
        </div>
        <Button onClick={onNext} disabled={!canAdvance} data-testid="button-next-step2">
          Next: Resolve Unmatched →
        </Button>
      </div>
    </div>
  );
}
