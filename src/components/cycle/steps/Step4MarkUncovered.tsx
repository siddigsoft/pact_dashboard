
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, AlertTriangle, AlertCircle, CheckCircle2, Loader2, Download, ChevronDown, ChevronRight, Search, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { WizardState, UncoveredReason } from '../CycleCloseWizard';
import * as XLSX from 'xlsx';
import { exportNotInWfpReport, type NotInWfpSite } from '@/utils/notInWfpReportExport';

const NOT_COVERED_REASONS = [
  { value: 'not_distributed', label: 'Not Distributed' },
  { value: 'cp_not_confirmed', label: 'CP Not Confirmed / Switched Off' },
  { value: 'security_concerns', label: '🔴 Security Concerns', flagged: true },
  { value: 'access_denied', label: '🔴 Access Denied', flagged: true },
  { value: 'staff_unavailable', label: 'Staff Unavailable' },
  { value: 'weather', label: 'Weather / Natural Disaster' },
  { value: 'budget_constraints', label: 'Budget Constraints' },
  { value: 'time_constraints', label: 'Time Constraints' },
  { value: 'duplicate_site', label: 'Duplicate Site' },
  { value: 'wfp_rejected', label: 'WFP Rejected' },
  { value: 'other', label: 'Other (specify below)' },
];

interface UncoveredSite {
  id: string;
  site_name: string;
  state: string;
  locality: string;
  hub_office: string;
  enumerator_name: string;
  source: 'not_covered' | 'rejected_match' | 'manual' | 'not_in_wfp';
}

interface CoverageRow {
  label: string;         // state or hub name
  total: number;
  confirmed: number;
  notCovered: number;
}

interface SiteDetail {
  id: string;
  site_code: string;
  site_name: string;
  state: string;
  locality: string;
  hub_office: string;
  /** Status stored in mmp_site_entries.status (Dispatched, Accepted, etc.) */
  system_status: string;
  /** Was a WFP row matched (or attempted) against this MMP site? */
  wfp_in_file: boolean;
  /** The primary-pair WFP column value for the matched row, if any */
  wfp_row_primary: string | null;
  match_score: number | null;
  match_level: string | null;
  /** Derived readable matching status */
  matching_status: 'Auto-Confirmed' | 'Confirmed' | 'Extra' | 'Needs Review' | 'Rejected' | 'Not in WFP File' | 'Unmatched WFP Row';
  action_taken: string | null;
  not_covered_reason: string | null;
  coverage: 'Covered' | 'Not Covered' | 'Pending';
}

interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  canAdvance: boolean;
  canGoBack: boolean;
}

export default function Step4MarkUncovered({ wizardState, updateWizardState, onNext, onBack, canAdvance, canGoBack }: Props) {
  const [sites, setSites] = useState<UncoveredSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [coverageRows, setCoverageRows] = useState<CoverageRow[]>([]);
  const [coverageExpanded, setCoverageExpanded] = useState(false);
  const [stateFilter, setStateFilter] = useState<string>('');
  const [siteDetails, setSiteDetails] = useState<SiteDetail[]>([]);
  const [siteDetailsLoading, setSiteDetailsLoading] = useState(false);
  const [showSiteStatus, setShowSiteStatus] = useState(false);
  const [siteSearch, setSiteSearch] = useState('');
  const [sortCol, setSortCol] = useState<keyof SiteDetail>('state');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    if (wizardState.selectedMmpId) {
      loadUncoveredSites();
      loadCoverageBreakdown();
      loadSiteStatusDetails();
    }
  }, [wizardState.selectedMmpId, wizardState.resolvedSites, wizardState.unmatchedMmpSiteIds, wizardState.matchResults]);

  const loadUncoveredSites = async () => {
    setLoading(true);

    // Sites marked as not_covered in Step 3
    const step3NotCovered = Object.entries(wizardState.resolvedSites)
      .filter(([, v]) => v === 'not_covered')
      .map(([k]) => k);

    // Sites rejected in matching (Step 2)
    const rejectedMatchIds = wizardState.matchResults
      .filter(r => r.action === 'reject')
      .map(r => r.matchedSiteId)
      .filter(Boolean) as string[];

    // MMP sites that had NO corresponding WFP row at all ("Not in clean data")
    const notInWfpIds = wizardState.unmatchedMmpSiteIds ?? [];

    const allIds = [...new Set([...step3NotCovered, ...rejectedMatchIds, ...notInWfpIds])];

    if (allIds.length === 0) {
      // Fall back: check DB for any already-marked not_covered sites
      // NOTE: accepted_by has no FK to profiles — do NOT use a join here
      const { data } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, state, locality, hub_office, accepted_by, status')
        .eq('mmp_file_id', wizardState.selectedMmpId!)
        .eq('status', 'not_covered');
      setSites((data ?? []).map((s: any) => ({
        id: s.id,
        site_name: s.site_name,
        state: s.state ?? '',
        locality: s.locality ?? '',
        hub_office: s.hub_office ?? '',
        enumerator_name: '—',
        source: 'manual' as const,
      })));
      setLoading(false);
      return;
    }

    // NOTE: accepted_by has no FK to profiles — query plain columns only,
    // then do a separate lookup for any enumerator names we need.
    const { data, error } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, state, locality, hub_office, accepted_by')
      .in('id', allIds);

    if (error) {
      console.error('loadUncoveredSites error:', error);
      setLoading(false);
      return;
    }

    const notInWfpSet = new Set(notInWfpIds);
    const step3Set    = new Set(step3NotCovered);

    setSites((data ?? []).map((s: any) => ({
      id: s.id,
      site_name: s.site_name,
      state: s.state ?? '',
      locality: s.locality ?? '',
      hub_office: s.hub_office ?? '',
      enumerator_name: s.accepted_by ?? '—',   // accepted_by is text (name/id)
      source: step3Set.has(s.id) ? 'not_covered'
            : notInWfpSet.has(s.id) ? 'not_in_wfp'
            : 'rejected_match',
    })));
    setLoading(false);
  };

  // ── Coverage breakdown by state ───────────────────────────────────────────
  const loadCoverageBreakdown = async () => {
    const { data: allSites } = await supabase
      .from('mmp_site_entries')
      .select('id, state')
      .eq('mmp_file_id', wizardState.selectedMmpId!);

    if (!allSites?.length) return;

    // IDs confirmed in Step 2 matching
    const confirmedIds = new Set(
      wizardState.matchResults
        .filter(r => r.action === 'confirm' || r.action === 'extra' || r.status === 'auto')
        .map(r => r.matchedSiteId)
        .filter(Boolean) as string[]
    );
    const notCoveredIds = new Set([
      ...(wizardState.unmatchedMmpSiteIds ?? []),
      ...Object.entries(wizardState.resolvedSites).filter(([, v]) => v === 'not_covered').map(([k]) => k),
      ...wizardState.matchResults.filter(r => r.action === 'reject').map(r => r.matchedSiteId).filter(Boolean) as string[],
    ]);

    // Group by state
    const byState: Record<string, { total: number; confirmed: number; notCovered: number }> = {};
    for (const s of allSites) {
      const st = s.state ?? 'Unknown';
      if (!byState[st]) byState[st] = { total: 0, confirmed: 0, notCovered: 0 };
      byState[st].total++;
      if (confirmedIds.has(s.id)) byState[st].confirmed++;
      if (notCoveredIds.has(s.id)) byState[st].notCovered++;
    }

    setCoverageRows(
      Object.entries(byState)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([label, v]) => ({ label, ...v }))
    );
  };

  // ── Full per-site status table ────────────────────────────────────────────
  const loadSiteStatusDetails = async () => {
    if (!wizardState.selectedMmpId) return;
    setSiteDetailsLoading(true);

    const { data: allSites } = await supabase
      .from('mmp_site_entries')
      .select('id, site_code, site_name, state, locality, hub_office, status')
      .eq('mmp_file_id', wizardState.selectedMmpId);

    if (!allSites?.length) { setSiteDetailsLoading(false); return; }

    // Build a map: mmpSiteId → first matchResult that claimed it
    const siteToMatch: Record<string, typeof wizardState.matchResults[0]> = {};
    for (const r of wizardState.matchResults) {
      if (r.matchedSiteId && !siteToMatch[r.matchedSiteId]) {
        siteToMatch[r.matchedSiteId] = r;
      }
    }

    const notInWfpSet     = new Set(wizardState.unmatchedMmpSiteIds ?? []);
    const resolvedNotCov  = new Set(
      Object.entries(wizardState.resolvedSites).filter(([, v]) => v === 'not_covered').map(([k]) => k)
    );
    const primaryWfpCol   = wizardState.matchingPairs[0]?.wfpColumn ?? '';

    const details: SiteDetail[] = allSites.map(s => {
      const mr            = siteToMatch[s.id] ?? null;
      const notInWfp      = notInWfpSet.has(s.id);
      const notCovReason  = wizardState.uncoveredReasons[s.id];

      let matching_status: SiteDetail['matching_status'];
      let action_taken: string | null = null;

      if (notInWfp) {
        matching_status = 'Not in WFP File';
      } else if (!mr) {
        matching_status = 'Unmatched WFP Row';
      } else if (mr.status === 'auto') {
        matching_status = 'Auto-Confirmed';
      } else if (mr.status === 'actioned') {
        if (mr.action === 'confirm') { matching_status = 'Confirmed'; action_taken = 'Confirm'; }
        else if (mr.action === 'extra') { matching_status = 'Extra'; action_taken = 'Extra'; }
        else if (mr.action === 'reject') { matching_status = 'Rejected'; action_taken = 'Reject'; }
        else { matching_status = 'Confirmed'; action_taken = mr.action ?? null; }
      } else if (mr.status === 'review') {
        matching_status = 'Needs Review';
      } else {
        matching_status = 'Unmatched WFP Row';
      }

      const covered =
        matching_status === 'Auto-Confirmed' ||
        matching_status === 'Confirmed' ||
        matching_status === 'Extra';
      const notCovered =
        notInWfp ||
        matching_status === 'Rejected' ||
        resolvedNotCov.has(s.id);

      return {
        id:              s.id,
        site_code:       s.site_code ?? '',
        site_name:       s.site_name ?? '',
        state:           s.state ?? '',
        locality:        s.locality ?? '',
        hub_office:      s.hub_office ?? '',
        system_status:   s.status ?? '—',
        wfp_in_file:     !!mr,
        wfp_row_primary: mr ? (mr.wfpRow[primaryWfpCol] ?? null) : null,
        match_score:     mr ? mr.matchScore : null,
        match_level:     mr ? mr.matchLevel : null,
        matching_status,
        action_taken,
        not_covered_reason: notCovReason?.reason ?? null,
        coverage: covered ? 'Covered' : notCovered ? 'Not Covered' : 'Pending',
      };
    });

    setSiteDetails(details);
    setSiteDetailsLoading(false);
  };

  const setReason = (siteId: string, patch: Partial<UncoveredReason>) => {
    const current = wizardState.uncoveredReasons[siteId] ?? { reason: '', note: '', flagged: false };
    const reasonMeta = NOT_COVERED_REASONS.find(r => r.value === (patch.reason ?? current.reason));
    updateWizardState({
      uncoveredReasons: {
        ...wizardState.uncoveredReasons,
        [siteId]: { ...current, ...patch, flagged: !!reasonMeta?.flagged },
      },
    });
  };

  const applyBulk = () => {
    if (!bulkReason || selected.size === 0) return;
    const reasonMeta = NOT_COVERED_REASONS.find(r => r.value === bulkReason);
    const patch: Record<string, UncoveredReason> = {};
    selected.forEach(id => {
      patch[id] = { reason: bulkReason, note: bulkNote, flagged: !!reasonMeta?.flagged };
    });
    updateWizardState({ uncoveredReasons: { ...wizardState.uncoveredReasons, ...patch } });
    setSelected(new Set());
    setBulkReason('');
    setBulkNote('');
  };

  const saveAndNext = async () => {
    setSaving(true);
    for (const [siteId, reasonData] of Object.entries(wizardState.uncoveredReasons)) {
      await supabase.from('mmp_site_entries').update({
        status: 'not_covered',
        not_covered_reason: reasonData.reason,
        not_covered_note: reasonData.note,
        needs_followup: reasonData.flagged,
      }).eq('id', siteId);
    }
    setSaving(false);
    onNext();
  };

  const exportNotCoveredReport = () => {
    const sourceLabel = (src: UncoveredSite['source']) =>
      src === 'not_in_wfp'      ? 'Not in WFP File'
      : src === 'rejected_match' ? 'WFP Rejected'
      : src === 'not_covered'    ? 'Unresolved (Step 3)'
      : 'DB: Not Covered';

    // Sheet 1 — individual uncovered sites
    const siteRows = sites.map(s => {
      const r = wizardState.uncoveredReasons[s.id];
      return {
        'Site Name':           s.site_name,
        State:                 s.state,
        Locality:              s.locality,
        'Hub / Office':        s.hub_office,
        'Enumerator / Accepted By': s.enumerator_name,
        Source:                sourceLabel(s.source),
        Reason:                r?.reason ?? 'Not assigned',
        Notes:                 r?.note ?? '',
        'Flagged for Follow-Up': r?.flagged ? 'Yes' : 'No',
      };
    });
    const wsSites = XLSX.utils.json_to_sheet(siteRows);

    // Sheet 2 — coverage breakdown by state (mirrors the on-screen table)
    const coverageSummaryRows = [
      ...coverageRows.map(row => {
        const pct = row.total ? Math.round((row.confirmed / row.total) * 100) : 0;
        return {
          State:         row.label,
          'Total Sites': row.total,
          'Confirmed':   row.confirmed,
          'Not Covered': row.notCovered,
          'Coverage %':  `${pct}%`,
        };
      }),
      // Totals row
      (() => {
        const total = coverageRows.reduce((s, r) => s + r.total, 0);
        const conf  = coverageRows.reduce((s, r) => s + r.confirmed, 0);
        const nc    = coverageRows.reduce((s, r) => s + r.notCovered, 0);
        const pct   = total ? Math.round((conf / total) * 100) : 0;
        return {
          State:         'TOTAL',
          'Total Sites': total,
          'Confirmed':   conf,
          'Not Covered': nc,
          'Coverage %':  `${pct}%`,
        };
      })(),
    ];
    const wsCoverage = XLSX.utils.json_to_sheet(coverageSummaryRows);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSites,    'Uncovered Sites');
    XLSX.utils.book_append_sheet(wb, wsCoverage, 'Coverage by State');
    XLSX.writeFile(wb, 'not-covered-sites-report.xlsx');
  };

  if (loading) {
    return <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading sites…</div>;
  }

  const allAssigned = sites.every(s => !!wizardState.uncoveredReasons[s.id]?.reason);
  const flaggedCount = Object.values(wizardState.uncoveredReasons).filter(r => r.flagged).length;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Step 4 — Mark Uncovered Sites</h2>
        <p className="text-sm text-muted-foreground mt-0.5" dir="rtl">الخطوة ٤ — تحديد المواقع غير المغطاة وأسباب عدم تغطيتها</p>
        <p className="text-muted-foreground text-sm">Assign a reason for every site that was not visited or not confirmed. All sites must have a reason before closing.</p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <p className="font-medium">What this step does</p>
          <p>Sites with Security Concerns or Access Denied are automatically flagged with a red badge and generate a follow-up action item for the next cycle. You can select multiple sites and assign the same reason in bulk.</p>
        </div>
      </div>

      {/* ── Coverage breakdown by state ── */}
      {coverageRows.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setCoverageExpanded(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-900 text-sm font-medium hover:bg-slate-100 transition-colors"
          >
            <span className="flex items-center gap-2">
              📊 Coverage Breakdown by State
              <span className="text-xs font-normal text-muted-foreground" dir="rtl">نسبة التغطية حسب الولاية</span>
            </span>
            {coverageExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {coverageExpanded && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 text-left">State / الولاية</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2 text-right">✓ Confirmed</th>
                    <th className="px-4 py-2 text-right">✗ Not Covered</th>
                    <th className="px-4 py-2 text-right">Coverage %</th>
                  </tr>
                </thead>
                <tbody>
                  {coverageRows.map((row, i) => {
                    const pct = row.total ? Math.round((row.confirmed / row.total) * 100) : 0;
                    return (
                      <tr key={row.label} className={`border-t ${i % 2 === 0 ? '' : 'bg-slate-50 dark:bg-slate-900/40'}`}>
                        <td className="px-4 py-2 font-medium">
                          <button
                            type="button"
                            className="text-blue-600 hover:underline"
                            onClick={() => setStateFilter(stateFilter === row.label ? '' : row.label)}
                          >
                            {row.label}
                          </button>
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{row.total}</td>
                        <td className="px-4 py-2 text-right text-green-700 font-medium">{row.confirmed}</td>
                        <td className="px-4 py-2 text-right text-red-600 font-medium">{row.notCovered}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-semibold ${pct >= 90 ? 'text-green-700' : pct >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                            {pct}%
                          </span>
                          <div className="w-20 h-1.5 bg-slate-200 rounded-full mt-1 ml-auto">
                            <div
                              className={`h-1.5 rounded-full ${pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  <tr className="border-t-2 border-slate-300 bg-slate-100 dark:bg-slate-800 font-semibold">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right">{coverageRows.reduce((s, r) => s + r.total, 0)}</td>
                    <td className="px-4 py-2 text-right text-green-700">{coverageRows.reduce((s, r) => s + r.confirmed, 0)}</td>
                    <td className="px-4 py-2 text-right text-red-600">{coverageRows.reduce((s, r) => s + r.notCovered, 0)}</td>
                    <td className="px-4 py-2 text-right">
                      {(() => {
                        const total = coverageRows.reduce((s, r) => s + r.total, 0);
                        const conf  = coverageRows.reduce((s, r) => s + r.confirmed, 0);
                        const pct   = total ? Math.round((conf / total) * 100) : 0;
                        return <span className={pct >= 90 ? 'text-green-700' : pct >= 70 ? 'text-amber-600' : 'text-red-600'}>{pct}%</span>;
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Full Site Status Table ─────────────────────────────────────────── */}
      {siteDetails.length > 0 && (() => {
        const toggleSort = (col: keyof SiteDetail) => {
          if (sortCol === col) setSortAsc(a => !a);
          else { setSortCol(col); setSortAsc(true); }
        };

        const matchingStatusColor = (s: SiteDetail['matching_status']) => {
          if (s === 'Auto-Confirmed' || s === 'Confirmed') return 'bg-green-100 text-green-700 border-green-300';
          if (s === 'Extra')          return 'bg-teal-100 text-teal-700 border-teal-300';
          if (s === 'Needs Review')   return 'bg-amber-100 text-amber-700 border-amber-300';
          if (s === 'Rejected')       return 'bg-red-100 text-red-700 border-red-300';
          if (s === 'Not in WFP File')return 'bg-slate-100 text-slate-600 border-slate-300';
          return 'bg-orange-100 text-orange-700 border-orange-300';
        };
        const coverageColor = (c: SiteDetail['coverage']) =>
          c === 'Covered'     ? 'bg-green-100 text-green-700 border-green-300' :
          c === 'Not Covered' ? 'bg-red-100 text-red-700 border-red-300'       :
                                'bg-amber-100 text-amber-700 border-amber-300';

        const searchLow = siteSearch.toLowerCase();
        const filtered = siteDetails
          .filter(s =>
            (!stateFilter || s.state === stateFilter) &&
            (!searchLow ||
              s.site_name.toLowerCase().includes(searchLow) ||
              s.locality.toLowerCase().includes(searchLow) ||
              s.hub_office.toLowerCase().includes(searchLow) ||
              s.site_code.toLowerCase().includes(searchLow))
          )
          .sort((a, b) => {
            const av = String(a[sortCol] ?? '');
            const bv = String(b[sortCol] ?? '');
            return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
          });

        const exportSiteStatus = () => {
          const rows = filtered.map(s => ({
            'Site Code':        s.site_code,
            'Site Name':        s.site_name,
            State:              s.state,
            Locality:           s.locality,
            'Hub / Office':     s.hub_office,
            'System Status':    s.system_status,
            'In WFP File':      s.wfp_in_file ? 'Yes' : 'No',
            'WFP Row (Primary)':s.wfp_row_primary ?? '—',
            'Match Score':      s.match_score != null ? `${s.match_score}%` : '—',
            'Match Level':      s.match_level ?? '—',
            'Matching Status':  s.matching_status,
            'Action Taken':     s.action_taken ?? '—',
            'Coverage':         s.coverage,
            'Not-Covered Reason': s.not_covered_reason ?? '—',
          }));
          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Site Status');
          XLSX.writeFile(wb, 'site-status-full.xlsx');
        };

        const SortTh = ({ col, label }: { col: keyof SiteDetail; label: string }) => (
          <th
            className="px-3 py-2 text-left font-medium whitespace-nowrap cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 select-none"
            onClick={() => toggleSort(col)}
          >
            <span className="flex items-center gap-1">
              {label}
              <ArrowUpDown className={`h-3 w-3 ${sortCol === col ? 'text-primary' : 'text-muted-foreground/40'}`} />
            </span>
          </th>
        );

        return (
          <div className="border rounded-lg overflow-hidden">
            {/* Header */}
            <button
              type="button"
              onClick={() => setShowSiteStatus(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-900 text-sm font-medium hover:bg-slate-100 transition-colors"
            >
              <span className="flex items-center gap-2">
                🗂 Full Site Status Table
                <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-xs">{siteDetails.length} sites</Badge>
                <span className="text-xs font-normal text-muted-foreground">WFP · System · Matching · Action</span>
              </span>
              {showSiteStatus ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>

            {showSiteStatus && (
              <>
                {/* Toolbar */}
                <div className="flex items-center gap-2 px-4 py-2 border-b bg-white dark:bg-slate-900 flex-wrap">
                  <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="h-8 pl-8 text-xs"
                      placeholder="Search site name, locality, hub, code…"
                      value={siteSearch}
                      onChange={e => setSiteSearch(e.target.value)}
                    />
                  </div>
                  {stateFilter && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-xs">
                      {stateFilter}
                      <button type="button" className="ml-1.5" onClick={() => setStateFilter('')}>×</button>
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{filtered.length} of {siteDetails.length}</span>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={exportSiteStatus}>
                    <Download className="h-3 w-3 mr-1.5" /> Export All
                  </Button>
                  {(() => {
                    const notInWfpFiltered = filtered.filter(s => s.matching_status === 'Not in WFP File');
                    return notInWfpFiltered.length > 0 ? (
                      <Button
                        type="button" size="sm" variant="outline"
                        className="h-8 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                        onClick={() => exportNotInWfpReport(
                          notInWfpFiltered.map(s => ({
                            site_code:     s.site_code,
                            site_name:     s.site_name,
                            state:         s.state,
                            locality:      s.locality,
                            hub_office:    s.hub_office,
                            system_status: s.system_status,
                          } satisfies NotInWfpSite)),
                          wizardState.selectedMmp?.name ?? 'Cycle'
                        )}
                      >
                        <Download className="h-3 w-3 mr-1.5" />
                        Not-in-WFP Report ({notInWfpFiltered.length})
                      </Button>
                    ) : null;
                  })()}
                </div>

                {siteDetailsLoading ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
                        <tr>
                          <SortTh col="site_name"        label="Site Name" />
                          <SortTh col="state"            label="State" />
                          <SortTh col="locality"         label="Locality" />
                          <SortTh col="hub_office"       label="Hub" />
                          <SortTh col="system_status"    label="System Status" />
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap">In WFP File</th>
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap">WFP Row (Primary)</th>
                          <SortTh col="match_score"      label="Score" />
                          <SortTh col="matching_status"  label="Matching Status" />
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Action Taken</th>
                          <SortTh col="coverage"         label="Coverage" />
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap">NC Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((s, i) => (
                          <tr key={s.id} className={`border-t ${i % 2 === 0 ? '' : 'bg-muted/20'} hover:bg-primary/5`}>
                            <td className="px-3 py-1.5 font-medium max-w-[180px] truncate" title={s.site_name}>{s.site_name || '—'}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{s.state || '—'}</td>
                            <td className="px-3 py-1.5 max-w-[120px] truncate" title={s.locality}>{s.locality || '—'}</td>
                            <td className="px-3 py-1.5 max-w-[120px] truncate" title={s.hub_office}>{s.hub_office || '—'}</td>
                            <td className="px-3 py-1.5">
                              <Badge variant="outline" className="text-[10px] capitalize">{s.system_status}</Badge>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {s.wfp_in_file
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mx-auto" />
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-1.5 max-w-[140px] truncate text-muted-foreground" title={s.wfp_row_primary ?? ''}>
                              {s.wfp_row_primary ?? '—'}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {s.match_score != null
                                ? <span className={`font-semibold ${s.match_score >= 80 ? 'text-green-600' : s.match_score >= 55 ? 'text-amber-600' : 'text-red-500'}`}>{s.match_score}%</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-1.5">
                              <Badge variant="outline" className={`text-[10px] ${matchingStatusColor(s.matching_status)}`}>
                                {s.matching_status}
                              </Badge>
                            </td>
                            <td className="px-3 py-1.5">
                              {s.action_taken
                                ? <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">{s.action_taken}</Badge>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-1.5">
                              <Badge variant="outline" className={`text-[10px] ${coverageColor(s.coverage)}`}>
                                {s.coverage}
                              </Badge>
                            </td>
                            <td className="px-3 py-1.5 max-w-[140px] truncate text-muted-foreground" title={s.not_covered_reason ?? ''}>
                              {s.not_covered_reason ?? '—'}
                            </td>
                          </tr>
                        ))}
                        {filtered.length === 0 && (
                          <tr><td colSpan={12} className="px-4 py-8 text-center text-muted-foreground italic">No sites match the current filter</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Legend */}
                <div className="border-t px-4 py-2.5 bg-muted/20 flex flex-wrap gap-3 text-[10px]">
                  <span className="font-semibold text-muted-foreground uppercase tracking-wider">Legend:</span>
                  {(['Auto-Confirmed','Confirmed','Extra','Needs Review','Rejected','Not in WFP File'] as SiteDetail['matching_status'][]).map(s => (
                    <span key={s} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${matchingStatusColor(s)}`}>{s}</span>
                  ))}
                  <span className="text-muted-foreground ml-2">Click a state in Coverage Breakdown to filter · Click column header to sort</span>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* State filter chip */}
      {stateFilter && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered by state:</span>
          <Badge className="bg-blue-100 text-blue-700 border-blue-300">
            {stateFilter}
            <button type="button" className="ml-1.5 hover:text-blue-900" onClick={() => setStateFilter('')}>×</button>
          </Badge>
        </div>
      )}

      {sites.length === 0 ? (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <p className="text-sm text-green-800 font-medium">No uncovered sites to assign reasons to. Ready to continue.</p>
        </div>
      ) : (
        <>
          {flaggedCount > 0 && (
            <Alert className="bg-red-50 border-red-200">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {flaggedCount} site{flaggedCount > 1 ? 's' : ''} flagged with Security/Access issues — follow-up actions will be auto-created for the next cycle.
              </AlertDescription>
            </Alert>
          )}

          {/* Bulk assignment */}
          {selected.size > 0 && (
            <div className="border border-blue-200 bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">{selected.size} site{selected.size > 1 ? 's' : ''} selected — bulk assign reason:</p>
              <div className="flex gap-2 flex-wrap">
                <Select value={bulkReason} onValueChange={setBulkReason}>
                  <SelectTrigger className="w-64 h-8 text-sm" data-testid="select-bulk-reason">
                    <SelectValue placeholder="Select reason…" />
                  </SelectTrigger>
                  <SelectContent>
                    {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Optional note…"
                  value={bulkNote}
                  onChange={e => setBulkNote(e.target.value)}
                  className="h-8 min-h-[2rem] text-sm resize-none"
                  rows={1}
                />
                <Button type="button" size="sm" onClick={applyBulk} disabled={!bulkReason} data-testid="button-apply-bulk">
                  Apply to {selected.size} sites
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {sites.filter(s => !stateFilter || s.state === stateFilter).map(site => {
              const assigned = wizardState.uncoveredReasons[site.id];
              const isSelected = selected.has(site.id);
              const isFlagged = assigned?.flagged;
              const sourceLabel =
                site.source === 'rejected_match' ? 'WFP Rejected'
                : site.source === 'not_in_wfp'   ? 'Not in WFP File'
                : site.source === 'not_covered'   ? 'Unresolved (Step 3)'
                : 'DB: Not Covered';
              const sourceBadgeClass =
                site.source === 'rejected_match' ? 'border-orange-300 text-orange-700'
                : site.source === 'not_in_wfp'   ? 'border-slate-400 text-slate-600'
                : 'border-purple-300 text-purple-700';
              return (
                <div key={site.id} className={`border rounded-lg p-4 space-y-3 ${isFlagged ? 'border-red-300 bg-red-50/30' : ''}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={v => setSelected(prev => {
                        const n = new Set(prev);
                        v ? n.add(site.id) : n.delete(site.id);
                        return n;
                      })}
                      data-testid={`checkbox-site-${site.id}`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{site.site_name}</p>
                        {isFlagged && <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">⚠️ Follow-up Required</Badge>}
                        <Badge variant="outline" className={`text-xs ${sourceBadgeClass}`}>{sourceLabel}</Badge>
                        {site.hub_office && <span className="text-xs text-muted-foreground">{site.hub_office}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{site.state} / {site.locality} — {site.enumerator_name}</p>
                    </div>
                    {assigned?.reason && <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />}
                  </div>
                  <div className="flex gap-2 pl-8 flex-wrap">
                    <Select
                      value={assigned?.reason ?? ''}
                      onValueChange={v => setReason(site.id, { reason: v })}
                    >
                      <SelectTrigger className="w-64 h-8 text-xs" data-testid={`select-reason-${site.id}`}>
                        <SelectValue placeholder="Select reason…" />
                      </SelectTrigger>
                      <SelectContent>
                        {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {assigned?.reason === 'other' && (
                      <Textarea
                        placeholder="Specify reason…"
                        value={assigned?.note ?? ''}
                        onChange={e => setReason(site.id, { note: e.target.value })}
                        className="flex-1 min-h-[2rem] text-xs"
                        rows={1}
                        data-testid={`input-reason-note-${site.id}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!allAssigned && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>All uncovered sites must have a reason assigned before advancing to the next step.</AlertDescription>
            </Alert>
          )}
        </>
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-2">
          {canGoBack && <Button type="button" variant="outline" size="sm" onClick={onBack} data-testid="button-back-step4">← Back</Button>}
          <Button type="button" variant="outline" size="sm" onClick={exportNotCoveredReport} disabled={sites.length === 0} data-testid="button-export-not-covered">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export Not-Covered Report
          </Button>
        </div>
        <Button type="button" onClick={saveAndNext} disabled={!allAssigned || saving} data-testid="button-next-step4">
          {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Next: Resolve Exceptions →
        </Button>
      </div>
    </div>
  );
}
